# Unreal side (editor Python scripts)

All three run inside the Unreal Editor with the Python Editor Script Plugin enabled (Edit > Plugins > Python).
They were written against the UE 5.4/5.5 API and have **not** been executed here (no UE on this machine):
expect to fix a property name or two from the Output Log, the structure and values are the deliverable.

| Script | What it does | Run when |
|---|---|---|
| `ue_import_assets.py` | Imports every FBX/PNG from `work/blender/out*` onto ONE skeleton `SK_BK_Chibi` (first import creates it, all others reuse it), static props, ground textures, retargeted `A_*.fbx` clips | after Blender exports; edit `SRC` |
| `ue_setup_look.py` | Creates `M_Toon_VC` / `M_Toon_Tex` (vertex-colour / baked-texture surfaces), `PP_Outline` (depth+normal Sobel outline, HLSL Custom node), `PP_CelShade` (3-band luminance quantise), an unbound PostProcessVolume (bloom .25, vignette .35, sat 1.12, contrast 1.08, manual exposure), warm DirectionalLight + SkyLight | once per project |
| `ue_setup_retarget.py` | IK Rig for Mixamo + SK_BK_Chibi, IK Retargeter with matching chains, batch-retargets a folder of Mixamo clips | if retargeting in UE instead of `retarget_mixamo.py` |

Look target to match: `work/blender/out_env/diorama_beauty.png` (Cycles). In UE the same read comes from
PP_Outline (thin dark edge) + PP_CelShade (Strength 0.6, not full cel) + saturation/contrast in the volume.
Mobile: keep PP_Outline `Px` at 1.0 and drop PP_CelShade on Android_Low via the DeviceProfile scalability group.

Manual steps Python cannot do in 5.4: add sockets on the skeleton (`socket_head/hand_r/hand_l/back/waist` are
already bones, so a socket on each bone with zero offset is enough) and assign `M_Toon_Tex` instances to the Dog Knight.
