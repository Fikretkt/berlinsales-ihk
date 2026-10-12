import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordSetForm } from "@/components/auth/PasswordSetForm";

export default function SetupPage() {
  return (
    <AuthShell
      title="Willkommen!"
      subtitle="Bitte vergib ein Passwort, um deinen Zugang zu aktivieren."
    >
      <Suspense fallback={<p className="text-sm text-gray-500">Lädt …</p>}>
        <PasswordSetForm
          apiPath="/api/v1/auth/setup"
          ctaLabel="Passwort setzen und starten"
          successLabel="Aktivieren"
          validateOnLoad="/api/v1/auth/setup"
        />
      </Suspense>
    </AuthShell>
  );
}
