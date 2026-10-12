import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/today");
  }

  return <LoginForm />;
}
