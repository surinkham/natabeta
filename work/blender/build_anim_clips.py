"""Hand-keyed animation clips for SK_BK_Chibi (shared by every character): Idle, Run, Attack, Slash, Hit, Death, Dash,
Bash, Whirl, Cast.

    .venv/bin/python build_anim_clips.py [out_dir]     (default out_anim)

Outputs: anims.glb (armature + one glTF animation per clip, no mesh) and anim_sheet.png (pose check on the Shiba).
Bone space: Y runs along the bone. Legs/arms hang down, so rotating about local X swings them forward/back;
the head/spine point up, so local X = nod, local Y = twist (yaw), local Z = sideways tilt. Angles in degrees, frames at 30 fps.
"""
import math
import os
import sys

import bpy
from mathutils import Euler

import build_shiba_chibi as shiba

FPS = 30
# clip -> length(frames), loop, {bone: [(frame, (rx, ry, rz) deg)]} + optional pelvis location keys "pelvis.loc": [(frame, (x,y,z))]
CLIPS = {
    "Idle": (60, True, {
        "spine_01": [(0, (0, 0, 0)), (30, (2, 0, 0)), (60, (0, 0, 0))],
        "head":     [(0, (0, 0, 0)), (20, (0, 0, 2)), (45, (0, 0, -2)), (60, (0, 0, 0))],
        "tail_01":  [(0, (0, 0, -18)), (15, (0, 0, 18)), (30, (0, 0, -18)), (45, (0, 0, 18)), (60, (0, 0, -18))],
        "ear_l":    [(0, (0, 0, 0)), (30, (4, 0, 0)), (60, (0, 0, 0))], "ear_r": [(0, (0, 0, 0)), (30, (4, 0, 0)), (60, (0, 0, 0))],
        "pelvis.loc": [(0, (0, 0, 0)), (30, (0, 0.006, 0)), (60, (0, 0, 0))],
    }),
    "Run": (16, True, {
        "thigh_l":    [(0, (35, 0, 0)), (8, (-35, 0, 0)), (16, (35, 0, 0))],
        "thigh_r":    [(0, (-35, 0, 0)), (8, (35, 0, 0)), (16, (-35, 0, 0))],
        "calf_l":     [(0, (0, 0, 0)), (4, (-30, 0, 0)), (8, (0, 0, 0)), (16, (0, 0, 0))],
        "calf_r":     [(0, (0, 0, 0)), (8, (0, 0, 0)), (12, (-30, 0, 0)), (16, (0, 0, 0))],
        "upperarm_l": [(0, (-30, 0, 0)), (8, (30, 0, 0)), (16, (-30, 0, 0))],
        "upperarm_r": [(0, (30, 0, 0)), (8, (-30, 0, 0)), (16, (30, 0, 0))],
        "spine_01":   [(0, (8, 0, 0)), (16, (8, 0, 0))],
        "head":       [(0, (-4, 0, 0)), (16, (-4, 0, 0))],
        "tail_01":    [(0, (0, 0, -25)), (4, (0, 0, 25)), (8, (0, 0, -25)), (12, (0, 0, 25)), (16, (0, 0, -25))],
        "ear_l":      [(0, (8, 0, 0)), (4, (-4, 0, 0)), (8, (8, 0, 0)), (12, (-4, 0, 0)), (16, (8, 0, 0))],
        "ear_r":      [(0, (8, 0, 0)), (4, (-4, 0, 0)), (8, (8, 0, 0)), (12, (-4, 0, 0)), (16, (8, 0, 0))],
        "pelvis.loc": [(0, (0, 0, 0)), (4, (0, 0.03, 0)), (8, (0, 0, 0)), (12, (0, 0.03, 0)), (16, (0, 0, 0))],
    }),
    "Attack": (16, False, {   # wind-up 0-5, strike 5-9, recover 9-16 ; contact frame = 7
        "upperarm_r": [(0, (0, 0, 0)), (5, (-110, 0, -20)), (9, (60, 0, 10)), (16, (0, 0, 0))],
        "lowerarm_r": [(0, (0, 0, 0)), (5, (-40, 0, 0)), (9, (0, 0, 0)), (16, (0, 0, 0))],
        "spine_01":   [(0, (0, 0, 0)), (5, (-8, 12, 0)), (9, (14, -10, 0)), (16, (0, 0, 0))],
        "upperarm_l": [(0, (0, 0, 0)), (5, (20, 0, 0)), (9, (-20, 0, 0)), (16, (0, 0, 0))],
        "head":       [(0, (0, 0, 0)), (9, (6, 0, 0)), (16, (0, 0, 0))],
    }),
    "Slash": (22, False, {    # big horizontal sweep with torso twist ; contact frame = 10
        "upperarm_r": [(0, (0, 0, 0)), (7, (-95, 0, -60)), (13, (-60, 0, 70)), (22, (0, 0, 0))],
        "lowerarm_r": [(0, (0, 0, 0)), (7, (-30, 0, 0)), (13, (-10, 0, 0)), (22, (0, 0, 0))],
        "spine_01":   [(0, (0, 0, 0)), (7, (-5, 30, 0)), (13, (10, -35, 0)), (22, (0, 0, 0))],
        "pelvis":     [(0, (0, 0, 0)), (7, (0, 12, 0)), (13, (0, -14, 0)), (22, (0, 0, 0))],
        "upperarm_l": [(0, (0, 0, 0)), (7, (40, 0, 0)), (13, (-30, 0, 0)), (22, (0, 0, 0))],
        "head":       [(0, (0, 0, 0)), (7, (0, 10, 0)), (13, (0, -10, 0)), (22, (0, 0, 0))],
        "pelvis.loc": [(0, (0, 0, 0)), (10, (0, -0.02, 0)), (22, (0, 0, 0))],
    }),
    "Hit": (10, False, {
        "spine_01": [(0, (0, 0, 0)), (3, (-18, 0, 6)), (10, (0, 0, 0))],
        "head":     [(0, (0, 0, 0)), (3, (-22, 0, -8)), (10, (0, 0, 0))],
        "upperarm_l": [(0, (0, 0, 0)), (3, (-25, 0, 0)), (10, (0, 0, 0))], "upperarm_r": [(0, (0, 0, 0)), (3, (-25, 0, 0)), (10, (0, 0, 0))],
        "pelvis.loc": [(0, (0, 0, 0)), (3, (0, 0, 0.06)), (10, (0, 0, 0))],
    }),
    "Death": (24, False, {   # topple sideways, hold last frame
        "pelvis":   [(0, (0, 0, 0)), (14, (0, 0, -85)), (24, (0, 0, -90))],
        "spine_01": [(0, (0, 0, 0)), (14, (10, 0, -10)), (24, (12, 0, -12))],
        "head":     [(0, (0, 0, 0)), (14, (-15, 0, 15)), (24, (-18, 0, 20))],
        "upperarm_l": [(0, (0, 0, 0)), (24, (-40, 0, 30))], "upperarm_r": [(0, (0, 0, 0)), (24, (-30, 0, -20))],
        "thigh_l":  [(0, (0, 0, 0)), (24, (20, 0, 0))], "thigh_r": [(0, (0, 0, 0)), (24, (-15, 0, 0))],
        "pelvis.loc": [(0, (0, 0, 0)), (14, (0, -0.12, 0)), (24, (0, -0.14, 0))],
    }),
    "Pick": (26, False, {     # crouch, reach for the ground, stand back up ; grab frame = 12
        "spine_01":   [(0, (0, 0, 0)), (10, (34, 0, 0)), (15, (30, 0, 0)), (26, (0, 0, 0))],
        "head":       [(0, (0, 0, 0)), (10, (14, 0, 0)), (15, (12, 0, 0)), (26, (0, 0, 0))],
        "upperarm_r": [(0, (0, 0, 0)), (10, (48, 0, -8)), (15, (38, 0, -6)), (26, (0, 0, 0))],
        "lowerarm_r": [(0, (0, 0, 0)), (10, (26, 0, 0)), (15, (10, 0, 0)), (26, (0, 0, 0))],
        "upperarm_l": [(0, (0, 0, 0)), (10, (16, 0, 0)), (26, (0, 0, 0))],
        "thigh_l":    [(0, (0, 0, 0)), (10, (-26, 0, 0)), (15, (-22, 0, 0)), (26, (0, 0, 0))],
        "thigh_r":    [(0, (0, 0, 0)), (10, (-26, 0, 0)), (15, (-22, 0, 0)), (26, (0, 0, 0))],
        "calf_l":     [(0, (0, 0, 0)), (10, (34, 0, 0)), (15, (30, 0, 0)), (26, (0, 0, 0))],
        "calf_r":     [(0, (0, 0, 0)), (10, (34, 0, 0)), (15, (30, 0, 0)), (26, (0, 0, 0))],
        "tail_01":    [(0, (0, 0, 0)), (10, (-20, 0, 0)), (26, (0, 0, 0))],
        "pelvis.loc": [(0, (0, 0, 0)), (10, (0, -0.075, 0)), (15, (0, -0.07, 0)), (26, (0, 0, 0))],
    }),
    "Bash": (24, False, {     # two-handed overhead smash, hangs at the top, lands hard ; contact frame = 12
        # past about -120 the arms swing through vertical and end up in front of the face, so stay under that
        "upperarm_r": [(0, (0, 0, 0)), (9, (-115, 0, -15)), (13, (70, 0, 5)), (24, (0, 0, 0))],
        "upperarm_l": [(0, (0, 0, 0)), (9, (-110, 0, 15)), (13, (60, 0, -5)), (24, (0, 0, 0))],
        "lowerarm_r": [(0, (0, 0, 0)), (9, (-45, 0, 0)), (13, (-5, 0, 0)), (24, (0, 0, 0))],
        "lowerarm_l": [(0, (0, 0, 0)), (9, (-40, 0, 0)), (13, (-5, 0, 0)), (24, (0, 0, 0))],
        # the camera looks down 45°, so torso pitch reads roughly double on screen: keep the fold shallow
        "spine_01":   [(0, (0, 0, 0)), (9, (-16, 0, 0)), (13, (15, 0, 0)), (18, (5, 0, 0)), (24, (0, 0, 0))],
        "head":       [(0, (0, 0, 0)), (9, (-10, 0, 0)), (13, (9, 0, 0)), (24, (0, 0, 0))],
        "thigh_l":    [(0, (0, 0, 0)), (9, (-8, 0, 0)), (13, (12, 0, 0)), (24, (0, 0, 0))],
        "thigh_r":    [(0, (0, 0, 0)), (9, (-8, 0, 0)), (13, (12, 0, 0)), (24, (0, 0, 0))],
        "pelvis.loc": [(0, (0, 0, 0)), (9, (0, 0.05, 0)), (13, (0, -0.035, 0)), (18, (0, 0, 0)), (24, (0, 0, 0))],
    }),
    "Whirl": (26, False, {    # full spin with the arm held out; the body turns twice as fast in the middle
        "pelvis":     [(0, (0, 0, 0)), (6, (0, 60, 0)), (13, (0, 200, 0)), (20, (0, 320, 0)), (26, (0, 360, 0))],
        "upperarm_r": [(0, (0, 0, 0)), (5, (-80, 0, -75)), (20, (-85, 0, -80)), (26, (0, 0, 0))],
        "upperarm_l": [(0, (0, 0, 0)), (5, (-70, 0, 70)), (20, (-75, 0, 75)), (26, (0, 0, 0))],
        "spine_01":   [(0, (0, 0, 0)), (6, (-10, 0, 0)), (20, (-10, 0, 0)), (26, (0, 0, 0))],
        "tail_01":    [(0, (0, 0, -30)), (13, (0, 0, 30)), (26, (0, 0, -30))],
        "pelvis.loc": [(0, (0, 0, 0)), (13, (0, 0.04, 0)), (26, (0, 0, 0))],
    }),
    # ranged: the bow sits in the left paw, the staff in the right (build_ranged_kit.py)
    "Shoot": (18, False, {    # raise the bow, draw to the cheek, loose on frame 9, recover
        "upperarm_l": [(0, (0, 0, 0)), (5, (-85, 0, 12)), (13, (-85, 0, 12)), (18, (0, 0, 0))],
        "lowerarm_l": [(0, (0, 0, 0)), (5, (-8, 0, 0)), (13, (-8, 0, 0)), (18, (0, 0, 0))],
        "upperarm_r": [(0, (0, 0, 0)), (5, (-80, 0, -30)), (8, (-75, 0, -48)), (10, (-82, 0, -20)), (18, (0, 0, 0))],
        "lowerarm_r": [(0, (0, 0, 0)), (5, (-40, 0, 0)), (8, (-110, 0, 0)), (10, (-30, 0, 0)), (18, (0, 0, 0))],
        "spine_01":   [(0, (0, 0, 0)), (5, (0, -14, 0)), (9, (0, -18, 0)), (11, (-4, -10, 0)), (18, (0, 0, 0))],
        "head":       [(0, (0, 0, 0)), (5, (0, 12, 0)), (13, (0, 12, 0)), (18, (0, 0, 0))],
        "pelvis.loc": [(0, (0, 0, 0)), (10, (0, 0.012, 0)), (18, (0, 0, 0))],
    }),
    "Zap": (20, False, {      # lift the staff, thrust the crystal at the target on frame 9
        "upperarm_r": [(0, (0, 0, 0)), (6, (-120, 0, -20)), (9, (-70, 0, -8)), (13, (-75, 0, -8)), (20, (0, 0, 0))],
        "lowerarm_r": [(0, (0, 0, 0)), (6, (-40, 0, 0)), (9, (-5, 0, 0)), (20, (0, 0, 0))],
        "upperarm_l": [(0, (0, 0, 0)), (6, (-45, 0, 20)), (9, (-70, 0, 25)), (20, (0, 0, 0))],
        "spine_01":   [(0, (0, 0, 0)), (6, (-8, 0, 0)), (9, (10, 0, 0)), (20, (0, 0, 0))],
        "head":       [(0, (0, 0, 0)), (6, (-6, 0, 0)), (9, (6, 0, 0)), (20, (0, 0, 0))],
        "pelvis.loc": [(0, (0, 0, 0)), (9, (0, -0.015, 0)), (20, (0, 0, 0))],
    }),
    "Volley": (24, False, {   # lean back, bow aimed at the sky, loose on frame 13
        "upperarm_l": [(0, (0, 0, 0)), (7, (-140, 0, 10)), (17, (-140, 0, 10)), (24, (0, 0, 0))],
        "upperarm_r": [(0, (0, 0, 0)), (7, (-130, 0, -25)), (11, (-120, 0, -45)), (14, (-135, 0, -15)), (24, (0, 0, 0))],
        "lowerarm_r": [(0, (0, 0, 0)), (7, (-40, 0, 0)), (11, (-105, 0, 0)), (14, (-25, 0, 0)), (24, (0, 0, 0))],
        "spine_01":   [(0, (0, 0, 0)), (7, (-14, -10, 0)), (13, (-18, -12, 0)), (16, (-8, 0, 0)), (24, (0, 0, 0))],
        "head":       [(0, (0, 0, 0)), (7, (-18, 0, 0)), (17, (-18, 0, 0)), (24, (0, 0, 0))],
        "thigh_l":    [(0, (0, 0, 0)), (7, (-12, 0, 0)), (17, (-12, 0, 0)), (24, (0, 0, 0))],
        "thigh_r":    [(0, (0, 0, 0)), (7, (10, 0, 0)), (17, (10, 0, 0)), (24, (0, 0, 0))],
    }),
    "Sit": (60, True, {       # plonked on the ground, legs out front, paws on the knees, slow breathing
        "pelvis.loc": [(0, (0, -0.16, 0)), (30, (0, -0.155, 0)), (60, (0, -0.16, 0))],
        "thigh_l":    [(0, (-82, 0, 12)), (60, (-82, 0, 12))], "thigh_r": [(0, (-82, 0, -12)), (60, (-82, 0, -12))],
        "calf_l":     [(0, (8, 0, 0)), (60, (8, 0, 0))], "calf_r": [(0, (8, 0, 0)), (60, (8, 0, 0))],
        "foot_l":     [(0, (-10, 0, 0)), (60, (-10, 0, 0))], "foot_r": [(0, (-10, 0, 0)), (60, (-10, 0, 0))],
        "spine_01":   [(0, (-6, 0, 0)), (30, (-3, 0, 0)), (60, (-6, 0, 0))],
        "head":       [(0, (4, 0, 3)), (30, (6, 0, -3)), (60, (4, 0, 3))],
        "upperarm_l": [(0, (-28, 0, 8)), (60, (-28, 0, 8))], "upperarm_r": [(0, (-28, 0, -8)), (60, (-28, 0, -8))],
        "lowerarm_l": [(0, (-20, 0, 0)), (60, (-20, 0, 0))], "lowerarm_r": [(0, (-20, 0, 0)), (60, (-20, 0, 0))],
        "tail_01":    [(0, (60, 0, -10)), (30, (60, 0, 10)), (60, (60, 0, -10))],
    }),
    "Ride": (16, True, {      # astride: thighs splayed wide down the flanks, shins hanging, paws forward on the reins; bobs with the gallop
        # thigh_l: -Z spreads outward (+Z crosses the legs); the shin folds back in so the paw hangs down the flank
        "thigh_l":    [(0, (-30, 0, -70)), (16, (-30, 0, -70))], "thigh_r": [(0, (-30, 0, 70)), (16, (-30, 0, 70))],
        "calf_l":     [(0, (20, 0, 45)), (16, (20, 0, 45))], "calf_r": [(0, (20, 0, -45)), (16, (20, 0, -45))],
        "upperarm_l": [(0, (-48, 0, 10)), (8, (-54, 0, 10)), (16, (-48, 0, 10))], "upperarm_r": [(0, (-48, 0, -10)), (8, (-54, 0, -10)), (16, (-48, 0, -10))],
        "lowerarm_l": [(0, (-35, 0, 0)), (16, (-35, 0, 0))], "lowerarm_r": [(0, (-35, 0, 0)), (16, (-35, 0, 0))],
        "spine_01":   [(0, (8, 0, 0)), (4, (4, 0, 0)), (8, (8, 0, 0)), (12, (4, 0, 0)), (16, (8, 0, 0))],
        "head":       [(0, (-6, 0, 0)), (8, (-2, 0, 0)), (16, (-6, 0, 0))],
        "tail_01":    [(0, (40, 0, 0)), (16, (40, 0, 0))],
        "pelvis.loc": [(0, (0, 0, 0)), (4, (0, 0.012, 0)), (8, (0, 0, 0)), (12, (0, 0.012, 0)), (16, (0, 0, 0))],
    }),
    "Cast": (30, False, {     # both arms up, hold, then lower — the heal glow rides frames 10-22
        "upperarm_r": [(0, (0, 0, 0)), (8, (-120, 0, -25)), (20, (-125, 0, -25)), (30, (0, 0, 0))],
        "upperarm_l": [(0, (0, 0, 0)), (8, (-120, 0, 25)), (20, (-125, 0, 25)), (30, (0, 0, 0))],
        "lowerarm_r": [(0, (0, 0, 0)), (8, (-35, 0, 0)), (20, (-35, 0, 0)), (30, (0, 0, 0))],
        "lowerarm_l": [(0, (0, 0, 0)), (8, (-35, 0, 0)), (20, (-35, 0, 0)), (30, (0, 0, 0))],
        "head":       [(0, (0, 0, 0)), (8, (-16, 0, 0)), (20, (-16, 0, 0)), (30, (0, 0, 0))],
        "spine_01":   [(0, (0, 0, 0)), (8, (-8, 0, 0)), (20, (-8, 0, 0)), (30, (0, 0, 0))],
        "ear_l":      [(0, (0, 0, 0)), (10, (-12, 0, 0)), (22, (6, 0, 0)), (30, (0, 0, 0))],
        "ear_r":      [(0, (0, 0, 0)), (10, (-12, 0, 0)), (22, (6, 0, 0)), (30, (0, 0, 0))],
        "pelvis.loc": [(0, (0, 0, 0)), (10, (0, 0.03, 0)), (22, (0, 0.03, 0)), (30, (0, 0, 0))],
    }),
    "Dash": (8, False, {
        "spine_01": [(0, (0, 0, 0)), (2, (28, 0, 0)), (8, (0, 0, 0))],
        "head":     [(0, (0, 0, 0)), (2, (-12, 0, 0)), (8, (0, 0, 0))],
        "upperarm_l": [(0, (0, 0, 0)), (2, (-60, 0, 0)), (8, (0, 0, 0))], "upperarm_r": [(0, (0, 0, 0)), (2, (-60, 0, 0)), (8, (0, 0, 0))],
        "ear_l": [(0, (0, 0, 0)), (2, (-30, 0, 0)), (8, (0, 0, 0))], "ear_r": [(0, (0, 0, 0)), (2, (-30, 0, 0)), (8, (0, 0, 0))],
    }),
}


