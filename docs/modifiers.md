# Modifiers and abilities

The one pipeline every stat change goes through, and the abilities that feed it temporaries.

## The modifier pipeline

Everything that affects a stat becomes an `ActiveModifier`, and `computeEffectiveStat` folds them:
`(base + flats) * (1 + Σpercents) * Πmultipliers`. That order is a balance decision — changing it
rebalances the whole game.

**One buff per stat, and that is deliberate.** `replaceModifiersByTarget` means a new ability buff
cuts short whatever else was boosting the same stat, and `activateAbility` pairs it with a lock so
the player is never allowed to waste an ability on an effect that would be replaced instantly.
Diminishing returns (a `STACK_FALLOFF` on overlapping temporaries) were tried as a way to keep every
ability button live — `ModifierTarget` is only `clickPower | teamDps` and 82 of the game's 93
effects target `teamDps`, so the lock greys out most of the bar — and **rejected**: firing several
at once still stacked into far too much damage. A large-but-bounded burst is worse for balance than
a flat "one buff per stat" rule. Don't reintroduce it; the fix for the greyed bar is the tooltip,
not the stacking (see Abilities). A `ModifierTemplate` is just `target`/`kind`/`value` — it carries **no id
of its own**: nothing in the pipeline keys off one (`computeEffectiveStat` and
`replaceModifiersByTarget` both key on `target`), and `ActiveModifier.sourceId` is what names where a
modifier came from. Don't reintroduce a per-effect `id` in the data files. Modifiers come from three
sources, merged in `allModifiers`:

1. **Owned characters** → `characterContributions` converts base stats + innate passive + any
   equipped unique item (`Item.effects`) into modifiers, each pre-scaled by the character's synergy
   with the active arc.
2. **Activated abilities** → temporary modifiers stamped with `expiresAt`, pruned on every tick.
3. **Equipped unique items** → permanent modifiers contributed by `characterContributions`; the
   equipment mapping lives in `gameState` (`equipItem`, `unequipItem`, `equippedItemOf`).

Expiry is checked both in `pruneExpired` and again inside `computeEffectiveStat`, so a stale list
can never inflate a stat.

## Abilities

Unlocked two ways, both computed from the owned set in `getUnlockedAbilities`: a single character
that grants one, or owning *every* character a `ComboDefinition` requires. Cooldowns are tracked as
last-used timestamps in a record, not as counters. Two gates, not one: an ability's own cooldown,
and `abilityBlockedUntil` — same-stat abilities are locked for the duration of the running buff (see
the modifier pipeline). That record carries the blocking ability's name alongside its deadline, so
`abilityBlockedBy`/`abilityBlockRemaining` let the bar say *« Bloquée par X (12s) »* instead of
greying a button out with no explanation; `.ability.blocked` is dashed, a plain cooldown is not.
`activeBuffs` lists which abilities are still running, so the bar can mark them; `RosterPanel` sorts
ready-first on a deliberately *binary* key, since sorting by exact cooldown left would reshuffle the
bar under the cursor every tick.
