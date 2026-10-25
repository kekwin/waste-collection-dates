import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { createPublicApp } from "./public-app.ts";
import { createVestfor } from "./vestfor.ts";

const port = Number(process.env.PORT) || 3100;
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const staticDir = process.env.STATIC_DIR || fileURLToPath(new URL("../dist/", import.meta.url));
const homeAddress = process.env.HOME_ADDRESS ?? "";
const isPublic = ["1", "true"].includes((process.env.PUBLIC_MODE ?? "").toLowerCase());

if (isPublic) {
  // Den offentlige instans må aldrig kende husets adresse, og den gemmer ingenting.
  if (homeAddress.trim()) {
    console.error("PUBLIC_MODE må ikke kombineres med HOME_ADDRESS. Afbryder.");
    process.exit(1);
  }
  createPublicApp({ vestfor: createVestfor(), staticDir, trustProxy: Number(process.env.TRUST_PROXY) || 0 }).listen(port, () => {
    console.log(`
  Skraldetømningsapp (offentlig, ingen data gemmes) kører på port ${port}
`);
  });
} else {
  createApp({ vestfor: createVestfor(), dataDir, staticDir, homeAddress }).listen(port, () => {
    console.log(`
  Skraldetømningsapp kører på  http://localhost:${port}
`);
  });
}
