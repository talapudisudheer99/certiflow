import { BadgeCheckIcon, SearchIcon, ShieldAlertIcon, ShieldXIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

type Result =
  | { status: "NOT_FOUND"; number: string }
  | { status: "VALID" | "CANCELLED"; number: string; holder: string; course: string; issuedOn: string; centre: string; cancelledOn?: string };

/** Public page, no login (US-9). Opened from the QR / link: /verify/PSM-2026-000123 */
export function VerifyPage({ initialNumber }: { initialNumber: string }) {
  const [number, setNumber] = useState(initialNumber);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(n = number) {
    const trimmed = n.trim().toUpperCase();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api<Result>(`/verify/${encodeURIComponent(trimmed)}`));
      window.history.replaceState(null, "", `/verify/${trimmed}`);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Could not check");
    } finally {
      setBusy(false);
    }
  }

  // A link like /verify/PSM-2026-000123 should show the result straight away.
  useEffect(() => {
    if (initialNumber.trim()) void check(initialNumber);
    // Only when the page opens with a number in the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNumber]);

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-6 p-4">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <BadgeCheckIcon className="size-6 text-primary" /> CertiFlow certificate check
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Is this certificate genuine?</CardTitle>
          <CardDescription>Enter the number printed on the certificate. No login needed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void check(); }}>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="PSM-2026-000123" aria-label="Certificate number" />
            <Button type="submit" disabled={busy || !number.trim()}><SearchIcon /> Check</Button>
          </form>
          {busy && !result && <p className="mt-3 text-sm text-muted-foreground">Checking this number...</p>}
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {result?.status === "VALID" && (
        <Card className="ring-2 ring-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary"><BadgeCheckIcon /> Valid certificate</CardTitle>
            <CardDescription>{result.number}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <span className="text-muted-foreground">Holder</span><span>{result.holder}</span>
            <span className="text-muted-foreground">Course</span><span>{result.course}</span>
            <span className="text-muted-foreground">Issued on</span><span>{result.issuedOn}</span>
            <span className="text-muted-foreground">Centre</span><span>{result.centre}</span>
          </CardContent>
        </Card>
      )}
      {result?.status === "CANCELLED" && (
        <Card className="ring-2 ring-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive"><ShieldXIcon /> Not valid: this certificate was cancelled</CardTitle>
            <CardDescription>{result.number} was cancelled by the state office on {result.cancelledOn}. Do not accept it.</CardDescription>
          </CardHeader>
        </Card>
      )}
      {result?.status === "NOT_FOUND" && (
        <Card className="ring-2 ring-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive"><ShieldAlertIcon /> No certificate with this number</CardTitle>
            <CardDescription>Check the number. If it is printed on a certificate, the certificate is not genuine.</CardDescription>
          </CardHeader>
        </Card>
      )}
      <a href="/" className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">Staff sign in</a>
    </main>
  );
}
