"""Ranged weapons for the chibi rig: Hunter Bow (left hand) and Apprentice Staff (right hand).

    .venv/bin/python build_ranged_kit.py [out_dir]     (default out_ranged)

Output: SM_RangedKit.glb — the SK_BK_Chibi armature with SM_HunterBow parented to socket_hand_l and SM_MageStaff
(+ SM_MageStaff_Gem, which the client makes glow) parented to socket_hand_r, plus preview_ranged.png.
The client lifts each weapon off its socket bone and re-parents a copy onto the same bone of every player rig, so the
bone-relative placement authored here is exactly how it sits in the paw. Vertex colours only (no textures): tiny file.
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

import build_shiba_chibi as shiba

WOOD, WOOD_DK, WRAP, STRING = (0.52, 0.33, 0.18), (0.33, 0.20, 0.10), (0.62, 0.20, 0.16), (0.93, 0.90, 0.82)
BRASS, GEM, GEM_LT = (0.86, 0.66, 0.26), (0.20, 0.52, 1.0), (0.62, 0.86, 1.0)


def tube(name, pts, radius, col, sides=8):
    """Swept tube through `pts` (bow limbs, staff shaft) — a bevelled poly curve converted to mesh."""
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = radius; cu.bevel_resolution = 2; cu.use_fill_caps = True
    sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
    for p, co in zip(sp.points, pts): p.co = (*co, 1)
    ob = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(ob)
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target="MESH"); ob = bpy.context.active_object; shiba.paint_flat(ob, col); return ob


def prim(kind, col, **kw):
    getattr(bpy.ops.mesh, f"primitive_{kind}_add")(**kw); ob = bpy.context.active_object; bpy.ops.object.transform_apply(scale=True, rotation=True); shiba.paint_flat(ob, col); return ob


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join(); ob = bpy.context.active_object
    ob.name = ob.data.name = name; ob.data.materials.clear(); ob.data.materials.append(bpy.data.materials["M_Toon_VC"])
    bpy.ops.object.shade_smooth(); return ob


def bow():
    """Recurve bow, grip at the origin, limbs along ±Z, belly bulging toward +X (the target)."""
    n, L = 14, 0.27
    limb = [(0.06 * math.sin(math.pi * abs(i / n)) * (1 if abs(i / n) < 0.85 else -0.6), 0, L * i / n) for i in range(-n, n + 1)]
    limb = [(x - 0.02 * (abs(z) / L) ** 4 * 3, y, z) for x, y, z in limb]            # tips recurve back toward the archer
    parts = [tube("limbs", limb, 0.019, WOOD)]
    tip_top, tip_bot = Vector(limb[-1]), Vector(limb[0])
    parts.append(tube("string", [tuple(tip_bot), tuple(tip_top)], 0.0025, STRING, sides=4))
    parts.append(prim("cylinder", WRAP, vertices=10, radius=0.02, depth=0.08, location=(0.006, 0, 0)))
    for z in (0.05, -0.05): parts.append(prim("torus", BRASS, major_radius=0.02, minor_radius=0.005, location=(0.006, 0, z)))
    for t in (tip_top, tip_bot): parts.append(prim("uv_sphere", WOOD_DK, radius=0.014, segments=8, ring_count=6, location=tuple(t)))
    return join(parts, "SM_HunterBow")


def staff():
    """Crooked wooden staff, grip at the origin, shaft along +Z, a blue crystal cradled in a forked head."""
    shaft = [(0.0, 0, -0.26), (0.006, 0, -0.08), (-0.004, 0, 0.12), (0.008, 0, 0.30), (0.0, 0, 0.42)]
    parts = [tube("shaft", shaft, 0.021, WOOD)]
    for side in (1, -1):                                                   # the fork that holds the crystal
        parts.append(tube(f"prong{side}", [(0.0, 0, 0.40), (0.035 * side, 0.01, 0.46), (0.03 * side, 0.0, 0.53), (0.008 * side, 0, 0.56)], 0.009, WOOD_DK))
    parts.append(prim("cylinder", WRAP, vertices=10, radius=0.021, depth=0.09, location=(0, 0, 0)))
    parts.append(prim("torus", BRASS, major_radius=0.02, minor_radius=0.006, location=(0.0, 0, 0.39)))
    parts.append(prim("cone", BRASS, vertices=8, radius1=0.016, depth=0.04, location=(0, 0, -0.28), rotation=(math.pi, 0, 0)))
    body = join(parts, "SM_MageStaff")
    gem = prim("ico_sphere", GEM, subdivisions=1, radius=0.058, location=(0, 0, 0.495))
    gem.scale = (0.8, 0.8, 1.25); bpy.ops.object.transform_apply(scale=True)
    ca = gem.data.color_attributes["Col"]
    for i, v in enumerate(gem.data.vertices):
        if v.co.z > 0.51: ca.data[i].color = (*shiba.lin(GEM_LT), 1)
    gem.name = gem.data.name = "SM_MageStaff_Gem"; gem.data.materials.append(bpy.data.materials["M_Toon_VC"])
    return body, gem


def hold(ob, arm, bone, fwd, up, offset=(0, 0, 0)):
    """Put the object's origin in the palm with local +X → `fwd` and +Z → `up` (world), then parent it to `bone`."""
    pb = arm.pose.bones[bone]; bw = arm.matrix_world @ pb.matrix
    x = Vector(fwd).normalized(); z = (Vector(up) - Vector(up).dot(x) * x).normalized(); y = z.cross(x)
    rot = Matrix((x, y, z)).transposed().to_4x4()
    ob.matrix_world = Matrix.Translation(bw.translation + Vector(offset)) @ rot
    ob.parent = arm; ob.parent_type = "BONE"; ob.parent_bone = bone
    tail = bw @ Matrix.Translation((0, pb.length, 0))
    ob.matrix_parent_inverse = tail.inverted() @ ob.matrix_world @ ob.matrix_basis.inverted()


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    parts, arm, _ = shiba.build_character()          # the Shiba is only there for the preview; it is not exported
    b = bow(); s, gem = staff()
    hold(b, arm, "socket_hand_l", fwd=(0.15, -1, 0.1), up=(0.1, -0.15, 1), offset=(0.01, -0.01, 0.02))    # bow upright, belly forward
    hold(s, arm, "socket_hand_r", fwd=(-1, -0.25, 0), up=(-0.05, -0.2, 1), offset=(0, -0.01, 0.02))      # staff upright, leaning forward a touch
    gem.parent = s; gem.matrix_parent_inverse = Matrix()   # gem coordinates are already in the staff's frame
    shoot = shiba.setup_render(out_dir); bpy.context.scene.render.use_freestyle = False
    shoot("preview_ranged.png", (0.9, -1.6, 0.8))
    bpy.ops.object.select_all(action="DESELECT")
    for o in (arm, b, s, gem): o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, "SM_RangedKit.glb"), export_format="GLB", use_selection=True, export_apply=True,
                              export_vertex_color="ACTIVE", export_animations=False, export_yup=True, export_skins=False)
    print("OK ranged kit", sum(len(o.data.polygons) for o in (b, s, gem)), "faces")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    main(os.path.abspath(argv[0] if argv else "out_ranged"))
