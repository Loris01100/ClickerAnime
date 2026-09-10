import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { ACHIEVEMENT_CATEGORIES, achievementCount, achievementTiersCompleted } from "../engine/achievements";
import type { GameStore } from "../engine/gameState";
import { TOWER_MODES } from "../engine/tower";
import {
  BOSS_TEMPO,
  CUES,
  DEFAULT_THEME,
  chordOf,
  cueBetween,
  gainOf,
  midiHz,
  musicThemeOf,
  parseSoundPrefs,
  type CueName,
  type MusicTheme,
  type SoundFacts,
  type SoundPrefs,
  type Voice,
} from "./soundCues";

/**
 * Le son, côté navigateur : un `AudioContext`, trois bus de volume, les effets et la musique
 * générative. Tout ce qui se décide sans haut-parleur — quels sons, quand, sur quelle gamme — vit
 * dans `soundCues.ts`, testé sans DOM.
 *
 * Le graphe ne naît qu'au premier geste du joueur (clic, touche) : un navigateur refuse de jouer du
 * son avant, et un contexte créé trop tôt resterait suspendu. D'ici là, chaque son est simplement
 * sauté — jamais mis en file, sans quoi le premier clic lâcherait tout d'un coup.
 */

const KEY = "clicker-anime:sound:v1";

function readStored(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const [soundPrefs, setSoundPrefsSignal] = createSignal<SoundPrefs>(parseSoundPrefs(readStored()));

export { soundPrefs };

export function updateSoundPrefs(patch: Partial<SoundPrefs>) {
  const next = { ...soundPrefs(), ...patch };
  setSoundPrefsSignal(next);
  applyGains();
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Stockage bloqué ou plein : le réglage vaut pour cette visite.
  }
}

export function toggleMute() {
  updateSoundPrefs({ muted: !soundPrefs().muted });
}

interface Graph {
  ctx: AudioContext;
  /** Le bouton muet : 0 ou 1, en aval des deux volumes, pour ne jamais perdre leur réglage. */
  master: GainNode;
  effects: GainNode;
  music: GainNode;
  /** Deux secondes de bruit blanc, relues à un décalage au hasard par chaque souffle. */
  noise: AudioBuffer;
}

let graph: Graph | null = null;

/** Crée le graphe au premier geste, le réveille aux suivants. `null` sans Web Audio. */
function ensureGraph(): Graph | null {
  if (graph) {
    if (graph.ctx.state === "suspended" && document.visibilityState === "visible") void graph.ctx.resume();
    return graph;
  }
  if (typeof AudioContext === "undefined") return null;
  try {
    const ctx = new AudioContext();
    // Le compresseur rattrape le pire cas — un jingle sur la musique sur une rafale de clics —
    // avant qu'il ne sature la sortie.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 8;
    limiter.connect(ctx.destination);
    const master = ctx.createGain();
    master.connect(limiter);
    const effects = ctx.createGain();
    effects.connect(master);
    const music = ctx.createGain();
    music.connect(master);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    graph = { ctx, master, effects, music, noise };
    applyGains(true);
    return graph;
  } catch {
    return null;
  }
}

/** Pousse les réglages dans les trois bus, en glissant pour ne pas claquer. */
function applyGains(instant = false) {
  if (!graph) return;
  const prefs = soundPrefs();
  const t = graph.ctx.currentTime;
  const set = (node: GainNode, value: number) =>
    instant ? node.gain.setValueAtTime(value, t) : node.gain.setTargetAtTime(value, t, 0.03);
  set(graph.master, prefs.muted ? 0 : 1);
  set(graph.effects, gainOf(prefs.effects));
  set(graph.music, gainOf(prefs.music));
}

