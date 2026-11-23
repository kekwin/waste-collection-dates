# Plan: nyt navn til `skralde-toemnings-app`

**Status: udført 6. oktober 2026** (repoet hedder `waste-collection-dates`). Teksten nedenfor er den oprindelige plan, og "Åbne valg" er afgjort.

Skrevet 5. oktober 2026. Del af "engelske navne på alle apps"; start med at læse opskriften og faldgruberne i
`familien-sommer-hub/docs/PLAN-engelske-navne.md`. Første omdøbning, `enyaq-app` → `home-energy`, er udført og
beskrevet i `home-energy/docs/PLAN-omdoebning.md`.

## Forslag

Repo, mappe, pakke og tjeneste i hub'en: **`waste-collection`** (alternativ: `bin-collection`). Appens
overskrift "Skraldetømning" og Tailscale-navnet `skralde` ændres ikke. Kewin vælger navnet.

## Hvad der nævner det gamle navn

| Sted | Hvad | Handling |
| --- | --- | --- |
| GitHub | `kekwin/skralde-toemnings-app` | `gh repo rename waste-collection --repo kekwin/skralde-toemnings-app` |
| Dette repo | `package.json` + `package-lock.json` (`skraldetomningsapp`), `Dockerfile`, `README.md`, `public/index.html`, `public/print.html`, `server.js`, `.vscode/launch.json` | Ret navn og tekst; hæv versionen (nu v1.4.0) og tag |
| Hub `compose.yaml` | tjenesten `skralde`, `build: https://github.com/kekwin/skralde-toemnings-app.git#v1.4.0`, image `familien-sommer-hub/skralde`, `skralde-ts`, `depends_on`, volumen `skralde-data` | Tjeneste → `waste-collection`; ny build-URL og tag; image følger tjenesten; **volumen og `skralde-ts`/`TS_HOSTNAME: skralde` beholdes** |
| Hub `tailscale/skralde.json` | proxy til `http://skralde:3000` | Ret værtsnavnet |
| Hub `forside/apps.json` | `"internal": "http://skralde:3000"`, `id: skralde` | Ret værtsnavnet; behold `id` |
| Hub `README.md`, `docs/RUNBOOK.md`, `docs/ARKITEKTUR.md` | tabelrække, mermaid-diagram (`R2[skralde-toemnings-app]`), kommandoer | Ret |
| Hub `scripts/restore.sh` | eksempel med `skralde-data` | Uændret (volumenavn) |
| Hub `.env` / `.env.example` | `SKRALDE_HOME_ADDRESS` | Uændret, medmindre Kewin vil have den engelsk (så ret begge filer og `compose.yaml`) |
| `forside` repo | `config/apps.json`, `test/overview.test.mjs`, `README.md`, `CLAUDE.md`, `src/overview.mjs` | Ret værtsnavnet i eksempel og tests |
| Lokal mappe | `C:\Claude-workspace\skralde-toemnings-app` | Omdøb til sidst |
| Dokumenter | "Kewins projekter", "Hjemmebyggede apps – overblik" | Ret |

Appen bygges uden GitHub-token, så repoet er enten offentligt eller bygget på en anden måde; tjek med
`gh repo view kekwin/skralde-toemnings-app --json visibility`, før build-trinnet.

## Rækkefølge og tjek

Følg de ti trin i opskriften (backup, kode og tag, GitHub, hub, andre repoer, udrul, tjek, slet gamle images,
mappe, dokumenter). Specifikt for denne app:

- **Backup:** `docker cp familien-sommer-hub-skralde-1:/app/data/. <mappe>` (Git Bash: `MSYS_NO_PATHCONV=1`).
- **Tjek bagefter:** http://127.0.0.1:3000 svarer, forsidens `/api/overview` viser Skraldetømning uden fejl,
  https://skralde.tailcc94cc.ts.net/ svarer, og husets adresse og næste tømningsdage vises som før.
- **Genstart** `forside` og `skralde-ts` efter udrulningen (enkeltfils-mounts).
- Slet `familien-sommer-hub/skralde`-images bagefter.

## Åbne valg for Kewin

- Navnet: `waste-collection` eller `bin-collection`.
- Skal `SKRALDE_HOME_ADDRESS` og Tailscale-navnet også være engelske? Anbefaling: nej.
