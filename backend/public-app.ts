import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { VestforAddress, WasteDate } from "../shared/types.ts";
import { withIcons } from "./app.ts";
import { buildIcs, eventsFromDates } from "./ics.ts";
import { createCache, createRateLimiter } from "./limits.ts";
import type { Vestfor } from "./vestfor.ts";

/**
 * Den offentlige instans (PUBLIC_MODE), der står på Tailscale Funnel. Den er bevidst en separat app:
 * ingen hjemmeadresse, ingen gemt adresse og ingen tilstand på serveren. Adressen følger med i hvert kald (`?id=`),
 * og ruterne til hjemmet findes slet ikke.
 */
export interface PublicAppOptions {
  vestfor: Vestfor;
  /** Den byggede side (dist/). */
  staticDir?: string | undefined;
  /** Antal proxyer foran appen (Tailscale = 1), så `req.ip` bliver den rigtige klient. 0 = brug forbindelsens egen adresse. */
  trustProxy?: number;
  /** Til test. */
  now?: () => number;
  limits?: Partial<PublicLimits>;
}

export interface PublicLimits {
  /** Kald til /api/search pr. IP pr. minut (autocomplete skriver mange). */
  searchPerIp: number;
  /** Kald til datoer og kalenderfil pr. IP pr. minut. */
  datesPerIp: number;
  /** Kald, der faktisk går videre til Vestfor, pr. minut for alle samlet. */
  vestforPerMinute: number;
  searchCacheMs: number;
  datesCacheMs: number;
}

export const DEFAULT_LIMITS: PublicLimits = {
  searchPerIp: 40,
  datesPerIp: 12,
  vestforPerMinute: 300,
  searchCacheMs: 24 * 3600_000,
  datesCacheMs: 6 * 3600_000,
};

const MINUTE_MS = 60_000;
const MAX_TERM_LENGTH = 100;
/** Vestfors adresse-id'er er korte tokens; alt andet afvises, før det når Vestfor. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterSec?: number,
  ) {
    super(message);
  }
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  next();
};

export const createPublicApp = ({ vestfor, staticDir, trustProxy = 0, now = Date.now, limits = {} }: PublicAppOptions): Express => {
  const cfg = { ...DEFAULT_LIMITS, ...limits };
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy);
  app.use(securityHeaders);

  const searchLimiter = createRateLimiter({ limit: cfg.searchPerIp, windowMs: MINUTE_MS, now });
  const datesLimiter = createRateLimiter({ limit: cfg.datesPerIp, windowMs: MINUTE_MS, now });
  const vestforLimiter = createRateLimiter({ limit: cfg.vestforPerMinute, windowMs: MINUTE_MS, now });
  const searchCache = createCache<VestforAddress[]>({ ttlMs: cfg.searchCacheMs, max: 2000, now });
  const datesCache = createCache<WasteDate[]>({ ttlMs: cfg.datesCacheMs, max: 2000, now });

  const perIp = (limiter: ReturnType<typeof createRateLimiter>) => (req: Request) => {
    const r = limiter.take(req.ip ?? "ukendt");
    if (!r.ok) throw new HttpError(429, `Der er sendt for mange forespørgsler. Vent ${r.retryAfterSec} sekunder, og prøv igen.`, r.retryAfterSec);
  };
  const limitSearch = perIp(searchLimiter);
  const limitDates = perIp(datesLimiter);

  /** Kun kald, der ikke kunne besvares fra cachen, tæller her. */
  const beforeVestfor = () => {
    const r = vestforLimiter.take("alle");
    if (!r.ok) throw new HttpError(503, "Mange bruger tjenesten lige nu. Vent et minut, og prøv igen.", r.retryAfterSec);
  };

  const idOf = (req: Request): string => {
    const id = req.query.id;
    if (typeof id !== "string" || !ID_PATTERN.test(id)) throw new HttpError(400, "Mangler en gyldig adresse. Vælg din adresse igen.");
    return id;
  };

  const datesFor = (id: string) =>
    datesCache.get(
      id,
      () => {
        beforeVestfor();
        return vestfor.fetchTommeDates(id);
      },
      (dates) => dates.length > 0,
    );

  /** Pakker en handler ind, så fejl bliver til en venlig besked uden adresser eller andre detaljer. */
  const route =
    (handler: (req: Request, res: Response) => Promise<void>) =>
    async (req: Request, res: Response) => {
      try {
        await handler(req, res);
      } catch (err) {
        const status = err instanceof HttpError ? err.status : 502;
        const message = err instanceof HttpError ? err.message : "Vestfor kan ikke nås lige nu. Prøv igen om lidt.";
        if (!(err instanceof HttpError)) console.error("Fejl fra Vestfor:", err instanceof Error ? err.message : "ukendt fejl");
        if (err instanceof HttpError && err.retryAfterSec) res.setHeader("Retry-After", String(err.retryAfterSec));
        res.status(status).type("application/json").json({ error: message });
      }
    };

  app.get("/health", (_req, res) => void res.json({ ok: true }));
  app.get("/api/mode", (_req, res) => void res.json({ public: true }));

  app.get(
    "/api/search",
    route(async (req, res) => {
      limitSearch(req);
      const raw = typeof req.query.term === "string" ? req.query.term : "";
      const term = raw.trim().replace(/\s+/g, " ").slice(0, MAX_TERM_LENGTH);
      res.setHeader("Cache-Control", "no-store");
      if (term.length < 2) return void res.json([]);
      res.json(
        await searchCache.get(term.toLowerCase(), () => {
          beforeVestfor();
          return vestfor.searchAddresses(term, 10);
        }),
      );
    }),
  );

  app.get(
    "/api/dates",
    route(async (req, res) => {
      limitDates(req);
      const id = idOf(req);
      res.setHeader("Cache-Control", "no-store");
      res.json(withIcons(await datesFor(id)));
    }),
  );

  app.get(
    "/api/calendar.ics",
    route(async (req, res) => {
      limitDates(req);
      const id = idOf(req);
      const ics = buildIcs(eventsFromDates(await datesFor(id)));
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="skraldetomning.ics"');
      res.send(ics);
    }),
  );

  if (staticDir) app.use(express.static(staticDir));
  app.use((_req, res) => void res.status(404).type("text/plain").send("Ikke fundet"));

  return app;
};
