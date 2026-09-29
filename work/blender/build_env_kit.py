"""Environment kit in the same stylised language as the characters (metaball blobs, vertex colours, gold/steel palette)
+ tileable ground textures + a diorama "look target" render with the Dog Knight in it.

    .venv/bin/python build_env_kit.py [out_dir]          (default out_env)

Outputs: SM_Tree_Round / SM_Tree_Pine / SM_Bush / SM_Rock_A / SM_Rock_B / SM_Fence / SM_Flower / SM_House / SM_Lamp  (.fbx + .glb, vertex colours)
         textures/T_Ground_Grass / T_Ground_Dirt / T_Ground_Cobble  (1024, tileable, BaseColor + Normal)
         diorama_*.png (Cycles look target), Diorama.blend
"""
import math
import os
import random
import sys

import bpy
from mathutils import Euler, Vector

import build_dog_knight as knight
import build_shiba_chibi as shiba
import texture_pass as tp

random.seed(3)
GREEN_L, GREEN_D = (0.55, 0.78, 0.32), (0.22, 0.48, 0.20)
PINE_L, PINE_D = (0.30, 0.60, 0.36), (0.12, 0.36, 0.22)
TRUNK = (0.45, 0.30, 0.16)
ROCK, MOSS = (0.60, 0.62, 0.66), (0.40, 0.62, 0.30)
WALL, WALL_DK = (0.93, 0.87, 0.74), (0.55, 0.36, 0.20)
ROOF = (0.72, 0.22, 0.18)
PETAL = [(0.98, 0.55, 0.60), (0.98, 0.85, 0.35), (0.85, 0.75, 0.98)]


# ---------------------------------------------------------------- helpers
def blob(name, vols, base, marks=(), tris=900):
    ob = shiba.build_volume(name, vols); shiba.decimate(ob, tris); shiba.paint_markings(ob, base, list(marks)); return ob


def gradient_z(ob, lo_col, hi_col, z0, z1):
    """Vertex colour by height (dark bottom -> light top) — reads as painted foliage under toon shading."""
    ca = ob.data.color_attributes.get("Col") or ob.data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    lo_col, hi_col = shiba.lin(lo_col), shiba.lin(hi_col)
    for i, v in enumerate(ob.data.vertices):
        t = max(0, min(1, (v.co.z - z0) / (z1 - z0)))
        ca.data[i].color = (*[lo_col[k] * (1 - t) + hi_col[k] * t for k in range(3)], 1)


def join(target, extras):
    bpy.ops.object.select_all(action="DESELECT")
    for e in extras: e.select_set(True)
    target.select_set(True); bpy.context.view_layer.objects.active = target; bpy.ops.object.join(); return target


def prim(kind, col, **kw):
    getattr(bpy.ops.mesh, "primitive_" + kind + "_add")(**kw); o = bpy.context.active_object; shiba.paint_flat(o, col); return o


def finish(ob, name):
    ob.name = ob.data.name = name
    ob.data.materials.clear(); ob.data.materials.append(bpy.data.materials["M_Toon_VC"])
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.shade_smooth(); return ob


# ---------------------------------------------------------------- props
def tree_round():
    trunk = prim("cone", TRUNK, vertices=9, radius1=0.22, radius2=0.14, depth=1.3, location=(0, 0, 0.65))
    canopy = blob("canopy", [("ell", (0, 0, 1.9), (0.9, 0.9, 0.7), (0, 0, 0)), ("ell", (0.45, 0.3, 2.3), (0.55, 0.55, 0.45), (0, 0, 0)),
                             ("ell", (-0.5, -0.2, 2.2), (0.5, 0.5, 0.45), (0, 0, 0)), ("ell", (0, -0.1, 2.7), (0.5, 0.5, 0.4), (0, 0, 0))], GREEN_L, tris=700)
    gradient_z(canopy, GREEN_D, GREEN_L, 1.2, 3.1)
    return finish(join(canopy, [trunk]), "SM_Tree_Round")


def tree_pine():
    trunk = prim("cone", TRUNK, vertices=8, radius1=0.18, radius2=0.1, depth=1.0, location=(0, 0, 0.5))
    tiers = []
    for i, (r, z) in enumerate(((0.95, 1.3), (0.75, 2.0), (0.5, 2.6), (0.28, 3.1))):
        t = prim("cone", PINE_L, vertices=10, radius1=r, radius2=0.02, depth=0.9, location=(0, 0, z)); tiers.append(t)
    ob = join(tiers[0], tiers[1:] + [trunk]); gradient_z(ob, PINE_D, PINE_L, 0.8, 3.6)
    return finish(ob, "SM_Tree_Pine")


