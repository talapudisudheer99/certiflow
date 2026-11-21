-- An officer can withdraw their own approval while the step is still open (decision D13).
-- The approval row stays. A second row records the withdrawal.
ALTER TYPE "Decision" ADD VALUE 'WITHDRAW';

DROP INDEX "Approval_batchId_step_officerId_cycle_key";

CREATE UNIQUE INDEX "Approval_batchId_step_officerId_cycle_decision_key" ON "Approval"("batchId", "step", "officerId", "cycle", "decision");
