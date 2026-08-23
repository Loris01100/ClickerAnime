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
const CACHE_KEY = "clicker-anime:portraits:v2";

// The name shown in-game (French localization) can differ from AniList's canonical spelling — the
// old French dub's "Uchiwa" vs AniList's "Uchiha". Extend this as more mismatches turn up; a name
// that isn't listed here is just searched as-is.
const NAME_OVERRIDES: Record<string, string> = {
  "Sasuke Uchiwa": "Sasuke Uchiha",
  "Itachi Uchiwa": "Itachi Uchiha",
};

// A franchise's exact TV-series entry isn't always what `Media(search:)` resolves to — verified live
// that searching "Naruto Shippūden" doesn't reliably land on the series (id 1735); it sometimes
// resolves to a movie/OVA sharing the same title prefix instead, silently pulling character lookups
// from the wrong cast. Pinning the id for a show sidesteps the ambiguity entirely. Extend this as
// more anime are added to the game; a name that isn't listed here still falls back to search.
const ANIME_ID_OVERRIDES: Record<string, number> = {
  Naruto: 20,
  "Naruto Shippūden": 1735,
};

interface CastMember {
  name: string;
  image: string | null;
}

const CHARACTER_QUERY = `query($s:String){Character(search:$s){image{large}}}`;
const MEDIA_QUERY = `query($s:String){Media(search:$s,type:ANIME){coverImage{large}}}`;
const MEDIA_ID_QUERY = `query($s:String){Media(search:$s,type:ANIME){id}}`;
// AniList caps `characters` at 25 per page regardless of the requested perPage, and a show's cast is
// sorted main-role-first but still runs hundreds deep — some minor named characters only turn up
// around page 4-7 (verified against the live API). `CAST_PAGES` pages are fetched in parallel and
// merged into one list, once per anime, then cached forever — worth the up-front cost since every
// character from that show resolves against the cached list afterward. Kept modest (not pushed to
// page 7+) because AniList's own rate limit is tight (30 req/min, observed live) and this fires
// before the player has done anything else with their budget.
//
// Pages are fetched by numeric media id, resolved once via MEDIA_ID_QUERY — not by re-running
// `Media(search:)` per page. A franchise like Naruto has several similarly-named entries (the TV
// series, multiple movies each also titled "Naruto Shippuden the Movie: ..."), and firing the same
// text search several times in parallel isn't guaranteed to resolve to the same one every time
// (observed live: some page requests silently returned a movie's cast instead of the series').
const CAST_QUERY = `query($id:Int,$p:Int){Media(id:$id){characters(page:$p,perPage:25,sort:[ROLE,FAVOURITES_DESC]){nodes{name{full}image{large}}}}}`;
export const CAST_PAGES = 5;

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

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
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
 * of Naruto's), which is worse than no portrait at all — so a character lookup with no context falls
 * back to the old global search only as a last resort, not as the normal path.
 */
async function fetchPortrait(name: string, kind: PortraitKind, context?: string): Promise<string | null> {
  const resolvedName = NAME_OVERRIDES[name] ?? name;

  if (kind === "character" && context) {
    return bestCastMatch(resolvedName, await castOf(context));
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

function persist(key: string, url: string) {
  persisted[key] = url;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(persisted));
  } catch {
    // quota exceeded / private mode — keep serving this session from memory only
  }
}

// Dedupes concurrent lookups of the same key within the tab's lifetime, hit or miss alike.
const inFlight = new Map<string, Promise<string | null>>();

/** Best-effort AniList portrait URL for a character or anime name; `null` on any miss or failure. */
export function portraitUrl(name: string, kind: PortraitKind, context?: string): Promise<string | null> {
  const key = cacheKey(name, kind, context);
  if (key in persisted) return Promise.resolve(persisted[key]);

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = fetchPortrait(name, kind, context).then((url) => {
    inFlight.delete(key);
    if (url) persist(key, url);
    return url;
  });
  inFlight.set(key, promise);
  return promise;
}
