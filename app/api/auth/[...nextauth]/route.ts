// Auth.js v5 Standard-Handler. Mountet GET + POST für /api/auth/*
// (signin, signout, callback, csrf, session, ...).
// Unsere eigenen /api/v1/auth/* Routen liegen separat und nutzen signIn/signOut.

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
