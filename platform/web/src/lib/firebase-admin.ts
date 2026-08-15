import "server-only";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const PROJECT = "project-67a4bd4d-a990-406b-9e7";

export function adminAuth() {
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId: PROJECT,
    });
  }
  return getAuth();
}

export const FIREBASE_PROJECT_ID = PROJECT;