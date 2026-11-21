import { useEffect, useRef } from "react";

/** Refresh the screen when the server says a batch this person can see has changed. */
export function useLiveEvents(onEvent: () => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onmessage = () => onEventRef.current();
    return () => source.close();
  }, []);
}
