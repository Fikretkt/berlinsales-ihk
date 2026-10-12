# Aktivitätsdiagramme

Workflows aus Nutzersicht. Ergänzt das State-Diagramm um die menschliche Perspektive.

**Cooldown-Logik:** Ein Cooldown wird **pro Aktion einzeln** als Snapshot in `action.cooldown_until` gespeichert. Bei `duration_days = 0` wird `NULL` geschrieben – kein Cooldown. Bei `visit/success` ist die Regel 0, der Markt wartet auf Lieferung und ist nicht gesperrt. Bei `control/ok` greift der 21-Tage-Cooldown.

## 1. Vertriebsbesuch durchführen

```mermaid
flowchart TD
    Start([Vertriebler oeffnet App]) --> Map[Karten- oder Listenansicht]
    Map --> Find{Markt finden}
    Find -->|Suche| Detail[Markt-Detailseite]
    Find -->|Karte| Detail

    Detail --> CheckStatus{Aktueller Status?}
    CheckStatus -->|Gelb/Orange/Rosa| Block[Hinweis: Markt hat aktiven Vorgang<br/>Vertriebs-Aktion blockiert]
    Block --> End1([Ende])
    CheckStatus -->|Rot| Cooldown[Anzeige: Wieder anfahren ab DATUM]
    Cooldown --> End1
    CheckStatus -->|Grau| Inactive[Markt deaktiviert]
    Inactive --> End1
    CheckStatus -->|Gruen/Blau| Reserve[Optional: Reservieren oder direkt starten]

    Reserve --> Arrive[Vor Ort am Markt]
    Arrive --> CheckinBtn[Button: Ich bin im Markt]
    CheckinBtn --> Geo[Geo-Position via Browser]
    Geo --> Backend[Backend berechnet Entfernung]
    Backend --> Distance{Entfernung?}
    Distance -->|>300m| Warn[Warnung: Du scheinst nicht am Markt zu sein]
    Warn -->|Trotzdem| Result
    Warn -->|Abbrechen| End2([Ende])
    Distance -->|<=300m| Result[Ergebnis auswaehlen]

    Result --> Outcome{Welches Ergebnis?}
    Outcome -->|Erfolg| Y[Action: visit/success<br/>resulting_status: Gelb<br/>cooldown_until: NULL]
    Outcome -->|Eskalation| P[Action: visit/escalation<br/>resulting_status: Rosa<br/>cooldown_until: NULL]
    Outcome -->|Nicht angetroffen| R1[Action: visit/no_contact<br/>resulting_status: Rot<br/>cooldown_until: NOW+3d]
    Outcome -->|Final abgelehnt| R2[Action: visit/declined<br/>resulting_status: Rot<br/>cooldown_until: NOW+30d]

    Y --> Note[Optional: Notiz]
    P --> NoteReq[Pflicht-Notiz: Warum Eskalation?]
    R1 --> Note
    R2 --> Note

    Note --> Save[INSERT action, NOTIFY broadcast]
    NoteReq --> Save
    Save --> End3([Ende])
```

## 2. Lieferung + Kontrolle

```mermaid
flowchart TD
    Start([Liefer-Fahrer am Markt]) --> Open[App oeffnen]
    Open --> Find[Markt suchen<br/>Status sollte Gelb sein]
    Find --> Status{Status Gelb?}

    Status -->|Nein| Conflict[Hinweis: Markt-Status passt nicht.<br/>Trotzdem Lieferung erfassen?]
    Conflict -->|Nein| End0([Klaerung mit Disponent])
    Conflict -->|Ja, mit Override| Override[Manual Override mit Begruendung]
    Override --> Saved

    Status -->|Ja| DelBtn[Button: Lieferung erfolgt]
    DelBtn --> Geo1[Geo-Position]
    Geo1 --> Opt[Optional: Liefermenge]
    Opt --> Saved[Action: delivery<br/>resulting_status: Orange<br/>cooldown_until: NULL]
    Saved --> Push[Phase 2: Push an Team]
    Push --> Sep1[. . . Zeit vergeht . . .]

    Sep1 --> CtrlOpen[Vertriebler oeffnet App,<br/>filtert auf Orange]
    CtrlOpen --> CtrlDrive[Markt antippen, hinfahren]
    CtrlDrive --> CtrlArr[Vor Ort: Aufsteller pruefen]
    CtrlArr --> CtrlBtn[Button: Kontrolle abschliessen]
    CtrlBtn --> CtrlResult{Aufsteller okay?}

    CtrlResult -->|Ja| OK[Action: control/ok<br/>resulting_status: Rot<br/>cooldown_until: NOW+21d]
    CtrlResult -->|Nein, Problem| Prob[Pflicht-Notiz: Problem-Beschreibung]
    Prob --> ProbSave[Action: control/problem<br/>resulting_status: Gelb<br/>cooldown_until: NULL]

    OK --> End1([Vorgang abgeschlossen])
    ProbSave --> Followup[Folgevorgang noetig]
    Followup --> End2([Vorgang laeuft weiter])
```

