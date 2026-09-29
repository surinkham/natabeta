"""Medieval-fantasy town kit (same toon/vertex-colour language as the characters): walls, towers, gate, stone houses,
tavern, market stall, well, banner, torch, bridge. Exports .fbx + .glb per prop and renders a kit sheet.

    .venv/bin/python build_town_kit.py [out_dir]     (default out_town)
"""
import math
import os
import random
import sys

import bpy
from mathutils import Vector

import build_env_kit as env
import build_shiba_chibi as shiba

STONE, STONE_DK, STONE_LT = (0.62, 0.60, 0.58), (0.42, 0.40, 0.40), (0.78, 0.76, 0.72)
WOOD, WOOD_DK = (0.52, 0.34, 0.18), (0.33, 0.20, 0.10)
PLASTER = (0.90, 0.84, 0.70)
SLATE = (0.35, 0.38, 0.46)
TILE = (0.70, 0.24, 0.18)
BANNER = (0.16, 0.30, 0.54)
GOLD = (0.88, 0.68, 0.24)
FLAME = (1.0, 0.65, 0.15)
IRON = (0.30, 0.31, 0.35)

prim, join, finish, gradient_z = env.prim, env.join, env.finish, env.gradient_z


def box(col, size, loc, rot=(0, 0, 0)):
    o = prim("cube", col, size=1, location=loc, rotation=rot); o.scale = size
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.ops.object.transform_apply(scale=True); return o


def stones(col, dark, n, area, z0, z1, seed):
    """Scatter flat stone blocks on a wall face for a masonry read (vertex colour only, no texture)."""
    random.seed(seed); out = []
    for _ in range(n):
        x, y = area[0] + random.random() * area[1], area[2]
        w, h = 0.35 + random.random() * 0.5, 0.18 + random.random() * 0.14
        out.append(box(dark if random.random() < 0.3 else col, (w, 0.08, h), (x, y, z0 + random.random() * (z1 - z0))))
    return out


def wall_segment():   # 4 m long, 3 m high, walkway + crenellations
    base = box(STONE, (4.0, 1.0, 3.0), (0, 0, 1.5)); cap = box(STONE_LT, (4.2, 1.2, 0.25), (0, 0, 3.1))
    cren = [box(STONE_LT, (0.5, 0.3, 0.6), (x, -0.45, 3.5)) for x in (-1.5, -0.5, 0.5, 1.5)] + [box(STONE_LT, (0.5, 0.3, 0.6), (x, 0.45, 3.5)) for x in (-1.5, -0.5, 0.5, 1.5)]
    st = stones(STONE_LT, STONE_DK, 18, (-1.9, 3.8, -0.53), 0.3, 2.7, 1)
    butt = [box(STONE_DK, (0.6, 0.5, 2.2), (x, -0.7, 1.1)) for x in (-1.6, 1.6)]; slit = box((0.05, 0.05, 0.08), (0.12, 0.1, 0.7), (0, -0.52, 2.0))
    ob = join(base, [cap, slit] + cren + st + butt); bpy.ops.object.shade_flat(); return finish(ob, "SM_Wall")


def wall_tower():
    body = prim("cylinder", STONE, vertices=12, radius=1.2, depth=5.0, location=(0, 0, 2.5))
    ring = prim("cylinder", STONE_LT, vertices=12, radius=1.4, depth=0.3, location=(0, 0, 5.1))
    cren = [box(STONE_LT, (0.45, 0.3, 0.6), (math.cos(a) * 1.25, math.sin(a) * 1.25, 5.5), (0, 0, a)) for a in [i * math.pi / 4 for i in range(8)]]
    roof = prim("cone", SLATE, vertices=12, radius1=1.5, radius2=0.05, depth=2.2, location=(0, 0, 6.6))
    flag = box(BANNER, (0.05, 0.9, 0.5), (0, 0.45, 8.0)); pole = prim("cylinder", WOOD_DK, vertices=6, radius=0.04, depth=1.6, location=(0, 0, 8.2))
    slits = [box((0.05, 0.05, 0.08), (0.12, 0.1, 0.6), (math.cos(a) * 1.18, math.sin(a) * 1.18, z), (0, 0, a)) for a in (0.5, 2.1, 3.7, 5.3) for z in (2.0, 3.8)]
    door = box(WOOD_DK, (0.7, 0.1, 1.2), (0, -1.18, 0.6)); band = prim("cylinder", STONE_DK, vertices=12, radius=1.24, depth=0.15, location=(0, 0, 3.0))
    st = [box(STONE_LT, (0.4, 0.1, 0.2), (math.cos(a) * 1.2, math.sin(a) * 1.2, z), (0, 0, a + math.pi / 2)) for a in [i * 0.9 for i in range(7)] for z in (1.0, 2.4, 4.2)]
    ob = join(body, [ring, roof, flag, pole, door, band] + cren + slits + st); bpy.ops.object.shade_flat(); return finish(ob, "SM_Tower")


