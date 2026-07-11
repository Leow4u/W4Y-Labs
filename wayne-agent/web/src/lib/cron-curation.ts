/**
 * Curadoria das rotinas (Agenda) — separa jobs INTERNOS do sistema do que o
 * usuário criou, na mesma linha da curadoria dos Arquivos.
 *
 * Diferente dos Arquivos (60 pastas de sistema), o cron NÃO tem um flag rígido
 * `system` no modelo. O "interno" aqui é, na prática:
 *   1. os campos técnicos do form (provider/model/script/no_agent/toolsets) —
 *      já escondidos no ?full=1 (CronPage);
 *   2. jobs eventualmente criados pela PLATAFORMA (ex.: avisos de billing,
 *      manutenção), que convencionamos marcar por prefixo reservado no nome.
 *
 * Heurística CONSERVADORA: só trata como sistema o que casa um prefixo
 * reservado — nunca esconde um job de usuário por engano. Confirmado ao vivo
 * (se aparecerem jobs de plataforma com outro padrão, é só somar aqui). Na
 * visão ?full=1 (nós/suporte) tudo aparece.
 */
import type { CronJob } from "@/lib/api";

// Prefixos de nome reservados a jobs geridos pela plataforma.
const SYSTEM_NAME_PREFIXES = ["__", "wayne:", "sys:", "system:", "internal:"];

export function isSystemJob(job: CronJob): boolean {
  const name = (job.name ?? "").trim().toLowerCase();
  if (!name) return false;
  return SYSTEM_NAME_PREFIXES.some((p) => name.startsWith(p));
}

/** Separa a lista em rotinas do usuário e jobs de sistema. */
export function partitionJobs(jobs: CronJob[]): { user: CronJob[]; system: CronJob[] } {
  const user: CronJob[] = [];
  const system: CronJob[] = [];
  for (const job of jobs) (isSystemJob(job) ? system : user).push(job);
  return { user, system };
}
