import { For, Show, createMemo, createSignal } from "solid-js";
import type { GameStore } from "../engine/gameState";
import type { Character, Item } from "../engine/types";
import PanelTitle from "./PanelTitle";
import Sprite from "./Sprite";
import { describeItem } from "./describe";
import { fmt, seconds } from "./format";
import { IconBookmark, IconStar, IconStarOutline, IconTrophy } from "./icons";

type SortKey = "level" | "click" | "dps" | "synergy";

const SORTS: Record<SortKey, { label: string; value: (game: GameStore, c: Character) => number }> = {
  level: { label: "Niveau", value: (game, c) => game.levelOf(c.id) },
  click: { label: "Clic", value: (game, c) => c.baseClickPower * (1 + game.levelOf(c.id)) },
  dps: { label: "DPS", value: (game, c) => c.baseDps * (1 + game.levelOf(c.id)) },
  synergy: { label: "Synergie", value: (game, c) => game.synergyOf(c) },
};

const pct = (into: number, need: number) => (need > 0 ? Math.min(100, (into / need) * 100) : 0);

/** Left column: abilities, the sortable team list, and the item collection. */
export default function RosterPanel(props: { game: GameStore; onSelectCharacter?: (id: string) => void }) {
  const [sortKey, setSortKey] = createSignal<SortKey>("level");
  const [abilitiesOpen, setAbilitiesOpen] = createSignal(true);
  const [teamOpen, setTeamOpen] = createSignal(true);
  const [itemsOpen, setItemsOpen] = createSignal(true);
  const [recruitsOpen, setRecruitsOpen] = createSignal(true);

  const animeNameOf = (animeId: string) => props.game.data.animes.find((a) => a.id === animeId)?.name ?? animeId;

  const sortedTeam = createMemo(() =>
    [...props.game.ownedCharacters()].sort(
      (a, b) => SORTS[sortKey()].value(props.game, b) - SORTS[sortKey()].value(props.game, a)
    )
  );

  const equippableUniques = (character: Character): Item[] =>
    props.game
      .foundItems()
      .filter((item): item is Item => item.kind === "unique" && props.game.canEquipItem(character, item.id));

  return (
    <div class="column">
      <section class="panel">
        <header class="panel-head">
          <PanelTitle open={abilitiesOpen()} onToggle={() => setAbilitiesOpen(!abilitiesOpen())}>
            Capacités
          </PanelTitle>
          <small class="muted">{props.game.unlockedAbilities().length}</small>
        </header>
        <Show when={abilitiesOpen()}>
          <div class="ability-bar">
            <For each={props.game.unlockedAbilities()}>
              {(unlocked) => {
                const remaining = () => props.game.abilityCooldownRemaining(unlocked.ability.id);
                return (
                  <button
                    class="ability"
                    disabled={remaining() > 0}
                    title={`${unlocked.ability.name} — ${seconds(unlocked.ability.durationMs)} d'effet`}
                    onClick={() => props.game.activateAbility(unlocked.ability.id)}
                  >
                    <span class="ability-name">{unlocked.ability.name}</span>
                    <span class="ability-cd">{remaining() > 0 ? seconds(remaining()) : "Prêt"}</span>
                  </button>
                );
              }}
            </For>
            <Show when={props.game.unlockedAbilities().length === 0}>
              <p class="muted pad">Battez des personnages pour débloquer des capacités et des combos.</p>
            </Show>
          </div>
        </Show>
      </section>

      <section class="panel">
        <header class="panel-head">
          <PanelTitle open={teamOpen()} onToggle={() => setTeamOpen(!teamOpen())}>
            Équipe ({props.game.ownedCharacters().length})
          </PanelTitle>
          <select value={sortKey()} onChange={(e) => setSortKey(e.currentTarget.value as SortKey)}>
            <For each={Object.entries(SORTS)}>{([key, sort]) => <option value={key}>{sort.label}</option>}</For>
          </select>
        </header>

        <Show when={teamOpen()}>
        <div class="table-head member-grid">
          <span>Nom</span>
          <span>Niv.</span>
          <span>Clic</span>
          <span>DPS</span>
          <span>Syn.</span>
        </div>

        <div class="scroll">
          <For each={sortedTeam()}>
            {(character) => {
              const progress = () => props.game.progressOf(character.id);
              const level = () => progress().level;
              const passive = () => props.game.passiveUpgradeOf(character);
              const passiveItem = () => props.game.passiveItemOf(character);
              return (
                <div class="member">
                  <div class="member-grid">
                    <button
                      class="name name-link"
                      title="Voir dans le Codex"
                      onClick={() => props.onSelectCharacter?.(character.id)}
                    >
                      <Sprite name={character.name} kind="character" anime={animeNameOf(character.animeId)} px={5} />
                      {character.name}
                      <span class="rarity">{character.rarity === "main" ? <IconStar /> : <IconStarOutline />}</span>
                    </button>
                    <span>{level()}</span>
                    <span>{fmt(character.baseClickPower * (1 + level()))}</span>
                    <span>{fmt(character.baseDps * (1 + level()))}</span>
                    <span
                      class="synergy"
                      classList={{
                        good: props.game.synergyOf(character) > 1,
                        bad: props.game.synergyOf(character) < 1,
                      }}
                    >
                      {props.game.synergyOf(character).toFixed(2)}
                    </span>
                  </div>
                  <div class="bar xp-bar" title={`${fmt(progress().into)} / ${fmt(progress().need)} xp`}>
                    <div class="bar-fill" style={{ width: `${pct(progress().into, progress().need)}%` }} />
                  </div>
                  <Show when={character.passive}>
                    <div class="passive-row">
                      <small classList={{ muted: !passive().maxed, capped: passive().maxed }}>
                        Passif {passive().rank}/{props.game.passiveCapOf(character)}
                      </small>
                      <Show
                        when={!passive().maxed}
                        fallback={
                          <small class="capped">max</small>
                        }
                      >
                        <button
                          class="rank-up"
                          disabled={!passive().affordable}
                          title={`${passiveItem()?.name ?? "—"} : ${fmt(passive().copies)} en poche`}
                          onClick={() => props.game.rankUpPassive(character)}
                        >
                          +1 · {fmt(passive().copies)}/{fmt(passive().cost)} {passiveItem()?.name ?? "—"}
                        </button>
                      </Show>
                    </div>
                  </Show>
                  <div class="equip-row">
                    <small class="muted">{props.game.equippedItemOf(character)?.name ?? "Pas d'objet"}</small>
                    <select
                      class="equip-select"
                      value={props.game.characterEquipment()[character.id] ?? ""}
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        if (value) props.game.equipItem(character.id, value);
                        else props.game.unequipItem(character.id);
                      }}
                    >
                      <option value="">— Équiper —</option>
                      <For each={equippableUniques(character)}>
                        {(item) => <option value={item.id}>{item.name}</option>}
                      </For>
                    </select>
                  </div>
                </div>
              );
            }}
          </For>
          <Show when={props.game.ownedCharacters().length === 0}>
            <p class="muted pad">Les personnages rejoignent l'équipe quand vous les battez.</p>
          </Show>
        </div>
        </Show>
      </section>

      <Show when={props.game.arcRecruits().length > 0}>
        <section class="panel">
          <header class="panel-head">
            <PanelTitle open={recruitsOpen()} onToggle={() => setRecruitsOpen(!recruitsOpen())}>
              À battre ici
            </PanelTitle>
            <small class="muted">{props.game.arcRecruits().length}</small>
          </header>
          <Show when={recruitsOpen()}>
          <For each={props.game.arcRecruits()}>
            {(character) => (
              <div class="row">
                <span class="name">
                  <Sprite name={character.name} kind="character" anime={animeNameOf(character.animeId)} px={5} />
                  {character.name}
                  <span class="rarity">{character.rarity === "main" ? <IconStar /> : <IconStarOutline />}</span>
                </span>
                <small class="muted">
                  {fmt(character.baseClickPower)} / {fmt(character.baseDps)}
                </small>
              </div>
            )}
          </For>
          </Show>
        </section>
      </Show>

      <section class="panel">
        <header class="panel-head">
          <PanelTitle open={itemsOpen()} onToggle={() => setItemsOpen(!itemsOpen())}>
            Objets
          </PanelTitle>
          <small class="muted">{props.game.foundItems().length}</small>
        </header>
        <Show when={itemsOpen()}>
        <div class="table-head item-grid">
          <span>Nom</span>
          <span>Type</span>
          <span>Qté</span>
          <span>Effet</span>
        </div>
        <div class="scroll">
          <For each={props.game.foundItems()}>
            {(item) => (
              <div class="item-grid item-row" title={describeItem(item)}>
                <span class="name">
                  {item.kind === "unique" ? <IconTrophy class="gold" /> : <IconBookmark class="blue" />} {item.name}
                </span>
                <span classList={{ unique: item.kind === "unique" }}>
                  {item.kind === "unique" ? "unique" : "commun"}
                </span>
                <span>{props.game.countOf(item.id)}</span>
                <span class="muted">{item.kind === "unique" ? "équipable" : "passifs"}</span>
              </div>
            )}
          </For>
          <Show when={props.game.foundItems().length === 0}>
            <p class="muted pad">
              Aucun objet trouvé. Les communs d'un arc font monter les passifs des personnages rencontrés là-bas ;
              les uniques des boss s'équipent sur les personnages de l'équipe.
            </p>
          </Show>
        </div>
        </Show>
      </section>
    </div>
  );
}
