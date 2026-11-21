import { describe, expect, it } from "vitest";
import { parseCsv, validateCandidates } from "../src/domain/csv";

const header = "full_name,phone,date_of_birth,course_code,score";

describe("CSV parsing and row validation (moment 1, pure)", () => {
  it("parses quotes, escaped quotes and CRLF", () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\n')).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
  });

  it("accepts a clean file and normalises phone numbers", () => {
    const r = validateCandidates(`${header}\nAsha Rao,+91 98765 43210,2001-02-03,elec-101,88`, "ELEC-101");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows[0]).toMatchObject({ phone: "9876543210", courseCode: "ELEC-101", score: 88 });
  });

  it("reports every bad row with its spreadsheet row number and reason", () => {
    const csv = [
      header,
      "Asha Rao,9876543210,2001-02-03,ELEC-101,88", // row 2 ok
      "Bad Phone,12345,2001-02-03,ELEC-101,70", // row 3
      ",9876543211,2001-02-03,ELEC-101,70", // row 4 empty name
      "Old Score,9876543212,2001-02-03,ELEC-101,140", // row 5
      "Wrong Course,9876543213,2001-02-03,PLMB-1,70", // row 6
      "Dup Phone,9876543210,2001-02-03,ELEC-101,70", // row 7
      "Bad Date,9876543214,2001-02-30,ELEC-101,70", // row 8
    ].join("\n");
    const r = validateCandidates(csv, "ELEC-101");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 7, 8]);
      expect(r.errors.find((e) => e.row === 7)?.message).toMatch(/duplicate of row 2/);
    }
  });

  it("rejects missing columns and empty files", () => {
    expect(validateCandidates("name,phone\nA,1", "ELEC-101")).toMatchObject({ ok: false });
    expect(validateCandidates("", "ELEC-101")).toMatchObject({ ok: false });
    expect(validateCandidates(header, "ELEC-101")).toMatchObject({ ok: false });
  });
});
