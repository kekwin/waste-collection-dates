import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import type { SavedAddress, WasteDate, WasteDateWithIcon } from "../shared/types.ts";
import { wasteType } from "../shared/waste-types.ts";
import { buildIcs, eventsFromDates } from "./ics.ts";
import type { Vestfor } from "./vestfor.ts";

export interface AppOptions {
  vestfor: Vestfor;
  /** Her ligger saved-address.json. */
  dataDir: string;
  /** Den byggede side (dist/). Uden den leverer appen kun API'et. */
  staticDir?: string | undefined;
  /** HOME_ADDRESS, fx "Eksempelvej 130, 2625 Vallensbæk", præcis som Vestfor skriver den. */
  homeAddress?: string;
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Tømmedatoer med ikonet pr. affaldstype, så hub'ens forside viser de samme ikoner som appen. */
export const withIcons = (dates: WasteDate[]): WasteDateWithIcon[] => dates.map((ev) => ({ ...ev, icon: wasteType(ev.title).icon }));

export const createApp = ({ vestfor, dataDir, staticDir, homeAddress = "" }: AppOptions): Express => {
  const app = express();
  const savedAddressFile = path.join(dataDir, "saved-address.json");
  const readSaved = (): SavedAddress | null =>
    fs.existsSync(savedAddressFile) ? (JSON.parse(fs.readFileSync(savedAddressFile, "utf8")) as SavedAddress) : null;

  // Hjemmeadressen ændres ikke, når man slår andre adresser op, og det er den, hub'ens forside viser.
  const resolveHome = () => vestfor.resolveHome(homeAddress.trim());

  let currentAddressId: string | null = null; // den adresse, appen viser (saved-address.json)

  /** Den viste adresse: den gemte, ellers hjemmet. */
  const ensureAddressLoaded = async () => {
    if (currentAddressId) return;
    const saved = readSaved();
    currentAddressId = saved ? saved.id : ((await resolveHome().catch(() => null))?.id ?? null);
  };

  app.get("/health", (_req, res) => void res.json({ ok: true }));
  app.get("/api/mode", (_req, res) => void res.json({ public: false })); // siderne spørger, om adressen skal følge med i hvert kald
  app.use(express.json());
  if (staticDir) app.use(express.static(staticDir));
  fs.mkdirSync(dataDir, { recursive: true });

  // GET /api/saved-address
  app.get("/api/saved-address", async (_req, res) => {
    res.json(readSaved() ?? (await resolveHome().catch(() => null)));
  });

  // GET /api/home – hjemmeadressen fra HOME_ADDRESS (null, hvis den ikke er sat)
  app.get("/api/home", async (_req, res) => {
    try {
      res.json(await resolveHome());
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  // GET /api/home/dates – tømmedatoer for hjemmet, uanset hvilken adresse appen viser
  app.get("/api/home/dates", async (_req, res) => {
    try {
      const h = await resolveHome();
      if (!h) return void res.status(404).json({ error: "HOME_ADDRESS er ikke sat" });
      res.json(withIcons(await vestfor.fetchTommeDates(h.id)));
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  // GET /api/search?term=…
  app.get("/api/search", async (req, res) => {
    const term = typeof req.query.term === "string" ? req.query.term.trim() : "";
    if (!term) return void res.json([]);
    try {
      res.json(await vestfor.searchAddresses(term, 100));
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  // POST /api/set-address  { id, navn, postnr }
  app.post("/api/set-address", async (req, res) => {
    const { id, navn, postnr } = (req.body ?? {}) as Partial<SavedAddress>;
    if (!id) return void res.status(400).json({ error: "Mangler adresse-ID" });

    try {
      await vestfor.establishSession(id);
      currentAddressId = id;
      fs.writeFileSync(savedAddressFile, JSON.stringify({ id, navn, postnr }, null, 2));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  // GET /api/dates
  app.get("/api/dates", async (_req, res) => {
    await ensureAddressLoaded();
    if (!currentAddressId) return void res.status(400).json({ error: "Ingen adresse valgt" });

    try {
      res.json(withIcons(await vestfor.fetchTommeDates(currentAddressId)));
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  // GET /api/calendar.ics
  app.get("/api/calendar.ics", async (_req, res) => {
    await ensureAddressLoaded();
    if (!currentAddressId) return void res.status(400).send("Ingen adresse valgt");

    try {
      const ics = buildIcs(eventsFromDates(await vestfor.fetchTommeDates(currentAddressId)));
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="skraldetomning.ics"');
      res.send(ics);
    } catch (err) {
      res.status(500).send("Fejl: " + errorMessage(err));
    }
  });

  return app;
};
