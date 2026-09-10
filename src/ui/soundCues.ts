/**
 * Le son du jeu, en données. Pure : aucun `AudioContext` ici, seulement ce qu'il faut jouer et
 * quand — `sound.ts` en fait des oscillateurs. Tous les sons sont synthétisés : pas un fichier
 * audio à sourcer, à licencier ni à télécharger, et un son se retouche en changeant trois nombres.
 *
 * Le son est de la présentation, pas une règle : il ne lit que ce que le store expose déjà, et
 * n'y écrit jamais rien.
 */

/** Les réglages du joueur, rangés à part de la sauvegarde comme le thème : ce n'est pas la partie. */
export interface SoundPrefs {
  /** Coupe tout d'un coup, sans perdre les deux volumes réglés. */
  muted: boolean;
  /** 0..1, la position du curseur « Effets ». */
  effects: number;
  /** 0..1, la position du curseur « Musique ». */
  music: number;
  /** Les sons qui reviennent plusieurs fois par seconde : clics, ennemis, capacités, objets communs. */
  combat: boolean;
}

export const DEFAULT_SOUND_PREFS: SoundPrefs = { muted: false, effects: 0.6, music: 0.3, combat: true };

/** Une valeur illisible retombe sur le défaut de son champ, pas sur tout le défaut. */
export function parseSoundPrefs(raw: string | null): SoundPrefs {
  if (!raw) return { ...DEFAULT_SOUND_PREFS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SOUND_PREFS };
  }
  if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SOUND_PREFS };
  const value = parsed as Record<string, unknown>;
  const level = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
  const flag = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    muted: flag(value.muted, DEFAULT_SOUND_PREFS.muted),
    effects: level(value.effects, DEFAULT_SOUND_PREFS.effects),
    music: level(value.music, DEFAULT_SOUND_PREFS.music),
    combat: flag(value.combat, DEFAULT_SOUND_PREFS.combat),
  };
}

/**
 * La position d'un curseur, en gain. L'oreille entend en logarithme : un curseur linéaire met tout
 * le réglage utile dans son premier quart. Le carré est la courbe classique et reste à 0 en 0.
 */
export function gainOf(level: number): number {
  const clamped = Math.min(1, Math.max(0, level));
  return clamped * clamped;
}

const NOTE_OFFSET: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/** « A4 », « C#5 », « Bb3 » → Hz, en tempérament égal sur La 440. */
export function hz(note: string): number {
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!match) throw new Error(`Note illisible : ${note}`);
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  const semitones = NOTE_OFFSET[match[1]] + accidental + (Number(match[3]) - 4) * 12;
  return 440 * 2 ** (semitones / 12);
}

/** Numéro MIDI → Hz (69 = La 440). La musique compte en demi-tons, les effets en noms de notes. */
export function midiHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Un oscillateur : une note, ou un glissé de `freq` à `toFreq`. Temps en secondes depuis le départ. */
export interface ToneVoice {
  kind: "tone";
  wave: OscillatorType;
  freq: number;
  toFreq?: number;
  at: number;
  dur: number;
  gain: number;
  /** Montée du volume ; par défaut une attaque sèche de percussion. */
  attack?: number;
  /** Filtre passe-bas, pour arrondir une onde carrée ou en dents de scie. */
  lowpass?: number;
}

/** Un souffle de bruit blanc filtré : impacts, déchirures, froissements. */
export interface NoiseVoice {
  kind: "noise";
  at: number;
  dur: number;
  gain: number;
  /** Fréquence centrale du passe-bande : grave pour un choc, aiguë pour un frottement. */
  filter: number;
}

export type Voice = ToneVoice | NoiseVoice;

export type CueName =
  | "click"
  | "crit"
  | "kill"
  | "timerTick"
  | "commonItem"
  | "ability"
  | "bossAppear"
  | "bossDown"
  | "timeout"
  | "passive"
  | "crossover"
  | "pack"
  | "uniqueItem"
  | "achievement"
  | "recruit"
  | "evolution"
  | "towerFloor"
  | "arcClear"
  | "world"
  | "prestige";