def gate():   # arched gatehouse, 4 m opening
    l = box(STONE, (1.4, 1.6, 5.0), (-2.7, 0, 2.5)); r = box(STONE, (1.4, 1.6, 5.0), (2.7, 0, 2.5))
    top = box(STONE, (6.8, 1.6, 1.6), (0, 0, 5.4)); cap = box(STONE_LT, (7.0, 1.8, 0.25), (0, 0, 6.3))
    cren = [box(STONE_LT, (0.5, 0.3, 0.6), (x, -0.75, 6.7)) for x in (-3.0, -2.0, -1.0, 0, 1.0, 2.0, 3.0)]
    arch = prim("cylinder", STONE_DK, vertices=16, radius=2.1, depth=1.7, location=(0, 0, 4.6), rotation=(math.pi / 2, 0, 0))
    arch.scale = (1, 0.6, 1); bpy.ops.object.transform_apply(scale=True)
    # portcullis bars
    bars = [box(IRON, (0.08, 0.08, 1.4), (x, 0, 4.5)) for x in (-1.2, -0.6, 0, 0.6, 1.2)]
    banners = [box(BANNER, (0.05, 0.9, 1.6), (x, -0.9, 3.6)) for x in (-2.7, 2.7)] + [box(GOLD, (0.06, 0.4, 0.4), (x, -0.93, 3.9)) for x in (-2.7, 2.7)]
    ob = join(l, [r, top, cap, arch] + cren + bars + banners); bpy.ops.object.shade_flat(); return finish(ob, "SM_Gate")


