/**
 * AniList portrait lookups, run from the player's own browser — same pattern as the sibling project
 * Rasengames (`public/js/anilist.js`): calling AniList from a server/Worker gets a 403 "manually
 * blocked" because shared cloud egress IPs are blacklisted, but a request from each player's own
 * browser is exactly what AniList's CORS is for.
 *
 * Best effort: `portraitUrl` never rejects. A failed lookup resolves to `null`, which `Sprite.tsx`
 * renders as an empty placeholder — never a broken image, never a crash (this codebase has no
 * `<ErrorBoundary>` to catch a rejected `createResource`).
 */

export type PortraitKind = "character" | "anime";

const ENDPOINT = "https://graphql.anilist.co";
const TIMEOUT_MS = 5_000;
// Bump when a correction changes an already-cached portrait: successful hits are intentionally
// persistent, so keeping the old key would leave existing players on the wrong image forever.
const CACHE_KEY = "clicker-anime:portraits:v3";

// The name shown in-game (French localization) can differ from AniList's canonical spelling — the
// old French dub's "Uchiwa" vs AniList's "Uchiha", a character AniList only lists under an alias
// ("Obito Uchiwa" → "Tobi", his in-story identity for most of the series), a dropped letter
// ("Jiraya" → "Jiraiya"), a name too short to survive the token-length filter in `matchScore`
// ("Ay, le Quatrième Raikage" → "A"), or a character AniList has no standalone card for at all
// ("Nagato" → "Pain", the same person). Extend as more mismatches turn up; a name with no match here
// is just searched as-is.
//
// Applied as a substring replace, not an exact-name lookup: several of these also appear inside a
// boss's longer display name ("Sasuke Uchiwa — Vallée de la Fin"), which a dictionary keyed on the
// full string would miss entirely.
const NAME_OVERRIDES: [from: string, to: string][] = [
  ["Sasuke Uchiwa", "Sasuke Uchiha"],
  ["Itachi Uchiwa", "Itachi Uchiha"],
  ["Obito Uchiwa", "Tobi"],
  ["Shisui Uchiwa", "Shisui Uchiha"],
  ["Izumi Uchiwa", "Izumi Uchiha"],
  ["Fugaku Uchiwa", "Fugaku Uchiha"],
  ["Madara Uchiwa", "Madara Uchiha"],
  ["Jiraya", "Jiraiya"],
  ["Ay, le Quatrième Raikage", "A"],
  ["Nagato", "Pain"],
  ["Sarada Uchiwa", "Sarada Uchiha"],
  ["Isshiki Ôtsutsuki", "Isshiki Ootsutsuki"],
  ["Mikoto Uchiwa", "Mikoto Uchiha"],
  // After the pair above, so "Obito Uchiwa" is already "Tobi" and never rewritten twice; this one
  // catches the boss card that names him without a surname ("Obito — Jinchûriki de Dix-Queues").
  ["Obito", "Tobi"],
  ["Kirua Zoldik", "Killua Zoldyck"],
  ["Leolio Paradinaito", "Leorio Paladiknight"],
  ["Kuroro Lucifer", "Chrollo Lucilfer"],
  ["Uvôguine", "Uvogin"],
  ["Melody", "Senritsu"],
  ["Illumi Zoldik", "Illumi Zoldyck"],
  ["Alluka Zoldik", "Alluka Zoldyck"],
  ["Zeno Zoldik", "Zeno Zoldyck"],
  ["Geretta", "Gereta"],
  // AniList écrit la voyelle longue de Kurōdo en "ou" *sans* la doubler ("Kuroud"), ce que la
  // normalisation ne rattrape pas : "kurodo" contre "kurod". Le seul nom de Bleach dans ce cas.
  ["Kurôdo", "Kuroud"],
];

// The arc *enemies* go through the same table. They used to be anonymous by design ("Garde de
// Kiri", "Serpent gardien") and needed hand-placed art under `public/portraits/`; every one of
// them is now a named character AniList actually lists in that arc's cast, so a mob resolves the
// same way a recruit does. Keep it that way when adding an arc: pick a mob AniList has a card for,
// or it falls back to `Sprite`'s silhouette.

function applyNameOverrides(name: string): string {
  let result = name;
  for (const [from, to] of NAME_OVERRIDES) {
    if (result.includes(from)) result = result.replace(from, to);
  }
  return result;
}

