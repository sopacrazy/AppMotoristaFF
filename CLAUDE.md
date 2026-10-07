# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**FortFruit AppMotorista** — a delivery driver mobile app (PWA + Android via Capacitor) for the FortFruit fruit distribution company. Drivers use it to manage daily delivery routes, record arrivals and completions with photo proof, and track their shift (jornada). Managers have an admin panel for messaging and monitoring.

The app version is stored in [src/version.ts](src/version.ts) and must be kept in sync with the `currentVersion` hardcoded in [server.js](server.js) (`/check-update` endpoint) whenever a release is deployed.

## Commands

### Development
```bash
npm run dev          # Frontend only (Vite, port 4002)
npm run server       # Backend only (Express, port 4010)
npm run dev:all      # Both concurrently
```

### Build & Deploy
```bash
npm run build              # Vite build → dist/
npm run build-and-update   # Build + create update ZIP (for OTA update system)
```

### Android / Capacitor
```bash
npm run android:dev    # Build → sync → open in Android Studio
npm run android:run    # Build → sync → run on device/emulator
npm run apk:debug      # Full debug APK
npm run apk:release    # Full release APK
npm run cap:sync       # Sync web assets to Android only
```

## Architecture

### Two-process design
- **Frontend** — React SPA (Vite + TypeScript + Tailwind). Communicates with the backend via REST. Uses `HashRouter` so deep links work in the Android WebView.
- **Backend** — Express server (`server.js`) on port 4010. Connects to **two** MySQL pools:
  - `db` — main database (deliveries, drivers, checklist, gamification)
  - `dbOcorrencias` — separate occurrences/issues database (configured via `DB_HOST_OCORRENCIAS` etc.)

In production the Express server also serves the built `dist/` as a static SPA, making it a single deployable process.

### API URL resolution (`src/apiConfig.ts`)
`getApiUrl()` resolves to different bases depending on context:
- **Browser dev** — Vite proxy rewrites `/api/*` → `http://localhost:4010/*`
- **Android emulator** — `http://10.0.2.2:4010/`
- **Production** — `https://academy.fortfruit.com.br/` (or `VITE_API_URL` env var)

The `FORCE_DEVELOPMENT` flag in `src/apiConfig.ts` must be `false` for production builds.

### State management (`App.tsx`)
All session state lives in `AppContent` (top-level component) and is persisted to `localStorage` on every change. Key state: `isLoggedIn`, `isAdmin`, `codMotorista`, `entregas` (delivery list), `stats`, `checklistConcluido`, `jornadaIniciada`, `codigoRota`, `kmInicial/kmFinal`. State is loaded from `localStorage` on mount to survive page reloads and Android app restarts.

### Offline-first delivery completion
When a driver completes a delivery without internet, `offlineStorage.ts` saves the photo blob and metadata to **IndexedDB** (`fasttrack-driver-db`). On reconnect, `syncService.ts` uploads the blob to Supabase Storage, gets the public URL, then calls `PUT /atualizar_status/:numSeq` on the backend.

Photo storage for delivery proofs uses **Supabase Storage** (bucket: `comprovantes`). Message photos sent by admins also go through Supabase, proxied via the `/upload-message-photo` endpoint.

### OTA update system
The app checks `/check-update` on launch and every 5 minutes. If the server returns a newer semver, a modal prompts the driver to update. The update ZIP (`/updates/v{version}.zip`) is downloaded via `@capgo/capacitor-updater` and applied on next restart. After a successful update launch, `CapacitorUpdater.notifyAppReady()` is called to prevent auto-rollback.

### Routing and navigation
Uses `react-router-dom` with `HashRouter`. Navigation is gated:
- `/deliveries` is blocked until the daily checklist is completed (`checklistConcluido`) and jornada is started.
- Bottom nav shows different tabs for admin (`isAdmin: true`) vs regular drivers.
- Admin user is identified by `id === 62` in the `login` table.

### Database field naming
The `entregas` table uses Protheus ERP column names (`ZH_*`, `ZB_*`). The `deliveryMapper.ts` service maps these raw DB fields to the frontend `Delivery` type. Always use the mapper when processing data from `/entregas/:codMotorista`.

### Key environment variables (`.env`)
```
DB_HOST, DB_USER, DB_PASSWORD, DB_NAME          # Main MySQL
DB_HOST_OCORRENCIAS, DB_USER_OCORRENCIAS, ...   # Secondary MySQL
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY       # Photo storage
TOMTOM_API_KEY                                   # Traffic alerts
PORT                                             # Backend port (default 4010)
BASE_URL                                         # Public URL for update ZIPs
VITE_API_URL                                     # Frontend API base (production)
```

### Gamification
`awardBadge(motoristaId, badgeSlug)` is called automatically inside `PUT /atualizar_status` when a delivery is completed. Badges are defined in the `badges` table; earned badges in `user_badges`. The `/badges/feed` endpoint returns community achievements from the last 48 hours.
