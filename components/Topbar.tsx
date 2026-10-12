"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, MapPin, Settings, HelpCircle, Calendar, Users } from "lucide-react";
import { resetOnboarding } from "./Onboarding";

export function Topbar({
  userName,
  adminLink,
}: {
  userName: string;
  adminLink?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  async function onLogout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    router.push("/auth/login");
    router.refresh();
  }

  function showTutorial() {
    resetOnboarding();
    router.refresh();
  }

  const isToday = pathname === "/today";
  const isCustomers = pathname === "/" || pathname?.startsWith("/markets");

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-3 sm:px-4">
      {/* Brand & Hauptnavigation */}
      <div className="flex items-center gap-3 sm:gap-5">
        <Link href="/today" className="flex items-center gap-2 shrink-0">
          <MapPin className="h-5 w-5 text-green-600" />
          <span className="text-base font-bold text-gray-900 tracking-tight">ZalsoSales</span>
        </Link>

        {/* Primary Field Navigation */}
        <nav className="flex items-center gap-1">
          <Link
            href="/today"
            className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs sm:text-sm font-semibold transition ${
              isToday
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <Calendar className="h-4 w-4 shrink-0" />
            <span>Heute</span>
          </Link>

          <Link
            href="/"
            className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs sm:text-sm font-semibold transition ${
              isCustomers
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <Users className="h-4 w-4 shrink-0" />
            <span>Kunden</span>
          </Link>
        </nav>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          onClick={showTutorial}
          className="flex min-h-9 min-w-9 items-center justify-center rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          aria-label="Tutorial erneut zeigen"
          title="Tutorial erneut zeigen"
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        {adminLink && (
          <Link
            href="/admin/markets"
            className="hidden min-h-9 items-center gap-1 rounded-lg px-2 py-1 text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-100 sm:flex"
          >
            <Settings className="h-4 w-4" />
            Admin
          </Link>
        )}

        <span className="hidden text-xs font-medium text-gray-600 md:inline max-w-[120px] truncate">
          {userName}
        </span>

        <button
          onClick={onLogout}
          className="flex min-h-9 min-w-9 items-center justify-center rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          aria-label="Abmelden"
          title="Abmelden"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
