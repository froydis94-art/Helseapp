# Helseapp (Vercel-first)

Vi kjører **uten lokal Node**: webapp + API på Vercel, bildegenerering via Replicate.

## Det som virker nå

- **Fremtid** — last opp bilde → AI-visualisering (`/api/generate-future-you`)
- **Tempo** — dager foran/bak planen (lagres i nettleseren)
- Live: https://helseapp-2.vercel.app

## Oppdater etter kodeendring

1. Gå til https://vercel.com/new  
2. Dra inn den oppdaterte `helseapp`-mappen  
3. Velg prosjekt **helseapp-2** hvis mulig, ellers nytt + lim inn env vars på nytt  
4. Environment Variables:
   - `REPLICATE_API_TOKEN`
   - `REPLICATE_MODEL` = `black-forest-labs/flux-kontext-pro`  
5. Redeploy hvis du bare endret env vars

## Neste i planen

- Finpusse Tempo + varsler
- Terra/Vital for Garmin/Strava/Oura (senere)
- Valgfri Expo-app som snakker med samme Vercel-API når IT godkjenner Node

## Tips (E005)

Bruk bilde i treningstøy og mildere måltekst hvis Replicate sitt sikkerhetsfilter stopper generering.
