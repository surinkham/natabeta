"""Export GLBs for the browser prototype (work/game/):
    shiba.glb  rigged Shiba + Chest/Boots + both swords bone-parented to socket_hand_r
    wolf.glb   grey recolour of the Shiba rig used as the Forest Wolf placeholder

    .venv/bin/python export_game_glb.py [out_dir]
"""
import os
import sys

import bpy

import build_shiba_chibi as shiba
import build_shiba_gear as gear

WOLF_MAP = {  # source vertex colour -> wolf colour (matched by nearest)
    shiba.ORANGE: (0.42, 0.44, 0.48),
    shiba.CREAM: (0.78, 0.79, 0.80),
    shiba.BLUSH: (0.50, 0.46, 0.48),
    shiba.IRIS: (0.85, 0.65, 0.15),   # amber eyes
}


def export_glb(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_vertex_color="ACTIVE",
        export_animations=False,
        export_yup=True,
    )


def recolour(ob, cmap):
    ca = ob.data.color_attributes["Col"]
    cmap = {shiba.lin(k): shiba.lin(v) for k, v in cmap.items()}
    keys = list(cmap)
    for c in ca.data:
        src = c.color[:3]
        near = min(keys, key=lambda k: sum((k[i] - src[i]) ** 2 for i in range(3)))
        # keep the soft-edge blend: interpolate by how close we are to the matched key
        c.color = (*cmap[near], 1) if sum((near[i] - src[i]) ** 2 for i in range(3)) < 0.02 else c.color


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    parts, arm, bones = shiba.build_character()
    armour = [gear.build_armour(n, s, arm, bones) for n, s in gear.ARMOUR.items()]
    swords = {n: gear.build_sword(n, s) for n, s in gear.SWORDS.items()}
    for sw in swords.values():
        gear.attach_to_hand(sw, arm)
    export_glb(os.path.join(out_dir, "shiba.glb"), [arm] + parts + armour + list(swords.values()))

    parts, arm, bones = shiba.build_character()
    for p in parts:
        recolour(p, WOLF_MAP)
    export_glb(os.path.join(out_dir, "wolf.glb"), [arm] + parts)
    print("OK", os.listdir(out_dir))


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    main(os.path.abspath(argv[0] if argv else "../game/assets"))
