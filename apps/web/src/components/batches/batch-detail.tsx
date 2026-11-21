import { ArrowLeftIcon, SendIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CandidateUpload } from "@/components/batches/candidate-upload";
import { CertificatesTable } from "@/components/batches/certificates-table";
import { HistoryList } from "@/components/batches/history-list";
import { ReviewActions } from "@/components/batches/review-actions";
import { StatusBadge } from "@/components/batches/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePoll } from "@/hooks/use-poll";
import { getBatch, submitBatch, type BatchStatus } from "@/lib/batches";
import type { Person, Role } from "@/lib/people";

const REVIEWER: Partial<Record<BatchStatus, { role: Role; label: string }>> = {
  DISTRICT_REVIEW: { role: "DISTRICT_OFFICER", label: "district step, 2 officers must approve" },
  QUALITY_REVIEW: { role: "QUALITY", label: "quality step" },
  STATE_REVIEW: { role: "STATE", label: "final state approval" },
};

export function BatchDetail({ id, user, onBack }: { id: string; user: Person; onBack: () => void }) {
  const { data, error, refresh } = usePoll(() => getBatch(id), 3000);
  const [submitting, setSubmitting] = useState(false);

  if (error && !data) return <p className="text-destructive">{error}</p>;
  if (!data) return <Skeleton className="h-64 w-full" />;
  const { batch, candidates, approvals, certificates, history } = data;

  const isCentre = user.role === "CENTRE";
  const editable = isCentre && (batch.status === "DRAFT" || batch.status === "RETURNED");
  const reviewer = REVIEWER[batch.status];
  const currentApprovals = approvals.filter((a) => a.cycle === batch.cycle && a.step === batch.status.replace("_REVIEW", ""));

  async function submit() {
    setSubmitting(true);
    try {
      await submitBatch(id);
      toast.success("Sent for approval");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack}><ArrowLeftIcon /> All batches</Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3 text-2xl">
            {batch.name} <StatusBadge status={batch.status} />
          </CardTitle>
          <CardDescription>
            {batch.centreName} · course {batch.courseCode} · {candidates.length} candidates · cycle {batch.cycle}
            {batch.escalatedAt && <span className="text-destructive"> · escalated (waiting too long)</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {batch.returnReason && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
              <strong>{batch.status === "REJECTED" ? "Rejected" : "Sent back"}:</strong> {batch.returnReason}
            </p>
          )}
          {currentApprovals.length > 0 && (
            <p className="text-sm text-muted-foreground">
              At this step: {currentApprovals.map((a) => `${a.officer.name} (${a.decision.toLowerCase()})`).join(", ")}
              {reviewer &&
                currentApprovals.some((a) => a.decision === "APPROVE" && a.officerId === user.id) &&
                currentApprovals.filter((a) => a.decision === "APPROVE").length < (batch.status === "DISTRICT_REVIEW" ? 2 : 1) &&
                " — waiting for another officer"}
            </p>
          )}
          {editable && (
            <Button disabled={submitting || candidates.length === 0} onClick={() => void submit()}>
              <SendIcon /> {batch.status === "RETURNED" ? "Resend for approval" : "Send for approval"}
            </Button>
          )}
        </CardContent>
      </Card>

      {editable && <CandidateUpload batchId={id} onUploaded={() => void refresh()} />}
      {reviewer && reviewer.role === user.role && (
        <ReviewActions
          batchId={id}
          stepLabel={reviewer.label}
          canWithdraw={currentApprovals.some((a) => a.decision === "APPROVE" && a.officerId === user.id)
            && !currentApprovals.some((a) => a.decision === "WITHDRAW" && a.officerId === user.id)}
          onDone={() => void refresh()}
        />
      )}
      <CertificatesTable certificates={certificates} canManage={user.role === "STATE"} onChange={() => void refresh()} />

      {candidates.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Candidates ({candidates.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Date of birth</TableHead><TableHead>Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.slice(0, 100).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.fullName}</TableCell><TableCell>{c.phone}</TableCell>
                    <TableCell>{c.dateOfBirth.slice(0, 10)}</TableCell><TableCell>{c.score}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <HistoryList history={history} />
    </div>
  );
}
