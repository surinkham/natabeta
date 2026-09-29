"""Dog Knight (อัศวินผู้ซื่อสัตย์) from the concept sheet: floppy-eared tan/white puppy in silver plate,
red-plume helmet, blue cape + kite shield with gold paw emblem, gem sword. Same SK_BK_Chibi skeleton.

    .venv/bin/python build_dog_knight.py [out_dir]

Outputs: SK_DogKnight.fbx (body parts), SK_Knight_*.fbx (helmet/chest/gloves/boots/cape),
         SM_KnightSword.fbx, SM_KiteShield.fbx, dog_knight.glb (everything, for the browser game),
         preview_knight_front/side/back.png
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

import build_shiba_chibi as shiba
import build_shiba_gear as gear

# ---------------------------------------------------------------- palette (from the sheet)
WHITE = (0.94, 0.92, 0.88)
TAN = (0.80, 0.55, 0.28)
BROWN = (0.52, 0.32, 0.15)
RED = (0.62, 0.10, 0.14)
BLUE = (0.11, 0.22, 0.46)
GOLD = (0.88, 0.68, 0.24)
DARK = (0.22, 0.20, 0.22)
STEEL = (0.80, 0.82, 0.86)
STEEL_DK = (0.52, 0.55, 0.62)
PINK = (0.93, 0.45, 0.50)
IRIS = (0.30, 0.16, 0.06)
BLACK = shiba.BLACK

# ---------------------------------------------------------------- puppy (breed override of the Shiba rig)
BONES = dict(shiba.BONES)
BONES["ear_l"] = ((0.19, -0.01, 0.70), (0.25, -0.02, 0.50), "head")   # floppy: hangs down

VOLUMES = {
    "SK_Dog_Head": [
        ("ell", (0, 0, 0.60), (0.245, 0.225, 0.215), (0, 0, 0)),
        ("ell", (0, -0.19, 0.535), (0.11, 0.08, 0.07), (0, 0, 0)),       # muzzle
        ("ell", (0.155, -0.11, 0.55), (0.075, 0.07, 0.06), (0, 0, 0)),   # cheeks
    ],
    "SK_Dog_Body": shiba.VOLUMES["SK_Shiba_Body"],
    "SK_Dog_Ears": [
        ("ell", (0.245, -0.02, 0.59), (0.045, 0.08, 0.135), (0, 14, 0)),   # floppy ear, hangs out from under the helmet
    ],
    "SK_Dog_Tail": shiba.VOLUMES["SK_Shiba_Tail"],
}
MARKINGS = {
    "SK_Dog_Head": [
        (WHITE, (0, -0.22, 0.56), (0.17, 0.11, 0.11)),        # muzzle
        (WHITE, (0, -0.20, 0.68), (0.055, 0.09, 0.16)),        # blaze up the forehead
        (TAN, (0.11, -0.16, 0.66), (0.075, 0.09, 0.075)),      # eye patches stay tan
    ],
    "SK_Dog_Body": [
        (WHITE, (0, -0.11, 0.28), (0.11, 0.06, 0.14)),
        (WHITE, (0.20, -0.03, 0.225), (0.075, 0.075, 0.065)),
        (WHITE, (0.075, -0.04, 0.045), (0.08, 0.10, 0.055)),
    ],
    "SK_Dog_Ears": [(BROWN, (0.245, -0.02, 0.59), (0.2, 0.2, 0.3))],
    "SK_Dog_Tail": [(WHITE, (0, 0.10, 0.50), (0.05, 0.05, 0.04))],
}
FACE = [
    (WHITE, (0.10, -0.196, 0.64), (0.05, 0.014, 0.066), 0),      # sclera
    (IRIS, (0.102, -0.204, 0.635), (0.040, 0.012, 0.056), 0),     # iris
    (BLACK, (0.104, -0.211, 0.632), (0.024, 0.010, 0.034), 0),    # pupil
    (WHITE, (0.088, -0.216, 0.658), (0.014, 0.006, 0.017), 1),    # highlight
    (WHITE, (0.115, -0.214, 0.618), (0.007, 0.005, 0.008), 1),    # small highlight
    (BLACK, (0, -0.276, 0.565), (0.032, 0.022, 0.024), 0),        # nose
    (DARK, (0, -0.262, 0.505), (0.045, 0.010, 0.022), 0),         # open mouth
    (PINK, (0, -0.268, 0.492), (0.022, 0.012, 0.014), 0),         # tongue
]
PART_BONES = {"SK_Dog_Head": ["head"], "SK_Dog_Body": shiba.PART_BONES["SK_Shiba_Body"],
              "SK_Dog_Ears": ["ear_l", "ear_r"], "SK_Dog_Tail": ["tail_01"]}

# ---------------------------------------------------------------- armour set
ARMOUR = {
    "SK_Knight_Chest": {
        "vols": [
            ("ell", (0, 0, 0.31), (0.15, 0.13, 0.15), (0, 0, 0)),             # cuirass
            ("ell", (0.16, 0, 0.40), (0.075, 0.07, 0.06), (0, 0, 0)),          # pauldron
            ("ell", (0.12, -0.10, 0.20), (0.05, 0.035, 0.045), (0, 0, 0)),     # pouch (right hip only? mirrored is fine)
        ],
        "base": STEEL,
        "marks": [
            (GOLD, (0.16, 0, 0.44), (0.09, 0.09, 0.025)),                       # pauldron trim
            (GOLD, (0, 0, 0.44), (0.30, 0.30, 0.02)),                           # collar line
            (RED, (0, 0, 0.415), (0.30, 0.30, 0.03)),                           # scarf
            (GOLD, (0, -0.15, 0.335), (0.045, 0.03, 0.045)),                    # paw emblem
            (GOLD, (0.03, -0.15, 0.375), (0.016, 0.03, 0.016)),
            (GOLD, (0.055, -0.145, 0.355), (0.014, 0.03, 0.014)),
            (BROWN, (0, 0, 0.205), (0.30, 0.30, 0.022)),                        # belt
            (GOLD, (0, -0.145, 0.205), (0.03, 0.03, 0.02)),                     # buckle
            (BROWN, (0.12, -0.10, 0.20), (0.07, 0.06, 0.06)),                   # pouch
        ],
        "belt": (0.205, 0.14, 0.02), "bones": ["pelvis", "spine_01", "upperarm_l", "upperarm_r"], "tris": 1600,
    },
    "SK_Knight_Gloves": {
        "vols": [("ell", (0.20, -0.03, 0.225), (0.064, 0.064, 0.06), (0, 0, 0)),
                 ("ell", (0.19, -0.02, 0.29), (0.05, 0.05, 0.035), (0, 0, 0))],   # cuff
        "base": STEEL, "marks": [(GOLD, (0.19, -0.02, 0.30), (0.07, 0.07, 0.012))],
        "belt": None, "bones": ["hand_l", "hand_r", "lowerarm_l", "lowerarm_r"], "tris": 600,
    },
    "SK_Knight_Boots": {
        "vols": [("ell", (0.075, -0.035, 0.042), (0.07, 0.10, 0.052), (0, 0, 0)),
                 ("ell", (0.075, -0.005, 0.10), (0.062, 0.064, 0.04), (0, 0, 0))],
        "base": STEEL, "marks": [(GOLD, (0.075, -0.005, 0.12), (0.08, 0.08, 0.012)), (DARK, (0.075, -0.06, 0.02), (0.09, 0.12, 0.012))],
        "belt": None, "bones": ["foot_l", "foot_r", "calf_l", "calf_r"], "tris": 700,
    },
}


def build_helmet(arm, bones):
    ob = shiba.build_volume("SK_Knight_Helmet", [
        ("ell", (0, 0.015, 0.665), (0.265, 0.245, 0.215), (0, 0, 0)),
    ])
    # open the face: drop everything below the brow in front, keep the neck guard behind
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="DESELECT"); bpy.ops.object.mode_set(mode="OBJECT")
    for v in ob.data.vertices:
        v.select = (v.co.z < 0.665 and v.co.y < 0.02) or (v.co.z < 0.50)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.delete(type="VERT"); bpy.ops.object.mode_set(mode="OBJECT")
    shiba.decimate(ob, 900)
    shiba.paint_markings(ob, STEEL, [(GOLD, (0, 0.015, 0.665), (0.30, 0.30, 0.018))])   # gold band at the brow
    extras = []
    # visor plate with dark slits
    visor = gear.box("visor", (0, -0.215, 0.735), (0.36, 0.05, 0.085), STEEL)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.subdivide(number_cuts=8); bpy.ops.object.mode_set(mode="OBJECT")
    ca = visor.data.color_attributes["Col"]
    for i, v in enumerate(visor.data.vertices):
        if abs(v.co.z - 0.735) > 0.04 or abs(abs(v.co.x) - 0.18) < 0.001:
            ca.data[i].color = (*GOLD, 1)                                   # gold edge trim
        elif v.co.y < -0.23 and abs(v.co.z - 0.735) < 0.025 and any(abs(v.co.x - x) < 0.025 for x in (-0.12, -0.04, 0.04, 0.12)):
            ca.data[i].color = (*DARK, 1)                                   # visor slits
    extras.append(visor)
    # rim band + plume
    bpy.ops.mesh.primitive_torus_add(major_segments=28, minor_segments=8, major_radius=0.25, minor_radius=0.018, location=(0, 0.015, 0.665))
    rim = bpy.context.active_object; rim.scale = (1.03, 0.95, 1); bpy.ops.object.transform_apply(scale=True); shiba.paint_flat(rim, GOLD); extras.append(rim)
    plume_pts = [(0, 0.02, 0.90), (0, 0.10, 0.94), (0, 0.19, 0.92), (0, 0.26, 0.86), (0, 0.30, 0.78)]
    for i, p in enumerate(plume_pts):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=7, location=p)
        s = bpy.context.active_object; s.scale = (0.045 + 0.01 * i, 0.06, 0.07 - 0.008 * i); bpy.ops.object.transform_apply(scale=True)
        shiba.paint_flat(s, RED); extras.append(s)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.02, depth=0.05, location=(0, 0.02, 0.88)); h = bpy.context.active_object; shiba.paint_flat(h, GOLD); extras.append(h)
    _join(ob, extras)
    ob.data.materials.append(bpy.data.materials["M_Toon_VC"]); ob.data.materials.append(bpy.data.materials["M_Shiba_Highlight"])
    shiba.weight(ob, ["head"], bones); shiba.bind(ob, arm)
    return ob


def build_cape(arm, bones):
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=22, y_subdivisions=34, size=1)
    ob = bpy.context.active_object; ob.name = ob.data.name = "SK_Knight_Cape"
    for v in ob.data.vertices:
        u, t = v.co.x, (v.co.y + 0.5)             # u -1..1 across, t 0..1 bottom→top
        w = 0.20 + 0.09 * (1 - t)                  # shoulder-wide, flares toward the hem
        v.co = Vector((u * w, 0.115 + 0.10 * (1 - t) + 0.03 * (u * u), 0.06 + t * 0.36))
    shiba.paint_markings(ob, BLUE, [
        (GOLD, (0, 0.20, 0.22), (0.055, 0.2, 0.05)),                   # paw pad
        (GOLD, (0.045, 0.20, 0.285), (0.02, 0.2, 0.022)), (GOLD, (0.09, 0.20, 0.26), (0.018, 0.2, 0.02)),
        (GOLD, (0, 0.2, 0.075), (0.4, 0.2, 0.012)),                     # hem trim
    ])
    ob.data.materials.append(bpy.data.materials["M_Toon_VC"])
    sol = ob.modifiers.new("Solid", "SOLIDIFY"); sol.thickness = 0.012
    bpy.ops.object.modifier_apply(modifier="Solid")
    shiba.weight(ob, ["spine_01", "pelvis"], bones); shiba.bind(ob, arm)
    return ob


def build_shield():
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=26, y_subdivisions=40, size=1)
    ob = bpy.context.active_object; ob.name = ob.data.name = "SM_KiteShield"
    for v in ob.data.vertices:
        u, t = v.co.x, (v.co.y + 0.5)              # kite: full width at the top, point at the bottom
        w = 0.12 * min(1, 0.25 + t * 1.2) * (1 - (1 - t) ** 3 * 0.9 if t < 0.5 else 1)
        v.co = Vector((u * w, -0.03 * (1 - u * u), -0.16 + t * 0.34))   # slight curve, blade axis = Z
    shiba.paint_markings(ob, BLUE, [
        (GOLD, (0, 0, 0.0), (0.05, 0.2, 0.045)), (GOLD, (0.04, 0, 0.065), (0.018, 0.2, 0.02)), (GOLD, (0.085, 0, 0.04), (0.016, 0.2, 0.018)),
    ])
    ca = ob.data.color_attributes["Col"]
    for i, v in enumerate(ob.data.vertices):    # gold rim = outermost columns / top row / tip
        if abs(v.co.x) > 0.001 and abs(abs(v.co.x) - _half_w(v.co.z)) < 0.012 or v.co.z > 0.17 or v.co.z < -0.15:
            ca.data[i].color = (*GOLD, 1)
    ob.data.materials.append(bpy.data.materials["M_Toon_VC"])
    sol = ob.modifiers.new("Solid", "SOLIDIFY"); sol.thickness = 0.018; bpy.ops.object.modifier_apply(modifier="Solid")
    bpy.ops.object.shade_smooth()
    return ob


def _half_w(z):
    t = (z + 0.16) / 0.34
    return 0.12 * min(1, 0.25 + t * 1.2) * (1 - (1 - t) ** 3 * 0.9 if t < 0.5 else 1)


def build_knight_sword():
    sw = gear.build_sword("SM_KnightSword", dict(length=0.36, width=0.075, thick=0.016, curve=0.0, blade=STEEL, edge=STEEL_DK, guard=GOLD, grip=BROWN))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.02, location=(0.045, -0.02, 0)); gem = bpy.context.active_object
    shiba.paint_flat(gem, (0.25, 0.55, 0.95)); _join(sw, [gem]); return sw


def _join(target, extras):
    bpy.ops.object.select_all(action="DESELECT")
    for e in extras: e.select_set(True)
    target.select_set(True); bpy.context.view_layer.objects.active = target; bpy.ops.object.join()


def attach_shield(shield, arm, bone="socket_hand_l"):
    pb = arm.pose.bones[bone]
    bw = arm.matrix_world @ pb.matrix
    pos = bw.translation + Vector((0.09, -0.09, 0.06))
    rot = Vector((0.35, -1, 0)).normalized().to_track_quat("-Y", "Z").to_matrix().to_4x4()   # face forward-out
    shield.matrix_world = Matrix.Translation(pos) @ rot
    shield.parent = arm; shield.parent_type = "BONE"; shield.parent_bone = bone
    tail = bw @ Matrix.Translation((0, pb.length, 0))
    shield.matrix_parent_inverse = tail.inverted() @ shield.matrix_world @ shield.matrix_basis.inverted()


def build():
    """Fresh scene with the rigged Dog Knight. Returns dict of everything (nothing attached/exported yet)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    shiba.make_materials()
    bones = _all_bones(BONES)
    shiba.FACE = FACE
    parts = []
    for name, vols in VOLUMES.items():
        ob = shiba.build_volume(name, vols)
        shiba.decimate(ob, {"SK_Dog_Head": 2600, "SK_Dog_Body": 2400, "SK_Dog_Ears": 600, "SK_Dog_Tail": 500}[name])
        shiba.paint_markings(ob, TAN, MARKINGS[name])
        ob.data.materials.append(bpy.data.materials["M_Toon_VC"]); ob.data.materials.append(bpy.data.materials["M_Shiba_Highlight"])
        if name == "SK_Dog_Head":
            ob = shiba.add_face_detail(ob)
        shiba.weight(ob, PART_BONES[name], bones); parts.append(ob)
    arm = shiba.build_armature(bones)
    for p in parts: shiba.bind(p, arm)
    armour = [gear.build_armour(n, s, arm, bones) for n, s in ARMOUR.items()]
    armour.append(build_helmet(arm, bones)); armour.append(build_cape(arm, bones))
    return dict(arm=arm, parts=parts, armour=armour, sword=build_knight_sword(), shield=build_shield(), bones=bones)


