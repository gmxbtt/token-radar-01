# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/gmxbtt/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/gmxbtt/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar that ranks pre-token DeFi protocols by an implied value from a size curve fitted to the snapshot's own token comparables (log market cap on log TVL, validated out of sample), with a concrete farm plan for every protocol.

## radar-5.0

- **Range-gated category curves.** A category curve is trusted only inside the TVL range its own comparables span; outside it, its weight decays (Gaussian in log TVL, σ = 0.7) and the pooled curve takes over. The gate changes no out-of-sample score and moves exactly one row: bittensor-dtao, whose $376M TVL sits 1.9 log-units beyond the Dexs comparables' $7–56M range, falls from rank 1 ($264M on the extrapolated Dexs curve) to rank 8 ($46M on the pooled curve).
- **Leave-one-out validation.** The winning model refitted once per trimmed comparable held out: median miss ×3.04, within 3× 49%, within 10× 89%.
- **Farm value per hands-on hour.** Every plan's hands-on minutes are totalled; each row carries its net value per hour, and the board names the five best FARM rows by it.
- **Market-line scatter** of the 111 trimmed comparables with the pooled curve, drawn in the research note.

Out-of-sample (time-split R² + 5-fold R², mean): category-trim **0.3772** vs pooled-trim 0.3749, pooled-chains 0.3678, category-chains 0.3664, Huber-all 0.0845. Tried and rejected on the same protocol: growth/age as joint value features, quadratic size term, nearest-neighbour peer curve, winsorising instead of trimming, tighter trims (their apparent gain was test-set shrinkage), Huber inside the categories, and a kin/sibling discount (no pre-token row has a trading sibling).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=vg0kgv1n&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
