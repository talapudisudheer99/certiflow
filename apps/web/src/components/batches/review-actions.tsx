import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { reviewBatch, withdrawApproval, type Decision } from "@/lib/batches";

export type MyDecision = { approvedAt: string | null; withdrawn: boolean };

/**
 * Approve, send back or reject. The server decides if this person may act; buttons are only a convenience.
 * Once you approved at this step, only "Withdraw my approval" is offered (the server ignores a second decision).
 */
export function ReviewActions({ batchId, stepLabel, mine, onDone }: { batchId: string; stepLabel: string; mine: MyDecision; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<Decision | null>(null);

  async function withdraw() {
    if (reason.trim().length < 3) {
      toast.error("Write a reason first");
      return;
    }
    setBusy("WITHDRAW");
    try {
      await withdrawApproval(batchId, reason.trim());
      toast.success("Your approval was withdrawn");
      setReason("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not withdraw");
      onDone();
    } finally {
      setBusy(null);
    }
  }

  async function act(decision: Exclude<Decision, "WITHDRAW">) {
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

  if (mine.approvedAt && mine.withdrawn) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your decision ({stepLabel})</CardTitle>
          <CardDescription>You approved, then withdrew your approval. Another officer must decide this step.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (mine.approvedAt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>You approved this batch</CardTitle>
          <CardDescription>
            Approved on {new Date(mine.approvedAt).toLocaleString()}. Waiting for another officer. Made a mistake? Withdraw
            your approval while the batch is still at this step (a reason is required).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea placeholder="Reason for withdrawing (for example: I missed a duplicate name)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="outline" disabled={busy !== null} onClick={() => void withdraw()}>
            {busy === "WITHDRAW" ? "Withdrawing..." : "Withdraw my approval"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your decision ({stepLabel})</CardTitle>
        <CardDescription>Check the candidates below. A reason is required to send back or reject.</CardDescription>
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
