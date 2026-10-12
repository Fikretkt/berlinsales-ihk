# User-Stories: MarktSync

## US-01: Login

**Als** Field User
**möchte ich** mich mit E-Mail und Passwort einloggen können,
**damit** ich auf das Tool zugreifen kann.

**Akzeptanzkriterien:**
- E-Mail und Passwort werden geprüft
- Bei Erfolg: Session-Cookie, Redirect zur Karten-Übersicht
- Bei Fehlversuch: klare Fehlermeldung
- Rate-Limit nach 5 Fehlversuchen/Min
- „Passwort vergessen"-Link zum Reset

## US-02: Setup nach Einladung

**Als** neu eingeladener Nutzer
**möchte ich** über einen Link aus der Einladungs-Mail mein Passwort setzen,
**damit** ich das Tool nutzen kann.

**Akzeptanzkriterien:**
- Klick auf Link öffnet Setup-Seite
- Token serverseitig validiert (TTL 7 Tage, einmalig)
- Bei gültigem Token: Passwort-Eingabemaske
- Nach Setzen: User ist sofort eingeloggt
- Bei abgelaufenem Token: Hinweis + „Neue Einladung anfordern"

## US-03: Karten-Übersicht

**Als** Field User
**möchte ich** alle Märkte auf einer Karte sehen.

**Akzeptanzkriterien:**
- Marker mit Status-Farben
- Filter: Status, Kette, eigene Aktivität, Rosa-Only
- Tap → Detailseite
- Map-Tiles offline gecached
- Marker mit Reservierung haben Zusatz-Badge

## US-04: Markt-Suche

**Akzeptanzkriterien:**
- Suchfeld durchsucht Name, Adresse, GLN, Bezirk
- Sortierung: Entfernung, zuletzt angefasst, Status
- Cursor-Pagination

## US-05: Markt-Detail

**Akzeptanzkriterien:**
- Name, Adresse, Kette, GLN, Ansprechpartner, Telefon
- Status: Icon + Text + Farbe
- Bei Cooldown: Datum „Wieder anfahren ab: 09.06.2026"
- Bei Reservierung: Reserver + Gültigkeit
- Letzte 20 Aktionen mit Nutzer + Zeitstempel
- Notizen chronologisch
- „Navigieren"-Button öffnet Maps-App

## US-06: Vertriebsbesuch erfassen

**Akzeptanzkriterien:**
- Button „Ich bin im Markt" sichtbar bei Grün/Blau
- Geo-Position geholt
- Backend berechnet Entfernung
- Bei >300m: Warnung, trotzdem abschließbar
- Ergebnis: Erfolg / Eskalation / Nicht angetroffen / Final abgelehnt
- Bei Eskalation: Pflicht-Notiz
- Status ändert sich, andere sehen Änderung < 5s

## US-07: Lieferung erfassen

**Akzeptanzkriterien:**
- Button „Lieferung erfolgt" sichtbar bei Gelb
- Bei anderen Status: Konflikt-Hinweis
- Optional: Liefermenge / Bemerkung
- Status → Orange

## US-08: Kontrolle abschließen

**Akzeptanzkriterien:**
- Button bei Orange sichtbar
- Auswahl: okay / Problem
- Bei Problem: Pflicht-Notiz „Problem-Beschreibung"
- okay → Rot mit 21 Tage Cooldown
- Problem → Gelb (Folgevorgang)

## US-09: Eskalation und persönliches Gespräch

**Akzeptanzkriterien:**
- Filter „nur Rosa-Märkte" (Status „Persönliches Gespräch")
- Eskalations-Notiz prominent auf Detailseite
- Buttons „Gespräch erfolgreich" / „Gespräch abgelehnt (final)" sichtbar bei Rosa
- Erfolg → Gelb
- Final abgelehnt → Rot, 60 Tage Cooldown

**Hinweis (v0.8):** Wir vermeiden das Wort „Profi" in der UI, weil es die normalen Vertriebler abwertet. Das DB-Action-Type heißt weiterhin `profi_visit`, sichtbar ist nur „Persönliches Gespräch".

## US-10: Reservierung

**Als** Vertriebler oder Liefer-Fahrer
**möchte ich** einen Markt für heute reservieren,
**damit** kein Kollege parallel hinfährt.

