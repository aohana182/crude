# Crude — session memory

Project context: Expo React Native Slay clone. Balancing work lives on branch `feat/balance-and-ai` (4 commits, 2026-09-20).

### 2026-09-20 — Balancing session (RECONSTRUCTED 2026-09-21 from commit messages)

Not written at the time. Everything below is taken from the commit bodies of `2afdad0`, `753531b`, `adc080e`, `a2b60b9`. The reasoning behind rejected experiments, the raw results of the 17 economy configs and the P0/P1 side split were never recorded and are lost unless the original claude.ai/code session (`session_01FGUp9PigceRYwSwsbATpLs`) is still retrievable.

**What was done**
- `2afdad0` refactor: single `attackerWins` rule and an injectable AI so two AIs can be A/B tested.
- `753531b` additive unit combining (1+1, 1+2, 1+3, 2+2). Same-tier-only combining meant Majors were never built. After: Majors in ~70% of AI-vs-AI games, turn-15 leader wins 67-69% (baseline 72-78%), stalemates 1-3% to 6-7%.
- `adc080e` best-of-K AI: 6 candidate turns, opponent reply simulated on a copy, position scored (hexes, net income, treasury, unit strength, capitals). Beats the old AI 75.5% (23% losses) over 200 side-swapped games. Median game 36 turns vs 45. Costs ~80ms per AI turn on desktop, unmeasured on device.
- `a2b60b9` soft income cap (1 per tree-free hex up to 10, then 0.5 per extra hex). With the stronger AI the turn-15 leader won 87-89% and winners hoarded thousands. With the cap: leader wins 77%, hoarding gone, stalemates ~2-5%. Cost: Majors 0% again, Lieutenants in 40-47% of games.
- Rejected: strict attacks (attacker must exceed defense). 42-68% stalemates with this AI.

**Known gaps in that session's result**
- Everything was measured AI vs AI. Human vs AI difficulty and Coalition vs Insurgents balance were never measured.
- The cap only restored the leader win rate to roughly the original 72-78%. It did not beat the 67-69% reached by the combining change alone.
- Local-only files needed to reproduce the old-vs-new comparison are gitignored: `lib/game/aiLegacy.ts`, `lib/game/aiV2.ts`, `scripts/bench.sh`.
- Branch not merged to main. Push status unchecked.

### 2026-09-21 11:16 — Original Slay rules vs this implementation

User played the original in 2002-2003, remembers it as difficult, finds this game too easy.

Source: Sean O'Connor's rules page, https://www.windowsgames.co.uk/slayRules.html (fetched today).

| Rule | Original | Crude now |
|---|---|---|
| Attack | attacker must be strictly stronger than the defense | `attackerWins` uses `>=`, ties go to the attacker |
| Income | 1 per tree-free hex, no cap | soft cap at 10 hexes then 0.5 (added last session, not original) |
| Combining | strengths add | matches |
| Costs, upkeep, strengths | Peasant 10, castle 15; upkeep 2/6/18/54; strength 1-4 | matches |
| Defense | units, capitals (1), castles (2) defend own hex and adjacent hexes in the same territory | matches |
| Bankruptcy | men die, become graves, a tree grows on the grave next turn | matches (graves become nomad camps) |
| Trees | pine spreads to empty hexes with 2+ adjacent pines; palms on the coast next to a palm | camps spread with 2+ neighbours, random 18%/25% chance |
| Players | 1 to 6 | 2 |

Open questions from the source: the rules page does not give starting money, hexes per player, terrain percentage or the AI's behaviour.

Next: agree an approach with the user before changing any rules or AI.