// A franchise's exact TV-series entry isn't always what `Media(search:)` resolves to — verified live
// that searching "Naruto Shippūden" doesn't reliably land on the series (id 1735); it sometimes
// resolves to a movie/OVA sharing the same title prefix instead, silently pulling character lookups
// from the wrong cast. Pinning the id for a show sidesteps the ambiguity entirely. Extend this as
// more anime are added to the game; a name that isn't listed here still falls back to search.
const ANIME_ID_OVERRIDES: Record<string, number> = {
  Naruto: 20,
  "Naruto Shippūden": 1735,
  "The Last: Naruto the Movie": 16870,
  // Verified live, and a textbook case for this table: searching the bare "Boruto" resolves to
  // BORUTO: NARUTO THE MOVIE (21220), not the 293-episode TV series the game's cast comes from.
  Boruto: 97938,
  "Hunter x Hunter": 11061,
  Bleach: 269,
  Horimiya: 124080,
  // La Guerre sanglante Millénaire est une série à part sur AniList, avec sa propre fiche de
  // casting : aucun Sternritter ni membre de la Division Zéro n'apparaît sur celle de Bleach.
  "BLEACH: Sennen Kessen-hen": 116674,
};

// A character's own story can span a spin-off movie the game's data doesn't model as a separate
// anime — Toneri only exists on AniList under "The Last: Naruto the Movie", not the TV series, even
// though this game's arc for him still carries `animeId: "shippuden"`. Points that one character's
// cast lookup at the right title instead of the `anime` prop passed by the caller.
const CHARACTER_ANIME_OVERRIDES: Record<string, string> = {
  "Toneri Ôtsutsuki": "The Last: Naruto the Movie",
  // Le dernier arc de Bleach porte `animeId: "bleach"` — c'est un arc du monde, pas un monde à part
  // — mais son casting n'existe que sur la fiche de la Guerre sanglante Millénaire. Chacun de ces
  // noms est absent des huit pages de casting de Bleach ; y ajouter une entrée est la seule chose
  // qui les fasse résoudre.
  ...Object.fromEntries(
    [
      "Yhwach",
      "Jugram Haschwalth",
      "As Nodt",
      "Bambietta Basterbine",
      "Bazz-B",
      "Mask De Masculine",
      "NaNaNa Najahkoop",
      "Quilge Opie",
      "Driscoll Berci",
      "Asguiaro Ebern",
      "Ichibê Hyôsube",
      "Ôetsu Nimaiya",
      "Senjumaru Shutara",
      "Tenjirô Kirinji",
      "Kirio Hikifune",
      "Ryûnosuke Yuki",
    ].map((name) => [name, "BLEACH: Sennen Kessen-hen"])
  ),
};


interface CastMember {
  name: string;
  image: string | null;
}

const CHARACTER_QUERY = `query($s:String){Character(search:$s){image{large}}}`;
const MEDIA_QUERY = `query($s:String){Media(search:$s,type:ANIME){coverImage{large}}}`;
const MEDIA_ID_QUERY = `query($s:String){Media(search:$s,type:ANIME){id}}`;
// The wide key-art strip AniList shows at the top of a show's page — the backdrop the fight scene is
// staged against (`design.md` §2). Queried by numeric id, not by search, for the same reason the cast
// pages are: a franchise's movies share the series' title prefix, and a text search can land on one.
// A show can legitimately have no banner at all, which resolves to null like any other miss.
const MEDIA_BANNER_QUERY = `query($id:Int){Media(id:$id){bannerImage}}`;
// AniList caps `characters` at 25 per page regardless of the requested perPage, and a show's cast is
// sorted main-role-first but still runs hundreds deep — some minor named characters only turn up
// around page 4-8 (verified against the live API — e.g. Rôshi/Han only appear on page 8 of
// Shippuden's cast). `CAST_PAGES` pages are fetched in parallel and merged into one list, once per
// anime, then cached forever — worth the up-front cost since every character from that show resolves
// against the cached list afterward. `ANIME_ID_OVERRIDES` pinning the id (below) means this no
// longer costs an extra id-resolution call, which is what makes 8 pages affordable against AniList's
// tight rate limit (30 req/min, observed live): 8 requests per anime, once, ever.
//
// Pages are fetched by numeric media id, resolved once via MEDIA_ID_QUERY — not by re-running
// `Media(search:)` per page. A franchise like Naruto has several similarly-named entries (the TV
// series, multiple movies each also titled "Naruto Shippuden the Movie: ..."), and firing the same
// text search several times in parallel isn't guaranteed to resolve to the same one every time
// (observed live: some page requests silently returned a movie's cast instead of the series').
const CAST_QUERY = `query($id:Int,$p:Int){Media(id:$id){characters(page:$p,perPage:25,sort:[ROLE,FAVOURITES_DESC]){nodes{name{full}image{large}}}}}`;
export const CAST_PAGES = 8;

