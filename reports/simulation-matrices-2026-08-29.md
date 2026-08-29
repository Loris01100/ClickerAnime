# Simulation matrices — 2026-08-29

Generated with `npm run sim:matrix` on seeds 1, 7, 42, 99 and 20260829. Every run has a
120-minute budget and stops when one arc remains uncleared for 15 minutes. Entry worlds are each
started at tier 0 (difficulty ×1), so the first matrix compares their own curves rather than a live
run's later-world difficulty.

## Entry-world stability

| Entry world | Mean arcs | Range over seeds | Mean minutes | Mean prestige | Dominant wall |
| --- | ---: | ---: | ---: | ---: | --- |
| Naruto | 14.0 | 14–14 | 55.9 | 20.0 | Quatrième Guerre : Confrontation |
| Hunter x Hunter | 2.0 | 2–2 | 19.1 | 1.0 | York Shin City |
| Bleach | 29.0 | 29–29 | 78.9 | 44.0 | Quatrième Guerre : Confrontation |

All five seeds produced the exact same arc count and wall for every entry world. The Hunter x
Hunter wall is therefore structural rather than drop variance. Starting from Bleach clears Bleach,
Naruto and nine Shippūden arcs before reaching the same wall as the Naruto route.

## System contribution from Naruto

| Scenario | Mean arcs | Range over seeds | Mean minutes | Mean prestige | Dominant wall |
| --- | ---: | ---: | ---: | ---: | --- |
| Reference | 14.0 | 14–14 | 55.9 | 20.0 | Quatrième Guerre : Confrontation |
| No abilities | 3.0 | 3–3 | 19.7 | 1.0 | À la recherche de Tsunade |
| No passive ranks | 14.0 | 14–14 | 56.0 | 20.0 | Quatrième Guerre : Confrontation |
| No packs | 14.0 | 14–14 | 55.9 | 20.0 | Quatrième Guerre : Confrontation |
| No unique equipment | 14.0 | 14–14 | 56.8 | 20.0 | Quatrième Guerre : Confrontation |

Abilities determine the first run's reachable content. Passive ranks, packs and equipment change
some end-of-arc damage values but not the first wall or prestige payout in this auto-advance policy.
This does not price deliberate farming; it shows that the normal forward route does not require or
teach those systems before its wall.

## Click-cadence sensitivity from Naruto

| Cadence | Mean arcs | Range over seeds | Mean minutes | Mean prestige | Dominant wall |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 click/s | 3.0 | 3–3 | 21.0 | 1.0 | À la recherche de Tsunade |
| 2 clicks/s | 9.0 | 9–9 | 40.1 | 8.0 | Le Conte de Jiraya le Galant |
| 4 clicks/s | 14.0 | 14–14 | 55.9 | 20.0 | Quatrième Guerre : Confrontation |
| 8 clicks/s | 18.0 | 18–18 | 68.0 | 36.0 | Kaguya Ôtsutsuki fait irruption |

Click cadence changes the first run by fifteen arcs between a relaxed 1 click/s player and an
aggressive 8 clicks/s player. Since the click is intended as a trigger rather than the primary
damage source, this sensitivity deserves a design decision: either make high engagement an
explicit advantage, or narrow the gap through early automation and ability cadence.

## First-experience milestones

Values are mean minutes over the five seeds; every range was within 0.1 minute. An item counts only
once an auto-player equips a unique or buys a passive rank.

| Entry world | First recruit | First arc | First used item | Prestige +1 | Tree level (2) | World unlock (3) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Naruto | 0.5 | 0.5 | 0.6 | 3.6 | 6.7 | 11.0 |
| Hunter x Hunter | 0.9 | 1.0 | 1.0 | 8.6 | — | — |
| Bleach | 1.1 | 1.1 | 1.2 | 2.9 | 4.7 | 7.6 |

The documented targets are now 0.3–1.0 minute for the first recruit, 0.8–2.0 for the first arc,
1.0–3.0 for the first used item, and 8–15 minutes for the first actionable two-point prestige.
Naruto delivers its arc and item slightly too early; Bleach recruits slightly late; both award an
actionable prestige earlier than the target. Hunter x Hunter never reaches two points because of
its York Shin wall.

## Bleach diagnosis

### Isolated entry-world exits

| Entry world | Duration | Team | Exit DPS | Lifetime earnings | Prestige |
| --- | ---: | ---: | ---: | ---: | ---: |
| Naruto | 11.0 min | 18 | 60.79K | 149.80K | 3 |
| Bleach | 40.0 min | 110 | 1.59M | 444.68M | 23 |

Bleach itself is not faster: its 15 arcs average 2.7 minutes, against Naruto's 2.2. Its advantage
is the exit state. It provides 6.1 times the roster, 26 times the displayed team DPS and almost
3,000 times the lifetime earnings before the next world begins.

### Route-order effect

| Route | Mean arcs | Mean minutes | Mean prestige | Wall |
| --- | ---: | ---: | ---: | --- |
| Naruto → Shippūden | 14 | 55.9 | 20 | Quatrième Guerre : Confrontation |
| Bleach → Naruto → Shippūden | 29 | 78.9 | 44 | Quatrième Guerre : Confrontation |
| Naruto → Bleach | 17 | 47.6 | 22 | Armée Envahissante du Gotei 13 |

All five seeds agree. Entered first, Bleach's 110-character roster trivializes Naruto (its five
arcs then take about one minute total) and carries the run to the normal Shippūden wall. Entered
second at difficulty ×2.5, Bleach instead becomes the wall on its thirteenth arc. The observed
advantage is therefore caused by the combination of roster accumulation and frozen entry tier,
not by unusually short Bleach arcs or lucky drops.

## Recommended follow-up matrices

- Add a farming policy that stays on the latest cleared arc until one passive rank is affordable;
  compare it with auto-advance to price the intended common-item loop.
- Run full multi-prestige campaigns; the current harness measures one run and cannot show how fast
  tree purchases erase each wall.
- Compare boss-specific ability policies once the simulator can reserve abilities for bosses; the
  current policy fires every ready ability immediately.
