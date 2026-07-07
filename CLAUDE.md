# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (root)
```bash
npm run dev        # Start Vite dev server at http://localhost:5173
npm run build      # Type-check + build to dist/
npm run lint       # ESLint
npm run preview    # Preview the production build
```

### Backend (api/)
```bash
cd api && npm install   # Install API dependencies separately
cd api && npm start     # Start Azure Functions emulator at http://localhost:7071
cd api && npm run build # Bundle claude.ts → dist/functions/claude.js via esbuild
```

### Local setup
1. Copy `api/local.settings.json.example` → `api/local.settings.json` (no keys needed; the AI key is provided per-request from the UI).
2. Run frontend and API in two separate terminals.

There are no automated tests in this project.

## Architecture

This is a **multi-tenant SPA** (no per-user server infrastructure) with a thin Azure Functions backend used solely as an AI proxy.

### Frontend (`src/`)
- **Auth**: MSAL React (`loginRedirect` flow). `src/auth/msalConfig.ts` holds the public Client ID and scopes. `src/auth/msalInstance.ts` exports the singleton MSAL instance used by `graphClient.ts`.
- **Graph API layer** (`src/services/graphClient.ts`): All Microsoft Graph calls go through here. Acquires tokens silently (falls back to popup). Uses the `/beta` endpoint. `graphGetAll` handles OData pagination automatically.
- **Policy abstraction** (`src/utils/policyConfig.ts` + `src/types/policyTypes.ts`): Each of the 10 Intune policy types is described by a `PolicyDefinition` object. This drives how assignments are fetched, how the assign/delete body is constructed, and which features are supported (filters, install intent, etc.). When adding support for a new policy type, add an entry here.
- **State management**: Zustand. Three stores:
  - `analysisStore` — manages AI analysis panel state and result cache (keyed by sorted policy IDs)
  - `apiKeyStore` — manages the user's Anthropic API key (stored in `localStorage`)
  - `conflictStore` — manages conflict scan results
- **Main orchestrator** (`src/components/layout/AppShell.tsx`): Holds page-level routing state (which "mode" is active: policy type view, bulk assign, conflict, map, report). All dialogs are rendered here.
- **UI**: Fluent UI v9 (`@fluentui/react-components`). Use `makeStyles` for all component styling.

### Backend (`api/src/functions/claude.ts`)
Single Azure Function (`POST /api/claude`) that proxies to the Anthropic API. Accepts four `mode` values: `analyze`, `script`, `resolve`, `compliance`. The user's API key is passed per-request via `X-Api-Key` header. There is intentionally no server-side fallback key (the endpoint is anonymous, so a shared key could be abused); requests without `X-Api-Key` get a 401. The Azure OpenAI endpoint is validated to `*.openai.azure.com` to prevent SSRF.

The API is bundled as a single file with esbuild (`npm run build` in `api/`). Only `@azure/functions` is an external; everything else including the Anthropic SDK is bundled in.

### Deployment
- Hosted on **Azure Static Web Apps**. Frontend (`dist/`) and API (`api/`) are deployed together.
- CI/CD via GitHub Actions on push to `main`. Requires the `AZURE_STATIC_WEB_APPS_API_TOKEN_SALMON_SKY_077DFD503` secret.
- `staticwebapp.config.json` configures routing (SPA fallback + `/api/*` proxy to Functions).