# ---------------------------------------------------------------- four-legged set (wolves, foxes, boars, bears)
# Same skeleton, different posture: the pelvis pitches forward so the spine runs horizontal, the arms become front
# legs planted on the ground, and the head lifts back up to look ahead. Clips are prefixed "Q".
QUAD_BASE = {
    "pelvis":     (62, 0, 0),
    "spine_01":   (8, 0, 0),
    "neck_01":    (-30, 0, 0),
    "head":       (-42, 0, 0),
    "upperarm_l": (-58, 0, 0), "upperarm_r": (-58, 0, 0),
    "lowerarm_l": (-14, 0, 0), "lowerarm_r": (-14, 0, 0),
    "thigh_l":    (-60, 0, 0), "thigh_r": (-60, 0, 0),
    "calf_l":     (18, 0, 0), "calf_r": (18, 0, 0),
    "foot_l":     (14, 0, 0), "foot_r": (14, 0, 0),
    "tail_01":    (-35, 0, 0),
}
QUAD_LOC = (0, -0.145, 0)   # drop the hips so the paws reach the floor in the pitched pose


def quad(extra=None, length=30, loop=True, loc=None):
    """A quadruped clip: the standing pose plus per-bone offsets keyed over time."""
    keys = {b: [(0, r), (length, r)] for b, r in QUAD_BASE.items()}
    keys["pelvis.loc"] = [(0, loc or QUAD_LOC), (length, loc or QUAD_LOC)]
    for bone, frames in (extra or {}).items():
        if bone.endswith(".loc"):
            base = loc or QUAD_LOC
            keys[bone] = [(f, tuple(base[i] + v[i] for i in range(3))) for f, v in frames]
        else:
            base = QUAD_BASE.get(bone, (0, 0, 0))
            keys[bone] = [(f, tuple(base[i] + v[i] for i in range(3))) for f, v in frames]
    return (length, loop, keys)


