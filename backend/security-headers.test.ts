// KOPI af summer-hub/common/security-headers.test.ts – ret den i hub'en og kør `node scripts/sync-shared.mjs` dér.
import express from "express";
import { describe, expect, it } from "vitest";
import { DEFAULT_CSP, installSecurityHeaders } from "./security-headers.ts";

const headersOf = async (app: express.Express, path = "/") => {
  const server = app.listen(0);
  try {
    const { port } = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    return res.headers;
  } finally {
    server.close();
  }
};

describe("installSecurityHeaders", () => {
  it("sætter hovederne på alle svar, også fejl, og fjerner X-Powered-By", async () => {
    const app = express();
    installSecurityHeaders(app);
    app.get("/", (_req, res) => void res.send("ok"));
    for (const path of ["/", "/findes-ikke"]) {
      const h = await headersOf(app, path);
      // Express' egen 404-side sætter den endnu strammere default-src 'none'.
      expect(h.get("content-security-policy")).toBe(path === "/" ? DEFAULT_CSP : "default-src 'none'");
      expect(h.get("strict-transport-security")).toBe("max-age=31536000");
      expect(h.get("x-content-type-options")).toBe("nosniff");
      expect(h.get("cross-origin-resource-policy")).toBe("same-origin");
      expect(h.get("x-powered-by")).toBeNull();
    }
  });

  it("tager appens egen CSP", async () => {
    const app = express();
    installSecurityHeaders(app, { csp: "default-src 'none'" });
    app.get("/", (_req, res) => void res.send("ok"));
    expect((await headersOf(app)).get("content-security-policy")).toBe("default-src 'none'");
  });
});
