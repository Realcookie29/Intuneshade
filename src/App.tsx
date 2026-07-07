import { AuthenticatedTemplate, UnauthenticatedTemplate } from "@azure/msal-react";
import AppShell from "./components/layout/AppShell";
import LandingPage from "./components/landing/LandingPage";

export default function App() {
  return (
    <>
      <AuthenticatedTemplate>
        <AppShell />
      </AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <LandingPage />
      </UnauthenticatedTemplate>
    </>
  );
}
