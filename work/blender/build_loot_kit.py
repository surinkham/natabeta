"""Ground loot props: the sack a dropped item lands in and the pile a gold drop makes.

    .venv/bin/python build_loot_kit.py [out_dir]     (default out_loot)

Outputs: SM_LootBag.glb, SM_CoinPile.glb (+ previews). Both are static, ~30 cm across, origin on the floor so the
client can drop them straight onto the ground plane. The bag is tinted per item category in the client.
"""
import os
import sys

import bpy

import build_shiba_chibi as shiba
import texture_pass as tp

SACK = (0.62, 0.48, 0.30)
SACK_DK = (0.40, 0.29, 0.17)
ROPE = (0.75, 0.66, 0.44)
GOLD = (0.92, 0.72, 0.22)
GOLD_DK = (0.68, 0.48, 0.10)


def sack():
    ob = shiba.build_volume("SM_LootBag", [
        ("ell", (0, 0, 0.085), (0.115, 0.115, 0.09), (0, 0, 0)),      # body, squashed where it meets the ground
        ("ell", (0, 0, 0.155), (0.055, 0.055, 0.035), (0, 0, 0)),     # neck
        ("ell", (0.035, 0.02, 0.20), (0.035, 0.025, 0.045), (0, 25, 0)),   # gathered cloth above the tie
        ("ell", (-0.03, -0.02, 0.195), (0.03, 0.022, 0.04), (0, -20, 0)),
    ])
    shiba.decimate(ob, 900)
    shiba.paint_markings(ob, SACK, [
        (SACK_DK, (0, 0, 0.02), (0.14, 0.14, 0.05)),                  # shadowed base
        (ROPE, (0, 0, 0.155), (0.075, 0.075, 0.016)),                 # tie
        (SACK_DK, (0.06, -0.06, 0.10), (0.05, 0.05, 0.09)),           # fold
    ])
    ob.data.materials.append(bpy.data.materials["M_Toon_VC"])
    return ob


def coins():
    ob = shiba.build_volume("SM_CoinPile", [
        ("ell", (0, 0, 0.022), (0.115, 0.10, 0.022), (0, 0, 0)),
        ("ell", (0.03, 0.025, 0.045), (0.055, 0.05, 0.02), (0, 0, 0)),
        ("ell", (-0.04, -0.015, 0.042), (0.045, 0.042, 0.018), (0, 0, 0)),
        ("ell", (0.01, -0.03, 0.062), (0.035, 0.033, 0.015), (0, 10, 0)),
    ])
    shiba.decimate(ob, 700)
    shiba.paint_markings(ob, GOLD, [(GOLD_DK, (0, 0, 0.008), (0.13, 0.12, 0.012))])
    ob.data.materials.append(bpy.data.materials["M_Toon_VC"])
    return ob


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    shiba.make_materials()
    bag, pile = sack(), coins()
    tp.apply([bag, pile], force={"SM_LootBag": "cloth", "SM_CoinPile": "gold"})
    tp.bake([bag, pile], out_dir, size=256)
    for ob in (bag, pile):
        bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
        for img in bpy.data.images:
            if img.size[0] > 256: img.scale(256, 256)
        bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, ob.name + ".glb"), export_format="GLB", use_selection=True,
                                  export_apply=True, export_animations=False, export_yup=True, export_image_format="JPEG", export_jpeg_quality=75)
    shoot = shiba.setup_render(out_dir); bpy.context.scene.render.use_freestyle = False
    shoot("preview_loot.png", (0.55, -0.75, 0.45))
    print("OK loot kit ->", sorted(f for f in os.listdir(out_dir) if f.endswith(".glb")))


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    main(os.path.abspath(argv[0] if argv else "out_loot"))
