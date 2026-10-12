// Nominatim/OpenStreetMap Geocoding.
// Rate-Limit: 1 Anfrage/Sekunde (Nominatim Usage Policy).
// User-Agent ist Pflicht — wir nutzen Projektname + Kontakt.

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "MarktSync/0.7 (https://github.com/marktsync; vullnet@vazi.dev)";
const RATE_LIMIT_MS = 1100; // etwas Puffer

export interface GeocodeResult {
  lat: number;
  lng: number;
  display_name: string;
}

let lastRequestAt = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequestAt = Date.now();
  return fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
}

export async function geocode(
  street: string,
  postalCode: string,
  city: string,
): Promise<GeocodeResult | null> {
  // Strukturierte Anfrage (höhere Treffer-Quote als freie Query).
  const params = new URLSearchParams({
    street,
    postalcode: postalCode,
    city,
    country: "Germany",
    format: "json",
    limit: "1",
    addressdetails: "0",
  });
  const res = await rateLimitedFetch(`${NOMINATIM_URL}?${params}`);
  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status} for ${street}, ${postalCode} ${city}`);
  }
  const arr = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
  }>;
  if (arr.length === 0) return null;
  const hit = arr[0]!;
  return {
    lat: parseFloat(hit.lat),
    lng: parseFloat(hit.lon),
    display_name: hit.display_name,
  };
}