export interface Cue {
  /** `combat` : les sons répétitifs, que le réglage « Bruits de combat » coupe à part. */
  category: "combat" | "event";
  voices: Voice[];
  /** Écart minimal entre deux lectures : vingt clics par seconde ne font pas vingt sons empilés. */
  minGapMs: number;
  /** Légère variation de hauteur à chaque lecture, pour qu'un son répété ne sonne pas mécanique. */
  jitter?: boolean;
}

const tone = (wave: OscillatorType, note: string | number, at: number, dur: number, gain: number, extra: Partial<ToneVoice> = {}): ToneVoice => ({
  kind: "tone",
  wave,
  freq: typeof note === "number" ? note : hz(note),
  at,
  dur,
  gain,
  ...extra,
});
const noise = (at: number, dur: number, gain: number, filter: number): NoiseVoice => ({ kind: "noise", at, dur, gain, filter });

/** Une suite de notes égales, `step` secondes l'une après l'autre. */
const arpeggio = (wave: OscillatorType, notes: string[], start: number, step: number, dur: number, gain: number, extra: Partial<ToneVoice> = {}) =>
  notes.map((note, i) => tone(wave, note, start + i * step, dur, gain, extra));

/**
 * Chaque son du jeu. La règle d'écriture : plus un son revient souvent, plus il est court, doux et
 * sans hauteur marquée — un clic est un « tac », pas une note. Les jingles, rares, ont le droit à
 * une mélodie. Tout reste dans une même tonalité claire (Do majeur) pour que deux sons qui se
 * chevauchent ne jurent pas.
 */