## 3. Eskalation + persönliches Gespräch

```mermaid
flowchart TD
    Start([Normaler Vertriebler beim Besuch]) --> Try[Versucht Verkauf]
    Try --> Outcome{Marktleiter sagt?}
    Outcome -->|Ja| Y[Action: visit/success → Gelb]
    Outcome -->|Endgueltig nein| R[Action: visit/declined → Rot 30d]
    Outcome -->|Schwierig, will Senior| ESC[Eskalation auslösen]
    Y --> EndY([Ende])
    R --> EndR([Ende])

    ESC --> Reason[Pflicht-Notiz: Warum eskalieren?]
    Reason --> Rosa[Action: visit/escalation<br/>resulting_status: Rosa<br/>cooldown_until: NULL]
    Rosa --> Visible[Markt rosa fuer alle sichtbar]

    Visible --> Team[Team-Absprache: Wer uebernimmt?<br/>Üblicherweise erfahrener Kollege]
    Team --> Wait[Markt wartet evtl. Tage]
    Wait --> Stale{Mehr als 14 Tage?}
    Stale -->|Ja| Warning[Admin-Reporting:<br/>Haenger-Warnung]
    Stale -->|Nein| ProfiArr
    Warning --> ProfiArr

    ProfiArr[Kollege filtert auf Rosa] --> ProfiDrive[Faehrt zum Markt]
    ProfiDrive --> ProfiBtn[Button: Gespraech erfolgreich]
    ProfiBtn --> ProfiResult{Ergebnis?}
    ProfiResult -->|Erfolg| ProfiY[Action: profi_visit/success<br/>resulting_status: Gelb<br/>cooldown_until: NULL]
    ProfiResult -->|Final abgelehnt| ProfiR[Action: profi_visit/declined<br/>resulting_status: Rot<br/>cooldown_until: NOW+60d]

    ProfiY --> EndPY([Vorgang laeuft mit Bestellung weiter])
    ProfiR --> EndPR([Markt langfristig Pause])
```

