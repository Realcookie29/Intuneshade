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

Tests: `npm test` (Vitest) — currently covers the CIS L1 evaluators, CA engine and scoring (`src/baseline/baseline.test.ts`) and the Windows settings engine (`src/baseline/windows.test.ts`). Everything else is verified with `npm run build` / `npm run dev`.

## Architecture

This is a **multi-tenant SPA** (no per-user server infrastructure) with a thin Azure Functions backend used solely as an AI proxy.

### Frontend (`src/`)
- **Auth**: MSAL React (`loginRedirect` flow). `src/auth/msalConfig.ts` holds the public Client ID and scopes. `src/auth/msalInstance.ts` exports the singleton MSAL instance used by `graphClient.ts`.
- **Graph API layer** (`src/services/graphClient.ts`): All Microsoft Graph calls go through here. Acquires tokens silently (falls back to popup). Paths default to `/beta`; `/v1.0/…` and full URLs also work. `graphGetAll` handles OData pagination automatically. **Sign-in is read-only**: `graphPost`/`graphPatch`/`graphDelete` request `WRITE_SCOPES` on first use via `ensureScopes` (redirect; AppShell reopens the current page via `setActiveTool`). Use `graphPostRead` for read-only POSTs such as `/directoryObjects/getByIds`.
- **Policy abstraction** (`src/utils/policyConfig.ts` + `src/types/policyTypes.ts`): Each of the 10 Intune policy types is described by a `PolicyDefinition` object. This drives how assignments are fetched, how the assign/delete body is constructed, and which features are supported (filters, install intent, etc.). When adding support for a new policy type, add an entry here.
- **State management**: Zustand. Three stores:
  - `analysisStore` — manages AI analysis panel state and result cache (keyed by sorted policy IDs)
  - `apiKeyStore` — the user's AI provider keys: sessionStorage by default, localStorage only with "remember on this device"; cleared on sign-out unless remembered
  - `conflictStore` — manages conflict scan results