QUAD_CLIPS = {
    "QIdle": quad({
        "spine_01": [(0, (0, 0, 0)), (15, (2, 0, 0)), (30, (0, 0, 0))],
        "head":     [(0, (0, 0, 0)), (12, (0, 3, 0)), (24, (0, -3, 0)), (30, (0, 0, 0))],
        "tail_01":  [(0, (0, 0, -12)), (15, (0, 0, 12)), (30, (0, 0, -12))],
        "ear_l":    [(0, (0, 0, 0)), (15, (5, 0, 0)), (30, (0, 0, 0))], "ear_r": [(0, (0, 0, 0)), (15, (5, 0, 0)), (30, (0, 0, 0))],
        "pelvis.loc": [(0, (0, 0, 0)), (15, (0, 0.008, 0)), (30, (0, 0, 0))],
    }),
    "QRun": quad({          # diagonal gait: front-left with back-right
        "upperarm_l": [(0, (28, 0, 0)), (8, (-26, 0, 0)), (16, (28, 0, 0))],
        "upperarm_r": [(0, (-26, 0, 0)), (8, (28, 0, 0)), (16, (-26, 0, 0))],
        "lowerarm_l": [(0, (-12, 0, 0)), (8, (10, 0, 0)), (16, (-12, 0, 0))],
        "lowerarm_r": [(0, (10, 0, 0)), (8, (-12, 0, 0)), (16, (10, 0, 0))],
        "thigh_l":    [(0, (-24, 0, 0)), (8, (26, 0, 0)), (16, (-24, 0, 0))],
        "thigh_r":    [(0, (26, 0, 0)), (8, (-24, 0, 0)), (16, (26, 0, 0))],
        "calf_l":     [(0, (14, 0, 0)), (8, (-10, 0, 0)), (16, (14, 0, 0))],
        "calf_r":     [(0, (-10, 0, 0)), (8, (14, 0, 0)), (16, (-10, 0, 0))],
        "spine_01":   [(0, (-4, 0, 0)), (8, (4, 0, 0)), (16, (-4, 0, 0))],
        "head":       [(0, (2, 0, 0)), (8, (-3, 0, 0)), (16, (2, 0, 0))],
        "tail_01":    [(0, (0, 0, -18)), (4, (0, 0, 18)), (8, (0, 0, -18)), (12, (0, 0, 18)), (16, (0, 0, -18))],
        "pelvis.loc": [(0, (0, 0, 0)), (4, (0, 0.035, 0)), (8, (0, 0, 0)), (12, (0, 0.035, 0)), (16, (0, 0, 0))],
    }, length=16),
    "QAttack": quad({       # rear back, then lunge and snap ; contact frame = 9
        "pelvis":     [(0, (0, 0, 0)), (6, (-16, 0, 0)), (10, (10, 0, 0)), (20, (0, 0, 0))],
        "head":       [(0, (0, 0, 0)), (6, (-14, 0, 0)), (10, (22, 0, 0)), (20, (0, 0, 0))],
        "neck_01":    [(0, (0, 0, 0)), (6, (-10, 0, 0)), (10, (14, 0, 0)), (20, (0, 0, 0))],
        "upperarm_l": [(0, (0, 0, 0)), (6, (-30, 0, 0)), (10, (16, 0, 0)), (20, (0, 0, 0))],
        "upperarm_r": [(0, (0, 0, 0)), (6, (-30, 0, 0)), (10, (16, 0, 0)), (20, (0, 0, 0))],
        "pelvis.loc": [(0, (0, 0, 0)), (6, (0, 0.03, -0.04)), (10, (0, 0, 0.06)), (20, (0, 0, 0))],
    }, length=20, loop=False),
    "QHit": quad({
        "spine_01": [(0, (0, 0, 0)), (3, (-14, 0, 8)), (10, (0, 0, 0))],
        "head":     [(0, (0, 0, 0)), (3, (-16, 0, -10)), (10, (0, 0, 0))],
        "pelvis.loc": [(0, (0, 0, 0)), (3, (0, 0, 0.05)), (10, (0, 0, 0))],
    }, length=10, loop=False),
    "QDeath": quad({        # legs fold, body rolls onto its side
        "pelvis":     [(0, (0, 0, 0)), (14, (0, 0, -70)), (24, (0, 0, -80))],
        "thigh_l":    [(0, (0, 0, 0)), (24, (35, 0, 0))], "thigh_r": [(0, (0, 0, 0)), (24, (30, 0, 0))],
        "upperarm_l": [(0, (0, 0, 0)), (24, (30, 0, 0))], "upperarm_r": [(0, (0, 0, 0)), (24, (25, 0, 0))],
        "head":       [(0, (0, 0, 0)), (24, (10, 0, 18))],
        "pelvis.loc": [(0, (0, 0, 0)), (14, (0, -0.06, 0)), (24, (0, -0.08, 0))],
    }, length=24, loop=False),
}
CLIPS.update(QUAD_CLIPS)


