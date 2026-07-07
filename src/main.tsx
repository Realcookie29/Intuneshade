import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { MsalProvider } from "@azure/msal-react";
import { FluentProvider } from "@fluentui/react-components";
import { msalInstance } from "./auth/msalInstance";
import { useThemeStore } from "./store/themeStore";
import { lightTheme, darkTheme, INK } from "./theme/theme";
import App from "./App";

function Root() {
  const mode = useThemeStore((s) => s.mode);

  useEffect(() => {
    document.body.style.background = mode === "dark" ? INK.bg1 : "#F5F6F8";
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  return (
    <FluentProvider
      theme={mode === "dark" ? darkTheme : lightTheme}
      style={{ height: "100vh" }}
    >
      <App />
    </FluentProvider>
  );
}

function renderApp() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <Root />
      </MsalProvider>
    </React.StrictMode>
  );
}

function renderError(message: string) {
  const root = document.getElementById("root")!;
  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Segoe UI,sans-serif;background:#f3f2f1;">
      <div style="background:white;padding:40px;border-radius:8px;max-width:480px;box-shadow:0 2px 8px rgba(0,0,0,.12);">
        <h2 style="color:#d13438;margin:0 0 12px">Configuration error</h2>
        <p style="color:#323130;margin:0 0 16px">${message}</p>
        <p style="color:#605e5c;font-size:13px;margin:0">
          Make sure <code style="background:#edebe9;padding:2px 6px;border-radius:3px">VITE_CLIENT_ID</code>
          is set in your <code style="background:#edebe9;padding:2px 6px;border-radius:3px">.env.local</code>
          file and matches your Azure App Registration.
        </p>
      </div>
    </div>`;
}

msalInstance
  .initialize()
  .then(() =>
    // handleRedirectPromise processes the auth code after Microsoft redirects back.
    // Errors here (e.g. stale state, cancelled login) should not crash the app —
    // just clear the state and let the user sign in again.
    msalInstance.handleRedirectPromise().catch(() => undefined)
  )
  .then(renderApp)
  .catch((err: unknown) => {
    const msg =
      err instanceof Error ? err.message : "MSAL failed to initialize.";
    renderError(msg);
  });
