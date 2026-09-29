# Beast Kingdom Online — Handoff (ย้ายเครื่องพัฒนา)

สถานะ ณ 2026-09-22. ทุกอย่างในโฟลเดอร์นี้สร้างจาก script — ไม่มีไฟล์ที่แก้มือ ยกเว้นเอกสาร

> **2026-09-22: เปลี่ยนแผนเป็น Web** — spec ใหม่ `docs/superpowers/specs/2026-09-22-bko-web-edition-design.md` (three.js + Colyseus + Postgres, PWA). UE ไม่พัฒนาต่อ; `work/unreal/` เก็บเป็น reference. ข้อ 2 "เต็ม (UE + GPU)" และข้อ 5 ด้านล่างจึงไม่บังคับแล้ว

## 1. สิ่งที่มี

| โฟลเดอร์ | คืออะไร | สถานะ |
|---|---|---|
| `docs/superpowers/specs/2026-09-21-bko-m1-vertical-slice-design.md` | Tech design M1 (GAS, server-authoritative, data schema, class list, task order 01–11) | approved |
| `outputs/2026-09-21-bko-m1-implementation-plan.md` | แผนงาน BK-01…30 + gate G0–G6 | ใช้เป็น backlog |
| `outputs/2026-09-21-bko-m1-analysis-design-continuation.md` | acceptance T01–T16 | อ้างอิง |
| `work/blender/` | pipeline สร้าง asset แบบ headless (Python bpy) | ใช้งานได้ ทดสอบแล้วทุก script |
| `web/` | **โปรเจกต์หลัก (W1–W4 แล้ว):** Vite + TS, `client/` three.js, `shared/` ตาราง+สูตร+`sim.ts` (gameplay ทั้งหมด pure รวม trade), `server/` Colyseus MapRoom (authority 20 Hz) + guest-token login + save (`server/data/*.json` หรือ Postgres ผ่าน `DATABASE_URL`) · W4: 3 เผ่า (หมา/แมว/หนู), boss Alpha Wolf, โซน Dark Forest, skill shop, ม้า | `npm run server` + `npm run dev` (2 terminal); client เชื่อม ws://host:2567 อัตโนมัติ, ต่อไม่ได้ → offline sim ในหน้าเว็บ |
| `work/game/` | prototype ไฟล์เดียว (ต้นทางของ `web/`) — เก็บเป็น reference, artifact ตอนนี้ build จาก `web/` (`npm run build:single`) | https://claude.ai/artifact/NFU28ENP22rK7JRYL3oaDw |
| `work/unreal/` | script Python สำหรับรันใน UE Editor | **ยังไม่เคยรัน** (ไม่มี UE บนเครื่องเดิม) |
| `work/economy_simulation.py` | sim เศรษฐกิจ (จาก Codex) | อ้างอิง |

### Asset ที่ generate แล้ว (`work/blender/out*`)

| โฟลเดอร์ | เนื้อหา |
|---|---|
| `out/` | Shiba placeholder: `SK_Shiba.fbx/.blend`, `SK_Chest_Starter`, `SK_Boots_Starter`, `SM_WoodenSword`, `SM_WolfFangSword`, preview |
| `out_knight/` | Dog Knight: body + Helmet/Chest/Gloves/Boots/Cape (skeletal), KnightSword/KiteShield (static), `dog_knight_textured.glb` (12MB), `DogKnight_Textured.fbx`, `textures/` 55 ไฟล์ (baked BaseColor/Roughness/Metallic/Normal/Emissive) |
| `out_env/` | prop 12 ชิ้น `.fbx/.glb`, `textures/T_Ground_{Grass,Dirt,Cobble}_{BaseColor,Normal}.png` tileable, `Diorama.blend`, `diorama_beauty.png` = **look target** |
| `out_ingest/` | ตัวอย่างผลจาก `ingest_hipoly.py` (Dog Knight → 8k tris + baked + rig) |
| `out_anim/` | ผล self-test ของ retargeter |

ทุก skeletal mesh ใช้ skeleton เดียว **`SK_BK_Chibi`** (25 bones, ชื่อแบบ UE + `socket_head/hand_l/hand_r/back/waist` เป็น bone) — นี่คือกติกาหลักของ spec §7.1 ห้ามสร้าง skeleton ใหม่ต่อตัว

