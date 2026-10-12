"use client";

import { useState } from "react";
import { Crosshair, LoaderCircle, MapPin, X } from "lucide-react";

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function NewCustomerDialog({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [phone, setPhone] = useState("");
  const [streetFull, setStreetFull] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("GPS ist auf diesem Gerät nicht verfügbar.");
      return;
    }
    setError(null);
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toFixed(7));
        setLng(position.coords.longitude.toFixed(7));
        setGpsLoading(false);
      },
      (locationError) => {
        const messages: Record<number, string> = {
          1: "Standortfreigabe wurde verweigert.",
          2: "Der aktuelle Standort ist nicht verfügbar.",
          3: "Die Standortabfrage hat zu lange gedauert.",
        };
        setError(messages[locationError.code] ?? "Standort konnte nicht ermittelt werden.");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setError("Bitte einen gültigen Standort angeben.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/v1/markets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          lat: latitude,
          lng: longitude,
          contact_phone: phone || null,
          street_full: streetFull || null,
          district: district || null,
          city: city || null,
          postal_code: postalCode || null,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error?.message ?? "Firma konnte nicht gespeichert werden.");
        return;
      }
      onCreated(json.data.market_id as string);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-end bg-slate-950/35 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="new-customer-title">
      <form onSubmit={submit} className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="new-customer-title" className="text-lg font-semibold text-slate-950">Neue Firma</h2>
            <p className="text-sm text-slate-600">Standort per GPS oder manuell erfassen.</p>
          </div>
          <button type="button" onClick={onClose} className="flex min-h-10 min-w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Schließen"><X className="h-5 w-5" /></button>
        </div>

        <label className="mt-5 block text-sm font-medium text-slate-700">Name <span className="text-red-700">*</span>
          <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={200} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base" />
        </label>

        <div className="mt-4 rounded-xl bg-blue-50 p-3">
          <p className="text-sm font-medium text-blue-950">Standort</p>
          <button type="button" onClick={useCurrentLocation} disabled={gpsLoading} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-800 px-3 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-60">
            {gpsLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
            {gpsLoading ? "Standort wird ermittelt …" : "Aktuellen Standort verwenden"}
          </button>
          {lat && lng && <p className="mt-2 flex items-center gap-1 text-xs font-medium text-blue-800"><MapPin className="h-3.5 w-3.5" /> Standort erkannt</p>}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-slate-700">Breitengrad <span className="text-red-700">*</span><input type="number" step="any" value={lat} onChange={(event) => setLat(event.target.value)} required min="-90" max="90" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
          <label className="text-sm font-medium text-slate-700">Längengrad <span className="text-red-700">*</span><input type="number" step="any" value={lng} onChange={(event) => setLng(event.target.value)} required min="-180" max="180" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-slate-700">Telefon<input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={50} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
          <label className="block text-sm font-medium text-slate-700">Adresse<input value={streetFull} onChange={(event) => setStreetFull(event.target.value)} maxLength={250} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-slate-700">PLZ<input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} inputMode="numeric" maxLength={5} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
            <label className="text-sm font-medium text-slate-700">Ort<input value={city} onChange={(event) => setCity(event.target.value)} maxLength={100} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Bezirk<input value={district} onChange={(event) => setDistrict(event.target.value)} maxLength={100} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700">Abbrechen</button>
          <button disabled={saving} className="min-h-11 flex-1 rounded-lg bg-green-700 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60">{saving ? "Speichert …" : "Speichern"}</button>
        </div>
      </form>
    </div>
  );
}
