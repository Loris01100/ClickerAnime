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
const shortOptional = (value: unknown) => value === undefined || (typeof value === "string" && value.length <= 80);

export function validTelemetryPayload(value: unknown): value is TelemetryPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const allowed = new Set(["event", "milestone", "animeId", "arcId", "value", "secondaryValue", "durationMinutes"]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) return false;
  if (!TELEMETRY_EVENTS.includes(payload.event as TelemetryEvent)) return false;
  if (payload.event === "progression" && !PROGRESSION_MILESTONES.includes(payload.milestone as ProgressionMilestone)) return false;
  if (payload.event === "prestige" && payload.milestone !== "completed") return false;
  return (
    shortOptional(payload.animeId) &&
    shortOptional(payload.arcId) &&
    finiteOptional(payload.value) &&
    finiteOptional(payload.secondaryValue) &&
    finiteOptional(payload.durationMinutes)
  );
}
