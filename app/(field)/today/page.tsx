import { requireUser } from "@/lib/auth/session";
import { getEmployeeTodayDashboard } from "@/lib/dashboard/today";
import { TodayDashboardView } from "@/components/dashboard/TodayDashboardView";

export default async function TodayPage() {
  const user = await requireUser();
  const data = await getEmployeeTodayDashboard(
    user.companyId,
    user.id,
    user.name,
  );

  return <TodayDashboardView data={data} />;
}
