import type { SavedAddress, VestforAddress, WasteDate } from "../shared/types.ts";

export const VESTFOR_BASE = "https://selvbetjening.vestfor.dk";
const FETCH_TIMEOUT_MS = 10000;
const MAX_SESSIONS = 500;
const USER_AGENT = "Mozilla/5.0 (compatible; Skraldetomning/1.0)";

type Cookies = Record<string, string>;

export interface VestforOptions {
  /** Gør det let at give et falsk netværk i tests. */
  fetchFn?: typeof fetch;
  base?: string;
  timeoutMs?: number;
  now?: () => Date;
}

const cookieString = (cookies: Cookies): string =>
  Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

/** Klienten til Vestfors selvbetjening: sessioner pr. adresse, opslag af adresser og tømmedatoer. */
export const createVestfor = ({ fetchFn = fetch, base = VESTFOR_BASE, timeoutMs = FETCH_TIMEOUT_MS, now = () => new Date() }: VestforOptions = {}) => {
  // Én Vestfor-session pr. adresse: Vestfor husker den valgte adresse i sessionen, så hjemmet og den
  // adresse, man kigger på, må ikke dele cookies.
  const sessions = new Map<string, Cookies>();
  let home: SavedAddress | null = null; // fundet hos Vestfor, når HOME_ADDRESS er sat

  /**
   * fetch() with a hard timeout, so a hung Vestfor request can't leave the
   * app spinning forever. Throws a friendly error on timeout instead of the
   * raw AbortError.
   */
  const fetchWithTimeout = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchFn(url, { ...options, signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Vestfor svarede ikke inden for ${timeoutMs / 1000} sekunder`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  /** Follow redirects by hand so Set-Cookie headers from every hop are collected. */
  const fetchFollowingRedirects = async (startUrl: string): Promise<Cookies> => {
    const cookies: Cookies = {};
    let currentUrl = startUrl;

    for (let hop = 0; hop < 10; hop++) {
      const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,*/*" };
      if (Object.keys(cookies).length) headers.Cookie = cookieString(cookies);
      const resp = await fetchWithTimeout(currentUrl, { redirect: "manual", headers });

      // Collect any Set-Cookie headers from this hop
      for (const c of resp.headers.getSetCookie()) {
        const [nameValue = ""] = c.split(";");
        const eqIdx = nameValue.indexOf("=");
        if (eqIdx > 0) cookies[nameValue.slice(0, eqIdx).trim()] = nameValue.slice(eqIdx + 1).trim();
      }

      if (resp.status >= 300 && resp.status < 400) {
        await resp.body?.cancel();
        const location = resp.headers.get("location");
        if (!location) break;
        currentUrl = location.startsWith("http") ? location : new URL(location, base).href;
      } else {
        await resp.body?.cancel();
        return cookies;
      }
    }

    throw new Error("For mange omdirigeringer fra Vestfor");
  };

  /** Visit MinSide for the given address in a fresh session and remember its cookies. */
  const establishSession = async (addressId: string): Promise<Cookies> => {
    const cookies = await fetchFollowingRedirects(`${base}/Home/MinSide?address-selected-id=${encodeURIComponent(addressId)}`);
    sessions.delete(addressId);
    sessions.set(addressId, cookies);
    // Loft, så en offentlig instans ikke samler sessioner for evigt (de ældste smides ud og oprettes igen ved behov).
    for (const oldest of sessions.keys()) {
      if (sessions.size <= MAX_SESSIONS) break;
      sessions.delete(oldest);
    }
    return cookies;
  };

  /**
   * Fetch tømmedatoer for the next 12 months.
   * Vestfor svarer med en tom liste ([]), ikke en fejl, når sessionen er udløbet. Derfor prøver vi
   * igen med en ny session, både ved ugyldigt svar og ved en tom liste fra en genbrugt session.
   */
  const fetchTommeDates = async (addressId: string, retry = true): Promise<WasteDate[]> => {
    const reused = sessions.has(addressId);
    const cookies = sessions.get(addressId) ?? (await establishSession(addressId));
    const today = now();
    const future = new Date(today);
    future.setFullYear(future.getFullYear() + 1);

    const start = today.toISOString().slice(0, 10);
    const end = future.toISOString().slice(0, 10);

    const resp = await fetchWithTimeout(`${base}/Adresse/ToemmeDates?start=${start}&end=${end}`, {
      headers: {
        Cookie: cookieString(cookies),
        Referer: `${base}/Home/MinSide?address-selected-id=${addressId}`,
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": USER_AGENT,
      },
    });

    const text = await resp.text();

    try {
      const data: unknown = JSON.parse(text);
      if (Array.isArray(data) && (data.length > 0 || !reused)) return data as WasteDate[];
      // Fejl eller tom liste fra en gammel session – fald igennem til nyt forsøg
    } catch {
      // Non-JSON response (usually HTML redirect to login) – retry
    }

    if (retry) {
      await establishSession(addressId);
      return fetchTommeDates(addressId, false);
    }

    throw new Error("Kunne ikke hente data fra Vestfor (ugyldigt svar)");
  };

  const searchAddresses = async (term: string, numberOfResults: number): Promise<VestforAddress[]> => {
    const r = await fetchWithTimeout(`${base}/Adresse/AddressByName?term=${encodeURIComponent(term)}&numberOfResults=${numberOfResults}`, {
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    });
    return (await r.json()) as VestforAddress[];
  };

  /** Slår hjemmeadressen op hos Vestfor én gang. null, hvis den ikke er sat. */
  const resolveHome = async (homeAddress: string): Promise<SavedAddress | null> => {
    if (!homeAddress) return null;
    if (home) return home;
    const list = await searchAddresses(homeAddress, 10);
    const norm = (s: unknown) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
    const hit = list.find((a) => norm(a.FuldtVejnavn) === norm(homeAddress)) ?? (list.length === 1 ? list[0] : undefined);
    if (!hit) throw new Error(`Hjemmeadressen "${homeAddress}" blev ikke fundet hos Vestfor`);
    home = { id: hit.Id, navn: hit.FuldtVejnavn, ...(hit.Postnr ? { postnr: hit.Postnr } : {}) };
    return home;
  };

  return { establishSession, fetchTommeDates, searchAddresses, resolveHome };
};

export type Vestfor = ReturnType<typeof createVestfor>;
