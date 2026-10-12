import { Suspense } from "react";
import { MarketsView } from "@/components/markets/MarketsView";

export default function FieldHomePage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-gray-500">Lade Kundenansicht...</div>}>
      <MarketsView />
    </Suspense>
  );
}
