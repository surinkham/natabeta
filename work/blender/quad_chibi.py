"""Four-legged chibi: turn an upright monster spec (build_beasts CHARS format) into one standing on four legs.

The shared SK_BK_Chibi bone names stay, only their rest positions move: the pelvis goes to the rump, spine_01 to the
chest, the head forward over the chest, the arms become front legs and the legs back legs, all pointing straight down
(so the ordinary two-legged clips swing them as a trot and the client needs no new clip set). The geometry follows:
  * the torso is rebuilt long and level (its girth from the old core volume);
  * extra body pieces (shells, spines, collars, marks) are pitched 90 degrees forward with it — the old back becomes the top;
  * head, ears, face and tail are moved to the front / the rump unchanged;
  * legs are made fresh per foot kind (paw, hoof, pillar, reptile).
"""
import math

HEAD_SHIFT = (0.0, -0.20, -0.10)     # the big chibi head sits forward and a little lower, over the chest
TAIL_SHIFT = (0.0, 0.20, -0.06)
PIVOT_Z = 0.29                        # the old upright torso turns about this height
BODY_Z = 0.28                         # torso centre height once level
FRONT_Y, BACK_Y, HIP_X = -0.10, 0.16, 0.09

QUAD_BONES = {
    "pelvis":     ((0, BACK_Y, 0.24), (0, BACK_Y, 0.34), "root"),
    "spine_01":   ((0, FRONT_Y + 0.04, 0.26), (0, FRONT_Y + 0.04, 0.38), "pelvis"),
    "neck_01":    ((0, -0.14, 0.34), (0, -0.14, 0.38), "spine_01"),
    "head":       ((0, -0.16, 0.38), (0, -0.16, 0.70), "neck_01"),
    "tail_01":    ((0, BACK_Y + 0.10, 0.30), (0, BACK_Y + 0.20, 0.40), "pelvis"),
    "upperarm_l": ((HIP_X + 0.01, FRONT_Y, 0.25), (HIP_X + 0.01, FRONT_Y, 0.15), "spine_01"),
    "lowerarm_l": ((HIP_X + 0.01, FRONT_Y, 0.15), (HIP_X + 0.01, FRONT_Y - 0.01, 0.07), "upperarm_l"),
    "hand_l":     ((HIP_X + 0.01, FRONT_Y - 0.01, 0.07), (HIP_X + 0.01, FRONT_Y - 0.05, 0.02), "lowerarm_l"),
    "thigh_l":    ((HIP_X, BACK_Y, 0.24), (HIP_X, BACK_Y, 0.14), "pelvis"),
    "calf_l":     ((HIP_X, BACK_Y, 0.14), (HIP_X, BACK_Y, 0.07), "thigh_l"),
    "foot_l":     ((HIP_X, BACK_Y, 0.07), (HIP_X, BACK_Y - 0.05, 0.02), "calf_l"),
    "socket_head":   ((0, -0.16, 0.71), (0, -0.16, 0.77), "head"),
    "socket_hand_l": ((HIP_X + 0.01, FRONT_Y - 0.03, 0.03), (HIP_X + 0.01, FRONT_Y - 0.09, 0.03), "hand_l"),
    "socket_back":   ((0, 0.04, 0.42), (0, 0.10, 0.42), "spine_01"),
    "socket_waist":  ((0, BACK_Y, 0.30), (0, BACK_Y - 0.06, 0.30), "pelvis"),
}


def _add(p, d): return tuple(p[i] + d[i] for i in range(3))


def _pitch(p):
    """The old upright body turned 90 degrees forward about (0, 0, PIVOT_Z): up -> forward (-y), back (+y) -> up."""
    x, y, z = p
    return (x, -(z - PIVOT_Z), BODY_Z + y)


def _pitch_vol(v):
    if v[0] == "ell":
        _, c, h, r = v
        return ("ell", _pitch(c), (h[0], h[2], h[1]), r)
    _, a, b, rad = v
    return ("cap", _pitch(a), _pitch(b), rad)