**Akzeptanzkriterien:**
- Button „Reservieren" auf Grün, Gelb, Orange, Rosa
- Reservierung läuft bis 23:59 Berlin
- Andere sehen Marker als Blau (bei Grün) oder mit Badge (bei Gelb/Orange/Rosa)
- Auto-Reset um 23:59 durch Background-Job (jede Minute)
- Eigene Reservierung manuell aufhebbar
- Auf Rot oder Grau: Button nicht sichtbar

**Hinweis:** Gelb-Reservierung ist neu in v0.5. Use Case: Liefer-Fahrer reserviert Markt für die Lieferung am nächsten Tag.

## US-11: Bestellung stornieren

**Akzeptanzkriterien:**
- Button „Bestellung storniert" nur bei Gelb sichtbar
- Bestätigungsdialog mit Pflicht-Notiz „Grund"
- Status → Grün
- Action in Historie mit Notiz

## US-12: Notiz schreiben

**Akzeptanzkriterien:**
- Notiz-Feld auf Detailseite
- Speichern mit Autor + Zeitstempel
- 24h editierbar
- Bei Markt-Merge: bleibt erhalten

## US-13: Neuen Markt anlegen

**Akzeptanzkriterien:**
- Formular mit Pflichtfeldern
- GLN-Validierung: 13 Ziffern
- Bei vorhandener aktiver GLN: Fehler
- Bei ähnlicher Adresse: Warnung, trotzdem speichern möglich
- Erscheint sofort in Übersicht

## US-14: Offline-Aktion erfassen

**Akzeptanzkriterien:**
- Banner „Offline-Modus" bei fehlender Verbindung
- Aktion in IndexedDB gepuffert mit `client_id` (UUID v4)
- Toast „Offline gespeichert"
- Auto-Sync bei Wiederverbindung
- Erfolgs- oder Konflikt-Meldung pro Aktion
- Idempotenz: zweimaliger Sync desselben Batches funktioniert ohne Doppel-Insert

## US-15: Offline-Konflikt auflösen (Field User)

**Akzeptanzkriterien:**
- Modal nach Sync zeigt konfliktäre Aktionen
- Pro Aktion: Details, aktueller Status, was inzwischen passiert ist
- Optionen: „Verwerfen" oder „An Admin melden"
- „An Admin melden" → Audit-Log-Eintrag, Admin sieht es in Dashboard
- Verwerfen löscht aus IndexedDB

**Hinweis:** Field User dürfen kein Manual Override direkt – das macht der Admin nach Rücksprache.

## US-16: Admin lädt User ein

**Akzeptanzkriterien:**
- Formular: E-Mail, Name, Rolle, Firma
- Einladungs-Mail automatisch versendet
- Bei Mail-Versand-Fehler: UI-Warnung, Audit-Log, Admin kann erneut senden
- User in Liste als „Eingeladen"
- Audit-Log-Eintrag

## US-17: Admin verwaltet Cooldowns

**Akzeptanzkriterien:**
- Liste aller Regeln editierbar
- Eingabe in Tagen
- Hinweis: „Wirkt nur auf zukünftige Aktionen"
- Audit-Log mit altem + neuem Wert
- Bestehende Action-Cooldowns unverändert (siehe Tests)

## US-18: Admin merged Dubletten

**Akzeptanzkriterien:**
- Mehrfach-Auswahl in Liste
- „Zusammenführen" bei 2 ausgewählten
- Auswahl: primärer Datensatz
- Vorschau: wie viele Notes/Actions/Reservierungen werden umgehängt
- Bestätigen: Notes + Actions umhängen, Duplikat deaktiviert mit `merged_into_id`
- Aktive Reservierungen aufgehoben
- Audit-Log
- Versuche, Actions auf gemergten Markt einzufügen, werden mit HTTP 410 + `merged_into_id` abgewiesen

## US-19: Manual Override durch Admin