def equip(k):
    gear.attach_to_hand(k["sword"], k["arm"], aim=(-0.3, -1.0, 0.55)); attach_shield(k["shield"], k["arm"])


def export_all(k, out_dir):
    arm, parts, armour, sword, shield = k["arm"], k["parts"], k["armour"], k["sword"], k["shield"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in [arm] + parts + armour + [sword, shield]: o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, "dog_knight.glb"), export_format="GLB", use_selection=True, export_apply=True,
                              export_vertex_color="ACTIVE", export_animations=False, export_yup=True)


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    k = build()
    arm, parts, armour, sword, shield = k["arm"], k["parts"], k["armour"], k["sword"], k["shield"]
    shiba.export_fbx(os.path.join(out_dir, "SK_DogKnight.fbx"), [arm] + parts)
    for a in armour: shiba.export_fbx(os.path.join(out_dir, a.name + ".fbx"), [arm, a])
    shiba.export_fbx(os.path.join(out_dir, "SM_KnightSword.fbx"), [sword]); shiba.export_fbx(os.path.join(out_dir, "SM_KiteShield.fbx"), [shield])
    equip(k); export_all(k, out_dir)
    shoot = shiba.setup_render(out_dir)
    shoot("preview_knight_front.png", (0.75, -2.0, 0.95)); shoot("preview_knight_side.png", (2.1, -0.3, 0.85)); shoot("preview_knight_back.png", (0.6, 2.1, 0.9))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "DogKnight.blend"))
    tris = sum(sum(len(f.vertices) - 2 for f in o.data.polygons) for o in parts + armour + [sword, shield])
    print("OK dog knight", len(parts), "parts", len(armour), "armour", tris, "tris ->", out_dir)


def _all_bones(B):
    bones = dict(B)
    for n, (h, t, p) in B.items():
        if n.endswith("_l"):
            bones[n[:-2] + "_r"] = (shiba.mirror(h), shiba.mirror(t), p[:-2] + "_r" if p.endswith("_l") else p)
    return bones


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    main(os.path.abspath(argv[0] if argv else "out_knight"))
