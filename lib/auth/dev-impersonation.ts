import { HttpError } from "@/lib/http/errors";

interface ImpersonationEnvironment {
  NODE_ENV?: string;
  ALLOW_DEV_IMPERSONATION?: string;
}

export function assertDevImpersonationAllowed(
  email: string,
  environment: ImpersonationEnvironment = process.env,
): void {
  if (
    environment.NODE_ENV === "production" ||
    environment.ALLOW_DEV_IMPERSONATION !== "true"
  ) {
    throw new HttpError(
      403,
      "DEV_IMPERSONATION_FORBIDDEN",
      `Development impersonation is forbidden for ${email}`,
    );
  }
}
