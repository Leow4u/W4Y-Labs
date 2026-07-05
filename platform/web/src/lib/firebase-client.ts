"use client";

// Identity Platform (Firebase Auth) — lado do navegador.
// A apiKey é pública por design (identifica o projeto, não autentica nada);
// a segurança vem dos domínios autorizados + verificação do ID token no
// servidor (src/app/login/verify/route.ts).
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const config = {
  apiKey: "AIzaSyDO8mVRm3X1xGZmSmwnBC39fGXcMCB8jcw",
  authDomain: "project-67a4bd4d-a990-406b-9e7.firebaseapp.com",
  projectId: "project-67a4bd4d-a990-406b-9e7",
};

export function firebaseAuth() {
  const app = getApps()[0] ?? initializeApp(config);
  return getAuth(app);
}
