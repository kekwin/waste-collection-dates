import { describe, expect, it } from "vitest";
import { createVestfor } from "./vestfor.ts";

const BASE = "https://vestfor.test";

/** Falsk Vestfor: MinSide omdirigerer og sætter cookies i to trin; ToemmeDates svarer med `datesFor(kald)`. */
const fakeNetwork = (datesFor: (call: number) => string) => {
  const calls: { url: string; cookie: string | null }[] = [];
  let sessions = 0;
  let dateCalls = 0;
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const cookie = new Headers(init?.headers).get("cookie");
    calls.push({ url, cookie });
    if (url.startsWith(`${BASE}/Home/MinSide?`)) {
      sessions++;
      const h = new Headers({ location: "/Home/MinSide2" });
      h.append("set-cookie", `sid=${sessions}; path=/; HttpOnly`);
      return new Response(null, { status: 302, headers: h });
    }
    if (url === `${BASE}/Home/MinSide2`) {
      const h = new Headers();
      h.append("set-cookie", "x=1; path=/");
      return new Response("<html></html>", { status: 200, headers: h });
    }
    if (url.startsWith(`${BASE}/Adresse/ToemmeDates`)) return new Response(datesFor(++dateCalls), { status: 200 });
    throw new Error(`uventet kald: ${url}`);
  }) as typeof fetch;
  return { fetchFn, calls, sessionsMade: () => sessions };
};

const DATES = JSON.stringify([{ start: "2026-10-13T00:00:00", title: "Pap" }]);
const options = (fetchFn: typeof fetch) => ({ fetchFn, base: BASE, now: () => new Date("2026-10-07T12:00:00Z") });

describe("fetchTommeDates", () => {
  it("samler cookies fra alle omdirigeringer og beder om de næste 12 måneder", async () => {
    const net = fakeNetwork(() => DATES);
    const dates = await createVestfor(options(net.fetchFn)).fetchTommeDates("a1");
    expect(dates).toHaveLength(1);
    const call = net.calls.find((c) => c.url.includes("ToemmeDates"));
    expect(call?.cookie).toBe("sid=1; x=1");
    expect(call?.url).toContain("start=2026-10-07&end=2027-10-07");
  });

  it("genbruger sessionen, men henter en ny, når Vestfor svarer med en tom liste fra en udløbet session", async () => {
    const net = fakeNetwork((n) => (n === 2 ? "[]" : DATES));
    const vestfor = createVestfor(options(net.fetchFn));
    await vestfor.fetchTommeDates("a1"); // opretter session 1
    expect(net.sessionsMade()).toBe(1);
    expect(await vestfor.fetchTommeDates("a1")).toHaveLength(1); // tom liste fra den gamle session -> ny session
    expect(net.sessionsMade()).toBe(2);
  });

  it("en tom liste fra en ny session er et gyldigt svar", async () => {
    const net = fakeNetwork(() => "[]");
    expect(await createVestfor(options(net.fetchFn)).fetchTommeDates("a1")).toEqual([]);
    expect(net.sessionsMade()).toBe(1);
  });

  it("opgiver efter ét nyt forsøg, hvis svaret ikke er JSON", async () => {
    const net = fakeNetwork(() => "<html>log ind</html>");
    await expect(createVestfor(options(net.fetchFn)).fetchTommeDates("a1")).rejects.toThrow("ugyldigt svar");
    expect(net.sessionsMade()).toBe(2);
  });
});

describe("resolveHome", () => {
  const searchReturning = (list: unknown[]) => (async () => new Response(JSON.stringify(list), { status: 200 })) as unknown as typeof fetch;

  it("er null uden hjemmeadresse", async () => {
    expect(await createVestfor(options(searchReturning([]))).resolveHome("")).toBeNull();
  });

  it("finder adressen, som Vestfor skriver den, og husker den", async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return new Response(
        JSON.stringify([
          { Id: "9", FuldtVejnavn: "Eksempelvej 1, 2625 Vallensbæk", Postnr: "2625" },
          { Id: "8", FuldtVejnavn: "Eksempelvej 10, 2625 Vallensbæk" },
        ]),
      );
    }) as unknown as typeof fetch;
    const vestfor = createVestfor(options(fetchFn));
    expect(await vestfor.resolveHome("eksempelvej  1, 2625 Vallensbæk")).toEqual({ id: "9", navn: "Eksempelvej 1, 2625 Vallensbæk", postnr: "2625" });
    await vestfor.resolveHome("eksempelvej 1, 2625 Vallensbæk");
    expect(calls).toBe(1);
  });

  it("fejler, når adressen ikke findes", async () => {
    await expect(createVestfor(options(searchReturning([]))).resolveHome("Ukendt vej 1")).rejects.toThrow("blev ikke fundet");
  });
});
