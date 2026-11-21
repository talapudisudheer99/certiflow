import { useState } from "react";
import { toast } from "sonner";

import { HistoryList } from "@/components/batches/history-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
      <Button size="sm" variant="outline" className="ml-2" onClick={() => void load(true)}>History</Button>
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

export function CertificatesTable({ certificates, canManage, onChange }: { certificates: Certificate[]; canManage: boolean; onChange: () => void }) {
  if (certificates.length === 0) return null;

  async function cancel(c: Certificate) {
    const reason = window.prompt(`Cancel ${c.number}? Give a reason:`);
    if (!reason) return;
    try {
      await cancelCertificate(c.id, reason);
      toast.success(`${c.number} cancelled. Verification now shows it as cancelled.`);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel");
    }
  }

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
              {canManage && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {certificates.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">
                  <a className="underline-offset-4 hover:underline" href={`/verify/${c.number}`} target="_blank" rel="noreferrer">{c.number}</a>
                  <CertificateHistory id={c.id} />
                </TableCell>
                <TableCell>{c.holderName}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "VALID" ? "secondary" : "destructive"}>{c.status === "VALID" ? "Valid" : "Cancelled"}</Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {c.delivery?.status ?? "-"}
                  {c.delivery && c.delivery.attempts > 1 && <span className="text-muted-foreground"> ({c.delivery.attempts} tries)</span>}
                </TableCell>
                {canManage && (
                  <TableCell className="space-x-2 text-right">
                    {c.delivery?.status === "FAILED" && <Button size="sm" variant="outline" onClick={() => void resend(c)}>Resend</Button>}
                    {c.status === "VALID" && <Button size="sm" variant="destructive" onClick={() => void cancel(c)}>Cancel</Button>}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
