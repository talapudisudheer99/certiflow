import { AlertTriangleIcon } from "lucide-react";

import { StatusBadge } from "@/components/batches/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BatchStatus, BatchSummary } from "@/lib/batches";
import type { Role } from "@/lib/people";

type Props = {
  title: string;
  description?: string;
  batches: BatchSummary[] | null;
  error?: string | null;
  emptyText: string;
  role: Role;
  onOpen: (id: string) => void;
};

const NEEDS_ACTION: Record<Role, BatchStatus[]> = {
  CENTRE: ["RETURNED", "DRAFT"],
  DISTRICT_OFFICER: ["DISTRICT_REVIEW"],
  QUALITY: ["QUALITY_REVIEW"],
  STATE: ["STATE_REVIEW"],
};

function nextStep(batch: BatchSummary, role: Role): string {
  const mine = NEEDS_ACTION[role];
  if (role !== "CENTRE" && mine.includes(batch.status)) return "Your turn";
  switch (batch.status) {
    case "DRAFT":
      return "Upload and send";
    case "RETURNED":
      return "Fix and resend";
    case "DISTRICT_REVIEW":
      return batch.approvalsThisStep == null ? "Waiting for officers" : `Waiting for officers (${batch.approvalsThisStep} of 2)`;
    case "QUALITY_REVIEW":
      return "Waiting for quality check";
    case "STATE_REVIEW":
      return "Waiting for final approval";
    case "COMPLETED":
      return "Certificates sent";
    case "APPROVED":
    case "ISSUING":
      return "Certificates being sent";
    case "REJECTED":
      return "Closed";
  }
}

function actionFirst(batches: BatchSummary[], role: Role) {
  const order = NEEDS_ACTION[role];
  const rank = (status: BatchStatus) => {
    const i = order.indexOf(status);
    return i === -1 ? order.length : i;
  };
  return [...batches].sort((a, b) => rank(a.status) - rank(b.status));
}

export function BatchList({ title, description, batches, error, emptyText, role, onOpen }: Props) {
  const rows = batches ? actionFirst(batches, role) : null;
  const showCentre = role !== "CENTRE";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!batches && !error && <Skeleton className="h-24 w-full" />}
        {rows && rows.length === 0 && <p className="text-sm text-muted-foreground">{emptyText}</p>}
        {rows && rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                {showCentre && <TableHead>Centre</TableHead>}
                <TableHead>Candidates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next step</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => (
                <TableRow key={b.id} className="cursor-pointer" onClick={() => onOpen(b.id)}>
                  <TableCell className="font-medium">
                    {b.name}
                    <div className="text-xs text-muted-foreground">{b.courseCode}</div>
                  </TableCell>
                  {showCentre && <TableCell>{b.centre?.name}</TableCell>}
                  <TableCell>{b._count?.candidates ?? 0}</TableCell>
                  <TableCell className="space-x-2">
                    <StatusBadge status={b.status} />
                    {b.escalatedAt && (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangleIcon className="size-3.5" /> stuck
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{nextStep(b, role)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
