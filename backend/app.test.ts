import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import type { Vestfor } from "./vestfor.ts";

const DATES = [
  { start: "2026-10-13T00:00:00", title: "Pap" },
  { start: "2026-10-14T00:00:00", title: "Haveaffald" },
];

const fakeVestfor = (): Vestfor => ({
  establishSession: async () => ({}),
  fetchTommeDates: async () => DATES,
  searchAddresses: async () => [{ Id: "1", FuldtVejnavn: "Testvej 1, 2625 Vallensbæk", Postnr: "2625" }],
  resolveHome: async (home: string) => (home ? { id: "h1", navn: home } : null),
});

let dir: string;
let server: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;
const start = (homeAddress = "") => {
  server = createApp({ vestfor: fakeVestfor(), dataDir: dir, homeAddress }).listen(0);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "waste-"));
});
afterEach(() => {
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("API", () => {
  it("svarer på /health", async () => {
    expect(await (await fetch(`${start()}/health`)).json()).toEqual({ ok: true });
  });

  it("siger, at den private instans husker adressen selv", async () => {
    expect(await (await fetch(`${start()}/api/mode`)).json()).toEqual({ public: false });
  });

  it("uden adresse er der intet at vise", async () => {
    const base = start();
    expect((await fetch(`${base}/api/dates`)).status).toBe(400);
    expect(await (await fetch(`${base}/api/home`)).json()).toBeNull();
    expect((await fetch(`${base}/api/home/dates`)).status).toBe(404);
  });

  it("en valgt adresse gemmes og bruges til datoer med ikon og til kalenderen", async () => {
    const base = start();
    const set = await fetch(`${base}/api/set-address`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "1", navn: "Testvej 1", postnr: "2625" }),
    });
    expect(set.status).toBe(200);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "saved-address.json"), "utf8"))).toEqual({ id: "1", navn: "Testvej 1", postnr: "2625" });
    expect(await (await fetch(`${base}/api/saved-address`)).json()).toEqual({ id: "1", navn: "Testvej 1", postnr: "2625" });

    const dates = (await (await fetch(`${base}/api/dates`)).json()) as { title: string; icon: string }[];
    expect(dates.map((d) => [d.title, d.icon])).toEqual([
      ["Pap", "📦"],
      ["Haveaffald", "🌿"],
    ]);

    const ics = await fetch(`${base}/api/calendar.ics`);
    expect(ics.headers.get("content-type")).toContain("text/calendar");
    expect(await ics.text()).toContain("SUMMARY:📦 Pap");
  });

  it("afviser en adresse uden id", async () => {
    const base = start();
    const res = await fetch(`${base}/api/set-address`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(res.status).toBe(400);
  });

  it("hjemmeadressen bruges, når der ikke er gemt en anden, og kan altid hentes for sig", async () => {
    const base = start("Eksempelvej 130, 2625 Vallensbæk");
    expect(await (await fetch(`${base}/api/saved-address`)).json()).toEqual({ id: "h1", navn: "Eksempelvej 130, 2625 Vallensbæk" });
    expect(((await (await fetch(`${base}/api/home/dates`)).json()) as unknown[]).length).toBe(2);
    expect(((await (await fetch(`${base}/api/dates`)).json()) as unknown[]).length).toBe(2);
  });

  it("søgning kræver en søgetekst", async () => {
    const base = start();
    expect(await (await fetch(`${base}/api/search`)).json()).toEqual([]);
    expect(((await (await fetch(`${base}/api/search?term=test`)).json()) as unknown[]).length).toBe(1);
  });
});
