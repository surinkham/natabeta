"""W4 characters on the shared SK_BK_Chibi skeleton + the horse mount (static), textured like the Dog Knight.

    .venv/bin/python build_beasts.py [out_dir] [--only cat,mouse,wolf,alpha,horse] [--size 512]

Outputs (out_dir): <name>.glb (armature + parts [+ knight armour set for the player races], 512px JPEG textures),
                   <name>.blend, preview_<name>.png, textures/T_<part>_<pass>.png
Races (cat, mouse) carry the same SK_Knight_* gear meshes as the Dog Knight so `equip_visuals.json` works unchanged.
Fur base is the knight's TAN so the in-game fur tint ratio (actors/visuals.ts) gives the same colours on every race.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

import build_dog_knight as knight
import build_shiba_chibi as shiba
import build_shiba_gear as gear
import texture_pass as tp
import feline_mesh
import quad_chibi

TAN, WHITE, BROWN, DARK, PINK, BLACK = knight.TAN, knight.WHITE, knight.BROWN, knight.DARK, knight.PINK, knight.BLACK
GREY, GREY_LT, GREY_DK = (0.46, 0.47, 0.52), (0.80, 0.80, 0.82), (0.30, 0.30, 0.35)
ALPHA, ALPHA_LT = (0.20, 0.19, 0.24), (0.36, 0.33, 0.40)
CHESTNUT, MANE = (0.55, 0.36, 0.20), (0.24, 0.15, 0.09)
FOX, BOAR, BOAR_LT, BOAR_DK = (0.82, 0.38, 0.14), (0.40, 0.31, 0.26), (0.62, 0.53, 0.46), (0.25, 0.20, 0.17)
CAP, STALK = (0.72, 0.16, 0.14), (0.93, 0.88, 0.76)
BEAR, BEAR_LT, BEAR_DK = (0.36, 0.25, 0.18), (0.58, 0.46, 0.35), (0.22, 0.15, 0.11)
SLIME, SLIME_LT, SLIME_DK = (0.33, 0.72, 0.55), (0.62, 0.92, 0.72), (0.18, 0.46, 0.36)
BARK, BARK_LT, BARK_DK, MOSS, LEAF, LEAF_GLOW = (0.38, 0.28, 0.19), (0.55, 0.43, 0.30), (0.24, 0.17, 0.11), (0.34, 0.48, 0.24), (0.30, 0.55, 0.22), (0.72, 0.95, 0.35)
GREEN, AMBER, RED_EYE = (0.35, 0.62, 0.25), (0.88, 0.62, 0.12), (0.85, 0.12, 0.10)

ARMS = shiba.VOLUMES["SK_Shiba_Body"]


def eyes(iris, pupil_w=0.024, y=-0.196):
    """Sclera/iris/pupil/highlights, mirrored by add_face_detail."""
    return [
        (WHITE, (0.10, y, 0.64), (0.05, 0.014, 0.066), 0), (iris, (0.102, y - 0.008, 0.635), (0.040, 0.012, 0.056), 0),
        (BLACK, (0.104, y - 0.015, 0.632), (pupil_w, 0.010, 0.034), 0), (WHITE, (0.088, y - 0.02, 0.658), (0.014, 0.006, 0.017), 1),
    ]


WHISKERS = [(WHITE, (0.20, -0.17, 0.545 + dz), (0.075, 0.004, 0.004), 0) for dz in (-0.02, 0.0, 0.02)]

CHARS = {
    "cat": dict(
        bones={"ear_l": ((0.14, 0, 0.78), (0.19, 0, 0.88), "head")},
        vols={"SK_Cat_Head": [("ell", (0, 0, 0.60), (0.245, 0.225, 0.205), (0, 0, 0)), ("ell", (0, -0.18, 0.535), (0.075, 0.055, 0.045), (0, 0, 0)), ("ell", (0.155, -0.10, 0.55), (0.08, 0.07, 0.065), (0, 0, 0))],
              "SK_Cat_Body": ARMS,
              "SK_Cat_Ears": [("ell", (0.15, 0.0, 0.79), (0.065, 0.03, 0.075), (0, 25, 0)), ("ell", (0.195, 0.0, 0.87), (0.026, 0.02, 0.045), (0, 25, 0))],
              "SK_Cat_Tail": [("cap", (0, 0.10, 0.30), (0, 0.22, 0.40), 0.032), ("cap", (0, 0.22, 0.40), (0, 0.15, 0.56), 0.028), ("ell", (0, 0.13, 0.58), (0.03, 0.03, 0.035), (0, 0, 0))]},
        marks={"SK_Cat_Head": [(WHITE, (0, -0.21, 0.55), (0.15, 0.10, 0.10)), (BROWN, (0, 0.02, 0.80), (0.02, 0.14, 0.05)), (BROWN, (0.07, 0.03, 0.79), (0.018, 0.12, 0.05)), (TAN, (0.11, -0.16, 0.66), (0.075, 0.09, 0.075))],
               "SK_Cat_Body": [(WHITE, (0, -0.11, 0.28), (0.11, 0.06, 0.14)), (WHITE, (0.20, -0.03, 0.225), (0.075, 0.075, 0.065)), (WHITE, (0.075, -0.04, 0.045), (0.08, 0.10, 0.055)), (BROWN, (0, 0.10, 0.36), (0.14, 0.03, 0.02)), (BROWN, (0, 0.11, 0.30), (0.14, 0.03, 0.02))],
               "SK_Cat_Ears": [(PINK, (0.155, -0.012, 0.79), (0.035, 0.02, 0.05))],
               "SK_Cat_Tail": [(BROWN, (0, 0.22, 0.40), (0.05, 0.05, 0.03)), (BROWN, (0, 0.13, 0.58), (0.05, 0.05, 0.05))]},
        face=eyes(GREEN, pupil_w=0.012) + [(PINK, (0, -0.262, 0.565), (0.022, 0.014, 0.014), 0), (DARK, (0.014, -0.255, 0.535), (0.016, 0.006, 0.006), 0)] + WHISKERS,
        base=TAN, budgets={"SK_Cat_Head": 2600, "SK_Cat_Body": 2400, "SK_Cat_Ears": 600, "SK_Cat_Tail": 500}, armour=True),
    "mouse": dict(
        bones={"ear_l": ((0.17, 0.02, 0.75), (0.23, 0.02, 0.85), "head")},
        vols={"SK_Mouse_Head": [("ell", (0, 0, 0.60), (0.235, 0.225, 0.205), (0, 0, 0)), ("ell", (0, -0.20, 0.55), (0.10, 0.10, 0.065), (0, 0, 0)), ("ell", (0, -0.28, 0.53), (0.045, 0.04, 0.035), (0, 0, 0))],
              "SK_Mouse_Body": ARMS,
              "SK_Mouse_Ears": [("ell", (0.21, 0.03, 0.78), (0.09, 0.028, 0.095), (0, 20, 0))],
              "SK_Mouse_Tail": [("cap", (0, 0.08, 0.27), (0, 0.28, 0.29), 0.018), ("cap", (0, 0.28, 0.29), (0, 0.42, 0.40), 0.014)]},
        marks={"SK_Mouse_Head": [(WHITE, (0, -0.23, 0.55), (0.14, 0.12, 0.09)), (TAN, (0.11, -0.16, 0.66), (0.075, 0.09, 0.075))],
               "SK_Mouse_Body": [(WHITE, (0, -0.11, 0.28), (0.11, 0.06, 0.14)), (WHITE, (0.20, -0.03, 0.225), (0.075, 0.075, 0.065)), (WHITE, (0.075, -0.04, 0.045), (0.08, 0.10, 0.055))],
               "SK_Mouse_Ears": [(PINK, (0.215, 0.01, 0.78), (0.06, 0.02, 0.065))],
               "SK_Mouse_Tail": [(PINK, (0, 0.3, 0.33), (0.3, 0.3, 0.3))]},
        face=[(WHITE, (0.10, -0.196, 0.64), (0.045, 0.014, 0.06), 0), (BLACK, (0.102, -0.206, 0.638), (0.036, 0.012, 0.05), 0), (WHITE, (0.088, -0.218, 0.658), (0.014, 0.006, 0.017), 1),
              (PINK, (0, -0.318, 0.535), (0.022, 0.016, 0.016), 0), (WHITE, (0.011, -0.30, 0.505), (0.009, 0.006, 0.014), 0)] + WHISKERS,
        base=TAN, budgets={"SK_Mouse_Head": 2600, "SK_Mouse_Body": 2400, "SK_Mouse_Ears": 700, "SK_Mouse_Tail": 400}, armour=True),
    "wolf": dict(
        bones={},
        vols={"SK_Wolf_Head": [("ell", (0, 0, 0.60), (0.245, 0.23, 0.21), (0, 0, 0)), ("ell", (0, -0.22, 0.545), (0.11, 0.10, 0.07), (0, 0, 0)), ("ell", (0.155, -0.10, 0.55), (0.08, 0.07, 0.06), (0, 0, 0)), ("ell", (0, 0.06, 0.72), (0.12, 0.12, 0.05), (0, 0, 0))],
              "SK_Wolf_Body": [("ell", (0, 0, 0.31), (0.14, 0.12, 0.14), (0, 0, 0))] + ARMS[1:],
              "SK_Wolf_Ears": [("ell", (0.14, 0.01, 0.80), (0.07, 0.036, 0.07), (0, 28, 0)), ("ell", (0.175, 0.01, 0.88), (0.03, 0.024, 0.05), (0, 28, 0))],
              "SK_Wolf_Tail": [("ell", (0, 0.10, 0.34), (0.06, 0.06, 0.06), (0, 0, 0)), ("ell", (0, 0.17, 0.41), (0.06, 0.06, 0.06), (0, 0, 0)), ("ell", (0, 0.18, 0.49), (0.055, 0.055, 0.055), (0, 0, 0)), ("ell", (0, 0.12, 0.53), (0.045, 0.045, 0.045), (0, 0, 0))]},
        marks={"SK_Wolf_Head": [(GREY_LT, (0, -0.24, 0.55), (0.15, 0.12, 0.10)), (GREY_DK, (0, 0.04, 0.74), (0.18, 0.16, 0.08)), (GREY_DK, (0.10, -0.15, 0.68), (0.06, 0.08, 0.05))],
               "SK_Wolf_Body": [(GREY_LT, (0, -0.12, 0.28), (0.11, 0.06, 0.15)), (GREY_DK, (0, 0.10, 0.34), (0.15, 0.06, 0.12))],
               "SK_Wolf_Ears": [(GREY_LT, (0.15, -0.012, 0.815), (0.035, 0.02, 0.05))],
               "SK_Wolf_Tail": [(GREY_LT, (0, 0.13, 0.36), (0.07, 0.07, 0.04))]},
        face=eyes(AMBER, pupil_w=0.018, y=-0.19) + [(BLACK, (0, -0.325, 0.565), (0.032, 0.022, 0.024), 0), (DARK, (0, -0.31, 0.51), (0.05, 0.010, 0.020), 0), (WHITE, (0.028, -0.31, 0.505), (0.008, 0.006, 0.016), 0)],
        base=GREY, budgets={"SK_Wolf_Head": 2800, "SK_Wolf_Body": 2400, "SK_Wolf_Ears": 600, "SK_Wolf_Tail": 700}, armour=False),
}
CHARS["fox"] = dict(
    bones={"ear_l": ((0.13, 0, 0.79), (0.20, 0, 0.92), "head")},
    vols={"SK_Fox_Head": [("ell", (0, 0, 0.60), (0.235, 0.225, 0.20), (0, 0, 0)), ("ell", (0, -0.22, 0.545), (0.085, 0.10, 0.06), (0, 0, 0)), ("ell", (0.15, -0.10, 0.55), (0.075, 0.07, 0.06), (0, 0, 0))],
          "SK_Fox_Body": ARMS,
          "SK_Fox_Ears": [("ell", (0.145, 0.0, 0.80), (0.055, 0.028, 0.085), (0, 18, 0)), ("ell", (0.185, 0.0, 0.90), (0.022, 0.018, 0.04), (0, 18, 0))],
          "SK_Fox_Tail": [("ell", (0, 0.11, 0.33), (0.07, 0.07, 0.07), (0, 0, 0)), ("ell", (0, 0.19, 0.40), (0.075, 0.075, 0.075), (0, 0, 0)), ("ell", (0, 0.22, 0.49), (0.065, 0.065, 0.065), (0, 0, 0)), ("ell", (0, 0.18, 0.56), (0.045, 0.045, 0.045), (0, 0, 0))]},
    marks={"SK_Fox_Head": [(WHITE, (0, -0.25, 0.54), (0.12, 0.12, 0.09)), (DARK, (0, -0.30, 0.545), (0.05, 0.05, 0.05)), (DARK, (0.145, 0.0, 0.87), (0.06, 0.05, 0.06))],
           "SK_Fox_Body": [(WHITE, (0, -0.12, 0.27), (0.10, 0.06, 0.14)), (DARK, (0.20, -0.03, 0.20), (0.075, 0.075, 0.06)), (DARK, (0.075, -0.04, 0.04), (0.08, 0.10, 0.05))],
           "SK_Fox_Ears": [(DARK, (0.19, 0.0, 0.91), (0.05, 0.05, 0.05))],
           "SK_Fox_Tail": [(WHITE, (0, 0.18, 0.57), (0.06, 0.06, 0.06))]},
    face=eyes(AMBER, pupil_w=0.010, y=-0.19) + [(BLACK, (0, -0.325, 0.56), (0.028, 0.02, 0.02), 0), (DARK, (0, -0.305, 0.515), (0.04, 0.010, 0.016), 0)] + WHISKERS,
    base=FOX, budgets={"SK_Fox_Head": 2600, "SK_Fox_Body": 2400, "SK_Fox_Ears": 600, "SK_Fox_Tail": 800}, armour=False)

CHARS["boar"] = dict(
    bones={"ear_l": ((0.15, 0.02, 0.74), (0.20, 0.04, 0.82), "head")},
    # the snout has to reach well clear of the head metaball or the whole thing fuses into a bear cub
    vols={"SK_Boar_Head": [("ell", (0, 0, 0.59), (0.225, 0.205, 0.19), (0, 0, 0)), ("ell", (0, -0.235, 0.50), (0.10, 0.125, 0.08), (0, 0, 0)), ("ell", (0, -0.34, 0.495), (0.075, 0.05, 0.06), (0, 0, 0)),
                           ("cap", (0.062, -0.30, 0.45), (0.085, -0.35, 0.56), 0.016)],                                       # tusks curving up past the snout
          "SK_Boar_Body": [("ell", (0, 0, 0.30), (0.155, 0.135, 0.145), (0, 0, 0)), ("ell", (0, 0.02, 0.40), (0.115, 0.10, 0.07), (0, 0, 0))] + ARMS[1:],   # humped shoulders
          "SK_Boar_Ears": [("ell", (0.16, 0.03, 0.76), (0.05, 0.025, 0.06), (0, 25, 0))],
          "SK_Boar_Tail": [("cap", (0, 0.11, 0.31), (0, 0.16, 0.38), 0.022), ("ell", (0, 0.15, 0.41), (0.03, 0.03, 0.03), (0, 0, 0))]},
    marks={"SK_Boar_Head": [(BOAR_LT, (0, -0.27, 0.49), (0.12, 0.13, 0.085)), (WHITE, (0.075, -0.33, 0.51), (0.035, 0.07, 0.09)), (BOAR_DK, (0, 0.06, 0.70), (0.2, 0.14, 0.07))],
           "SK_Boar_Body": [(BOAR_DK, (0, 0.02, 0.42), (0.16, 0.14, 0.08)), (BOAR_LT, (0, -0.13, 0.27), (0.10, 0.06, 0.12)), (DARK, (0.075, -0.04, 0.035), (0.08, 0.10, 0.045))],
           "SK_Boar_Ears": [(BOAR_DK, (0.16, 0.03, 0.76), (0.08, 0.08, 0.08))],
           "SK_Boar_Tail": [(BOAR_DK, (0, 0.15, 0.41), (0.05, 0.05, 0.05))]},
    face=eyes(RED_EYE, pupil_w=0.012, y=-0.175) + [(BLACK, (0.03, -0.375, 0.50), (0.014, 0.02, 0.014), 0), (DARK, (0, -0.335, 0.455), (0.05, 0.012, 0.018), 0)],
    base=BOAR, budgets={"SK_Boar_Head": 2800, "SK_Boar_Body": 2600, "SK_Boar_Ears": 500, "SK_Boar_Tail": 400}, armour=False)

# Shroomling: a walking mushroom — cap instead of a head, no ears or tail, so its parts list is just Head + Body.
CHARS["shroom"] = dict(
    bones={},
    # the cap must not overhang the face, or the eyes end up in shadow behind its brim
    vols={"SK_Shroom_Head": [("ell", (0, 0.01, 0.655), (0.245, 0.245, 0.115), (0, 0, 0)), ("ell", (0, -0.02, 0.555), (0.165, 0.16, 0.115), (0, 0, 0))],
          "SK_Shroom_Body": [("ell", (0, 0, 0.33), (0.125, 0.115, 0.15), (0, 0, 0))] + ARMS[1:]},
    marks={"SK_Shroom_Head": [(CAP, (0, 0.01, 0.675), (0.26, 0.26, 0.09)), (WHITE, (0.12, -0.08, 0.70), (0.05, 0.05, 0.045)), (WHITE, (-0.14, 0.06, 0.70), (0.045, 0.045, 0.04)), (WHITE, (0.03, 0.15, 0.70), (0.045, 0.045, 0.04)), (STALK, (0, -0.05, 0.545), (0.15, 0.15, 0.10))],
           "SK_Shroom_Body": [(STALK, (0, 0, 0.33), (0.2, 0.2, 0.2))]},
    # face spheres have to poke through the head surface (front face sits at y ≈ -0.18), not sit inside it
    face=[(WHITE, (0.068, -0.178, 0.565), (0.042, 0.016, 0.046), 0), (BLACK, (0.070, -0.188, 0.563), (0.030, 0.012, 0.034), 0), (WHITE, (0.056, -0.196, 0.578), (0.013, 0.006, 0.014), 1),
          (DARK, (0, -0.192, 0.520), (0.034, 0.010, 0.012), 0)],
    base=STALK, budgets={"SK_Shroom_Head": 2200, "SK_Shroom_Body": 2200}, armour=False)

# Grove Bear: the heavy of the Dark Forest — broad shoulders, small round ears, blunt muzzle.
CHARS["bear"] = dict(
    bones={"ear_l": ((0.14, 0, 0.78), (0.18, 0, 0.86), "head")},
    vols={"SK_Bear_Head": [("ell", (0, 0, 0.60), (0.26, 0.24, 0.225), (0, 0, 0)), ("ell", (0, -0.235, 0.545), (0.105, 0.09, 0.075), (0, 0, 0)), ("ell", (0.165, -0.09, 0.55), (0.085, 0.075, 0.07), (0, 0, 0))],
          "SK_Bear_Body": [("ell", (0, 0, 0.31), (0.175, 0.15, 0.16), (0, 0, 0)), ("ell", (0, 0.03, 0.42), (0.13, 0.11, 0.075), (0, 0, 0))] + ARMS[1:],
          "SK_Bear_Ears": [("ell", (0.15, 0, 0.80), (0.055, 0.03, 0.055), (0, 0, 0))],
          "SK_Bear_Tail": [("ell", (0, 0.12, 0.30), (0.035, 0.035, 0.035), (0, 0, 0))]},
    marks={"SK_Bear_Head": [(BEAR_LT, (0, -0.26, 0.545), (0.11, 0.10, 0.08)), (BEAR_DK, (0, 0.06, 0.70), (0.22, 0.16, 0.08))],
           "SK_Bear_Body": [(BEAR_LT, (0, -0.14, 0.30), (0.11, 0.06, 0.13)), (BEAR_DK, (0, 0.03, 0.44), (0.18, 0.14, 0.09)), (DARK, (0.075, -0.04, 0.035), (0.085, 0.10, 0.05))],
           "SK_Bear_Ears": [(BEAR_LT, (0.15, -0.012, 0.80), (0.035, 0.02, 0.035))],
           "SK_Bear_Tail": [(BEAR_DK, (0, 0.12, 0.30), (0.05, 0.05, 0.05))]},
    face=eyes(AMBER, pupil_w=0.014, y=-0.20) + [(BLACK, (0, -0.325, 0.56), (0.034, 0.024, 0.026), 0), (DARK, (0, -0.305, 0.508), (0.05, 0.012, 0.018), 0)],
    base=BEAR, budgets={"SK_Bear_Head": 2800, "SK_Bear_Body": 2600, "SK_Bear_Ears": 500, "SK_Bear_Tail": 400}, armour=False)

# Slime: one jelly dome, no limbs to speak of — the rig's arms and legs stay tucked inside the blob.
CHARS["slime"] = dict(
    bones={},
    vols={"SK_Slime_Head": [("ell", (0, 0, 0.30), (0.30, 0.29, 0.255), (0, 0, 0)), ("ell", (0, -0.04, 0.10), (0.33, 0.32, 0.075), (0, 0, 0)), ("ell", (0.10, -0.06, 0.44), (0.055, 0.05, 0.05), (0, 0, 0))],
          "SK_Slime_Body": [("ell", (0, 0, 0.16), (0.16, 0.15, 0.12), (0, 0, 0))]},
    marks={"SK_Slime_Head": [(SLIME_LT, (0, -0.10, 0.36), (0.22, 0.16, 0.16)), (SLIME_DK, (0, 0, 0.08), (0.36, 0.36, 0.06)), (WHITE, (0.11, -0.16, 0.40), (0.05, 0.05, 0.05))],
           "SK_Slime_Body": [(SLIME_DK, (0, 0, 0.16), (0.2, 0.2, 0.2))]},
    # the dome's front surface sits at y ≈ -0.29, so the face has to be pushed out past it
    face=[(WHITE, (0.085, -0.272, 0.32), (0.058, 0.022, 0.064), 0), (BLACK, (0.088, -0.284, 0.318), (0.040, 0.016, 0.044), 0), (WHITE, (0.068, -0.294, 0.340), (0.017, 0.008, 0.018), 1),
          (DARK, (0, -0.292, 0.250), (0.048, 0.014, 0.018), 0)],
    base=SLIME, budgets={"SK_Slime_Head": 2400, "SK_Slime_Body": 900}, armour=False)

# Living Stump: bark barrel, root feet, branch arms and a leaf crown — the Dark Forest's ambusher.
CHARS["stump"] = dict(
    bones={"ear_l": ((0.12, 0, 0.72), (0.22, 0.02, 0.86), "head")},
    vols={"SK_Stump_Head": [("ell", (0, 0, 0.58), (0.215, 0.205, 0.20), (0, 0, 0)), ("ell", (0, 0, 0.70), (0.185, 0.18, 0.06), (0, 0, 0))],
          "SK_Stump_Body": [("ell", (0, 0, 0.30), (0.175, 0.165, 0.17), (0, 0, 0)), ("cap", (0.145, 0, 0.40), (0.215, -0.05, 0.235), 0.045), ("ell", (0.215, -0.05, 0.215), (0.06, 0.06, 0.055), (0, 0, 0)),
                            ("cap", (0.085, 0, 0.17), (0.09, 0, 0.055), 0.055), ("ell", (0.09, -0.04, 0.04), (0.075, 0.095, 0.045), (0, 0, 0))],
          "SK_Stump_Ears": [("ell", (0.15, 0.01, 0.78), (0.10, 0.075, 0.055), (0, 25, 0)), ("ell", (0.04, 0.10, 0.80), (0.085, 0.07, 0.05), (0, 15, 0))],
          "SK_Stump_Tail": [("cap", (0, 0.13, 0.30), (0, 0.20, 0.42), 0.028)]},
    marks={"SK_Stump_Head": [(MOSS, (0, 0, 0.71), (0.22, 0.22, 0.05)), (BARK_LT, (0, -0.17, 0.57), (0.11, 0.08, 0.11)), (BARK_DK, (0.13, 0.10, 0.58), (0.06, 0.12, 0.20))],
           "SK_Stump_Body": [(BARK_LT, (0, -0.15, 0.30), (0.10, 0.08, 0.12)), (BARK_DK, (0.12, 0.09, 0.30), (0.06, 0.10, 0.22)), (MOSS, (0, 0, 0.455), (0.22, 0.22, 0.05))],
           "SK_Stump_Ears": [(LEAF, (0.13, 0.03, 0.79), (0.18, 0.18, 0.12))],
           "SK_Stump_Tail": [(BARK_DK, (0, 0.18, 0.38), (0.08, 0.10, 0.12))]},
    face=eyes(LEAF_GLOW, pupil_w=0.012, y=-0.175) + [(DARK, (0, -0.20, 0.505), (0.05, 0.014, 0.020), 0)],
    base=BARK, budgets={"SK_Stump_Head": 2400, "SK_Stump_Body": 2800, "SK_Stump_Ears": 900, "SK_Stump_Tail": 400}, armour=False)

# Alpha Wolf: the wolf shapes, dark coat, red eyes, mane spikes and a scar; scaled 1.6x in-game
CHARS["alpha"] = dict(CHARS["wolf"], base=ALPHA,
    vols={**CHARS["wolf"]["vols"], "SK_Wolf_Head": CHARS["wolf"]["vols"]["SK_Wolf_Head"] + [("ell", (0.06, 0.12, 0.76), (0.05, 0.06, 0.10), (0, -20, 0)), ("ell", (0, 0.16, 0.70), (0.05, 0.07, 0.11), (0, 0, 0))],
          "SK_Wolf_Body": CHARS["wolf"]["vols"]["SK_Wolf_Body"] + [("ell", (0.07, 0.12, 0.42), (0.04, 0.05, 0.08), (0, 0, 0))]},
    marks={"SK_Wolf_Head": [(ALPHA_LT, (0, -0.24, 0.55), (0.15, 0.12, 0.10)), (PINK, (-0.10, -0.17, 0.67), (0.012, 0.09, 0.09))],
           "SK_Wolf_Body": [(ALPHA_LT, (0, -0.12, 0.28), (0.11, 0.06, 0.15))], "SK_Wolf_Ears": [(ALPHA_LT, (0.15, -0.012, 0.815), (0.035, 0.02, 0.05))], "SK_Wolf_Tail": [(ALPHA_LT, (0, 0.13, 0.36), (0.07, 0.07, 0.04))]},
    face=eyes(RED_EYE, pupil_w=0.016, y=-0.19) + CHARS["wolf"]["face"][4:])


# Night Bat: the chibi skeleton with the arms turned into wings — membranes hang off the arm and hand, so the Attack
# clip reads as a wing beat. Big ears, tiny snout and fangs; flies in-game (the client lifts it off the ground).
BAT, BAT_LT, WING, WING_DK = (0.30, 0.22, 0.30), (0.52, 0.40, 0.50), (0.46, 0.30, 0.42), (0.28, 0.16, 0.26)
CHARS["bat"] = dict(
    bones={"ear_l": ((0.12, 0, 0.76), (0.20, 0, 0.94), "head")},
    vols={"SK_Bat_Head": [("ell", (0, 0, 0.58), (0.23, 0.215, 0.20), (0, 0, 0)), ("ell", (0, -0.18, 0.53), (0.07, 0.06, 0.045), (0, 0, 0)), ("ell", (0.14, -0.10, 0.54), (0.07, 0.06, 0.055), (0, 0, 0))],
          "SK_Bat_Body": [("ell", (0, 0, 0.31), (0.12, 0.10, 0.13), (0, 0, 0))] + ARMS[1:] + [
              ("ell", (0.30, 0.02, 0.33), (0.16, 0.018, 0.11), (0, 0, -12)), ("ell", (0.42, 0.02, 0.27), (0.10, 0.016, 0.10), (0, 0, -30)),   # wing membrane off the arm
              ("ell", (0.23, 0.02, 0.22), (0.10, 0.016, 0.08), (0, 0, 10))],
          "SK_Bat_Ears": [("ell", (0.15, 0.0, 0.83), (0.075, 0.028, 0.12), (0, 22, 0)), ("ell", (0.19, 0.0, 0.94), (0.03, 0.02, 0.05), (0, 22, 0))],
          "SK_Bat_Tail": [("ell", (0, 0.09, 0.27), (0.03, 0.03, 0.03), (0, 0, 0))]},
    marks={"SK_Bat_Head": [(BAT_LT, (0, -0.20, 0.52), (0.10, 0.07, 0.07))],
           "SK_Bat_Body": [(BAT_LT, (0, -0.10, 0.30), (0.09, 0.05, 0.12)), (WING, (0.32, 0.02, 0.30), (0.2, 0.08, 0.16)), (WING_DK, (0.40, 0.02, 0.24), (0.1, 0.06, 0.1)), (WING_DK, (0.50, 0.02, 0.22), (0.06, 0.06, 0.06))],
           "SK_Bat_Ears": [(PINK, (0.155, -0.014, 0.83), (0.04, 0.02, 0.08))]},
    face=eyes(RED_EYE, pupil_w=0.014, y=-0.19) + [(PINK, (0, -0.235, 0.545), (0.018, 0.012, 0.012), 0), (WHITE, (0.022, -0.225, 0.505), (0.008, 0.006, 0.016), 0)],
    base=BAT, budgets={"SK_Bat_Head": 2400, "SK_Bat_Body": 3000, "SK_Bat_Ears": 700, "SK_Bat_Tail": 100}, armour=False)


# ---------------------------------------------------------------- player breeds (3 per race)
# Fur, head, ears and tail only (armour=False): the client grafts the knight armour set from cat.glb onto these at load,
# so each breed costs a few hundred KB instead of another 1.5 MB armour copy. Body stays ARMS so that armour still fits.
GOLDEN, GOLDEN_LT = (0.86, 0.60, 0.28), (0.97, 0.84, 0.60)
FAWN, FAWN_LT = (0.88, 0.70, 0.48), (0.98, 0.90, 0.76)
HUSKY, HUSKY_DK = (0.46, 0.48, 0.54), (0.20, 0.21, 0.25)
CREAM, SEAL = (0.95, 0.90, 0.80), (0.28, 0.19, 0.14)
FOLD, FOLD_DK = (0.62, 0.64, 0.69), (0.40, 0.42, 0.47)
HAMSTER, HAMSTER_LT = (0.90, 0.62, 0.30), (0.99, 0.94, 0.86)
RAT, RAT_DK = (0.62, 0.56, 0.52), (0.36, 0.31, 0.29)
SNOW = (0.96, 0.96, 0.95)
BLUE_EYE, BROWN_EYE, COPPER, RUBY = (0.30, 0.62, 0.92), (0.40, 0.24, 0.12), (0.86, 0.50, 0.14), (0.80, 0.16, 0.22)
NOSE_DOG = [(BLACK, (0, -0.315, 0.56), (0.030, 0.020, 0.022), 0), (DARK, (0, -0.30, 0.51), (0.045, 0.010, 0.018), 0), (PINK, (0.02, -0.30, 0.50), (0.014, 0.008, 0.014), 0)]


def big_eyes(iris, scale=1.0, pupil_w=0.024, y=-0.196):
    """eyes() with the whole eye scaled — chihuahuas, folds and hamsters read by their eyes."""
    return [(c, pos, tuple(r * scale for r in rad), hl) for c, pos, rad, hl in eyes(iris, pupil_w, y)]


def breed(name, base, bones, head, ears, tail, marks, face, body_extra=(), budgets=(2600, 2400, 700, 700)):
    P = f"SK_{name}_"
    return dict(bones=bones, vols={P + "Head": head, P + "Body": ARMS + list(body_extra), P + "Ears": ears, P + "Tail": tail},
                marks={P + k: v for k, v in marks.items()}, face=face, base=base,
                budgets={P + "Head": budgets[0], P + "Body": budgets[1], P + "Ears": budgets[2], P + "Tail": budgets[3]}, armour=False)


HEAD = ("ell", (0, 0, 0.60), (0.245, 0.23, 0.21), (0, 0, 0))
CHEEK = ("ell", (0.155, -0.10, 0.55), (0.08, 0.07, 0.065), (0, 0, 0))
BELLY = lambda c: [(c, (0, -0.11, 0.28), (0.11, 0.06, 0.14))]
PAWS = lambda c: [(c, (0.20, -0.03, 0.225), (0.075, 0.075, 0.065)), (c, (0.075, -0.04, 0.045), (0.08, 0.10, 0.055))]
FLOPPY = {"ear_l": ((0.19, -0.01, 0.70), (0.25, -0.02, 0.50), "head")}

CHARS["golden"] = breed("Golden", GOLDEN, FLOPPY,
    [HEAD, ("ell", (0, -0.21, 0.54), (0.10, 0.11, 0.075), (0, 0, 0)), CHEEK],
    [("ell", (0.215, -0.01, 0.60), (0.05, 0.085, 0.13), (0, -18, 0)), ("ell", (0.23, -0.01, 0.52), (0.045, 0.07, 0.07), (0, -10, 0))],   # soft hanging ears
    [("ell", (0, 0.11, 0.33), (0.05, 0.05, 0.05), (0, 0, 0)), ("ell", (0, 0.19, 0.38), (0.06, 0.07, 0.06), (0, 0, 0)), ("ell", (0, 0.26, 0.42), (0.055, 0.07, 0.05), (0, 0, 0)), ("ell", (0, 0.31, 0.44), (0.04, 0.05, 0.035), (0, 0, 0))],   # feathered plume
    {"Head": [(GOLDEN_LT, (0, -0.24, 0.54), (0.12, 0.10, 0.08)), (GOLDEN_LT, (0.12, -0.14, 0.66), (0.05, 0.06, 0.04))], "Body": BELLY(GOLDEN_LT) + PAWS(GOLDEN_LT),
     "Ears": [(GOLDEN, (0.22, 0, 0.56), (0.08, 0.1, 0.12))], "Tail": [(GOLDEN_LT, (0, 0.28, 0.40), (0.07, 0.07, 0.05))]},
    big_eyes(BROWN_EYE) + NOSE_DOG)

CHARS["chihuahua"] = breed("Chihuahua", FAWN, {"ear_l": ((0.14, 0, 0.77), (0.28, 0, 0.88), "head")},
    [("ell", (0, 0, 0.61), (0.255, 0.235, 0.22), (0, 0, 0)), ("ell", (0, -0.19, 0.535), (0.07, 0.07, 0.05), (0, 0, 0)), ("ell", (0.15, -0.09, 0.55), (0.07, 0.065, 0.06), (0, 0, 0))],   # apple dome, tiny muzzle
    [("ell", (0.20, 0.0, 0.81), (0.10, 0.026, 0.10), (0, 58, 0)), ("ell", (0.265, 0.0, 0.87), (0.045, 0.02, 0.05), (0, 58, 0))],            # huge bat ears, splayed sideways
    [("cap", (0, 0.09, 0.30), (0, 0.18, 0.40), 0.022), ("cap", (0, 0.18, 0.40), (0, 0.12, 0.50), 0.018)],                                      # thin curl
    {"Head": [(FAWN_LT, (0, -0.22, 0.53), (0.09, 0.08, 0.07)), (FAWN_LT, (0, -0.05, 0.80), (0.05, 0.10, 0.05))], "Body": BELLY(FAWN_LT) + PAWS(FAWN_LT),
     "Ears": [(PINK, (0.21, -0.014, 0.82), (0.06, 0.02, 0.06))]},
    big_eyes(DARK, 1.25, pupil_w=0.03, y=-0.20) + [(BLACK, (0, -0.265, 0.55), (0.022, 0.015, 0.016), 0), (DARK, (0, -0.255, 0.515), (0.03, 0.008, 0.012), 0)])

CHARS["husky"] = breed("Husky", HUSKY, {"ear_l": ((0.13, 0.01, 0.79), (0.18, 0.01, 0.90), "head")},
    [HEAD, ("ell", (0, -0.22, 0.545), (0.105, 0.10, 0.07), (0, 0, 0)), CHEEK, ("ell", (0, 0.05, 0.72), (0.12, 0.12, 0.05), (0, 0, 0))],
    [("ell", (0.14, 0.01, 0.80), (0.068, 0.034, 0.075), (0, 25, 0)), ("ell", (0.172, 0.01, 0.885), (0.03, 0.022, 0.05), (0, 25, 0))],      # upright triangles
    [("ell", (0, 0.10, 0.34), (0.06, 0.06, 0.06), (0, 0, 0)), ("ell", (0, 0.16, 0.43), (0.065, 0.06, 0.065), (0, 0, 0)), ("ell", (0, 0.13, 0.52), (0.06, 0.06, 0.06), (0, 0, 0)), ("ell", (0, 0.06, 0.55), (0.045, 0.045, 0.045), (0, 0, 0))],   # sickle curl over the back
    {"Head": [(SNOW, (0, -0.22, 0.53), (0.15, 0.13, 0.11)), (SNOW, (0.09, -0.19, 0.67), (0.035, 0.03, 0.025)), (SNOW, (0.12, -0.13, 0.57), (0.08, 0.08, 0.07)),
              (HUSKY_DK, (0, 0.02, 0.78), (0.16, 0.18, 0.08)), (HUSKY_DK, (0, -0.14, 0.72), (0.022, 0.08, 0.05))],
     "Body": BELLY(SNOW) + PAWS(SNOW) + [(HUSKY_DK, (0, 0.10, 0.36), (0.15, 0.06, 0.10))],
     "Ears": [(SNOW, (0.145, -0.014, 0.805), (0.03, 0.02, 0.045)), (HUSKY_DK, (0.17, 0.02, 0.88), (0.06, 0.05, 0.05))], "Tail": [(SNOW, (0, 0.10, 0.52), (0.07, 0.04, 0.07))]},
    big_eyes(BLUE_EYE, pupil_w=0.018, y=-0.19) + NOSE_DOG)

CHARS["persian"] = breed("Persian", CREAM, {"ear_l": ((0.15, 0, 0.76), (0.19, 0, 0.83), "head")},
    [("ell", (0, 0, 0.60), (0.26, 0.235, 0.21), (0, 0, 0)), ("ell", (0, -0.17, 0.54), (0.07, 0.04, 0.04), (0, 0, 0)),
     ("ell", (0.17, -0.07, 0.52), (0.10, 0.09, 0.08), (0, 0, 0)), ("ell", (0, 0.0, 0.43), (0.19, 0.17, 0.07), (0, 0, 0))],                     # flat face, cheek fluff, neck ruff
    [("ell", (0.16, 0.0, 0.77), (0.05, 0.028, 0.05), (0, 30, 0))],                                                                              # small low round ears
    [("ell", (0, 0.10, 0.33), (0.065, 0.065, 0.065), (0, 0, 0)), ("ell", (0, 0.17, 0.42), (0.075, 0.075, 0.075), (0, 0, 0)), ("ell", (0, 0.16, 0.53), (0.065, 0.065, 0.07), (0, 0, 0))],   # fluffy brush
    {"Head": [(SNOW, (0, -0.20, 0.52), (0.13, 0.08, 0.08)), (SNOW, (0, 0.0, 0.43), (0.2, 0.18, 0.07))], "Body": BELLY(SNOW) + PAWS(SNOW), "Ears": [(PINK, (0.16, -0.014, 0.77), (0.03, 0.02, 0.03))]},
    big_eyes(COPPER, 1.12, pupil_w=0.02, y=-0.195) + [(PINK, (0, -0.215, 0.56), (0.02, 0.012, 0.012), 0), (DARK, (0.012, -0.21, 0.535), (0.014, 0.005, 0.005), 0)] + WHISKERS)

CHARS["siamese"] = breed("Siamese", CREAM, {"ear_l": ((0.13, 0, 0.78), (0.21, 0, 0.92), "head")},
    [("ell", (0, 0, 0.60), (0.235, 0.22, 0.205), (0, 0, 0)), ("ell", (0, -0.19, 0.54), (0.075, 0.07, 0.05), (0, 0, 0)), ("ell", (0.14, -0.10, 0.55), (0.07, 0.06, 0.06), (0, 0, 0))],   # wedge
    [("ell", (0.16, 0.0, 0.81), (0.075, 0.03, 0.10), (0, 30, 0)), ("ell", (0.21, 0.0, 0.91), (0.03, 0.02, 0.05), (0, 30, 0))],
    [("cap", (0, 0.10, 0.30), (0, 0.22, 0.40), 0.028), ("cap", (0, 0.22, 0.40), (0, 0.16, 0.57), 0.024)],
    {"Head": [(SEAL, (0, -0.21, 0.55), (0.12, 0.09, 0.11))], "Body": PAWS(SEAL), "Ears": [(SEAL, (0.17, 0, 0.83), (0.1, 0.06, 0.12))], "Tail": [(SEAL, (0, 0.18, 0.46), (0.2, 0.2, 0.2))]},   # seal points
    big_eyes(BLUE_EYE, pupil_w=0.012) + [(DARK, (0, -0.262, 0.565), (0.022, 0.014, 0.014), 0), (DARK, (0.014, -0.255, 0.535), (0.016, 0.006, 0.006), 0)] + WHISKERS)

CHARS["fold"] = breed("Fold", FOLD, {"ear_l": ((0.12, -0.02, 0.78), (0.15, -0.07, 0.80), "head")},
    [("ell", (0, 0, 0.60), (0.255, 0.235, 0.215), (0, 0, 0)), ("ell", (0, -0.18, 0.535), (0.075, 0.05, 0.045), (0, 0, 0)), ("ell", (0.16, -0.10, 0.55), (0.085, 0.075, 0.07), (0, 0, 0))],   # owl-round
    [("ell", (0.12, -0.04, 0.785), (0.055, 0.045, 0.024), (-35, 0, 0))],                                                                        # folded forward caps
    [("cap", (0, 0.10, 0.30), (0, 0.20, 0.40), 0.036), ("cap", (0, 0.20, 0.40), (0, 0.15, 0.53), 0.032)],                                     # thick tail
    {"Head": [(SNOW, (0, -0.21, 0.54), (0.11, 0.07, 0.07)), (FOLD_DK, (0, 0.02, 0.80), (0.02, 0.14, 0.05)), (FOLD_DK, (0.07, 0.03, 0.79), (0.018, 0.12, 0.05)), (FOLD_DK, (0.19, -0.02, 0.60), (0.04, 0.10, 0.02))],
     "Body": BELLY(SNOW) + [(FOLD_DK, (0, 0.10, 0.36), (0.14, 0.03, 0.02)), (FOLD_DK, (0, 0.11, 0.30), (0.14, 0.03, 0.02)), (FOLD_DK, (0, 0.11, 0.24), (0.14, 0.03, 0.02))],
     "Tail": [(FOLD_DK, (0, 0.20, 0.40), (0.05, 0.05, 0.03)), (FOLD_DK, (0, 0.17, 0.50), (0.05, 0.05, 0.03))]},
    big_eyes(AMBER, 1.2, pupil_w=0.03) + [(PINK, (0, -0.232, 0.56), (0.02, 0.013, 0.013), 0), (DARK, (0.013, -0.225, 0.532), (0.015, 0.006, 0.006), 0)] + WHISKERS)

CHARS["hamster"] = breed("Hamster", HAMSTER, {"ear_l": ((0.14, 0.02, 0.77), (0.17, 0.02, 0.83), "head")},
    [("ell", (0, 0, 0.59), (0.25, 0.235, 0.215), (0, 0, 0)), ("ell", (0.15, -0.12, 0.52), (0.10, 0.09, 0.085), (0, 0, 0)), ("ell", (0, -0.19, 0.55), (0.07, 0.06, 0.05), (0, 0, 0))],   # stuffed cheeks
    [("ell", (0.15, 0.02, 0.785), (0.045, 0.022, 0.045), (0, 20, 0))],
    [("ell", (0, 0.11, 0.29), (0.03, 0.03, 0.025), (0, 0, 0))],                                                                               # a stub
    {"Head": [(HAMSTER_LT, (0, -0.20, 0.52), (0.16, 0.10, 0.08)), (HAMSTER_LT, (0.15, -0.12, 0.50), (0.10, 0.10, 0.07))], "Body": BELLY(HAMSTER_LT) + PAWS(PINK), "Ears": [(PINK, (0.15, 0.005, 0.785), (0.03, 0.02, 0.03))]},
    [(BLACK, (0.10, -0.196, 0.64), (0.042, 0.014, 0.05), 0), (WHITE, (0.09, -0.212, 0.66), (0.012, 0.006, 0.015), 1),
     (PINK, (0, -0.245, 0.555), (0.02, 0.014, 0.014), 0), (WHITE, (0.011, -0.235, 0.52), (0.009, 0.006, 0.014), 0)] + WHISKERS, budgets=(2600, 2400, 500, 200))

CHARS["dumbo"] = breed("Dumbo", SNOW, {"ear_l": ((0.17, 0.02, 0.70), (0.27, 0.02, 0.68), "head")},
    [("ell", (0, 0, 0.60), (0.235, 0.225, 0.205), (0, 0, 0)), ("ell", (0, -0.20, 0.55), (0.10, 0.10, 0.065), (0, 0, 0)), ("ell", (0, -0.28, 0.53), (0.045, 0.04, 0.035), (0, 0, 0))],
    [("ell", (0.24, 0.03, 0.68), (0.03, 0.11, 0.11), (0, 0, 20))],                                                                            # saucer ears low on the sides
    [("cap", (0, 0.08, 0.27), (0, 0.30, 0.28), 0.02), ("cap", (0, 0.30, 0.28), (0, 0.46, 0.38), 0.015)],
    {"Head": [(RAT_DK, (0, 0.02, 0.64), (0.26, 0.24, 0.16)), (RAT, (0, -0.20, 0.60), (0.08, 0.07, 0.05))], "Body": [(RAT_DK, (0, 0.10, 0.34), (0.05, 0.06, 0.14)), (RAT_DK, (0, 0, 0.42), (0.14, 0.12, 0.05))],   # hooded pattern
     "Ears": [(PINK, (0.23, 0.0, 0.68), (0.05, 0.1, 0.1))], "Tail": [(PINK, (0, 0.3, 0.33), (0.3, 0.3, 0.3))]},
    CHARS["mouse"]["face"])

CHARS["whitemouse"] = breed("WhiteMouse", SNOW, CHARS["mouse"]["bones"],
    CHARS["mouse"]["vols"]["SK_Mouse_Head"], [("ell", (0.20, 0.03, 0.80), (0.08, 0.026, 0.085), (0, 20, 0))], CHARS["mouse"]["vols"]["SK_Mouse_Tail"],
    {"Head": [(PINK, (0, -0.29, 0.53), (0.04, 0.04, 0.03))], "Ears": [(PINK, (0.205, 0.01, 0.80), (0.06, 0.02, 0.065))], "Tail": [(PINK, (0, 0.3, 0.33), (0.3, 0.3, 0.3))], "Body": PAWS(PINK)},
    [(RUBY, (0.10, -0.196, 0.64), (0.04, 0.014, 0.052), 0), (WHITE, (0.088, -0.212, 0.66), (0.012, 0.006, 0.015), 1),
     (PINK, (0, -0.318, 0.535), (0.022, 0.016, 0.016), 0), (WHITE, (0.011, -0.30, 0.505), (0.009, 0.006, 0.014), 0)] + WHISKERS)
# Shiba: the original Shiba chibi (build_shiba_chibi) as a player breed — same volumes, markings and face, re-exported
# through breed() so it gets eyelids and the grafted armour like every other breed. Replaces the chihuahua.
CHARS["shiba"] = breed("Shiba", shiba.ORANGE, {},
    shiba.VOLUMES["SK_Shiba_Head"], shiba.VOLUMES["SK_Shiba_Ears"], shiba.VOLUMES["SK_Shiba_Tail"],
    {k.split("_")[-1]: v for k, v in shiba.MARKINGS.items()}, shiba.FACE)
BREEDS = ["golden", "shiba", "chihuahua", "husky", "persian", "siamese", "fold", "hamster", "dumbo", "whitemouse"]


feline_mesh.configure(CHARS, shiba, knight)

# Which surface each character's parts are made of — "*" is the default for that character.
# Without this every monster bakes as fur: bark reads as matted hair, a slime loses its gloss.
SURFACE = {
    "stump": {"*": "bark", "Ears": "leaf", "Tail": "bark"},
    "slime": {"*": "jelly"},
    "shroom": {"*": "waxy", "Body": "waxy"},
}


def eyelids(name, spec, bones, arm):
    """Both eyelids as one mesh with a "Blink" shape key. Basis: each lid squashed into a thin sliver tucked under the
    brow (hidden in the head); Blink: a fur-coloured cap over the whole eye with a dark lash line along its bottom edge.
    The client drives the key every few seconds. Named *_HeadLids so the fur tint applies to it like the head."""
    col, c, r = spec["face"][0][0], spec["face"][0][1], spec["face"][0][2]   # first face entry = the eye (sclera)
    lids = []
    for sx in (1, -1):
        cx, cy, cz = c[0] * sx, c[1], c[2]
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, location=(cx, cy, cz)); o = bpy.context.active_object
        o.scale = (r[0] * 1.2, max(r[1], 0.012) * 2.2 + 0.014, r[2] * 1.16); bpy.ops.object.transform_apply(scale=True)
        if name in feline_mesh.CATS: bpy.ops.object.transform_apply(location=True)   # deep enough to cover pupil + highlights
        ca = o.data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        for i, v in enumerate(o.data.vertices):
            ca.data[i].color = (*shiba.lin(DARK if v.co.z < cz - r[2] * 0.55 else tuple(x * 0.82 for x in spec["base"])), 1)   # baked fur reads darker than its base
        lids.append(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in lids: o.select_set(True)
    bpy.context.view_layer.objects.active = lids[0]; bpy.ops.object.join(); ob = bpy.context.active_object
    ob.name = ob.data.name = f"SK_{name.title()}_HeadLids"; bpy.ops.object.shade_smooth()
    ob.data.materials.append(bpy.data.materials["M_Toon_VC"])
    if name in feline_mesh.CATS:
        mat = bpy.data.materials.new(f"M_{name}_Lids"); mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (*shiba.lin(spec['base']), 1)
        bsdf.inputs['Roughness'].default_value = .85
        ob.data.materials.clear(); ob.data.materials.append(mat)
    ob.shape_key_add(name="Basis"); blink = ob.shape_key_add(name="Blink", from_mix=False)
    if name in feline_mesh.CATS: blink.value = 0
    for kb, v in zip(ob.data.shape_keys.key_blocks["Basis"].data, ob.data.vertices):   # basis: squash up under the brow
        top = c[2] + r[2] * 1.05
        kb.co = (v.co.x * 0.9, v.co.y + (0.14 if name in feline_mesh.CATS else 0.05), top + (v.co.z - top) * 0.04)   # sunk well behind the head surface
    shiba.weight(ob, ["head"], bones); shiba.bind(ob, arm)
    return ob


def character(name, spec):
    """Rigged chibi: parts on SK_BK_Chibi (+ the knight armour set when armour=True). Same recipe as build_dog_knight.build()."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    shiba.make_materials()
    B = dict(shiba.BONES); B.update(spec["bones"]); bones = knight._all_bones(B)
    shiba.FACE = spec["face"]
    parts = []
    for pname, vols in spec["vols"].items():
        ob = feline_mesh.part(name, pname, spec, shiba) if name in feline_mesh.CATS and pname.endswith(("_Ears", "_Tail")) else shiba.build_volume(pname, vols)
        shiba.decimate(ob, spec["budgets"][pname])
        shiba.paint_markings(ob, spec["base"], spec["marks"].get(pname, []))
        ob.data.materials.append(bpy.data.materials["M_Toon_VC"]); ob.data.materials.append(bpy.data.materials["M_Shiba_Highlight"])
        if pname.endswith("_Head"):
            ob = shiba.add_face_detail(ob)
            if name in feline_mesh.CATS: feline_mesh.details(ob, name, shiba, knight)
        if name in feline_mesh.CATS and pname.endswith("_Ears"): feline_mesh.ear_insets(ob, name, shiba, knight)
        kind = pname.split("_")[-1]
        shiba.weight(ob, {"Head": ["head"], "Body": shiba.PART_BONES["SK_Shiba_Body"], "Ears": ["ear_l", "ear_r"], "Tail": ["tail_01"]}[kind], bones); parts.append(ob)
        if name in feline_mesh.CATS and kind == "Ears": feline_mesh.anchor_ear_roots(ob)
    arm = shiba.build_armature(bones)
    for p in parts: shiba.bind(p, arm)
    k = dict(arm=arm, parts=parts, armour=[], sword=None, shield=None, bones=bones, lids=[eyelids(name, spec, bones, arm)])
    if spec["armour"]:
        k["armour"] = [gear.build_armour(n, s, arm, bones) for n, s in knight.ARMOUR.items()] + [knight.build_helmet(arm, bones), knight.build_cape(arm, bones)]
        k["sword"], k["shield"] = knight.build_knight_sword(), knight.build_shield()
    return k


