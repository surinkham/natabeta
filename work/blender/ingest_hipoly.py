"""Ingest a hi-poly textured mesh (image-to-3D output: Hunyuan3D / Tripo / Meshy, or any GLB/OBJ/FBX)
and turn it into a game-ready character on the shared SK_BK_Chibi skeleton.

    .venv/bin/python ingest_hipoly.py <input.glb|obj|fbx> <out_dir> [--name SK_Name] [--tris 8000] [--height 0.95] [--yaw 0] [--tex 2048] [--voxel_div 140]

Steps: import → join → normalise (feet on z=0, centred, height, forward=-Y) → voxel + QuadriFlow remesh to ~tris
       → smart UV → bake BaseColor + Normal from the hi-poly → fit SK_BK_Chibi bones to the bbox → auto weights
       → <name>.fbx / <name>.glb / textures / preview.

Outputs land in <out_dir>. Hi-poly is discarded after the bake; keep the source file.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

import build_shiba_chibi as shiba

TEMPLATE_HEIGHT = 0.95   # the hand-built rig is 0.95 m tall; bones scale from that


def import_any(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        raise SystemExit("unsupported input: " + ext)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    others = [o for o in bpy.context.scene.objects if o.type != "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    # bake down any modifiers (skins, subdiv) into geometry, drop parenting, join
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.join()
    hi = bpy.context.active_object
    for o in others:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    hi.name = "HIPOLY"
    return hi


def normalise(ob, height, yaw_deg):
    ob.rotation_euler = (0, 0, math.radians(yaw_deg))
    bpy.ops.object.transform_apply(rotation=True)
    xs = [v.co.x for v in ob.data.vertices]; ys = [v.co.y for v in ob.data.vertices]; zs = [v.co.z for v in ob.data.vertices]
    h = max(zs) - min(zs)
    s = height / h
    cx, cy, z0 = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)
    for v in ob.data.vertices:
        v.co = Vector(((v.co.x - cx) * s, (v.co.y - cy) * s, (v.co.z - z0) * s))
    ob.data.update()
    return s


def remesh(hi, tris, voxel_div=140):
    low = hi.copy(); low.data = hi.data.copy(); low.name = "LOWPOLY"
    bpy.context.collection.objects.link(low)
    bpy.ops.object.select_all(action="DESELECT"); low.select_set(True); bpy.context.view_layer.objects.active = low
    low.data.materials.clear()
    height = max(v.co.z for v in low.data.vertices)
    vox = low.modifiers.new("Vox", "REMESH"); vox.mode = "VOXEL"; vox.voxel_size = height / voxel_div; vox.use_smooth_shade = True   # thin parts (blades) vanish below ~2 voxels: raise --voxel_div
    bpy.ops.object.modifier_apply(modifier="Vox")
    try:
        bpy.ops.object.quadriflow_remesh(target_faces=max(500, tris // 2), use_preserve_sharp=False, use_mesh_symmetry=True, seed=1)
        method = "quadriflow"
    except RuntimeError as e:
        print("quadriflow failed, falling back to decimate:", e)
        dec = low.modifiers.new("Dec", "DECIMATE"); dec.ratio = min(1.0, tris / max(1, sum(len(p.vertices) - 2 for p in low.data.polygons)))
        bpy.ops.object.modifier_apply(modifier="Dec"); method = "decimate"
    now = sum(len(p.vertices) - 2 for p in low.data.polygons)
    if now > tris * 1.15:
        dec = low.modifiers.new("Dec2", "DECIMATE"); dec.ratio = tris / now; bpy.ops.object.modifier_apply(modifier="Dec2")
    bpy.ops.object.shade_smooth()
    return low, method


def bake_from_hi(hi, low, out_dir, size):
    tex_dir = os.path.join(out_dir, "textures"); os.makedirs(tex_dir, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT"); low.select_set(True); bpy.context.view_layer.objects.active = low
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.008); bpy.ops.object.mode_set(mode="OBJECT")
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"; scene.cycles.device = "CPU"; scene.cycles.samples = 4
    bk = scene.render.bake; bk.use_selected_to_active = True; bk.cage_extrusion = 0.02; bk.max_ray_distance = 0.08; bk.margin = 8
    mat = bpy.data.materials.new("M_" + low.name); mat.use_nodes = True; low.data.materials.append(mat)
    nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]
    imgs = {}
    for suffix, btype, pf, cs in (("BaseColor", "DIFFUSE", {"COLOR"}, "sRGB"), ("Normal", "NORMAL", set(), "Non-Color")):
        img = bpy.data.images.new(f"{low.name}_{suffix}", size, size, alpha=False); img.colorspace_settings.name = cs
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; nt.nodes.active = tex
        hi.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active = low
        bpy.ops.object.bake(type=btype, pass_filter=pf, use_selected_to_active=True, use_clear=True)
        img.filepath_raw = os.path.join(tex_dir, f"T_{low.name}_{suffix}.png"); img.file_format = "PNG"; img.save()
        imgs[suffix] = tex
    nt.links.new(imgs["BaseColor"].outputs["Color"], bsdf.inputs["Base Color"])
    nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(imgs["Normal"].outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Roughness"].default_value = 0.7
    bk.use_selected_to_active = False


def fit_skeleton(low):
    """Scale the template bones to this mesh: height from bbox z, width from bbox x, depth from bbox y."""
    xs = [v.co.x for v in low.data.vertices]; ys = [v.co.y for v in low.data.vertices]; zs = [v.co.z for v in low.data.vertices]
    sz = max(zs) / TEMPLATE_HEIGHT
    sx = (max(xs) - min(xs)) / 0.55 / sz      # template shoulder+arm span ≈ 0.55 m
    sy = (max(ys) - min(ys)) / 0.52 / sz      # template depth incl. muzzle+tail ≈ 0.52 m
    sx, sy = max(0.6, min(1.6, sx)), max(0.6, min(1.6, sy))
    bones = {}
    for n, (h, t, p) in shiba.all_bones().items():
        f = lambda v: (v[0] * sz * sx, v[1] * sz * sy, v[2] * sz)
        bones[n] = (f(h), f(t), p)
    return bones


def rig(low, bones):
    arm = shiba.build_armature(bones)
    bpy.ops.object.select_all(action="DESELECT"); low.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        method = "auto-weights"
    except RuntimeError as e:
        print("auto weights failed:", e)
        deform = [n for n in bones if not n.startswith("socket_") and n != "root"]
        shiba.weight(low, deform, bones); shiba.bind(low, arm); method = "nearest-bone"
    return arm, method


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input"); ap.add_argument("out_dir")
    ap.add_argument("--name", default="SK_Ingested"); ap.add_argument("--tris", type=int, default=8000)
    ap.add_argument("--height", type=float, default=TEMPLATE_HEIGHT); ap.add_argument("--yaw", type=float, default=0)
    ap.add_argument("--tex", type=int, default=2048); ap.add_argument("--voxel_div", type=int, default=140)
    a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
    os.makedirs(a.out_dir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)

    hi = import_any(os.path.abspath(a.input))
    normalise(hi, a.height, a.yaw)
    low, remesh_method = remesh(hi, a.tris, a.voxel_div)
    low.name = low.data.name = a.name
    bake_from_hi(hi, low, a.out_dir, a.tex)
    bpy.data.objects.remove(hi, do_unlink=True)
    bones = fit_skeleton(low)
    arm, weight_method = rig(low, bones)

    shiba.export_fbx(os.path.join(a.out_dir, a.name + ".fbx"), [arm, low])
    bpy.ops.object.select_all(action="DESELECT"); arm.select_set(True); low.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=os.path.join(a.out_dir, a.name + ".glb"), export_format="GLB", use_selection=True, export_apply=True, export_animations=False, export_yup=True)
    shoot = shiba.setup_render(a.out_dir)
    bpy.context.scene.render.use_freestyle = False; bpy.context.scene.cycles.samples = 64
    shoot(f"preview_{a.name}_front.png", (0.75, -2.0, 0.95)); shoot(f"preview_{a.name}_side.png", (2.1, -0.3, 0.85))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(a.out_dir, a.name + ".blend"))
    tris = sum(len(p.vertices) - 2 for p in low.data.polygons)
    print(f"OK {a.name}: {tris} tris ({remesh_method}), weights={weight_method}, bones={len(arm.data.bones)} -> {a.out_dir}")


if __name__ == "__main__":
    main()
