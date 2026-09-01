import { createEffect, createSignal, onCleanup } from "solid-js";
import { achievementCount } from "../engine/achievements";
import type { GameStore } from "../engine/gameState";
import type { ProgressionMilestone, TelemetryPayload } from "../telemetrySchema";

export type TelemetryConsent = "pending" | "enabled" | "disabled";

const PREFERENCE_KEY = "clicker-anime:telemetry:preference:v1";
const SENT_KEY = "clicker-anime:telemetry:sent:v1";
const ACTIVE_MS_KEY = "clicker-anime:telemetry:active-ms:v1";
const ENDPOINT = "/api/telemetry";
const MAX_ACTIVE_SAMPLE_MS = 1_000;
const ACTIVE_PERSIST_STEP_MS = 5_000;

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

function loadActivePlayMs(): number {
  const parsed = Number(stored(ACTIVE_MS_KEY));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function persistActivePlayMs(value: number) {
  try {
    localStorage.setItem(ACTIVE_MS_KEY, String(Math.max(0, value)));
  } catch {
    // The stopwatch is best effort and must never interfere with gameplay.
  }
}

/** One visible tick's contribution to active play time; sleeping/hidden tabs cannot add hours. */
export function activePlayDeltaMs(previousAt: number, observedAt: number, visible = true): number {
  if (!visible || !Number.isFinite(previousAt) || !Number.isFinite(observedAt)) return 0;
  return Math.min(MAX_ACTIVE_SAMPLE_MS, Math.max(0, observedAt - previousAt));
}

/** Half-minute buckets keep pacing useful without emitting a high-precision behavioral trace. */
export function milestoneDurationMinutes(activePlayMs: number): number {
  if (!Number.isFinite(activePlayMs) || activePlayMs <= 0) return 0;
  return Math.max(0.5, Math.round((activePlayMs / 60_000) * 2) / 2);
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
  let activePlayMs = loadActivePlayMs();
  let persistedActivePlayMs = activePlayMs;
  let lastObservedAt = game.now();

  createEffect(() => {
    const observedAt = game.now();
    const visible = typeof document === "undefined" || document.visibilityState === "visible";
    activePlayMs += activePlayDeltaMs(lastObservedAt, observedAt, visible);
    lastObservedAt = observedAt;
    if (activePlayMs - persistedActivePlayMs >= ACTIVE_PERSIST_STEP_MS) {
      persistActivePlayMs(activePlayMs);
      persistedActivePlayMs = activePlayMs;
    }
  });

  if (typeof window !== "undefined") {
    const persist = () => persistActivePlayMs(activePlayMs);
    window.addEventListener("pagehide", persist);
    onCleanup(() => window.removeEventListener("pagehide", persist));
  }

  createEffect(() => {
    if (telemetryConsent() !== "enabled") return;
    const counts = game.achievementCounts();
    const candidates = progressionCandidates({
      worlds: game.prestige().unlockedAnimeIds.length,
      recruits: achievementCount(counts, "charactersRecruited"),
      arcs: achievementCount(counts, "arcsCleared"),
      items:
        achievementCount(counts, "commonItemsCollected") +
        game.foundItems().filter((item) => item.kind === "unique").length,
      passiveRanks: achievementCount(counts, "passiveRanksBought"),
      abilities: achievementCount(counts, "abilitiesUsed"),
      prestiges: achievementCount(counts, "prestiges"),
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
        durationMinutes: milestoneDurationMinutes(activePlayMs),
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
      // Bucketed like every other duration this module sends: a run's length is the one field here
      // precise enough to be a behavioural trace, and `docs/telemetry.md` promises a half-minute
      // bucket without qualifying which event it means. It used to leave `durationMs / 60_000` raw.
      durationMinutes: milestoneDurationMinutes(report.durationMs),
    });
  });
}
