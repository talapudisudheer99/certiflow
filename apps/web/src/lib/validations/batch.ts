import { z } from "zod";

// Shared idea with the API: the same rules run in the form and again on the server.
export const createBatchSchema = z.object({
  name: z.string().trim().min(3, "Batch name needs at least 3 characters").max(100, "Keep it under 100 characters"),
  courseCode: z
    .string()
    .trim()
    .min(1, "Course code is required")
    .regex(/^[A-Z0-9-]{2,20}$/, "Use capital letters, numbers and dashes, for example PSM-101"),
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
