"""Rigged, animated horse mount: the build_beasts horse body on its own small skeleton, with Gallop and Idle clips.

    .venv/bin/python build_horse.py [out_dir]     (default out_horse)

Output: SM_Horse.glb (armature "SK_Horse" + skinned "SM_Horse" + two glTF animations) and horse_sheet.png.
Origin between the hooves, facing -Y (Blender) like every character; the saddle top stays at z 0.62 so the client's
SADDLE_Y still holds. Bone space as in build_anim_clips: legs hang down, local X swings them fore/aft.
"""
import math
import os
import sys

import bpy

import build_anim_clips as clips
import build_beasts as beasts
import build_shiba_chibi as shiba
import texture_pass as tp

FPS = 30
B = {   # name: (head, tail, parent)
    "root":     ((0, 0, 0), (0, 0, 0.1), None),
    "spine":    ((0, 0.26, 0.47), (0, -0.24, 0.47), "root"),
    "neck":     ((0, -0.28, 0.54), (0, -0.44, 0.78), "spine"),
    "head":     ((0, -0.44, 0.80), (0, -0.64, 0.76), "neck"),
    "tail":     ((0, 0.40, 0.46), (0, 0.47, 0.26), "spine"),
}
for side, x in (("l", 0.10), ("r", -0.10)):
    B[f"fore_up_{side}"] = ((x, -0.20, 0.42), (x, -0.21, 0.23), "spine")
    B[f"fore_lo_{side}"] = ((x, -0.21, 0.23), (x, -0.22, 0.02), f"fore_up_{side}")
    B[f"hind_up_{side}"] = ((x, 0.22, 0.42), (x, 0.23, 0.23), "spine")
    B[f"hind_lo_{side}"] = ((x, 0.23, 0.23), (x, 0.24, 0.02), f"hind_up_{side}")

# A rotary gallop: diagonal pairs a little out of phase, knees fold as each leg swings forward, the back rocks.
def leg(offset, swing=34, fold=55, back=False):
    """Upper leg swings on a cosine; the lower leg folds only while the leg travels forward (hinds fold the other way)."""
    up, lo = [], []
    for f in range(0, 17, 2):
        a = 2 * math.pi * (f + offset) / 16
        up.append((f, (swing * math.cos(a), 0, 0)))
        lo.append((f, ((-1 if back else 1) * fold * max(0.0, math.sin(a)), 0, 0)))
    return up, lo

GALLOP = {}
for name, off, back in (("fore_up_l", 0, False), ("fore_up_r", 2, False), ("hind_up_l", 8, True), ("hind_up_r", 10, True)):
    u, l = leg(off, back=back); GALLOP[name] = u; GALLOP[name.replace("_up_", "_lo_")] = l
GALLOP.update({
    "spine": [(0, (3, 0, 0)), (4, (-4, 0, 0)), (8, (3, 0, 0)), (12, (-4, 0, 0)), (16, (3, 0, 0))],
    "neck":  [(0, (-10, 0, 0)), (8, (10, 0, 0)), (16, (-10, 0, 0))],
    "head":  [(0, (6, 0, 0)), (8, (-6, 0, 0)), (16, (6, 0, 0))],
    "tail":  [(0, (25, 0, 0)), (8, (40, 0, 0)), (16, (25, 0, 0))],
    "root.loc": [(0, (0, 0, 0)), (4, (0, 0.05, 0)), (8, (0, 0, 0)), (12, (0, 0.05, 0)), (16, (0, 0, 0))],
})
IDLE = {
    "neck": [(0, (0, 0, 0)), (30, (6, 0, 0)), (45, (-2, 0, 0)), (60, (0, 0, 0))],
    "head": [(0, (0, 0, 0)), (20, (0, 0, 6)), (40, (0, 0, -4)), (60, (0, 0, 0))],
    "tail": [(0, (0, 0, -15)), (15, (5, 0, 15)), (30, (0, 0, -15)), (45, (5, 0, 15)), (60, (0, 0, -15))],
    "spine": [(0, (0, 0, 0)), (30, (1.5, 0, 0)), (60, (0, 0, 0))],
    "fore_up_l": [(0, (0, 0, 0)), (60, (0, 0, 0))],
}
CLIPS = {"Gallop": (16, True, GALLOP), "Idle": (60, True, IDLE)}


def build_mount(out_dir, make, bones, clip_specs, name, arm_name, cam=(1.9, -0.6, 0.9)):
    """Shared by every mount: make() → skin to `bones` → key `clip_specs` → export <name>.glb + a pose sheet."""
    os.makedirs(out_dir, exist_ok=True)
    body = make()
    tp.apply([body], defaults={name: "fur"}); tp.bake([body], out_dir, size=512)
    arm = shiba.build_armature(bones); arm.name = arm.data.name = arm_name
    shiba.weight(body, [n for n in bones if n != "root"], bones); shiba.bind(body, arm)
    arm.animation_data_create()
    actions = {n: clips.key_clip(arm, n, *spec) for n, spec in clip_specs.items()}
    for n, act in actions.items():
        tr = arm.animation_data.nla_tracks.new(); tr.name = n; st = tr.strips.new(n, 0, act)
        if getattr(act, "slots", None) and hasattr(st, "action_slot"): st.action_slot = act.slots[0]
    arm.animation_data.action = None
    bpy.context.scene.render.fps = FPS
    for img in bpy.data.images:
        want = 256 if "BaseColor" in img.name else 128
        if img.size[0] > want: img.scale(want, want)
    bpy.ops.object.select_all(action="DESELECT"); arm.select_set(True); body.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, f"{name}.glb"), export_format="GLB", use_selection=True, export_apply=False,
                              export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_frame_range=False,
                              export_anim_slide_to_zero=True, export_yup=True, export_image_format="JPEG", export_jpeg_quality=72)
    shoot = shiba.setup_render(out_dir); bpy.context.scene.render.use_freestyle = False; bpy.context.scene.cycles.samples = 16
    bpy.context.scene.render.resolution_x = bpy.context.scene.render.resolution_y = 384
    frames = []
    for n, (length, _, _) in clip_specs.items():
        for t in arm.animation_data.nla_tracks: t.mute = True
        arm.animation_data.action = actions[n]
        if getattr(actions[n], "slots", None): arm.animation_data.action_slot = actions[n].slots[0]
        for f in (0, length // 4, length // 2, 3 * length // 4)[: 4 if n == "Gallop" else 1]:
            bpy.context.scene.frame_set(f); fn = f"m_{n}_{f:02d}.png"; shoot(fn, cam); frames.append(fn)
    from PIL import Image
    sheet = Image.new("RGB", (384 * len(frames), 384), (245, 245, 245))
    for i, f in enumerate(frames): sheet.paste(Image.open(os.path.join(out_dir, f)).convert("RGB"), (i * 384, 0)); os.remove(os.path.join(out_dir, f))
    sheet.save(os.path.join(out_dir, f"{name}_sheet.png"))
    print("OK", name, len(body.data.polygons), "faces")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    build_mount(os.path.abspath(argv[0] if argv else "out_horse"), beasts.horse, B, CLIPS, "SM_Horse", "SK_Horse")
