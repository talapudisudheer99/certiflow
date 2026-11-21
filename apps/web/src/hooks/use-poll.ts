import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Loads data and refreshes it every few seconds, so screens update without a manual refresh.
 * (Live updates are polling for now; Server-Sent Events are the planned next step, see README.)
 */
export function usePoll<T>(load: () => Promise<T>, intervalMs = 3000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(t);
  }, [refresh, intervalMs]);

  return { data, error, refresh, loading: data === null && error === null };
}
