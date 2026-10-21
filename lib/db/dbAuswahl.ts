import { ersteDb, zweiteDb } from "./client";

export type DbBereich = "internal" | "external";

export function dbAuswahl(bereich: DbBereich) {
    if(bereich === "internal") {
        return ersteDb;
    }
    return zweiteDb;    
}

export function hostBereich(host: string): DbBereich {
    const internalHost = process.env.APP_INTERNAL_HOST;
    const externalHost = process.env.APP_EXTERNAL_HOST;
    if(host === internalHost) {
        return "internal";
    }
    if(host === externalHost) {
        return "external";
    }
    throw new Error(`Unbekannter Host: ${host}`);
}

export function hostDbAuswahl(host: string) {
    const bereich = hostBereich(host);
    return dbAuswahl(bereich);
}