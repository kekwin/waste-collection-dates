// KOPI af summer-hub/contracts/cross-site-guard.ts – ret den i hub'en og kør `node scripts/sync-shared.mjs` dér.
// Værn mod kald fra fremmede hjemmesider (CSRF), fælles for apps'ene. Teamets første punkt (Kewin, 23. november 2026; PLAN-SERVER
// trin 3.4). Ejes af summer-hub/contracts; kopieres af `node scripts/sync-shared.mjs`. Ingen afhængigheder, heller ikke Express.
//
// En ondsindet side, der kender en apps adresse, kan få Kewins browser til at sende POST, PUT eller DELETE til appen. Værnet afviser
// ændrende kald, som browseren selv siger kommer fra en anden side (samme regel som Fotosortering):
//   - GET, HEAD og OPTIONS går altid igennem; de må aldrig ændre noget.
//   - `Sec-Fetch-Site: same-origin` eller `none` (siden selv, eller en adresse, der er tastet ind): igennem.
//   - `Sec-Fetch-Site: same-site` eller `cross-site`: kun, hvis `Origin` står i `allowedOrigins` (fx forsidens besøgstælling fra apps'ene).
//   - Uden `Sec-Fetch-Site` (ældre browsere og alt, der ikke er en browser: curl, MCP, andre apps, iOS-genveje): afvist, hvis `Origin` er sat
//     og hverken er appens egen (samme vært som `Host`) eller står i `allowedOrigins`. Kald uden `Origin` kommer ikke fra en hjemmeside.
//
// Brug (Express), før ruterne:  app.use(crossSiteGuard({ allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS) }));

export type HeaderValue = string | string[] | undefined;

export interface CrossSiteGuardOptions {
  /** Andre sider, der må sende ændrende kald, fx "https://summer-projects.tailcc94cc.ts.net". */
  allowedOrigins?: readonly string[];
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const first = (value: HeaderValue): string | undefined => (Array.isArray(value) ? value[0] : value);

/** "https://Eksempel.dk/" → "https://eksempel.dk". */
const normalizeOrigin = (origin: string): string => origin.trim().replace(/\/+$/, "").toLowerCase();

/** Kommasepareret liste (fx fra en miljøvariabel) til origins; tom eller ikke sat giver en tom liste. */
export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? "").split(/[\s,]+/).map(normalizeOrigin).filter((o) => o !== "");
}

/** Sand, hvis kaldet skal afvises. `headers` er Node's (navne med små bogstaver). */
export function isCrossSiteBlocked(method: string, headers: Readonly<Record<string, HeaderValue>>, options: CrossSiteGuardOptions = {}): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  const allowed = new Set((options.allowedOrigins ?? []).map(normalizeOrigin));
  const site = first(headers["sec-fetch-site"])?.toLowerCase();
  const origin = first(headers["origin"]);
  if (site === "same-origin" || site === "none") return false;
  if (site !== undefined) return origin === undefined || !allowed.has(normalizeOrigin(origin));
  if (origin === undefined) return false;
  if (allowed.has(normalizeOrigin(origin))) return false;
  const host = first(headers["x-forwarded-host"]) ?? first(headers["host"]);
  try {
    return host === undefined || new URL(origin).host !== host.toLowerCase();
  } catch {
    return true; // fx "null" fra en sandkasse-side
  }
}

interface GuardRequest {
  method: string;
  headers: Readonly<Record<string, HeaderValue>>;
}
interface GuardResponse {
  status(code: number): { json(body: unknown): unknown };
}

/** Express-mellemled: 403 med en dansk fejl, hvis kaldet kommer fra en anden hjemmeside. */
export function crossSiteGuard(options: CrossSiteGuardOptions = {}) {
  return (req: GuardRequest, res: GuardResponse, next: () => void): void => {
    if (isCrossSiteBlocked(req.method, req.headers, options)) {
      res.status(403).json({ error: "Kald fra en anden hjemmeside er afvist" });
      return;
    }
    next();
  };
}