## 2. Setup เครื่องใหม่

### ขั้นต่ำ (รัน Blender pipeline + เกม browser) — Windows/Linux/mac

```bash
# Python 3.11 + uv
pip install uv            # หรือ https://docs.astral.sh/uv/
cd work/blender
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python bpy pillow     # Windows: .venv\Scripts\python.exe
.venv/bin/python -c "import bpy; print(bpy.app.version_string)"   # คาดว่า 5.0.x
```
`bpy` จาก pip = Blender เต็มตัวแบบไม่มี GUI (~300MB) ใช้ CPU ได้ทั้งหมด ไม่ต้อง GPU

ทดสอบว่าครบ:
```bash
.venv/bin/python build_shiba_chibi.py out        # ~15 s  ต้องขึ้น "OK [...] 25 bones 7512 tris"
.venv/bin/python retarget_mixamo.py --selftest x out_anim
```

### เต็ม (UE + GPU) — Windows

1. Unreal Engine 5.5 (Epic Launcher) + Visual Studio 2022 (Game development with C++) + Android SDK/NDK ผ่าน `Engine/Extras/Android/SetupAndroid.bat`
2. เปิด Plugin: **Python Editor Script Plugin**, GameplayAbilities, EnhancedInput
3. Blender 4.2 LTS / 5.0 แบบ GUI — เปิด `.blend` ใน `out*` ดู/แก้ได้ตรงๆ
4. GPU ≥ 8GB ถ้าจะทำ image-to-3D (Hunyuan3D 2) / AI texture (Dream Textures)
5. Git + Git LFS (`*.fbx *.glb *.blend *.png *.jpg` ลง LFS) — โฟลเดอร์นี้ยังไม่ได้ `git init`

## 3. Script ทั้งหมด (work/blender)

รันจากใน `work/blender` ด้วย `.venv/bin/python <script>` — ทุก script import กันเป็น chain: `build_shiba_chibi` (helper กลาง) → `build_shiba_gear` → `build_dog_knight` → `texture_pass`

| Script | ทำอะไร | เวลา | Output |
|---|---|---|---|
| `build_shiba_chibi.py out` | Shiba chibi 4 parts + skeleton + Cycles preview | 15 s | `out/SK_Shiba.*` |
| `build_shiba_gear.py out` | Starter chest/boots + 2 ดาบ + preview ใส่ชุด | 20 s | `out/SK_*_Starter, SM_*Sword` |
| `build_dog_knight.py out_knight` | Dog Knight ตาม concept sheet (vertex colour) | 15 s | `out_knight/*.fbx, dog_knight.glb` |
| `build_dog_knight_textured.py out_knight` | + procedural PBR → bake texture ทุก part | 2 min | `out_knight/textures/, dog_knight_textured.glb, DogKnight_Textured.fbx/.blend` |
| `build_env_kit.py out_env` | prop 12 ชิ้น + ground texture + diorama render | 3.5 min | `out_env/` |
| `export_web_glb.py out_knight/DogKnight_Textured.blend ../game/assets/knight.glb --size 512` | GLB ย่อ texture สำหรับเว็บ (image เป็น data: URI) | 20 s | `game/assets/knight.glb` |
| `export_game_glb.py ../game/assets` | `shiba.glb` + `wolf.glb` (Shiba recolor เทา) | 30 s | `game/assets/` |
| `ingest_hipoly.py <mesh> out_x --name SK_X` | mesh จาก image-to-3D → retopo 8k + UV + bake + rig อัตโนมัติ | 30 s | `out_x/SK_X.fbx/.glb` |
| `retarget_mixamo.py <mixamo.fbx> out_anim --name Run` | Mixamo clip → animation บน SK_BK_Chibi | 10 s | `out_anim/A_Run.fbx` |
| `texture_pass.py` | module: classify face → material → bake (ไม่รันเอง) | | |

รายละเอียด/gotcha ต่อ script ใน `work/blender/README.md`

## 4. เกม browser (work/game)

