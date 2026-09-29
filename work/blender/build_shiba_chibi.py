"""Build the M1 anime-chibi Shiba placeholder: metaball body -> modular meshes + SK_BK_Chibi armature.

Run headless:
    .venv/bin/python build_shiba_chibi.py [out_dir]
or inside Blender:
    blender -b -P build_shiba_chibi.py -- [out_dir]

Outputs (out_dir, default ./out):
    SK_Shiba.blend                        editable source
    SK_Shiba.fbx                          armature + 4 part meshes (vertex colours = fur markings)
    preview_front.png / preview_side.png  Cycles toon + freestyle render

Conventions (spec §7.1): metres (FBX exporter -> cm), forward = -Y, 2 heads tall (~0.95 m),
sockets are bones prefixed `socket_`. Markings are vertex colours so UE's M_Toon reads them.
"""
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

# ---------------------------------------------------------------- palette
ORANGE = (0.93, 0.50, 0.16)
CREAM = (1.00, 0.95, 0.85)
BLUSH = (0.98, 0.55, 0.50)
BLACK = (0.05, 0.04, 0.04)
WHITE = (1.0, 1.0, 1.0)
IRIS = (0.16, 0.09, 0.05)

TRI_BUDGET = {"SK_Shiba_Head": 2600, "SK_Shiba_Body": 2400, "SK_Shiba_Ears": 500, "SK_Shiba_Tail": 500}
META_RES = 0.012
META_K = 0.57  # measured: surface half-extent = radius * size * META_K (stiffness 2, threshold 0.6)

# ---------------------------------------------------------------- skeleton (left only; *_r mirrored)
BONES = {
    "root":       ((0, 0, 0),          (0, 0, 0.05),        None),
    "pelvis":     ((0, 0, 0.18),       (0, 0, 0.28),        "root"),
    "spine_01":   ((0, 0, 0.28),       (0, 0, 0.40),        "pelvis"),
    "neck_01":    ((0, 0, 0.40),       (0, 0, 0.45),        "spine_01"),
    "head":       ((0, 0, 0.45),       (0, 0, 0.80),        "neck_01"),
    "tail_01":    ((0, 0.08, 0.32),    (0, 0.16, 0.44),     "pelvis"),
    "upperarm_l": ((0.13, 0, 0.39),    (0.165, -0.015, 0.32), "spine_01"),
    "lowerarm_l": ((0.165, -0.015, 0.32), (0.20, -0.03, 0.26), "upperarm_l"),
    "hand_l":     ((0.20, -0.03, 0.26), (0.20, -0.03, 0.19), "lowerarm_l"),
    "thigh_l":    ((0.07, 0, 0.18),    (0.07, 0, 0.10),     "pelvis"),
    "calf_l":     ((0.07, 0, 0.10),    (0.07, 0, 0.05),     "thigh_l"),
    "foot_l":     ((0.07, 0, 0.05),    (0.07, -0.07, 0.02), "calf_l"),
    "ear_l":      ((0.11, 0, 0.77),    (0.17, 0, 0.88),     "head"),
    "socket_head":   ((0, 0, 0.81),        (0, 0, 0.87),         "head"),
    "socket_hand_l": ((0.20, -0.03, 0.22), (0.20, -0.09, 0.22),  "hand_l"),
    "socket_back":   ((0, 0.12, 0.36),     (0, 0.18, 0.36),      "spine_01"),
    "socket_waist":  ((0, 0, 0.24),        (0, -0.06, 0.24),     "pelvis"),
}

# ---------------------------------------------------------------- volumes (metaball elements)
# ("ell", centre, half_extents, rot_euler_deg) | ("cap", p0, p1, radius)   off-centre x => mirrored
VOLUMES = {
    "SK_Shiba_Head": [
        ("ell", (0, 0, 0.60), (0.24, 0.22, 0.21), (0, 0, 0)),
        ("ell", (0, -0.19, 0.545), (0.10, 0.075, 0.065), (0, 0, 0)),      # muzzle
        ("ell", (0.15, -0.12, 0.555), (0.07, 0.065, 0.055), (0, 0, 0)),   # cheek fluff
    ],
    "SK_Shiba_Body": [
        ("ell", (0, 0, 0.31), (0.13, 0.11, 0.135), (0, 0, 0)),
        ("cap", (0.13, 0, 0.39), (0.20, -0.03, 0.245), 0.045),           # arm
        ("ell", (0.20, -0.03, 0.225), (0.056, 0.056, 0.052), (0, 0, 0)),  # hand
        ("cap", (0.075, 0, 0.18), (0.075, 0, 0.065), 0.048),                 # leg
        ("ell", (0.075, -0.035, 0.042), (0.06, 0.085, 0.04), (0, 0, 0)),  # foot
    ],
    "SK_Shiba_Ears": [
        ("ell", (0.135, 0.01, 0.80), (0.065, 0.034, 0.055), (0, 30, 0)),   # ear base
        ("ell", (0.165, 0.01, 0.86), (0.028, 0.022, 0.045), (0, 30, 0)),   # ear tip -> teardrop
    ],
    "SK_Shiba_Tail": [
        ("ell", (0, 0.10, 0.34), (0.05, 0.05, 0.05), (0, 0, 0)),
        ("ell", (0, 0.16, 0.40), (0.045, 0.045, 0.045), (0, 0, 0)),
        ("ell", (0, 0.16, 0.47), (0.04, 0.04, 0.04), (0, 0, 0)),
        ("ell", (0, 0.10, 0.50), (0.035, 0.035, 0.035), (0, 0, 0)),
    ],
}

