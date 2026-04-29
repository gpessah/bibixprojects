import { useEffect, useRef } from 'react';

/**
 * Subscribe to the backend SSE stream.
 * Calls `onEvent(eventName, data)` whenever a server-sent event arrives.
 * Automatically reconnects on disconnect (with exponential back-off).
 */
export function useSSE(onEvent: (event: string, data: unknown) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    let es: EventSource | null = null;
    let retryMs = 1000;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      es = new EventSource(`/api/events?token=${encodeURIComponent(token!)}`);

      es.addEventListener('connected', () => {
        retryMs = 1000; // reset back-off on success
      });

      // Generic message handler — fires for named events
      const knownEvents = ['board_updated', 'connected'];
      for (const name of knownEvents) {
        es!.addEventListener(name, (e: MessageEvent) => {
          try { onEventRef.current(name, JSON.parse(e.data)); } catch {}
        });
      }

      es.onerror = () => {
        es?.close();
        if (!cancelled) {
          setTimeout(connect, retryMs);
          retryMs = Math.min(retryMs * 2, 30000); // cap at 30 s
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, []); // token doesn't change during a session
}
