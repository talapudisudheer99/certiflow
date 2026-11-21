import { CheckIcon } from "lucide-react";

import type { Approval, BatchStatus } from "@/lib/batches";
import { cn } from "@/lib/utils";

const PAST_DISTRICT: BatchStatus[] = ["QUALITY_REVIEW", "STATE_REVIEW", "APPROVED", "ISSUING", "COMPLETED"];

function districtApprovals(approvals: Approval[], cycle: number, status: BatchStatus) {
  if (PAST_DISTRICT.includes(status)) return 2;
  const rows = approvals.filter((a) => a.cycle === cycle && a.step === "DISTRICT");
  const net = rows.filter((a) => a.decision === "APPROVE").length - rows.filter((a) => a.decision === "WITHDRAW").length;
  return Math.max(0, Math.min(2, net));
}

function currentKey(status: BatchStatus) {
  if (status === "DRAFT" || status === "RETURNED" || status === "REJECTED") return "DRAFT";
  if (status === "APPROVED" || status === "ISSUING") return "COMPLETED";
  return status;
}

/** Happy-path steps. Quality appears only for a batch of 50 or more. */
export function ProgressStepper({
  status,
  candidateCount,
  approvals,
  cycle,
}: {
  status: BatchStatus;
  candidateCount: number;
  approvals: Approval[];
  cycle: number;
}) {
  const steps = [
    { key: "DRAFT", label: "Draft" },
    { key: "DISTRICT_REVIEW", label: `District (${districtApprovals(approvals, cycle, status)} of 2)` },
    ...(candidateCount >= 50 ? [{ key: "QUALITY_REVIEW", label: "Quality" }] : []),
    { key: "STATE_REVIEW", label: "State" },
    { key: "COMPLETED", label: "Completed" },
  ];
  const current = steps.findIndex((step) => step.key === currentKey(status));
  const rejected = status === "REJECTED";

  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((step, i) => {
        const done = !rejected && (status === "COMPLETED" ? i <= current : i < current);
        const here = !rejected && i === current;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-xs",
                done || here ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                here && "ring-2 ring-ring",
              )}
            >
              {done ? <CheckIcon className="size-3.5" /> : i + 1}
            </span>
            <span className={cn(here ? "font-medium text-foreground" : "text-muted-foreground")}>{step.label}</span>
            {i < steps.length - 1 && <span className="h-px w-6 bg-border" />}
          </li>
        );
      })}
      {(status === "RETURNED" || status === "REJECTED") && (
        <li className="ml-1 flex items-center gap-1.5 font-medium text-destructive">
          <span className="size-2.5 rounded-full bg-destructive" />
          {status === "RETURNED" ? "Sent back" : "Rejected"}
        </li>
      )}
    </ol>
  );
}
