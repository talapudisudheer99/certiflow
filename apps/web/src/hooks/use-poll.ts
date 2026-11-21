import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Loads data and refreshes it on a timer (fallback for live events).
 * - Never runs two loads at once for the same screen.
 * - `enabled = false` pauses it (for example the home lists while a batch is open).
 */
export function usePoll<T>(load: () => Promise<T>, intervalMs = 15000, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const t = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(t);
  }, [refresh, intervalMs, enabled]);

  return { data, error, refresh, loading: data === null && error === null };
}