def stone_house(name, w=4.0, d=3.6, tile=TILE, seed=3):
    base = box(STONE, (w, d, 1.3), (0, 0, 0.65)); upper = box(PLASTER, (w + 0.3, d + 0.3, 1.9), (0, 0, 2.25))   # jettied upper floor
    fy = -(d + 0.3) / 2 - 0.02
    beams = [box(WOOD_DK, (0.14, 0.06, 1.9), (x, fy, 2.25)) for x in (-w / 2 + 0.2, -w / 4, 0, w / 4, w / 2 - 0.2)]
    beams += [box(WOOD_DK, ((w + 0.3), 0.06, 0.12), (0, fy, z)) for z in (1.35, 3.15)]
    beams += [box(WOOD_DK, (0.12, 0.06, 1.2), (x, fy, 2.25), (0, math.radians(35 * sgn), 0)) for x, sgn in ((-w / 2 + 0.7, 1), (w / 2 - 0.7, -1))]
    beams += [box(WOOD_DK, (0.12, 0.06, 1.2), (x, fy, 2.25), (0, math.radians(-35 * sgn), 0)) for x, sgn in ((-w / 2 + 0.7, 1), (w / 2 - 0.7, -1))]   # cross braces
    beams += [box(WOOD_DK, (0.14, 0.06, 1.9), (x, (d + 0.3) / 2 + 0.02, 2.25)) for x in (-w / 2 + 0.2, 0, w / 2 - 0.2)]                          # back face too
    jetty = [box(WOOD_DK, (0.18, 0.4, 0.18), (x, -d / 2 - 0.1, 1.2), (math.radians(35), 0, 0)) for x in (-w / 2 + 0.4, 0, w / 2 - 0.4)]           # brackets
    roof = prim("cone", tile, vertices=4, radius1=(w + 1.2) * 0.72, radius2=0.2, depth=1.9, location=(0, 0, 4.1), rotation=(0, 0, math.pi / 4))
    roof.scale = (1, d / w, 1); bpy.ops.object.transform_apply(scale=True)
    rows = [prim("cone", (tile[0] * 0.8, tile[1] * 0.8, tile[2] * 0.8), vertices=4, radius1=(w + 1.2) * 0.72 - k * 0.9, radius2=(w + 1.2) * 0.72 - k * 0.9 - 0.15, depth=0.07, location=(0, 0, 3.25 + k * 0.5), rotation=(0, 0, math.pi / 4)) for k in range(3)]
    for r in rows: r.scale = (1, d / w, 1); bpy.ops.object.transform_apply(scale=True)
    ridge = box(WOOD_DK, (0.5, 0.5, 0.35), (0, 0, 5.0))
    # arched door + lintel, windows with lintels, sills and flower boxes, a wall lantern
    door = box(WOOD, (0.9, 0.08, 1.05), (0.9, -d / 2 - 0.03, 0.53)); arch = prim("cylinder", WOOD, vertices=12, radius=0.45, depth=0.08, location=(0.9, -d / 2 - 0.03, 1.05), rotation=(math.pi / 2, 0, 0))
    frame = box(STONE_DK, (1.15, 0.06, 1.15), (0.9, -d / 2 - 0.01, 0.58)); farch = prim("cylinder", STONE_DK, vertices=12, radius=0.58, depth=0.06, location=(0.9, -d / 2 - 0.01, 1.05), rotation=(math.pi / 2, 0, 0))
    knob = prim("uv_sphere", GOLD, segments=6, ring_count=4, radius=0.05, location=(1.2, -d / 2 - 0.08, 0.6))
    win = [box((0.55, 0.75, 0.90), (0.6, 0.06, 0.6), (x, fy - 0.03, 2.3)) for x in (-w / 2 + 0.9, w / 2 - 0.9)]
    lint = [box(WOOD_DK, (0.8, 0.08, 0.1), (x, fy - 0.05, 2.68)) for x in (-w / 2 + 0.9, w / 2 - 0.9)] + [box(WOOD_DK, (0.8, 0.14, 0.08), (x, fy - 0.08, 1.96)) for x in (-w / 2 + 0.9, w / 2 - 0.9)]
    shut = [box(WOOD_DK, (0.2, 0.05, 0.62), (x + sg * 0.4, fy - 0.04, 2.3)) for x in (-w / 2 + 0.9, w / 2 - 0.9) for sg in (-1, 1)]
    flowers = [box(WOOD, (0.7, 0.2, 0.18), (x, fy - 0.16, 1.85)) for x in (-w / 2 + 0.9, w / 2 - 0.9)] + [prim("uv_sphere", c, segments=6, ring_count=4, radius=0.09, location=(x + dx, fy - 0.18, 2.0)) for x in (-w / 2 + 0.9, w / 2 - 0.9) for dx, c in ((-0.2, (0.9, 0.25, 0.3)), (0, (0.95, 0.8, 0.2)), (0.2, (0.9, 0.35, 0.55)))]
    lantern = [box(WOOD_DK, (0.06, 0.4, 0.06), (-w / 2 + 0.3, -d / 2 - 0.2, 1.7)), box(IRON, (0.18, 0.18, 0.26), (-w / 2 + 0.3, -d / 2 - 0.42, 1.55)), prim("uv_sphere", (1.0, 0.85, 0.5), segments=6, ring_count=4, radius=0.07, location=(-w / 2 + 0.3, -d / 2 - 0.42, 1.55))]
    win_side = [box((0.55, 0.75, 0.90), (0.06, 0.55, 0.55), (sg * (w / 2 + 0.16), 0, 2.3)) for sg in (-1, 1)]
    quoins = [box(STONE_LT, (0.3, 0.3, 0.22), (sx * (w / 2 - 0.02), sy * (d / 2 - 0.02), z)) for sx in (-1, 1) for sy in (-1, 1) for z in (0.25, 0.7, 1.15)]
    chim = box(STONE_DK, (0.5, 0.5, 1.5), (w / 2 - 0.9, d / 4, 4.6)); chim_cap = box(STONE_LT, (0.62, 0.62, 0.12), (w / 2 - 0.9, d / 4, 5.4))
    st = stones(STONE_LT, STONE_DK, 14, (-w / 2 + 0.2, w - 0.6, -d / 2 - 0.03), 0.1, 1.15, seed)
    ob = join(base, [upper, roof, ridge, door, arch, frame, farch, knob, chim, chim_cap] + beams + jetty + rows + win + lint + shut + flowers + lantern + win_side + quoins + st)
    bpy.ops.object.shade_flat(); ob = finish(ob, name)
    ob.data.materials.append(bpy.data.materials["M_Shiba_Highlight"])      # lantern glow
    for p in ob.data.polygons:
        if (p.center - Vector((-w / 2 + 0.3, -d / 2 - 0.42, 1.55))).length < 0.08: p.material_index = 1
    return ob


