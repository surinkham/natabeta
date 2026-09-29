"""M1 starter gear for the chibi Shiba: chest armour, boots (skeletal, same SK_BK_Chibi skeleton)
and two swords (static, pivot at grip, +X = blade tip). Renders the Shiba fully equipped.

    .venv/bin/python build_shiba_gear.py [out_dir]

Outputs: SK_Chest_Starter.fbx, SK_Boots_Starter.fbx, SM_WoodenSword.fbx, SM_WolfFangSword.fbx,
         SK_Shiba_Equipped.blend, preview_equipped_front.png / _side.png
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

import build_shiba_chibi as shiba

LEATHER = (0.36, 0.21, 0.11)
LEATHER_DARK = (0.20, 0.11, 0.06)
STEEL = (0.60, 0.64, 0.70)
STEEL_DARK = (0.45, 0.47, 0.52)
WOOD = (0.62, 0.42, 0.22)
WOOD_DARK = (0.40, 0.25, 0.12)
BONE = (0.95, 0.92, 0.84)
FANG_ACCENT = shiba.ORANGE
TUNIC = (0.14, 0.30, 0.34)   # teal tunic: reads against orange fur

ARMOUR = {
    "SK_Chest_Starter": {
        "vols": [
            ("ell", (0, 0, 0.31), (0.148, 0.128, 0.145), (0, 0, 0)),          # vest shell
            ("ell", (0.15, 0, 0.395), (0.068, 0.062, 0.052), (0, 0, 0)),      # shoulder pad
        ],
        "base": TUNIC,
        "marks": [
            (STEEL, (0.15, 0, 0.40), (0.075, 0.07, 0.06)),                    # pads
            (STEEL, (0, -0.135, 0.33), (0.075, 0.045, 0.08)),                 # chest plate
            (LEATHER_DARK, (0, 0, 0.19), (0.20, 0.20, 0.022)),                # belt line
        ],
        "belt": (0.195, 0.135, 0.02),                                         # z, major r, minor r
        "bones": ["pelvis", "spine_01", "upperarm_l", "upperarm_r"],
        "tris": 1200,
    },
    "SK_Boots_Starter": {
        "vols": [
            ("ell", (0.075, -0.035, 0.042), (0.068, 0.097, 0.05), (0, 0, 0)),  # boot
            ("ell", (0.075, -0.005, 0.095), (0.06, 0.062, 0.035), (0, 0, 0)), # cuff
        ],
        "base": LEATHER_DARK,
        "marks": [
            (LEATHER, (0.075, -0.005, 0.105), (0.075, 0.075, 0.018)),         # cuff trim
            (STEEL_DARK, (0.075, -0.115, 0.04), (0.05, 0.03, 0.04)),          # toe cap
        ],
        "belt": None,
        "bones": ["foot_l", "foot_r", "calf_l", "calf_r"],
        "tris": 700,
    },
}

# blade length, blade width, blade thickness, curve, colours
SWORDS = {
    "SM_WoodenSword": dict(length=0.30, width=0.05, thick=0.014, curve=0.0,
                           blade=WOOD, edge=WOOD_DARK, guard=WOOD_DARK, grip=LEATHER_DARK),
    "SM_WolfFangSword": dict(length=0.36, width=0.07, thick=0.014, curve=0.05,
                             blade=BONE, edge=FANG_ACCENT, guard=STEEL_DARK, grip=LEATHER_DARK),
}


# ---------------------------------------------------------------- armour (skeletal)
def build_armour(name, spec, arm, bones):
    ob = shiba.build_volume(name, spec["vols"])
    if spec["belt"]:
        z, major, minor = spec["belt"]
        bpy.ops.mesh.primitive_torus_add(major_segments=24, minor_segments=8, major_radius=major,
                                         minor_radius=minor, location=(0, 0, z))
        belt = bpy.context.active_object
        belt.scale = (1, 0.88, 1)
        bpy.ops.object.transform_apply(scale=True)
        bpy.ops.object.select_all(action="DESELECT")
        belt.select_set(True)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.join()
        ob = bpy.context.active_object
    shiba.decimate(ob, spec["tris"])
    shiba.paint_markings(ob, spec["base"], spec["marks"])
    ob.data.materials.append(bpy.data.materials["M_Toon_VC"])
    shiba.weight(ob, spec["bones"], bones)
    shiba.bind(ob, arm)
    return ob


# ---------------------------------------------------------------- swords (static, at origin)
def box(name, center, size, col):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    shiba.paint_flat(o, col)
    o.name = name
    return o


def build_sword(name, s):
    L, w, t = s["length"], s["width"], s["thick"]
    x0 = 0.05  # blade starts just past the guard; grip centre is the origin
    blade = box("blade", (x0 + L / 2, 0, 0), (L, w, t), s["blade"])
    # taper to a point + optional upward curve (fang / scimitar)
    for v in blade.data.vertices:
        f = (v.co.x - x0) / L
        if f > 0.99:
            v.co.y = 0
            v.co.z = 0
        v.co.z += s["curve"] * f * f
    # edge line: darker/accent strip along the cutting edge (-Y side) as vertex colour
    ca = blade.data.color_attributes["Col"]
    for i, v in enumerate(blade.data.vertices):
        if v.co.y < -w * 0.4:
            ca.data[i].color = (*s["edge"], 1)
    guard = box("guard", (0.045, 0, 0), (0.02, 0.11, 0.028), s["guard"])
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.013, depth=0.085, location=(0, 0, 0),
                                        rotation=(0, math.radians(90), 0))
    grip = bpy.context.active_object
    shiba.paint_flat(grip, s["grip"])
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.018, location=(-0.05, 0, 0))
    pommel = bpy.context.active_object
    shiba.paint_flat(pommel, s["guard"])
    bpy.ops.object.select_all(action="DESELECT")
    for o in (blade, guard, grip, pommel):
        o.select_set(True)
    bpy.context.view_layer.objects.active = blade
    bpy.ops.object.join()
    sword = bpy.context.active_object
    sword.name = sword.data.name = name
    sword.data.materials.append(bpy.data.materials["M_Toon_VC"])
    bpy.ops.object.shade_flat()
    return sword


def attach_to_hand(sword, arm, bone="socket_hand_r", aim=(-0.35, -1.0, 0.45)):
    """Place the grip in the palm, aim the blade (+X) along `aim` (world), then parent to the socket bone.
    Prints the bone-relative offset -> copy into DT_EquipVisuals.Offset in UE."""
    pb = arm.pose.bones[bone]
    bone_world = arm.matrix_world @ pb.matrix              # frame at bone head, Y along bone
    palm = bone_world.translation
    rot = Vector(aim).normalized().to_track_quat("X", "Y").to_matrix().to_4x4()
    sword.matrix_world = Matrix.Translation(palm) @ rot
    sword.parent = arm
    sword.parent_type = "BONE"
    sword.parent_bone = bone
    # keep the world placement; BONE parenting is relative to the bone *tail*
    tail_frame = bone_world @ Matrix.Translation((0, pb.length, 0))
    sword.matrix_parent_inverse = tail_frame.inverted() @ sword.matrix_world @ sword.matrix_basis.inverted()
    rel = bone_world.inverted() @ sword.matrix_world
    t, e = rel.translation, rel.to_euler()
    print("SOCKET_OFFSET %s: loc(cm)=(%.1f, %.1f, %.1f) rot(deg)=(%.1f, %.1f, %.1f)  [bone head frame, Blender axes]"
          % (bone, t.x * 100, t.y * 100, t.z * 100, *[math.degrees(a) for a in e]))


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    parts, arm, bones = shiba.build_character()
    gear = {n: build_armour(n, spec, arm, bones) for n, spec in ARMOUR.items()}
    swords = {n: build_sword(n, s) for n, s in SWORDS.items()}

    for n, g in gear.items():
        shiba.export_fbx(os.path.join(out_dir, n + ".fbx"), [arm, g])
    for n, sw in swords.items():
        shiba.export_fbx(os.path.join(out_dir, n + ".fbx"), [sw])

    # equipped preview: armour + boots + wolf fang sword in the right hand
    swords["SM_WoodenSword"].hide_render = True
    swords["SM_WoodenSword"].hide_viewport = True
    attach_to_hand(swords["SM_WolfFangSword"], arm)
    shiba.render_previews(out_dir, prefix="preview_equipped")
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "SK_Shiba_Equipped.blend"))

    # self-check
    names = {b.name for b in arm.data.bones}
    for n, g in gear.items():
        assert all(vg.name in names for vg in g.vertex_groups), n
        assert "Col" in g.data.color_attributes, n
    for n, sw in swords.items():
        xs = [v.co.x for v in sw.data.vertices]
        assert min(xs) < 0 < max(xs) and max(xs) > 0.3, n   # grip around origin, blade along +X
    tris = {n: sum(len(f.vertices) - 2 for f in o.data.polygons) for n, o in {**gear, **swords}.items()}
    print("OK gear", tris, "->", out_dir)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    main(os.path.abspath(argv[0] if argv else "out"))