/** Joue une voix à `start` (horloge du contexte) vers `dest`. Chaque voix se débranche une fois finie. */
function playVoice(g: Graph, voice: Voice, start: number, dest: AudioNode, detune = 0) {
  const { ctx } = g;
  const t = start + voice.at;
  const end = t + voice.dur;
  const envelope = ctx.createGain();
  const attack = voice.kind === "tone" ? Math.min(voice.attack ?? 0.005, voice.dur * 0.5) : 0.003;
  // Rampes exponentielles : jamais vers 0 pile, que l'exponentielle ne peut pas atteindre.
  envelope.gain.setValueAtTime(0.0001, t);
  envelope.gain.exponentialRampToValueAtTime(Math.max(voice.gain, 0.0002), t + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  envelope.connect(dest);

  if (voice.kind === "tone") {
    const osc = ctx.createOscillator();
    osc.type = voice.wave;
    osc.frequency.setValueAtTime(voice.freq, t);
    if (voice.toFreq) osc.frequency.exponentialRampToValueAtTime(voice.toFreq, end);
    osc.detune.value = detune;
    if (voice.lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = voice.lowpass;
      osc.connect(filter).connect(envelope);
    } else {
      osc.connect(envelope);
    }
    osc.onended = () => envelope.disconnect();
    osc.start(t);
    osc.stop(end + 0.02);
  } else {
    const source = ctx.createBufferSource();
    source.buffer = g.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = voice.filter;
    filter.Q.value = 0.8;
    source.connect(filter).connect(envelope);
    source.onended = () => envelope.disconnect();
    source.start(t, Math.random() * 0.8, voice.dur + 0.02);
  }
}

const lastPlayedAt = new Map<CueName, number>();

/** Joue un effet, s'il est permis et que son dernier passage n'est pas trop proche. */
export function playCue(name: CueName) {
  const prefs = soundPrefs();
  const cue = CUES[name];
  if (prefs.muted || prefs.effects <= 0 || (cue.category === "combat" && !prefs.combat)) return;
  // Pas de geste encore, ou onglet caché : sauté, pas mis en attente (voir l'en-tête).
  if (!graph || graph.ctx.state !== "running") return;
  const now = performance.now();
  if (now - (lastPlayedAt.get(name) ?? -Infinity) < cue.minGapMs) return;
  lastPlayedAt.set(name, now);
  const detune = cue.jitter ? (Math.random() - 0.5) * 80 : 0;
  const start = graph.ctx.currentTime + 0.005;
  for (const voice of cue.voices) playVoice(graph, voice, start, graph.effects, detune);
}

// --- La musique ---
//
// Un ordonnanceur à anticipation, le schéma classique de Web Audio : un `setInterval` lâche réveille
// la boucle toutes les 100 ms, et elle place sur l'horloge précise du contexte les croches des
// 250 ms suivantes. Le tempo tient même quand le fil principal hoquette.

const SCHEDULER_MS = 100;
const LOOKAHEAD_S = 0.25;
/** Huit croches par mesure de quatre temps. */
const STEPS_PER_BAR = 8;

const music = {
  theme: DEFAULT_THEME as MusicTheme,
  /** Un boss à l'écran : tempo plus vif, basse à chaque temps, percussions. */
  intense: false,
  playing: false,
};
let nextStepAt = 0;
let step = 0;
let scheduledTheme: MusicTheme | null = null;

function scheduleMusic() {
  if (!graph || graph.ctx.state !== "running") return;
  const prefs = soundPrefs();
  if (!music.playing || prefs.muted || prefs.music <= 0) {
    nextStepAt = 0;
    return;
  }
  const { ctx } = graph;
  // Reprise après un silence, un onglet caché ou un changement de monde : on repart d'une mesure
  // pleine, un peu devant l'horloge, plutôt que de rattraper des croches déjà passées.
  if (nextStepAt < ctx.currentTime || scheduledTheme !== music.theme) {
    nextStepAt = ctx.currentTime + 0.05;
    step = 0;
    scheduledTheme = music.theme;
  }
  while (nextStepAt < ctx.currentTime + LOOKAHEAD_S) {
    const beat = 60 / (music.theme.bpm * (music.intense ? BOSS_TEMPO : 1));
    playStep(graph, step, nextStepAt, beat);
    nextStepAt += beat / 2;
    step++;
  }
}

function playStep(g: Graph, index: number, t: number, beat: number) {
  const { theme, intense } = music;
  const position = index % STEPS_PER_BAR;
  const chord = chordOf(theme, Math.floor(index / STEPS_PER_BAR));
  const note = (midi: number, dur: number, gain: number, wave: OscillatorType, extra: Partial<Voice> = {}) =>
    playVoice(g, { kind: "tone", wave, freq: midiHz(midi), at: 0, dur, gain, ...extra } as Voice, t, g.music);

  // L'accord de la mesure, tenu et arrondi : le lit sur lequel tout le reste se pose.
  if (position === 0) {
    for (const midi of chord) note(midi, beat * 4, 0.04, "triangle", { attack: beat * 0.8, lowpass: 1400 });
  }
  // La basse : la fondamentale une octave dessous, à chaque demi-mesure — à chaque temps sur un boss.
  if (position % (intense ? 2 : 4) === 0) {
    note(chord[0] - 12, beat * (intense ? 0.9 : 1.8), 0.13, "sine", { attack: 0.01 });
  }
  // L'arpège : une note de l'accord, une octave au-dessus, jouée ou non au hasard. Plus dense sur
  // un boss. C'est ce hasard qui empêche la boucle de quatre mesures de s'entendre.
  if (Math.random() < (intense ? 0.9 : 0.55)) {
    const midi = chord[Math.floor(Math.random() * chord.length)] + 12 + (Math.random() < 0.25 ? 12 : 0);
    note(midi, beat * 0.45, theme.lead === "square" ? 0.025 : 0.045, theme.lead, { lowpass: 2600 });
  }
  if (intense) {
    if (position % 2 === 0) playVoice(g, { kind: "tone", wave: "sine", freq: 95, toFreq: 45, at: 0, dur: 0.14, gain: 0.2 }, t, g.music);
    else playVoice(g, { kind: "noise", at: 0, dur: 0.03, gain: 0.035, filter: 7000 }, t, g.music);
  }
}

/**
 * Branche le son sur la partie, dans le propriétaire Solid d'`App` (comme `setupTelemetry`). Les
 * effets d'événement se déduisent de ce que le store expose déjà : aucun appel n'est ajouté au
 * moteur, qui n'a pas à savoir qu'on l'écoute.
 */
export function setupSound(game: GameStore) {
  if (typeof window === "undefined") return;

  const wake = () => void ensureGraph();
  const onVisibility = () => {
    if (!graph) return;
    if (document.visibilityState === "hidden") void graph.ctx.suspend();
    else void graph.ctx.resume();
  };
  window.addEventListener("pointerdown", wake, true);
  window.addEventListener("keydown", wake, true);
  document.addEventListener("visibilitychange", onVisibility);
  const scheduler = setInterval(scheduleMusic, SCHEDULER_MS);
  onCleanup(() => {
    window.removeEventListener("pointerdown", wake, true);
    window.removeEventListener("keydown", wake, true);
    document.removeEventListener("visibilitychange", onVisibility);
    clearInterval(scheduler);
  });

  const facts = createMemo<SoundFacts>(() => {
    const counts = game.achievementCounts();
    const count = (id: Parameters<typeof achievementCount>[1]) => achievementCount(counts, id);
    const inTower = game.towerActiveMode() !== null;
    const enemy = game.enemy();
    const onBoss = !!enemy && (enemy.id === game.activeArc()?.boss.id || game.portalTargets().some((t) => t.active));
    const timerMs = inTower ? game.towerTimeLeft() : game.timerRemaining();
    return {
      mobsKilled: count("mobsKilled"),
      bossesKilled: count("bossesKilled"),
      arcsCleared: count("arcsCleared"),
      recruits: count("charactersRecruited"),
      evolutions: count("evolutionsUnlocked"),
      commonItems: count("commonItemsCollected"),
      uniques: game.foundItems().filter((item) => item.kind === "unique").length,
      abilities: count("abilitiesUsed"),
      packs: count("packsOpened"),
      passiveRanks: count("passiveRanksBought"),
      crossovers: count("crossoversUsed"),
      prestiges: count("prestiges"),
      worlds: game.prestige().unlockedAnimeIds.length,
      achievementTiers: ACHIEVEMENT_CATEGORIES.reduce(
        (sum, category) => sum + achievementTiersCompleted(category, count(category.id)),
        0
      ),
      towerFloors: TOWER_MODES.reduce((sum, mode) => sum + game.towerHighestFloorOf(mode.id), 0),
      timeoutAt: Math.max(game.lastTimeout(), game.towerLastFailure()?.at ?? 0),
      bossId: inTower
        ? game.towerOnBoss()
          ? `tour-${game.towerFloor()}`
          : null
        : onBoss
          ? enemy!.id
          : null,
      timerSeconds: timerMs === null ? null : Math.ceil(timerMs / 1000),
    };
  });

  // Sans `defer` : avec lui, `on` ne retient pas la première valeur et le premier son serait perdu.
  // La toute première lecture n'a pas de précédent, et ne joue donc rien — le chargement est muet.
  createEffect(
    on(facts, (next, prev) => {
      if (!prev) return;
      const cue = cueBetween(prev, next);
      if (cue) playCue(cue);
    })
  );

  createEffect(() => {
    music.theme = musicThemeOf(game.activeArc()?.animeId);
    music.intense = facts().bossId !== null;
    music.playing = !game.paused();
  });
}
