# Pawtale Kingdoms — web

Spec: `../docs/superpowers/specs/2026-09-22-bko-web-edition-design.md`

```bash
npm install
npm run server     # Colyseus authority on ws://0.0.0.0:2567 (tsx watch server/index.ts) — run this first for multiplayer
npm run dev        # http://localhost:5173  (Vite, root = client/); connects to ws://<hostname>:2567, or ?server=ws://…, or ?offline=1
npm run build      # -> dist/  (static, deploy anywhere: Cloudflare Pages / Netlify / any host)
npm run build:single   # -> dist/single.html  (every asset inlined; for claude.ai artifacts and other hosts that cannot serve .glb)
npm run test       # vitest on shared/ + server/
npm run typecheck
```

## Google sign-in

Google Identity Services is already wired into the character creator and the Options window. Copy `.env.example` to
`.env.local` and set both variables to the same OAuth **Web application** client id:

```bash
VITE_GOOGLE_CLIENT_ID=123.apps.googleusercontent.com
GOOGLE_CLIENT_ID=123.apps.googleusercontent.com
```

`VITE_GOOGLE_CLIENT_ID` is compiled into the browser bundle. `GOOGLE_CLIENT_ID` belongs in the Node process environment
and is used to validate every Google ID token before the player joins. The downloaded `client_secret*.json` file and its
client secret are not used, must not be uploaded into `dist/`, and are ignored by Git.

In Google Cloud Console, configure the OAuth client with these Authorized JavaScript origins (no path and no trailing
slash):

```text
http://localhost:5173
https://pawtalekingdoms.com
https://www.pawtalekingdoms.com
```

This flow returns a Google ID token directly to the page, so it does not use an Authorized redirect URI. In production,
build the client with `VITE_GOOGLE_CLIENT_ID` available and start the Node server with the matching
`GOOGLE_CLIENT_ID`. Existing guests can link their current character from Options; new Google accounts keep the same
character on every browser.

```
client/   three.js app — src/{render,world,actors,input,ui,fx}, game.ts (loop + rules), main.ts (boot: creator → world → game); public/ = assets, manifest, sw.js, icons
          ui/: windows.ts (draggable paper windows + menu), status/inventory/hotbar/chat/minimap/npc/creator/objective/options, api.ts (GameApi the game hands to the UI)
shared/   pure TS used by client and server: data/*.json (tables, spec §3) + data.ts (typed access), formulas.ts (derive/damage), inventory.ts, crafting.ts, loot.ts, validate.ts; __tests__/ (vitest)
server/   Colyseus: store.ts (FileStore server/data/*.json default · PgStore when DATABASE_URL is set, table auto-created), room.ts (MapRoom: runs shared/sim.ts at 20 Hz, messages → sim commands, public state via schema.ts, owner-only "me" snapshot + events), index.ts (entry), room.test.ts (@colyseus/testing: 2 clients, shared wolf, loot to the killer only, reconnect)
tools/    export.py — ../work/blender/out* → client/public/assets (runs the bpy exporters, copies props, 512px ground textures)
```

Public playtest from this machine: `web/tools/serve-public.sh` builds if needed, runs one node process that serves `dist/` **and** the Colyseus server (mounted at `/ws`, via `BKO_STATIC`), opens a cloudflared quick tunnel and prints the https link. The client resolves its server from its own origin, so the same build works on a tunnel, on a subdomain, or locally. The link is random per run and dies with the process — playtests, not production. `PORT=9000` to move it.

Testing knob: `shared/data/levels.json` → `startGold` is what a brand-new character carries (20 on the public build; raise it here, not in code, when testing). Existing characters keep whatever they saved — delete their file under `server/data/` (or clear `bk.token` in localStorage) to roll a fresh one.

