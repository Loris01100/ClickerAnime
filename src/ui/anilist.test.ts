import { afterEach, describe, expect, it, vi } from "vitest";
import { CAST_PAGES, portraitUrl } from "./anilist";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("portraitUrl", () => {
  it("dedupes concurrent lookups of the same name into one fetch call", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { Character: { image: { large: "https://example.com/a.jpg" } } } }), {
          status: 200,
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      portraitUrl("Test Character Dedupe", "character"),
      portraitUrl("Test Character Dedupe", "character"),
    ]);

    expect(first).toBe("https://example.com/a.jpg");
    expect(second).toBe("https://example.com/a.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves to null on a network failure instead of rejecting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    await expect(portraitUrl("Test Character Failure", "character")).resolves.toBeNull();
  });

  it("resolves to null on a non-OK response (AniList's 404 no-match included)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));

    await expect(portraitUrl("Test Character NotFound", "character")).resolves.toBeNull();
  });

  /**
   * A cast lookup is two query shapes: one id-resolution call (`Media(search:){id}`), then
   * `CAST_PAGES` page calls anchored on that id (`Media(id:){characters(page:)}`) — this mock tells
   * them apart by whether the query text asks for `characters(`, so each gets the right shape of
   * response regardless of call order.
   */
  function mockCastEndpoint(mediaId: number, castNodes: { name: { full: string }; image: { large: string } }[]) {
    return vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string) as { query: string };
      if (body.query.includes("characters(")) {
        return Response.json({ data: { Media: { characters: { nodes: castNodes } } } });
      }
      return Response.json({ data: { Media: { id: mediaId } } });
    });
  }

  it("skips the id-resolution search entirely for a pinned anime id (ANIME_ID_OVERRIDES)", async () => {
    const fetchMock = mockCastEndpoint(999, [{ name: { full: "Naruto Uzumaki" }, image: { large: "https://example.com/n.jpg" } }]);
    vi.stubGlobal("fetch", fetchMock);

    const url = await portraitUrl("Naruto Uzumaki", "character", "Naruto");

    expect(url).toBe("https://example.com/n.jpg");
    // pinned id means every call is a characters(page:) call — no Media(search:){id} call at all
    expect(fetchMock).toHaveBeenCalledTimes(CAST_PAGES);
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(call[1]!.body as string).query).toContain("characters(");
    }
  });

  it("with an anime context, searches that show's cast instead of the whole database", async () => {
    const fetchMock = mockCastEndpoint(42, [
      { name: { full: "Someone Else" }, image: { large: "https://example.com/wrong.jpg" } },
      { name: { full: "Test Cast Member" }, image: { large: "https://example.com/right.jpg" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const url = await portraitUrl("Test Cast Member", "character", "Test Anime Context");

    expect(url).toBe("https://example.com/right.jpg");
    // one id-resolution call + one Media(characters) call per cast page, never a Character(search:) call
    expect(fetchMock).toHaveBeenCalledTimes(1 + CAST_PAGES);
    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse(call[1]!.body as string);
      expect(body.query).toContain("Media");
    }
  });

  it("resolves the anime's id once and reuses it for every cast page (never re-runs the text search per page)", async () => {
    const fetchMock = mockCastEndpoint(99, [{ name: { full: "Someone" }, image: { large: "https://example.com/x.jpg" } }]);
    vi.stubGlobal("fetch", fetchMock);

    await portraitUrl("Someone", "character", "Id Stability Context");

    const idCalls = fetchMock.mock.calls.filter((c) => !JSON.parse(c[1]!.body as string).query.includes("characters("));
    const pageCalls = fetchMock.mock.calls.filter((c) => JSON.parse(c[1]!.body as string).query.includes("characters("));
    expect(idCalls).toHaveLength(1);
    expect(pageCalls).toHaveLength(CAST_PAGES);
    for (const call of pageCalls) {
      expect(JSON.parse(call[1]!.body as string).variables.id).toBe(99);
    }
  });

  it("shares one cast fetch across every character looked up in the same anime", async () => {
    const fetchMock = mockCastEndpoint(7, [
      { name: { full: "Shared Cast Alpha" }, image: { large: "https://example.com/a.jpg" } },
      { name: { full: "Shared Cast Beta" }, image: { large: "https://example.com/b.jpg" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const [alpha, beta] = await Promise.all([
      portraitUrl("Shared Cast Alpha", "character", "Shared Anime Context"),
      portraitUrl("Shared Cast Beta", "character", "Shared Anime Context"),
    ]);

    expect(alpha).toBe("https://example.com/a.jpg");
    expect(beta).toBe("https://example.com/b.jpg");
    // one cast fetch (id resolution + CAST_PAGES page requests) shared between both lookups, not two
    expect(fetchMock).toHaveBeenCalledTimes(1 + CAST_PAGES);
  });

  it("matches a French circumflexed name against AniList's doubled-vowel romanization", async () => {
    // "Hyûga" (in-game) vs "Hyuuga" (AniList) and "Chôji" vs "Chouji" — long vowels romanized
    // differently on each side, neither of which a plain diacritic strip alone resolves.
    const fetchMock = mockCastEndpoint(11, [
      { name: { full: "Hinata Hyuuga" }, image: { large: "https://example.com/hinata.jpg" } },
      { name: { full: "Chouji Akimichi" }, image: { large: "https://example.com/chouji.jpg" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    expect(await portraitUrl("Hinata Hyûga", "character", "Vowel Romanization Context")).toBe(
      "https://example.com/hinata.jpg"
    );
    expect(await portraitUrl("Chôji Akimichi", "character", "Vowel Romanization Context")).toBe(
      "https://example.com/chouji.jpg"
    );
  });

  it("applies a name override even when it's only part of a longer display name (a boss's subtitle)", async () => {
    // A boss can carry a fight-specific subtitle ("Sasuke Uchiwa — Vallée de la Fin") that an exact
    // dictionary lookup on the full string would miss — the override has to apply as a substring.
    const fetchMock = mockCastEndpoint(13, [
      { name: { full: "Sasuke Uchiha" }, image: { large: "https://example.com/sasuke.jpg" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const url = await portraitUrl("Sasuke Uchiwa — Vallée de la Fin", "character", "Suffix Override Context");

    expect(url).toBe("https://example.com/sasuke.jpg");
  });

  it("directly searches an explicit alias missing from the fetched cast pages", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string) as { query: string; variables: { s?: string } };
      if (body.query.includes("Character(search:")) {
        expect(body.variables.s).toBe("Isshiki Ootsutsuki");
        return Response.json({ data: { Character: { image: { large: "https://example.com/isshiki.jpg" } } } });
      }
      if (body.query.includes("characters(")) return Response.json({ data: { Media: { characters: { nodes: [] } } } });
      return Response.json({ data: { Media: { id: 97938 } } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(portraitUrl("Isshiki Ôtsutsuki", "character", "Boruto")).resolves.toBe(
      "https://example.com/isshiki.jpg"
    );
  });

  it("with a context, never falls back to a different show's character even on a name miss", async () => {
    const fetchMock = mockCastEndpoint(5, [
      { name: { full: "Unrelated Name" }, image: { large: "https://example.com/nope.jpg" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const url = await portraitUrl("No Such Cast Member", "character", "Yet Another Anime Context");

    expect(url).toBeNull();
    // only the id-resolution + cast-page fetches — no extra Character(search:) fallback call on top
    expect(fetchMock).toHaveBeenCalledTimes(1 + CAST_PAGES);
  });
});
