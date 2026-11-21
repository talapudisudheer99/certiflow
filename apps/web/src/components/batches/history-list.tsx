import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AuditEntry } from "@/lib/batches";

/** Audit trail of a batch: who did what, when, from which state to which (US-10). */
export function HistoryList({ history }: { history: AuditEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>Append-only: entries can never be edited or deleted.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2 text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap gap-x-2 border-b pb-2 last:border-0">
              <span className="text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</span>
              <span className="font-medium">{h.actorName ?? "system"}</span>
              <span>{h.action.replace(/_/g, " ").toLowerCase()}</span>
              {h.toState && <span className="text-muted-foreground">{h.fromState ? `${h.fromState} → ` : ""}{h.toState}</span>}
              {h.reason && <span className="italic">"{h.reason}"</span>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
