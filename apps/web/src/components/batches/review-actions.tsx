import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { reviewBatch, type Decision } from "@/lib/batches";

/** Approve, send back or reject. The server decides if this person may act; buttons are only a convenience. */
export function ReviewActions({ batchId, stepLabel, onDone }: { batchId: string; stepLabel: string; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<Decision | null>(null);

  async function act(decision: Decision) {
    if (decision !== "APPROVE" && reason.trim().length < 3) {
      toast.error("Write a reason first");
      return;
    }
    setBusy(decision);
    try {
      const r = await reviewBatch(batchId, decision, reason.trim() || undefined);
      if (r.alreadyDecided) toast.info("You have already decided on this batch");
      else toast.success(r.moved ? "Done: the batch moved on" : "Approval recorded: waiting for another officer");
      setReason("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save your decision");
      onDone();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your decision ({stepLabel})</CardTitle>
        <CardDescription>A reason is required to send back or reject.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea placeholder="Reason (for example: row 4 has the wrong date of birth)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy !== null} onClick={() => void act("APPROVE")}>{busy === "APPROVE" ? "Approving..." : "Approve"}</Button>
          <Button variant="outline" disabled={busy !== null} onClick={() => void act("SEND_BACK")}>Send back</Button>
          <Button variant="destructive" disabled={busy !== null} onClick={() => void act("REJECT")}>Reject</Button>
        </div>
      </CardContent>
    </Card>
  );
}
