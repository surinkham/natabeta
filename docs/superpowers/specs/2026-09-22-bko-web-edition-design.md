# Beast Kingdom Online — Technical Design: Web Edition

> แทนที่ `2026-09-21-bko-m1-vertical-slice-design.md` (UE/GAS) — GDD v0.3 ยังเป็นต้นทางเหมือนเดิม
> วันที่: 2026-09-22 · สถานะ: draft รอ review

---

## 0. สรุปการเปลี่ยน

| หัวข้อ | เดิม (UE) | ใหม่ (Web) |
|---|---|---|
| Client | Unreal 5.5, C++/Blueprint | **three.js + ES modules** (ต่อจาก prototype ที่มี), TypeScript เมื่อแยกโมดูล, Vite bundle ตอน release |
| Gameplay framework | GAS | **Ability system เขียนเอง** ใน `shared/` (ability = ฟังก์ชัน pure บน state; รันได้ทั้ง client-predict และ server) |
| Server | Dedicated UE server | **Node.js + Colyseus** (room ต่อ map, state sync, reconnect) |
| Data | DataTable/CurveTable | **JSON** ใน `shared/data/` — client/server import ไฟล์เดียวกัน |
| DB | PostgreSQL | PostgreSQL (เท่าเดิม) ผ่าน Prisma/Drizzle |
| Art pipeline | Blender → FBX → UE | Blender → **glTF** (มีแล้ว: `work/blender/*`), texture ≤512 WebP/JPEG |
| Look | M_Toon + PP_Outline (UE) | `MeshToonMaterial` + post pass outline/vignette (มีแล้วใน prototype) |
| Platform | PC + Android build | **Browser PC + มือถือ (PWA)**, touch UI มีแล้ว; Capacitor ถ้าจะลง store |
| Tests | UE Automation | **vitest** บน `shared/` (สูตร/inventory/craft/drop) + Playwright smoke |
| Net model | Replication + RPC | Colyseus Schema (state → client), messages (client → server = "RPC") |

**สิ่งที่ไม่เปลี่ยน:** GDD ทั้งหมด (classless, no quest, no dungeon, Merchant Seal, Gold เดียว, Guild War), skeleton เดียว `SK_BK_Chibi`, สูตร §4.3, seed data, definition of done M1

**สถานะจริงวันนี้:** loop M1 เล่นได้แล้วบนเว็บ (single-player, ไม่มี server) — `work/game/index.html` = M1 vertical slice ที่ UE plan ตั้งไว้ 11 task ทำเสร็จในรูป prototype

---

## 1. Milestones (ตัดใหม่ตามของที่มีแล้ว)

| M | เป้า | Definition of Done |
|---|---|---|
| **W1 — Restructure** | prototype ไฟล์เดียว → โปรเจกต์ `web/` แยก client/shared, data เป็น JSON, test สูตร | เล่นได้เหมือนเดิม, `npm test` ผ่าน, `npm run build` ได้ไฟล์ static deploy ได้ |
| **W2 — Multiplayer** | Colyseus room 1 map, server ตัดสิน combat/loot/inventory/craft, client predict movement | 2 browser เห็นกัน ตี wolf ตัวเดียวกัน loot ไปคนที่ kill, refresh แล้วกลับเข้าได้ |
| **W3 — Persist** | Login (email magic link / guest token), save PlayerState ลง Postgres, Merchant Seal mock, Trade | ปิด browser → เปิดใหม่ของครบ; trade 2 คนผ่าน server validate |
| **W4 — Content** | Wolf จริง, Cat/Mouse, skill shop, world boss 1 ตัว, map 2 โซน, mount ม้า | ตาม GDD §28 v0.1 ครบ |
| **W5 — Guild** | Guild, storage, Guild War flag PvP, castle capture objective | ตาม GDD v0.2–0.3 |

W1 เริ่มได้ทันที ไม่มี blocker

---

## 2. Architecture

### 2.1 Repo

```
web/
├── client/                 three.js app (Vite)
│   ├── src/
│   │   ├── main.ts         boot, loop
│   │   ├── render/         scene, camera(2.5D), lights, post (outline/vignette), toon materials
│   │   ├── world/          ground, props (env kit), spawners
│   │   ├── actors/         Actor (mesh+rig+anim), Player, Monster; procedural anim + clip playback
│   │   ├── input/          keyboard, touch joystick, action buttons
│   │   ├── net/            Colyseus client, state → actors, prediction/reconcile
│   │   └── ui/             HUD, inventory, craft, stats (DOM, ไม่ใช่ canvas)
│   └── public/assets/      glb, textures (จาก work/blender ผ่าน tools/export)
├── shared/                 ไม่มี DOM / ไม่มี three — รันได้ทั้งสองฝั่ง
│   ├── data/               items.json monsters.json drops.json recipes.json skills.json levels.json formulas.json equip_visuals.json
│   ├── formulas.ts         derive(), damage()  (§4.3 เดิม)
│   ├── inventory.ts        pure: add/remove/has/craft plan
│   ├── abilities/          basic_attack, slash, dash — pure functions (state, input) → events
│   └── types.ts
├── server/                 Node + Colyseus
│   ├── rooms/MapRoom.ts    tick 20Hz: input → abilities → damage → loot → state
│   ├── ai/wolf.ts          wander/aggro/leash/bite (ย้ายจาก prototype)
│   ├── db/                 Prisma schema, repo
│   └── auth/
└── tools/
    └── export.py           work/blender/out* → client/public/assets (ย่อ texture, glb images data-uri ไม่ต้องแล้วเมื่อ host เอง)
```

