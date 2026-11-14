export const TELEMETRY_EVENTS = ["progression", "prestige"] as const;
export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];

export const PROGRESSION_MILESTONES = [
  "world_1",
  "world_2",
  "world_3",
  "world_5",
  "recruit_1",
  "arc_1",
  "arc_5",
  "arc_10",
  "arc_20",
  "arc_40",
  "item_1",
  "passive_1",
  "ability_1",
  "prestige_1",
  "prestige_3",
  "prestige_10",
] as const;
export type ProgressionMilestone = (typeof PROGRESSION_MILESTONES)[number];

export interface TelemetryPayload {
  event: TelemetryEvent;
  milestone: ProgressionMilestone | "completed";
  animeId?: string;
  arcId?: string;
  value?: number;
  secondaryValue?: number;
  durationMinutes?: number;
}

const finiteOptional = (value: unknown) =>
  value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000_000_000);
/**
 * The shape every authored anime and arc id has (`naruto`, `naruto-vagues`). `animeId`/`arcId` are
 * content ids, never text: checking only their length let any client — the `origin` check binds a
 * browser, not curl — write free-form strings into the dataset, which `docs/telemetry.md` forbids.
 * `worker.test.ts` holds every authored id to this pattern, so new content can't be silently dropped.
 */
export const TELEMETRY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TELEMETRY_ID_MAX = 60;

const idOptional = (value: unknown) =>
  value === undefined ||
  (typeof value === "string" && value.length <= TELEMETRY_ID_MAX && TELEMETRY_ID_PATTERN.test(value));

export function validTelemetryPayload(value: unknown): value is TelemetryPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const allowed = new Set(["event", "milestone", "animeId", "arcId", "value", "secondaryValue", "durationMinutes"]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) return false;
  if (!TELEMETRY_EVENTS.includes(payload.event as TelemetryEvent)) return false;
  if (payload.event === "progression" && !PROGRESSION_MILESTONES.includes(payload.milestone as ProgressionMilestone)) return false;
  if (payload.event === "prestige" && payload.milestone !== "completed") return false;
  return (
    idOptional(payload.animeId) &&
    idOptional(payload.arcId) &&
    finiteOptional(payload.value) &&
    finiteOptional(payload.secondaryValue) &&
    finiteOptional(payload.durationMinutes)
  );
}
