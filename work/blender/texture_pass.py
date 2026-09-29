"""Texture pass: vertex-colour placeholder -> procedural PBR materials by surface class -> UV -> baked textures.

apply(objects, smooth_zones)      classify faces (fur / steel / gold / cloth / leather / dark / eye / glow)
                                  and assign procedural node materials driven by the vertex colour.
bake(objects, out_dir, size)      smart-UV each object, bake BaseColor / Roughness / Metallic / Normal / Emissive,
                                  then swap to a single baked Principled material per object (GLB/FBX friendly).
"""
import os

import bpy
from mathutils import Vector

CLASSES = {   # representative colours -> class (nearest wins)
    "steel":   [(0.80, 0.82, 0.86), (0.52, 0.55, 0.62), (0.60, 0.64, 0.70), (0.72, 0.74, 0.78), (0.45, 0.47, 0.52)],
    "gold":    [(0.88, 0.68, 0.24), (0.85, 0.65, 0.15)],
    "cloth":   [(0.16, 0.30, 0.54), (0.70, 0.14, 0.18), (0.11, 0.22, 0.46), (0.62, 0.10, 0.14), (0.14, 0.30, 0.34), (0.93, 0.45, 0.50), (0.25, 0.55, 0.95)],
    "leather": [(0.52, 0.32, 0.15), (0.36, 0.21, 0.11), (0.20, 0.11, 0.06), (0.62, 0.42, 0.22), (0.40, 0.25, 0.12)],
    "dark":    [(0.22, 0.20, 0.22), (0.05, 0.04, 0.04)],
    "fur":     [(0.80, 0.55, 0.28), (0.94, 0.92, 0.88), (0.93, 0.50, 0.16), (1.0, 0.95, 0.85), (0.98, 0.55, 0.50), (0.95, 0.92, 0.84)],   # wolf greys deliberately absent: too close to steel
}
METALLIC = {"steel": 0.6, "gold": 0.55}
ROUGH = {"steel": 0.32, "gold": 0.38, "cloth": 0.9, "leather": 0.6, "dark": 0.5, "fur": 0.85, "eye": 0.15,
         "bark": 0.95, "moss": 1.0, "leaf": 0.55, "jelly": 0.12, "waxy": 0.35}


def _nearest_class(rgb, default="fur", tol=0.008):
    """Class of the nearest palette colour; blended (soft-edge) colours fall back to the object's default."""
    best, cls = 9, default
    for c, reps in CLASSES.items():
        for r in reps:
            r = tuple(x ** 2.2 for x in r)          # reps are sRGB, vertex colours linear
            d = sum((r[i] - rgb[i]) ** 2 for i in range(3))
            if d < best:
                best, cls = d, c
    return cls if best < tol else default


# ---------------------------------------------------------------- node helpers
def _new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = "Col"
    coord = nt.nodes.new("ShaderNodeTexCoord")
    return m, nt, bsdf, vc, coord


def _noise(nt, coord, scale, detail=2.0, rough=0.5):
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = scale; n.inputs["Detail"].default_value = detail; n.inputs["Roughness"].default_value = rough
    nt.links.new(coord.outputs["Object"], n.inputs["Vector"])
    return n


def _bump(nt, bsdf, height_out, strength, distance=0.02):
    b = nt.nodes.new("ShaderNodeBump")
    b.inputs["Strength"].default_value = strength; b.inputs["Distance"].default_value = distance
    nt.links.new(height_out, b.inputs["Height"]); nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])


def _mix(nt, fac_out, a_out, b_col, fac_scale=1.0):
    """MixRGB(fac) between a (socket) and b (colour); returns node."""
    mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.blend_type = "MULTIPLY"
    mx.inputs["Factor"].default_value = fac_scale
    nt.links.new(a_out, mx.inputs[6])
    mx.inputs[7].default_value = (*b_col, 1)
    if fac_out is not None:
        nt.links.new(fac_out, mx.inputs["Factor"])
    return mx


