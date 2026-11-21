import { z } from "zod";

/** Max rows per upload, so one request cannot overload the server. */
export const MAX_ROWS = 5000;
export const CSV_COLUMNS = ["full_name", "phone", "date_of_birth", "course_code", "score"] as const;

export type RowError = { row: number; field: string; message: string };
export type CandidateRow = { fullName: string; phone: string; dateOfBirth: Date; courseCode: string; score: number };

/**
 * Minimal RFC 4180 CSV parser: commas, double quotes, "" escapes, CRLF or LF.
 * Kept in-house (40 lines) instead of adding a dependency; covered by tests.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // strip Excel's byte-order mark
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully empty lines (for example a trailing newline).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Indian mobile: 10 digits starting 6-9, optional +91 / 91 / 0 prefix. Stored as 10 digits. */
const phone = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "must be a 10-digit Indian mobile number"));

const rowSchema = z.object({
  full_name: z.string().trim().min(2, "is required (at least 2 characters)").max(100, "is too long"),
  phone,
  date_of_birth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
      return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v) && age >= 14 && age <= 100;
    }, "must be a real date and the candidate 14 to 100 years old"),
  course_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, "is not a valid course code"),
  score: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, "must be a whole number")
    .transform(Number)
    .pipe(z.number().min(0, "must be 0 to 100").max(100, "must be 0 to 100")),
});

/**
 * Validates EVERY row and returns all errors at once (moment 1), or the clean rows.
 * Row numbers match the spreadsheet: the header is row 1, the first candidate is row 2.
 */
export function validateCandidates(
  text: string,
  batchCourseCode: string,
): { ok: true; rows: CandidateRow[] } | { ok: false; errors: RowError[] } {
  const table = parseCsv(text);
  if (table.length === 0) return { ok: false, errors: [{ row: 0, field: "file", message: "The file is empty" }] };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return { ok: false, errors: [{ row: 1, field: "header", message: `Missing columns: ${missing.join(", ")}` }] };
  }
  const body = table.slice(1);
  if (body.length === 0) return { ok: false, errors: [{ row: 0, field: "file", message: "The file has no candidates" }] };
  if (body.length > MAX_ROWS) {
    return { ok: false, errors: [{ row: 0, field: "file", message: `Too many rows (max ${MAX_ROWS})` }] };
  }

  const errors: RowError[] = [];
  const rows: CandidateRow[] = [];
  const seenPhones = new Map<string, number>();

  body.forEach((cells, i) => {
    const rowNumber = i + 2;
    const record = Object.fromEntries(CSV_COLUMNS.map((c) => [c, cells[header.indexOf(c)] ?? ""]));
    const parsed = rowSchema.safeParse(record);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row: rowNumber, field: String(issue.path[0]), message: `${issue.path[0]} ${issue.message}` });
      }
      return;
    }
    const r = parsed.data;
    if (r.course_code !== batchCourseCode) {
      errors.push({ row: rowNumber, field: "course_code", message: `course_code must be ${batchCourseCode} for this batch` });
      return;
    }
    const firstRow = seenPhones.get(r.phone);
    if (firstRow) {
      errors.push({ row: rowNumber, field: "phone", message: `phone is a duplicate of row ${firstRow}` });
      return;
    }
    seenPhones.set(r.phone, rowNumber);
    rows.push({
      fullName: r.full_name,
      phone: r.phone,
      dateOfBirth: new Date(`${r.date_of_birth}T00:00:00Z`),
      courseCode: r.course_code,
      score: r.score,
    });
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, rows };
}
