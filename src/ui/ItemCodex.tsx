import { For, Show, createMemo, createSignal } from "solid-js";
import type { GameStore } from "../engine/gameState";
import type { Arc, Enemy, Item } from "../engine/types";
import { describeModifier } from "./describe";
import { IconBookmark, IconStar } from "./icons";

const KIND_LABEL: Record<Item["kind"], string> = {
  common: "Objet commun",
  unique: "Objet unique",
};

/**
 * The Codex's second tab: every item in the game, found or not, and what it is actually for —
 * where it drops, whose passive it ranks up (commons) and what it grants once equipped (uniques).
 * Same two-pane shell as the character tab, so it slots into `Codex.tsx` without its own overlay.
 */
export default function ItemCodex(props: { game: GameStore }) {
  const items = () => props.game.data.items;
  const [selectedId, setSelectedId] = createSignal(items()[0]?.id ?? "");
  const selected = createMemo(() => items().find((i) => i.id === selectedId()));

  const animeName = (animeId: string) => props.game.data.animes.find((a) => a.id === animeId)?.name ?? animeId;
  const held = (item: Item) => props.game.countOf(item.id);

  /** The arc and the enemy that hand this item over — a mob for a common, the boss for a unique. */
  function sourceOf(item: Item): { arc: Arc; enemy: Enemy } | null {
    for (const arc of props.game.data.arcs) {
      if (arc.boss.itemId === item.id) return { arc, enemy: arc.boss };
      const mob = arc.mobs.find((m) => m.itemId === item.id);
      if (mob) return { arc, enemy: mob };
    }
    return null;
  }

  /** Commons only: the characters whose passive this item ranks up (the cast of its own arc). */
  const rankedUpBy = (item: Item) =>
    props.game.data.characters.filter((c) => props.game.passiveItemOf(c)?.id === item.id);

  /** Uniques only: who is wearing it right now, if anyone. */
  const wornBy = (item: Item) => {
    const entry = Object.entries(props.game.characterEquipment()).find(([, itemId]) => itemId === item.id);
    return entry ? props.game.data.characters.find((c) => c.id === entry[0]) : undefined;
  };

  /** Uniques only: the restriction in prose, or null when anyone can wear it. */
  function restrictionOf(item: Item): string | null {
    const rule = item.equippableBy;
    if (!rule) return null;
    if (rule.characterIds)
      return rule.characterIds.map((id) => props.game.data.characters.find((c) => c.id === id)?.name ?? id).join(", ");
    if (rule.animeIds) return rule.animeIds.map(animeName).join(", ");
    if (rule.tags) return `personnages « ${rule.tags.join(" », « ")} »`;
    return null;
  }

  /** Items grouped by the world they drop in; anything sourceless lands in a trailing group. */
  const groups = createMemo(() => {
    const byAnime = new Map<string, Item[]>();
    for (const item of items()) {
      const animeId = sourceOf(item)?.arc.animeId ?? "";
      byAnime.set(animeId, [...(byAnime.get(animeId) ?? []), item]);
    }
    return [...byAnime.entries()].sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : 0));
  });

  /** Items have no portrait to fetch — a glyph stands in, sized up for the detail pane's hero. */
  const iconOf = (item: Item, size?: number) =>
    item.kind === "unique" ? <IconStar class="gold" size={size} /> : <IconBookmark class="blue" size={size} />;

  return (
    <>
      <div class="codex-list scroll">
        <For each={groups()}>
          {([animeId, list]) => (
            <>
              <div class="codex-group">{animeId ? animeName(animeId) : "Hors monde"}</div>
              <For each={list}>
                {(item) => (
                  <button
                    class="codex-entry"
                    classList={{ active: item.id === selectedId(), unmet: held(item) === 0 }}
                    onClick={() => setSelectedId(item.id)}
                  >
                    {iconOf(item)}
                    <span class="name">{item.name}</span>
                    <span class="rarity">{held(item) > 0 ? `x${held(item)}` : ""}</span>
                  </button>
                )}
              </For>
            </>
          )}
        </For>
      </div>

      <Show when={selected()}>
        {(item) => (
          <div class="codex-detail scroll">
            <div class="codex-hero">
              {iconOf(item(), 40)}
              <div>
                <h3>{item().name}</h3>
                <p class="muted small">
                  {KIND_LABEL[item().kind]}
                  <Show when={sourceOf(item())}>{(source) => ` · ${animeName(source().arc.animeId)}`}</Show>
                </p>
                <p class="small" classList={{ muted: held(item()) === 0 }}>
                  {held(item()) > 0 ? `${held(item())} en réserve` : "Pas encore trouvé"}
                </p>
              </div>
            </div>

            <div class="codex-block">
              <h4>Provenance</h4>
              <Show
                when={sourceOf(item())}
                fallback={<p class="muted small">Ne tombe d'aucun ennemi — boutique uniquement.</p>}
              >
                {(source) => (
                  <>
                    <div class="codex-row">
                      <span class="muted">Arc</span>
                      <strong>{source().arc.name}</strong>
                    </div>
                    <div class="codex-row">
                      <span class="muted">Lâché par</span>
                      <strong>{source().enemy.name}</strong>
                    </div>
                    <div class="codex-row">
                      <span class="muted">Chance</span>
                      <strong>{Math.round((source().enemy.dropChance ?? 1) * 100)} %</strong>
                    </div>
                  </>
                )}
              </Show>
            </div>

            <Show
              when={item().kind === "common"}
              fallback={
                <div class="codex-block">
                  <h4>Équipement</h4>
                  <For each={item().effects ?? []} fallback={<p class="muted small">Aucun effet.</p>}>
                    {(effect) => (
                      <div class="codex-row">
                        <span class="muted">Effet</span>
                        <strong>{describeModifier(effect)}</strong>
                      </div>
                    )}
                  </For>
                  <Show when={wornBy(item())}>
                    {(character) => (
                      <div class="codex-row">
                        <span class="muted">Équipé par</span>
                        <strong>{character().name}</strong>
                      </div>
                    )}
                  </Show>
                  <p class="muted small">
                    Une seule copie existe, portée par un seul personnage à la fois ; ses effets subissent
                    la synergie comme les stats de son porteur.
                    <Show when={restrictionOf(item())}>{(who) => ` Réservé à : ${who()}.`}</Show>
                  </p>
                </div>
              }
            >
              <div class="codex-block">
                <h4>Passifs qu'il monte</h4>
                <For each={rankedUpBy(item())} fallback={<p class="muted small">Aucun personnage ne s'en sert.</p>}>
                  {(character) => {
                    const upgrade = () => props.game.passiveUpgradeOf(character);
                    // A passive only contributes for a character in the team, so the copies would
                    // be burnt for nothing — `rankUpPassive` refuses it too.
                    const owned = () => props.game.ownedCharacterIds().includes(character.id);
                    return (
                      <div class="codex-row with-action">
                        <span class="muted">{character.name}</span>
                        <strong>
                          rang {props.game.passiveRankOf(character)} / {props.game.passiveCapOf(character)}
                        </strong>
                        {/* Spending the copies from the screen that shows the stock is the point. */}
                        <Show when={!upgrade().maxed} fallback={<small class="capped">max</small>}>
                          <button
                            class="rank-up"
                            disabled={!upgrade().affordable || !owned()}
                            title={owned() ? undefined : "Pas encore rencontré"}
                            onClick={() => props.game.rankUpPassive(character)}
                          >
                            +1 · {upgrade().copies}/{upgrade().cost}
                          </button>
                        </Show>
                      </div>
                    );
                  }}
                </For>
                <p class="muted small">
                  Les copies s'empilent : c'est la seule monnaie des passifs, et il faut revenir farmer cet
                  arc pour en approfondir un.
                </p>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </>
  );
}
