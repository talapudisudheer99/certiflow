import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type BatchStatus } from "@/lib/batches";

const VARIANT: Partial<Record<BatchStatus, "default" | "secondary" | "destructive" | "outline">> = {
  COMPLETED: "default",
  APPROVED: "default",
  REJECTED: "destructive",
  RETURNED: "destructive",
  DRAFT: "outline",
};

export function StatusBadge({ status }: { status: BatchStatus }) {
  return <Badge variant={VARIANT[status] ?? "secondary"}>{STATUS_LABEL[status]}</Badge>;
}