# fur markings painted as vertex colour: (colour, centre, half_extents); later entries win; mirrored if x != 0
MARKINGS = {
    "SK_Shiba_Head": [
        (CREAM, (0, -0.21, 0.545), (0.16, 0.11, 0.10)),        # muzzle + cheeks
        (CREAM, (0.16, -0.12, 0.55), (0.09, 0.08, 0.07)),      # cheek fluff
        (CREAM, (0.085, -0.19, 0.705), (0.035, 0.05, 0.022)),  # eyebrow dots
        (BLUSH, (0.155, -0.16, 0.59), (0.05, 0.04, 0.03)),   # blush
    ],
    "SK_Shiba_Body": [
        (CREAM, (0, -0.11, 0.28), (0.10, 0.06, 0.13)),         # chest / belly
        (CREAM, (0.20, -0.03, 0.225), (0.075, 0.075, 0.065)),     # paws
        (CREAM, (0.07, -0.04, 0.045), (0.08, 0.10, 0.055)),    # feet
    ],
    "SK_Shiba_Ears": [
        (CREAM, (0.145, -0.012, 0.815), (0.035, 0.02, 0.05)),    # inner ear
    ],
    "SK_Shiba_Tail": [
        (CREAM, (0, 0.13, 0.36), (0.06, 0.06, 0.04)),          # underside
    ],
}

# face details: small meshes joined into the head part. (colour, centre, scale, material_slot)
FACE = [
    (WHITE, (0.095, -0.195, 0.635), (0.046, 0.014, 0.062), 0),   # sclera
    (IRIS, (0.097, -0.203, 0.630), (0.036, 0.012, 0.052), 0),    # iris
    (WHITE, (0.085, -0.214, 0.652), (0.013, 0.006, 0.016), 1),   # highlight (emissive)
    (BLACK, (0, -0.272, 0.565), (0.030, 0.020, 0.022), 0),       # nose
    (BLACK, (0.022, -0.262, 0.522), (0.022, 0.006, 0.007), 0),    # mouth (two dashes => "w")
]

# which deform bones each part may weight to
PART_BONES = {
    "SK_Shiba_Head": ["head"],
    "SK_Shiba_Body": ["pelvis", "spine_01", "upperarm_l", "lowerarm_l", "hand_l", "thigh_l", "calf_l", "foot_l",
                      "upperarm_r", "lowerarm_r", "hand_r", "thigh_r", "calf_r", "foot_r"],
    "SK_Shiba_Ears": ["ear_l", "ear_r"],
    "SK_Shiba_Tail": ["tail_01"],
}


# ---------------------------------------------------------------- helpers
def mirror(v):
    return (-v[0], v[1], v[2])


def all_bones():
    bones = dict(BONES)
    for n, (h, t, p) in BONES.items():
        if n.endswith("_l"):
            bones[n[:-2] + "_r"] = (mirror(h), mirror(t), p[:-2] + "_r" if p.endswith("_l") else p)
    return bones


def with_mirror(items, idx=1, rot_idx=None):
    out = []
    for it in items:
        out.append(it)
        if it[idx][0] != 0:
            m = list(it)
            m[idx] = mirror(it[idx])
            if it[0] == "cap":
                m[idx + 1] = mirror(it[idx + 1])
            if rot_idx is not None and it[0] == "ell":
                r = it[rot_idx]
                m[rot_idx] = (r[0], -r[1], -r[2])
            out.append(tuple(m))
    return out


