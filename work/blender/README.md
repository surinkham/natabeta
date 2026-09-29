# Blender — M1 character placeholders

Headless Blender via `bpy` (pip) in `.venv` (Python 3.11, Blender 5.0.1). No Blender GUI needed.

```bash
.venv/bin/python build_shiba_chibi.py out    # character
.venv/bin/python build_shiba_gear.py out     # starter armour + swords + equipped preview
```

Outputs in `out/`:

| File | Type | Notes |
|---|---|---|
| `SK_Shiba.fbx` / `.blend` | Skeletal | 4 parts + `SK_BK_Chibi` skeleton |
| `SK_Chest_Starter.fbx` | Skeletal | teal tunic + steel pads/plate + belt, same skeleton (pelvis/spine_01/upperarm) |
| `SK_Boots_Starter.fbx` | Skeletal | dark boots + toe cap (foot/calf) |
| `SM_WoodenSword.fbx` | Static | pivot at grip, +X = tip, 30 cm blade |
| `SM_WolfFangSword.fbx` | Static | bone-white curved fang blade, 36 cm |
| `SK_Shiba_Equipped.blend` | — | scene with everything on |
| `preview_*.png` | — | Cycles toon renders (naked + equipped) |

## What the FBX contains

- Armature `SK_BK_Chibi` — 25 bones, UE-style names (`pelvis`, `spine_01`, `upperarm_l/r`, `hand_l/r`, `thigh_l/r`, `foot_l/r`, `head`, `ear_l/r`, `tail_01`)
- Socket bones (non-deform): `socket_head`, `socket_hand_l`, `socket_hand_r`, `socket_back`, `socket_waist` — spec §7.1
- 4 modular parts, each bound to the armature: `SK_Shiba_Body`, `SK_Shiba_Head`, `SK_Shiba_Ears`, `SK_Shiba_Tail` (7.5k tris total, budget 8k)
- Fur markings (urajiro cream, blush) are the vertex colour attribute `Col` — UE `M_Toon` reads Vertex Color as base colour, no textures needed
- 2 material slots: `M_Shiba_Toon` (vertex colour → Toon BSDF) and `M_Shiba_Highlight` (emissive eye glint)

## UE import

1. Import `SK_Shiba.fbx` → Skeletal Mesh, create new Skeleton `SK_BK_Chibi` on first import; later parts/races reuse that Skeleton
2. Import Content Type: *Geometry and Skinning Weights*, Use T0 As Ref Pose on, Convert Scene on (default)
3. Height ≈ 90 cm, forward = -Y in Blender → +X in UE with default exporter axes
4. Armour/boots: import with *Skeleton = SK_BK_Chibi* (do not create a new one) → set as `ChestComp` / `BootsComp` mesh, LeaderPose follows body
5. Weapon: attach StaticMesh to bone `socket_hand_r`. The gear script prints `SOCKET_OFFSET` (Blender bone frame, XYZ euler ≈ (90, -23, 71)°, location 0). UE's importer mirrors Y, so start from Roll 90 / Pitch 23 / Yaw -71 in the Socket Manager, nudge until it matches `preview_equipped_front.png`, then lock the value in `DT_EquipVisuals.Offset`

## Editing

Shapes are metaball elements in `VOLUMES` (ellipsoid / capsule, metres) that fuse into one organic surface per part, then decimate to `TRI_BUDGET`. Markings in `MARKINGS` (colour + ellipsoid zone, soft edge). Eyes/nose/mouth in `FACE`. Anything off-centre mirrors across X. Bones in `BONES` (left only, `_r` generated). Weights = 2 nearest bones, inverse-cube — placeholder quality; replace with sculpt + auto-weights at BK-24.

Previews render with Cycles CPU (Toon BSDF + Freestyle outline), ~10 s each.

Gear lives in `build_shiba_gear.py`: `ARMOUR` (metaball shell + vertex-colour marks + bones to weight) and `SWORDS` (length/width/curve/colours). `attach_to_hand(aim=...)` aims the blade in world space for the preview and prints the socket offset.

## W4 characters (races, wolf, boss, mount)

```bash
.venv/bin/python build_beasts.py out_beasts                      # cat, mouse, wolf, alpha, horse (~8 min)
.venv/bin/python build_beasts.py out_beasts --only cat --size 256
```

`build_beasts.py` reuses `build_dog_knight` (puppy recipe + the whole `SK_Knight_*` armour set) and `texture_pass`:
`CHARS` holds each character's bone overrides, metaball volumes, markings and face; `armour: True` gives a race the knight
gear meshes so `equip_visuals.json` works unchanged. Fur base is the knight's TAN for the races so the in-game fur tint
ratio matches. `force={parts: "fur"}` in `tp.apply` stops grey wolf fur being classified as steel. `horse()` is a static
metaball quadruped with a saddle at y 0.62 (the client seats the rider there, scale 1.35). Exported GLBs downscale
BaseColor to 256 and the other maps to 128 — the single-file artifact has to embed every race.

