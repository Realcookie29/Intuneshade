# IntuneShade

A free community console for Microsoft Intune administrators. Sign in with your Microsoft 365 account to see and control your whole tenant — assignments, device compliance, Autopilot group tags, reports and more. No install, no app registration.

**Live app:** [salmon-sky-077dfd503.4.azurestaticapps.net](https://salmon-sky-077dfd503.4.azurestaticapps.net)

---

## Features

| # | Feature | Status |
|---|---------|--------|
| 1 | **Group Assignment Manager** — add/delete group assignments across all 10 Intune policy types | ✅ Live |
| 2 | **Bulk Assign** — assign a group to multiple policies/types in one operation | ✅ Live |
| 3 | **AI Policy Analysis** — Claude AI explains what a policy does, highlights risks and recommendations | ✅ Live |
| 4 | **AI Script Generator** — generate PowerShell or Graph API scripts from a plain English description | ✅ Live |
| 5 | **Conflict Detection** — scan all 10 policy types for assignment conflicts + setting-level conflicts (same as Intune's own conflict engine, with AI resolution) | ✅ Live |
| 6 | **Smart Bulk Automation** — clone, enable/disable, export, diff preview, import | ✅ Live |
| 7 | **Assignment Matrix** — spreadsheet-style groups × policy-types grid with instant group search and click-through detail (optional graph view included) | ✅ Live |
| 8 | **Compliance Reporting** with AI narratives | ✅ Live |
| 9 | **Group Finder** — reverse lookup of every policy assigned to a group (table view) | ✅ Live |
| 10 | **Settings Search** — search across all Intune policy settings | ✅ Live |
| 11 | **Assignment Filters** — view, create, edit and delete assignment filters, with per-filter usage scan | ✅ Live |
| 12 | **Group Membership** — view and manage the users/devices inside Entra ID groups | ✅ Live |
| 13 | **Backup & Restore** — full-tenant policy backup to one JSON file, selective restore | ✅ Live |
| 14 | **Audit History** — who changed what and when, with per-event property diffs | ✅ Live |

---

## How It Works

This is a multi-tenant SPA. Any Microsoft 365 admin can sign in with their own account — no App Registration setup required on their end. The app uses the registered Azure App Registration (Client ID hardcoded as a public SPA — no secret involved).

On first sign-in, Microsoft will prompt the user to consent to the required Graph API permissions.

---

## Supported Policy Types

- Mobile Apps
- Settings Catalog (Configuration Policies)
- Device Configurations
- Device Compliance Policies
- Group Policy Configurations
- Platform Scripts (Device Management Scripts)
- Remediation Scripts (Device Health Scripts)
- Windows Autopilot Profiles
- App Configurations
- Security Baselines (Device Management Intents)

---

## AI Features

AI features (Analyze, Script Generator, Conflict Resolution) require an Anthropic API key. Users bring their own:

1. Get a key at [console.anthropic.com](https://console.anthropic.com) (add $5+ credits)
2. Click the **key icon** in the top bar of the app
3. Paste your `sk-ant-...` key — stored in your browser only, never shared

Each policy analysis costs roughly $0.01.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + React 18 + TypeScript |
| UI | Fluent UI v9 (`@fluentui/react-components`) |
| Auth | MSAL React (`@azure/msal-react`) — multi-tenant, `loginRedirect` flow |
| State | Zustand |
| API | Microsoft Graph API (beta endpoint) |
| Backend | Azure Functions v4 (Node.js, TypeScript, bundled with esbuild) |
| AI | Anthropic Claude (`claude-sonnet-4-6`) via user-provided API key |
| Hosting | Azure Static Web Apps |
| CI/CD | GitHub Actions |

---

## Security

- **Delegated auth only — no app-only access.** Every Graph call runs as the signed-in administrator via delegated permissions. The app can never do more than the user is already allowed to do, and there are no application (app-only) permissions or stored service credentials.
- **Your tenant data stays in your browser.** Policies, groups, assignments, devices and compliance data are read directly from the Microsoft Graph API by the browser. There is no backend that receives, logs or stores your tenant data. Reports are generated client-side and only saved when *you* download them.
- **No server-side secrets in source code.** The AI provider key is user-provided and sent per-request via the `X-Api-Key` header over HTTPS; it is never stored server-side. The AI proxy has **no server-side fallback key** — the endpoint is anonymous, so a shared key could be abused, and is therefore deliberately not supported.
- **AI features are opt-in and disclosed.** They are off until you enter your own AI key. When used, the relevant policy data is sent to the provider you choose (Anthropic, OpenAI, Google Gemini, or Azure OpenAI) through a thin proxy that forwards the request and returns the response — it does not persist it. The Azure OpenAI endpoint is validated to `*.openai.azure.com` to prevent request forwarding to arbitrary hosts.
- **App Registration Client ID is public by design.** This is a public SPA client — there is no client secret. The Client ID alone cannot be used to impersonate the app or access data.
- **`api/local.settings.json` and `*.local` are git-ignored.** Use `api/local.settings.json.example` as a template for local development.
- **Graph API permissions are scoped to Intune management only.** No mail, calendar, or personal user data access. See the permission table below for exactly which scopes are requested and why.
- **Tokens are stored in `sessionStorage`** (cleared on tab close), not `localStorage`.
- **Security headers** (`Content-Security-Policy` with `frame-ancestors 'none'`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`) are set on all responses via `staticwebapp.config.json`.

---

## Local Development

### Prerequisites
- Node.js 20+
- Azure Functions Core Tools v4
- An Azure App Registration with the required Graph permissions (or use the existing Client ID for testing)

### Setup

```bash
# Install frontend dependencies
npm install

# Install API dependencies
cd api && npm install && cd ..

# Copy the API local config (no keys needed — you provide your AI key in the UI)
cp api/local.settings.json.example api/local.settings.json

# Start frontend dev server
npm run dev

# In a second terminal — start the Azure Functions emulator
cd api && npm start
```

The app runs at `http://localhost:5173`. The API runs at `http://localhost:7071`.

---

## Deployment

Deployed automatically via GitHub Actions on every push to `main`.

The workflow:
1. Builds the frontend with Vite (`npm run build` → `dist/`)
2. Lets Azure Oryx build the API (esbuild bundles to `dist/functions/claude.js`, only `@azure/functions` in production deps)
3. Deploys both to Azure Static Web Apps

### Required GitHub Secret

| Secret | Where to get it |
|--------|----------------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN_SALMON_SKY_077DFD503` | Azure portal → Static Web App → Manage deployment token |

### Azure Environment Variables

None required. Users provide their own AI provider key in the UI (sent per-request via `X-Api-Key`). The proxy intentionally has **no server-side fallback key** — the endpoint is anonymous, so a shared key could be abused.

---

## App Registration (Azure AD)

The app uses a single multi-tenant App Registration. End users do **not** need to create their own.

**Required API Permissions (Microsoft Graph — Delegated):**

| Permission | Purpose |
|-----------|---------|
| `DeviceManagementApps.ReadWrite.All` | Mobile apps, app configurations |
| `DeviceManagementConfiguration.ReadWrite.All` | Settings catalog, device configurations, compliance |
| `DeviceManagementManagedDevices.ReadWrite.All` | Device management |
| `DeviceManagementScripts.ReadWrite.All` | Platform scripts, remediation scripts |
| `DeviceManagementServiceConfig.ReadWrite.All` | Autopilot profiles, security baselines |
| `Group.Read.All` | Resolve group names |
| `GroupMember.ReadWrite.All` | Group Membership management (add/remove members) |
| `Directory.Read.All` | Read directory objects (users, devices) |

---

## Contributing

This is a community tool. Issues and PRs welcome at [github.com/Realcookie29/Intuneshade](https://github.com/Realcookie29/Intuneshade).

---

## License

[MIT](LICENSE) © 2026 Alper Atar. Free for personal, work and commercial use.

Not affiliated with, endorsed by or sponsored by Microsoft. “Microsoft”, “Intune” and “Microsoft 365” are trademarks of Microsoft Corporation.