def bush():
    ob = blob("bush", [("ell", (0, 0, 0.35), (0.55, 0.5, 0.35), (0, 0, 0)), ("ell", (0.3, 0.2, 0.5), (0.35, 0.35, 0.3), (0, 0, 0)),
                       ("ell", (-0.3, -0.1, 0.45), (0.3, 0.3, 0.28), (0, 0, 0))], GREEN_L, tris=500)
    gradient_z(ob, GREEN_D, GREEN_L, 0.0, 0.8); return finish(ob, "SM_Bush")


def rock(name, seed, size):
    random.seed(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=size); ob = bpy.context.active_object
    for v in ob.data.vertices:
        v.co *= 1 + 0.25 * (random.random() - 0.5); v.co.z *= 0.7
    ca = ob.data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    for i, v in enumerate(ob.data.vertices):
        t = max(0, v.normal.z) ** 2 * 0.8                             # moss on the top faces
        ca.data[i].color = (*[shiba.lin(ROCK)[k] * (1 - t) + shiba.lin(MOSS)[k] * t for k in range(3)], 1)
    bpy.ops.object.shade_flat(); ob.name = ob.data.name = name; ob.data.materials.append(bpy.data.materials["M_Toon_VC"]); return ob


def fence():
    posts = [prim("cube", WALL_DK, size=1, location=(x, 0, 0.45)) for x in (-0.9, 0, 0.9)]
    for p in posts: p.scale = (0.12, 0.12, 0.9)
    rails = [prim("cube", TRUNK, size=1, location=(0, 0, z)) for z in (0.3, 0.65)]
    for r in rails: r.scale = (2.0, 0.07, 0.1)
    for o in posts + rails: bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.ops.object.transform_apply(scale=True)
    ob = join(posts[0], posts[1:] + rails); bpy.ops.object.shade_flat(); return finish(ob, "SM_Fence")


def flower():
    stem = prim("cylinder", GREEN_D, vertices=6, radius=0.015, depth=0.3, location=(0, 0, 0.15))
    petals = []
    for i in range(5):
        a = i / 5 * 2 * math.pi
        petals.append(prim("uv_sphere", PETAL[0], segments=8, ring_count=5, radius=0.05, location=(math.cos(a) * 0.06, math.sin(a) * 0.06, 0.32)))
        petals[-1].scale = (1, 1, 0.5); bpy.ops.object.transform_apply(scale=True)
    centre = prim("uv_sphere", PETAL[1], segments=8, ring_count=5, radius=0.035, location=(0, 0, 0.34))
    return finish(join(stem, petals + [centre]), "SM_Flower")


def house():
    walls = prim("cube", WALL, size=1, location=(0, 0, 1.2)); walls.scale = (3.2, 2.8, 2.4); bpy.ops.object.transform_apply(scale=True)
    beams = []
    for x in (-1.6, 0, 1.6):
        b = prim("cube", WALL_DK, size=1, location=(x, -1.42, 1.2)); b.scale = (0.14, 0.06, 2.4); bpy.ops.object.transform_apply(scale=True); beams.append(b)
    for z in (0.2, 2.35):
        b = prim("cube", WALL_DK, size=1, location=(0, -1.42, z)); b.scale = (3.3, 0.06, 0.14); bpy.ops.object.transform_apply(scale=True); beams.append(b)
    roof = prim("cone", ROOF, vertices=4, radius1=2.9, radius2=0.25, depth=1.6, location=(0, 0, 3.15), rotation=(0, 0, math.pi / 4))
    roof.scale = (1, 0.95, 1); bpy.ops.object.transform_apply(scale=True)
    rows = []
    for z in (2.55, 2.9, 3.25):   # tile rows as thin rings
        r = prim("cone", (0.60, 0.16, 0.14), vertices=4, radius1=2.9 - (z - 2.4) * 1.6, radius2=2.9 - (z - 2.4) * 1.6 - 0.15, depth=0.08, location=(0, 0, z), rotation=(0, 0, math.pi / 4)); rows.append(r)
    door = prim("cube", WALL_DK, size=1, location=(0.6, -1.43, 0.7)); door.scale = (0.8, 0.06, 1.4); bpy.ops.object.transform_apply(scale=True)
    win = prim("cube", (0.55, 0.75, 0.90), size=1, location=(-0.8, -1.43, 1.5)); win.scale = (0.6, 0.06, 0.6); bpy.ops.object.transform_apply(scale=True)
    chim = prim("cube", ROCK, size=1, location=(0.9, 0.6, 3.6)); chim.scale = (0.4, 0.4, 1.0); bpy.ops.object.transform_apply(scale=True)
    ob = join(walls, beams + [roof, door, win, chim] + rows); bpy.ops.object.shade_flat(); return finish(ob, "SM_House")


