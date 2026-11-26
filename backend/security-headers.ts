// KOPI af summer-hub/common/security-headers.ts – ret den i hub'en og kør `node scripts/sync-shared.mjs` dér.
// Sikkerhedshoveder til apps, der er åbne for internettet via Funnel (idé 82, Kewins ja 26. november 2026; fundet af den månedlige test udefra,
// docs/RUNBOOK.md "Test udefra"). Ligger som backend/security-headers.ts i hver af dem; ret her og kør `node scripts/sync-shared.mjs`.
import type { Express, NextFunction, Request, Response } from "express";

export interface SecurityHeaderOptions {
  /** Hele Content-Security-Policy; standard: alt fra siden selv, intet udefra, ingen indlejring. */
  csp?: string;
  /** Referrer-Policy; standard no-referrer. */
  referrer?: string;
}

/** Siden selv og intet andet; data: til billeder og skrifter i CSS (Sommerhimmel). */
export const DEFAULT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const securityHeaders = (opts: SecurityHeaderOptions = {}) => {
  const headers: [string, string][] = [
    ["Content-Security-Policy", opts.csp ?? DEFAULT_CSP],
    // Ét år; siderne findes kun over https (Funnel og tailnettet).
    ["Strict-Transport-Security", "max-age=31536000"],
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "DENY"],
    ["Referrer-Policy", opts.referrer ?? "no-referrer"],
    ["Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=(), usb=()"],
    ["Cross-Origin-Opener-Policy", "same-origin"],
    ["Cross-Origin-Resource-Policy", "same-origin"],
  ];
  return (_req: Request, res: Response, next: NextFunction) => {
    for (const [name, value] of headers) res.setHeader(name, value);
    next();
  };
};

/** Hovederne på alle svar, og ingen X-Powered-By. Kaldes først, før ruterne. */
export const installSecurityHeaders = (app: Express, opts: SecurityHeaderOptions = {}): void => {
  app.disable("x-powered-by");
  app.use(securityHeaders(opts));
};