def tavern():
    ob = stone_house("SM_Tavern", 5.2, 4.2, SLATE, 7)
    post = box(WOOD_DK, (0.12, 0.12, 2.2), (-3.0, -2.6, 1.1)); arm = box(WOOD_DK, (0.9, 0.08, 0.08), (-2.6, -2.6, 2.2))
    sign = box(GOLD, (0.7, 0.06, 0.5), (-2.4, -2.6, 1.85)); mug = prim("cylinder", WOOD, vertices=8, radius=0.14, depth=0.28, location=(-2.4, -2.66, 1.85), rotation=(math.pi / 2, 0, 0))
    lantern = box((1.0, 0.85, 0.5), (0.2, 0.2, 0.3), (-2.9, -2.75, 1.6))
    ob = join(ob, [post, arm, sign, mug, lantern]); ob.name = ob.data.name = "SM_Tavern"; return ob


def market_stall():
    table = box(WOOD, (2.2, 1.0, 0.1), (0, 0, 0.9)); legs = [box(WOOD_DK, (0.1, 0.1, 0.9), (x, y, 0.45)) for x in (-1.0, 1.0) for y in (-0.4, 0.4)]
    posts = [box(WOOD_DK, (0.08, 0.08, 2.3), (x, -0.5, 1.15)) for x in (-1.1, 1.1)] + [box(WOOD_DK, (0.08, 0.08, 1.9), (x, 0.5, 0.95)) for x in (-1.1, 1.1)]
    awning = box((0.85, 0.25, 0.2), (2.5, 1.4, 0.06), (0, 0, 2.2), (math.radians(-15), 0, 0))
    stripes = [box((0.95, 0.92, 0.85), (0.3, 1.4, 0.07), (x, 0, 2.2), (math.radians(-15), 0, 0)) for x in (-0.9, -0.3, 0.3, 0.9)]
    goods = [prim("uv_sphere", c, segments=8, ring_count=6, radius=0.14, location=(x, y, 1.05)) for x, y, c in ((-0.6, -0.2, (0.9, 0.2, 0.2)), (-0.3, 0.1, (0.9, 0.2, 0.2)), (0.4, -0.2, (0.95, 0.75, 0.2)), (0.7, 0.1, (0.3, 0.7, 0.3)))]
    crate = box(WOOD, (0.5, 0.5, 0.4), (0.9, 0.2, 1.15))
    ob = join(table, legs + posts + [awning, crate] + stripes + goods); bpy.ops.object.shade_flat(); return finish(ob, "SM_Stall")


def well():
    ring = prim("cylinder", STONE, vertices=10, radius=0.9, depth=0.9, location=(0, 0, 0.45)); hole = prim("cylinder", (0.05, 0.08, 0.12), vertices=10, radius=0.7, depth=0.1, location=(0, 0, 0.88))
    posts = [box(WOOD_DK, (0.12, 0.12, 1.8), (x, 0, 1.5)) for x in (-0.8, 0.8)]; beam = box(WOOD_DK, (1.9, 0.1, 0.1), (0, 0, 2.4)); drum = prim("cylinder", WOOD, vertices=8, radius=0.12, depth=1.4, location=(0, 0, 2.15), rotation=(0, math.pi / 2, 0))
    roof = prim("cone", SLATE, vertices=6, radius1=1.05, radius2=0.05, depth=0.55, location=(0, 0, 2.75))
    bucket = prim("cylinder", WOOD_DK, vertices=8, radius=0.16, depth=0.24, location=(0, 0, 1.4))
    st = stones(STONE_LT, STONE_DK, 10, (-0.8, 1.6, -0.9), 0.1, 0.8, 5)
    ob = join(ring, [hole, beam, drum, roof, bucket] + posts + st); bpy.ops.object.shade_flat(); return finish(ob, "SM_Well")


