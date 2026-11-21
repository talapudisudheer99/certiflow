import { UploadIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { uploadCsv, type RowError } from "@/lib/batches";

/** Moment 1 UI: upload the centre's CSV; if any row is bad, show every error and save nothing. */
export function CandidateUpload({ batchId, onUploaded }: { batchId: string; onUploaded: () => void }) {
  const [errors, setErrors] = useState<RowError[]>([]);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrors([{ row: 0, field: "file", message: "Please choose a .csv file (Excel: File > Save As > CSV)" }]);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      const { count } = await uploadCsv(batchId, await file.text());
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
          CSV columns: full_name, phone, date_of_birth (YYYY-MM-DD), course_code, score. If any row is wrong, nothing is
          saved. Uploading again replaces the list.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-3">
          <Input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button variant="outline" disabled tabIndex={-1} aria-hidden>
            <UploadIcon /> {busy ? "Checking..." : "CSV"}
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
