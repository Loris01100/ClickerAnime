import { validTelemetryPayload } from "./telemetrySchema";

interface AnalyticsDataset {
  writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
}

interface Env {
  GAME_ANALYTICS: AnalyticsDataset;
}

const response = (status: number, body: string | null = null) =>
  new Response(body, { status, headers: { "cache-control": "no-store" } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/api/telemetry") return response(404, "Not found");
    if (request.method !== "POST") return response(405, "Method not allowed");
    if (request.headers.get("origin") !== url.origin) return response(403, "Forbidden");
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 2_048) return response(413, "Payload too large");

    let payload: unknown;
    try {
      payload = await request.json();
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
