// Browser-Geolocation-Helper.
// Liefert Position oder null wenn nicht erlaubt / nicht verfügbar.

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

export async function getCurrentPosition(timeoutMs = 7_000): Promise<GeoPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}
