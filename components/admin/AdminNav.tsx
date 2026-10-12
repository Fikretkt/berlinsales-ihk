"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, Users, Clock, ArrowLeft, Upload, BarChart3, Inbox, ScrollText, LayoutDashboard } from "lucide-react";

const ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/markets", label: "Kunden", icon: Store },
  { href: "/admin/import", label: "Kunden importieren", icon: Upload },
  { href: "/admin/users", label: "Benutzer", icon: Users },
  { href: "/admin/cooldowns", label: "Cooldowns", icon: Clock },
  { href: "/admin/reports", label: "Reporting", icon: BarChart3 },
  { href: "/admin/conflicts", label: "Konflikte", icon: Inbox },
  { href: "/admin/audit", label: "Audit-Log", icon: ScrollText },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-gray-200 bg-white sm:w-56 sm:border-b-0 sm:border-r">
      <div className="flex flex-wrap gap-1 p-2 sm:flex-col sm:gap-0">
        <Link href="/" className="flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100">
          <ArrowLeft className="h-4 w-4" /> Zurück zur Kundenkarte
        </Link>
        <div className="my-2 hidden h-px bg-gray-200 sm:block" />
        {ITEMS.map((item) => {
          const exact = "exact" in item && item.exact;
          const active = exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}
              className={"flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium " + (active ? "bg-blue-50 text-blue-800" : "text-gray-700 hover:bg-gray-100")}>
              <Icon className="h-4 w-4" /> {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
