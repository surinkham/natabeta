# Feline model refinement

Updated cat, Persian, Siamese, and Scottish Fold assets in web/client/public/assets.

- Broader feline face, paired muzzle pads, triangular nose, split mouth and tapered whiskers.
- Pointed ears (small for Persian, folded for Fold); inner ear geometry follows ear bones.
- Colored irises, slit pupils, and a long curved tail; Siamese seal-point coloring.
- Fixed feline eyelid coordinates, initial Blink value, hidden open lids, and exportable lid material.
- Retained shared rig, equipment meshes, and asset names. Bumped service-worker cache.

Source: work/blender/feline_mesh.py, integrated into build_beasts.py.
Rebuild: work/blender/.venv/bin/python work/blender/build_beasts.py work/blender/out_cats --only cat,persian,siamese,fold --size 256
Outputs: work/blender/out_cats/*.glb, *.blend, preview_*.png.

Validation: inspected rendered previews; reimported all four GLBs into Blender; checked expected bones, armature bindings, nonempty skin weights and Blink=0.

## Connected ear roots

Extended and widened the ear roots into the skull, softened the rims, corrected surface normals, and repositioned inner ears onto the sloping ear face. Root vertices now follow the head, smoothly blending to ear bones toward the tips so ear movement does not pull the base away. Service-worker cache: bko-v4-connected-cat-ears.
