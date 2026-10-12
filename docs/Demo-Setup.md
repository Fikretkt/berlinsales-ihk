# Demo-Setup für Office-Vorführung

Schritt-für-Schritt Anleitung, damit Kunden im Office die App auf ihren Handys testen können — Laptop läuft als Server, alle Handys verbinden sich über einen Cloudflare-Tunnel.

## Was du brauchst

- Laptop mit MarktSync (`pnpm dev` muss laufen)
- Internet im Office
- Handys der Tester (4 Stück, oder mehr)

## Einmal vorher (heute Abend, ~15 Min)

### 1. cloudflared installieren

PowerShell als Admin:

```powershell
winget install --id Cloudflare.cloudflared
```

Danach neues PowerShell-Fenster öffnen, prüfen:

```powershell
cloudflared --version
```

### 2. Demo-User anlegen (einmal reicht, ist idempotent)

```powershell
pnpm exec tsx scripts/create-demo-users.ts
```

Legt an:

| E-Mail                  | Passwort   | Rolle       |
|-------------------------|----------- |-------------|
| admin@demo.de           | demo123456 | admin       |
| mitarbeiter1@demo.de    | demo123456 | field_user  |
| mitarbeiter2@demo.de    | demo123456 | field_user  |
| mitarbeiter3@demo.de    | demo123456 | field_user  |

## Im Office (10 Min vor der Vorführung)

### 3. Drei Terminals aufmachen

**Terminal 1 — App-Server:**
```powershell
pnpm dev
```
Wartet bis „Ready in …" steht.

**Terminal 2 — Background-Jobs:**
```powershell
pnpm jobs
```
Wartet bis „Cron jobs scheduled" steht.

**Terminal 3 — Cloudflare-Tunnel:**
```powershell
cloudflared tunnel --url http://localhost:3000
```

Im Output erscheint nach ~5 Sekunden eine Zeile wie:

```
https://something-random-words.trycloudflare.com
```

**Das ist die Demo-URL.** Kopieren!

### 4. AUTH_URL anpassen (WICHTIG sonst funktioniert Login nicht)

Datei `.env.local` öffnen, die Zeile `AUTH_URL=…` ändern auf die Tunnel-URL:

```
AUTH_URL=https://something-random-words.trycloudflare.com
AUTH_TRUST_HOST=true
```

Dann **Terminal 1 neu starten** (`Strg+C`, dann nochmal `pnpm dev`).

### 5. Test vom eigenen Handy

- Tunnel-URL ins Handy-Browser eingeben
- Mit `admin@demo.de` / `admin123` einloggen
- Karten-Ansicht muss laden, Marker sichtbar
- Karte erlaubt „Standort verwenden" → grünes Häkchen

Wenn das geht, läuft der Tunnel.

### 6. Demo-URL an Kunden geben

Drei Wege, was am schnellsten geht:

**Option A — QR-Code:** Tunnel-URL in https://www.qr-code-generator.com einfügen, ausdrucken oder auf Bildschirm zeigen, Kunden scannen mit Handy-Kamera.

**Option B — Slack/WhatsApp:** URL einfach in ein Chat-Gespräch oder per AirDrop schicken.

**Option C — Kurz-URL aufschreiben:** Trycloudflare-URLs sind 4 Wörter mit Bindestrich, lesbar.

## Demo-Skript (was zeigst du)

1. **Login auf 3 Handys** mit `mitarbeiter1@demo.de` / `mitarbeiter2@demo.de` / `mitarbeiter3@demo.de` — alle Passwort `123456`
2. **Du selbst** loggst dich auf deinem Laptop als `admin@demo.de` ein → Admin-Bereich
3. Mitarbeiter 1 wählt einen Markt auf der Karte → **reserviert** ihn
4. Mitarbeiter 2 sieht binnen 2-3 Sekunden, dass der Markt blau wird (Live-Update!)
5. Mitarbeiter 1 macht eine Aktion (z.B. „Besuch → erfolgreich") → Markt wird gelb, Reservierung weg
6. **Offline-Test:** Mitarbeiter 3 schaltet Flugmodus an, macht eine Aktion → Aktion wird gespeichert, gelbes Offline-Banner. Flugmodus aus → Aktion wird synchronisiert, alle anderen sehen das Update
7. **Du als Admin** zeigst: Audit-Log mit allen Aktionen, Reporting, Konflikt-Inbox

## Wenn was nicht klappt

| Problem | Lösung |
|---|---|
| „Untrusted Host" Fehler beim Login | `AUTH_URL` in `.env.local` stimmt nicht mit der Tunnel-URL überein. Neu setzen + Server neustart |
| Tunnel-URL ändert sich | Quick-Tunnel hat jedes Mal andere URL. Lass den Tunnel-Prozess durchlaufen, nicht neu starten |
| Handy zeigt „nicht sicher" | Cloudflare gibt HTTPS-Zertifikat aus, das geht. Falls Browser warnt: anderen Browser probieren |
| Karten-Marker fehlen | DB-Migration läuft oder Markt-Import noch nicht durch. `pnpm db:migrate` + `pnpm exec tsx scripts/import-markets.ts` |
| Standort wird nicht abgefragt | HTTPS muss aktiv sein (also Tunnel-URL nutzen, nicht localhost) |

## Nach der Demo

- Terminal 3 (Tunnel) abschießen mit `Strg+C` → URL ist sofort tot
- `AUTH_URL` in `.env.local` zurück auf `http://localhost:3000` setzen
- Demo-User bleiben in der DB (sind ja idempotent — stören nicht)
