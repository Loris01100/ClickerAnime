# Modifiers and abilities

The one pipeline every stat change goes through, and the abilities that feed it temporaries.

## The modifier pipeline

Everything that affects a stat becomes an `ActiveModifier`, and `computeEffectiveStat` folds them:
`(base + flats) * (1 + Σpercents) * Πmultipliers`. That order is a balance decision — changing it
rebalances the whole game.

**A buff is scoped to the characters it comes from.** An `ActiveModifier` may carry a `scope`: the
id of the one character it applies to. A character's own base damage is scoped to them, and so is
every ability buff — a character's ability lands on that character, a combo's on its members, never
on the rest of the team. `computeScopedStat` folds each scoped group on its own through the usual
pipeline (with the team-wide *scaling* applied to it as well, and the team-wide flats counted once,
outside), which is exactly `computeEffectiveStat` while no buff is running, since a percent over a
sum of flats is the same as that percent over each flat.

That scoping is what lets **every ability and combo run at once**, which is the point: nothing
blocks anything, an ability and a combo that share a character stack on them, and re-firing an
ability refreshes its own buff instead of adding a second copy. The old rule was one buff per stat —
`replaceModifiersByTarget` plus a same-stat lock on the bar — because a team-wide buff firing
alongside another stacked into far too much damage. Scoping bounds it structurally instead: a buff
can never be worth more than the share of the team it names. Two earlier attempts stay rejected:
a `STACK_FALLOFF` on overlapping team-wide temporaries (still far too much damage), and going back
to team-wide buffs at all.

Being worth a share of the team also makes the printed value worth far less than it used to be, so a
percent or multiplier effect is scaled twice before it lands (flats never are — a flat bump lands
whole on its character either way, and so does the tree's node 2):

- `scopedMagnitude(owned, covered)` — the roster over the part of it any ability reaches. ~1 on a
  grown roster where everyone is in some combo; early, where three characters out of fifteen have an
  ability, it hands back the climb a single team-wide buff used to carry.
- `dutyMagnitude(ability)` — `cooldownMs / durationMs`. Up an eighth of the time, it hits eight times
  as hard while it lasts; without it a buff on two allies for six seconds is noise.

**`SCOPED_BUFF_CAP` (50) is the ceiling those two are allowed to reach**, applied per character in
`computeScopedStat`: whatever lands on one character can never lift their own damage past 50x. It is
not decoration — the first cut shipped without it and a grown save hit ~4.5 Qa against 3T-hp enemies,
because combos are *all* multipliers (22 of 22) and a dozen of them on the same character multiply,
compensation included. Stacking buys you *reaching* the ceiling faster and on more allies, never
passing it. Re-measured with `npm run sim` after every change to any of the three: a full run lands
at 74-84 min against the old one-buff rule's 81-90, and the endgame dps within a few times the old
one instead of two hundred.

A `ModifierTemplate` is just `target`/`kind`/`value` — it carries **no id
of its own**: nothing in the pipeline keys off one (`computeEffectiveStat` keys on
`target`, `computeScopedStat` on `scope`), and `ActiveModifier.sourceId` is what names where a
modifier came from. Don't reintroduce a per-effect `id` in the data files. Modifiers come from three
sources, merged in `allModifiers`:

1. **Owned characters** → `characterContributions` converts base stats + innate passive + any
   equipped unique item (`Item.effects`) into modifiers, each pre-scaled by the character's synergy
   with the active arc.
2. **Activated abilities** → temporary modifiers stamped with `expiresAt` and one `scope` per
   character the ability covers, pruned on every tick.
3. **Equipped unique items** → permanent modifiers contributed by `characterContributions`; the
   equipment mapping lives in `gameState` (`equipItem`, `unequipItem`, `equippedItemOf`).

Expiry is checked both in `pruneExpired` and again inside `computeEffectiveStat`, so a stale list
can never inflate a stat.

## Abilities

Unlocked two ways, both computed from the owned set in `getUnlockedAbilities`: a single character
that grants one, or owning *every* character a `ComboDefinition` requires. `UnlockedAbility` carries `characterIds` — who the
buff lands on — which is the character alone, or every member of the combo. Cooldowns are tracked as
last-used timestamps in a record, not as counters, and they are now the **only** gate: nothing locks
an ability out any more, so the bar's tooltip names the allies a buff will land on instead of the
ability blocking it. The "Clic du Narrateur" free trigger picks any ability that isn't already
running — re-firing one would only refresh a buff the player already has. `readyAbilities` lists
what is off cooldown and `activateReadyAbilities` fires all of it, which is the bar's « Tout lancer »
button: with buffs stacking, firing everything is simply the best play, and doing it by hand across
forty buttons is chores, not a decision. `activeBuffs` lists which abilities are still running, so the bar can mark them; `RosterPanel` sorts
ready-first on a deliberately *binary* key, since sorting by exact cooldown left would reshuffle the
bar under the cursor every tick.