def banner():
    pole = prim("cylinder", WOOD_DK, vertices=6, radius=0.05, depth=3.4, location=(0, 0, 1.7)); top = prim("uv_sphere", GOLD, segments=8, ring_count=6, radius=0.09, location=(0, 0, 3.45))
    arm = box(WOOD_DK, (0.8, 0.05, 0.05), (0.4, 0, 3.2)); cloth = box(BANNER, (0.7, 0.04, 1.4), (0.45, 0, 2.5))
    paw = [prim("uv_sphere", GOLD, segments=6, ring_count=4, radius=r, location=(0.45 + dx, -0.03, 2.4 + dz)) for dx, dz, r in ((0, 0, 0.14), (-0.13, 0.2, 0.06), (0, 0.25, 0.06), (0.13, 0.2, 0.06))]
    ob = join(pole, [top, arm, cloth] + paw); bpy.ops.object.shade_flat(); return finish(ob, "SM_Banner")


def torch():
    post = prim("cylinder", WOOD_DK, vertices=6, radius=0.06, depth=1.8, location=(0, 0, 0.9)); cup = prim("cone", IRON, vertices=8, radius1=0.18, radius2=0.08, depth=0.25, location=(0, 0, 1.9))
    flame = prim("cone", FLAME, vertices=8, radius1=0.15, radius2=0.01, depth=0.45, location=(0, 0, 2.2)); core = prim("uv_sphere", (1.0, 0.9, 0.5), segments=8, ring_count=6, radius=0.09, location=(0, 0, 2.05))
    ob = join(post, [cup, flame, core]); ob.data.materials.clear(); ob.data.materials.append(bpy.data.materials["M_Toon_VC"]); ob.data.materials.append(bpy.data.materials["M_Shiba_Highlight"])
    for p in ob.data.polygons:
        if p.center.z > 1.95: p.material_index = 1
    ob.name = ob.data.name = "SM_Torch"; return ob


def keep():   # small castle keep: the town landmark on the south side
    base = box(STONE, (8.0, 6.0, 5.5), (0, 0, 2.75)); cap = box(STONE_LT, (8.4, 6.4, 0.3), (0, 0, 5.6))
    cren = [box(STONE_LT, (0.5, 0.35, 0.6), (x, -3.05, 6.0)) for x in [-3.5 + i * 1.0 for i in range(8)]] + [box(STONE_LT, (0.5, 0.35, 0.6), (x, 3.05, 6.0)) for x in [-3.5 + i * 1.0 for i in range(8)]]
    towers = [prim("cylinder", STONE, vertices=10, radius=1.0, depth=7.5, location=(x, y, 3.75)) for x in (-4.2, 4.2) for y in (-3.2, 3.2)]
    roofs = [prim("cone", SLATE, vertices=10, radius1=1.25, radius2=0.05, depth=1.9, location=(x, y, 8.4)) for x in (-4.2, 4.2) for y in (-3.2, 3.2)]
    hall = box(STONE, (4.0, 3.0, 2.5), (0, 0, 6.9)); hroof = prim("cone", SLATE, vertices=4, radius1=3.4, radius2=0.2, depth=1.6, location=(0, 0, 8.9), rotation=(0, 0, math.pi / 4)); hroof.scale = (1, 0.75, 1); bpy.ops.object.transform_apply(scale=True)
    door = box(WOOD_DK, (1.4, 0.12, 2.2), (0, -3.05, 1.1)); arch = prim("cylinder", WOOD_DK, vertices=12, radius=0.7, depth=0.12, location=(0, -3.05, 2.2), rotation=(math.pi / 2, 0, 0))
    farch = prim("cylinder", STONE_DK, vertices=12, radius=0.9, depth=0.1, location=(0, -3.03, 2.2), rotation=(math.pi / 2, 0, 0)); fr = box(STONE_DK, (1.8, 0.1, 2.2), (0, -3.03, 1.1))
    wins = [box((0.55, 0.75, 0.90), (0.5, 0.1, 0.9), (x, -3.06, 4.0)) for x in (-2.4, 2.4)] + [box((0.55, 0.75, 0.90), (0.5, 0.1, 0.7), (x, -1.56, 7.2)) for x in (-1.0, 1.0)]
    flag = box(BANNER, (0.06, 1.2, 0.7), (0, 0.6, 10.5)); pole = prim("cylinder", WOOD_DK, vertices=6, radius=0.05, depth=2.2, location=(0, 0, 10.6)); ball = prim("uv_sphere", GOLD, segments=8, ring_count=6, radius=0.1, location=(0, 0, 11.7))
    banners = [box(BANNER, (0.06, 0.9, 2.4), (x, -3.1, 3.6)) for x in (-1.5, 1.5)] + [prim("uv_sphere", GOLD, segments=6, ring_count=4, radius=0.22, location=(x, -3.15, 3.5)) for x in (-1.5, 1.5)]
    st = stones(STONE_LT, STONE_DK, 30, (-3.8, 7.6, -3.04), 0.3, 5.0, 21)
    ob = join(base, [cap, hall, hroof, door, arch, farch, fr, flag, pole, ball] + cren + towers + roofs + wins + banners + st); bpy.ops.object.shade_flat(); return finish(ob, "SM_Keep")