```bash
cd work/game
python3 -m http.server 8765     # dev: เปิด http://localhost:8765/index.html (fetch assets/)
python3 serve_csp.py 8766       # ทดสอบใต้ CSP แบบ artifact (block blob:/fetch) — ใช้ก่อน publish เสมอ
python3 embed.py                # ฝัง asset ทั้งหมดเป็น base64 → dist/index.html (ไฟล์เดียว ~5.6MB) เอาไป publish/host
```
- ค่า balance ทั้งหมดอยู่ `const` ต้นไฟล์ `index.html` (สูตรตาม spec §4.3, DT_Drops, recipe)
- `window.__bk` = `{P, wolves, keys, act, hurtPlayer}` สำหรับทดสอบผ่าน console
- ข้อจำกัดที่เจอ: artifact block `blob:`/`fetch` → texture ต้องเป็น `data:` URI + `TextureLoader`; browser pane ที่ซ่อนอยู่ rAF ตกเหลือ 2 fps (ไม่ใช่บั๊กเกม)

## 5. Unreal (work/unreal) — ลำดับรันวันแรก

1. สร้าง C++ project ว่าง (ลบ template) → enable plugin ข้อ 2 ข้างบน
2. แก้ `SRC` ใน `ue_import_assets.py` → Tools ▸ Execute Python Script → ได้ `SK_BK_Chibi` + ทุก mesh/texture/anim
3. `ue_setup_look.py` → `M_Toon_VC`, `M_Toon_Tex`, `PP_Outline`, `PP_CelShade`, PostProcessVolume, lights — เทียบกับ `out_env/diorama_beauty.png`
4. (ถ้าใช้ Mixamo ใน UE) `ue_setup_retarget.py`
5. เริ่ม task 01–03 ของ spec: project setup, greybox, camera, **Android build #1**

script ทั้งสามเขียนเทียบ API 5.4/5.5 โดยไม่ได้รัน — ถ้า error ให้ดู Output Log ชื่อ property/enum แล้วแก้ (โครงและค่าถูกต้อง)

## 6. กติกาที่ต้องรู้ก่อนแก้อะไร

1. **Skeleton เดียว** `SK_BK_Chibi` ทุกเผ่า/ทุกชุด — modular equipment + animation ใช้ร่วมกันได้เพราะสิ่งนี้
2. **สี**: palette ใน script เป็น sRGB → `shiba.lin()` ก่อนเขียน vertex colour/node ทุกครั้ง ไม่งั้นภาพซีด
3. **Tri budget** 8k/ตัวเต็มชุด (spec §7.2) — Dog Knight ครบชุด 16.7k ต้องทำ LOD
4. **Weapon pivot** ที่ด้าม, +X = ปลาย; attach ที่ bone `socket_hand_r`; offset ที่ script print (`SOCKET_OFFSET`) ใส่ `DT_EquipVisuals.Offset`
5. **Forward** = −Y ใน Blender → +Z ใน three.js → +X ใน UE (default FBX import)
6. Metaball: half-extent ≈ radius × size × 0.57; CAPSULE `size_x` เป็นเมตร; ของบาง (ใบดาบ) หายตอน voxel remesh

## 7. ยังไม่ได้ทำ / ถัดไป

- Wolf model จริง (ตอนนี้ Shiba recolor เทา) — ทำด้วย pattern `build_dog_knight.py`
- Cat / Mouse (เผ่าที่ 2–3) — เปลี่ยน VOLUMES/MARKINGS/FACE, skeleton เดิม
- Image-to-3D จาก concept sheet → `ingest_hipoly.py` (ต้อง GPU)
- Mixamo clip จริง → `retarget_mixamo.py` (ยังทดสอบแค่ self-test)
- เกม browser: hit flash / slash trail / bloom / Wolf จริง
- UE: รัน script 3 ตัว, task 01–11 ตาม spec, Android build
- `git init` + LFS + push

## 8. Log งานสั้นๆ (ทำอะไรมาบ้าง)

GDD v0.3 → tech design M1 → Shiba placeholder (metaball) → gear → เกม browser → Dog Knight จาก concept → texture pass (bake) → ingest/retarget/UE scripts → colour-space fix → env kit + look target → env เข้าเกม + outline post
