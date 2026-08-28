# Modifiers and abilities

The one pipeline every stat change goes through, and the abilities that feed it temporaries.

## The modifier pipeline

Everything that affects a stat becomes an `ActiveModifier`, and `computeEffectiveStat` folds them:
`(base + flats) * (1 + Σpercents) * Πmultipliers`. That order is a balance decision — changing it
rebalances the whole game.

**A buff is scoped to the character it comes from.** An `ActiveModifier` may carry a `scope`: the
id of the one character it applies to. A character's own base damage is scoped to them, and so is
every ability buff — a character's ability lands on that character, never on the rest of the team. `computeScopedStat` folds each scoped group on its own through the usual
pipeline (with the team-wide *scaling* applied to it as well, and the team-wide flats counted once,
outside), which is exactly `computeEffectiveStat` while no buff is running, since a percent over a
sum of flats is the same as that percent over each flat.

That scoping is what lets **every ability run at once**, which is the point: nothing blocks
anything, two buffs on the same character stack on them, and re-firing an ability refreshes its own
buff instead of adding a second copy. The old rule was one buff per stat —
`replaceModifiersByTarget` plus a same-stat lock on the bar — because a team-wide buff firing
alongside another stacked into far too much damage. Scoping bounds it structurally instead: a buff
can never be worth more than the share of the team it names. Two earlier attempts stay rejected:
a `STACK_FALLOFF` on overlapping team-wide temporaries (still far too much damage), and going back
to team-wide buffs at all.

Being worth a share of the team also makes the printed value worth far less than it used to be, so a
percent or multiplier effect is scaled twice before it lands (flats never are — a flat bump lands
whole on its character either way, and so does the tree's node 2):

- `scopedMagnitude(owned, covered)` — the roster over the part of it any ability reaches. ~1 on a
  grown roster where nearly everyone carries an ability; early, where three characters out of
  fifteen have one, it hands back the climb a single team-wide buff used to carry.
- `dutyMagnitude(ability)` — `cooldownMs / durationMs`, sur la recharge **imprimée**. Up an eighth of the time, it hits eight times
  as hard while it lasts; without it a buff on two allies for six seconds is noise.

`ABILITY_COOLDOWN_SCALE` (1.5) étire toute recharge avant que le store ne teste la disponibilité —
et **n'entre pas** dans `dutyMagnitude`, sinon l'attente rallongée rendrait chaque activation
proportionnellement plus forte et le dps moyen ne bougerait pas : le nerf serait un simple
regroupement en pics. C'est bien de l'uptime en moins (`npm run sim` : 76 → 95 min pour les mêmes
17 arcs).

**`SCOPED_BUFF_CAP` (50) is the ceiling those two are allowed to reach**, applied per character in
`computeScopedStat`: whatever lands on one character can never lift their own damage past 50x. It is
not decoration — the first cut shipped without it and a grown save hit ~4.5 Qa against 3T-hp enemies,
because stacked multiplier buffs on the same character multiply, compensation included. Stacking buys you *reaching* the ceiling faster and on more allies, never
passing it.

### The ceiling is a ramp, not a number

That ceiling **is** an ability's strength, for almost the whole game. Measured with `npm run sim`:
switch the cap off and the run drops from 80 to 32 minutes, and the per-arc ratios show it binding
from **arc 2 onward and never letting go**. So from the third fight of a fresh run, a buffed
character dealt exactly `bare * 50` whatever the buff printed — an opening ability and an Ôtsutsuki
ability were worth the same thing, and the whole ladder the ability data describes was invisible.

So the cap climbs with the run: `scopedBuffCap(progress)` interpolates geometrically from
**`SCOPED_BUFF_CAP_FLOOR` (12)** on the first arc to the full 50 on the last, `progress` being
cleared arcs over `arcs.length - 1` (the store's `buffCap` memo — the ceiling should be reached *on*
the final arc, not one clear after the game ends). Two things fall out of it:

- **Abilities are weaker early and grow through the run**, which is the point. Under the floor the
  cap stops binding at all, so `computeEffectiveStat` decides again and the printed values on the
  early abilities go back to meaning something different from each other.
- **The ceiling itself never moves.** 50 is what stops the runaway above; raising it re-opens exactly
  that. The ramp only ever lowers the early game — `src/engine/tests/` guards that no `progress`,
  including a `NaN` one, can put the cap outside `[floor, 50]`, and that it climbs monotonically so
  clearing an arc can never weaken a buff.

Because the cap is the strength knob, moving the floor **rebalances the whole first two thirds of the
game**: both generated hp tables were refit against 12 (three passes, `docs/combat.md`). The store
prints the live value in the "Capacités" header ("Maîtrise x12") and in every ability's tooltip —
an invisible ramp would just read as abilities being randomly weak early.

Re-measured with `npm run sim` after every change to any of these: a full run lands at 84-87 min,
and the endgame dps within a few times the old one-buff rule instead of two hundred.

A `ModifierTemplate` is just `target`/`kind`/`value` — it carries **no id
of its own**: nothing in the pipeline keys off one (`computeEffectiveStat` keys on
`target`, `computeScopedStat` on `scope`), and `ActiveModifier.sourceId` is what names where a
modifier came from. Don't reintroduce a per-effect `id` in the data files. Modifiers come from three
sources, merged in `allModifiers`:

1. **Owned characters** → `characterContributions` converts base stats + innate passive + any
   equipped unique item (`Item.effects`) into modifiers, each pre-scaled by the character's synergy
   with the active arc. Base stats **and the passive** carry the character's id as their `scope`: a
   passive raises its own character's statistics, not the team's.
2. **Activated abilities** → temporary modifiers stamped with `expiresAt` and one `scope` per
   character the ability covers, pruned on every tick.
3. **Equipped unique items** → permanent modifiers contributed by `characterContributions`, carrying
   the wearer's id as their `scope`: a unique buffs the character wearing it and nobody else, the
   same rule as an ability's buff. The equipment mapping lives in `gameState` (`equipItem`,
   `unequipItem`, `equippedItemOf`).

