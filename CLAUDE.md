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
- **Offentlig instans (`PUBLIC_MODE=1`, siden v2.3.0):** en separat app (`backend/public-app.ts`) til Tailscale Funnel. Den har ingen
  hjemmeadresse (starter ikke, hvis `HOME_ADDRESS` er sat), ingen gemt adresse og ingen tilstand på serveren: adressen følger med i
  hvert kald (`/api/dates?id=…`, `/api/calendar.ics?id=…`) og huskes i browseren. `/api/home*`, `/api/saved-address` og
  `/api/set-address` findes ikke dér (404). Forsøgsgrænse pr. IP og samlet, cache (søgning 24 t, datoer 6 t), sikkerhedshoveder med
  streng CSP (derfor ingen inline script/style i siderne), ingen logning af adresser eller IP'er. Den private instans er uændret.
  Kør den offentlige i en egen container uden volumen; aldrig `PUBLIC_MODE` på den private.
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
- `backend/public-app.ts` (den offentlige instans), `backend/limits.ts` (forsøgsgrænse og cache). `TRUST_PROXY` = antal proxyer foran
  (Tailscale: 1), så `req.ip` er klienten; er den forkert, deler alle én grænse.
- `shared/`: `waste-types.ts` (emoji til kalenderen og API'et, Font Awesome-ikon til siderne og farver pr. affaldstype, bruges af serveren og begge sider) og `types.ts`.
- `src/main.ts` (hovedsiden) og `src/print.ts` (udskriftssiden); `public/`: HTML, CSS, paletten, udseendet (`sommer-ui.css`, Sommerhimmel), skrifterne og Font Awesome Free (kopier fra hub'ens `design/`), kopieres til
  `dist/` ved build.
- Tests ligger ved siden af koden (`*.test.ts`, Vitest).
- Port 3000 (127.0.0.1) i hub'en, på Tailscale som `waste-collection-dates`.

## Status

v2.3.0 (25. oktober 2026) har `PUBLIC_MODE` (se Regler) og abonnement på kalenderen i den offentlige udgave; den private instans er uændret. **Funnel er endnu ikke åbnet**
(hub-delen og Kewins klik i Tailscale mangler, se Næste skridt). Samme dag fjernet et vejnavn og husnummer fra README, tests og kommentarer (stod i
historikken fra før). Før v2.3.0: v2.2.0 kører i hub'en (10. oktober 2026: Font Awesome Free-ikoner i stedet for emojis på siderne (affaldstyper, adresse, fejl, udskrift), nyt favicon og hjemmeskærmsikon; samme dag: Sommerhimmel i lys version, det fælles udseende fra `summer-hub/design/sommer-ui.css`: glaskort, toppen som glasbjælke, runde knapper; 8. oktober 2026: `/health`; 7. oktober 2026: omskrevet til TypeScript `strict` med Express 5 og indbygget `fetch`, uændret funktion og uændret API) på http://127.0.0.1:3000 og https://waste-collection-dates.tailcc94cc.ts.net.
Henter datoer igen med ny session, når Vestfor svarer med en tom liste (v1.4.2).

## Næste skridt

1. **POC: åbn appen for naboer via Tailscale Funnel** (Kewins ønske, 25. oktober 2026). Appens del er bygget (v2.3.0). Mangler: den offentlige
   tjeneste i hub'en (`waste-collection-dates-public`, maskinen `skraldehentning`, ingen volumen, `PUBLIC_MODE=1`, `TRUST_PROXY=1`) og
   `AllowFunnel`; **Kewin:** tillad Funnel i Tailscales politik og på maskinen; test udefra (telefon på mobildata) og find ud af, hvilken header
   der giver klientens IP gennem Funnel. Plan og prompt: `summer-hub/docs/ROADMAP.md` ("Spor: Tailscale Funnel") og `summer-hub/docs/PROMPT-skrald-funnel.md`.
