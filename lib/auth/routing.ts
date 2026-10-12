// Edge-kompatible Routing-Entscheidungslogik für Middleware.
// Keine DB-Abhängigkeit, rein deterministisch und testbar.

export interface RouteAccessCheckInput {
  pathname: string;
  isLoggedIn: boolean;
}

export interface RouteAccessCheckResult {
  allowed: boolean;
  redirectTo?: string;
}

export function isPublicAuthRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/auth/login") ||
    pathname.startsWith("/auth/setup") ||
    pathname.startsWith("/auth/reset") ||
    pathname.startsWith("/auth/reset-confirm")
  );
}

export function isPublicApiRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/api/v1/auth/login") ||
    pathname.startsWith("/api/v1/auth/setup") ||
    pathname.startsWith("/api/v1/auth/reset-request") ||
    pathname.startsWith("/api/v1/auth/reset-confirm")
  );
}

export function checkRouteAccess({
  pathname,
  isLoggedIn,
}: RouteAccessCheckInput): RouteAccessCheckResult {
  // Öffentliche Auth-Seiten und öffentliche Auth-APIs sind in der Middleware IMMER erlaubt.
  // Wichtig: Edge-Middleware darf Requests von /auth/* NICHT nach "/" umleiten,
  // da im Edge-Kontext der DB-Zustand (Nutzer existiert, ist aktiv, Tenant gültig)
  // nicht geprüft werden kann.
  // Das Weiterleiten bereits eingeloggter, gültiger Nutzer geschieht server-seitig
  // in der LoginPage nach DB-Revalidierung.
  if (isPublicAuthRoute(pathname) || isPublicApiRoute(pathname)) {
    return { allowed: true };
  }

  // Geschützte Routen erfordern ein vorhandenes Session-Token.
  // Die tiefe DB-Revalidierung findet in den Server-Layouts via getSessionUser() statt.
  if (isLoggedIn) {
    return { allowed: true };
  }

  return { allowed: false, redirectTo: "/auth/login" };
}
