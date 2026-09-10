import { describe, expect, it } from "vitest";
import { gameData } from "../data";
import {
  CUES,
  CUE_PRIORITY,
  DEFAULT_SOUND_PREFS,
  DEFAULT_THEME,
  MUSIC_THEMES,
  TIMER_TICK_FROM_SECONDS,
  chordOf,
  cueBetween,
  gainOf,
  hz,
  midiHz,
  musicThemeOf,
  parseSoundPrefs,
  type CueName,
  type SoundFacts,
} from "./soundCues";

const quiet: SoundFacts = {
  mobsKilled: 100,
  bossesKilled: 5,
  arcsCleared: 3,
  recruits: 4,
  evolutions: 0,
  commonItems: 10,
  uniques: 1,
  abilities: 20,
  packs: 0,
  passiveRanks: 2,
  crossovers: 0,
  prestiges: 0,
  worlds: 1,
  achievementTiers: 6,
  towerFloors: 0,
  timeoutAt: 0,
  bossId: null,
  timerSeconds: null,
};
const after = (patch: Partial<SoundFacts>): SoundFacts => ({ ...quiet, ...patch });

describe("sound preferences", () => {
  it("falls back to the defaults on a missing or unreadable value", () => {
    expect(parseSoundPrefs(null)).toEqual(DEFAULT_SOUND_PREFS);
    expect(parseSoundPrefs("{not json")).toEqual(DEFAULT_SOUND_PREFS);
    expect(parseSoundPrefs("42")).toEqual(DEFAULT_SOUND_PREFS);
  });

  it("keeps each readable field, clamps the volumes, and defaults the rest field by field", () => {
    expect(parseSoundPrefs(JSON.stringify({ muted: true, effects: 3, music: -1, combat: "yes" }))).toEqual({
      muted: true,
      effects: 1,
      music: 0,
      combat: DEFAULT_SOUND_PREFS.combat,
    });
  });

  it("maps a slider to a perceptual gain that stays inside 0..1", () => {
    expect(gainOf(0)).toBe(0);
    expect(gainOf(1)).toBe(1);
    expect(gainOf(0.5)).toBeCloseTo(0.25);
    expect(gainOf(2)).toBe(1);
    expect(gainOf(-1)).toBe(0);
  });
});

describe("sound pitches", () => {
  it("tunes notes on A 440 in equal temperament", () => {
    expect(hz("A4")).toBeCloseTo(440);
    expect(hz("A5")).toBeCloseTo(880);
    expect(hz("C4")).toBeCloseTo(261.63, 1);
    expect(hz("C#4")).toBeCloseTo(hz("Db4"));
    expect(midiHz(69)).toBeCloseTo(440);
    expect(() => hz("H2")).toThrow();
  });
});

describe("sound cues", () => {
  it("authors every voice with a positive length, pitch and a gain a mix can hold", () => {
    for (const [name, cue] of Object.entries(CUES)) {
      expect(cue.voices.length, name).toBeGreaterThan(0);
      for (const voice of cue.voices) {
        expect(voice.at, name).toBeGreaterThanOrEqual(0);
        expect(voice.dur, name).toBeGreaterThan(0);
        expect(voice.gain, name).toBeGreaterThan(0);
        expect(voice.gain, name).toBeLessThanOrEqual(0.4);
        if (voice.kind === "tone") expect(voice.freq, name).toBeGreaterThan(20);
      }
    }
  });

  it("ranks every cue a game event can fire, and only those — the click is played by the stage", () => {
    const direct: CueName[] = ["click", "crit"];
    expect(new Set(CUE_PRIORITY).size).toBe(CUE_PRIORITY.length);
    expect([...CUE_PRIORITY, ...direct].sort()).toEqual(Object.keys(CUES).sort());
  });

  it("plays nothing when nothing moved", () => {
    expect(cueBetween(quiet, quiet)).toBeNull();
  });

  it("plays only the most telling cue of a busy tick", () => {
    expect(cueBetween(quiet, after({ bossesKilled: 6, arcsCleared: 4, commonItems: 11, achievementTiers: 7 }))).toBe(
      "arcClear"
    );
    expect(cueBetween(quiet, after({ bossesKilled: 6 }))).toBe("bossDown");
    expect(cueBetween(quiet, after({ mobsKilled: 101, recruits: 5 }))).toBe("recruit");
    expect(cueBetween(quiet, after({ mobsKilled: 102 }))).toBe("kill");
  });

  it("stays silent on a counter going down — a hard reset is not an event", () => {
    expect(cueBetween(quiet, after({ mobsKilled: 0, bossesKilled: 0, worlds: 0 }))).toBeNull();
  });

  it("stays silent on a jump no tick could make — that is a save being loaded", () => {
    expect(cueBetween(quiet, after({ mobsKilled: 5_000, arcsCleared: 30 }))).toBeNull();
    expect(cueBetween(quiet, after({ prestiges: 4 }))).toBeNull();
  });

  it("announces a boss when one walks on, and a timer running out", () => {
    expect(cueBetween(quiet, after({ bossId: "naruto-boss" }))).toBe("bossAppear");
    expect(cueBetween(after({ bossId: "naruto-boss" }), after({ bossId: "naruto-boss" }))).toBeNull();
    expect(cueBetween(quiet, after({ timeoutAt: 1_000 }))).toBe("timeout");
  });

  it("ticks the timer only through its last seconds, once per second", () => {
    const at = (seconds: number | null) => after({ bossId: "b", timerSeconds: seconds });
    expect(cueBetween(at(TIMER_TICK_FROM_SECONDS + 1), at(TIMER_TICK_FROM_SECONDS))).toBe("timerTick");
    expect(cueBetween(at(12), at(11))).toBeNull();
    expect(cueBetween(at(3), at(3))).toBeNull();
    expect(cueBetween(at(1), at(0))).toBeNull();
    expect(cueBetween(at(null), at(4))).toBeNull();
  });
});

describe("music themes", () => {
  it("gives every world its own theme; the default is kept for the world portal", () => {
    for (const anime of gameData.animes) expect(MUSIC_THEMES[anime.id], anime.id).toBeDefined();
    expect(musicThemeOf(undefined)).toBe(DEFAULT_THEME);
    expect(musicThemeOf("unknown-world")).toBe(DEFAULT_THEME);
  });

  it("builds each bar's triad by thirds inside the scale, and loops the progression", () => {
    const naruto = MUSIC_THEMES.naruto;
    // D dorien : ré, fa, la.
    expect(chordOf(naruto, 0)).toEqual([50, 53, 57]);
    expect(chordOf(naruto, naruto.progression.length)).toEqual(chordOf(naruto, 0));
    for (const theme of [...Object.values(MUSIC_THEMES), DEFAULT_THEME]) {
      expect(theme.scale).toHaveLength(7);
      for (let bar = 0; bar < theme.progression.length; bar++) {
        const [a, b, c] = chordOf(theme, bar);
        expect(b - a).toBeGreaterThanOrEqual(3);
        expect(c - a).toBeGreaterThanOrEqual(6);
        expect(c - a).toBeLessThanOrEqual(8);
      }
    }
  });
});
