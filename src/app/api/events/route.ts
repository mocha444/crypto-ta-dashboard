import { getRefreshSchedule, refreshDueSources, changed, fileState, DATA_FILE, CG_FILE, type FileState } from "@/lib/refresh";
import { watch } from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const HEARTBEAT_MS = 20_000;
const REFRESH_CHECK_MS = 30_000; // slow proactive check (not 1s poll)

function event(controller: ReadableStreamDefaultController, name: string, data: unknown) {
  controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));
}

function readFileState(path: string): FileState | null {
  try {
    const st = require("node:fs").statSync(path);
    return { size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return null;
  }
}

/**
 * GET /api/events — Server-Sent Events stream for the dashboard.
 *
 * Uses true fs.watch() on the cache files instead of a 1-second polling loop.
 * The server pushes events only when the disk cache actually changes.
 */
export async function GET(request: Request) {
  const stream = new ReadableStream({
    start(controller) {
      const sendSchedule = () => {
        event(controller, "schedule", {
          serverTime: Date.now(),
          sources: getRefreshSchedule(),
        });
      };

      const sendUpdate = () => {
        event(controller, "update", {
          serverTime: Date.now(),
          sources: getRefreshSchedule(),
        });
      };

      sendSchedule();

      let lastFiles: Record<string, FileState | null> = {
        [DATA_FILE]: fileState(DATA_FILE),
        [CG_FILE]: fileState(CG_FILE),
      };
      let lastHeartbeat = Date.now();
      let lastUpdateSent = 0;

      // Slow proactive refresh check (not rapid polling).
      const refreshTimer = setInterval(() => {
        // Only refresh if there are due sources; don't hammer upstream.
        try {
          void refreshDueSources();
        } catch (err) {
          console.error("[refresh] background refresh error:", err);
        }
      }, REFRESH_CHECK_MS);

      // Watch cache files for real changes (event-based, not polling-based).
      const fileStates: Record<string, FileState | null> = {
        [DATA_FILE]: fileState(DATA_FILE),
        [CG_FILE]: fileState(CG_FILE),
      };

      const handleFileChange = (path: string) => {
        const next = {
          [DATA_FILE]: fileState(DATA_FILE),
          [CG_FILE]: fileState(CG_FILE),
        };
        // Compare both files for any change.
        const anyChanged = [DATA_FILE, CG_FILE].some(
          (p) => {
            const prev = fileStates[p];
            const cur = next[p];
            if (prev == null && cur == null) return false;
            if (prev == null || cur == null) return true;
            return prev.size !== cur.size || prev.mtimeMs !== cur.mtimeMs;
          },
        );
        if (anyChanged) {
          fileStates[DATA_FILE] = next[DATA_FILE];
          fileStates[CG_FILE] = next[CG_FILE];
          const newCacheState = {
            [DATA_FILE]: fileState(DATA_FILE),
            [CG_FILE]: fileState(CG_FILE),
          };
          lastFiles = newCacheState;
          if (Date.now() - lastUpdateSent >= 2_000) {
            lastUpdateSent = Date.now();
            sendUpdate();
          }
        }
      };

      // fs.watch returns a FSWatcher; we observe both files.
      const dataWatcher = watch(DATA_FILE, { persistent: false }, () => handleFileChange(DATA_FILE));
      const cgWatcher = watch(CG_FILE, { persistent: false }, () => handleFileChange(CG_FILE));

      // Heartbeat (for connection health, kept separate from refresh events).
      const heartbeatTimer = setInterval(() => {
        if (Date.now() - lastHeartbeat >= HEARTBEAT_MS) {
          lastHeartbeat = Date.now();
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        }
      }, 5_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(refreshTimer);
        clearInterval(heartbeatTimer);
        dataWatcher.close();
        cgWatcher.close();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