async function runQuery(graphql: string, variables: Record<string, unknown>): Promise<unknown> {
  if (typeof fetch === "undefined") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: graphql, variables }),
      signal: controller.signal,
    });
    // AniList answers "no match" on its singular fields with a 404, not an empty 200 — that's just
    // "nothing found", folded into the same null as any other failure.
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // network error, timeout/abort, malformed JSON — best effort, never throws
  } finally {
    clearTimeout(timer);
  }
}

// The game's French romanization writes a long vowel as a single circumflexed letter (Hyûga,
// Chôji) — diacritic-stripping alone turns that into the plain letter (hyuga, choji). AniList's
// romanization instead doubles the letter, or uses "ou" for a long o specifically (Hyuuga, Chouji)
// — so after stripping accents, both sides are also run through the same "ou" → "o" and doubled
// -vowel → single collapse, which is enough to line the two conventions up without a NAME_OVERRIDES
// entry for every affected name (there are dozens across the cast).
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ou/g, "o")
    .replace(/([aeiou])\1+/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// 0 = unrelated, 1 = one name's words are all contained in the other's (handles "Chiyo" vs "Chiyo
// (baa-sama)"-style aliasing either direction), 2 = the same name outright.
function matchScore(target: string, candidate: string): number {
  const a = normalize(target);
  const b = normalize(candidate);
  if (!a || !b) return 0;
  if (a === b) return 2;
  const aTok = new Set(a.split(" ").filter((t) => t.length > 1));
  const bTok = new Set(b.split(" ").filter((t) => t.length > 1));
  if (aTok.size === 0 || bTok.size === 0) return 0;
  const subsetOf = (small: Set<string>, big: Set<string>) => [...small].every((t) => big.has(t));
  return subsetOf(aTok, bTok) || subsetOf(bTok, aTok) ? 1 : 0;
}

function bestCastMatch(name: string, cast: CastMember[]): string | null {
  let best: { score: number; image: string | null } | null = null;
  for (const member of cast) {
    const score = matchScore(name, member.name);
    if (score > 0 && (!best || score > best.score)) best = { score, image: member.image };
  }
  return best?.image ?? null;
}

// One show's cast, cached per anime name — shared across every character from that show, so a dozen
// lookups from "Naruto" cost `CAST_PAGES` + 1 queries total, not a dozen separate Character ones.
const castCache = new Map<string, Promise<CastMember[]>>();

async function resolveMediaId(animeName: string): Promise<number | null> {
  const pinned = ANIME_ID_OVERRIDES[animeName];
  if (pinned !== undefined) return pinned;
  const data = (await runQuery(MEDIA_ID_QUERY, { s: animeName })) as { data?: { Media?: { id?: number } } } | null;
  return data?.data?.Media?.id ?? null;
}

async function fetchCastPage(mediaId: number, page: number): Promise<CastMember[]> {
  const data = (await runQuery(CAST_QUERY, { id: mediaId, p: page })) as {
    data?: { Media?: { characters?: { nodes?: { name?: { full?: string }; image?: { large?: string } }[] } } };
  } | null;
  const nodes = data?.data?.Media?.characters?.nodes ?? [];
  return nodes
    .map((n) => ({ name: n.name?.full ?? "", image: n.image?.large ?? null }))
    .filter((c): c is CastMember => c.name.length > 0);
}

async function fetchCast(animeName: string): Promise<CastMember[]> {
  const mediaId = await resolveMediaId(animeName);
  if (mediaId === null) return [];
  const pages = Array.from({ length: CAST_PAGES }, (_, i) => i + 1);
  const results = await Promise.all(pages.map((page) => fetchCastPage(mediaId, page).catch(() => [])));
  return results.flat();
}

function castOf(animeName: string): Promise<CastMember[]> {
  const key = animeName.toLowerCase();
  const existing = castCache.get(key);
  if (existing) return existing;
  const promise = fetchCast(animeName).catch(() => []);
  castCache.set(key, promise);
  return promise;
}

function cacheKey(name: string, kind: PortraitKind, context?: string): string {
  return kind === "character" ? `char:${(context ?? "").toLowerCase()}:${name.toLowerCase()}` : `anime:${name.toLowerCase()}`;
}

/**
 * `context` is the anime's name — required in practice for `kind: "character"` (every call site has
 * one) to search *within that show's cast* rather than AniList's whole character database. Without
 * it, a common name can resolve to the wrong show entirely (a "Chiyo" from some other anime instead
 * of Naruto's), which is worse than no portrait at all. Only an explicit name override may fall back
 * to the global search when that character is absent from the fetched cast pages.
 */
async function fetchPortrait(name: string, kind: PortraitKind, context?: string): Promise<string | null> {
  const resolvedName = applyNameOverrides(name);
  const resolvedContext = CHARACTER_ANIME_OVERRIDES[name] ?? context;

  if (kind === "character" && resolvedContext) {
    const match = bestCastMatch(resolvedName, await castOf(resolvedContext));
    if (match || resolvedName === name) return match;
  }

  const data = (await runQuery(kind === "character" ? CHARACTER_QUERY : MEDIA_QUERY, { s: resolvedName })) as {
    data?: { Character?: { image?: { large?: string } }; Media?: { coverImage?: { large?: string } } };
  } | null;
  const url = kind === "character" ? data?.data?.Character?.image?.large : data?.data?.Media?.coverImage?.large;
  return url ?? null;
}

// Only successful hits are persisted — a transient failure gets a fresh try next session rather
// than being baked in forever. Guarded like gameState.ts/theme.ts so it degrades to in-memory-only
// under vitest (no localStorage) or a blocked/full store, never throws.
function readPersisted(): Record<string, string> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

const persisted = readPersisted();

/**
 * Writes the cache back, at most once per animation frame's worth of resolutions.
 *
 * The store is one JSON blob, so every hit re-serialises *all* of it. Opening the Codex resolves a
 * hundred and seventy portraits within a second or two, and each one was a full stringify plus a
 * synchronous `localStorage.setItem` on the main thread. Coalescing them costs nothing: the entry
 * is already live in `persisted`, so a lookup landing before the flush is served from memory, and
 * `pagehide` forces the write out for the one case the timer would lose — the tab closing first.
 */
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushPersisted() {
  flushTimer = null;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(persisted));
  } catch {
    // quota exceeded / private mode — keep serving this session from memory only
  }
}