def horse():
    """Chibi mount: round barrel, big head and eyes, fluffy mane, white socks, blue saddle blanket with gold trim.
    Origin between the hooves, forward -Y, saddle top ~z 0.64 (client SADDLE_Y). Rigged + animated by build_horse.py."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    shiba.make_materials()
    body = shiba.build_volume("SM_Horse", [
        ("cap", (0, -0.17, 0.47), (0, 0.19, 0.47), 0.195), ("ell", (0, -0.26, 0.50), (0.18, 0.15, 0.17), (0, 0, 0)), ("ell", (0, 0.24, 0.49), (0.18, 0.16, 0.17), (0, 0, 0)),   # round barrel, deep chest, round rump (chunky, not lanky)
        ("cap", (0, -0.30, 0.56), (0, -0.42, 0.80), 0.11),                                                                                                                   # neck
        ("ell", (0, -0.50, 0.89), (0.135, 0.15, 0.13), (0, 0, 0)), ("ell", (0, -0.62, 0.82), (0.085, 0.07, 0.068), (0, 0, 0)),                                              # big round head, short soft muzzle (cute)
        ("ell", (0.07, -0.45, 1.03), (0.034, 0.026, 0.07), (0, 18, 0)),                                                                                                     # bigger ears
        ("cap", (0.105, -0.21, 0.42), (0.105, -0.22, 0.06), 0.072), ("cap", (0.105, 0.23, 0.42), (0.105, 0.24, 0.06), 0.075),                                              # thick sturdy legs
        ("ell", (0.105, -0.22, 0.04), (0.08, 0.085, 0.045), (0, 0, 0)), ("ell", (0.105, 0.24, 0.04), (0.082, 0.085, 0.045), (0, 0, 0)),                                    # big round hooves
        ("ell", (0, -0.36, 0.86), (0.055, 0.11, 0.11), (0, 0, 0)), ("ell", (0, -0.43, 0.96), (0.055, 0.09, 0.09), (0, 0, 0)), ("ell", (0, -0.30, 0.75), (0.05, 0.09, 0.09), (0, 0, 0)),   # fluffy mane
        ("ell", (0, -0.55, 1.01), (0.07, 0.06, 0.05), (0, 0, 0)),                                                                                                            # fluffy forelock
        ("ell", (0, 0.43, 0.45), (0.075, 0.08, 0.17), (25, 0, 0)), ("ell", (0, 0.49, 0.29), (0.07, 0.075, 0.13), (10, 0, 0)),                                               # fluffy tail
        ("ell", (0, 0.0, 0.625), (0.185, 0.21, 0.03), (0, 0, 0)), ("ell", (0, -0.13, 0.67), (0.06, 0.03, 0.06), (0, 0, 0)), ("ell", (0, 0.14, 0.67), (0.10, 0.03, 0.05), (0, 0, 0)),   # blanket + pommel + cantle
        ("cap", (0.17, 0.0, 0.60), (0.18, 0.0, 0.42), 0.012), ("ell", (0.18, 0.0, 0.40), (0.03, 0.035, 0.018), (0, 0, 0)),                                                 # stirrup strap + iron
    ])
    shiba.decimate(body, 4800)
    CHEST, CHEST_LT, MANE_DK, BLANKET = (0.62, 0.38, 0.20), (0.78, 0.55, 0.34), (0.22, 0.13, 0.08), (0.20, 0.34, 0.66)
    shiba.paint_markings(body, CHEST, [
        (MANE_DK, (0, -0.37, 0.88), (0.08, 0.15, 0.15)), (MANE_DK, (0, -0.55, 1.01), (0.08, 0.07, 0.06)), (MANE_DK, (0, 0.45, 0.38), (0.08, 0.09, 0.22)),   # mane, forelock, tail
        (WHITE, (0, -0.64, 0.87), (0.05, 0.07, 0.08)), (CHEST_LT, (0, -0.64, 0.80), (0.085, 0.06, 0.06)),                                                    # blaze, muzzle
        (PINK, (0.10, -0.60, 0.84), (0.035, 0.03, 0.025)), (PINK, (-0.10, -0.60, 0.84), (0.035, 0.03, 0.025)), (PINK, (0.07, -0.45, 1.03), (0.018, 0.02, 0.05)),   # blush, inner ear
        (WHITE, (0.105, -0.22, 0.10), (0.09, 0.09, 0.08)), (WHITE, (0.105, 0.24, 0.10), (0.09, 0.09, 0.08)),                                                   # socks
        (DARK, (0.105, -0.22, 0.035), (0.1, 0.1, 0.035)), (DARK, (0.105, 0.24, 0.035), (0.1, 0.1, 0.035)),                                                     # hooves
        (BLANKET, (0, 0.0, 0.625), (0.20, 0.22, 0.045)), (knight.GOLD, (0, 0.0, 0.60), (0.21, 0.23, 0.015)),                                               # blanket + gold trim
        (BROWN, (0, -0.13, 0.67), (0.07, 0.05, 0.07)), (BROWN, (0, 0.14, 0.67), (0.11, 0.05, 0.06)), (BROWN, (0.17, 0.0, 0.52), (0.03, 0.03, 0.10)),        # saddle leather, straps
        (knight.GOLD, (0.18, 0.0, 0.40), (0.04, 0.045, 0.03)), (CHEST_LT, (0, -0.28, 0.40), (0.12, 0.10, 0.10)),                                           # stirrup, lighter chest
    ])
    body.data.materials.append(bpy.data.materials["M_Toon_VC"]); body.data.materials.append(bpy.data.materials["M_Shiba_Highlight"])
    # big friendly eyes with a highlight
    extra = []
    for sx in (1, -1):
        for col, loc, sc in ((BLACK, (sx * 0.092, -0.585, 0.92), (0.026, 0.034, 0.045)), (WHITE, (sx * 0.104, -0.604, 0.94), (0.009, 0.01, 0.013)), (WHITE, (sx * 0.098, -0.608, 0.905), (0.005, 0.005, 0.006))):   # big shiny eyes
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, location=loc); e = bpy.context.active_object; e.scale = sc
            bpy.ops.object.transform_apply(scale=True); shiba.paint_flat(e, col); e.data.materials.append(bpy.data.materials["M_Toon_VC"]); extra.append(e)
    knight._join(body, extra)
    return body


# monsters rebuilt to stand on four legs: foot kind, sock colour, girth, torso length
QUAD = {"wolf": {}, "alpha": {"girth": 1.1}, "fox": {"girth": 0.9, "long": 1.05}, "boar": {"kind": "hoof", "girth": 1.15}, "bear": {"girth": 1.25}}


def export_glb(path, objects, active):
    # colour carries the look; roughness/normal/metallic/emissive read fine at a quarter of that (keeps the GLB small
    # enough that the single-file artifact can embed every race)
    for img in bpy.data.images:
        armour = img.name.startswith(("SK_Knight", "SM_Knight", "SM_Kite"))       # plate and cloth are low-frequency
        want = (192 if armour else 256) if "BaseColor" in img.name else (96 if armour else 128)
        if img.size[0] > want: img.scale(want, want)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active = active
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_animations=False, export_yup=True,
                              export_image_format="JPEG", export_jpeg_quality=70)   # the single-file artifact has to embed every one of these


def main(out_dir, only, size):
    os.makedirs(out_dir, exist_ok=True)
    for name in only:
        if name == "horse":
            h = horse(); tp.apply([h], defaults={"SM_Horse": "fur"}); tp.bake([h], out_dir, size=size)   # saddle browns classify as leather, coat = fur
            export_glb(os.path.join(out_dir, "SM_Horse.glb"), [h], h)
            shoot = shiba.setup_render(out_dir); shoot(f"preview_horse.png", (1.6, -1.8, 1.0))
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "Horse.blend")); print("OK horse"); continue
        spec = CHARS[name]
        if name in QUAD:   # four-legged remake of an upright chibi (quad_chibi.py)
            q = QUAD[name]; spec = quad_chibi.quadify(spec, spec.get("limb_vols", ARMS[1:]), q.get("kind", "paw"), q.get("foot"), q.get("girth", 1.0), q.get("long", 1.0), q.get("shell", False))
        spec = quad_chibi.weld(spec)   # every piece joined to the body (nothing floats or hangs on by a point)
        k = character(name, spec)
        objects = k["parts"] + k["armour"] + ([k["sword"], k["shield"]] if k["sword"] else [])
        eye_zones = [(f[1], f[2]) for f in spec["face"][:4]] + [((-f[1][0], f[1][1], f[1][2]), f[2]) for f in spec["face"][:4]]
        defaults = {o.name: "fur" for o in k["parts"]}; defaults.update({o.name: "steel" for o in k["armour"]}); defaults.update({"SK_Knight_Cape": "cloth", "SM_KiteShield": "cloth", "SM_KnightSword": "steel"})
        forced = {o.name: SURFACE.get(name, {}).get(o.name.split("_")[-1], SURFACE.get(name, {}).get("*", "fur")) for o in k["parts"]}
        tp.apply(objects, smooth_zones=eye_zones, defaults=defaults, force=forced); tp.bake(objects, out_dir, size=size)
        if k["sword"]: knight.equip(k)
        export_glb(os.path.join(out_dir, f"{name}.glb"), [k["arm"]] + objects + k["lids"], k["arm"])
        shoot = shiba.setup_render(out_dir); bpy.context.scene.render.use_freestyle = False; bpy.context.scene.cycles.samples = 48
        shoot(f"preview_{name}.png", (0.75, -2.0, 0.95))
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, f"{name.title()}.blend"))
        print("OK", name, sum(sum(len(f.vertices) - 2 for f in o.data.polygons) for o in objects), "tris")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    only = argv[argv.index("--only") + 1].split(",") if "--only" in argv else ["cat", "mouse", "wolf", "alpha", "fox", "boar", "shroom", "bear", "slime", "stump", "horse"]
    size = int(argv[argv.index("--size") + 1]) if "--size" in argv else 512
    main(os.path.abspath(argv[0] if argv and not argv[0].startswith("--") else "out_beasts"), only, size)
