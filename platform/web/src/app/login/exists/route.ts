import { NextRequest, NextResponse } from "next/server";
import { accountExists } from "@/lib/identity";

export const dynamic = "force-dynamic";

// "Este e-mail já tem conta?" — usado pelo login em 2 passos para decidir
// entre a tela de ENTRAR e a de REGISTRAR. Rate-limit por IP (janela
// deslizante) para não virar um oráculo de enumeração de e-mails.
const WINDOW_MS = 60_000;
const MAX_HITS = 20;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_HITS) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(ip)) return NextResponse.json({ exists: null }, { status: 429 });

  let email = "";
  try {
    email = String((await req.json()).email || "").trim().toLowerCase();
  } catch {
    /* corpo inválido → email vazio */
  }
  if (!email) return NextResponse.json({ exists: null });

  const exists = await accountExists(email);
  return NextResponse.json({ exists });
}
