import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Topbar } from "@/components/Topbar";
import { AdminNav } from "@/components/admin/AdminNav";
import { SseListener } from "@/components/SseListener";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login");
  if (user.role !== "admin") redirect("/");

  return (
    <div className="min-h-screen bg-gray-50">
      <SseListener />
      <Topbar userName={user.name} />
      <div className="flex flex-col sm:flex-row">
        <AdminNav />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
