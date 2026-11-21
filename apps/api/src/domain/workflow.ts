import type { BatchStatus, ReviewStep, Role } from "@prisma/client";

/**
 * The batch workflow in one place (US-4). Pure functions, no database, so they are easy to test.
 *
 * DRAFT -> DISTRICT_REVIEW -> [QUALITY_REVIEW if size >= QUALITY_REVIEW_MIN_SIZE] -> STATE_REVIEW
 *       -> APPROVED -> ISSUING -> COMPLETED
 * Any review step can go to RETURNED (send back, centre fixes and resubmits) or REJECTED (final).
 */
export const ALLOWED_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  DRAFT: ["DISTRICT_REVIEW"],
  RETURNED: ["DISTRICT_REVIEW"],
  DISTRICT_REVIEW: ["QUALITY_REVIEW", "STATE_REVIEW", "RETURNED", "REJECTED"],
  QUALITY_REVIEW: ["STATE_REVIEW", "RETURNED", "REJECTED"],
  STATE_REVIEW: ["APPROVED", "RETURNED", "REJECTED"],
  APPROVED: ["ISSUING"],
  ISSUING: ["COMPLETED"],
  COMPLETED: [],
  REJECTED: [],
};

export function canTransition(from: BatchStatus, to: BatchStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Which review step a status represents, or null if the batch is not waiting for a review. */
export function stepOf(status: BatchStatus): ReviewStep | null {
  if (status === "DISTRICT_REVIEW") return "DISTRICT";
  if (status === "QUALITY_REVIEW") return "QUALITY";
  if (status === "STATE_REVIEW") return "STATE";
  return null;
}

/** Who may act at each step. */
export const ROLE_FOR_STEP: Record<ReviewStep, Role> = {
  DISTRICT: "DISTRICT_OFFICER",
  QUALITY: "QUALITY",
  STATE: "STATE",
};

/** Decision D2/D5: two different district officers; one approval for quality and state. */
export const APPROVALS_NEEDED: Record<ReviewStep, number> = { DISTRICT: 2, QUALITY: 1, STATE: 1 };

/** Where a batch goes once a step has enough approvals (decision D1 for the quality step). */
export function statusAfterStep(step: ReviewStep, candidateCount: number, qualityMinSize: number): BatchStatus {
  if (step === "DISTRICT") return candidateCount >= qualityMinSize ? "QUALITY_REVIEW" : "STATE_REVIEW";
  if (step === "QUALITY") return "STATE_REVIEW";
  return "APPROVED";
}

/** SLA per step in minutes (decision D7). */
export function slaMinutes(step: ReviewStep, cfg: { district: number; quality: number; state: number }) {
  return step === "DISTRICT" ? cfg.district : step === "QUALITY" ? cfg.quality : cfg.state;
}
