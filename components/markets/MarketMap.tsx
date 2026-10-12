"use client";

// Karten-Ansicht mit Leaflet + Marker-Cluster.
// Client-only (Leaflet braucht window). Wird per dynamic import mit ssr:false
// geladen. Marker-Farben aus dem Status-Display, Bottom-Sheet beim Tap.

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import "leaflet.markercluster";
import { STATUS_DISPLAY } from "@/lib/markets/status-display";
import type { MarketMapMarkerApi } from "@/lib/markets/api-client";

// Berlin Mitte als Default-Center
const DEFAULT_CENTER: [number, number] = [52.52, 13.405];
const DEFAULT_ZOOM = 10;

function buildIcon(
  status: MarketMapMarkerApi["computedStatus"],
  hasReservation: boolean,
): L.DivIcon {
  // Grüner Markt mit Reservation → wird als "blau" angezeigt (Spec UI-Edge-Case).
  // Sonst: Status-Farbe + optionaler Reservierungs-Ring.
  const effectiveStatus =
    status === "gruen" && hasReservation ? "blau" : status;
  const color = STATUS_DISPLAY[effectiveStatus].color;
  const ring =
    hasReservation && status !== "gruen"
      ? `<circle cx="12" cy="12" r="9" fill="none" stroke="#3b82f6" stroke-width="2"/>`
      : "";
  // Pin-Form als inline-SVG. 24x32 px, mit Schatten.
  const html = `<div style="position:relative;width:24px;height:32px;">
  <svg viewBox="0 0 24 32" width="24" height="32" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" fill="${color}"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
    ${ring}
  </svg>
</div>`;
  return L.divIcon({
    html,
    className: "marktsync-marker",
    iconSize: [24, 32],
    iconAnchor: [12, 32],
    popupAnchor: [0, -28],
  });
}

export function MarketMap({
  markets,
  onSelect,
}: {
  markets: MarketMapMarkerApi[];
  onSelect: (market: MarketMapMarkerApi) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
    });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;

    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    const bounds: [number, number][] = [];
    for (const m of markets) {
      const marker = L.marker([m.lat, m.lng], {
        icon: buildIcon(m.computedStatus, !!m.reservedByUserId),
        title: m.name,
      });
      marker.on("click", () => onSelect(m));
      cluster.addLayer(marker);
      bounds.push([m.lat, m.lng]);
    }
    if (bounds.length > 0 && mapRef.current) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [markets, onSelect]);

  return <div ref={containerRef} className="h-full w-full" />;
}
