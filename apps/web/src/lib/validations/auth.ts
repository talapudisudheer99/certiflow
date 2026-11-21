import { z } from "zod";

// There are no passwords in CertiFlow (brief): you sign in by picking a demo person.
// The server still validates this again and reads the person only from the signed cookie afterwards.
export const loginSchema = z.object({
  userId: z.string().min(1, "Choose who you are signing in as"),
});

export type LoginInput = z.infer<typeof loginSchema>;