def build_volume(name, vols):
    mb = bpy.data.metaballs.new(name + "_mb")
    mb.resolution = META_RES
    mb.threshold = 0.6
    ob = bpy.data.objects.new(name + "_mb", mb)
    bpy.context.collection.objects.link(ob)
    for v in with_mirror(vols, 1, 3):
        if v[0] == "ell":
            _, c, he, rot = v
            e = mb.elements.new()
            e.type = "ELLIPSOID"
            mx = max(he)
            e.radius = mx / META_K
            e.size_x, e.size_y, e.size_z = (h / mx for h in he)
            e.co = c
            e.rotation = Euler([math.radians(a) for a in rot]).to_quaternion()
        else:
            _, p0, p1, r = v
            p0, p1 = Vector(p0), Vector(p1)
            e = mb.elements.new()
            e.type = "CAPSULE"
            e.radius = r / META_K
            e.size_x = (p1 - p0).length / 2  # absolute half-length
            e.co = (p0 + p1) / 2
            e.rotation = Vector((1, 0, 0)).rotation_difference(p1 - p0)
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target="MESH")
    mesh_ob = bpy.context.active_object
    mesh_ob.name = name
    mesh_ob.data.name = name
    return mesh_ob


def decimate(ob, target_tris):
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris > target_tris:
        mod = ob.modifiers.new("Dec", "DECIMATE")
        mod.ratio = target_tris / tris
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier="Dec")
    bpy.ops.object.shade_smooth()


def add_face_detail(head):
    objs = []
    for col, c, sc, slot in with_mirror(FACE, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, location=c)
        o = bpy.context.active_object
        o.scale = sc
        bpy.ops.object.transform_apply(scale=True)
        bpy.ops.object.shade_smooth()
        o.data.materials.append(bpy.data.materials["M_Toon_VC"])
        o.data.materials.append(bpy.data.materials["M_Shiba_Highlight"])
        for p in o.data.polygons:
            p.material_index = slot
        paint_flat(o, col)
        objs.append(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs + [head]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = head
    bpy.ops.object.join()
    return bpy.context.active_object


def lin(rgb):
    """Palette values are authored as sRGB (what you see); vertex colours are stored linear, so convert or everything
    renders pale/pastel."""
    return tuple(c ** 2.2 for c in rgb[:3])


def paint_flat(ob, rgb):
    ca = ob.data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    for i in range(len(ob.data.vertices)):
        ca.data[i].color = (*lin(rgb), 1)


def paint_markings(ob, base, zones):
    ca = ob.data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    zones = [(lin(z[0]), z[1], z[2]) for z in with_mirror(zones, 1)]
    base = lin(base)
    for i, v in enumerate(ob.data.vertices):
        col = base
        for rgb, c, he in zones:
            d = math.sqrt(sum(((v.co[k] - c[k]) / he[k]) ** 2 for k in range(3)))
            t = max(0.0, min(1.0, (1.15 - d) / 0.3))  # soft edge between d=1.15 and 0.85
            col = tuple(col[k] * (1 - t) + rgb[k] * t for k in range(3))
        ca.data[i].color = (*col, 1)


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def weight(ob, bone_names, bones):
    """Smooth 2-nearest-bone weights (inverse-cube distance). Good enough for a placeholder."""
    groups = {n: ob.vertex_groups.new(name=n) for n in bone_names}
    segs = {n: (Vector(bones[n][0]), Vector(bones[n][1])) for n in bone_names}
    for v in ob.data.vertices:
        d = sorted((seg_dist(v.co, *segs[n]) + 0.01, n) for n in bone_names)[:2]
        if len(d) == 2 and d[1][0] > d[0][0] * 2.5:
            d = d[:1]
        w = [1 / x[0] ** 3 for x in d]
        s = sum(w)
        for (dist, n), wi in zip(d, w):
            groups[n].add([v.index], wi / s, "REPLACE")


def build_armature(bones):
    arm_data = bpy.data.armatures.new("SK_BK_Chibi")
    arm = bpy.data.objects.new("SK_BK_Chibi", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    created = {}
    for n, (h, t, p) in bones.items():
        b = eb.new(n)
        b.head, b.tail = Vector(h), Vector(t)
        b.use_deform = not n.startswith("socket_")
        created[n] = b
    for n, (h, t, p) in bones.items():
        if p:
            created[n].parent = created[p]
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def make_materials():
    m = bpy.data.materials.new("M_Toon_VC")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    toon = nt.nodes.new("ShaderNodeBsdfToon")
    toon.inputs["Size"].default_value = 0.55
    toon.inputs["Smooth"].default_value = 0.08
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    nt.links.new(vc.outputs["Color"], toon.inputs["Color"])
    nt.links.new(toon.outputs["BSDF"], out.inputs["Surface"])
    m.diffuse_color = (*ORANGE, 1)

    h = bpy.data.materials.new("M_Shiba_Highlight")
    h.use_nodes = True
    nt = h.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = 1.0
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    h.diffuse_color = (1, 1, 1, 1)


def setup_render(out_dir):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 40
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.view_settings.view_transform = "Standard"
    scene.render.use_freestyle = True
    scene.render.line_thickness = 1.6
    vl = bpy.context.view_layer
    vl.use_freestyle = True
    for old in list(vl.freestyle_settings.linesets):
        vl.freestyle_settings.linesets.remove(old)
    ls = vl.freestyle_settings.linesets.new("Outline")
    ls.linestyle = bpy.data.linestyles.new("Outline")
    ls.select_crease = False
    ls.select_border = False
    ls.linestyle.color = (0.25, 0.12, 0.05)

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.90, 0.94, 0.98, 1)
    bg.inputs["Strength"].default_value = 0.35
    scene.world = world

    def sun(name, rot, strength):
        d = bpy.data.lights.new(name, "SUN")
        d.energy = strength
        d.angle = 0.0
        o = bpy.data.objects.new(name, d)
        o.rotation_euler = [math.radians(a) for a in rot]
        bpy.context.collection.objects.link(o)

    sun("Key", (45, -20, -35), 2.2)
    bpy.ops.mesh.primitive_plane_add(size=16)
    backdrop = bpy.context.active_object
    backdrop.name = "Backdrop"
    bm = bpy.data.materials.new("M_Backdrop")
    bm.use_nodes = True
    nt = bm.node_tree
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (0.90, 0.94, 0.98, 1)
    nt.links.new(em.outputs["Emission"], o.inputs["Surface"])
    backdrop.data.materials.append(bm)
    backdrop.visible_shadow = False
    sun("Fill", (60, 30, 140), 0.6)

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 55
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    target = Vector((0, 0, 0.50))

    def shoot(name, pos):
        cam.location = Vector(pos)
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        away = (target - cam.location).normalized()
        backdrop.location = target + away * 5
        backdrop.rotation_euler = (-away).to_track_quat("Z", "Y").to_euler()
        scene.render.filepath = os.path.join(out_dir, name)
        bpy.ops.render.render(write_still=True)

    return shoot


def render_previews(out_dir, prefix="preview"):
    shoot = setup_render(out_dir)
    shoot(f"{prefix}_front.png", (0.75, -2.0, 0.95))
    shoot(f"{prefix}_side.png", (2.1, -0.3, 0.85))


def export_fbx(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.fbx(
        filepath=path,
        use_selection=True,
        object_types={"ARMATURE", "MESH"},
        use_mesh_modifiers=True,
        mesh_smooth_type="FACE",
        colors_type="SRGB",
        add_leaf_bones=False,
        bake_anim=False,
        armature_nodetype="NULL",
        path_mode="COPY",
    )


def export(out_dir):
    objs = [o for o in bpy.data.objects if o.type in ("ARMATURE", "MESH") and o.name != "Backdrop"]
    export_fbx(os.path.join(out_dir, "SK_Shiba.fbx"), objs)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "SK_Shiba.blend"))


