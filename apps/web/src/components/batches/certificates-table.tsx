import { useState } from "react";
import { toast } from "sonner";

import { HistoryList } from "@/components/batches/history-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cancelCertificate, certificateHistory, resendCertificate, type AuditEntry, type Certificate } from "@/lib/batches";

function CertificateHistory({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(next: boolean) {
    setOpen(next);
    if (!next) return;
    setHistory(null);
    setError(null);
    try {
      setHistory((await certificateHistory(id)).history);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => void load(next)}>
      <Button size="sm" variant="outline" onClick={() => void load(true)}>History</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Certificate history</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!history && !error && <p className="text-sm text-muted-foreground">Loading history...</p>}
        {history && <HistoryList history={history} />}
      </DialogContent>
    </Dialog>
  );
}

/** State office only. A reason is required; the certificate is never deleted (decision D8). */
function CancelCertificate({ certificate, onDone }: { certificate: Certificate; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (reason.trim().length < 3) {
      toast.error("Give a reason (at least 3 characters)");
      return;
    }
    setBusy(true);
    try {
      await cancelCertificate(certificate.id, reason.trim());
      toast.success(`${certificate.number} cancelled. The public check now shows it as cancelled.`);
      setOpen(false);
      setReason("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>Cancel</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {certificate.number}?</DialogTitle>
          <DialogDescription>
            {certificate.holderName}’s certificate will show as <strong>Cancelled</strong> on the public check
            immediately. The record is kept and the reason is added to its history.
          </DialogDescription>
        </DialogHeader>
        <Textarea placeholder="Reason (for example: issued by mistake, candidate did not complete the course)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Keep it</Button>
          <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>{busy ? "Cancelling..." : "Cancel certificate"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DELIVERY_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  SENT: "secondary",
  PENDING: "outline",
  FAILED: "destructive",
};

export function CertificatesTable({ certificates, canManage, onChange }: { certificates: Certificate[]; canManage: boolean; onChange: () => void }) {
  if (certificates.length === 0) return null;

  async function resend(c: Certificate) {
    try {
      await resendCertificate(c.id);
      toast.success("Queued for another try");
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resend");
    }
  }

  const sent = certificates.filter((c) => c.delivery?.status === "SENT").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Certificates: {certificates.length} issued, {sent} delivered on WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Holder</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {certificates.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">
                  <a className="text-primary underline-offset-4 hover:underline" href={`/verify/${c.number}`} target="_blank" rel="noreferrer" title="Open the public check">
                    {c.number}
                  </a>
                </TableCell>
                <TableCell>{c.holderName}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "VALID" ? "secondary" : "destructive"}>{c.status === "VALID" ? "Valid" : "Cancelled"}</Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {c.delivery ? (
                    <Badge variant={DELIVERY_BADGE[c.delivery.status] ?? "outline"}>
                      {c.delivery.status === "SENT" ? "Sent" : c.delivery.status === "FAILED" ? "Failed" : "Sending..."}
                    </Badge>
                  ) : "-"}
                  {c.delivery && c.delivery.attempts > 1 && <span className="ml-2 text-muted-foreground">{c.delivery.attempts} tries</span>}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <CertificateHistory id={c.id} />
                    {canManage && c.delivery?.status === "FAILED" && <Button size="sm" variant="outline" onClick={() => void resend(c)}>Resend</Button>}
                    {canManage && c.status === "VALID" && <CancelCertificate certificate={c} onDone={onChange} />}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
