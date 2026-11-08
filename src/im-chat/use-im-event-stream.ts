import { useEffect, useRef, useState } from "react";
import { streamPublicTextSessionEvents, type TextTurnEvent } from "./transport";

export type ImEventStreamState = "idle" | "connecting" | "open" | "retrying";

interface UseImEventStreamOptions {
  robotId: string;
  sessionId: string;
  onEvent: (event: TextTurnEvent, eventId: string) => void;
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export function useImEventStream({ robotId, sessionId, onEvent }: UseImEventStreamOptions) {
  const onEventRef = useRef(onEvent);
  const [state, setState] = useState<ImEventStreamState>("idle");

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!sessionId) {
      setState("idle");
      return;
    }
    const controller = new AbortController();
    const seen = new Set<string>();
    let lastEventId = "";
    let failures = 0;

    const connect = async () => {
      setState("connecting");
      while (!controller.signal.aborted) {
        let receivedEvent = false;
        try {
          await streamPublicTextSessionEvents(
            robotId,
            sessionId,
            (event, eventId) => {
              receivedEvent = true;
              failures = 0;
              const key = eventId || event.eventId;
              if (key && seen.has(key)) return;
              if (key) {
                seen.add(key);
                lastEventId = key;
                if (seen.size > 1_000) seen.delete(seen.values().next().value ?? "");
              }
              onEventRef.current(event, key);
            },
            {
              signal: controller.signal,
              lastEventId,
              onOpen: () => setState("open"),
            },
          );
        } catch {
          if (controller.signal.aborted) return;
        }
        if (controller.signal.aborted) return;
        failures = receivedEvent ? 1 : failures + 1;
        setState("retrying");
        const delay = Math.min(1_000 * 2 ** Math.max(0, failures - 1), 10_000);
        await abortableDelay(delay, controller.signal);
      }
    };

    void connect();
    return () => controller.abort();
  }, [robotId, sessionId]);

  return state;
}