`CHARS` now holds cat, mouse, wolf, alpha, fox and boar (plus `horse()`); `--only fox,boar` rebuilds just those. Snouts
need to sit well clear of the head metaball or everything fuses into one blob — the boar looked like a bear cub until its
snout moved to y −0.235 and the tusks became capsules reaching past it.

Outputs: `<name>.glb`, `<Name>.blend`, `preview_<name>.png`, `textures/`.

## Dog Knight + texture pass

```bash
.venv/bin/python build_dog_knight.py out_knight            # vertex-colour version (fast, ~15 s)
.venv/bin/python build_dog_knight_textured.py out_knight   # + procedural PBR bake (~2 min, CPU)
```

`texture_pass.py` classifies every face by its vertex colour into fur / steel / gold / cloth / leather / dark / eye / glow,
assigns a procedural node material per class (fur streaks + fluff bump, brushed steel, gold, woven cloth, leather grain),
smart-UVs each part and bakes BaseColor / Roughness / Metallic / Normal / Emissive to `out_knight/textures/T_<part>_<pass>.png`
(1024 for big parts, 512 for small). Exports `dog_knight_textured.glb` (textures embedded, ORM packed) and
`DogKnight_Textured.fbx` (embedded). Blended marking edges take the object's default class (`defaults=` in the driver) —
otherwise soft-edge colours land in random classes and the armour turns into a patchwork.

Renders: `render_knight_front/side/back.png` (Cycles PBR, gradient sky for metal reflections, no outline).

## Image-to-3D ingest + Mixamo

```bash
# hi-poly (Hunyuan3D / Tripo / Meshy GLB, or any textured mesh) -> game-ready on SK_BK_Chibi
.venv/bin/python ingest_hipoly.py path/to/hipoly.glb out_ingest --name SK_Cat --tris 8000 --tex 2048 [--yaw 180] [--voxel_div 200]
# Mixamo clip (FBX "without skin" is enough) -> animation on SK_BK_Chibi, importable to UE onto that skeleton
.venv/bin/python retarget_mixamo.py path/to/Running.fbx out_anim --name Run [--target out/SK_Shiba.fbx]
.venv/bin/python retarget_mixamo.py --selftest x out_anim      # no Mixamo file needed: fake rig + render check
```

- `ingest_hipoly.py`: join → normalise (feet z=0, height 0.95, forward -Y; `--yaw` if the source faces elsewhere) → voxel remesh + QuadriFlow to ~tris (falls back to decimate) → smart UV → selected-to-active bake of BaseColor + Normal from the hi-poly → template bones scaled to the bbox → Blender auto-weights (falls back to nearest-bone). Thin blades disappear in the voxel step: raise `--voxel_div`, or split weapons out before ingesting (they should be separate StaticMeshes anyway).
- `retarget_mixamo.py`: world-rotation copy with rest-pose delta per bone (T-pose vs our A-pose is handled), root motion scaled by height. Ears/tail/sockets untouched — layer procedural or hand keys on top.
- `../unreal/ue_setup_retarget.py`: same chain table as an IK Rig / IK Retargeter inside UE, plus batch retarget of every clip in a folder. Editor-side alternative to the Blender script; untested here (no UE).

## Environment kit + look target

```bash
.venv/bin/python build_env_kit.py out_env    # ~3.5 min: 12 props (.fbx/.glb), 3 tileable ground textures, diorama renders
```
Props share the character language (metaball blobs, vertex colours, gold/steel palette): trees ×2, bush, rocks ×2, fence, flower,
house, lamp, barrel, crate, anvil. Ground textures are baked from procedural nodes then made seamless by cross-fading the wrapped
halves (`make_seamless`). `diorama_beauty.png` / `diorama_game_view.png` are the **look target** for UE and the browser game.

**Colour space rule (applies to every script):** palette values are sRGB; `shiba.lin()` converts to linear before writing vertex
colours or node colours. Without it everything renders pastel — that was the "washed out" look of the first renders.

## Animation clips

```bash
.venv/bin/python build_anim_clips.py out_anim    # anims.glb (7 clips, armature only) + anim_sheet.png pose check
```
Keys live in `CLIPS` (bone → [(frame, (rx, ry, rz) deg)], `pelvis.loc` for root bob). Bone space: Y along the bone —
limbs: X swings; spine/head: X nod, Y twist, Z tilt. Blender 5: an action only evaluates/exports through its slot
(`strip.action_slot` / `animation_data.action_slot`), the NLA-mute trick alone renders the rest pose.

## Town kit (medieval)

```bash
.venv/bin/python build_town_kit.py out_town   # ~1 min: SM_Wall / Tower / Gate / House_Stone(2) / Tavern / Stall / Well / Banner / Torch / Bridge + town_kit_sheet.png
```
Reuses env_kit helpers (prim/join/finish). Walls are 4 m segments (the game lays them on a ±11 m square, gate north);
masonry is scattered stone blocks in vertex colour, no textures. Torch flame uses the emissive slot.
