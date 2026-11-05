// Reine HTTP-Error-Klasse — keine Next/Auth-Imports.
// Genau das hier (statt lib/auth/session.ts) wird von der Geschäftslogik importiert,
// damit Unit-/Integration-Tests ohne den ganzen Auth.js-Setup laden können.

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "field_user" | "admin";
  companyId: string;
  bereich: "internal" | "external";
}
