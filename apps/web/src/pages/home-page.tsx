import { CreateBatchForm } from "@/components/batches/create-batch-form";
import type { Person } from "@/lib/people";

// Placeholder landing page after sign in. Each role's real screens are added per user story.
export function HomePage({ user }: { user: Person }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
      {user.role === "CENTRE" ? (
        <CreateBatchForm />
      ) : (
        <p className="text-muted-foreground">Batches waiting for your review will appear here.</p>
      )}
    </div>
  );
}
