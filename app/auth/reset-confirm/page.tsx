import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordSetForm } from "@/components/auth/PasswordSetForm";

export default function ResetConfirmPage() {
  return (
    <AuthShell title="Neues Passwort" subtitle="Bitte vergib ein neues Passwort.">
      <Suspense fallback={<p className="text-sm text-gray-500">Lädt …</p>}>
        <PasswordSetForm
          apiPath="/api/v1/auth/reset-confirm"
          ctaLabel="Passwort neu setzen"
          successLabel="Setzen"
        />
      </Suspense>
    </AuthShell>
  );
}