### 2.2 Authority (เท่าเดิม, แปลงคำ)

| UE | Web |
|---|---|
| PlayerState (ASC, inventory) | `PlayerSchema` ใน room state: attrs, inventory, equipment, progress — server เขียนคนเดียว |
| Character (equipment visual replicated ทุกคน) | `equipment` อยู่ใน PlayerSchema ทุก client อ่านได้ (Colyseus ส่ง diff ให้ทุกคนใน room) |
| Controller Server RPC `WithValidation` | `room.onMessage("craft"/"equip"/"allocate"/"interact"/"input")` + validate ก่อนทุกครั้ง; ผิดกติกาชัด → `client.leave()` |
| Client prediction (CMC) | client เดินทันที + ส่ง `input{seq,dir,dt}`; server จำลองเดินแบบเดียวกัน (`shared/movement.ts`) ส่ง `pos,seq` กลับ; client reconcile |
| GAS local-predict ability | client เล่น anim ทันที; damage/HP มาจาก server เท่านั้น (เหมือนเดิม) |
| Relevancy/NetCull | Colyseus `filter`/interest: ส่งเฉพาะ entity ใน radius 30m (W2 ทำง่ายๆ: ทั้ง room ≤ 50 คน; W4 ค่อย filter) |

### 2.3 Damage path (path เดียว)

```
client input "atk" → server MapRoom.onMessage
  → shared/abilities/basic_attack(state, actor) → targets in cone (server ทำ sweep เอง ไม่รับ target จาก client)
  → shared/formulas.damage(src, dst, coef)   ← สูตร §4.3 ที่เดียว
  → apply: dst.hp -= dmg; broadcast "hit" {target, dmg, crit, miss}
  → hp<=0: monster → loot roll → killer inventory + exp; player → dead, respawn 5s
```

### 2.4 Tick & time

- Server 20 Hz fixed; client render 60 Hz, interpolate remote actors (100 ms buffer)
- Cooldown/timer ทั้งหมดใช้ server time; client แสดงจาก state

---

## 3. Data (JSON เดียวใช้ทั้งสองฝั่ง)

Schema เท่า spec เดิม §4 แปลงเป็น JSON — ตัวอย่าง `items.json`:
```json
{ "WOLF_FANG_SWORD": { "name": "Wolf Fang Sword", "type": "Weapon", "maxStack": 1, "slot": "MainWeapon",
                       "mods": { "ATK": 18, "Crit": 2 }, "visual": "VIS_WOLF_FANG_SWORD", "sell": 120 } }
```
`equip_visuals.json`: `{ "VIS_WOLF_FANG_SWORD": { "slot": "MainWeapon", "mesh": "SM_WolfFangSword", "socket": "socket_hand_r", "offset": {...} } }`
— ค่า offset = `SOCKET_OFFSET` ที่ script Blender print

`formulas.json` = CT_Formulas เดิม (HP_Base 100, ATK_PerSTR 2, …) — balance ไม่อยู่ใน code

Validation: `shared/data/validate.ts` รันตอน server start + ใน test — recipe อ้าง item ที่ไม่มี = fail

---

## 4. Client

### 4.1 Render (มีแล้วใน prototype → ย้ายเป็นโมดูล)
- Camera 2.5D: perspective FOV 35, pitch −45°, yaw fixed, zoom 6–10 m, follow lerp
- Material: `MeshToonMaterial` 3-step gradient; vertex colour สำหรับ placeholder, map+normalMap สำหรับ baked
- Post: render → HalfFloat RT + DepthTexture → outline (depth Sobel) + vignette + ACES (มีแล้ว)
- Shadow: PCFSoft 2048 desktop / 1024 mobile; `matchMedia`/GPU tier → quality preset
- Budget มือถือ: ≤ 150 draw calls, prop ใช้ `InstancedMesh` ต่อชนิด (W1), texture ≤ 512

