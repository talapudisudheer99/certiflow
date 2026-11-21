import { UploadIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { uploadCsv, type RowError } from "@/lib/batches";

/** Reads the first sheet of an Excel file into the same CSV text the server already checks. */
async function excelToCsv(file: File) {
  const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) return "";
  return XLSX.utils.sheet_to_csv(sheet, { dateNF: "yyyy-mm-dd" });
}

/** Moment 1 UI: upload the centre's spreadsheet; if any row is bad, show every error and save nothing. */
export function CandidateUpload({ batchId, onUploaded }: { batchId: string; onUploaded: () => void }) {
  const [errors, setErrors] = useState<RowError[]>([]);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) {
      setErrors([{ row: 0, field: "file", message: "Please choose a .csv or .xlsx file" }]);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      const csv = name.endsWith(".xlsx") ? await excelToCsv(file) : await file.text();
      const { count } = await uploadCsv(batchId, csv);
      toast.success(`${count} candidates saved`);
      onUploaded();
    } catch (e) {
      if (e instanceof ApiError && e.body?.errors) setErrors(e.body.errors as RowError[]);
      else toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload candidates</CardTitle>
        <CardDescription>
          CSV or Excel columns: full_name, phone, date_of_birth (YYYY-MM-DD), course_code, score. Excel is read in the
          browser and checked the same way. If any row is wrong, nothing is saved. Uploading again replaces the list.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-3">
          <Input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button variant="outline" disabled tabIndex={-1} aria-hidden>
            <UploadIcon /> {busy ? "Checking..." : "CSV or Excel"}
          </Button>
        </label>
        {errors.length > 0 && (
          <div className="space-y-2" role="alert">
            <p className="text-sm font-medium text-destructive">Nothing was saved. Fix these {errors.length} problems and upload again:</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Problem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.slice(0, 200).map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{e.row || "-"}</TableCell>
                    <TableCell>{e.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