export const CUES: Record<CueName, Cue> = {
  click: {
    category: "combat",
    minGapMs: 30,
    jitter: true,
    voices: [tone("triangle", 620, 0, 0.05, 0.22, { toFreq: 380 }), noise(0, 0.03, 0.12, 3200)],
  },
  crit: {
    category: "combat",
    minGapMs: 30,
    jitter: true,
    voices: [
      tone("square", 880, 0, 0.07, 0.1, { toFreq: 1320, lowpass: 3500 }),
      tone("triangle", 1320, 0.03, 0.12, 0.14),
      noise(0, 0.05, 0.18, 5000),
    ],
  },
  kill: {
    category: "combat",
    minGapMs: 90,
    jitter: true,
    voices: [tone("sine", 520, 0, 0.09, 0.18, { toFreq: 170 }), noise(0, 0.05, 0.08, 1400)],
  },
  timerTick: {
    category: "combat",
    minGapMs: 300,
    voices: [tone("square", 1250, 0, 0.03, 0.05, { lowpass: 4000 })],
  },
  commonItem: {
    category: "combat",
    minGapMs: 140,
    jitter: true,
    voices: [tone("sine", "E6", 0, 0.07, 0.08), tone("sine", "A6", 0.045, 0.1, 0.06)],
  },
  ability: {
    category: "combat",
    minGapMs: 140,
    jitter: true,
    voices: [noise(0, 0.22, 0.12, 1600), tone("sawtooth", 220, 0, 0.18, 0.05, { toFreq: 660, lowpass: 2000 })],
  },
  bossAppear: {
    category: "event",
    minGapMs: 1_000,
    voices: [
      tone("sine", 55, 0, 0.8, 0.3),
      tone("sawtooth", 110, 0, 0.6, 0.1, { toFreq: 82, lowpass: 600 }),
      noise(0, 0.4, 0.12, 380),
      tone("triangle", "E3", 0.35, 0.5, 0.1),
    ],
  },
  bossDown: {
    category: "event",
    minGapMs: 400,
    voices: [
      noise(0, 0.45, 0.25, 700),
      ...arpeggio("square", ["G4", "C5", "E5"], 0.05, 0.09, 0.1, 0.07, { lowpass: 3000 }),
      tone("square", "G5", 0.32, 0.35, 0.07, { lowpass: 3000 }),
    ],
  },
  timeout: {
    category: "event",
    minGapMs: 800,
    voices: [
      tone("triangle", "E4", 0, 0.16, 0.14),
      tone("triangle", "C4", 0.16, 0.16, 0.14),
      tone("triangle", "A3", 0.32, 0.5, 0.14),
      tone("sawtooth", 110, 0.32, 0.5, 0.04, { toFreq: 98, lowpass: 500 }),
    ],
  },
  passive: {
    category: "event",
    minGapMs: 120,
    voices: [tone("square", "B5", 0, 0.06, 0.06, { lowpass: 4000 }), tone("square", "E6", 0.06, 0.22, 0.06, { lowpass: 4000 })],
  },
  crossover: {
    category: "event",
    minGapMs: 600,
    voices: [
      tone("sine", 400, 0, 0.45, 0.1, { toFreq: 900, attack: 0.08 }),
      tone("sine", 620, 0, 0.45, 0.07, { toFreq: 310, attack: 0.08 }),
      noise(0.05, 0.4, 0.05, 3000),
    ],
  },
  pack: {
    category: "event",
    minGapMs: 250,
    voices: [noise(0, 0.12, 0.2, 2600), ...arpeggio("triangle", ["C6", "E6", "G6"], 0.1, 0.06, 0.14, 0.08)],
  },
  uniqueItem: {
    category: "event",
    minGapMs: 400,
    voices: [
      tone("triangle", "E5", 0, 0.45, 0.08),
      ...arpeggio("sine", ["E6", "B6", "E7"], 0.02, 0.07, 0.18, 0.07),
    ],
  },
  achievement: {
    category: "event",
    minGapMs: 500,
    voices: [
      ...arpeggio("triangle", ["C5", "G5", "C6"], 0, 0.07, 0.12, 0.1),
      tone("triangle", "E6", 0.21, 0.4, 0.1),
    ],
  },
  recruit: {
    category: "event",
    minGapMs: 500,
    voices: [
      ...arpeggio("triangle", ["G5", "B5", "D6"], 0, 0.08, 0.1, 0.1),
      tone("triangle", "G6", 0.24, 0.35, 0.1),
      tone("sine", "G4", 0.24, 0.4, 0.08),
    ],
  },
  evolution: {
    category: "event",
    minGapMs: 800,
    voices: [
      tone("sine", 300, 0, 0.6, 0.1, { toFreq: 1200, attack: 0.1 }),
      ...["C5", "E5", "G5", "B5"].map((note) => tone("triangle", note, 0.55, 0.7, 0.06, { attack: 0.02 })),
    ],
  },
  towerFloor: {
    category: "event",
    minGapMs: 600,
    voices: [
      ...arpeggio("square", ["G4", "C5", "E5"], 0, 0.08, 0.1, 0.06, { lowpass: 3000 }),
      tone("square", "G5", 0.24, 0.4, 0.06, { lowpass: 3000 }),
      tone("triangle", "C4", 0.24, 0.45, 0.08),
    ],
  },
  arcClear: {
    category: "event",
    minGapMs: 800,
    voices: [
      noise(0, 0.35, 0.18, 700),
      ...arpeggio("square", ["C5", "E5", "G5"], 0.05, 0.1, 0.11, 0.07, { lowpass: 3200 }),
      tone("square", "C6", 0.35, 0.6, 0.07, { lowpass: 3200 }),
      ...["C4", "E4", "G4"].map((note) => tone("triangle", note, 0.35, 0.75, 0.06)),
    ],
  },
  world: {
    category: "event",
    minGapMs: 1_000,
    voices: [
      ...arpeggio("triangle", ["D5", "A5", "D6"], 0, 0.12, 0.2, 0.09),
      ...["D4", "F#4", "A4"].map((note) => tone("triangle", note, 0.36, 0.9, 0.06, { attack: 0.05 })),
    ],
  },
  prestige: {
    category: "event",
    minGapMs: 2_000,
    voices: [
      tone("sine", 200, 0, 1.1, 0.1, { toFreq: 1600, attack: 0.3 }),
      noise(0, 1.0, 0.06, 2000),
      ...["C4", "G4", "C5", "E5", "G5"].map((note) => tone("triangle", note, 0.9, 1.4, 0.05, { attack: 0.03 })),
    ],
  },
};