Rules: balance values live only in `shared/data/*.json` (`validateData()` guards references); no DOM/three in `shared/`; every damage goes through `shared/formulas.damage`; all rigs share `SK_BK_Chibi`.
Light (2026-09-22): `render/daynight.ts` — one shadow-casting directional light is the sun by day and the moon by night (direction, colour, intensity, sky/fog/hemisphere/exposure follow the hour; day = 12 real minutes, `/time 20`, `/time stop|go`, Options slider); `render/lights.ts` — pool of 6 point lights parked on the nearest torches/lamps/house lanterns at night. Props and ground are `MeshStandardMaterial` (PBR), characters stay toon.
Look (2026-09-22): walled medieval town "Pawhaven" from `../work/blender/build_town_kit.py` (walls/towers/gate/stone houses/tavern/stalls/well/banners/torches; wall lines in `world.ts` collide), hand-drawn SVG icons in `ui/icons.ts` (skills, items, slots, menu), parchment + wood UI theme (`.frame` / `.dark` in index.html), portrait avatar snapshot from the equip doll.
Systems (spec addendum 2026-09-22): character creator (name/race/fur, remembered), Status window with point allocation (click 1 / Shift 10 / Ctrl all), Inventory (item/equip/etc tabs) + Equipment window with a live paper-doll (second renderer, cloned rig, drag to rotate; `actors/visuals.ts` maps equipped items → gear meshes + tints so appearance always matches stats — GDD §8), hotbar F1–F9 (drag from windows, remembered), chat tabs + /help commands + system log, minimap, objective hints, NPCs (Blacksmith craft, Tool shop buy/sell, Stylist recolour, villagers ambient), potions, sit, camera zoom, options.
Input: keyboard/joystick, plus mouse/tap — click ground = walk there (hold to steer), click a wolf = chase and auto basic-attack until it dies or you move; keys/joystick cancel the mouse target (`input/input.ts` + `resolvePointer` in `game.ts`).
Console handle: `window.__bk = { P, mobs, npcs, act, api, host }`.
Multiplayer (W2, 2026-09-22): every rule lives in `shared/sim.ts` (`Sim`: join/leave/input/act/use/equip/allocate/craft/buy/sell/restyle/sit + `tick(dt)` = movement, wolf AI, regen, respawn; results are `SimEvent`s). `client/src/net/host.ts` picks the authority: `NetHost` (colyseus.js: input at 20 Hz, local prediction with `stepPlayer` + soft snap when the server disagrees by > 0.8 m, remote bodies eased at 14/s, reconnect token in sessionStorage so a refresh keeps the same character for 20 s) or `LocalHost` (same `Sim` in-page: `?offline=1`, the single-file artifact, or when nothing answers on 2567 within 3 s). `game.ts` only renders host views + events and sends commands; the UI never mutates state. Public replicated state = `server/schema.ts` (players map, monsters array, hours); bag/gold/exp/stats go owner-only as a `me` snapshot whenever `p.dirty`; events with `pid` go to that player only. Day/night clock comes from the server when online. Chat "say"/"world" is broadcast (`/who` lists nearby players). 
Skills (2026-09-22): every skill is a row in `shared/data/skills.json` — `kind` (melee/dash/heal), `clip`, `fx`, `cast` (how long the character is locked) and `hit` (when the effect lands inside that window). `Sim.act` refuses while `busy`, emits one `cast` event and queues the effect in `pending`, which `tick` resolves on the contact frame, so damage and heals land with the animation instead of on the button press. Clips come from `work/blender/build_anim_clips.py`: Bash (overhead smash), Whirl (full 360° spin, `cone: 360` means "everything in range") and Cast (arms up, used by Mend) join Attack/Slash/Dash/Hit/Death/Idle/Run — all on `SK_BK_Chibi`, so every race and monster can play them. Skill effects light the world: `fx/fx.ts` keeps **one** PointLight in the scene forever at intensity 0 and lends it to whatever just fired (`flash(pos, colour, peak, life, follow?)`) — adding or removing a light would re-pick every material's shader variant mid-fight, the hitch this project already paid for once. Around it are pooled additive pieces: `spark`/`sparkBurst` (glow sprites with velocity and gravity), `beam` (rotating open cylinder — the heal column), rings, and `swingGlow` whose brightness scales with the skill's `coef`. The client maps `fx` to an effect in `fx/fx.ts` (`shockwave`, `spinTrail`, `healAura`, `castRing` — pooled additive rings) in one `switch`, so a new skill needs data, a clip and at most one FX case. Bone-angle traps: the camera looks down 45°, so torso pitch reads about double on screen (keep folds under ~15°), and `upperarm` X past about −120° swings the arms through vertical and out in front of the face.

