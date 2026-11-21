import { useEffect, useRef } from "react";

type LiveEvent = { type?: string; batchId?: string };
type Listener = (event: LiveEvent) => void;

// ONE EventSource per browser tab, shared by every screen. Browsers allow only ~6 open
// connections per site, so one stream per component would starve normal requests.
let source: EventSource | null = null;
const listeners = new Set<Listener>();

function connect() {
  if (source) return;
  source = new EventSource("/api/events");
  source.onmessage = (message) => {
    let event: LiveEvent = {};
    try {
      event = JSON.parse(message.data) as LiveEvent;
    } catch {
      /* heartbeat or unknown message: refresh anyway */
    }
    listeners.forEach((listener) => listener(event));
  };
}

function disconnectIfUnused() {
  if (listeners.size === 0 && source) {
    source.close();
    source = null;
  }
}

/**
 * Calls `onEvent` when the server reports a change this person may see.
 * - `batchId`: only react to events for that batch (the batch page).
 * - Bursts are combined: 60 WhatsApp updates in a second cause one refresh, not 60.
 */
export function useLiveEvents(onEvent: () => void, options: { batchId?: string; delayMs?: number } = {}) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const { batchId, delayMs = 600 } = options;

  useEffect(() => {
    connect();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const listener: Listener = (event) => {
      if (batchId && event.batchId && event.batchId !== batchId) return;
      if (timer) return; // a refresh is already scheduled
      timer = setTimeout(() => {
        timer = null;
        onEventRef.current();
      }, delayMs);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (timer) clearTimeout(timer);
      disconnectIfUnused();
    };
  }, [batchId, delayMs]);
}
