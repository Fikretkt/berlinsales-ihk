import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MarketForm } from "@/components/admin/MarketForm";

export default function NewMarketPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href="/admin/markets"
        className="inline-flex min-h-10 items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" /> Zurück zur Liste
      </Link>
      <h1 className="text-xl font-semibold">Neuen Markt anlegen</h1>
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <MarketForm mode="create" />
      </div>
    </div>
  );
}