/**
 * Ce que l'écran d'effets retient d'un instant de la partie : des compteurs qui ne font que monter
 * (les échelons de succès, à vie), plus le boss à l'écran et le chrono. Un son part sur une
 * **montée** entre deux instants ; une baisse (Tout effacer) ne joue rien.
 */
export interface SoundFacts {
  mobsKilled: number;
  bossesKilled: number;
  arcsCleared: number;
  recruits: number;
  evolutions: number;
  commonItems: number;
  uniques: number;
  abilities: number;
  packs: number;
  passiveRanks: number;
  crossovers: number;
  prestiges: number;
  worlds: number;
  achievementTiers: number;
  towerFloors: number;
  /** Horodatage du dernier chrono expiré — arc, portail ou étage de la Tour. */
  timeoutAt: number;
  /** L'id du boss à l'écran, ou `null` : sert à annoncer son entrée. */
  bossId: string | null;
  /** Secondes pleines restant au chrono en cours, ou `null` sans chrono. */
  timerSeconds: number | null;
}

/**
 * Du plus important au moins important. Un seul son part par instant : quand un boss tombe, que
 * l'arc se termine, qu'un objet tombe et qu'un succès monte dans le même tick, quatre jingles
 * superposés ne se comprennent plus — on joue celui qui raconte le plus.
 */
export const CUE_PRIORITY: readonly CueName[] = [
  "prestige",
  "world",
  "arcClear",
  "towerFloor",
  "evolution",
  "recruit",
  "achievement",
  "uniqueItem",
  "bossDown",
  "pack",
  "crossover",
  "timeout",
  "bossAppear",
  "passive",
  "ability",
  "commonItem",
  "timerTick",
  "kill",
];

/** Le chrono ne tique que dans ses dernières secondes : avant, ce serait un métronome. */
export const TIMER_TICK_FROM_SECONDS = 5;

/**
 * Au-delà, ce n'est pas un tick de jeu mais une sauvegarde qu'on charge (import, copie de secours) :
 * la cadence plafonnée ne tue jamais autant d'ennemis en un tick. Rien ne joue.
 */
const LOAD_MOB_JUMP = 50;

/** Le son à jouer entre deux instants, ou `null`. */
export function cueBetween(prev: SoundFacts, next: SoundFacts): CueName | null {
  if (next.mobsKilled - prev.mobsKilled > LOAD_MOB_JUMP || next.prestiges - prev.prestiges > 1) return null;

  const rose = (key: keyof SoundFacts) => (next[key] as number) > (prev[key] as number);
  const fired = new Set<CueName>();
  if (rose("prestiges")) fired.add("prestige");
  if (rose("worlds")) fired.add("world");
  if (rose("arcsCleared")) fired.add("arcClear");
  if (rose("towerFloors")) fired.add("towerFloor");
  if (rose("evolutions")) fired.add("evolution");
  if (rose("recruits")) fired.add("recruit");
  if (rose("achievementTiers")) fired.add("achievement");
  if (rose("uniques")) fired.add("uniqueItem");
  if (rose("bossesKilled")) fired.add("bossDown");
  if (rose("packs")) fired.add("pack");
  if (rose("crossovers")) fired.add("crossover");
  if (next.timeoutAt !== prev.timeoutAt && next.timeoutAt > 0) fired.add("timeout");
  if (next.bossId !== null && next.bossId !== prev.bossId) fired.add("bossAppear");
  if (rose("passiveRanks")) fired.add("passive");
  if (rose("abilities")) fired.add("ability");
  if (rose("commonItems")) fired.add("commonItem");
  if (
    next.timerSeconds !== null &&
    next.timerSeconds > 0 &&
    next.timerSeconds <= TIMER_TICK_FROM_SECONDS &&
    prev.timerSeconds !== null &&
    next.timerSeconds < prev.timerSeconds
  ) {
    fired.add("timerTick");
  }
  if (rose("mobsKilled")) fired.add("kill");

  return CUE_PRIORITY.find((cue) => fired.has(cue)) ?? null;
}

