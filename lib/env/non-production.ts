export interface RuntimeEnvironment {
  NODE_ENV?: string;
  DEV_ADMIN_PASSWORD?: string;
}

export function assertNonProduction(
  environment: RuntimeEnvironment = process.env,
): void {
  if (environment.NODE_ENV === "production") {
    throw new Error("Development tooling is disabled in production");
  }
}

export function requireDevAdminPassword(
  environment: RuntimeEnvironment = process.env,
): string {
  assertNonProduction(environment);
  const password = environment.DEV_ADMIN_PASSWORD;
  if (!password) {
    throw new Error("DEV_ADMIN_PASSWORD is required for development user scripts");
  }
  return password;
}