def _shift_vol(v, d):
    if v[0] == "ell":
        return ("ell", _add(v[1], d), v[2], v[3])
    return ("cap", _add(v[1], d), _add(v[2], d), v[3])


PINCER_SHIFT = (0.0, -0.18, -0.12)   # an arthropod's arms (pincers, forelegs up front) reach forward at head height


def _insect_legs(girth):
    """Three pairs of thin jointed legs out to the side (x mirrored): up and out to the knee, then down to the ground."""
    t, v, feet = 0.022 * girth, [], []
    for y in (FRONT_Y + 0.02, 0.03, BACK_Y - 0.02):
        knee, foot = (0.20, y - 0.01, 0.24), (0.25, y - 0.03, 0.02)
        v += [("cap", (0.10, y, 0.26), knee, t), ("cap", knee, foot, t * 0.85), ("ell", knee, (t * 1.3, t * 1.3, t * 1.3), (0, 0, 0))]
        feet.append((foot[0], foot[1], 0.03))
    return v, feet


def _legs(kind, girth):
    """Four legs (x mirrored by the builder): a shoulder / haunch bulge, the leg, the foot. Returns (vols, foot marks)."""
    if kind == "insect": return _insect_legs(girth)
    t = {"paw": 0.042, "hoof": 0.036, "pillar": 0.062, "reptile": 0.04, "insect": 0.018, "turtle": 0.058}.get(kind, 0.042) * girth
    fx, bx = HIP_X + 0.01, HIP_X
    splay = {"reptile": 0.05, "turtle": 0.07}.get(kind, 0.0)
    v = [("ell", (fx, FRONT_Y, 0.22), (t * 1.3, t * 1.4, t * 1.5), (0, 0, 0)),                 # shoulder
         ("cap", (fx, FRONT_Y, 0.22), (fx + splay, FRONT_Y - 0.01, 0.05), t),
         ("ell", (bx, BACK_Y + 0.01, 0.22), (t * 1.5, t * 1.7, t * 1.7), (0, 0, 0)),           # haunch
         ("cap", (bx, BACK_Y, 0.20), (bx + splay, BACK_Y, 0.05), t)]
    foot = {"hoof": (t * 1.05, t * 1.1, t * 0.8), "pillar": (t * 1.1, t * 1.1, t * 0.6)}.get(kind, (t * 1.15, t * 1.5, t * 0.8))
    for x, y in ((fx + splay, FRONT_Y - 0.02), (bx + splay, BACK_Y - 0.01)):
        v.append(("ell", (x, y, 0.035), foot, (0, 0, 0)))
    return v, [(x, y, 0.03) for x, y in ((fx + splay, FRONT_Y - 0.02), (bx + splay, BACK_Y - 0.01))]


def _shell(girth):
    """A tortoise: a domed shell over a low body, a flat rim round it and a pale belly plate — all level, not pitched."""
    z = BODY_Z - 0.02
    return [("ell", (0, 0.03, z + 0.07), (0.23 * girth, 0.27, 0.16), (0, 0, 0)), ("ell", (0, 0.03, z), (0.27 * girth, 0.31, 0.045), (0, 0, 0)),
            ("ell", (0, 0.02, z - 0.06), (0.19 * girth, 0.24, 0.05), (0, 0, 0)), ("cap", (0, -0.16, z + 0.01), (0, -0.25, z + 0.09), 0.06)]   # dome, rim, belly, neck


