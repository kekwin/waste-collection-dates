# CLAUDE.md – Skraldetømning (waste-collection-dates)

Lille Node-app (TypeScript `strict`, Express) der henter tømmedatoer fra Vestfor for det kommende år og viser dem i et
overskueligt interface. Kan downloade en kalenderfil (.ics) og printe som pdf. Repo:
https://github.com/kekwin/waste-collection-dates (**offentligt**). Tal med Kewin på dansk. Push direkte til `main`; kør
`npm run check` før push. Hub'en bygger fra et versionstag.

Fælles regler for alle apps (principper, skabelon til denne fil, git): [summer-hub/CLAUDE.md](https://github.com/kekwin/summer-hub/blob/main/CLAUDE.md).

## Regler

- **Følsomhed lav** (kan bo hvor som helst), men husets adresse er personlig og kommer aldrig i git: den står
  i `HOME_ADDRESS` (i hub'en som `SKRALDE_HOME_ADDRESS` i `.env`), præcis som Vestfor skriver den.
- Hjemmeadressen ændres ikke af opslag på andre adresser ("Skift adresse"). Hver adresse får sin egen session
  hos Vestfor, så hjemmet og den viste adresse ikke blander sig. Uden `HOME_ADDRESS` virker appen som før.
- Kalenderfilen (`/api/calendar.ics`): events kl. 06:00–06:30 på tømmedagen (Europe/Copenhagen), markeret som
  ledig tid, påmindelse kl. 20:30 aftenen før, og RFC-5545-kompatible UID'er (uden fx `/`) for Outlook-import.
- **Repoet er offentligt: aldrig Font Awesome Pro** (Kewins licens gælder kun private repoer), heller ikke som SVG
  eller under et andet navn. Ikonerne er Font Awesome Free (CC BY 4.0) i `public/fontawesome-free/`, kopi fra
  `summer-hub/design/fontawesome-free` (Kewins valg, 10. oktober 2026). Tjek, at et ikon findes i Free, før det bruges.
- **Licens: MIT**, ejer "Kewin Sommer Pedersen" (valgt 20. oktober 2026). Gælder koden; Font Awesome Free i
  `public/fontawesome-free/` og skrifterne har deres egne licenser (se README).
- Forsiden og påmindelserne bruger appens API (`/api/home/dates`, `/api/dates` med ikoner). Ændr ikke formatet
  uden at ændre `summer-frontpage`.

## Kør og test

**Test og prod adskilles** ([summer-hub/docs/TEST-OG-PROD.md](https://github.com/kekwin/summer-hub/blob/main/docs/TEST-OG-PROD.md)): dev-port = prod + 100 (3100; prod-porten 3000 er containerens og bruges kun til `GET`), egen database i `data/`, og tjek hvem der svarer, før du skriver. Følger reglen.

```sh
npm install
npm run check          # typecheck + lint + tests, skal være grøn før push
npm run build          # dist/ (siderne) og dist-server/server.mjs
npm run backend:watch  # serveren på http://localhost:3100 (læser .env)
npm run dev            # genbygger siderne ved ændringer
```

`data/` er gitignored. Lokal kørsel bruger 3100 og stopper aldrig hub'ens container.

## Struktur

- `backend/vestfor.ts`: klienten til Vestfors selvbetjening (session pr. adresse, adresseopslag, tømmedatoer, nyt
  forsøg ved tom liste). Tager `fetch` som parameter, så den kan testes.
- `backend/ics.ts`: kalenderfilen (events, RFC-5545-folding og UID'er).
- `backend/app.ts`: Express-appen med ruterne `/api/saved-address`, `/api/home`, `/api/home/dates`, `/api/search`,
  `/api/set-address` (POST), `/api/dates` og `/api/calendar.ics`. `backend/server.ts` læser miljøet og starter den.
- `shared/`: `waste-types.ts` (emoji til kalenderen og API'et, Font Awesome-ikon til siderne og farver pr. affaldstype, bruges af serveren og begge sider) og `types.ts`.
- `src/main.ts` (hovedsiden) og `src/print.ts` (udskriftssiden); `public/`: HTML, CSS, paletten, udseendet (`sommer-ui.css`, Sommerhimmel), skrifterne og Font Awesome Free (kopier fra hub'ens `design/`), kopieres til
  `dist/` ved build.
- Tests ligger ved siden af koden (`*.test.ts`, Vitest).
- Port 3000 (127.0.0.1) i hub'en, på Tailscale som `waste-collection-dates`.

## Status

v2.2.0 kører i hub'en (10. oktober 2026: Font Awesome Free-ikoner i stedet for emojis på siderne (affaldstyper, adresse, fejl, udskrift), nyt favicon og hjemmeskærmsikon; samme dag: Sommerhimmel i lys version, det fælles udseende fra `summer-hub/design/sommer-ui.css`: glaskort, toppen som glasbjælke, runde knapper; 8. oktober 2026: `/health`; 7. oktober 2026: omskrevet til TypeScript `strict` med Express 5 og indbygget `fetch`, uændret funktion og uændret API) på http://127.0.0.1:3000 og https://waste-collection-dates.tailcc94cc.ts.net.
Henter datoer igen med ny session, når Vestfor svarer med en tom liste (v1.4.2).

## Næste skridt

Ingen planlagte.
