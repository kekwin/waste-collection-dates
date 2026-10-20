# Waste collection dates (Skraldetømning)

Lokal app der henter tømmedatoer fra Vestfor og viser dem i et overskueligt interface. Giver også mulighed for at downloade tømmedatoer som .ics fil, eller at printe som pdf.

## Hvad er nyt

- Appen henter nu tømmedatoer for det næste år.
- Download af kalenderfil (`/api/calendar.ics`) laver nu tidsbestemte events kl. 06:00-06:30 på tømmedagen (Europe/Copenhagen).
- Kalenderfilen indeholder en påmindelse kl. 20:30 aftenen før hver tømning.
- Kalenderfilen markerer events som ledig tid (free), inkl. Outlook/Microsoft-specifikke felter for bedre import-kompatibilitet.
- UID i kalenderfilen genereres nu RFC-5545-kompatibelt (uden ugyldige tegn som `/`) for bedre Outlook-import.

## Hjemmeadresse

Sæt `HOME_ADDRESS` til husets adresse, præcis som Vestfor skriver den, fx
`HOME_ADDRESS="Rendsagervej 130, 2625 Vallensbæk"`. I Familien Sommer hub står den som
`SKRALDE_HOME_ADDRESS` i hub'ens `.env`.

- Hjemmet ændres ikke, når man slår andre adresser op med "Skift adresse". Appen viser en knap
  tilbage til hjemmet, når den står på en anden adresse.
- `GET /api/home` giver hjemmeadressen, og `GET /api/home/dates` giver tømmedatoerne for hjemmet.
  Hub'ens forside bruger dem.
- Hver adresse får sin egen session hos Vestfor, så hjemmet og den viste adresse ikke blander sig.
- Uden `HOME_ADDRESS` virker appen som før.

## Første gang

Åbn en terminal (PowerShell eller CMD) i mappen og kør:

```
npm install
npm run build
```

## Start appen

```
npm start
```

Åbn derefter **http://localhost:3000** i din browser.

## Stop appen

Tryk **Ctrl+C** i terminalen.

## Licens

Koden er under [MIT](LICENSE). Font Awesome Free i `public/fontawesome-free/` (ikoner CC BY 4.0, skrifter SIL OFL, kode MIT)
og skrifterne i `public/fonts/` har deres egne licenser; se filerne i mapperne.
