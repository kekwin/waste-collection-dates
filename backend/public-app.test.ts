import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCache, createRateLimiter } from "./limits.ts";
import { createPublicApp, type PublicLimits } from "./public-app.ts";
import type { Vestfor } from "./vestfor.ts";

const DATES = [
  { start: "2026-10-13T00:00:00", title: "Pap" },
  { start: "2026-10-14T00:00:00", title: "Haveaffald" },
];

const makeVestfor = (overrides: Partial<Vestfor> = {}) => {
  const vestfor = {
    establishSession: vi.fn(async () => ({})),
    fetchTommeDates: vi.fn(async () => DATES),
    searchAddresses: vi.fn(async () => [{ Id: "1", FuldtVejnavn: "Testvej 1, 2625 Vallensbæk", Postnr: "2625" }]),
    resolveHome: vi.fn(async () => null),
    ...overrides,
  };
  return vestfor satisfies Vestfor;
};

let server: ReturnType<ReturnType<typeof createPublicApp>["listen"]> | undefined;
let staticDir: string;
const start = (vestfor: Vestfor, extra: { trustProxy?: number; limits?: Partial<PublicLimits> } = {}) => {
  server = createPublicApp({ vestfor, staticDir, ...extra }).listen(0);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

beforeEach(() => {
  staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "waste-public-"));
  fs.writeFileSync(path.join(staticDir, "index.html"), "<p>forside</p>");
});
afterEach(() => {
  server?.close();
  fs.rmSync(staticDir, { recursive: true, force: true });
});