**Hinweis:** Wer direkt zu einem grünen Markt fährt (ohne dass jemand eskaliert hat), macht einen normalen `visit`, keinen `profi_visit`. Der Trigger blockiert `profi_visit` auf grünen Märkten (P0005). Das DB-Action-Type `profi_visit` (UI: „Persönliches Gespräch") ist immer Reaktion auf einen Rosa-Markt.

## 4. Reservierung

```mermaid
flowchart TD
    Start([Vertriebler plant Tag]) --> List[Markt-Liste]
    List --> Click[Markt antippen]
    Click --> Status{Status?}
    Status -->|Gruen| Res[Button: Reservieren]
    Status -->|Gelb| ResCombi[Reservieren moeglich,<br/>UI zeigt kombiniert: Gelb + Reserv-Badge]
    Status -->|Orange| ResCombi
    Status -->|Rosa| ResCombi
    Status -->|Rot/Grau| Block[Nicht moeglich]
    Status -->|Blau| Already[Reserviert von Kollege]

    Already --> Decision{Was tun?}
    Decision -->|Mit Kollege reden| Coord[Operative Klaerung]
    Decision -->|Anderen Markt| List

    Res --> Save[INSERT reservation<br/>valid_until = heute 23:59 Europe/Berlin → UTC]
    ResCombi --> Save
    Save --> Sync[NOTIFY market_updated]

    Sync --> Drive[Tour fahren]
    Drive --> Reach{Markt erreicht?}
    Reach -->|Ja| Checkin[Check-in oder Folgeaktion durchfuehren]
    Reach -->|Nein| Skip[Tour anders]

    Checkin --> ResEnd[Reservierung kann manuell beendet werden]
    Skip --> Evening{23:59 Berlin?}
    Evening -->|Ja| Auto[Background-Job alle 60s:<br/>UPDATE reservation SET active=false<br/>WHERE valid_until <= NOW AND active=true<br/>Batch-NOTIFY mit market_ids-Liste]
    Evening -->|Nein| Manual[Optional: User hebt selbst auf]
    Manual --> Auto
```

**Reservierungs-Regeln** (Backend-erzwungen, nicht im Trigger):
- Erlaubt auf: Grün, Gelb, Orange, Rosa
- Verboten auf: Blau (gibt's nur als Anzeige), Rot, Grau
- Max. 1 aktive Reservierung pro Markt
- Auto-Reset um 23:59 Europe/Berlin
- Idempotent: wenn Job mal aussetzt (Deployment), wird beim nächsten Lauf nachgeholt

## 5. Stornierung

```mermaid
flowchart TD
    Start([Markt auf Gelb,<br/>Bestellung wurde storniert]) --> Notice[Vertriebler erfaehrt davon<br/>z.B. aus JTL]
    Notice --> Open[Markt-Detail oeffnen]
    Open --> Btn[Button: Bestellung storniert]
    Btn --> Confirm[Bestaetigungsdialog]
    Confirm -->|Abbrechen| End1([Keine Aenderung])
    Confirm -->|Ja| Reason[Pflicht-Notiz: Grund]
    Reason --> Save[Action: cancel_order<br/>resulting_status: Gruen<br/>cooldown_until: NULL<br/>payload.reason gesetzt]
    Save --> Sync[NOTIFY market_updated]
    Sync --> End2([Markt frei])
```

`cancel_order` ist nur bei Gelb sinnvoll und nur dort erlaubt. Auf anderen Status blockt der Trigger: P0001 bei aktivem Vorgang (Orange/Rosa), P0005 bei Grün, P0002 bei Rot mit Cooldown, P0003 bei Merged, P0004 bei inaktiv. Trigger-Code-Übersicht: siehe `docs/Reference.md`.

## 6. Markt-Merge (Admin)

```mermaid
flowchart TD
    Start([Admin sieht zwei Dubletten]) --> List[Markt-Liste filtern]
    List --> Select[Beide Eintraege auswaehlen]
    Select --> Btn[Button: Zusammenfuehren]
    Btn --> Choose[Auswahl: Welcher ist Primary?]
    Choose --> Preview[Vorschau:<br/>Notes von Duplikat werden uebernommen<br/>Actions von Duplikat werden uebernommen<br/>Reservation von Duplikat: aufgeloest]
    Preview --> Confirm[Bestaetigen]

    Confirm --> Tx[BEGIN Transaction]
    Tx --> UpdateNotes[UPDATE note SET market_id = primary_id<br/>WHERE market_id = duplicate_id]
    UpdateNotes --> UpdateActions[UPDATE action SET market_id = primary_id<br/>WHERE market_id = duplicate_id]
    UpdateActions --> CancelRes[UPDATE reservation SET active = false<br/>WHERE market_id = duplicate_id AND active = true]
    CancelRes --> MergeFlag[UPDATE market SET active = false,<br/>merged_into_id = primary_id<br/>WHERE id = duplicate_id]
    MergeFlag --> Audit[INSERT audit_log<br/>event: market_merged]
    Audit --> Commit[COMMIT]
    Commit --> End([Fertig])
```

**Nach Merge:** Insert-Versuche auf den gemergten Markt werden vom Trigger mit P0003 geblockt. Frontend muss bei alten URLs auf den Primary umleiten.
