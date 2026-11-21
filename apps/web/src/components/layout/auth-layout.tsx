import { BadgeCheckIcon } from "lucide-react";

import { AUTH_BRAND, AuthBrandPanel } from "@/components/auth/auth-brand-panel";
import { ThemeToggle } from "@/components/theme/theme-toggle";

// Brand panel on the left (large screens), form on the right.
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh flex-1 lg:grid-cols-2">
      <AuthBrandPanel />
      <main className="relative flex flex-col items-center justify-center gap-6 bg-muted/40 p-4 sm:p-8">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2 text-lg font-semibold lg:hidden">
          <BadgeCheckIcon className="size-5 text-primary" aria-hidden />
          {AUTH_BRAND.appName}
        </div>
        {children}
      </main>
    </div>
  );
}
