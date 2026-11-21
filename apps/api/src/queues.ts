// Queue names live in one place so the api and the worker agree.
// Why BullMQ: Redis is already in the stack, and BullMQ gives retries with backoff, job ids for
// de-duplication, repeatable jobs (escalation) and safe recovery of jobs from a crashed worker.
export const EVENTS_QUEUE = "certiflow-events"; // batch.approved, delivery.resend, escalate.check
export const DELIVERY_QUEUE = "certiflow-delivery"; // one job per certificate WhatsApp message
