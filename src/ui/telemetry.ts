import { createEffect, createSignal } from "solid-js";
import type { GameStore } from "../engine/gameState";
import type { ProgressionMilestone, TelemetryPayload } from "../telemetrySchema";

export type TelemetryConsent = "pending" | "enabled" | "disabled";

const PREFERENCE_KEY = "clicker-anime:telemetry:preference:v1";
const SENT_KEY = "clicker-anime:telemetry:sent:v1";
const ENDPOINT = "/api/telemetry";

function stored(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

const initialPreference = stored(PREFERENCE_KEY);
const [telemetryConsent, setTelemetryConsentSignal] = createSignal<TelemetryConsent>(
  initialPreference === "enabled" || initialPreference === "disabled" ? initialPreference : "pending"
);

export { telemetryConsent };

export function setTelemetryConsent(consent: Exclude<TelemetryConsent, "pending">) {
  setTelemetryConsentSignal(consent);
  try {
    localStorage.setItem(PREFERENCE_KEY, consent);
  } catch {
    // A private/full store still gets the in-memory choice for this visit.
  }
}

function sentMilestones(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(stored(SENT_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

function markSent(keys: Set<string>) {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify([...keys]));
  } catch {
    // Sending remains best effort; gameplay must never depend on storage reserved for analytics.
  }
}

export function sendTelemetry(payload: TelemetryPayload) {
  if (telemetryConsent() !== "enabled") return;
  const body = JSON.stringify(payload);
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const accepted = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    if (accepted) return;
  }
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

interface MilestoneCandidate {
  key: ProgressionMilestone;
  reached: boolean;
  value: number;
}

export function progressionCandidates(facts: {
  worlds: number;
  recruits: number;
  arcs: number;
  items: number;
  passiveRanks: number;
  abilities: number;
  prestiges: number;
}): MilestoneCandidate[] {
  const thresholds = (prefix: "world" | "arc" | "prestige", value: number, levels: number[]) =>
    levels.map((level) => ({ key: `${prefix}_${level}` as ProgressionMilestone, reached: value >= level, value }));
  return [
    ...thresholds("world", facts.worlds, [1, 2, 3, 5]),
    { key: "recruit_1", reached: facts.recruits >= 1, value: facts.recruits },
    ...thresholds("arc", facts.arcs, [1, 5, 10, 20, 40]),
    { key: "item_1", reached: facts.items >= 1, value: facts.items },
    { key: "passive_1", reached: facts.passiveRanks >= 1, value: facts.passiveRanks },
    { key: "ability_1", reached: facts.abilities >= 1, value: facts.abilities },
    ...thresholds("prestige", facts.prestiges, [1, 3, 10]),
  ];
}

/** Registers aggregate milestone effects inside App's Solid owner. No player/session id is made. */
export function setupTelemetry(game: GameStore) {
  const sent = sentMilestones();
  let lastReportedPrestige = 0;

  createEffect(() => {
    if (telemetryConsent() !== "enabled") return;
    const counts = game.achievementCounts();
    const candidates = progressionCandidates({
      worlds: game.prestige().unlockedAnimeIds.length,
      recruits: counts.charactersRecruited ?? 0,
      arcs: counts.arcsCleared ?? 0,
      items: (counts.commonItemsCollected ?? 0) + game.foundItems().filter((item) => item.kind === "unique").length,
      passiveRanks: counts.passiveRanksBought ?? 0,
      abilities: counts.abilitiesUsed ?? 0,
      prestiges: counts.prestiges ?? 0,
    });
    const arc = game.activeArc();
    for (const candidate of candidates) {
      if (!candidate.reached || sent.has(candidate.key)) continue;
      sendTelemetry({
        event: "progression",
        milestone: candidate.key,
        animeId: arc?.animeId,
        arcId: arc?.id,
        value: candidate.value,
      });
      sent.add(candidate.key);
    }
    markSent(sent);
  });

  createEffect(() => {
    if (telemetryConsent() !== "enabled") return;
    const report = game.lastPrestigeReport();
    if (!report || report.endedAt === lastReportedPrestige) return;
    lastReportedPrestige = report.endedAt;
    sendTelemetry({
      event: "prestige",
      milestone: "completed",
      value: report.prestigeGained,
      secondaryValue: report.completion,
      durationMinutes: report.durationMs / 60_000,
    });
  });
}
