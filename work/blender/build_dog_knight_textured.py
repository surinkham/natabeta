"""Dog Knight with the texture pass: procedural PBR materials baked to textures.

    .venv/bin/python build_dog_knight_textured.py [out_dir]

Outputs (out_dir): dog_knight_textured.glb (textures embedded), DogKnight_Textured.fbx (+ textures/),
                   textures/T_<part>_<pass>.png, render_knight_front/side/back.png
"""
import math
import os
import sys

import bpy

import build_dog_knight as knight
import build_shiba_chibi as shiba
import texture_pass as tp

SMALL = {"SK_Dog_Ears": 512, "SK_Dog_Tail": 512, "SK_Knight_Gloves": 512, "SK_Knight_Boots": 512, "SM_KnightSword": 512}


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    k = knight.build()
    objects = k["parts"] + k["armour"] + [k["sword"], k["shield"]]
    eye_zones = [(f[1], f[2]) for f in knight.FACE[:5]] + [((-f[1][0], f[1][1], f[1][2]), f[2]) for f in knight.FACE[:5]]
    defaults = {o.name: "steel" for o in k["armour"]}; defaults.update({"SK_Knight_Cape": "cloth", "SM_KiteShield": "cloth", "SM_KnightSword": "steel"})
    tp.apply(objects, smooth_zones=eye_zones, defaults=defaults)
    tp.bake(objects, out_dir, size=1024, small=SMALL)

    knight.equip(k)
    bpy.ops.object.select_all(action="DESELECT")
    for o in [k["arm"]] + objects: o.select_set(True)
    bpy.context.view_layer.objects.active = k["arm"]
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, "dog_knight_textured.glb"), export_format="GLB", use_selection=True,
                              export_apply=True, export_animations=False, export_yup=True, export_image_format="AUTO")
    bpy.ops.export_scene.fbx(filepath=os.path.join(out_dir, "DogKnight_Textured.fbx"), use_selection=True, object_types={"ARMATURE", "MESH"},
                             use_mesh_modifiers=True, mesh_smooth_type="FACE", add_leaf_bones=False, bake_anim=False, path_mode="COPY", embed_textures=True)

    # PBR render (no cel shading / outline: the sheet is a lit 3D look)
    shoot = shiba.setup_render(out_dir)
    scene = bpy.context.scene
    scene.render.use_freestyle = False; scene.cycles.samples = 96
    wn = scene.world.node_tree; bg = wn.nodes["Background"]; bg.inputs["Strength"].default_value = 1.4
    tc = wn.nodes.new("ShaderNodeTexCoord"); sep = wn.nodes.new("ShaderNodeSeparateXYZ"); ramp = wn.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.45; ramp.color_ramp.elements[0].color = (0.62, 0.58, 0.54, 1)   # ground bounce
    ramp.color_ramp.elements[1].position = 0.7; ramp.color_ramp.elements[1].color = (0.62, 0.76, 0.98, 1)     # sky -> metals have something to reflect
    wn.links.new(tc.outputs["Generated"], sep.inputs[0]); wn.links.new(sep.outputs["Z"], ramp.inputs["Fac"]); wn.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bpy.data.objects["Key"].data.energy = 4.0; bpy.data.objects["Fill"].data.energy = 1.2
    rim = bpy.data.lights.new("Rim", "SUN"); rim.energy = 2.5; rim.angle = 0
    ro = bpy.data.objects.new("Rim", rim); ro.rotation_euler = [math.radians(a) for a in (-50, 0, 20)]; bpy.context.collection.objects.link(ro)
    shoot("render_knight_front.png", (0.75, -2.0, 0.95)); shoot("render_knight_side.png", (2.1, -0.3, 0.85)); shoot("render_knight_back.png", (0.6, 2.1, 0.9))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "DogKnight_Textured.blend"))
    print("OK textured ->", out_dir, sorted(os.listdir(os.path.join(out_dir, "textures")))[:6], "...")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    main(os.path.abspath(argv[0] if argv else "out_knight"))
