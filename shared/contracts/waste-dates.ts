// KOPI af summer-hub/contracts/waste-dates.ts – ret den i hub'en og kør `node scripts/sync-shared.mjs` dér.
// Kontrakt: Skralds tømmedage i waste-collection-dates. Ejes af summer-hub/contracts; kopieres af `node scripts/sync-shared.mjs`.
// Kun typer (Skrald er et offentligt repo uden zod). Producenten tjekker sine svar med `satisfies`; forsiden læser dem tolerant.
//   GET /api/home          → WasteAddress | null (hjemmeadressen fra HOME_ADDRESS)
//   GET /api/home/dates    → WasteDatesResponse for hjemmeadressen (404 uden HOME_ADDRESS)
//   GET /api/saved-address → WasteAddress | null (den adresse, appen viser)
//   GET /api/dates         → WasteDatesResponse for den viste adresse (400 uden adresse)

export interface WasteAddress {
  id: string;
  /** Adressen, som Vestfor skriver den. */
  navn?: string;
}

/** Kommende tømninger, som Vestfor giver dem. */
export type WasteDatesResponse = {
  /** Tømmedagen, ÅÅÅÅ-MM-DD med tid bagefter. */
  start: string;
  /** Affaldstypen, fx "Pap". */
  title: string;
  /** Font Awesome-navnet til typen. */
  icon: string | null;
}[];
