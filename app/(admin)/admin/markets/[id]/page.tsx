import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { z } from "zod";
import { getMarketDetail } from "@/lib/markets/repo";
import { getSessionUser } from "@/lib/auth/session";
import { MarketForm } from "@/components/admin/MarketForm";

export default async function AdminMarketEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const user = await getSessionUser();
  if (!user) redirect("/auth/login");
  if (user.role !== "admin") redirect("/");
  const result = await getMarketDetail(user.companyId, id);
  if (result.kind === "not_found") notFound();
  if (result.kind === "merged") redirect(`/admin/markets/${result.mergedIntoId}`);

  const m = result.market;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/admin/markets"
          className="inline-flex min-h-10 items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Zurück zur Liste
        </Link>
        <Link
          href={`/markets/${m.id}`}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-gray-300 px-3 text-sm hover:bg-gray-50"
        >
          <Eye className="h-4 w-4" /> Field-Ansicht
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold">{m.name}</h1>
        <p className="text-sm text-gray-500">{m.chain?.name ?? "Ohne Kette"}{m.gln ? ` · GLN ${m.gln}` : ""}</p>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <MarketForm
          mode="edit"
          marketId={m.id}
          initial={{
            chain_id: m.chain?.id ?? "",
            name: m.name,
            gln: m.gln ?? "",
            street_full: m.streetFull,
            postal_code: m.postalCode ?? "",
            city: m.city ?? "",
            district: m.district,
            lat: m.lat ?? 52.52,
            lng: m.lng ?? 13.405,
            contact_person: m.contactPerson,
            contact_phone: m.contactPhone,
          }}
        />
      </div>
    </div>
  );
}
