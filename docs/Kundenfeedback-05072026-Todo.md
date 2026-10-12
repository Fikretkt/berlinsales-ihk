# Kundenfeedback vom 05.07.2026 — Umsetzungs-Liste

Sechs Änderungen aus der Kunden-Demo. Reihenfolge = Vorschlag für nächsten Sprint (leicht zuerst, damit was Sichtbares fertig ist).

---

## 1. Umbenennung: „Kontrolle" → „Aktiver Kundendienst"

**Was:** UI-Wording. DB-Enum `control` bleibt, nur Anzeige-Texte ändern.

**Aufwand:** ~30 Min.

**Todo:**
- [ ] Grep nach „Kontrolle" / „Kontrolle nötig" / „control" in `components/`, `app/`
- [ ] In allen UI-Strings durch „Aktiver Kundendienst" ersetzen
- [ ] Button-Label auf Orange-Status-Karte prüfen
- [ ] CLAUDE.md Trigger-Tabelle: Fußnote „(UI: Aktiver Kundendienst)" bei Orange-Zeile

---

## 4. Reporting-Default: „am längsten vernachlässigt" (in nächster Session prüfen)

**Was:** Reporting öffnet mit Default-Sortierung nach längster Zeit seit letzter Action, absteigend.

**Erst prüfen bevor gebaut wird:**
- [ ] Welche Reporting-Seite gibt es aktuell? (`app/(admin)/reporting/` o.ä.)
- [ ] Liefert `v_market_status` schon `last_action_at` oder `days_since_last_action`?
  - Wenn ja → nur Frontend-Sortierung ändern
  - Wenn nein → View um Feld erweitern
- [ ] Ist der Filter im UI schon vorhanden und default nur falsch? Oder muss der Filter selbst gebaut werden?

**Danach:** Default-Sort umstellen. Filter-Reihenfolge so lassen dass User trotzdem umschalten kann.

---

## 2. „Final abgelehnt" — neue Rolle Profi + neue Action

**Was:** Neue User-Rolle `profi`. Nur `profi` darf `final_reject`. Voraussetzung: Markt ist im Rosa-Status. Übergang Rosa → Rot (final).

**Todo:**
- [ ] Auth.js: Rolle `profi` neben `field_user`, `admin` einführen
- [ ] DB-Migration: `user.role` Check-Constraint erweitern
- [ ] Neue Action `final_reject` im `action.type` Enum
- [ ] `computeResultingStatus()`: `final_reject` → `rot` (final, kein Cooldown-Ablauf)
- [ ] Trigger `enforce_action_allowed`: `final_reject` nur auf Rosa, sonst P0001
- [ ] API-Endpoint: 403 wenn User-Rolle nicht `profi`
- [ ] UI: „Final abgelehnt"-Button nur sichtbar wenn Rolle=profi UND Status=Rosa
- [ ] UI: Rot-final-Zustand darstellen (kein Cooldown-Ablauf-Countdown, „Endgültig abgelehnt am … durch …")
- [ ] Admin-UI: Rolle „Profi" beim Anlegen/Bearbeiten von Usern auswählbar
- [ ] Tests: field_user bekommt 403, profi kommt durch, aus Gelb heraus P0001

---

## 5. Cooldowns pro Markt (im Markt-Detail einstellbar)

**Was:** Pro Markt und Action-Typ eigene Cooldown-Dauer setzbar. Fallback auf globalen Default.

**Todo:**
- [ ] Neue Tabelle `market_cooldown_override` (`market_id`, `action_type`, `duration_days`, `updated_by`, `updated_at`) + UNIQUE(market_id, action_type)
- [ ] Drizzle-Schema + Migration
- [ ] `computeResultingStatus()` erweitern: liest Override-Wert, fällt auf Default zurück
- [ ] API `GET/PUT /api/v1/markets/:id/cooldowns` (nur Admin/Profi)
- [ ] Markt-Detail-UI: Reiter/Sektion „Cooldowns" mit Feldern pro Action-Typ (leer = Default nutzen)
- [ ] Audit-Log Event `market_cooldown_overridden`
- [ ] Tests: Override greift, leeres Feld nutzt Default, field_user bekommt 403

---

## 6. Bestandskunden-Flag + Neuakquise-Sicht

**Was:** Boolean `is_bestandskunde` pro Markt. Filter/Toggle „Bestandskunden / Neuakquise / Alle" in Markt-Liste und Karte.

**Todo:**
- [ ] Migration: `market.is_bestandskunde BOOLEAN NOT NULL DEFAULT false`
- [ ] Drizzle-Schema anpassen
- [ ] CSV-Import: optionale Spalte `bestandskunde` (y/n / 1/0)
- [ ] Markt-Detail-UI: Toggle „Bestandskunde" (Admin/Profi)
- [ ] Markt-Liste: Filter-Toggle mit 3 Zuständen
- [ ] Karten-Ansicht: Filter greift auch dort
- [ ] Klären mit Kunde: **Gelten für Neuakquise-Märkte die gleichen Status-Regeln?** Oder eigener reduzierter Regelsatz (z.B. nur Grün/Grau + „profi_visit")?
- [ ] Reporting: eigene Spalte / Filter „Bestandskunde"

---

## 3. Lieferant-eigene UI (größtes Feature)

**Was:** Neue Rolle `delivery_user`. Reduziertes UI: Markt öffnen → ein Button „Geliefert".

**Todo:**
- [ ] Auth.js + DB: Rolle `delivery_user`
- [ ] Neuer Route-Bereich `app/(delivery)/` mit eigenem Layout (großer Button, wenig Text, Karte optional)
- [ ] Middleware: Rolle=delivery_user → Redirect zu `/delivery` bei Login
- [ ] Rolle=delivery_user darf nur Action `delivery`
- [ ] API: 403 bei allen anderen Actions
- [ ] Optional: eigene, gefilterte Markt-Liste (nur Märkte mit offener Lieferung, also Status Gelb)
- [ ] Optional: PWA-Icon/Splash für Delivery-Variante gleich lassen — nur In-App anders
- [ ] Admin-UI: Rolle beim Anlegen auswählbar
- [ ] Klären mit Kunde: Sieht der Fahrer nur Gelb-Märkte, oder alle? Braucht er GPS-Distanz-Check wie Vertriebler?

---

## Reihenfolge-Vorschlag

1. **Punkt 1** (30 Min UI-Wording) — sofort erledigt.
2. **Punkt 4** (Reporting-Default) — erst prüfen was da ist, dann kleiner Fix.
3. **Punkt 6** (Bestandskunden-Flag) — mittelgroß, isoliert vom Rest.
4. **Punkt 2** (Profi-Rolle + final_reject) — Basis für weitere Rollen-Arbeit.
5. **Punkt 5** (Cooldowns pro Markt) — braucht neue Tabelle + Compute-Anpassung.
6. **Punkt 3** (Lieferant-UI) — größtes Feature zum Schluss.

## Offene Klärungsfragen für den Kunden

- Punkt 6: Andere Status-Regeln für Neuakquise-Märkte?
- Punkt 3: Fahrer sieht nur Gelb-Märkte oder alle? Distanz-Check ja/nein?