def quadify(spec, limb_vols, kind="paw", foot_col=None, girth=1.0, long=1.0, shell=False):
    """New spec standing on four legs. `limb_vols`: the upright arm/leg volumes to drop from the body (reprs compared).
    girth scales the torso and legs (a bear or mammoth is stockier than a fox), long stretches the torso."""
    out = dict(spec); drop = {repr(x) for x in limb_vols}
    vols, marks = {}, {}
    for part, vs in spec["vols"].items():
        kindp = part.split("_")[-1]
        if kindp == "Body":
            keep = [x for x in vs if repr(x) not in drop]
            core, extra = keep[0], keep[1:]                                   # the first volume is the upright core
            w = (core[2][0] if core[0] == "ell" else core[3]) / 0.14
            torso = [("ell", (0, 0.02, BODY_Z), (0.14 * w * girth, 0.20 * long, 0.12 * girth), (0, 0, 0)),
                     ("ell", (0, FRONT_Y - 0.01, BODY_Z + 0.01), (0.13 * w * girth, 0.10, 0.125 * girth), (0, 0, 0)),
                     ("ell", (0, BACK_Y, BODY_Z - 0.005), (0.13 * w * girth, 0.10, 0.12 * girth), (0, 0, 0))]
            legs, _ = _legs(kind, girth)
            if shell:   # the old upright shell pieces go; a level dome, rim and belly take their place
                extra = _shell(girth)
            elif kind == "insect":   # arms held up (pincers, forelegs) reach forward; old thin legs go; the rest pitches over
                side = lambda x: abs(x[1][0]) >= 0.1
                arm = lambda x: side(x) and (min(x[1][2], x[2][2]) >= 0.25 if x[0] == "cap" else x[1][2] >= 0.2)
                extra = [_shift_vol(x, PINCER_SHIFT) if arm(x) else _pitch_vol(x) for x in extra if arm(x) or not side(x)]
            else:
                extra = [_pitch_vol(x) for x in extra]
            vols[part] = torso + extra + legs
        elif kindp == "Tail":
            vols[part] = [_shift_vol(x, TAIL_SHIFT) for x in vs]
        else:                                                                 # Head, Ears (and anything head-borne)
            vols[part] = [_shift_vol(x, HEAD_SHIFT) for x in vs]
    for part, ms in spec["marks"].items():
        kindp = part.split("_")[-1]
        if kindp == "Body":
            torso_marks = [(c, _pitch(p), (h[0], h[2], h[1])) for c, p, h in ms if abs(p[0]) < 0.15 and p[2] > 0.12]
            if shell:   # colours of the old marks, repainted on the level shell: top, rim/seams, belly
                bm = [m for m in ms if abs(m[1][0]) < 0.15 and m[1][2] > 0.12]; top, seam, belly = bm[0][0], bm[1][0], bm[-1][0]; z = BODY_Z - 0.02
                torso_marks = [(top, (0, 0.03, z + 0.12), (0.24 * girth, 0.28, 0.12)), (seam, (0, 0.03, z + 0.005), (0.3 * girth, 0.34, 0.03)),
                               (seam, (0, 0.03, z + 0.2), (0.01, 0.3, 0.06)), (seam, (0.1, 0.03, z + 0.16), (0.01, 0.3, 0.06)), (belly, (0, 0.02, z - 0.08), (0.2 * girth, 0.25, 0.04))]
            if foot_col is None:   # socks: the colour marked on the old hands/feet, if any
                socks = [c for c, p, h in ms if abs(p[0]) >= 0.15 or p[2] <= 0.08]
                fc = socks[0] if socks else None
            else:
                fc = foot_col
            _, feet = _legs(kind, girth)
            marks[part] = torso_marks + ([(fc, f, (0.06, 0.07, 0.05)) for f in feet] if fc else [])
        elif kindp == "Tail":
            marks[part] = [(c, _add(p, TAIL_SHIFT), h) for c, p, h in ms]
        else:
            marks[part] = [(c, _add(p, HEAD_SHIFT), h) for c, p, h in ms]
    out["vols"], out["marks"] = vols, marks
    out["face"] = [(f[0], _add(f[1], HEAD_SHIFT), f[2], f[3]) for f in spec["face"]]
    bones = dict(QUAD_BONES)
    for n, (h, t, p) in spec.get("bones", {}).items():                     # the spec's own ear bones ride with the head
        bones[n] = (_add(h, HEAD_SHIFT), _add(t, HEAD_SHIFT), p)
    if "ear_l" not in spec.get("bones", {}):
        bones["ear_l"] = (_add((0.11, 0, 0.77), HEAD_SHIFT), _add((0.17, 0, 0.88), HEAD_SHIFT), "head")
    out["bones"] = bones
    out["quad"] = True
    return out