/**
 * Un thème musical : une gamme, une grille de quatre accords et un tempo. La musique est générée à
 * la volée sur cette base (`sound.ts`) — un accord tenu par mesure, une basse, un arpège qui choisit
 * ses notes dans l'accord. Rien n'est écrit note à note, donc rien ne boucle à l'oreille.
 */
export interface MusicTheme {
  /** Tonique, en numéro MIDI. */
  root: number;
  /** Les sept degrés de la gamme, en demi-tons depuis la tonique. */
  scale: readonly number[];
  /** Un degré (0..6) par mesure ; chaque accord est la triade construite sur ce degré. */
  progression: readonly number[];
  bpm: number;
  /** Timbre de l'arpège. */
  lead: OscillatorType;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

/**
 * Un caractère par monde, dans l'esprit de sa série plutôt qu'en l'imitant : Naruto en dorien
 * (mineur mais qui garde espoir), Shippūden et Boruto plus sombres, Hunter x Hunter aventurier en
 * majeur, Bleach en mineur tendu, Horimiya lent et doux. Un monde ajouté a besoin de son entrée ici
 * (`sound.test.ts` l'exige) ; `DEFAULT_THEME` est celui du portail des mondes, et le filet d'un id
 * inconnu.
 */
export const MUSIC_THEMES: Record<string, MusicTheme> = {
  naruto: { root: 50, scale: DORIAN, progression: [0, 3, 0, 6], bpm: 100, lead: "triangle" },
  shippuden: { root: 48, scale: MINOR, progression: [0, 5, 2, 6], bpm: 92, lead: "triangle" },
  boruto: { root: 52, scale: MINOR, progression: [0, 5, 3, 4], bpm: 108, lead: "square" },
  "hunter-x-hunter": { root: 55, scale: MAJOR, progression: [0, 4, 5, 3], bpm: 104, lead: "triangle" },
  bleach: { root: 57, scale: MINOR, progression: [0, 6, 5, 4], bpm: 112, lead: "square" },
  horimiya: { root: 53, scale: MAJOR, progression: [0, 5, 3, 4], bpm: 84, lead: "sine" },
};

export const DEFAULT_THEME: MusicTheme = { root: 57, scale: MINOR, progression: [0, 3, 5, 4], bpm: 88, lead: "sine" };

export function musicThemeOf(animeId: string | undefined): MusicTheme {
  return (animeId && MUSIC_THEMES[animeId]) || DEFAULT_THEME;
}

/** Le boss accélère la musique sans en changer la tonalité : c'est le même monde, en plus tendu. */
export const BOSS_TEMPO = 1.2;

/** Les trois notes (MIDI) de l'accord d'une mesure, construit par tierces dans la gamme. */
export function chordOf(theme: MusicTheme, bar: number): number[] {
  const degree = theme.progression[((bar % theme.progression.length) + theme.progression.length) % theme.progression.length];
  return [0, 2, 4].map((step) => {
    const index = degree + step;
    return theme.root + theme.scale[index % 7] + 12 * Math.floor(index / 7);
  });
}
