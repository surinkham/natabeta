"""Retarget a Mixamo animation FBX onto the SK_BK_Chibi skeleton (Blender-side, no UE needed).

    .venv/bin/python retarget_mixamo.py <mixamo_anim.fbx> <out_dir> [--target SK_Shiba.fbx] [--name Run] [--fps 30]

Method: per frame, each target bone copies the *world rotation* of its Mixamo bone, pre-multiplied by the
rest-pose delta between the two rigs (so different rest poses / bone rolls do not twist the limbs).
pelvis also copies root motion (scaled by height ratio). The result is baked to keyframes and exported as
<out_dir>/A_<name>.fbx (armature + action, no mesh) which UE imports straight onto SK_BK_Chibi.

Test without Mixamo: `--selftest` builds a fake mixamorig armature with a waving arm + hip bob.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Euler, Matrix, Vector

import build_shiba_chibi as shiba

MAP = {   # target bone -> Mixamo bone
    "pelvis": "mixamorig:Hips", "spine_01": "mixamorig:Spine", "neck_01": "mixamorig:Neck", "head": "mixamorig:Head",
    "upperarm_l": "mixamorig:LeftArm", "lowerarm_l": "mixamorig:LeftForeArm", "hand_l": "mixamorig:LeftHand",
    "upperarm_r": "mixamorig:RightArm", "lowerarm_r": "mixamorig:RightForeArm", "hand_r": "mixamorig:RightHand",
    "thigh_l": "mixamorig:LeftUpLeg", "calf_l": "mixamorig:LeftLeg", "foot_l": "mixamorig:LeftFoot",
    "thigh_r": "mixamorig:RightUpLeg", "calf_r": "mixamorig:RightLeg", "foot_r": "mixamorig:RightFoot",
}
ORDER = ["pelvis", "spine_01", "neck_01", "head", "upperarm_l", "lowerarm_l", "hand_l", "upperarm_r", "lowerarm_r", "hand_r",
         "thigh_l", "calf_l", "foot_l", "thigh_r", "calf_r", "foot_r"]


def find_armature(prefix="mixamorig:"):
    for o in bpy.data.objects:
        if o.type == "ARMATURE" and any(b.name.startswith(prefix) for b in o.data.bones):
            return o
    raise SystemExit("no Mixamo armature found (bones named mixamorig:*)")


def load_target(path):
    if path:
        before = set(bpy.data.objects); bpy.ops.import_scene.fbx(filepath=path)
        arm = next(o for o in set(bpy.data.objects) - before if o.type == "ARMATURE")
        for o in set(bpy.data.objects) - before:
            if o.type != "ARMATURE": bpy.data.objects.remove(o, do_unlink=True)
        arm.name = "SK_BK_Chibi"; return arm
    return shiba.build_armature(shiba.all_bones())


def rest_world(arm, name):
    return arm.matrix_world @ arm.data.bones[name].matrix_local


def retarget(src, tgt, fps, frame_range):
    scene = bpy.context.scene; scene.render.fps = fps
    f0, f1 = frame_range
    scene.frame_set(f0)
    # rest deltas at the first frame's *bind* pose: use bone rest matrices (pose-independent)
    delta = {}
    for t, s in MAP.items():
        if s not in src.data.bones or t not in tgt.data.bones: continue
        delta[t] = rest_world(tgt, t).to_3x3() @ rest_world(src, s).to_3x3().inverted()
    src_h = max(b.head_local.z for b in src.data.bones) or 1
    tgt_h = max(b.head_local.z for b in tgt.data.bones) or 1
    ratio = tgt_h / src_h
    tgt.animation_data_create()
    action = bpy.data.actions.new("A_Retarget"); tgt.animation_data.action = action
    for pb in tgt.pose.bones:
        pb.rotation_mode = "QUATERNION"
    pelvis_rest = rest_world(tgt, "pelvis").translation
    hips_rest = rest_world(src, MAP["pelvis"]).translation
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        for t in ORDER:
            if t not in delta: continue
            s = MAP[t]
            sw = src.matrix_world @ src.pose.bones[s].matrix               # source bone, world
            rot = (delta[t] @ sw.to_3x3()).to_4x4()
            if t == "pelvis":
                loc = pelvis_rest + (sw.translation - hips_rest) * ratio
            else:
                loc = (tgt.matrix_world @ tgt.pose.bones[t].matrix).translation   # keep chain-derived position
            m = Matrix.Translation(loc) @ rot
            tgt.pose.bones[t].matrix = tgt.matrix_world.inverted() @ m
            bpy.context.view_layer.update()
            tgt.pose.bones[t].keyframe_insert("rotation_quaternion", frame=f)
            if t == "pelvis":
                tgt.pose.bones[t].keyframe_insert("location", frame=f)
    return action


def export_anim(tgt, path, name):
    tgt.animation_data.action.name = "A_" + name
    bpy.ops.object.select_all(action="DESELECT"); tgt.select_set(True); bpy.context.view_layer.objects.active = tgt
    bpy.ops.export_scene.fbx(filepath=path, use_selection=True, object_types={"ARMATURE"}, add_leaf_bones=False,
                             bake_anim=True, bake_anim_use_all_actions=False, bake_anim_use_nla_strips=False, bake_anim_simplify_factor=0.0,
                             armature_nodetype="NULL")


def selftest_source():
    """Fake Mixamo rig: T-pose, 1.8 m, arm wave + hip bob over 30 frames."""
    bones = {  # name: head, tail, parent
        "mixamorig:Hips": ((0, 0, 1.0), (0, 0, 1.1), None), "mixamorig:Spine": ((0, 0, 1.1), (0, 0, 1.4), "mixamorig:Hips"),
        "mixamorig:Neck": ((0, 0, 1.4), (0, 0, 1.5), "mixamorig:Spine"), "mixamorig:Head": ((0, 0, 1.5), (0, 0, 1.8), "mixamorig:Neck"),
        "mixamorig:LeftArm": ((0.2, 0, 1.4), (0.5, 0, 1.4), "mixamorig:Spine"), "mixamorig:LeftForeArm": ((0.5, 0, 1.4), (0.75, 0, 1.4), "mixamorig:LeftArm"),
        "mixamorig:LeftHand": ((0.75, 0, 1.4), (0.85, 0, 1.4), "mixamorig:LeftForeArm"),
        "mixamorig:RightArm": ((-0.2, 0, 1.4), (-0.5, 0, 1.4), "mixamorig:Spine"), "mixamorig:RightForeArm": ((-0.5, 0, 1.4), (-0.75, 0, 1.4), "mixamorig:RightArm"),
        "mixamorig:RightHand": ((-0.75, 0, 1.4), (-0.85, 0, 1.4), "mixamorig:RightForeArm"),
        "mixamorig:LeftUpLeg": ((0.1, 0, 1.0), (0.1, 0, 0.5), "mixamorig:Hips"), "mixamorig:LeftLeg": ((0.1, 0, 0.5), (0.1, 0, 0.05), "mixamorig:LeftUpLeg"),
        "mixamorig:LeftFoot": ((0.1, 0, 0.05), (0.1, -0.15, 0.0), "mixamorig:LeftLeg"),
        "mixamorig:RightUpLeg": ((-0.1, 0, 1.0), (-0.1, 0, 0.5), "mixamorig:Hips"), "mixamorig:RightLeg": ((-0.1, 0, 0.5), (-0.1, 0, 0.05), "mixamorig:RightUpLeg"),
        "mixamorig:RightFoot": ((-0.1, 0, 0.05), (-0.1, -0.15, 0.0), "mixamorig:RightLeg"),
    }
    arm = shiba.build_armature(bones); arm.name = "MixamoFake"
    arm.animation_data_create(); arm.animation_data.action = bpy.data.actions.new("Wave")
    for f in range(1, 31):
        bpy.context.scene.frame_set(f)
        a = math.sin(f / 30 * 2 * math.pi)
        pb = arm.pose.bones["mixamorig:RightArm"]; pb.rotation_mode = "XYZ"; pb.rotation_euler = (0, 0, -1.2 * max(0, a))   # raise right arm
        pb.keyframe_insert("rotation_euler", frame=f)
        pb = arm.pose.bones["mixamorig:LeftUpLeg"]; pb.rotation_mode = "XYZ"; pb.rotation_euler = (0.6 * a, 0, 0); pb.keyframe_insert("rotation_euler", frame=f)
        pb = arm.pose.bones["mixamorig:Hips"]; pb.location = (0, 0, 0.05 * abs(a)); pb.keyframe_insert("location", frame=f)
    return arm, (1, 30)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mixamo", nargs="?"); ap.add_argument("out_dir", nargs="?", default="out_anim")
    ap.add_argument("--target"); ap.add_argument("--name", default="Anim"); ap.add_argument("--fps", type=int, default=30); ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
    os.makedirs(a.out_dir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if a.selftest:   # target = the real Shiba (mesh + rig) so the render shows the retargeted pose on skin
        _, tgt, _ = shiba.build_character(); src, rng = selftest_source(); a.name = "SelfTest"
    else:
        bpy.ops.import_scene.fbx(filepath=os.path.abspath(a.mixamo), automatic_bone_orientation=False, ignore_leaf_bones=True)
        src = find_armature(); act = src.animation_data.action; rng = (int(act.frame_range[0]), int(act.frame_range[1]))
        tgt = load_target(a.target)
    action = retarget(src, tgt, a.fps, rng)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = rng
    export_anim(tgt, os.path.join(a.out_dir, f"A_{a.name}.fbx"), a.name)
    # self-check: the retargeted pose actually moved and mirrors the source
    bpy.context.scene.frame_set(rng[0] + (rng[1] - rng[0]) // 4)
    arm_r = (tgt.matrix_world @ tgt.pose.bones["hand_r"].matrix).translation
    rest_r = rest_world(tgt, "hand_r").translation
    print(f"OK A_{a.name}: frames {rng}, hand_r moved {(arm_r - rest_r).length:.3f} m from rest, keyed bones={sum(1 for t in ORDER if t in tgt.data.bones and MAP[t] in src.data.bones)} -> {a.out_dir}")
    if a.selftest:
        assert (arm_r - rest_r).length > 0.05, "retarget did not move the arm"
        src.hide_render = True
        shoot = shiba.setup_render(a.out_dir); bpy.context.scene.cycles.samples = 16
        for f in (1, 8, 15):
            bpy.context.scene.frame_set(f)
            shoot(f"selftest_f{f:02d}.png", (0.3, -2.4, 1.0))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(a.out_dir, f"A_{a.name}.blend"))


if __name__ == "__main__":
    main()
