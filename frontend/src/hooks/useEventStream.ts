// useEventStream — subscribe to a server-sent events stream and trigger
// React-Query invalidations on each event (Plan 00026).
//
// The hook opens a single EventSource per (scope, id) pair, dispatches
// any received event payload via the provided onEvent callback, and
// closes the stream on unmount. Browser-native EventSource handles
// reconnect + backoff automatically.

import { useEffect, useRef } from "react";

export type StreamScope = "pc" | "campaign";

export interface StreamEvent {
  type: string;
  pc_id?: string;
  campaign_id?: string;
  session_id?: string;
}

interface Options {
  /** Disable the stream without unmounting the component. */
  enabled?: boolean;
}

/**
 * Open an SSE stream for live-sync events.
 *
 * @param scope - "pc" or "campaign"
 * @param id - The PC or campaign UUID (path param)
 * @param onEvent - Called with each parsed event payload. Typically wraps
 *   a queryClient.invalidateQueries() call.
 * @param options - Optional flags (enabled to gate subscription)
 */
export function useEventStream(
  scope: StreamScope,
  id: string | undefined,
  onEvent: (event: StreamEvent) => void,
  options: Options = {},
): void {
  const { enabled = true } = options;
  // Keep onEvent in a ref so a re-render doesn't tear down the stream.
  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled || !id) return;

    const base = import.meta.env.VITE_API_BASE_URL || "/api";
    const url = `${base}/stream/${scope}/${id}`;

    const es = new EventSource(url);

    const dispatch = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as StreamEvent;
        handlerRef.current(data);
      } catch {
        // Ignore malformed payloads — defensive against intermediaries
        // that strip data lines.
      }
    };

    // SSE delivers events under the event name set on the server side.
    // Subscribe to the known types AND the default "message" event so we
    // don't miss anything sent without an explicit name.
    const types = [
      "message",
      "pc.updated",
      "pc.spells.updated",
      "pc.features.updated",
      "pc.inventory.updated",
      "session.combat.updated",
    ];
    types.forEach((t) => es.addEventListener(t, dispatch as EventListener));

    return () => {
      types.forEach((t) =>
        es.removeEventListener(t, dispatch as EventListener),
      );
      es.close();
    };
  }, [scope, id, enabled]);
}
