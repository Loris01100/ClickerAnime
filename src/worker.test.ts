import { describe, expect, it, vi } from "vitest";
import worker from "./worker";

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
      }),
    });

    const response = await worker.fetch(request, { GAME_ANALYTICS: { writeDataPoint } });
    expect(response.status).toBe(204);
    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ["progression"],
      blobs: ["progression", "arc_1", "naruto", "naruto-vagues", "v1", "clickeranime.reesch.com"],
      doubles: [1, 0, 0],
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
    expect(writeDataPoint).not.toHaveBeenCalled();
  });
});