### 4.2 Actor
- โหลด glTF (skeleton เดียว) → `SkeletonUtils.clone` ต่อ instance
- Animation: W1 ยังเป็น procedural (bone rotate); W2+ ใช้ clip จาก `retarget_mixamo.py` ผ่าน `AnimationMixer` + state machine (idle/run/attack/hit/death)
- Equipment: `equipment` เปลี่ยน → swap mesh part / attach weapon node ที่ `socket_hand_r` (มีแล้ว)

### 4.3 UI
DOM overlay (HUD/inventory/craft/stats/skill bar/touch) — มีแล้ว; แยกเป็นโมดูลต่อ panel, state มาจาก room state ผ่าน event

### 4.4 PWA
`manifest.webmanifest` + service worker cache asset (workbox); fullscreen + orientation landscape; touch controls มีแล้ว

---

## 5. Server (W2)

- `MapRoom` (Colyseus): `onCreate` โหลด map def (spawners, safe zone), spawn monsters; `setSimulationInterval(50ms)`
- State schema: `players: MapSchema<Player>`, `monsters: MapSchema<Monster>`, `Player{ id,name,x,z,yaw,hp,maxHp,level,exp,equipment{...},dead }` — **inventory/gold/stats ส่งเฉพาะเจ้าของ** ผ่าน `filter`/message
- Messages (client→server): `input`, `atk`, `slash`, `dash`, `craft{recipeId}`, `equip{instanceId}`, `unequip{slot}`, `allocate{attr,n}`, `interact{id}`
- Validate: ระยะ/สถานะ/cooldown ฝั่ง server; rate-limit ต่อ message
- AI: ย้าย wolf AI จาก prototype มา server ทั้งก้อน (ตัด three ออก ใช้ vector เอง)
- Persist (W3): บันทึก Player ลง Postgres ทุก 30 s + ตอน leave; login ผ่าน JWT

---

## 6. Test

| อะไร | เครื่องมือ |
|---|---|
| `shared/formulas` (damage/derive), `inventory` (stack/remove/full), `craft`, `drop roll` | vitest — port จาก spec §9.1 ตรงตัว |
| data validate | vitest |
| client smoke: โหลด → เดิน → ตี wolf → craft | Playwright (headless Chromium, WebGL swiftshader) |
| net: 2 client ใน room, kill → loot 1 ครั้ง | vitest + Colyseus test harness (`@colyseus/testing`) |

---

## 7. Deploy

- Client: static (Cloudflare Pages / Netlify) — `vite build` → `dist/`; artifact claude.ai ยังใช้ demo ได้ผ่าน `embed.py` เดิม
- Server: 1 VPS (Docker: node + postgres) หรือ Fly.io; WebSocket wss ผ่าน reverse proxy
- Asset: host เอง → ไม่ต้อง data-URI hack อีก (เก็บไว้เฉพาะ build artifact)

---

## 8. W1 — งานที่ทำทันที (จาก prototype ปัจจุบัน)

| # | งาน | ผล |
|---|---|---|
| W1-01 | สร้าง `web/` (Vite + TS), ย้าย `index.html` เป็นโมดูลตาม §2.1 | เล่นได้เหมือน v4 |
| W1-02 | ย้าย const ต้นไฟล์ → `shared/data/*.json` + `formulas.ts` + `inventory.ts` (pure) | สูตร/ตารางไม่อยู่ใน client code |
| W1-03 | vitest: damage / inventory / craft / drop (4 test จาก spec เดิม) | `npm test` เขียว |
| W1-04 | `tools/export.py` ย้าย asset จาก `work/blender/out*` → `client/public/assets` (glb + texture 512) | ไม่ต้อง embed base64 |
| W1-05 | `InstancedMesh` prop + quality preset มือถือ | 60 fps desktop / 30 fps มือถือกลาง |
| W1-06 | Animation clip: `AnimationMixer` + state machine, ใช้ clip จาก Mixamo retarget | idle/run/attack เป็น clip จริง |
| W1-07 | PWA manifest + SW + deploy Cloudflare Pages | เปิดจาก URL/ติดตั้งบนมือถือ |
| W1-08 | Feedback: hit flash, slash trail, ฝุ่นวิ่ง, screen shake | "มัน" ขึ้น |

W2 แตก task หลัง W1 เสร็จ

---

## 9. Decision ที่ปิด

| Decision | ค่า |
|---|---|
| ภาษา | TypeScript ทั้ง client/shared/server (JS เดิมย้ายทีละไฟล์ได้) |
| Bundler | Vite |
| Net | Colyseus 0.15 |
| ORM | Prisma |
| Auth W3 | guest token ก่อน → email magic link |
| Wolf placeholder | คง Shiba เทาจน W4 |
| UE scripts (`work/unreal/`) | เก็บไว้เป็น reference ไม่พัฒนาต่อ |
| Blender pipeline | ใช้ต่อทั้งหมด export glTF อยู่แล้ว |