# ---------------------------------------------------------------- one piece: volumes that only touch read as separate
OVERLAP = 0.85   # centres closer than this share of the two radii = one solid piece


def mirror(vs):
    out = []
    for v in vs:
        out.append(v)
        if v[0] == "ell" and abs(v[1][0]) > 1e-6: out.append(("ell", (-v[1][0], v[1][1], v[1][2]), v[2], v[3]))
        if v[0] == "cap" and (abs(v[1][0]) > 1e-6 or abs(v[2][0]) > 1e-6): out.append(("cap", (-v[1][0], v[1][1], v[1][2]), (-v[2][0], v[2][1], v[2][2]), v[3]))
    return out


def seg_pt(a, b, p):
    ab = [b[i] - a[i] for i in range(3)]; ap = [p[i] - a[i] for i in range(3)]
    t = max(0.0, min(1.0, sum(ab[i] * ap[i] for i in range(3)) / (sum(x * x for x in ab) or 1e-9)))
    return [a[i] + ab[i] * t for i in range(3)]


def dist_r(u, v):
    """(distance between the two shapes' cores, sum of their radii) — ellipsoids as spheres of their middle half-extent."""
    r = lambda w: sorted(w[2])[1] if w[0] == "ell" else w[3]
    if u[0] == "cap" and v[0] == "cap":
        d = min(math.dist(seg_pt(u[1], u[2], p), p) for p in (v[1], v[2], [(v[1][i] + v[2][i]) / 2 for i in range(3)]))
        d = min(d, min(math.dist(seg_pt(v[1], v[2], p), p) for p in (u[1], u[2])))
    elif u[0] == "cap": d = math.dist(seg_pt(u[1], u[2], v[1]), v[1])
    elif v[0] == "cap": d = math.dist(seg_pt(v[1], v[2], u[1]), u[1])
    else: d = math.dist(u[1], v[1])
    return d, r(u) + r(v)


def joined(u, v):
    """Two volumes read as one piece when they sink into each other by a good share of the smaller one."""
    d, rr = dist_r(u, v); small = min(sorted(w[2])[1] if w[0] == "ell" else w[3] for w in (u, v))
    return rr - d >= 0.35 * small


def weld(spec):
    """Join every piece that floats or hangs on by a point (a tail of beads, a horn above the head, a wing off the
    back) to the nearest volume of the main body with a short capsule in the piece's own part — so every monster
    reads as one connected body. Returns a new spec; pieces already sunk in are left alone."""
    out = dict(spec); vols = {p: list(v) for p, v in spec["vols"].items()}
    rad = lambda w: sorted(w[2])[1] if w[0] == "ell" else w[3]
    for _ in range(64):
        flat = [(p, v) for p, vs in vols.items() for v in mirror(vs)]
        n = len(flat); comp = list(range(n))
        def find(i):
            while comp[i] != i: comp[i] = comp[comp[i]]; i = comp[i]
            return i
        for i in range(n):
            for j in range(i + 1, n):
                if joined(flat[i][1], flat[j][1]): comp[find(i)] = find(j)
        g = {}
        for i in range(n): g.setdefault(find(i), []).append(i)
        if len(g) == 1: break
        main = set(max(g.values(), key=len)); loose = [i for i in range(n) if i not in main and flat[i][1][1][0] >= -1e-6]
        if not loose: break
        best = None
        for i in loose:
            for j in main:
                d, rr = dist_r(flat[i][1], flat[j][1])
                if best is None or d - rr < best[0]: best = (d - rr, i, j)
        _, i, j = best; (part, a), (_, b) = flat[i], flat[j]
        pa = a[1] if a[0] == "ell" else seg_pt(a[1], a[2], b[1] if b[0] == "ell" else b[1])
        pb = b[1] if b[0] == "ell" else seg_pt(b[1], b[2], pa)
        vols[part].append(("cap", tuple(pa), tuple(pb), max(0.014, 0.6 * min(rad(a), rad(b)))))
    out["vols"] = vols
    return out
