#!/usr/bin/env python3
"""M1 recipe pacing simulation; Python standard library only.

Original seed: fang p=.60, count uniform {1,2}; ore p=.30,
count uniform {1,2}; gold uniform integers [5,15] every kill.
Hide does not affect the recipe and its independent roll is omitted.
All materials are retained; no sharing, overflow, spending, or failures.
This estimates kills required, not combat/session duration.
"""
import argparse
import json
import random
import statistics


def simulate(iterations, seed, fang_required, ore_required, gold_required):
    rng = random.Random(seed)
    samples = []
    for _ in range(iterations):
        fang = ore = gold = kills = 0
        while fang < fang_required or ore < ore_required or gold < gold_required:
            kills += 1
            if rng.random() < 0.6:
                fang += rng.randint(1, 2)
            if rng.random() < 0.3:
                ore += rng.randint(1, 2)
            gold += rng.randint(5, 15)
        samples.append(kills)
    samples.sort()
    return {
        "iterations": iterations,
        "seed": seed,
        "recipe": {"WOLF_FANG": fang_required, "IRON_ORE": ore_required, "GOLD": gold_required},
        "mean_kills": statistics.mean(samples),
        "median_kills": statistics.median(samples),
        "percentiles_kills": {
            str(p): samples[int((iterations - 1) * p / 100)]
            for p in (10, 50, 75, 90, 95, 99)
        },
        "probability_ready_by_kill": {
            str(k): sum(n <= k for n in samples) / iterations
            for k in (5, 10, 12, 15, 18, 20, 25, 30)
        },
        "assumptions": [
            "Independent fang/ore rolls; quantities are uniform integers.",
            "Every kill grants gold; hide roll omitted because it is independent and not a recipe ingredient.",
            "All drops retained; no overflow, spending, sharing, disconnect or failures.",
            "Kill counts only; combat timing and spawner contention are not modeled.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--iterations", type=int, default=200000)
    parser.add_argument("--seed", type=int, default=21092026)
    parser.add_argument("--fang", type=int, default=10)
    parser.add_argument("--ore", type=int, default=5)
    parser.add_argument("--gold", type=int, default=50)
    args = parser.parse_args()
    if args.iterations < 1 or min(args.fang, args.ore, args.gold) < 0:
        parser.error("Iterations must be positive and recipe quantities nonnegative")
    print(json.dumps(simulate(args.iterations, args.seed, args.fang, args.ore, args.gold), indent=2))


if __name__ == "__main__":
    main()