def lamp():
    post = prim("cylinder", WALL_DK, vertices=8, radius=0.06, depth=2.2, location=(0, 0, 1.1))
    arm = prim("cube", WALL_DK, size=1, location=(0.25, 0, 2.15)); arm.scale = (0.5, 0.08, 0.08); bpy.ops.object.transform_apply(scale=True)
    lantern = prim("cube", knight.GOLD, size=1, location=(0.45, 0, 1.9)); lantern.scale = (0.28, 0.28, 0.4); bpy.ops.object.transform_apply(scale=True)
    glow = prim("uv_sphere", (1.0, 0.9, 0.6), segments=8, ring_count=6, radius=0.1, location=(0.45, 0, 1.9))
    ob = join(post, [arm, lantern, glow])
    ob.data.materials.clear(); ob.data.materials.append(bpy.data.materials["M_Toon_VC"]); ob.data.materials.append(bpy.data.materials["M_Shiba_Highlight"])
    for p in ob.data.polygons:
        if (p.center - Vector((0.45, 0, 1.9))).length < 0.11: p.material_index = 1
    ob.name = ob.data.name = "SM_Lamp"; return ob


def barrel():
    body = prim("cylinder", TRUNK, vertices=12, radius=0.32, depth=0.8, location=(0, 0, 0.4)); body.scale = (1, 1, 1)
    hoops = [prim("torus", (0.35, 0.36, 0.40), major_segments=16, minor_segments=6, major_radius=0.32, minor_radius=0.025, location=(0, 0, z)) for z in (0.18, 0.62)]
    ob = join(body, hoops); bpy.ops.object.shade_flat(); return finish(ob, "SM_Barrel")


def crate():
    box = prim("cube", (0.72, 0.52, 0.28), size=0.7, location=(0, 0, 0.35))
    edges = []
    for x, y in ((-0.33, -0.36), (0.33, -0.36), (-0.33, 0.36), (0.33, 0.36)):
        e = prim("cube", WALL_DK, size=1, location=(x, y, 0.35)); e.scale = (0.06, 0.03, 0.72); bpy.ops.object.transform_apply(scale=True); edges.append(e)
    ob = join(box, edges); bpy.ops.object.shade_flat(); return finish(ob, "SM_Crate")


def anvil():
    base = prim("cube", TRUNK, size=1, location=(0, 0, 0.2)); base.scale = (0.5, 0.5, 0.4); bpy.ops.object.transform_apply(scale=True)
    top = prim("cube", (0.30, 0.31, 0.35), size=1, location=(0, 0, 0.55)); top.scale = (1.1, 0.4, 0.3); bpy.ops.object.transform_apply(scale=True)
    horn = prim("cone", (0.30, 0.31, 0.35), vertices=8, radius1=0.15, radius2=0.03, depth=0.45, location=(0.75, 0, 0.55), rotation=(0, math.pi / 2, 0))
    ob = join(base, [top, horn]); bpy.ops.object.shade_flat(); return finish(ob, "SM_Anvil")