Camera (2026-09-25): `shared/follow-camera.ts` preserves the viewing pitch and yaw when approaching NPCs and buildings. Collision smoothly shortens the boom to a minimum of 72%; foreground props use a dither fade around the sightline so roofs do not force an overhead view or extreme zoom. NPC clicks release the held pointer and clear the previous movement route. Hidden source meshes are excluded from picking.

Performance (2026-09-22, after W4): an InstancedMesh spans every copy it holds, so one mesh for all 133 pines could never be frustum-culled and the Dark Forest dragged the whole map down — `world.ts` now emits one InstancedMesh per prop **per 24 m cell**, so clumps the camera (and the sun's shadow camera) cannot see drop out of both passes. Characters no longer set `frustumCulled = false`; `actors/actor.ts` pads the skinned bounding sphere ×1.8 instead, so far-away monsters stop drawing. `CAM_FAR` is 62 m (the fog closes at 50) and the post pass reads the same constant. The night point-light pool is 4 and switches off entirely by day — a hidden light leaves the shader, an intensity-0 light still shades every pixel. `Q.pixelRatio` caps at 1.5, and `scene.ts` scales the render resolution 0.6–1.0 from the **GPU timer** (`EXT_disjoint_timer_query_webgl2`, target 11 ms / back off at 18 ms) rather than from frame intervals, which lie when the display or tab is capped; Options shows the live `res %`. Measured in the Dark Forest on an Intel Iris Xe: 348k → 102k triangles and 185 → 66 draw calls per frame.

Ground loot (2026-09-23): a kill no longer teleports drops into the bag. `Sim.drop()` scatters a `GroundItem` per stack around the corpse (sack for items, coin pile for gold), owned by the killer for `LOOT_OWNER_WINDOW` 25 s, free to anyone after that, gone at `LOOT_TTL` 90 s. `Sim.pickup(playerId, groundId)` re-checks distance (`PICK_RANGE` 1.7), ownership and bag space server-side and emits a public `Pick` animation so other players see the crouch. The room replicates them as a `ground` MapSchema keyed by id. Client: click a sack to walk over and take it, or **F** for whatever is underfoot; each drop floats a label with its contents (`ui/hud.ts` `.nameplate.loot`) and bobs in place. Models: `work/blender/build_loot_kit.py` → `SM_LootBag` (tinted per item category) and `SM_CoinPile`; the crouch is the `Pick` clip in `build_anim_clips.py`.

Surface + motion pass (2026-09-23): `texture_pass.py` grew **bark / moss / leaf / jelly / waxy** next to fur and metal — a stump baked as fur looked like matted hair, a slime lost its gloss. `build_beasts.py` assigns them per character part through `SURFACE` (stump body = bark, its crown = leaf, slime = jelly, shroom = waxy). On the client, `actors/actor.ts` adds a **quirk**: after the mixer writes the pose it multiplies small rotations into `ear_l/ear_r` and `tail_01` — a slow sway plus an ear flick every few seconds, amplitude per kind from `monsters.json` `quirk: [ear, tail, speed]`, so a fox is twitchy and a stump nearly still. `render/scene.ts` `furRim()` adds a fresnel term to every toon material: the silhouette lightens like backlit fuzz for the price of one dot product (real shell fur would multiply draw calls).

Four-legged monsters (2026-09-23): wolves, foxes, boars and bears stood upright like the player, which read as fake. `work/blender/build_anim_clips.py` now also emits a **Q** clip set (QIdle/QRun/QAttack/QHit/QDeath) built from one quadruped base pose — the pelvis pitches 62°, the arms become front legs, the head lifts back up — and `monsters.json` picks it per kind with `clips: "Q"`. `Animator` takes a prefix and falls back to the shared clip when a variant is missing, so blob-shaped monsters (slime, shroom, stump) keep the two-legged set.

Monsters (2026-09-23): nine kinds plus the boss — Meadow Slime Lv 1, Shroomling Lv 3 (walking mushroom), Grove Bear Lv 9 and Living Stump Lv 11 (Dark Forest, bark body and leaf crown) joined the roster; 52 monsters on the map; Shroom Caps craft into potions at the smith. Clicking a monster now puts a name / level / HP plate over its head (`GameApi.target`, drawn by `ui/hud.ts` as `.nameplate.mob`); the plain bar still shows for anything else that is hurt nearby.

Monsters (2026-09-22): five kinds plus the boss, placed by `SPAWNS` in `shared/world.ts` (`{kind, x, z, n, spread}` — the sim lays each group out on a small ellipse so they do not stack). Grassland: Forest Wolf Lv 2, Meadow Fox Lv 4 (fast, low HP), Tusk Boar Lv 6 (slow, hits hard). Dark Forest: more wolves, boars and Dire Wolf Lv 7 (the alpha model at 1.05), with Alpha Wolf Lv 8 in the clearing. New drops feed one recipe: Fox Pelt ×3 + Wolf Hide ×2 + Boar Tusk → Fur Cloak (Back, DEF 6 / Crit 2) at the smith. Minimap dots are colour-coded per kind, the boss's is bigger. Adding a kind is data only: a `monsters.json` row with `model`/`scale`, a drop table, a spawn group — plus the model in `MODEL_SRC` in `game.ts` when it needs new art.

Content (W4, 2026-09-22): three playable races — dog (`knight.glb`), cat, mouse — all on `SK_BK_Chibi` with the same `SK_Knight_*` gear meshes, so equipment visuals and clips are race-independent; the creator's race is saved with the character. Monsters carry `model` + `scale` in `monsters.json`: Forest Wolf (`wolf.glb`) and the **Alpha Wolf** boss (`alpha.glb`, 1.6×, Lv 8, 540 HP, 5 min respawn, drops Alpha Fang + a chance at the Knight Cape; spawn/kill broadcast as a `notice` event to everyone). Second zone: **Dark Forest** north of z −46 (`shared/world.ts`: dense pines, rocks, two extra wolf spawners, boss clearing at z −76; map now reaches z −92 and the ground plane with it), `zoneName()` drives the minimap label and `/where`. Skills are data, not an enum: `SKILLS[id]` with `kind` melee/dash/heal, the client sends the skill id and the sim checks the player has learnt it. Trainer NPC Rowan sells Bash / Whirlwind / Mend (`learn` message, classless — anyone can buy any skill); the Skills window lists what you know and drags onto the hotbar. Mount: Horse Whistle (300 G, bound Key item) toggles `mounted` — 1.8× move speed, cancelled by attacking or being bitten, `SM_Horse.glb` drawn under the rider (also for remote players via the schema). Blender source: `work/blender/build_beasts.py` (races, wolf, alpha, horse in one script; non-colour maps export at 128 px to keep the single-file artifact under the size limit).

Persist + trade (W3, 2026-09-22): guest login — the browser keeps a random `bk.token` in localStorage (`?token=…` overrides it for a second account in the same browser), the server hashes it into the account id (`onAuth`; 409 when that account is already online, 400 without a token) and loads the saved player (`Sim.join(id, creation, saved)`: name/colour from the save win over the creator). Autosave every 30 s, on disconnect, after the reconnect window and on dispose (`shared/sim.save()` → `Saved`). Store = `server/store.ts`: `FileStore` (default, `BKO_DATA` dir) or `PgStore` (`DATABASE_URL=postgres://…`, one `players(id, data jsonb, updated_at)` table; test with `TEST_DATABASE_URL`). The map room never auto-disposes. Trade: both need a **Merchant Seal** (Key item, 50 Gold at the tool shop, bound = never tradeable) and ≤ 3 m; flow request → accept → offers (`tradeOffer` replaces the whole offer and un-confirms both) → both confirm → `shared/sim.swap()` validates on copies and commits atomically (bag room, counts, gold). Cancelled when either walks > 5 m away, dies or leaves. Client: click a player or `/trade name`, `ui/trade.ts` window, clicking bag items while trading offers the stack. Missing: email magic-link login (needs a mail provider), account/character list.

Assets: `python3 tools/export.py` after any Blender change (needs ../work/blender/.venv + Pillow). Props are `InstancedMesh` per type (12 draw calls for ~150 props).
Quality: auto low/high (`render/quality.ts`: coarse pointer / small screen / ≤4 cores → low = DPR 1, shadow 1024, no MSAA, half the flowers/bushes); force with `?q=low|high`.
PWA: manifest + `sw.js` (cache-first for assets/bundles, network-first for the page; bump `CACHE` in sw.js when assets change). Registered only on https and not in the single-file build.
Deploy: `npm run build` then upload `dist/` (Cloudflare Pages: build command `npm run build`, output `dist`, root `web`). Artifact demo: `npm run build:single` → publish `dist/single.html`.
Animation: `assets/anims.glb` (7 clips from `../work/blender/build_anim_clips.py`, armature only) drives every rig through `actors/anim.ts` — `Animator` = locomotion (Idle/Run) + one-shots (Attack/Slash/Hit/Dash/Death) that return to locomotion; Hit never interrupts an attack, Death wins.
FX (`client/src/fx/fx.ts`): hit flash (emissive), slash trail (ring sector, additive), footstep/dash dust (sprite pool), camera shake — all pooled.

### World atlas and city travel

- Press **M** or the button under the minimap to open the world atlas.
- Walk into the two glowing circles in southern Pawhaven to travel to **Mossvale** or **Frostford**. Each destination has a return circle in its southern square.
- Walk through each city's northern gate to reach its monster fields. City interiors restore HP and prevent monster targeting.
- Mossvale contains Emerald Slimes and Moss Guardians; Frostford contains Frost Wolves and Glacier Bears. These are tinted/scaled variants of the existing animated models, with separate spawn groups and stats.
- `shared/regions.ts` defines city centers and portal routes; `shared/world.ts` defines buildings, collision, and spawns. Regions share one continuous world/room. Warps are server authoritative online and use the same simulation offline.
- Regression coverage: `shared/__tests__/world-travel.test.ts` tests all routes, safe arrivals, dash crossings, gate collision, online authority, and regional spawns.

### Six realms update

The atlas now uses an illustrated continent with interactive realm labels and a creature/travel panel. The six realms are Valoria (Pawhaven), Sylvanis (Mossvale), Frostheim (Frostford), Saharak, Ignaroth, and Shadowlands. The latter five have two region-specific creature silhouettes each, including articulated scarab/scorpion replacements and bone-attached decorations. The atlas is for inspection; travel still requires walking into a portal.

Each advanced city has its own building placements, roads, architecture, and five residents: a merchant, crafter, skill trainer, stylist, and local guide. Forest villages use raised round wooden houses; snow towns use steep roofs and chimneys; desert towns use domes and minarets; volcanic towns use industrial stone forges; shadow towns use gothic spires. Regional NPC species, fur, clothing, headwear, and accessories are configured from the shared resident definitions.

- `shared/towns.ts`: local building positions, road segments, resident names/species/service locations.
- `client/src/world/realms.ts`: regional buildings and environmental models.
- `client/src/world/npc-visuals.ts`: regional costumes and occupation accessories.
- `shared/__tests__/realm-content.test.ts`: content references, bone attachment/material isolation, and collision-aware routes from arrivals to every resident.
- Development previews: `/dev/towns.html` shows the actual shared layouts and NPC models (click a resident to inspect their outfit); `/dev/realms.html` shows animated monsters. These developer pages are not production entry points.

The illustrated atlas is an overview rather than a metrically accurate navigation chart. Playable regions currently share the same server room; their world coordinates are independent of the illustration's composition.

### Regional atmosphere and surface detail

- `client/src/world/atmosphere.ts` layers climate lighting over the day/night cycle: cool snow haze, green woodland light, warm desert dust, volcanic embers, and violet shadow mist. Adjacent climate lighting blends along the roads. Snow and other particles use a single GPU points draw call, with reduced density on the low quality preset.
- `client/src/world/snow.ts` adds upward-facing snow coverage on instanced walls/trees, low snow banks near foundations and walls, and snow-covered town cobbles. Snow homes include thicker roof edges, window sills, icicles, and exposed beams. Decorative banks are placed away from main gate and resident approaches.
- Character skins now use physically lit materials while preserving texture/normal maps and armor reflections. Cached monster palettes preserve dark facial features and bright markings; regional accessories use less emissive, roughness-aware materials. NPC textures are cloned before individual recolouring to prevent shared-cache colour leakage.
- Actors and NPCs receive directional shadows plus a small soft contact decal at their feet. `/dev/towns.html` includes the same live weather and lighting as the game, with an overview-only fog adjustment so an entire city can be inspected. Click a resident to inspect their outfit.

### Ignaroth and Shadowlands detail pass

Ignaroth now has a tiered forge beacon, riveted furnace entrances, chimney bands,
and glowing side vents. Shadowlands has a rune-ring crystal shrine, pointed door
frames, rose windows, side buttresses, and branching spirit trees. Both cities use
muted stone paving and textured paths so buildings and navigation remain legible.
The models use merged geometry per material and the existing instanced realm kit;
city placements, services, travel routes, and shared collision rules are unchanged.

### Mossvale ancient grove

Forest trees now use two curved-trunk silhouettes with hanging vines, luminous
seed pods and shelf fungi. A deterministic grove adds trees inside and around
Mossvale while avoiding roads, encounters and existing solid props. Within an
80 × 80 m square, Mossvale contains 172 trees versus Pawhaven's 54. Tree placement
and collision are identical on low/high quality; meshes remain instanced. The
forest climate adds cool teal haze and drifting luminous motes.

### Living town residents

NPC costumes use physically lit fabric/leather, metallic hardware, stitched seams,
layered pockets and straps. Rigid accessories are merged per bone/material to
keep the additional detail inexpensive. Each resident has a distinct idle phase,
subtle breathing and weight shifts, ear/tail motion and occupational gestures.
Nearby visitors in the resident's forward field of view receive a smoothly limited
head turn. The game and city studio share the same update function; service
positions and collision do not move. `npc-life.test.ts` covers long-running pose
stability, visitor tracking and preservation of animation mixer poses.

### Continuous river curves

`shared/scenery.ts::riverPath` samples cubic river curves with continuous tangents
across two-way junctions, broad meanders and changing widths. Water ribbons, bank
collision, atlas and minimap consume the same samples. Existing bridge crossings
retain straight, constant-width approaches and their original deck/collision.
The straight canal across the southern edge is removed in favor of a short sea
outlet. The watershed connectivity is retained; this is a geometry change, not
an elevation or hydrology simulation. Inspect `/dev/atlas.html` for the whole
network and `/dev/landscape.html` for bridges and tributary junctions.