function persist(key: string, url: string) {
  persisted[key] = url;
  if (flushTimer === null) flushTimer = setTimeout(flushPersisted, 500);
}

if (typeof window !== "undefined") {
  // `pagehide` rather than `beforeunload`, for the reason gameState.ts gives: it is the one event
  // that fires on a closing tab everywhere, iOS included.
  window.addEventListener("pagehide", () => {
    if (flushTimer !== null) clearTimeout(flushTimer);
    flushPersisted();
  });
}

// Dedupes concurrent lookups of the same key within the tab's lifetime, hit or miss alike.
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Keys AniList had nothing for, remembered for this session only.
 *
 * Deliberately *not* written to `persisted`: only successful hits are baked in, so a transient
 * failure still gets a fresh try next session — see `readPersisted`. But within one session a miss
 * was remembered nowhere at all, so every remount of a `Sprite` for a character AniList has no card
 * for re-ran the whole lookup, cast pages included. Same intent, one session's worth of memory.
 */
const missed = new Set<string>();

/**
 * Shared tail of every lookup: serve a persisted hit, dedupe a concurrent miss, persist a new hit.
 * `portraitUrl` and `bannerUrl` differ only in the key they use and the fetch they run.
 */
function lookup(key: string, fetcher: () => Promise<string | null>): Promise<string | null> {
  if (key in persisted) return Promise.resolve(persisted[key]);
  if (missed.has(key)) return Promise.resolve(null);

  const existing = inFlight.get(key);
  if (existing) return existing;

  // `.catch` autant que `.then` : `portraitUrl` promet de ne jamais rejeter, et sans lui une
  // promesse rejetée resterait dans `inFlight` pour toute la session — chaque appel suivant sur
  // cette clé recevrait le même rejet, que le `createResource` de `Sprite` n'a aucun moyen de
  // rattraper (ce code n'a pas d'`<ErrorBoundary>`). Un échec se comporte comme un miss.
  const promise = fetcher()
    .catch(() => null)
    .then((url) => {
      inFlight.delete(key);
      if (url) persist(key, url);
      else missed.add(key);
      return url;
    });
  inFlight.set(key, promise);
  return promise;
}

/** Best-effort AniList portrait URL for a character or anime name; `null` on any miss or failure. */
export function portraitUrl(name: string, kind: PortraitKind, context?: string): Promise<string | null> {
  return lookup(cacheKey(name, kind, context), () => fetchPortrait(name, kind, context));
}

async function fetchBanner(animeName: string): Promise<string | null> {
  const mediaId = await resolveMediaId(animeName);
  if (mediaId === null) return null;
  const data = (await runQuery(MEDIA_BANNER_QUERY, { id: mediaId })) as {
    data?: { Media?: { bannerImage?: string | null } };
  } | null;
  return data?.data?.Media?.bannerImage ?? null;
}

/**
 * Best-effort AniList banner (wide key art) for a show, used as the fight scene's backdrop. Same
 * contract as `portraitUrl`: never rejects, `null` on any miss, and the caller must render fine
 * without it — `ClickStage` falls back to the plain `--stage-bg` gradient.
 */
export function bannerUrl(animeName: string): Promise<string | null> {
  return lookup(`banner:${animeName.toLowerCase()}`, () => fetchBanner(animeName));
}