# ---------------------------------------------------------------- tileable ground textures
def ground_texture(name, kind, out_dir, size=1024):
    """Bake a procedural material on a unit plane, then make it seamless by cross-fading the wrapped halves."""
    bpy.ops.mesh.primitive_plane_add(size=2); pl = bpy.context.active_object; pl.name = "GroundBake"
    m = bpy.data.materials.new("M_" + name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    tc = nt.nodes.new("ShaderNodeTexCoord")
    if kind == "grass":
        n1 = nt.nodes.new("ShaderNodeTexNoise"); n1.inputs["Scale"].default_value = 6; n1.inputs["Detail"].default_value = 6; n1.inputs["Roughness"].default_value = 0.7
        n2 = nt.nodes.new("ShaderNodeTexVoronoi"); n2.inputs["Scale"].default_value = 60; n2.feature = "F1"
        nt.links.new(tc.outputs["Object"], n1.inputs["Vector"]); nt.links.new(tc.outputs["Object"], n2.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = (*shiba.lin((0.28, 0.52, 0.18)), 1); ramp.color_ramp.elements[1].color = (*shiba.lin((0.58, 0.78, 0.32)), 1)
        nt.links.new(n1.outputs["Fac"], ramp.inputs["Fac"])
        mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs["Factor"].default_value = 0.35
        nt.links.new(ramp.outputs["Color"], mul.inputs[6]); nt.links.new(n2.outputs["Color"], mul.inputs[7])
        nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
        bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.6; nt.links.new(n2.outputs["Distance"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    elif kind == "dirt":
        n1 = nt.nodes.new("ShaderNodeTexNoise"); n1.inputs["Scale"].default_value = 9; n1.inputs["Detail"].default_value = 7
        nt.links.new(tc.outputs["Object"], n1.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = (*shiba.lin((0.55, 0.42, 0.28)), 1); ramp.color_ramp.elements[1].color = (*shiba.lin((0.80, 0.70, 0.52)), 1)
        nt.links.new(n1.outputs["Fac"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.4; nt.links.new(n1.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    else:  # cobble
        v = nt.nodes.new("ShaderNodeTexVoronoi"); v.inputs["Scale"].default_value = 10; v.feature = "DISTANCE_TO_EDGE"
        nt.links.new(tc.outputs["Object"], v.inputs["Vector"])
        v2 = nt.nodes.new("ShaderNodeTexVoronoi"); v2.inputs["Scale"].default_value = 10; nt.links.new(tc.outputs["Object"], v2.inputs["Vector"])
        edge = nt.nodes.new("ShaderNodeMath"); edge.operation = "SMOOTH_MIN"; edge.inputs[1].default_value = 0.04; edge.inputs[2].default_value = 0.02
        nt.links.new(v.outputs["Distance"], edge.inputs[0])
        ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = (*shiba.lin((0.38, 0.35, 0.33)), 1); ramp.color_ramp.elements[0].position = 0.0
        ramp.color_ramp.elements[1].color = (*shiba.lin((0.66, 0.62, 0.58)), 1); ramp.color_ramp.elements[1].position = 0.05
        nt.links.new(v.outputs["Distance"], ramp.inputs["Fac"])
        tint = nt.nodes.new("ShaderNodeMix"); tint.data_type = "RGBA"; tint.blend_type = "MULTIPLY"; tint.inputs["Factor"].default_value = 0.25
        nt.links.new(ramp.outputs["Color"], tint.inputs[6]); nt.links.new(v2.outputs["Color"], tint.inputs[7]); nt.links.new(tint.outputs[2], bsdf.inputs["Base Color"])
        bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.8; nt.links.new(edge.outputs[0], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    pl.data.materials.append(m)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.uv.unwrap(); bpy.ops.object.mode_set(mode="OBJECT")
    scene = bpy.context.scene; scene.render.engine = "CYCLES"; scene.cycles.samples = 4; scene.render.bake.use_selected_to_active = False
    tex_dir = os.path.join(out_dir, "textures"); os.makedirs(tex_dir, exist_ok=True)
    paths = {}
    for suffix, btype, pf, cs in (("BaseColor", "DIFFUSE", {"COLOR"}, "sRGB"), ("Normal", "NORMAL", set(), "Non-Color")):
        img = bpy.data.images.new(f"{name}_{suffix}", size, size, alpha=False); img.colorspace_settings.name = cs
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; nt.nodes.active = tex
        bpy.ops.object.select_all(action="DESELECT"); pl.select_set(True); bpy.context.view_layer.objects.active = pl
        bpy.ops.object.bake(type=btype, pass_filter=pf, use_clear=True, margin=0)
        p = os.path.join(tex_dir, f"T_{name}_{suffix}.png"); img.filepath_raw = p; img.file_format = "PNG"; img.save(); paths[suffix] = p
        nt.nodes.remove(tex)
    bpy.data.objects.remove(pl, do_unlink=True)
    make_seamless(paths.values())
    return paths


def make_seamless(paths, band=0.18):
    """Offset by half and cross-fade a band across the seam so the texture tiles."""
    from PIL import Image
    for p in paths:
        im = Image.open(p).convert("RGB"); w, h = im.size
        off = Image.new("RGB", (w, h)); off.paste(im.crop((w // 2, 0, w, h)), (0, 0)); off.paste(im.crop((0, 0, w // 2, h)), (w // 2, 0))
        off2 = Image.new("RGB", (w, h)); off2.paste(off.crop((0, h // 2, w, h)), (0, 0)); off2.paste(off.crop((0, 0, w, h // 2)), (0, h // 2))
        mask = Image.new("L", (w, h), 255); px = mask.load(); bw = int(w * band)
        for x in range(w):
            for y in range(h):
                dx = min(abs(x - w // 2), bw) / bw; dy = min(abs(y - h // 2), bw) / bw
                px[x, y] = int(255 * min(dx, dy))
        Image.composite(im, off2, mask).save(p)


# ---------------------------------------------------------------- diorama
def ground_material(name, paths, scale):
    m = bpy.data.materials.new("M_" + name); m.use_nodes = True; nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (scale, scale, scale)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    for suffix, inp in (("BaseColor", "Base Color"), ("Normal", None)):
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(paths[suffix]); t.projection = "BOX"; nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
        if inp: nt.links.new(t.outputs["Color"], bsdf.inputs[inp])
        else:
            t.image.colorspace_settings.name = "Non-Color"; nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = 0.6
            nt.links.new(t.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Roughness"].default_value = 0.9
    return m


def place(src, loc, rot=0, scale=1.0):
    o = src.copy(); o.data = src.data; bpy.context.collection.objects.link(o)
    o.location = loc; o.rotation_euler = (0, 0, rot); o.scale = (scale, scale, scale); return o


def diorama(kit, tex, out_dir):
    # ground: grass plane, dirt path, cobble plaza
    bpy.ops.mesh.primitive_plane_add(size=40); g = bpy.context.active_object; g.name = "Ground"; g.data.materials.append(ground_material("Grass", tex["grass"], 0.5))
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=4.2, fill_type="NGON", location=(0, 0, 0.01)); pz = bpy.context.active_object; pz.name = "Plaza"; pz.data.materials.append(ground_material("Cobble", tex["cobble"], 0.6))
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -9, 0.008)); path = bpy.context.active_object; path.scale = (2.4, 12, 1); path.name = "Path"; path.data.materials.append(ground_material("Dirt", tex["dirt"], 0.7))
    # props
    place(kit["SM_House"], (-6.5, 3, 0), 0.35); place(kit["SM_House"], (6.5, 2.5, 0), -0.4, 0.9); place(kit["SM_House"], (-5.5, -4, 0), 2.2, 0.85)
    place(kit["SM_Lamp"], (2.6, -2.6, 0), 2.6); place(kit["SM_Lamp"], (-2.6, -2.6, 0), 0.5)
    place(kit["SM_Anvil"], (3.0, 1.2, 0), -0.6); place(kit["SM_Barrel"], (3.6, 2.2, 0)); place(kit["SM_Barrel"], (4.1, 1.5, 0), 0.4, 0.9)
    place(kit["SM_Crate"], (-3.4, 1.8, 0), 0.3); place(kit["SM_Crate"], (-3.9, 1.2, 0), 0.9, 0.8); place(kit["SM_Crate"], (-3.5, 1.7, 0.7), 0.6, 0.7)
    for i, (x, y) in enumerate(((-9, -8), (9, -7), (-11, 0), (11, 5), (-8, 9), (7, 9), (3, 11), (-3, 12), (12, -3), (-12, -5))):
        place(kit["SM_Tree_Round" if i % 3 else "SM_Tree_Pine"], (x, y, 0), random.random() * 6.28, 0.85 + random.random() * 0.4)
    for x, y in ((-3.2, -6.5), (3.2, -6.5), (-3.2, -8.5), (3.2, -8.5)): place(kit["SM_Fence"], (x, y, 0), 1.5708)
    for x, y in ((-4, -5), (4.2, -4.5), (5.5, 6), (-6, 6.5), (8.5, -1)): place(kit["SM_Bush"], (x, y, 0), random.random() * 6.28, 0.8 + random.random() * 0.5)
    for x, y in ((-7.5, -1.5), (7.8, -3.5), (2, 7.5)): place(kit["SM_Rock_A"], (x, y, 0), random.random() * 6.28)
    for _ in range(40):
        a, r = random.random() * 6.28, 6 + random.random() * 7
        place(kit["SM_Flower"], (math.cos(a) * r, math.sin(a) * r, 0), random.random() * 6.28, 0.8 + random.random() * 0.6)
    # the knight, textured, standing on the path looking toward the field
    k = knight.build_textured_into_scene(out_dir) if hasattr(knight, "build_textured_into_scene") else None
    if k is None:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(os.path.dirname(out_dir), "out_knight", "dog_knight_textured.glb"))
        for o in set(bpy.data.objects) - before:
            if o.type == "ARMATURE": o.location = (0.4, -2.2, 0); o.rotation_euler = (0, 0, math.radians(15))
        # imported glTF materials: give them a little roughness so metals do not mirror the sky
        for o in set(bpy.data.objects) - before:
            if o.type == "MESH":
                for slot in o.material_slots:
                    b = next((n for n in slot.material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                    if b and not b.inputs["Roughness"].links: b.inputs["Roughness"].default_value = 0.45
    # lighting + camera (2.5D game angle: pitch -45, fov 35 per spec)
    scene = bpy.context.scene; scene.render.engine = "CYCLES"; scene.cycles.device = "CPU"; scene.cycles.samples = 96; scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 800; scene.view_settings.view_transform = "AgX"; scene.view_settings.look = "AgX - Punchy"; scene.view_settings.exposure = -0.4
    world = bpy.data.worlds.new("W"); world.use_nodes = True; scene.world = world
    sky = world.node_tree.nodes.new("ShaderNodeTexSky"); sky.sky_type = "MULTIPLE_SCATTERING"; sky.sun_elevation = math.radians(38); sky.sun_rotation = math.radians(200); sky.sun_intensity = 0.35
    world.node_tree.links.new(sky.outputs["Color"], world.node_tree.nodes["Background"].inputs["Color"]); world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.2
    sun = bpy.data.lights.new("Sun", "SUN"); sun.energy = 2.2; sun.angle = math.radians(2); sun.color = (1.0, 0.93, 0.80)
    so = bpy.data.objects.new("Sun", sun); so.rotation_euler = Euler((math.radians(48), math.radians(-12), math.radians(-30))); bpy.context.collection.objects.link(so)
    cam = bpy.data.cameras.new("Cam"); cam.lens = 50; cam.dof.use_dof = True; cam.dof.focus_distance = 13; cam.dof.aperture_fstop = 4.0
    co = bpy.data.objects.new("Cam", cam); bpy.context.collection.objects.link(co); scene.camera = co
    target = Vector((0.4, -2.2, 0.6))
    for name, pos in (("diorama_game_view.png", (0.4, -2.2 - 10.5, 10.5)), ("diorama_beauty.png", (7.5, -11.5, 6.5))):
        co.location = Vector(pos); co.rotation_euler = (target - co.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(out_dir, name); bpy.ops.render.render(write_still=True)


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    shiba.make_materials()
    kit = {}
    for fn in (tree_round, tree_pine, bush, fence, flower, house, lamp, barrel, crate, anvil):
        o = fn(); kit[o.name] = o
    kit["SM_Rock_A"] = rock("SM_Rock_A", 1, 0.7); kit["SM_Rock_B"] = rock("SM_Rock_B", 2, 0.45)
    for name, o in kit.items():
        o.location = (0, 0, 0)
        shiba.export_fbx(os.path.join(out_dir, name + ".fbx"), [o])
        bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, name + ".glb"), export_format="GLB", use_selection=True, export_apply=True,
                                  export_vertex_color="ACTIVE", export_animations=False, export_yup=True)
        o.hide_render = True; o.hide_viewport = True     # kit originals stay hidden; diorama uses copies
    tex = {k: ground_texture("Ground_" + k.capitalize(), k, out_dir) for k in ("grass", "dirt", "cobble")}
    for o in kit.values(): o.hide_render = False
    for o in kit.values(): o.location = (0, 0, -50)      # park originals out of frame
    diorama(kit, tex, out_dir)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "Diorama.blend"))
    print("OK env kit", sorted(kit), "->", out_dir)


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    main(os.path.abspath(argv[0] if argv else "out_env"))
