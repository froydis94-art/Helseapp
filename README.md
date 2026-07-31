# Helseapp

Web-app (Vercel) som viser et motivasjonsbilde av deg basert på planen, og sier fra om du er dager foran eller bak målet. Helseenheter kobles via **Terra**.

Live: https://helseapp-2.vercel.app  
Repo: https://github.com/froydis94-art/Helseapp

## Faner

- **Fremtid** — bilde + mål → AI-visualisering (Replicate Flux + SDXL-fallback)
- **Tempo** — aktivitet + kosthold, dager foran/bak planen
- **Enheter** — Terra-widget for Garmin, Strava, Oura, Health Connect, m.fl.

## Språk og enheter

NO / EN og Metric / US øverst til høyre (første besøk får onboarding).

## Vercel env

| Variabel | Bruk |
|---|---|
| `REPLICATE_API_TOKEN` | AI-bilder |
| `REPLICATE_MODEL` | valgfri, default `black-forest-labs/flux-kontext-pro` |
| `REPLICATE_FALLBACK_MODEL` | valgfri, default `stability-ai/sdxl` |
| `TERRA_DEV_ID` | Terra dashboard Dev ID |
| `TERRA_API_KEY` | Terra API key |
| `TERRA_WEBHOOK_SECRET` | valgfri, for webhook-signatur |
| `APP_BASE_URL` | valgfri, default live-URL |

## Terra-oppsett

1. Opprett konto på [dashboard.tryterra.co](https://dashboard.tryterra.co)
2. Aktiver datakilder (Garmin, Strava, Oura, …)
3. Sett **webhook destination** til:  
   `https://helseapp-2.vercel.app/api/terra/webhook`
4. Legg `TERRA_DEV_ID` + `TERRA_API_KEY` (+ gjerne `TERRA_WEBHOOK_SECRET`) i Vercel → Settings → Environment Variables
5. Redeploy
6. I appen: **Enheter → Koble enhet via Terra** → etter OAuth: **Synk til Tempo**

API-er:

- `POST /api/terra/widget-session` — starter Terra-widget
- `POST /api/terra/sync` — henter daily/activity/body/nutrition
- `POST /api/terra/webhook` — mottar Terra-events
- `GET /api/terra/status` — om servernøkler er satt

## Lokal Expo (valgfritt)

Expo-klienten kan snakke med samme Vercel-API når Node er godkjent på PC-en. Se `src/api/terra.js`.

## Merknad

Visualiseringene er motivasjon, ikke medisinsk prediksjon.