def bridge():
    deck = box(WOOD, (4.0, 2.0, 0.15), (0, 0, 0.55), (0, 0, 0)); planks = [box(WOOD_DK, (0.06, 2.0, 0.17), (x, 0, 0.55)) for x in [-1.6 + i * 0.4 for i in range(9)]]
    arch = prim("cylinder", WOOD, vertices=12, radius=1.9, depth=1.8, location=(0, 0, -1.2), rotation=(math.pi / 2, 0, 0)); arch.scale = (1, 0.5, 1); bpy.ops.object.transform_apply(scale=True)
    rails = [box(WOOD_DK, (4.0, 0.08, 0.08), (0, y, 1.3)) for y in (-0.95, 0.95)] + [box(WOOD_DK, (0.08, 0.08, 0.7), (x, y, 0.95)) for x in (-1.8, -0.6, 0.6, 1.8) for y in (-0.95, 0.95)]
    ob = join(deck, planks + rails); bpy.ops.object.shade_flat(); return finish(ob, "SM_Bridge")


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True); shiba.make_materials()
    kit = {}
    for fn in (wall_segment, wall_tower, gate, lambda: stone_house("SM_House_Stone"), lambda: stone_house("SM_House_Stone2", 3.4, 3.0, SLATE, 11), tavern, market_stall, well, banner, torch, bridge, keep):
        o = fn(); kit[o.name] = o
    for name, o in kit.items():
        shiba.export_fbx(os.path.join(out_dir, name + ".fbx"), [o])
        bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, name + ".glb"), export_format="GLB", use_selection=True, export_apply=True, export_vertex_color="ACTIVE", export_animations=False, export_yup=True)
    # kit sheet: line the props up and render once
    for i, o in enumerate(kit.values()): o.location = (i * 9 - 50, 0, 0)
    shoot = shiba.setup_render(out_dir); sc = bpy.context.scene; sc.render.resolution_x, sc.render.resolution_y = 1600, 500; sc.cycles.samples = 32
    sc.view_settings.view_transform = "AgX"; sc.view_settings.look = "AgX - Punchy"; bpy.data.objects["Key"].data.energy = 2.5
    cam = sc.camera; cam.location = Vector((0, -70, 30)); cam.rotation_euler = (Vector((0, 0, 3)) - cam.location).to_track_quat("-Z", "Y").to_euler(); cam.data.lens = 24
    bpy.data.objects["Backdrop"].location = (0, 30, 5); bpy.data.objects["Backdrop"].rotation_euler = (math.pi / 2, 0, 0); bpy.data.objects["Backdrop"].scale = (12, 12, 12)
    sc.render.filepath = os.path.join(out_dir, "town_kit_sheet.png"); bpy.ops.render.render(write_still=True)
    tris = {n: sum(len(f.vertices) - 2 for f in o.data.polygons) for n, o in kit.items()}
    print("OK town kit", tris, "->", out_dir)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    main(os.path.abspath(argv[0] if argv else "out_town"))
