// useEventStream — subscribe to a server-sent events stream and trigger
// React-Query invalidations on each event (Plan 00026).
//
// The hook opens a single EventSource per (scope, id) pair, dispatches
// any received event payload via the provided onEvent callback, and
// closes the stream on unmount. Browser-native EventSource handles
// reconnect + backoff automatically.

import { useEffect, useRef } from "react";

import { apiBase } from "../api/client";

export type StreamScope = "pc" | "campaign" | "table";

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

    const base = apiBase();
    const url = `${base}/stream/${scope}/${id}`;

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
    // EventSource only fires listeners registered for that EXACT name, so
    // every server-side event type must appear here (plus the default
    // "message" for anything sent unnamed).
    const types = [
      "message",
      "pc.updated",
      "pc.spells.updated",
      "pc.features.updated",
      "pc.inventory.updated",
      "pc.combat.updated",
      "pc.turn.changed",
      "session.combat.updated",
      "dice.rolled",
      "table.updated",
      "table.ping",
    ];

    // The browser retries transient drops itself, but a non-200 response
    // (Render deploy / cold start) closes the EventSource permanently —
    // without this, an open tab stays deaf until a manual refresh.
    let es: EventSource | null = null;
    let retryTimer: number | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const source = new EventSource(url);
      es = source;
      types.forEach((t) => source.addEventListener(t, dispatch as EventListener));
      source.onerror = () => {
        if (disposed || source.readyState !== EventSource.CLOSED) return;
        source.close();
        retryTimer = window.setTimeout(connect, 4000);
      };
    };
    connect();

    return () => {
      disposed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      es?.close();
    };
  }, [scope, id, enabled]);
}