- **memberOf migration (temporary)**: `src/utils/memberOfRule.ts` (pure rule parser, no Graph imports), `src/services/memberOfScanService.ts` (scan + remediation suggestions) and `src/components/governance/MemberOfMigrationPage.tsx`. This is a time-boxed migration aid for the Entra ID `memberOf` retirement — delete all three files, the `memberOfMigration` entry in `ToolView`/`NavSidebar`/`AppShell`, and the Dashboard quick action once the deadline in `MEMBEROF_RETIREMENT_DATE` has passed.
- **Required Apps report**: `src/services/requiredAppsReportService.ts` (pure — turns `PolicyRow[]` into a self-contained HTML document) and `src/services/deploymentProfileService.ts` (Graph: a deployment profile's devices + their transitive Entra groups, cached per profile since it costs two calls per device). The page is `src/components/report/RequiredAppsReportPage.tsx`, reachable from the sidebar and from the Applications toolbar. Note: interactive report previews must live on a **page**, not inside a Fluent `Dialog` — the dialog's focus trap swallows keystrokes aimed at the iframe, which breaks the in-report search box.
- **IntuneShade baseline (CIS L1) + agents** ("Place for your agents", ToolView `agents`):
  - `src/baseline/cis-l1-tenant.json` — the 52 CIS M365 L1 tenant checks (CIS ID, area, Graph paths, rule, expected, severity). Titles/rules are **our own wording**; never copy CIS benchmark text (licensing). Never claim "NIS2/CIS compliant" anywhere — it's a technical readiness check.
  - `src/baseline/context.ts` — the only way evaluators read Graph: per-run GET cache, failures as typed `Fetched` (403 = missing permission/licence), helpers (`result`, `fetchFailure` — beta 400/404 → Manual, else Error).
  - `src/baseline/checks/*.ts` — evaluators keyed on check id (`ca.ts` holds the CA engine: Pass / Partial for report-only, scoping, exclusions beyond break-glass, carve-outs). `index.ts` registers them (`EVALUATORS`), runs checks (`runCheck`: no evaluator → Manual, throw → Error) and scores (`countStates`: Pass / (Pass+Partial+Fail)). Adding a check = JSON entry + evaluator.
  - Read-only by design: only GETs. The admin picks which checks run (`CheckSelectionPanel`, stored as `excludedChecks` in `benchmarkPrefsStore`); `src/baseline/scopes.ts` maps every check to its extra Graph scopes, and a run requests only those (via `ensureScopes`, redirect, resumes on the agents page). New checks need an entry there (a test enforces it). Reports always carry `coverage` (assessed / total, areas not assessed) — never show a score without it. Other user input (break-glass accounts, manual answers, full MFA scan) also lives in `benchmarkPrefsStore` (localStorage only).
  - **Windows device settings** (check ids `W-<CIS id>`, areas `Windows: …`): `src/baseline/windows/mapping.ts` (hand-mapped CIS Windows 11 L1 + BitLocker ids → settings catalog definition ids + rule; own titles), `windows/engine.ts` (pure: flatten policy settings, assignments → reach per device / tenant-wide, conflicts → Partial, setting only in an unassigned policy → Fail, nothing found but assigned legacy profiles → Manual) and `checks/windows.ts` (inventory of `configurationPolicies` + assignments + settings, legacy types listed only, scope = tenant or the devices of an Autopilot deployment profile with their transitive groups). Every mapping is verified at run time against `/deviceManagement/configurationSettings/{id}`: unknown id or option → Manual "mapping needs review", never a false Fail; Microsoft's displayName/option labels are shown. Scope lives in `benchmarkPrefsStore.deviceScope`. Judges configuration intent, not device state — say so wherever results are shown.
  - `src/services/agents/` — `collector` (context over `graphGet`/`graphGetAll` + prefetch of `SHARED_SOURCES`), `advisor` + `reporter` (AI optional, static fallback, output validated, scripts display-only; reporter also owns scoring by area/NIS2 and the HTML/CSV/JSON exports), `orchestrator` (pipeline + events into `agentRunStore`).
  - `src/services/ai/provider.ts` — `byok` (via `/api/claude` modes `advise`/`report`) or `ollama` (browser → `http://localhost:11434`, allowed in the CSP; user sets `OLLAMA_ORIGINS`). Prompts live in `src/services/ai/prompts.ts` **and** in `api/src/functions/claude.ts` — keep both in sync. The AI only ever receives results, never raw Graph responses; names can be masked (`ai/mask.ts`).
  - Tests: `src/baseline/baseline.test.ts` runs evaluators against a fixture Graph reader.
- **Main orchestrator** (`src/components/layout/AppShell.tsx`): Holds page-level routing state (which "mode" is active: policy type view, bulk assign, conflict, map, report). All dialogs are rendered here.
- **UI**: Fluent UI v9 (`@fluentui/react-components`). Use `makeStyles` for all component styling.

### Backend (`api/src/functions/claude.ts`)
Single Azure Function (`POST /api/claude`) that proxies to the AI providers. **All browser calls go through `src/services/ai/aiProxy.ts`**, which sends the provider key (`X-Api-Key`) and the user's Entra ID token (`X-IntuneShade-Token` — a custom header because SWA reserves `Authorization`). The function verifies that token (JWKS, audience = the SPA client ID, issuer = the token's tenant) and rate-limits per user (best effort, per instance); upstream errors are mapped to fixed messages. Policy JSON is passed through `ai/sanitize.ts` (`stripSensitive`) before it leaves the browser. Accepts `mode` values `analyze`, `script`, `resolve`, `compliance`, plus `advise` and `report` for the benchmark agents. Request bodies are capped at 512 KB. The user's API key is passed per-request via `X-Api-Key` header. There is intentionally no server-side fallback key (the endpoint is anonymous, so a shared key could be abused); requests without `X-Api-Key` get a 401. The Azure OpenAI endpoint is validated to `*.openai.azure.com` (SSRF) and the deployment name to `[A-Za-z0-9._-]`.

Security conventions: CSV exports use `src/utils/csv.ts` (formula neutralisation) — except inside a `ReportScript`, which is serialised with `toString()` into the downloaded file and must stay self-contained. Generated HTML reports include `REPORT_CSP_META`, and preview iframes use `REPORT_IFRAME_SANDBOX`.

The API is bundled as a single file with esbuild (`npm run build` in `api/`). Only `@azure/functions` is an external; everything else including the Anthropic SDK is bundled in.

### Deployment
- Hosted on **Azure Static Web Apps**. Frontend (`dist/`) and API (`api/`) are deployed together.
- CI/CD via GitHub Actions on push to `main`. Requires the `AZURE_STATIC_WEB_APPS_API_TOKEN_SALMON_SKY_077DFD503` secret.
- `staticwebapp.config.json` configures routing (SPA fallback + `/api/*` proxy to Functions).
