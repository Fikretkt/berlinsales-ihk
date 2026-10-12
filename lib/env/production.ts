export interface ProductionEnvironment {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  AUTH_SECRET?: string;
  NEXTAUTH_SECRET?: string;
  AUTH_URL?: string;
  NEXTAUTH_URL?: string;
  AUTH_TRUST_HOST?: string;
}

export function productionConfigIssues(
  environment: ProductionEnvironment = process.env,
): string[] {
  if (environment.NODE_ENV !== "production") return [];

  const issues: string[] = [];
  if (!environment.DATABASE_URL?.trim()) issues.push("DATABASE_URL");
  if (!environment.AUTH_SECRET?.trim() && !environment.NEXTAUTH_SECRET?.trim()) {
    issues.push("AUTH_SECRET");
  }
  const hasAppUrl = Boolean(environment.AUTH_URL?.trim() || environment.NEXTAUTH_URL?.trim());
  if (!hasAppUrl && environment.AUTH_TRUST_HOST !== "true") issues.push("AUTH_URL");
  return issues;
}
