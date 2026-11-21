import { useEffect, useState } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getMe, logout, type Person } from "@/lib/people";
import { HomePage } from "@/pages/home-page";
import { LoginPage } from "@/pages/login-page";
import { VerifyPage } from "@/pages/verify-page";

// Small on purpose: signed in -> app, otherwise the login page.
// When more pages arrive, add react-router and move this logic into a route guard.
export function App() {
  // The public verify page needs no login: /verify or /verify/PSM-2026-000123
  const path = window.location.pathname;
  if (path.startsWith("/verify")) return <VerifyPage initialNumber={decodeURIComponent(path.split("/")[2] ?? "")} />;
  return <StaffApp />;
}

function StaffApp() {
  const [user, setUser] = useState<Person | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getMe()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <Skeleton className="m-8 h-10 w-64" />;
  if (!user) return <LoginPage onSignedIn={setUser} />;

  return (
    <>
      <AppHeader
        user={user}
        onSignOut={async () => {
          await logout();
          setUser(null);
        }}
      />
      <HomePage user={user} />
    </>
  );
}
