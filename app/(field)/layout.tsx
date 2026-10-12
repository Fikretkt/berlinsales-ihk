import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Topbar } from "@/components/Topbar";
import { SseListener } from "@/components/SseListener";
import { OnboardingAutoTrigger } from "@/components/Onboarding";
import { PwaRegister } from "@/components/PwaRegister";
import { OfflineManager } from "@/components/OfflineManager";

export default async function FieldLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <Topbar userName={user.name} adminLink={user.role === "admin"} />
      <PwaRegister />
      <SseListener />
      <OfflineManager />
      <OnboardingAutoTrigger />
      {children}
    </div>
  );
}
