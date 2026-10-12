import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Navigation, Phone, AlertOctagon } from "lucide-react";
import { z } from "zod";
import { getMarketDetail } from "@/lib/markets/repo";
import { getSessionUser } from "@/lib/auth/session";
import { StatusBadge } from "@/components/markets/StatusBadge";
import { CustomerIntelligenceCard } from "@/components/markets/CustomerIntelligenceCard";
import { ActionPanel } from "@/components/markets/ActionPanel";
import { NotesPanel } from "@/components/markets/NotesPanel";
import { HistoryPanel } from "@/components/markets/HistoryPanel";
import { InteractionPanel } from "@/components/markets/InteractionPanel";
import { DeleteCustomerButton } from "@/components/markets/DeleteCustomerButton";
import { formatBerlinDate, formatBerlinDateTime } from "@/lib/markets/status-display";
import { calculateExpectedNetRevenue } from "@/lib/sales/revenue";

const ID_SCHEMA = z.string().uuid();

export default async function MarketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!ID_SCHEMA.safeParse(id).success) notFound();

  const user = await getSessionUser();
  if (!user) redirect("/auth/login");

  const result = await getMarketDetail(user.companyId, id);
  if (result.kind === "not_found") notFound();
  if (result.kind === "merged") redirect(`/markets/${result.mergedIntoId}`);

  const m = result.market;

  const isRotOhneCooldown =
    m.computedStatus === "rot" &&
    !m.cooldownUntil &&
    m.lastAction?.type === "manual_override";

  const mapsLink = m.lat != null && m.lng != null
    ? `https://www.openstreetmap.org/?mlat=${m.lat}&mlon=${m.lng}#map=18/${m.lat}/${m.lng}`
    : null;
  const expectedNetRevenue = calculateExpectedNetRevenue(m.expectedVolume, m.probability);

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <Link
        href="/"
        className="inline-flex min-h-10 items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
      </Link>

      <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-gray-900">{m.name}</h1>
            {m.chain && <p className="mt-0.5 text-sm text-gray-500">{m.chain.name}</p>}
          </div>
          <StatusBadge status={m.computedStatus} size="lg" />
        </div>

        {/* Nie wieder kontaktieren Banner */}
        {m.noContact && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-100 p-3 text-sm font-semibold text-red-900 border border-red-300">
            <AlertOctagon className="h-5 w-5 shrink-0 text-red-700" />
            <span>Nie wieder kontaktieren (Kein weiterer Kontakt erwünscht)</span>
          </div>
        )}

        {/* Status-Detail-Text bei Sonderfällen */}
        {m.computedStatus === "rot" && m.cooldownUntil && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            Wieder anfahren ab {formatBerlinDate(m.cooldownUntil)}.
          </p>
        )}
        {isRotOhneCooldown && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            Gesperrt durch Admin am {formatBerlinDate(m.lastAction!.createdAt)} — Grund:{" "}
            {String(m.lastAction!.payload?.reason ?? "ohne Begründung")}
          </p>
        )}
        {m.reservedByUserId && m.reservationValidUntil && (
          <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Reserviert bis {formatBerlinDateTime(m.reservationValidUntil)}.
          </p>
        )}

        <hr className="my-4 border-gray-100" />

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Adresse
            </dt>
            <dd className="mt-1 text-sm text-gray-900">
              {m.streetFull || "Nicht importiert"}
              {(m.postalCode || m.city || m.district) && (
                <>
                  <br />
                  {m.postalCode} {m.city}
                  {m.district && ` — ${m.district}`}
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Markt-Nummer (GLN)
            </dt>
            <dd className="mt-1 font-mono text-sm text-gray-900">{m.gln ?? "—"}</dd>
          </div>

          {m.contactPerson && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Ansprechpartner
              </dt>
              <dd className="mt-1 text-sm text-gray-900">{m.contactPerson}</dd>
            </div>
          )}
          {m.contactPhone && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Telefon
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                <a href={`tel:${m.contactPhone.replace(/\s+/g, "")}`} className="text-green-700 underline">
                  {m.contactPhone}
                </a>
              </dd>
            </div>
          )}
          {m.contactEmail && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                E-Mail
              </dt>
              <dd className="mt-1 text-sm text-gray-900">
                <a href={`mailto:${m.contactEmail}`} className="text-green-700 underline">
                  {m.contactEmail}
                </a>
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {mapsLink && (
            <a
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              <Navigation className="h-4 w-4" /> Route starten
            </a>
          )}
          {m.contactPhone && (
            <a
              href={`tel:${m.contactPhone.replace(/\s+/g, "")}`}
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              <Phone className="h-4 w-4" /> Anrufen
            </a>
          )}
        </div>
      </div>

      <section className="mt-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
        <h2 className="text-base font-semibold text-gray-900">Sales Pipeline</h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <PipelineField label="Phase" value={PIPELINE_STAGE_LABELS[m.salesStage]} />
          <PipelineField label="Erwartetes Volumen" value={formatEuro(m.expectedVolume)} />
          <PipelineField label="Wahrscheinlichkeit" value={m.probability == null ? null : `${m.probability} %`} />
          <PipelineField label="Erwarteter Nettoerlös" value={formatEuro(expectedNetRevenue)} />
          <PipelineField label="Lead Source" value={m.leadSource} />
          <PipelineField label="Kundentyp" value={m.clientType} />
          <PipelineField label="Channel" value={m.channel} />
          <PipelineField label="Erfasst am" value={formatBerlinDate(m.dateEntered)} />
          <PipelineField label="Erwarteter Abschluss" value={formatBerlinDate(m.expectedClose)} />
          <PipelineField label="Letzte Aktivität" value={formatBerlinDate(m.lastActivityAt)} />
          <PipelineField label="Nächste Aktion" value={m.nextAction} />
          <PipelineField label="Importnotizen" value={m.importedNotes} />
        </dl>
      </section>

      {/* Commercial Intelligence & Customer Context Card */}
      <div className="mt-4">
        <CustomerIntelligenceCard
          marketId={m.id}
          currentUserId={user.id}
          isAdmin={user.role === "admin"}
          assignedUser={m.assignedUser}
          currentSolution={m.currentSolution}
          satisfaction={m.satisfaction}
          salesStage={m.salesStage}
          salesValue={m.salesValue}
          noContact={m.noContact}
          nextFollowUp={m.nextFollowUp}
          lastAction={
            m.lastAction
              ? {
                  createdAt: m.lastAction.createdAt,
                  contactType: m.lastAction.contactType,
                  interestLevel: m.lastAction.interestLevel,
                }
              : null
          }
        />
      </div>

      <div className="mt-4">
        <InteractionPanel
          marketId={m.id}
          initialSalesStage={m.salesStage}
          isNoContact={m.noContact}
        />
      </div>

      {/* Aktions-Panel */}
      <div className="mt-4">
        <ActionPanel
          market={{
            id: m.id,
            name: m.name,
            computedStatus: m.computedStatus,
            reservedByUserId: m.reservedByUserId,
          }}
          session={{ userId: user.id, isAdmin: user.role === "admin" }}
        />
      </div>

      {/* Notizen */}
      <div className="mt-4">
        <NotesPanel marketId={m.id} />
      </div>

      {/* Aktivitäts-Historie (letzte 20) */}
      <div className="mt-4">
        <HistoryPanel marketId={m.id} />
      </div>

      {user.role === "admin" && (
        <div className="mt-8 border-t border-gray-200 pt-5">
          <DeleteCustomerButton marketId={m.id} name={m.name} />
        </div>
      )}
    </div>
  );
}

const PIPELINE_STAGE_LABELS = {
  neu: "Neu",
  kontaktiert: "Kontaktiert",
  interesse: "Interesse",
  angebot: "Angebot",
  gewonnen: "Gewonnen",
  verloren: "Verloren",
} as const;

function formatEuro(value: number | null): string | null {
  return value == null
    ? null
    : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function PipelineField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{value}</dd>
    </div>
  );
}