def make_material(cls):
    m, nt, bsdf, vc, coord = _new_mat("M_" + cls.capitalize())
    bsdf.inputs["Roughness"].default_value = ROUGH.get(cls, 0.5)
    bsdf.inputs["Metallic"].default_value = METALLIC.get(cls, 0.0)
    if cls == "fur":
        # streaks: stretched noise along Z darkens the base tint; two-octave bump = fluff
        map_ = nt.nodes.new("ShaderNodeMapping"); map_.inputs["Scale"].default_value = (1, 1, 0.18)
        nt.links.new(coord.outputs["Object"], map_.inputs["Vector"])
        n = nt.nodes.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = 45; n.inputs["Detail"].default_value = 4; n.inputs["Roughness"].default_value = 0.7
        nt.links.new(map_.outputs["Vector"], n.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].position = 0.35; ramp.color_ramp.elements[0].color = (0.72, 0.66, 0.60, 1)
        ramp.color_ramp.elements[1].position = 0.65; ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
        nt.links.new(n.outputs["Fac"], ramp.inputs["Fac"])
        mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs["Factor"].default_value = 1
        nt.links.new(vc.outputs["Color"], mul.inputs[6]); nt.links.new(ramp.outputs["Color"], mul.inputs[7])
        nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
        _bump(nt, bsdf, n.outputs["Fac"], 0.35, 0.01)
        bsdf.inputs["Sheen Weight"].default_value = 0.4
    elif cls == "steel":
        # brushed panels: low-frequency voronoi cells vary the tint a little, fine noise breaks up the roughness
        vor = nt.nodes.new("ShaderNodeTexVoronoi"); vor.inputs["Scale"].default_value = 14
        nt.links.new(coord.outputs["Object"], vor.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = (0.82, 0.83, 0.86, 1); ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
        nt.links.new(vor.outputs["Distance"], ramp.inputs["Fac"])
        mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs["Factor"].default_value = 1
        nt.links.new(vc.outputs["Color"], mul.inputs[6]); nt.links.new(ramp.outputs["Color"], mul.inputs[7])
        nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
        n = _noise(nt, coord, 35, 3, 0.6)
        rough = nt.nodes.new("ShaderNodeMapRange"); rough.inputs["From Min"].default_value = 0.3; rough.inputs["From Max"].default_value = 0.7
        rough.inputs["To Min"].default_value = 0.25; rough.inputs["To Max"].default_value = 0.5
        nt.links.new(n.outputs["Fac"], rough.inputs["Value"]); nt.links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
        _bump(nt, bsdf, n.outputs["Fac"], 0.15, 0.006)
    elif cls == "gold":
        n = _noise(nt, coord, 40, 2, 0.5)
        nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
        _bump(nt, bsdf, n.outputs["Fac"], 0.12, 0.005)
    elif cls == "cloth":
        w1 = nt.nodes.new("ShaderNodeTexWave"); w1.inputs["Scale"].default_value = 320; w1.bands_direction = "X"
        w2 = nt.nodes.new("ShaderNodeTexWave"); w2.inputs["Scale"].default_value = 320; w2.bands_direction = "Z"
        nt.links.new(coord.outputs["Object"], w1.inputs["Vector"]); nt.links.new(coord.outputs["Object"], w2.inputs["Vector"])
        add = nt.nodes.new("ShaderNodeMath"); add.operation = "ADD"; nt.links.new(w1.outputs["Fac"], add.inputs[0]); nt.links.new(w2.outputs["Fac"], add.inputs[1])
        nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
        _bump(nt, bsdf, add.outputs[0], 0.12, 0.002)
        bsdf.inputs["Sheen Weight"].default_value = 0.15
    elif cls == "bark":
        # vertical ridges (stretched wave) plus knotty noise, deep bump — the wood of a living stump
        map_ = nt.nodes.new("ShaderNodeMapping"); map_.inputs["Scale"].default_value = (7, 7, 0.55)
        nt.links.new(coord.outputs["Object"], map_.inputs["Vector"])
        w = nt.nodes.new("ShaderNodeTexWave"); w.inputs["Scale"].default_value = 3.2; w.inputs["Distortion"].default_value = 9
        w.inputs["Detail"].default_value = 3; w.bands_direction = "Z"
        nt.links.new(map_.outputs["Vector"], w.inputs["Vector"])
        n = _noise(nt, coord, 24, 4, 0.75)
        add = nt.nodes.new("ShaderNodeMath"); add.operation = "MULTIPLY_ADD"; add.inputs[1].default_value = 0.6; add.inputs[2].default_value = 0.0
        nt.links.new(w.outputs["Fac"], add.inputs[0])
        mix = nt.nodes.new("ShaderNodeMath"); mix.operation = "ADD"
        nt.links.new(add.outputs[0], mix.inputs[0]); nt.links.new(n.outputs["Fac"], mix.inputs[1])
        ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].position = 0.25; ramp.color_ramp.elements[0].color = (0.55, 0.48, 0.42, 1)
        ramp.color_ramp.elements[1].position = 0.9; ramp.color_ramp.elements[1].color = (1.05, 1.02, 0.98, 1)
        nt.links.new(mix.outputs[0], ramp.inputs["Fac"])
        mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs["Factor"].default_value = 1
        nt.links.new(vc.outputs["Color"], mul.inputs[6]); nt.links.new(ramp.outputs["Color"], mul.inputs[7])
        nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
        _bump(nt, bsdf, mix.outputs[0], 1.1, 0.02)
    elif cls == "moss":
        n = _noise(nt, coord, 90, 5, 0.85)
        nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
        _bump(nt, bsdf, n.outputs["Fac"], 0.5, 0.008)
        bsdf.inputs["Sheen Weight"].default_value = 0.5
    elif cls == "leaf":
        # veins: fine stretched waves, waxy top coat
        map_ = nt.nodes.new("ShaderNodeMapping"); map_.inputs["Scale"].default_value = (1, 12, 1)
        nt.links.new(coord.outputs["Object"], map_.inputs["Vector"])
        w = nt.nodes.new("ShaderNodeTexWave"); w.inputs["Scale"].default_value = 26; w.inputs["Distortion"].default_value = 3; w.bands_direction = "X"
        nt.links.new(map_.outputs["Vector"], w.inputs["Vector"])
        nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
        _bump(nt, bsdf, w.outputs["Fac"], 0.25, 0.004)
        bsdf.inputs["Coat Weight"].default_value = 0.35
    elif cls == "jelly":
        # slime: glossy skin, lighter core showing through, faint internal swirls
        n = _noise(nt, coord, 8, 3, 0.5)
        ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].position = 0.3; ramp.color_ramp.elements[0].color = (0.85, 1.0, 0.92, 1)
        ramp.color_ramp.elements[1].position = 0.75; ramp.color_ramp.elements[1].color = (1.15, 1.2, 1.1, 1)
        nt.links.new(n.outputs["Fac"], ramp.inputs["Fac"])
        mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs["Factor"].default_value = 1
        nt.links.new(vc.outputs["Color"], mul.inputs[6]); nt.links.new(ramp.outputs["Color"], mul.inputs[7])
        nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
        bsdf.inputs["Coat Weight"].default_value = 1.0
        bsdf.inputs["Coat Roughness"].default_value = 0.05
        bsdf.inputs["Specular IOR Level"].default_value = 0.8
    elif cls == "waxy":
        n = _noise(nt, coord, 30, 2, 0.4)
        nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
        _bump(nt, bsdf, n.outputs["Fac"], 0.12, 0.004)
        bsdf.inputs["Coat Weight"].default_value = 0.6
    elif cls == "leather":
        n = _noise(nt, coord, 60, 3, 0.65)
        nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
        _bump(nt, bsdf, n.outputs["Fac"], 0.35, 0.006)
    else:  # dark / eye: plain, glossy
        nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
        if cls == "eye":
            bsdf.inputs["Coat Weight"].default_value = 1.0
    return m


