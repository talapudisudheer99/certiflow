import { api } from "@/lib/api";

export type BatchStatus =
  | "DRAFT" | "DISTRICT_REVIEW" | "QUALITY_REVIEW" | "STATE_REVIEW" | "APPROVED" | "ISSUING" | "COMPLETED" | "RETURNED" | "REJECTED";
export type Decision = "APPROVE" | "REJECT" | "SEND_BACK" | "WITHDRAW";

export type BatchSummary = {
  id: string; name: string; courseCode: string; status: BatchStatus; cycle: number; escalatedAt: string | null;
  stepEnteredAt: string; updatedAt: string; returnReason: string | null;
  centre: { name: string }; _count: { candidates: number; certificates: number };
  approvalsThisStep?: number;
  iDecided?: boolean;
};
export type Candidate = { id: string; fullName: string; phone: string; dateOfBirth: string; courseCode: string; score: number };
export type Approval = { id: string; step: string; decision: Decision; reason: string | null; cycle: number; createdAt: string; officerId: string; officer: { name: string } };
export type Certificate = {
  id: string; number: string; holderName: string; status: "VALID" | "CANCELLED"; issuedAt: string; cancelReason: string | null;
  delivery: { status: "PENDING" | "SENT" | "FAILED"; attempts: number; lastError: string | null } | null;
};
export type AuditEntry = { id: string; createdAt: string; actorName: string | null; action: string; fromState: string | null; toState: string | null; reason: string | null };
export type BatchDetail = {
  batch: BatchSummary & { centreName: string; version: number };
  candidates: Candidate[]; approvals: Approval[]; certificates: Certificate[]; history: AuditEntry[];
};
export type RowError = { row: number; field: string; message: string };

export const STATUS_LABEL: Record<BatchStatus, string> = {
  DRAFT: "Draft", DISTRICT_REVIEW: "District review", QUALITY_REVIEW: "Quality review", STATE_REVIEW: "State review",
  APPROVED: "Approved", ISSUING: "Issuing certificates", COMPLETED: "Completed", RETURNED: "Sent back", REJECTED: "Rejected",
};

export const listBatches = (waiting = false) => api<{ batches: BatchSummary[] }>(`/batches${waiting ? "?waiting=1" : ""}`);
export const getBatch = (id: string) => api<BatchDetail>(`/batches/${id}`);
export const uploadCsv = (id: string, csv: string) => api<{ count: number }>(`/batches/${id}/candidates`, { method: "POST", body: JSON.stringify({ csv }) });
export const submitBatch = (id: string) => api(`/batches/${id}/submit`, { method: "POST" });
export const reviewBatch = (id: string, decision: Exclude<Decision, "WITHDRAW">, reason?: string) =>
  api<{ moved: boolean; alreadyDecided: boolean }>(`/batches/${id}/review`, { method: "POST", body: JSON.stringify({ decision, reason }) });
export const withdrawApproval = (id: string, reason: string) =>
  api(`/batches/${id}/withdraw`, { method: "POST", body: JSON.stringify({ reason }) });
export const cancelCertificate = (id: string, reason: string) => api(`/state/certificates/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
export const resendCertificate = (id: string) => api(`/state/certificates/${id}/resend`, { method: "POST" });
export const listStuck = () => api<{ batches: BatchSummary[] }>("/state/stuck");
export const certificateHistory = (id: string) => api<{ history: AuditEntry[] }>(`/certificates/${id}/history`);
