"""Spot pieces of a monster that read as separate: in every part, each volume must sink well into a neighbour (the
metaball union joins balls that only touch with a thin neck, which still looks like beads on a string), and every part
must sink into the body or the head. Checks the specs the builders export (four-legged ones as rebuilt).

    .venv/bin/python check_specs.py [name ...]
"""
import math
import sys

import build_boss_beasts   # noqa: F401 — registers the realm and boss specs into build_beasts
import build_beasts as bb
import quad_chibi

from quad_chibi import joined, mirror, weld   # noqa: F401  (the geometry tests live with the builder)


def check(name):
    spec = bb.CHARS[name]
    if name in bb.QUAD:
        q = bb.QUAD[name]; spec = quad_chibi.quadify(spec, spec.get("limb_vols", bb.ARMS[1:]), q.get("kind", "paw"), q.get("foot"), q.get("girth", 1.0), q.get("long", 1.0), q.get("shell", False))
    if "--welded" in sys.argv: spec = weld(spec)
    vols = [(p.split("_")[-1], v) for p, vs in spec["vols"].items() for v in mirror(vs)]
    n = len(vols); comp = list(range(n))
    def find(i):
        while comp[i] != i: comp[i] = comp[comp[i]]; i = comp[i]
        return i
    for i in range(n):
        for j in range(i + 1, n):
            if joined(vols[i][1], vols[j][1]): comp[find(i)] = find(j)
    g = {}
    for i in range(n): g.setdefault(find(i), []).append(i)
    main = max(g.values(), key=len)
    return [f"{vols[k[0]][0]} {vols[k[0]][1][0]} at {[round(x, 2) for x in vols[k[0]][1][1]]} ({len(k)} vol)" for k in g.values() if k is not main and vols[k[0]][1][1][0] >= 0]


if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if not a.startswith("--")] or [n for n in bb.CHARS if n not in bb.BREEDS and n not in ("cat", "mouse")]
    for n in names:
        try: iss = check(n)
        except Exception as e: iss = [f"ERROR {e}"]
        print(("OK   " if not iss else "BAD  ") + n + ("" if not iss else "  " + " | ".join(iss)))