Expiry is checked both in `pruneExpired` and again inside `computeEffectiveStat`, so a stale list
can never inflate a stat.

**What the roster prints per character is that character's own term in `computeScopedStat`**, not a
fold of their modifiers alone. `characterStatOf` pulls their scoped group out of `allModifiers` and
re-folds it with the team-wide scaling — achievements, the prestige tree, challenge rewards, every
evolution bonus — because that is exactly what `teamDps` does to it. Folding the group on its own
was the older, wrong answer: the team-wide scaling is most of a grown team's damage, so a 40-strong
roster averaging 3k dps a row sat under a 240k team total with no ability running, and the column
looked broken. The two numbers now agree by construction — `Σ characterStatOf(c, "teamDps")` **is**
`teamDps()`, guarded in `src/engine/tests/store.test.ts` — and `clickPower` differs only by the
narrator's own base, which belongs to no character. It reads the memo rather than rebuilding a
character's contributions by hand because the roster asks for it once a row, twice, every tick.

## Abilities

Unlocked by owning a character that grants one, computed from the owned set in
`getUnlockedAbilities`. `UnlockedAbility` carries `characterIds` — who the buff lands on, which is
that character alone.

**And only at home.** The same function takes the active arc and drops every character it isn't home
for (`isHomeArc`, the test the passive already used): abroad, the ability is not listed, not firable,
not visible to the "Réflexe" automation, and `allModifiers` filters out any buff of theirs still
running so that firing everything at home and then stepping over the border buys nothing. It is the
rule enforced at its source rather than watched — there is no "ability used abroad" to detect — and
a crossover window does not lift it, since a crossover buys damage and never a story ability. The
count the bar hides shows up as `sleepingAbilityCount`, so arriving in a new world says why half the
buttons went away instead of just shrinking. Cooldowns are tracked as last-used timestamps in a record, not as counters,
and they are now the **only** gate: nothing locks an ability out any more, so the bar's tooltip
names the ally a buff will land on instead of the ability blocking it. The "Clic du Narrateur" free trigger picks any ability that isn't already
running — re-firing one would only refresh a buff the player already has. `readyAbilities` lists
what is off cooldown and `activateReadyAbilities` fires all of it, which is the bar's « Tout lancer »
button: with buffs stacking, firing everything is simply the best play, and doing it by hand across
forty buttons is chores, not a decision. `activeBuffs` lists which abilities are still running, so the bar can mark them; `RosterPanel` sorts
ready-first on a deliberately *binary* key, since sorting by exact cooldown left would reshuffle the
bar under the cursor every tick.