def build_character():
    """Fresh scene with the rigged Shiba. Returns (parts, armature, bones)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    make_materials()
    bones = all_bones()
    parts = []
    for name, vols in VOLUMES.items():
        ob = build_volume(name, vols)
        decimate(ob, TRI_BUDGET[name])
        paint_markings(ob, ORANGE, MARKINGS[name])
        ob.data.materials.append(bpy.data.materials["M_Toon_VC"])
        ob.data.materials.append(bpy.data.materials["M_Shiba_Highlight"])
        if name == "SK_Shiba_Head":
            ob = add_face_detail(ob)
        weight(ob, PART_BONES[name], bones)
        parts.append(ob)
    arm = build_armature(bones)
    for p in parts:
        bind(p, arm)
    return parts, arm, bones


def bind(ob, arm):
    ob.parent = arm
    ob.modifiers.new("Armature", "ARMATURE").object = arm


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    parts, arm, bones = build_character()
    render_previews(out_dir)
    export(out_dir)
    # self-check
    names = {b.name for b in arm.data.bones}
    assert {"socket_head", "socket_hand_r", "socket_hand_l", "socket_back", "socket_waist"} <= names
    total = 0
    for p in parts:
        assert all(vg.name in names for vg in p.vertex_groups), p.name
        assert "Col" in p.data.color_attributes, p.name
        total += sum(len(f.vertices) - 2 for f in p.data.polygons)
    assert total <= 8000, total
    print("OK", [p.name for p in parts], len(names), "bones", total, "tris ->", out_dir)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    main(os.path.abspath(argv[0] if argv else "out"))