def make_glow():
    m = bpy.data.materials.new("M_Glow"); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); em = nt.nodes.new("ShaderNodeEmission"); em.inputs["Strength"].default_value = 1.0
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"]); return m


# ---------------------------------------------------------------- apply
def apply(objects, smooth_zones=(), defaults=None, force=None):
    """Reassign material slots per face by class. smooth_zones: [(centre, scale)] spheres (eyes) -> 'eye' class.
    defaults: {object name: class} used for blended colours (soft marking edges).
    force: {object name: class} — every non-eye/glow face gets that class regardless of colour (grey fur vs steel)."""
    mats = {c: make_material(c) for c in list(CLASSES) + ["eye", "bark", "moss", "leaf", "jelly", "waxy"]}
    mats["glow"] = make_glow()
    order = list(mats)
    for ob in objects:
        me = ob.data
        ca = me.color_attributes.get("Col")
        glow_faces = {p.index for p in me.polygons if p.material_index == 1 and len(me.materials) > 1 and me.materials[1] and me.materials[1].name == "M_Shiba_Highlight"}
        me.materials.clear()
        for c in order:
            me.materials.append(mats[c])
        for p in me.polygons:
            if p.index in glow_faces:
                p.material_index = order.index("glow"); continue
            c = p.center
            if any((c - Vector(z[0])).length < max(z[1]) * 1.4 for z in smooth_zones):
                p.material_index = order.index("eye"); continue
            rgb = [0, 0, 0]
            for vi in p.vertices:
                col = ca.data[vi].color if ca else (1, 1, 1, 1)
                for i in range(3): rgb[i] += col[i] / len(p.vertices)
            f = (force or {}).get(ob.name)
            p.material_index = order.index(f) if f else order.index(_nearest_class(rgb, (defaults or {}).get(ob.name, "fur")))
        ob.data.update()
    return mats


