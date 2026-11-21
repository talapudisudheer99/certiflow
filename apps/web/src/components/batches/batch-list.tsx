import { AlertTriangleIcon } from "lucide-react";

import { StatusBadge } from "@/components/batches/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BatchSummary } from "@/lib/batches";

type Props = {
  title: string;
  description?: string;
  batches: BatchSummary[] | null;
  error?: string | null;
  emptyText: string;
  onOpen: (id: string) => void;
};

export function BatchList({ title, description, batches, error, emptyText, onOpen }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!batches && !error && <Skeleton className="h-24 w-full" />}
        {batches && batches.length === 0 && <p className="text-sm text-muted-foreground">{emptyText}</p>}
        {batches && batches.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Candidates</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id} className="cursor-pointer" onClick={() => onOpen(b.id)}>
                  <TableCell className="font-medium">
                    {b.name}
                    <div className="text-xs text-muted-foreground">{b.courseCode}</div>
                  </TableCell>
                  <TableCell>{b.centre.name}</TableCell>
                  <TableCell>{b._count.candidates}</TableCell>
                  <TableCell className="space-x-2">
                    <StatusBadge status={b.status} />
                    {b.escalatedAt && (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangleIcon className="size-3.5" /> stuck
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
