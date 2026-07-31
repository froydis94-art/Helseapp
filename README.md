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

Terra er **pauset** til abonnement er aktuelt (`TERRA_LIVE = false` i `public/index.html`).
Kode for widget/sync/webhook ligger klar under `api/terra/`.

Når dere er klare:
1. Sett `TERRA_LIVE = true`
2. Legg `TERRA_DEV_ID` + `TERRA_API_KEY` i Vercel
3. Webhook: `https://helseapp-2.vercel.app/api/terra/webhook`
4. Redeploy

## Lokal Expo (valgfritt)

Expo-klienten kan snakke med samme Vercel-API når Node er godkjent på PC-en. Se `src/api/terra.js`.

## Merknad

Visualiseringene er motivasjon, ikke medisinsk prediksjon.