**Akzeptanzkriterien:**
- Auf Markt-Detail (nur Admin): Button „Status überschreiben"
- Auswahl: Ziel-Status (Grün, Gelb, Orange, Rosa, Rot, Grau) – NICHT Blau
- Pflicht-Notiz „Grund"
- Bei Ziel-Status „Rot" zusätzliche Warnung: „Der Markt bleibt dauerhaft rot, bis Sie ihn per weiterem Override freigeben. Es gibt keinen automatischen Cooldown-Ablauf."
- Action mit `type='manual_override'`
- Audit-Log mit event `manual_override_performed`
- Sichtbar für alle in < 5s
- Field User können dies NICHT direkt; brauchen Admin

**UI-Anzeige eines „Rot ohne Cooldown"-Marktes** (für Field User auf Detail-Seite):
- Status-Badge: Rot
- Statt „Wieder anfahren ab `<Datum>`" zeigt: „Gesperrt durch Admin am `<Datum>` – Grund: `<reason>`"
- Backend liefert dafür `last_action` mit Type, User, Timestamp, Payload im `GET /markets/:id`-Response

## US-20: Reporting-Übersicht

**Akzeptanzkriterien:**
- Zeitraum-Filter
- Kennzahlen: Besuche, Lieferungen, Kontrollen, Eskalationen
- Erfolgs- und Eskalations-Quote
- Aufschlüsselung pro Team und Bezirk
- Hänger-Liste: Rosa >14d, Gelb >21d, Märkte ohne Aktivität >45d

## US-21: Passwort-Reset

**Akzeptanzkriterien:**
- „Passwort vergessen"-Link auf Login
- Immer 200-Response (Anti-Enumeration)
- Reset-Link gültig 1h
- Neues Passwort setzen, sofort eingeloggt

## US-22: Neue-Märkte-Reporting (Admin) – NEU in v0.5

**Als** Admin
**möchte ich** sehen, welche Märkte in den letzten 30 Tagen angelegt wurden,
**damit** ich Dubletten kontrollieren kann, die Field User angelegt haben.

**Akzeptanzkriterien:**
- Reporting-Ansicht „Neue Märkte (30 Tage)"
- Pro Eintrag: Markt, anlegender User, Datum
- Pro Eintrag: ähnliche existierende Märkte (Trigram-Match)
- Filter: nach User, nach Zeitraum
- Aktionen pro Eintrag: „Merge initiieren" (→ Standard-Merge-Flow)

## US-23: CSV-Import (Admin)

**Als** Admin
**möchte ich** Märkte aus CSV importieren können,
**damit** Initial-Befüllung von 200 Märkten und spätere Updates effizient möglich sind.

**Akzeptanzkriterien:**
- Admin-UI: Upload-Feld für CSV + Modus-Auswahl (Toggle „Bestehende Märkte aktualisieren")
- Modus `insert-only` (Default): GLN-Konflikte werden geskippt
- Modus `upsert`: Bestehende Märkte werden über GLN aktualisiert
- Validierung pro Zeile
- Validation-Fehler: Zeile geskippt, im Report aufgeführt
- Response: `imported`, `updated`, `skipped_duplicates`, `errors`
- Vorschau-Schritt vor Bestätigung (zeigt, wieviele Insert vs. Update vs. Skip)
- Download-Link für Vorlage mit korrektem Format
- Audit-Event `markets_csv_imported`

## US-24: Konflikt-Inbox (Admin) – NEU in v0.6

**Als** Admin
**möchte ich** Offline-Konflikt-Berichte von Field Usern sehen und auflösen können,
**damit** ich auf Disziplin- oder Daten-Probleme reagieren kann, ohne dass Field User selbst manual_override machen.

**Akzeptanzkriterien:**
- Admin-Bereich: Menüeintrag „Konflikt-Berichte" mit Anzahl offener Berichte
- Liste sortiert nach Datum (neueste zuerst)
- Filter: offen / aufgelöst / alle
- Pro Eintrag: Markt, Reporter, intended_type, Konflikt-Detail, User-Kommentar, Geo (falls vorhanden)
- Aktion: „Mit manual_override reagieren" → öffnet Override-Dialog auf dem betroffenen Markt mit vorausgefülltem Grund
- Aktion: „Als erledigt markieren" (ohne Override, falls schon anderweitig geklärt)
- Beim Auflösen: Audit-Event `offline_conflict_resolved` mit `linked_report_id` und optional `linked_action_id`
- Konflikt-Inbox-Counter aktualisiert sich in Echtzeit (über SSE bei neuem Bericht – Phase 2)
