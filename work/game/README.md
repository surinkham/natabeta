# Browser prototype (Three.js)

Playable M1 loop with the real Shiba model: town → grassland → wolves → drops/EXP → blacksmith → Wolf Fang Sword.

```bash
# 1. export GLBs from the Blender pipeline
cd ../blender && .venv/bin/python export_game_glb.py ../game/assets
# 2. local play (fetches assets/*.glb)
python3 -m http.server 8765 --directory ../game   # open http://localhost:8765/index.html
# 3. single-file build for publishing (GLBs inlined as base64)
python3 embed.py                                   # -> dist/index.html
```

- `index.html` — game source. Formulas/tables at the top mirror the spec (§4.3 CT_Formulas, DT_Items, DT_Drops, recipe). Wolf is tuned down (L2, HP ~65) so the starter sword kills it in ~5 hits.
- Player = `assets/knight.glb` (textured Dog Knight, 512px JPEG textures via `../blender/export_web_glb.py`, 2.2 MB). Wooden sword is borrowed from `shiba.glb` at runtime and parented to the knight's `socket_hand_r`; crafting swaps it for `SM_KnightSword`.
- Wolf placeholder = grey recolour of the Shiba rig (`export_game_glb.py`) until a real Wolf model exists.
- Model forward is +Z in three.js (Blender -Y); `yaw = atan2(dx, dz)`.
- Procedural animation only: bones `thigh_*`, `upperarm_*`, `head`, `tail_01` are driven from JS; swords toggle visibility on craft.
- Controls: WASD / arrows, J or Space attack, K Slash (AoE 1.6×, 4 s), L or Shift Dash; touch joystick + buttons on phones.
- `window.__bk` exposes `P`, `wolves`, `act`, `hurtPlayer` for console testing.

Published: https://claude.ai/artifact/NFU28ENP22rK7JRYL3oaDw

### Textures under the artifact CSP

The artifact sandbox blocks `blob:` URLs and `fetch()` of `data:` URIs, which is how three.js normally loads GLB-embedded
images — the model renders white. Two fixes, both in place: `export_web_glb.py` rewrites every image inside the GLB as a
`data:` URI (geometry stays in the BIN chunk, parsed from memory), and the game registers a GLTFLoader plugin that forces
`TextureLoader` (`<img src="data:...">`, allowed) instead of `ImageBitmapLoader` (fetch, blocked).
`python3 serve_csp.py 8766` serves the folder with an equivalent CSP so this class of bug shows up locally.

### v4 — env kit + look

- World is built from `assets/env/SM_*.glb` (the Blender env kit) + tileable ground textures (`T_Ground_*` 512 JPEG); layout mirrors `out_env/diorama_beauty.png`. Collision radii per prop in `RAD`.
- Look: ACES tone mapping, warm sun + PCF soft shadows (2048), and a post pass (`postMat`) that renders the scene to a HalfFloat target with a depth texture, then draws a depth-Sobel outline + vignette. Tone mapping/colour-space happen in that pass because three.js skips them when rendering to a target.
- Refresh assets: copy `out_env/SM_*.glb` into `assets/env/`, downsize textures to 512 JPEG, `python3 embed.py`.
