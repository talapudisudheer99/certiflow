import { CheckIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { uploadCsv, type RowError } from "@/lib/batches";
import { cn } from "@/lib/utils";

const ACCEPT = ".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Reads the first sheet of an Excel file into the same CSV text the server already checks. */
async function excelToCsv(file: File) {
  const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) return "";
  return XLSX.utils.sheet_to_csv(sheet, { dateNF: "yyyy-mm-dd" });
}

/** A tiny example file so a centre can see the expected columns. Built in the browser. */
function downloadSample(courseCode: string) {
  const lines = [
    "full_name,phone,date_of_birth,course_code,score",
    `Asha Rao,9876500101,2001-04-12,${courseCode},78`,
    `Ravi Kumar,9876500102,2000-09-30,${courseCode},85`,
    `Sita Devi,9876500103,2002-01-05,${courseCode},66`,
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "candidates-sample.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/** Moment 1 UI: upload the centre's spreadsheet; if any row is bad, show every error and save nothing. */
export function CandidateUpload({
  batchId,
  courseCode,
  hasCandidates,
  onUploaded,
}: {
  batchId: string;
  courseCode: string;
  hasCandidates: boolean;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [saved, setSaved] = useState<{ count: number; fileName: string } | null>(null);

  async function onFile(file: File | undefined) {
    if (!file || busy) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) {
      setErrors([{ row: 0, field: "file", message: "Please choose a .csv or .xlsx file" }]);
      setSaved(null);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      const csv = name.endsWith(".xlsx") ? await excelToCsv(file) : await file.text();
      const { count } = await uploadCsv(batchId, csv);
      setSaved({ count, fileName: file.name });
      toast.success(`${count} candidates saved`);
      onUploaded();
    } catch (e) {
      setSaved(null);
      if (e instanceof ApiError && e.body?.errors) setErrors(e.body.errors as RowError[]);
      else toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card
      className={cn(dragOver && "bg-muted/40 ring-2 ring-dashed ring-primary")}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void onFile(e.dataTransfer.files?.[0]);
      }}
    >
      <CardHeader>
        <CardTitle>{hasCandidates ? "Replace candidates" : "Upload candidates"}</CardTitle>
        <CardDescription>
          {hasCandidates
            ? "Uploading again replaces the current list."
            : "CSV or Excel columns: full_name, phone, date_of_birth (YYYY-MM-DD), course_code, score. If any row is wrong, nothing is saved."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            disabled={busy}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
            {busy ? "Checking…" : "Choose CSV or Excel file"}
          </Button>
          <Button type="button" variant="link" className="h-auto px-0" onClick={() => downloadSample(courseCode)}>
            Download sample file
          </Button>
        </div>
        {saved && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckIcon className="size-4 text-primary" /> {saved.count} candidates saved from {saved.fileName}
          </p>
        )}
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
