"""Rideable dragon (after the reference render): green scales, cream belly plates, great bat wings — green finger
spars, cream membranes —, cream swept-back horns, a row of black spikes from the crown to the tail tip, and a brown
leather saddle strapped round the belly with a purple crest cloth and a side pouch. Flies (the client hovers it).

    .venv/bin/python build_dragon.py [out_dir]     (default out_dragon)

Output: SM_Dragon.glb (armature "SK_Dragon" + skinned "SM_Dragon" + "Gallop" = fast wingbeat, "Idle" = hover) and
dragon_sheet.png. Same conventions as build_horse.py: origin under the body, forward -Y, saddle top ~z 0.70.
Wing bones run out along ±X, so rotating about their local X lifts / drops the tip (the right wing mirrors the sign).
The wings, spikes, horns and saddle cloth are separate meshes joined to the body (sharp where a metaball goes soft).
"""
import math
import os
import sys

import bpy

import build_anim_clips as clips
import build_beasts as beasts
import build_dog_knight as knight
import build_horse as horse
import build_shiba_chibi as shiba
import texture_pass as tp

SCALE, SCALE_DK, BELLY, BELLY_DK = (0.20, 0.56, 0.30), (0.09, 0.34, 0.18), (0.94, 0.88, 0.70), (0.80, 0.72, 0.52)
MEMBRANE, SPIKE, HORN, EYE = (0.93, 0.86, 0.68), (0.10, 0.10, 0.11), (0.93, 0.88, 0.74), (0.98, 0.72, 0.12)
LEATHER, LEATHER_DK, CLOTH, CREST = (0.46, 0.27, 0.13), (0.28, 0.16, 0.08), (0.34, 0.15, 0.44), (0.92, 0.88, 0.95)
HORN_GOLD = knight.GOLD

B = {
    "root":  ((0, 0, 0), (0, 0, 0.1), None),
    "spine": ((0, 0.22, 0.52), (0, -0.20, 0.55), "root"),
    "neck":  ((0, -0.24, 0.62), (0, -0.36, 0.86), "spine"),
    "head":  ((0, -0.38, 0.92), (0, -0.62, 0.90), "neck"),
    "tail1": ((0, 0.26, 0.50), (0, 0.46, 0.40), "spine"),
    "tail2": ((0, 0.46, 0.40), (0, 0.90, 0.33), "tail1"),
}
for side, sx in (("l", 1), ("r", -1)):
    B[f"wing_{side}"] = ((0.12 * sx, -0.06, 0.64), (0.80 * sx, 0.06, 0.78), "spine")
    B[f"fore_{side}"] = ((0.10 * sx, -0.19, 0.42), (0.11 * sx, -0.23, 0.20), "spine")   # short, stubby forelegs (cuter)
    B[f"hind_{side}"] = ((0.13 * sx, 0.14, 0.44), (0.14 * sx, 0.20, 0.08), "spine")


def _vc(ob, rgb):
    shiba.paint_flat(ob, rgb); ob.data.materials.append(bpy.data.materials["M_Toon_VC"]); return ob


def _cone(loc, r, depth, rot, rgb, verts=8):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=0, depth=depth, location=loc, rotation=[math.radians(a) for a in rot])
    o = bpy.context.active_object; bpy.ops.object.transform_apply(rotation=True); return _vc(o, rgb)


def _stick(p0, p1, r0, r1, rgb):
    """A tapered rod from p0 to p1 (finger spars, horns)."""
    from mathutils import Vector
    a, b = Vector(p0), Vector(p1)
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r0, radius2=r1, depth=(b - a).length, location=(a + b) / 2)
    o = bpy.context.active_object; o.rotation_mode = "QUATERNION"; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(b - a)
    bpy.ops.object.transform_apply(rotation=True); return _vc(o, rgb)


