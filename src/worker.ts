import { validTelemetryPayload } from "./telemetrySchema";

interface AnalyticsDataset {
  writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
}

interface Env {
  GAME_ANALYTICS: AnalyticsDataset;
}

const response = (status: number, body: string | null = null) =>
  new Response(body, { status, headers: { "cache-control": "no-store" } });

/**
 * Ceiling on one telemetry body. The fixed milestone schema fits in a couple of hundred bytes; this
 * is only here so a malformed or hostile request can't hand `JSON.parse` an arbitrary amount of work.
 *
 * It is checked on the body that was actually read, not on `content-length`: that header is absent
 * on a chunked request and can be unparseable on any of them, and `Number(null ?? 0)` is `0` while
 * `Number("x")` is `NaN` — both compare false against the limit, so the only guard the endpoint had
 * was one any client could opt out of. The header is still consulted first, purely to reject an
 * oversized upload before reading it.
 */
const MAX_BODY_CHARS = 2_048;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/api/telemetry") return response(404, "Not found");
    if (request.method !== "POST") return response(405, "Method not allowed");
    if (request.headers.get("origin") !== url.origin) return response(403, "Forbidden");
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BODY_CHARS) return response(413, "Payload too large");

    let raw: string;
    try {
      raw = await request.text();
    } catch {
      return response(400, "Invalid body");
    }
    if (raw.length > MAX_BODY_CHARS) return response(413, "Payload too large");

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return response(400, "Invalid JSON");
    }
    if (!validTelemetryPayload(payload)) return response(400, "Invalid event");

    env.GAME_ANALYTICS.writeDataPoint({
      // Event type is deliberately the sampling key: no player, device or session identifier is
      // generated, received or stored in the dataset.
      indexes: [payload.event],
      blobs: [payload.event, payload.milestone, payload.animeId ?? "", payload.arcId ?? "", "v1", url.hostname],
      doubles: [payload.value ?? 0, payload.secondaryValue ?? 0, payload.durationMinutes ?? 0],
    });
    return response(204);
  },
};
