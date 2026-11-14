import { describe, expect, it, vi } from "vitest";
import worker from "./worker";
import { gameData } from "./data";
import { validTelemetryPayload } from "./telemetrySchema";

describe("anonymous telemetry worker", () => {
  it("writes only a valid same-origin aggregate event", async () => {
    const writeDataPoint = vi.fn();
    const request = new Request("https://clickeranime.reesch.com/api/telemetry", {
      method: "POST",
      headers: { origin: "https://clickeranime.reesch.com", "content-type": "application/json" },
      body: JSON.stringify({
        event: "progression",
        milestone: "arc_1",
        animeId: "naruto",
        arcId: "naruto-vagues",
        value: 1,
        durationMinutes: 12.5,
      }),
    });

    const response = await worker.fetch(request, { GAME_ANALYTICS: { writeDataPoint } });
    expect(response.status).toBe(204);
    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ["progression"],
      blobs: ["progression", "arc_1", "naruto", "naruto-vagues", "v1", "clickeranime.reesch.com"],
      doubles: [1, 0, 12.5],
    });
  });

  it("rejects another origin, unknown fields and unknown milestones", async () => {
    const writeDataPoint = vi.fn();
    const env = { GAME_ANALYTICS: { writeDataPoint } };
    const send = (body: unknown, origin = "https://clickeranime.reesch.com") =>
      worker.fetch(
        new Request("https://clickeranime.reesch.com/api/telemetry", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        env
      );

    expect((await send({ event: "progression", milestone: "arc_1" }, "https://example.com")).status).toBe(403);
    expect((await send({ event: "progression", milestone: "arc_1", playerId: "secret" })).status).toBe(400);
    expect((await send({ event: "progression", milestone: "arc_999" })).status).toBe(400);
    expect((await send({ event: "progression", milestone: "arc_1", durationMinutes: -1 })).status).toBe(400);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it("rejects free-form text in the id fields", async () => {
    const writeDataPoint = vi.fn();
    const env = { GAME_ANALYTICS: { writeDataPoint } };
    const send = (body: unknown) =>
      worker.fetch(
        new Request("https://clickeranime.reesch.com/api/telemetry", {
          method: "POST",
          headers: { origin: "https://clickeranime.reesch.com", "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        env
      );

    for (const id of ["Texte libre", "https://example.com", "naruto<script>", "-naruto", "a".repeat(61), ""]) {
      expect((await send({ event: "progression", milestone: "arc_1", animeId: id })).status).toBe(400);
      expect((await send({ event: "progression", milestone: "arc_1", arcId: id })).status).toBe(400);
    }
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it("answers 429 once the per-address limiter refuses, without writing", async () => {
    const writeDataPoint = vi.fn();
    const limit = vi.fn(async () => ({ success: false }));
    const request = new Request("https://clickeranime.reesch.com/api/telemetry", {
      method: "POST",
      headers: { origin: "https://clickeranime.reesch.com", "cf-connecting-ip": "203.0.113.7" },
      body: JSON.stringify({ event: "progression", milestone: "arc_1" }),
    });

    const response = await worker.fetch(request, { GAME_ANALYTICS: { writeDataPoint }, TELEMETRY_LIMITER: { limit } });
    expect(response.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.7" });
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it("accepts every authored anime and arc id", () => {
    for (const id of [...gameData.animes.map((anime) => anime.id), ...gameData.arcs.map((arc) => arc.id)]) {
      expect(validTelemetryPayload({ event: "progression", milestone: "arc_1", animeId: id, arcId: id }), id).toBe(true);
    }
  });
});
