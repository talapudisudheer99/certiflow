import { BadgeCheckIcon, LogOutIcon } from "lucide-react";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL, type Person } from "@/lib/people";

export function AppHeader({ user, onSignOut }: { user: Person; onSignOut: () => void }) {
  return (
    <header className="flex items-center justify-between border-b bg-background px-4 py-3">
      <div className="flex items-center gap-2 font-semibold">
        <BadgeCheckIcon className="size-5 text-primary" aria-hidden />
        CertiFlow
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm">{user.name}</span>
        <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="Sign out" onClick={onSignOut}>
          <LogOutIcon className="size-5" />
        </Button>
      </div>
    </header>
  );
}