def key_clip(arm, name, length, loop, keys):
    action = bpy.data.actions.new(name)
    arm.animation_data.action = action
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"; pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
    for bone, frames in keys.items():
        if bone.endswith(".loc"):
            pb = arm.pose.bones[bone[:-4]]
            for f, loc in frames:
                pb.location = loc; pb.keyframe_insert("location", frame=f)
        else:
            pb = arm.pose.bones[bone]
            for f, rot in frames:
                pb.rotation_euler = Euler([math.radians(a) for a in rot]); pb.keyframe_insert("rotation_euler", frame=f)
    # bones without keys still need a rest key so every clip fully overrides the previous pose
    for pb in arm.pose.bones:
        # rotation rest key even when only ".loc" is keyed: otherwise a clip that bobs the pelvis inherits whatever
        # rotation the previous clip left (a Shoot after a Whirl played facing backwards)
        if pb.name not in keys and not pb.name.startswith("socket_"):
            pb.rotation_euler = (0, 0, 0); pb.keyframe_insert("rotation_euler", frame=0); pb.keyframe_insert("rotation_euler", frame=length)
    action.use_frame_range = True; action.frame_start = 0; action.frame_end = length
    action.use_cyclic = loop
    return action


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    parts, arm, bones = shiba.build_character()          # Shiba = pose-check model; the clips target bone names only
    arm.animation_data_create()
    actions = {n: key_clip(arm, n, *spec) for n, spec in CLIPS.items()}
    # stash every action as an NLA strip so the glTF exporter emits one animation per action
    for n, act in actions.items():
        tr = arm.animation_data.nla_tracks.new(); tr.name = n; st = tr.strips.new(n, 0, act)
        if getattr(act, "slots", None) and hasattr(st, "action_slot"): st.action_slot = act.slots[0]   # Blender 4.4+ slotted actions
    arm.animation_data.action = None
    bpy.context.scene.render.fps = FPS

    # export armature-only GLB with all clips
    bpy.ops.object.select_all(action="DESELECT"); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, "anims.glb"), export_format="GLB", use_selection=True,
                              export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True,
                              export_frame_range=False, export_anim_slide_to_zero=True, export_yup=True, export_skins=False, export_apply=False)

    # pose sheet: 2 frames of each clip on the Shiba
    shoot = shiba.setup_render(out_dir); bpy.context.scene.cycles.samples = 12; bpy.context.scene.render.resolution_x = bpy.context.scene.render.resolution_y = 384
    for n, (length, loop, _) in CLIPS.items():
        for t in arm.animation_data.nla_tracks: t.mute = True
        arm.animation_data.action = actions[n]
        if getattr(actions[n], "slots", None): arm.animation_data.action_slot = actions[n].slots[0]   # 4.4+: action needs its slot to evaluate
        for f in (int(length * 0.3), int(length * 0.65)):
            bpy.context.scene.frame_set(f); shoot(f"pose_{n}_{f:02d}.png", (0.9, -2.2, 1.0))
    from PIL import Image
    imgs = [Image.open(os.path.join(out_dir, f"pose_{n}_{f:02d}.png")).convert("RGB") for n, (l, _, _) in CLIPS.items() for f in (int(l * 0.3), int(l * 0.65))]
    sheet = Image.new("RGB", (384 * 2, 384 * len(CLIPS)), (245, 245, 245))
    for i, im in enumerate(imgs): sheet.paste(im, ((i % 2) * 384, (i // 2) * 384))
    sheet.save(os.path.join(out_dir, "anim_sheet.png"))
    for n, (l, _, _) in CLIPS.items():
        for f in (int(l * 0.3), int(l * 0.65)): os.remove(os.path.join(out_dir, f"pose_{n}_{f:02d}.png"))
    print("OK clips", list(CLIPS), "->", os.path.join(out_dir, "anims.glb"), os.path.getsize(os.path.join(out_dir, "anims.glb")) // 1024, "KB")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    main(os.path.abspath(argv[0] if argv else "out_anim"))