describe("offentlig instans", () => {
  it("har ingen private ruter", async () => {
    const base = start(makeVestfor());
    for (const url of ["/api/home", "/api/home/dates", "/api/saved-address"]) {
      expect((await fetch(`${base}${url}`)).status, url).toBe(404);
    }
    const set = await fetch(`${base}/api/set-address`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(set.status).toBe(404);
    expect(await (await fetch(`${base}/api/mode`)).json()).toEqual({ public: true });
  });

  it("henter datoer og kalenderfil for adressen i kaldet og gemmer ingenting", async () => {
    const vestfor = makeVestfor();
    const base = start(vestfor);
    const dates = (await (await fetch(`${base}/api/dates?id=abc-123`)).json()) as { title: string; icon: string }[];
    expect(dates.map((d) => [d.title, d.icon])).toEqual([
      ["Pap", "📦"],
      ["Haveaffald", "🌿"],
    ]);
    const ics = await fetch(`${base}/api/calendar.ics?id=abc-123`);
    expect(ics.headers.get("content-type")).toContain("text/calendar");
    expect(await ics.text()).toContain("SUMMARY:📦 Pap");
    expect(vestfor.fetchTommeDates).toHaveBeenCalledTimes(1); // den anden gang kom fra cachen
    expect(vestfor.fetchTommeDates).toHaveBeenCalledWith("abc-123");
  });

  it("afviser manglende eller mistænkelige adresse-id'er, før Vestfor høres", async () => {
    const vestfor = makeVestfor();
    const base = start(vestfor);
    expect((await fetch(`${base}/api/dates`)).status).toBe(400);
    expect((await fetch(`${base}/api/dates?id=${encodeURIComponent("../x?y=1")}`)).status).toBe(400);
    expect((await fetch(`${base}/api/calendar.ics?id=${"a".repeat(65)}`)).status).toBe(400);
    expect(vestfor.fetchTommeDates).not.toHaveBeenCalled();
  });

  it("søger adresser, korter lange søgninger ned og cacher dem", async () => {
    const vestfor = makeVestfor();
    const base = start(vestfor);
    expect(await (await fetch(`${base}/api/search?term=a`)).json()).toEqual([]);
    expect(vestfor.searchAddresses).not.toHaveBeenCalled();

    await fetch(`${base}/api/search?term=Testvej%201`);
    await fetch(`${base}/api/search?term=testvej%20%201`); // samme søgning med anden skrivemåde
    expect(vestfor.searchAddresses).toHaveBeenCalledTimes(1);
    expect(vestfor.searchAddresses).toHaveBeenCalledWith("Testvej 1", 10);

    await fetch(`${base}/api/search?term=${"x".repeat(500)}`);
    expect(vestfor.searchAddresses).toHaveBeenLastCalledWith("x".repeat(100), 10);
  });

  it("deler ét kald mellem samtidige opslag", async () => {
    let release: (() => void) | undefined;
    const vestfor = makeVestfor({
      fetchTommeDates: vi.fn(() => new Promise<typeof DATES>((resolve) => (release = () => resolve(DATES)))),
    });
    const base = start(vestfor);
    const calls = [fetch(`${base}/api/dates?id=ens`), fetch(`${base}/api/dates?id=ens`), fetch(`${base}/api/dates?id=ens`)];
    await vi.waitFor(() => expect(release).toBeDefined());
    release?.();
    const responses = await Promise.all(calls);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(vestfor.fetchTommeDates).toHaveBeenCalledTimes(1);
  });

  it("giver dansk fejl uden detaljer, når Vestfor fejler, og cacher ikke fejlen", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const vestfor = makeVestfor({ fetchTommeDates: vi.fn().mockRejectedValueOnce(new Error("hemmelig intern fejl")).mockResolvedValue(DATES) });
    const base = start(vestfor);
    const bad = await fetch(`${base}/api/dates?id=x1`);
    expect(bad.status).toBe(502);
    expect(JSON.stringify(await bad.json())).not.toContain("hemmelig");
    expect((await fetch(`${base}/api/dates?id=x1`)).status).toBe(200);
    error.mockRestore();
  });

  it("begrænser forsøg pr. IP med en dansk besked og Retry-After", async () => {
    const base = start(makeVestfor(), { limits: { datesPerIp: 3 } });
    for (let i = 0; i < 3; i++) expect((await fetch(`${base}/api/dates?id=x${i}`)).status).toBe(200);
    const blocked = await fetch(`${base}/api/dates?id=x9`);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await blocked.json()) as { error: string }).error).toContain("for mange forespørgsler");
    // søgning har sin egen grænse
    expect((await fetch(`${base}/api/search?term=Testvej`)).status).toBe(200);
  });

  it("holder styr på klienten via X-Forwarded-For, når proxyen er betroet", async () => {
    const base = start(makeVestfor(), { trustProxy: 1, limits: { datesPerIp: 1 } });
    const ask = (ip: string) => fetch(`${base}/api/dates?id=ens`, { headers: { "X-Forwarded-For": ip } });
    expect((await ask("203.0.113.1")).status).toBe(200);
    expect((await ask("203.0.113.1")).status).toBe(429);
    expect((await ask("203.0.113.2")).status).toBe(200); // en anden nabo er upåvirket
  });

  it("ignorerer X-Forwarded-For, når ingen proxy er betroet (så den ikke kan forfalskes)", async () => {
    const base = start(makeVestfor(), { trustProxy: 0, limits: { datesPerIp: 1 } });
    const ask = (ip: string) => fetch(`${base}/api/dates?id=ens`, { headers: { "X-Forwarded-For": ip } });
    expect((await ask("203.0.113.1")).status).toBe(200);
    expect((await ask("203.0.113.2")).status).toBe(429);
  });

  it("har en samlet grænse for kald til Vestfor, men ikke for cachede svar", async () => {
    const base = start(makeVestfor(), { limits: { vestforPerMinute: 2, datesPerIp: 100 } });
    expect((await fetch(`${base}/api/dates?id=a1`)).status).toBe(200);
    expect((await fetch(`${base}/api/dates?id=a1`)).status).toBe(200); // cache, tæller ikke
    expect((await fetch(`${base}/api/dates?id=a2`)).status).toBe(200);
    const full = await fetch(`${base}/api/dates?id=a3`);
    expect(full.status).toBe(503);
    expect(((await full.json()) as { error: string }).error).toContain("Mange bruger tjenesten");
    expect((await fetch(`${base}/api/dates?id=a1`)).status).toBe(200);
  });

  it("sætter sikkerhedshoveder og leverer siden", async () => {
    const base = start(makeVestfor());
    const res = await fetch(`${base}/index.html`);
    expect(await res.text()).toContain("forside");
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-powered-by")).toBeNull();
    expect((await fetch(`${base}/findes-ikke`)).status).toBe(404);
  });

  it("tager ikke imod POST", async () => {
    const base = start(makeVestfor());
    expect((await fetch(`${base}/api/search?term=ab`, { method: "POST", body: "x".repeat(100_000) })).status).toBe(404);
  });
});

describe("limits", () => {
  it("rate limiteren nulstiller efter vinduet og har et loft på antal nøgler", () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, maxKeys: 3, now: () => t });
    expect([limiter.take("a").ok, limiter.take("a").ok, limiter.take("a").ok]).toEqual([true, true, false]);
    t = 1001;
    expect(limiter.take("a").ok).toBe(true);
    for (const key of ["b", "c", "d", "e"]) limiter.take(key); // må ikke vokse ud over loftet
    expect(limiter.take("e").ok).toBe(true);
  });

  it("cachen udløber og har et loft", async () => {
    let t = 0;
    const cache = createCache<number>({ ttlMs: 1000, max: 2, now: () => t });
    const load = vi.fn(async () => 1);
    await cache.get("a", load);
    await cache.get("a", load);
    expect(load).toHaveBeenCalledTimes(1);
    t = 1001;
    await cache.get("a", load);
    expect(load).toHaveBeenCalledTimes(2);
    await cache.get("b", load);
    await cache.get("c", load); // "a" smides ud
    await cache.get("a", load);
    expect(load).toHaveBeenCalledTimes(5);
  });

  it("cachen gemmer ikke svar, der ikke må gemmes", async () => {
    const cache = createCache<number[]>({ ttlMs: 1000, max: 2 });
    const load = vi.fn(async () => []);
    await cache.get("a", load, (v) => v.length > 0);
    await cache.get("a", load, (v) => v.length > 0);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
