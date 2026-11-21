import { AuthLayout } from "@/components/layout/auth-layout";
import { LoginForm } from "@/components/auth/login-form";
import type { Person } from "@/lib/people";

export function LoginPage({ onSignedIn }: { onSignedIn: (user: Person) => void }) {
  return (
    <AuthLayout>
      <LoginForm onSignedIn={onSignedIn} />
    </AuthLayout>
  );
}
