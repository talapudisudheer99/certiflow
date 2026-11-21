import { useState } from "react";

import { BatchDetail } from "@/components/batches/batch-detail";
import { BatchList } from "@/components/batches/batch-list";
import { CreateBatchForm } from "@/components/batches/create-batch-form";
import { useLiveEvents } from "@/hooks/use-live-events";
import { usePoll } from "@/hooks/use-poll";
import { listBatches, listStuck } from "@/lib/batches";
import type { Person } from "@/lib/people";

/** One screen per role: what is waiting for me, everything I can see, and (state office) what is stuck. */
export function HomePage({ user }: { user: Person }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const listsVisible = openId === null; // pause the home lists while a batch page is open
  const all = usePoll(() => listBatches(false), 15000, listsVisible);
  const waiting = usePoll(() => (user.role === "CENTRE" ? Promise.resolve({ batches: [] }) : listBatches(true)), 15000, listsVisible);
  const stuck = usePoll(() => (user.role === "STATE" ? listStuck() : Promise.resolve({ batches: [] })), 15000, listsVisible);
  useLiveEvents(() => {
    if (!listsVisible) return;
    void all.refresh();
    void waiting.refresh();
    void stuck.refresh();
  });

  if (openId) {
    return (
      <main className="mx-auto max-w-5xl p-4">
        <BatchDetail id={openId} user={user} onBack={() => setOpenId(null)} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
      {user.role === "CENTRE" && <CreateBatchForm onCreated={(id) => setOpenId(id)} />}
      {user.role === "STATE" && (stuck.data?.batches.length ?? 0) > 0 && (
        <BatchList title="Stuck: waiting too long" description="Escalated automatically after the time limit for their step."
          batches={stuck.data?.batches ?? null} emptyText="" role={user.role} onOpen={setOpenId} />
      )}
      {user.role !== "CENTRE" && (
        <BatchList title="Waiting for you" description="Batches at your step." batches={waiting.data?.batches ?? null}
          error={waiting.error} emptyText="Nothing is waiting for you right now." role={user.role} onOpen={setOpenId} />
      )}
      <BatchList title={user.role === "CENTRE" ? "Your batches" : "All batches you can see"} batches={all.data?.batches ?? null}
        error={all.error} emptyText={user.role === "CENTRE" ? "No batches yet. Create one above." : "No batches yet."} role={user.role} onOpen={setOpenId} />
    </main>
  );
}