# ---------------------------------------------------------------- bake
PASSES = [  # (suffix, bake type, pass filter, colorspace, principled input)
    ("BaseColor", "DIFFUSE", {"COLOR"}, "sRGB", "Base Color"),
    ("Roughness", "ROUGHNESS", set(), "Non-Color", "Roughness"),
    ("Normal", "NORMAL", set(), "Non-Color", None),
    ("Emissive", "EMIT", set(), "sRGB", "Emission Color"),
]


def _bake_image(ob, name, size, btype, pfilter, colorspace):
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.colorspace_settings.name = colorspace
    for slot in ob.material_slots:
        nt = slot.material.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; tex.name = "BAKE"; nt.nodes.active = tex
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type=btype, pass_filter=pfilter, margin=6, use_clear=True)
    for slot in ob.material_slots:
        nt = slot.material.node_tree
        nt.nodes.remove(nt.nodes["BAKE"])
    return img


def _bake_metallic(ob, size):
    """Bake the per-class metallic constant through a temporary emission shader."""
    img = bpy.data.images.new(ob.name + "_Metallic", size, size, alpha=False); img.colorspace_settings.name = "Non-Color"
    restore = []
    for slot in ob.material_slots:
        nt = slot.material.node_tree
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        link = out.inputs["Surface"].links[0]; restore.append((nt, out, link.from_socket))
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        mval = bsdf.inputs["Metallic"].default_value if bsdf else 0.0
        em = nt.nodes.new("ShaderNodeEmission"); em.name = "TMPEM"; em.inputs["Color"].default_value = (mval, mval, mval, 1)
        nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; tex.name = "BAKE"; nt.nodes.active = tex
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type="EMIT", margin=6, use_clear=True)
    for nt, out, sock in restore:
        nt.links.new(sock, out.inputs["Surface"]); nt.nodes.remove(nt.nodes["TMPEM"]); nt.nodes.remove(nt.nodes["BAKE"])
    return img


def bake(objects, out_dir, size=1024, small=None):
    """UV-unwrap + bake every object, then replace its materials with one baked Principled material."""
    tex_dir = os.path.join(out_dir, "textures"); os.makedirs(tex_dir, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"; scene.cycles.device = "CPU"; scene.cycles.samples = 4
    scene.render.bake.use_selected_to_active = False
    for ob in objects:
        sz = small.get(ob.name, size) if small else size
        bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.01); bpy.ops.object.mode_set(mode="OBJECT")
        imgs = {}
        for suffix, btype, pf, cs, _ in PASSES:
            imgs[suffix] = _bake_image(ob, f"{ob.name}_{suffix}", sz, btype, pf, cs)
        imgs["Metallic"] = _bake_metallic(ob, sz)
        for suffix, img in imgs.items():
            img.filepath_raw = os.path.join(tex_dir, f"T_{ob.name}_{suffix}.png"); img.file_format = "PNG"; img.save()
        # baked material
        m = bpy.data.materials.new("M_" + ob.name + "_Baked"); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial"); bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        for suffix, _, _, _, inp in PASSES:
            t = nt.nodes.new("ShaderNodeTexImage"); t.image = imgs[suffix]
            if inp:
                nt.links.new(t.outputs["Color"], bsdf.inputs[inp])
            else:
                nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(t.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = imgs["Metallic"]; nt.links.new(t.outputs["Color"], bsdf.inputs["Metallic"])
        bsdf.inputs["Emission Strength"].default_value = 1.0
        ob.data.materials.clear(); ob.data.materials.append(m)
        for p in ob.data.polygons: p.material_index = 0
        print("baked", ob.name, sz)