def _membrane(pts, rgb):
    """A wing membrane: one sheet fanned from the first point through the others. The game draws mount materials
    double-sided, so both faces light correctly (a solidified sheet's smoothed rim went dark from above)."""
    import bmesh
    me = bpy.data.meshes.new("membrane"); bm = bmesh.new(); vs = [bm.verts.new(p) for p in pts]
    for i in range(1, len(vs) - 1): bm.faces.new((vs[0], vs[i], vs[i + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free(); o = bpy.data.objects.new("membrane", me); bpy.context.collection.objects.link(o)
    for f in o.data.polygons: f.use_smooth = False
    return _vc(o, rgb)


def _box(loc, size, rgb, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=[math.radians(a) for a in rot]); o = bpy.context.active_object
    o.scale = size; bpy.ops.object.transform_apply(scale=True, rotation=True); return _vc(o, rgb)


def dragon():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    shiba.make_materials()
    body = shiba.build_volume("SM_Dragon", [
        ("cap", (0, -0.16, 0.52), (0, 0.20, 0.50), 0.18), ("ell", (0, -0.22, 0.56), (0.165, 0.15, 0.16), (0, 0, 0)),         # round barrel, deep chest
        ("cap", (0, -0.26, 0.62), (0, -0.38, 0.90), 0.075),                                                                   # neck (longer, leaner)
        ("ell", (0, -0.47, 0.98), (0.145, 0.15, 0.13), (0, 0, 0)), ("ell", (0, -0.60, 0.93), (0.085, 0.085, 0.065), (8, 0, 0)), # big round head, short snout (cute)
        ("ell", (0, -0.60, 0.885), (0.065, 0.07, 0.03), (8, 0, 0)),                                                           # lower jaw
        ("ell", (0.09, -0.47, 1.06), (0.03, 0.04, 0.022), (0, 0, 0)),                                                          # soft brows
        # small forelegs, big hind legs (a heavy muscled thigh, thick shin, broad clawed foot) as in the reference
        ("cap", (0.10, -0.19, 0.42), (0.11, -0.23, 0.24), 0.05), ("ell", (0.11, -0.25, 0.21), (0.055, 0.06, 0.04), (0, 0, 0)),   # stubby foreleg + round paw
        ("ell", (0.13, 0.14, 0.42), (0.10, 0.14, 0.15), (-15, 0, 0)), ("cap", (0.14, 0.18, 0.32), (0.14, 0.24, 0.12), 0.07),
        ("ell", (0.14, 0.19, 0.07), (0.085, 0.11, 0.05), (0, 0, 0)),
        ("cap", (0, 0.30, 0.50), (0, 0.50, 0.42), 0.075), ("cap", (0, 0.50, 0.42), (0, 0.72, 0.36), 0.05), ("cap", (0, 0.72, 0.36), (0, 0.88, 0.33), 0.03),   # tail
        ("cap", (0.13, -0.06, 0.64), (0.34, -0.03, 0.72), 0.04),                                                              # wing shoulder
        ("ell", (0, -0.02, 0.69), (0.16, 0.19, 0.03), (0, 0, 0)), ("ell", (0, -0.15, 0.73), (0.06, 0.035, 0.06), (0, 0, 0)), ("ell", (0, 0.13, 0.73), (0.10, 0.035, 0.05), (0, 0, 0)),   # saddle
    ])
    shiba.decimate(body, 6500)
    shiba.paint_markings(body, SCALE, [
        (BELLY, (0, -0.26, 0.47), (0.13, 0.12, 0.19)), (BELLY, (0, -0.02, 0.38), (0.14, 0.28, 0.11)), (BELLY, (0, -0.33, 0.74), (0.065, 0.09, 0.2)),   # belly, chest + throat
        (BELLY, (0, -0.42, 0.88), (0.07, 0.06, 0.08)),
        (BELLY_DK, (0, -0.22, 0.36), (0.13, 0.01, 0.2)), (BELLY_DK, (0, -0.10, 0.36), (0.13, 0.01, 0.2)), (BELLY_DK, (0, 0.02, 0.36), (0.13, 0.01, 0.2)), (BELLY_DK, (0, 0.14, 0.36), (0.13, 0.01, 0.2)),   # plate lines
        (BELLY, (0, -0.60, 0.87), (0.065, 0.07, 0.03)), (SCALE_DK, (0, 0.2, 0.62), (0.09, 0.4, 0.06)), (SCALE_DK, (0, -0.46, 1.05), (0.09, 0.1, 0.03)),   # jaw, darker back, crown
        (BELLY, (0, 0.62, 0.32), (0.04, 0.3, 0.025)),                                                                                                  # tail underside
        (LEATHER, (0, -0.02, 0.69), (0.17, 0.2, 0.04)), (LEATHER_DK, (0, -0.02, 0.665), (0.175, 0.205, 0.012)), (LEATHER, (0, -0.15, 0.73), (0.065, 0.045, 0.065)), (LEATHER, (0, 0.13, 0.73), (0.11, 0.045, 0.055)),
        (LEATHER_DK, (0, -0.06, 0.52), (0.2, 0.025, 0.2)),                                                                                             # girth strap round the belly
        (SCALE_DK, (0.14, 0.10, 0.44), (0.08, 0.1, 0.1)),                                                                                             # thigh shading
    ])
    body.data.materials.append(bpy.data.materials["M_Toon_VC"]); body.data.materials.append(bpy.data.materials["M_Shiba_Highlight"])
    extra = []
    for sx in (1, -1):
        # wings: an arm to the wrist, four finger spars, cream membranes between them and back to the flank
        sh, wr = (0.14 * sx, -0.05, 0.66), (0.60 * sx, -0.02, 0.80)
        tips = [(0.98 * sx, 0.02, 0.92), (1.00 * sx, 0.22, 0.80), (0.86 * sx, 0.40, 0.68), (0.62 * sx, 0.50, 0.60)]
        extra.append(_stick(sh, wr, 0.03, 0.022, SCALE))
        for t in tips: extra.append(_stick(wr, t, 0.018, 0.006, SCALE))
        extra.append(_cone((0.60 * sx, -0.05, 0.84), 0.022, 0.08, (0, 0, 0), HORN))                                     # wrist claw
        root = (0.16 * sx, 0.30, 0.58)
        edge = [sh, wr]
        for a, b in zip(tips, tips[1:] + [root]):                                                                     # scalloped trailing edge
            mid = tuple((a[k] + b[k]) / 2 for k in range(3)); pull = tuple(mid[k] + (wr[k] - mid[k]) * 0.18 for k in range(3))
            edge += [a, pull]
        extra.append(_membrane([wr] + edge[2:] + [root, sh], MEMBRANE))
        # horns: a long pair swept back, a short pair below; cheek spikes; eyes
        extra.append(_stick((0.07 * sx, -0.44, 1.08), (0.10 * sx, -0.34, 1.19), 0.032, 0.012, HORN))                     # short stubby horns
        extra.append(_stick((0.12 * sx, -0.45, 1.02), (0.17 * sx, -0.38, 1.06), 0.022, 0.008, HORN))
        for k in range(2): extra.append(_cone((0.135 * sx, -0.50 + k * 0.05, 0.94 - k * 0.01), 0.012, 0.045, (0, 90 * sx, -30 * sx), HORN, 6))
        for col, loc, sc in ((EYE, (sx * 0.078, -0.585, 1.0), (0.042, 0.03, 0.045)), ((0.05, 0.05, 0.06), (sx * 0.084, -0.605, 1.0), (0.022, 0.014, 0.034)),   # big round eyes
                             ((1, 1, 1), (sx * 0.094, -0.618, 1.018), (0.01, 0.006, 0.011)), ((1, 1, 1), (sx * 0.074, -0.616, 0.985), (0.005, 0.004, 0.006)),
                             ((0.08, 0.16, 0.12), (sx * 0.026, -0.68, 0.95), (0.01, 0.007, 0.007))):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, location=loc); e = bpy.context.active_object; e.scale = sc
            bpy.ops.object.transform_apply(scale=True); extra.append(_vc(e, col))
        # three curved claws on every foot: the short forepaws and the broad hind feet
        for dx in (-0.028, 0, 0.028):
            extra.append(_cone((0.11 * sx + dx, -0.305, 0.195), 0.012, 0.05, (100, 0, 0), HORN, 6))
            extra.append(_cone((0.14 * sx + dx * 1.3, 0.065, 0.045), 0.015, 0.06, (100, 0, 0), HORN, 6))
        # saddle gear: purple crest cloth hanging on each flank, a pouch on the right
        extra.append(_box((0.175 * sx, -0.02, 0.58), (0.012, 0.16, 0.18), CLOTH))
        extra.append(_box((0.183 * sx, -0.02, 0.58), (0.004, 0.07, 0.08), CREST))
        extra.append(_box((0.172 * sx, -0.02, 0.672), (0.02, 0.17, 0.02), LEATHER_DK))
    extra.append(_box((-0.20, 0.13, 0.60), (0.05, 0.08, 0.07), LEATHER)); extra.append(_box((-0.226, 0.13, 0.62), (0.004, 0.06, 0.03), LEATHER_DK))
    # black spikes down the crown, neck, back and tail, shrinking toward the tip
    ridge = [(-0.42, 1.08), (-0.36, 0.96), (-0.32, 0.86), (-0.28, 0.76), (0.18, 0.70), (0.28, 0.63), (0.38, 0.56), (0.48, 0.50), (0.58, 0.46), (0.68, 0.42), (0.78, 0.39), (0.88, 0.36)]
    for n, (y, z) in enumerate(ridge):
        s = 1.0 - n / len(ridge) * 0.55
        extra.append(_cone((0, y, z + 0.035 * s), 0.028 * s, 0.09 * s, (-25, 0, 0), SPIKE, 6))
    for sx in (1, -1): extra.append(_cone((0.035 * sx, 0.92, 0.35), 0.02, 0.07, (0, 0, 0), SPIKE, 6))              # tail tip spikes
    knight._join(body, extra)
    return body


def flap(period, lift, drop):
    """Wingbeat keys every 2 frames: tips rise to `lift`, fall to `-drop` (right wing mirrored)."""
    l, r = [], []
    for f in range(0, period + 1, 2):
        a = (lift - drop) / 2 + (lift + drop) / 2 * math.cos(2 * math.pi * f / period)
        l.append((f, (-a, 0, 0))); r.append((f, (a, 0, 0)))
    return l, r


wl, wr = flap(12, 48, 42)
FLY = {"wing_l": wl, "wing_r": wr,
       "fore_l": [(0, (45, 0, 0)), (12, (45, 0, 0))], "fore_r": [(0, (45, 0, 0)), (12, (45, 0, 0))],     # legs tucked back in flight
       "hind_l": [(0, (60, 0, 0)), (12, (60, 0, 0))], "hind_r": [(0, (60, 0, 0)), (12, (60, 0, 0))],
       "tail1": [(0, (8, 0, 0)), (6, (-8, 0, 0)), (12, (8, 0, 0))], "tail2": [(0, (-10, 0, 0)), (6, (10, 0, 0)), (12, (-10, 0, 0))],
       "neck": [(0, (-6, 0, 0)), (6, (4, 0, 0)), (12, (-6, 0, 0))],
       "root.loc": [(0, (0, 0.03, 0)), (6, (0, -0.03, 0)), (12, (0, 0.03, 0))]}
wl, wr = flap(24, 34, 30)
HOVER = {"wing_l": wl, "wing_r": wr,
         "fore_l": [(0, (18, 0, 0)), (24, (18, 0, 0))], "fore_r": [(0, (18, 0, 0)), (24, (18, 0, 0))],
         "hind_l": [(0, (24, 0, 0)), (24, (24, 0, 0))], "hind_r": [(0, (24, 0, 0)), (24, (24, 0, 0))],
         "tail1": [(0, (0, 0, -12)), (12, (0, 0, 12)), (24, (0, 0, -12))], "tail2": [(0, (0, 0, -15)), (12, (0, 0, 15)), (24, (0, 0, -15))],
         "head": [(0, (0, 0, 0)), (12, (-5, 0, 0)), (24, (0, 0, 0))],
         "root.loc": [(0, (0, 0.02, 0)), (12, (0, -0.02, 0)), (24, (0, 0.02, 0))]}


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    out = os.path.abspath(argv[0] if argv else "out_dragon")
    horse.build_mount(out, dragon, B, {"Gallop": (12, True, FLY), "Idle": (24, True, HOVER)}, "SM_Dragon", "SK_Dragon", cam=(1.6, -1.6, 1.3))
