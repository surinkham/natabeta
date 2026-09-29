# Beast Kingdom Online — M1 Development Plan

วันที่: 21 กันยายน 2026 · Revision: plan-r1 · สถานะ: แผนพร้อมแตกเป็นงานพัฒนา

**เป้าหมาย:** ส่งมอบวงจร `เมือง → ล่า Wolf → ได้ของ/EXP → คราฟต์ → ใส่ดาบใหม่ → กลับไปสู้` บน Windows และ Android โดยเล่นร่วมกันสองคนได้ และสถานะไม่เสียหลังตาย/เกิดใหม่

แผนนี้ต่อจากเอกสาร **M1 Analysis & Design Continuation, proposal-r1** และต้นฉบับ vertical slice ใช้สำหรับทีม 1–2 คน ทุก ticket ด้านล่างยังเป็น **TODO**; การสร้างแผนไม่ได้หมายความว่ามีโค้ดหรือ build ผ่านแล้ว

## 1. สมมติฐานและขอบเขต

- UE + C++ + GAS, game module `BeastKingdom` เดียว, Blueprint สำหรับ data/visual/animation และการประกอบ UI
- PC เป็น Listen Server, Android เป็น remote client ผ่าน LAN/IP; สองผู้เล่นนับรวม host แล้ว
- หนึ่งแผนที่ `L_M1`, เมืองปลอดภัยและสนามติดกัน, Shiba หนึ่งแบบ, Wolf หนึ่งชนิด
- Basic, Slash, Dash; inventory 30 ช่อง; equipment MainWeapon/Chest/Boots; recipe เดียว; Level สูงสุด 20
- PlayerState เก็บ ASC, inventory และ equipment จริง; Character เก็บ public visual snapshot
- ไม่มี login/backend/save, party, trade, matchmaking, dedicated-server deployment หรือ host migration ใน M1
- ใช้ Wolf L1, พักฟื้นที่ช่าง และสาม spawner × สองตัวเป็น **ค่าทดลองสำหรับแผน** ตาม continuation; ปรับผ่าน data หลัง playtest ไม่ถือเป็นสมดุลสุดท้าย
- คง loot/Gold/EXP ให้ killer และ recipe Fang10/Ore5/Gold50 ก่อน เพื่อแยกผลของการปรับ combat ออกจาก economy

ใน workspace ที่ตรวจพบมีเอกสารออกแบบ แต่ยังไม่พบ `.uproject` จึงใช้ `<ProjectRoot>` แทนตำแหน่ง Unreal project ที่จะกำหนดใน BK-01 ชื่อไฟล์/asset ในแผนคือสิ่งที่จะสร้างหรือปรับ ไม่ใช่ไฟล์ที่มีอยู่แล้ว

ยังไม่กำหนดวันส่งตายตัว เพราะไม่ทราบ UE/toolchain ที่ติดตั้ง, เครื่อง Android และสถานะ art assets ให้ประเมินเวลาอีกครั้งหลัง G0 และหลังลอง combat/transaction integration การเพิ่มคนที่สองไม่ทำให้เวลาลดลงครึ่งหนึ่งโดยอัตโนมัติ

## 2. Milestones และเกณฑ์ผ่าน

Gate ใช้ตรวจรับผล ไม่ได้ห้ามเริ่มงานอิสระของ gate ถัดไป หาก dependency ของ ticket นั้นพร้อมแล้ว

| Gate | ผลงานที่ต้องได้ | Tickets | ผ่านเมื่อ |
|---|---|---|---|
| G0 — Build และเชื่อมต่อ | โครงการ, greybox, input/camera, Windows+Android build แรก | 01–03 | Android เดินเห็น PC host ได้จริง |
| G1 — State และอุปกรณ์ | Data, ASC, transaction foundation, equipment, respawn | 04–10 | ตาย 3 รอบแล้วของ/โบนัส/ability ไม่เพิ่มหรือหาย |
| G2 — Combat | Damage, สามสกิล, Wolf, AI, safe zone/พักฟื้น | 11–16 | เล่นสู้และหลบได้บน remote client; ผล damage ถูกต้อง |
| G3 — Reward และ progression | Loot, EXP/Level/points, inventory/stat UI | 17–19 | ของและความก้าวหน้าให้ถูกคนครั้งเดียว; UI ใช้งานได้ |
| G4 — Greybox loop ครบ | NPC, craft, equip flow, mobile UX | 20–23 | ทั้งสองคนล่าจนสร้างและใส่ดาบได้เอง |
| G5 — Art และมือถือ | Shiba/Wolf, โลก, FX, profiling | 24–27 | Art จริงยังผ่าน Android performance และ flow |
| G6 — รับ M1 | Network regression, playtest/tuning, build ส่งมอบ | 28–30 | ไม่มี bug ที่บล็อก loop หรือทำ state เสีย; มีหลักฐานทดสอบ |

**จุดตรวจหลัก:** G0 ต้องมาก่อนการเชื่อว่า mobile ใช้ได้; G1 ต้องผ่านก่อนนับการตาย/เกิดใหม่ว่าถูกต้อง; G4 ต้องผ่านก่อนลงทุน art polish เต็มชุด

## 3. Dependency และการแบ่งงาน

| ID | งาน | ต้องมีงานก่อนหน้า |
|---|---|---|
| BK-01 | ระบุ project/toolchain/device และ baseline | — |
| BK-02 | Project scaffold และ build pipeline | 01 |
| BK-03 | Greybox + movement + camera + Android join | 02 |
| BK-04 | Data schema, tags, seed และ validation | 02 |
| BK-05 | PlayerState/ASC/attributes และ initialization | 03, 04 |
| BK-06 | Pure inventory/equipment transaction planner | 04 |
| BK-07 | Replicated storage, command envelope และ guarded commit | 05, 06 |
| BK-08 | Equipment stats และ starter loadout | 07 |
| BK-09 | Public loadout และ visual placeholder ครบ 3slot | 08 |
| BK-10 | Death/respawn และ state persistence | 09 |
| BK-11 | Damage formula + GE/context/result integration | 05 |
| BK-12 | Basic Attack และ targeting | 11 |
| BK-13 | Slash, Dash และ cancellation | 12 |
| BK-14 | Wolf pawn และ Bite | 08, 12 |
| BK-15 | AI, leash และ spawner lifecycle | 14 |
| BK-16 | Safe zone และพักฟื้น | 10, 13, 15 |
| BK-17 | Loot และ reward settlement | 07, 10, 15 |
| BK-18 | EXP/Level/Gold/StatPoints | 17 |
| BK-19 | Inventory/Stats UI และ reward feedback | 09, 18 |
| BK-20 | Craft NPC และ interaction context | 07, 16 |
| BK-21 | Craft transaction และ replay handling | 08, 20 |
| BK-22 | Craft UI, tracker และ equip flow | 19, 21 |
| BK-23 | Greybox end-to-end และ mobile input integration | 13, 22 |
| BK-24 | Shiba และ equipment art | 23 |
| BK-25 | Wolf art และ animations | 23 |
| BK-26 | Environment, lighting, UI/FX polish และ cooking audit | 24, 25 |
| BK-27 | Android profiling และ optimization | 26 |
| BK-28 | Network/race/failure regression | 23 |
| BK-29 | Solo/pair playtest และ tuning | 28 |
| BK-30 | Final regression และ delivery build | 27, 29 |

การทดลอง art ตัวแทนหนึ่งชุดเริ่มได้หลัง BK-09 และก่อน G4 แต่ยังไม่ทำ asset ทั้งชุดใน BK-24/25 จน greybox loop ผ่าน

**ถ้าทำคนเดียว:** ทำตาม dependency และสลับระหว่าง combat กับ inventory เพื่อให้ได้ของที่เล่นตรวจได้เร็ว หลัง BK-05 เริ่ม BK-11/12 เพื่อพิสูจน์ damage path ได้ โดยยังไม่ต้องรอ crafting

**ถ้ามีสองคน:** คน A ดูแล authoritative state/transaction/network; คน B ดูแล movement/input/UI/greybox และประสาน art หลัง BK-05 สามารถแยกสาย `06→07→08→09→10` กับ `11→12→13` ได้เมื่อทั้งสองมีทักษะ C++/GAS ถ้าคน B เป็น artist/designer ให้ทำ UI/layout/art spike และไม่ถือว่าสาย engineering สองชุดจะเดินคู่กันได้เต็มที่

ก่อนทำงานคู่ ตกลง struct และ API ที่แชร์ใน `BKItemTypes`, `BKCombatTypes`, public loadout และ command result ให้ตรงกัน หลีกเลี่ยงแก้ `.uasset` เดียวพร้อมกัน; แยก map/sublevel หรือผู้รับผิดชอบ asset ให้ชัด

## 4. รายละเอียดงาน G0 — Build และเชื่อมต่อ

### BK-01 — ระบุสภาพแวดล้อมและ baseline

**ผลส่งมอบ:** project location, รายการเครื่องมือ/อุปกรณ์ และเอกสาร baseline สั้นที่ใช้ร่วมกัน

- [ ] ระบุ `<ProjectRoot>`, มี repo เดิมหรือเริ่มใหม่, เครื่องพัฒนา Windows และผู้รับผิดชอบ build
- [ ] เลือก UE patch เดียวที่ใช้ทั้งทีม และบันทึก SDK/NDK/JDK/compiler ที่ packaging ผ่านในภายหลัง ไม่เลือกเวอร์ชันจากคำว่า “5.5+” อย่างเดียว
- [ ] ระบุ Android test device รุ่น/SoC/GPU/RAM/OS, สายต่อ/การติดตั้ง APK และเครือข่ายสำหรับ join
- [ ] ตรวจ art ที่มีอยู่: Shiba, Wolf, skeleton, animations, meshes และสิทธิ์ใช้งาน; สิ่งที่ขาดใช้ placeholder ที่ระบุชัด
- [ ] บันทึก baseline ที่ใช้ในแผนนี้และรายการค่าทดลอง โดยไม่เปลี่ยน scope ระหว่างพัฒนาเงียบ ๆ

**ตรวจรับ:** คนที่จะเริ่ม BK-02 รู้ว่าจะเปิด project ที่ไหน ใช้เครื่องไหน และติดตั้ง build ลง Android เครื่องใด; ข้อมูลที่ขาดกลายเป็น blocker เฉพาะ ticket ที่เกี่ยวข้อง

### BK-02 — Project scaffold และ build pipeline

**พื้นที่งาน:** `<ProjectRoot>/Source/BeastKingdom`, `Config`, `Content`, `.gitignore`, `.gitattributes`

- [ ] สร้าง/จัด game module เดียวและ domain folders ตาม design; เปิด GAS, GameplayTags, Enhanced Input และ dependencies ที่ใช้งานจริง
- [ ] สร้าง GameMode/GameState/PlayerController/PlayerState/Character skeleton ให้ editor และเกมเริ่มได้
- [ ] ตั้ง source control/LFS สำหรับ binary assets และ exclude generated build/cache โดยไม่ ignore source assets
- [ ] บันทึกขั้นตอน compile และ package Windows/Android ที่ใช้จริงใน repo; สร้าง Development build แรกแบบแผนที่ว่าง

**ตรวจรับ:** เปิดจาก checkout ได้, compile ผ่าน, Windows build เริ่มเกม และ APK ติดตั้ง/เริ่มแผนที่ว่างได้ ไม่ใช้ “เปิดใน Editor ได้” แทน packaging

### BK-03 — Greybox, movement, camera และ Android join

**พื้นที่งาน:** `Characters`, `Camera`, `Core/Input`, `L_M1`, `WBP_TouchControls`

- [ ] วางเมือง/สนาม, spawn point, ทางกลับเมือง และ NavMesh แบบ greybox; ใช้ default character แทน art จริง
- [ ] ทำ WASD/joystick ผ่าน CMC, เดินตามแกนกล้อง, normalize diagonal และ camera pitch/yaw ตาม design
- [ ] ทำ zoom wheel/pinch ช่วง 800–1600; ตรวจ camera collision และการอ่านพื้นที่บนสัดส่วนจอ Android
- [ ] เพิ่มวิธี Host/Join สำหรับ Development/LAN ที่ใช้ทดสอบซ้ำได้ ไม่เพิ่มระบบ lobby
- [ ] ทดสอบสองผู้เล่นใน PIE แล้วทดสอบ Windows host + Android remote บนเครื่องจริง

**ตรวจรับ:** ทั้งสองเห็นตำแหน่ง/ทิศการเดินตรงกัน, touch เดินได้, zoom ไม่แย่ง joystick และมี build ID + device record ของ **Android build #1**

## 5. รายละเอียดงาน G1 — State และอุปกรณ์

### BK-04 — Data schema, tags, seed และ validation

**พื้นที่งาน:** `Data/BKDataTypes`, `BKDataSubsystem`, `BKDeveloperSettings`, `BKDataValidation`, `Core/BKGameplayTags`, `Content/Data`

- [ ] สร้าง structs และ lookup สำหรับ Items/Monsters/Drops/Recipes/Skills/Visuals/Levels/Curves; formula รับ Level อย่างชัดเจน
- [ ] ใส่ seed ต้นฉบับพร้อม Wolf candidate แยก profile เพื่อเทียบผล โดยยังใช้ recipe/drop เดิม
- [ ] เพิ่ม tags ที่ขาด: Dead, Dashing, Attacking, SafeZone, Leashing, cooldown tags และ SetByCaller mappings ที่ GE ใช้จริง
- [ ] ตรวจ row references, counts, ranges, slots, modifier whitelist, level rows และ soft references; critical data ผิดให้หยุดเริ่ม session พร้อม reason
- [ ] รวม assets/data ที่จำเป็นใน cook และสร้าง validation report ที่ระบุ row ผิดได้

**ตรวจรับ:** lookup ครบ, แก้ recipe ให้อ้าง item ที่ไม่มีแล้ว validator จับได้; cosmetic หายมี fallback แต่ critical formula หายไม่เงียบผ่าน

### BK-05 — ASC, attributes และ initialization

**พื้นที่งาน:** `Core/BKPlayerState`, `Attributes/BKAttributeSet`, `Abilities/BKAbilitySystemComponent`, `Characters/BKCharacterBase/PlayerCharacter`

- [ ] วาง ASC/AttributeSet บน PlayerState และ init actor info หลัง dependencies พร้อมทั้ง server/owner client
- [ ] แยก pure derived-base calculation ออกจาก equipment GE; clamp effective values ตาม design และ bind MoveSpeed เข้ากับ CMC
- [ ] ตั้ง replication conditions ของ attributes; จัด ability grant/init ให้เรียกซ้ำได้โดยไม่แจกซ้ำ
- [ ] ทำ readiness gate สำหรับ input/HUD และ death-state hooks ที่ระบบ combat/lifecycle จะใช้; cleanup delegates เมื่อ avatar เปลี่ยน

**ตรวจรับ:** L1 ก่อน equipment มี HP155/ATK12.5/DEF5; remote HP ตรง server, init ซ้ำไม่เพิ่ม stats/abilities และ base recalc ไม่ล้าง active modifiers

### BK-06 — Pure inventory/equipment planner

**พื้นที่งาน:** `Inventory/BKItemTypes`, `BKInventoryTransaction`, `Tests/BKInventoryTest/BKEquipmentPlanTest`

- [ ] นิยาม snapshot/plan/revision, GUID และตำแหน่ง bag/equipment โดยยังไม่ผูกกับ World/Actor
- [ ] ทำ Add/Remove/Move/Equip/Unequip/Swap ที่คำนวณ final state ก่อนแก้จริง; คง GUID ของ equipment เดิม
- [ ] จัด stack merge/split, MaxStack, 30 bag slots และ all-or-nothing สำหรับจำนวนไม่พอ/พื้นที่ไม่พอ
- [ ] เขียน tests ขอบเขต: 99+21 stack, remove ข้าม stack, insufficient remove, full-bag swap และ failed unequip

**ตรวจรับ:** ผล plan อธิบายได้ว่าจะเปลี่ยนอะไร; failure คืน snapshot เดิม; ไม่มี item GUID ซ้ำ/stack0; full bag สลับดาบ 1 ต่อ 1 ได้

### BK-07 — Replicated storage และ guarded commit

**พื้นที่งาน:** `Inventory/BKInventoryComponent`, `Equipment/BKEquipmentComponent`, `Core/BKPlayerController`, command/result types

- [ ] เพิ่ม FastArray inventory และ canonical equipment records บน PlayerState แบบ owner-only
- [ ] ทำ command sequence/result enum, bounded result cache, stale/replayed request handling และ rate limit สำหรับ mutating commands
- [ ] ทำ guarded executor: ตรวจ revision/live state, preflight definitions/specs, apply, mark dirty และแจ้ง project observers หลัง commit
- [ ] รองรับ failure/restore ของ state และจุดต่อ equipment effect participant; ห้าม async load หรือคำสั่งซ้อนระหว่าง commit
- [ ] จัด API และ delegate ให้ Listen host กับ remote UI ใช้ได้ ไม่พึ่ง OnRep ฝั่ง client อย่างเดียว

**ตรวจรับ:** สั่ง add/remove ผ่าน server แล้วเฉพาะเจ้าของเห็น inventory; command เดิมไม่ทำซ้ำ; failure injection ใน storage ไม่ทิ้งข้อมูลครึ่งรายการ

### BK-08 — Equipment stats และ starter loadout

**พื้นที่งาน:** `Equipment/BKEquipmentComponent`, `GE_EquipStats`, starter definitions

- [ ] สร้าง starter GUID และ equip หนึ่งครั้งหลัง ASC พร้อม; เก็บ GE handles เฉพาะ server แยกจาก persistent item record
- [ ] ใช้ numeric modifiers ATK/DEF/Crit ตาม whitelist และหนึ่ง effect ต่อ occupied slot โดยไม่รวม bonus ใน derived base อีกครั้ง
- [ ] เชื่อม swap/unequip เข้า transaction; preflight ก่อนแก้และ restore effect จาก specs พร้อม handles ใหม่เมื่อ rollback จำเป็น
- [ ] ให้ project observers เคารพ transaction guard แม้ GAS internal callbacks ยังเกิดได้; equipment effects ไม่มี side effects อย่าง damage/loot

**ตรวจรับ:** starter ได้ ATK17.5/DEF9; ดาบ Fang ให้ ATK30.5 และ Crit เพิ่ม 2; ถอดกลับ ATK12.5; failed swap คืนทั้ง item, Gold และ effect state

### BK-09 — Public loadout และ visuals placeholder

**พื้นที่งาน:** public loadout struct บน Character, `Equipment/BKEquipVisualComponent`, `DT_EquipVisuals`

- [ ] Replicate `{Slot, ItemId, Revision}` บน Character; ไม่ส่ง GE handles หรือ inventory ทั้งชุดให้คนอื่น
- [ ] แสดง weapon socket และ Chest/Boots ด้วย placeholder ที่เปลี่ยนได้ครบสาม slot
- [ ] ทำ empty-slot/base garment และ async loading ที่ตรวจ revision/avatar lifetime ก่อนใส่ mesh
- [ ] Refresh ทั้ง Listen host และ remote; รองรับ initial state ของ late join

**ตรวจรับ:** B เห็น A สลับของครบสาม slot; late join เห็นปัจจุบัน; rapid swap/ถอดก่อน load เสร็จไม่แสดงของเก่าทับ

### BK-10 — Death/respawn และ persistence

**พื้นที่งาน:** `BKCharacterBase`, `BKGameMode`, PlayerState/Pawn lifecycle, development test fixture

- [ ] ทำ authoritative death แบบครั้งเดียว; cancel abilities/tasks/root motion, ปิด collision/input และจัด death presentation
- [ ] Respawn5 วินาทีต่อ death generation; cleanup avatar/delegates เก่าและยกเลิก timer เมื่อ disconnect/world จบ
- [ ] Rebind ASC กับ Pawn ใหม่, ล้าง transient tags, คง inventory/equipment/progression/cooldown ที่เหลือ และเติม HP เต็มเฉพาะ server
- [ ] ใช้ fixture ใน Development เพื่อสร้าง death ผ่าน authoritative path สำหรับทดสอบ ไม่เปิด client RPC ที่เลือกฆ่าใครก็ได้

**ตรวจรับ:** equip→ตาย→เกิดใหม่ 3 รอบ แล้ว GUID/Gold/EXP/stat/ability count ไม่เปลี่ยนผิด; โบนัสไม่ซ้ำ; ทั้งสองเห็นดาบหลังเกิดใหม่ และมี respawn timer เพียงหนึ่งตัว

## 6. รายละเอียดงาน G2 — Combat

### BK-11 — Damage calculator และ GAS/result integration

**พื้นที่งาน:** `Abilities/BKDamageExecCalc`, `BKCombatTypes`, `BKGameplayEffectContext`, `GE_Damage`, `Tests/BKDamageCalcTest`

- [ ] ทำ pure damage function พร้อม injectable random rolls; hit≥1 หลัง floor, miss=0, caps และ Coef จาก server
- [ ] ต่อ GE→ExecCalc→Damage meta→HP; สร้าง context/spec แยกต่อ target และเก็บ authoritative attribution
- [ ] พิสูจน์ Hit/Crit/Miss โดยเฉพาะ Damage0 ว่าถึง CombatResult ได้โดยไม่พึ่ง HP-change callback
- [ ] ส่ง cosmetic result และ dedup AttackId+TargetSpawnId; สร้าง debug damage display/HP bar ขั้นต้น

**ตรวจรับ:** tests T01 ผ่าน; remote และ host เห็นผลหนึ่งครั้งเมื่อไม่ทำ packet loss; cosmetic event หายไม่ทำให้ HP ผิด งานนี้ใช้ dummy และยังไม่ถือว่าผ่าน player respawn

**จุดเสี่ยงที่ต้องพิสูจน์ก่อน:** ถ้า custom context/result path ยังไม่แน่นอน ให้ทำ integration proof ขนาดเล็กจนผ่านก่อนสร้างทุก ability บนสมมติฐานนั้น

### BK-12 — Basic Attack และ targeting

**พื้นที่งาน:** `BKGameplayAbility`, `BKAbility_MeleeBase`, `GA_BasicAttack`, ability target-data task, placeholder montage

- [ ] รับ input ผ่าน ability tag พร้อม normalized direction payload ที่ผูก prediction key และมี timeout/cleanup
- [ ] Local prediction สำหรับ animation; server commit cooldown และ resolve hit ตาม timing data
- [ ] ทำ coarse overlap แล้วกรอง capsule-edge reach, full cone angle, height, team, life state และ line of sight; เลือกหนึ่ง target
- [ ] ใส่ AttackId/resolve-once และ soft target ที่ช่วยหันอย่างเดียว; whiff ไม่ปลอมเป็น damage miss

**ตรวจรับ:** ตี dummy ได้บน host/remote, ตีไม่ทะลุผนัง, cooldown ถูก, server ไม่ใช้ damage/target list จาก client และหันกล้อง host ออกก็ยัง resolve

### BK-13 — Slash, Dash และกติกายกเลิก

**พื้นที่งาน:** `GA_Slash`, `GA_Dash`, cooldown/state tags, root-motion task, `WBP_SkillBar`

- [ ] ทำ Slash หลาย target โดยสร้าง spec/result แยกและไม่ตี target เดิมซ้ำต่อ activation
- [ ] ทำ Dash ทิศ input หรือ facing, เป้าหมาย 400cm ใน 0.2s, ชนสิ่งกีดขวางได้และไม่มี i-frame
- [ ] ทำ exclusive/cancel rules: Dash ยกเลิก pending melee ได้, damage ที่ resolve แล้วไม่ย้อน, cooldown ไม่คืนและโจมตีระหว่าง Dash ไม่ได้
- [ ] คืน movement modifiers/state tags เมื่อ End/Cancel/Death/Reject; ผูก skill buttons และ cooldown display ขั้นต้น

**ตรวจรับ:** cancellation ก่อน hit ไม่เกิด hit ช้า, direction ตรงทั้งสองฝั่ง, ไม่มี tag/ความเร็วค้าง; ทดสอบ Android สองนิ้วและ latency ก่อนเพิ่ม FX จริง

### BK-14 — Wolf pawn และ Bite

**พื้นที่งาน:** `BKMonsterCharacter`, monster ASC/attributes, `GA_WolfBite`, placeholder Wolf mesh/anim

- [ ] สร้าง monster ด้วย MonsterId/HomeLocation พร้อมก่อน init; ใช้ ASC บนตัว monster และ HP/MaxHP replication
- [ ] ใช้ Wolf candidate จาก data; Bite มี windup0.55/active0.10/recovery1.15s และ Coef1
- [ ] ล็อก facing และหยุดเดินตอน windup; telegraph อ่านออก; ใช้ authoritative damage path เดียวกับ player
- [ ] แยก attack profile/animation ของ Wolf จาก player Basic เพื่อไม่ใช้ montage/tempo ของ Shiba ผิด

**ตรวจรับ:** ผู้เล่นพร้อม starter gear ได้รับ damage จาก Bite ถูกสูตร; หลบออกจากพื้นที่แล้วไม่โดน; telegraph ไม่ติดตามเป้าหมายระหว่างกัด

### BK-15 — AI, leash และ spawner lifecycle

**พื้นที่งาน:** `AI/BKMonsterAIController`, `BT_Monster`, `BB_Monster`, `BKSpawner`

- [ ] ทำ Wander/Chase/Attack/Leash/Dead และ perception จาก sight/damage; เป้าหมาย damage ล่าสุดมีผลหลัง windup ปัจจุบันจบ
- [ ] ตรวจ leash/target ต่อเนื่องและ abort MoveTo ได้; leashing ไม่รับ/ทำ damage, ไม่ถูก re-aggro และถึง home แล้ว heal เต็ม
- [ ] ทำ spawn slot/generation, death notification ครั้งเดียว, corpse3s และ respawn30s จาก death; spawnfail retry มีช่วงเวลา
- [ ] Wolf awake ตลอดใน M1; วางสามกลุ่มสองตัวที่ไม่บังคับผู้เล่นใหม่ดึงคู่

**ตรวจรับ:** wander ก่อน aggro เห็นบน remote, ไล่/กลับ home/เกิดใหม่ถูก, ไม่มี spawn ซ้ำเมื่อ deathcallback ซ้ำ และ navigation ติดกู้กลับโดยไม่แจก reward

### BK-16 — Safe zone และพักฟื้น

**พื้นที่งาน:** `Interaction/BKSafeZoneVolume`, damage eligibility, shared interaction validation, town heal action

- [ ] เมืองเป็นกติกา server: player ในเมืองไม่เริ่ม attack/ไม่รับ damage; ตรวจซ้ำที่ hit resolution
- [ ] เข้าเมืองแล้ว Wolf ยกเลิก pendingbite และ leash; ตรวจขอบเขตโจมตีข้าม zone
- [ ] ทำ action พักฟื้นบนช่าง placeholder เดิม: อยู่เมือง, ระยะ≤300cm, มีชีวิตและปลอดภัย 3s แล้ว HP เต็ม
- [ ] สร้าง `IBKInteractable` และ shared validation ขั้นต้นพร้อมช่าง placeholder เพื่อให้ BK-20 ขยาย actor เดิมเป็น Craft NPC โดยไม่เพิ่ม NPC ประเภทใหม่

**ตรวจรับ:** ข้ามเข้าเมืองระหว่าง windup แล้วไม่มี illegal hit; actionheal นอกเงื่อนไขไม่เปลี่ยน HP; การกลับเมืองช่วยออกล่าต่อได้โดยไม่ต้องตาย

## 7. รายละเอียดงาน G3 — Reward และ progression

### BK-17 — Loot และ reward settlement

**พื้นที่งาน:** `Loot/BKLootComponent`, death settlement, drop-roll helper, inventory executor

- [ ] Resolve killer จาก authoritative positive damage ที่ทำให้ HP ถึง 0; guard reward ต่อ monster ก่อน callback
- [ ] Roll แต่ละ row แยก, item เข้าผ่าน inventoryplan, Gold เข้า authoritative currency path; แยก RNG combat/loot
- [ ] Overflow ไม่ให้ partial และแสดงของที่ไม่ได้รับ; ยังให้ Gold/EXP ตามกติกา; ผู้ช่วยไม่ได้ reward
- [ ] ส่ง reward outcome สำหรับ UI/log และจุดต่อ EXP ใน BK-18; ไม่เพิ่ม pickup actor

**ตรวจรับ:** สองคนปิด kill ใกล้กันได้ reward คนเดียวครั้งเดียว; chance0/1 และ count ขอบเขตผ่าน; bag เต็มไม่แสดง toast รับของที่ไม่ได้รับ

### BK-18 — EXP, Level, Gold และ StatPoints

**พื้นที่งาน:** `BKAttributeSet`, progression helper, `Server_AllocateStat`, `DT_Levels`

- [ ] ให้ EXP20 ต่อ Wolf ผ่าน rewardsettlement; ทำ multi-level loop โดยหัก threshold ของ level เดิม
- [ ] ให้ 5points ต่อ level, cap20 และกำหนด EXP ปลายทางตาม design; Gold/EXP/points เป็น integer ที่ finite บน server
- [ ] Allocate เฉพาะ primary tag ที่อนุญาตและแต้มที่มี; normalrace คืน reason ไม่ disconnect
- [ ] Recalculatebase โดยไม่ heal ฟรี/ไม่บวก gear ซ้ำ; เก็บ event เพื่อ HUD และบันทึกทดสอบ

**ตรวจรับ:** kill3/8/15 ได้ L2/3/4 เมื่อเริ่มใหม่; multi-levelgrant ถูก; สอง request ขณะที่มี point เดียวไม่ติดลบ; stat/Gold คงหลัง respawn

### BK-19 — Inventory/Stats UI และ reward feedback

**พื้นที่งาน:** `WBP_HUD`, `WBP_Inventory`, `WBP_Stats`, HP/target widgets, loot/level toasts

- [ ] Bag30 ช่องและ equipment3slot อ่าน authoritative state; click/tap ส่ง command พร้อม pending/error state
- [ ] แสดง preview การเปลี่ยน stat ก่อน equip; UI ไม่แก้ inventory/Gold แทน server และรับข้อมูลที่มาถึงคนละ frame ได้
- [ ] Stats ครบ 6 ตัว, pointbadge และคำอธิบายผลที่ใช้จริงใน M1 รวมข้อจำกัด INT; levelup ไม่เปิด modal กลางสู้
- [ ] แสดง Gold/EXP/loot/overflow; เปิด panel แล้ว clear held input, รับ damage แล้วปิด panel ตาม design และ rebind หลัง respawn

**ตรวจรับ:** ใส่/ถอด/สลับได้บน touch, error อ่านรู้เรื่อง, ไม่มี inventory ของคนอื่น และ panel ไม่ทำให้เดิน/โจมตีค้าง

## 8. รายละเอียดงาน G4 — Greybox loop ครบ

### BK-20 — Craft NPC และ interaction context

**พื้นที่งาน:** `IBKInteractable`, `BKCraftNPC`, PlayerController interaction state, `Client_OpenCraft`

- [ ] ต่อช่าง placeholder จาก BK-16 ให้มี station tag และ Craft action
- [ ] เลือก nearest interactable และตรวจ server distance≤300cm, line of sight, alive, actor valid
- [ ] เปิด craftpanel จาก server-approved context และตรวจ context ใหม่ในทุกคำสั่ง ไม่ใช้ panel เปิดเป็นสิทธิ์
- [ ] ส่ง reason เมื่อเดินออก, NPC หายหรือ actor ไม่ใช่ station ที่ถูกต้อง; ล้าง context เมื่อ avatar เปลี่ยน

**ตรวจรับ:** เปิดถูก NPC, ปลอม Target/อยู่นอกระยะใช้ไม่ได้ และ normalfail ไม่ kick ผู้เล่น

### BK-21 — Craft transaction

**พื้นที่งาน:** `Crafting/BKCraftingLibrary`, `BKInventoryTransaction`, `Server_Craft`, `Tests/BKCraftingTest`

- [ ] เพิ่ม pure craft planner โดย normalizeingredients ซ้ำ, จำลอง consume ก่อนเช็ค outputcapacity และตรวจ Gold
- [ ] Commit ผ่าน guarded executor ร่วมกับ inventory/Gold; outputGUID เกิดครั้งเดียวต่อ successfulcraft
- [ ] ต่อ CommandSeq/resultcache: duplicate คืนผลเดิม, stale ไม่ execute ซ้ำ และ limit จำนวนต่อ command เป็นหนึ่ง recipe
- [ ] ทำ failure injection ก่อน/ระหว่างขั้นที่จำเป็นเพื่อยืนยัน rollback และ deferred project notifications

**ตรวจรับ:** fullbag ที่ consume หมด stack คราฟต์ได้; ไม่เกิดช่องว่างก็ fail; ทุก failure ไม่มีของ/Gold หาย; replay ไม่สร้างดาบเพิ่ม

### BK-22 — Craft UI, tracker และ equip flow

**พื้นที่งาน:** `WBP_Craft`, inventoryhighlight, recipe tracker บน HUD

- [ ] แสดง ingredients มี/ต้องใช้, Gold, output และ reason ของปุ่ม disabled จาก state ปัจจุบัน
- [ ] Pending ระหว่าง command, success/failure ชัด; resultRPC ไม่สร้าง item ใน client เอง
- [ ] คราฟต์สำเร็จให้เปิด bag/เน้นดาบใหม่และกด Equip เอง ไม่ auto-equip
- [ ] Tracker อ่าน recipe เดียวกัน; ไม่สร้าง quest system และไม่เปิด Inventory/Craft ซ้อนกัน

**ตรวจรับ:** ผู้เล่นอธิบายได้ว่าขาดอะไร; craft→เปิด bag→equip เห็นดาบทันทีเมื่อ state/asset พร้อม และอีก client เห็นตรงกัน

### BK-23 — Greybox loop และ mobile UX integration

**ผลส่งมอบ:** playable alpha ที่ครบวงจรและ **Android build #2**

- [ ] จัดทาง Spawn→ช่าง→สนาม→กลับเมือง, ทดลองเวลาวิ่ง 8–15s และ telegraph ที่ไม่เริ่มนอกภาพโดยไร้โอกาสเห็น
- [ ] จัด touchlayout ตาม safe area: joystick, Basic, Slash, Dash, Interact, HP/target/tracker; cooldown อ่านได้โดยไม่พึ่งสี
- [ ] ทดสอบสองนิ้ว, pinch, panel เปิดปิด, death/respawn และ cancel ขณะถือ input
- [ ] เล่นตั้งแต่ freshsession ทั้ง solo และ PC+Android โดยไม่แจกวัตถุดิบผ่าน debug จนทั้งสองคนคราฟต์และใส่ดาบได้

**ตรวจรับ G4:** มีวิดีโอ/log ของวงจรจริงแยกรายผู้เล่น; ของไม่หายหลังตาย; no-blocker flow ก่อนทำ art เต็มชุด เวลา 10–15 นาทีเป็นเป้าหมายวัด ไม่ใช่บังคับให้รอ

## 9. รายละเอียดงาน G5 — Art และ Android

### BK-24 — Shiba และ equipment art

**พื้นที่งาน:** `Characters/Canine/Shiba`, `Characters/Shared`, `Items/Weapons`, `Items/Armor`, visual definitions

- [ ] ทำ/นำเข้า skeleton และ Shiba parts: Body, Head, Ears, Tail, Hair, Chest, Boots; ตรวจ LeaderPose และ socket มาตรฐาน
- [ ] Shiba animations: Idle, Run, Attack01, Attack02, Slash, Dash, Hit, Death; blendspace/slot/montage ตรง timingdata
- [ ] Weapon meshes: Wooden Sword/Wolf Fang Sword; armor: Starter Chest/Boots; base appearance เมื่อถอด gear
- [ ] ตั้ง LOD/material/texture ตาม budget เดิม และทดลอง toon/outline กับเครื่องจริงก่อนนำไปใช้กับทุก part

**ตรวจรับ:** ครบสาม slot, ดาบจับถูกทิศ, modularmesh ไม่ reference-pose/ทะลุจนบังการเล่น, animation ไม่เปลี่ยน authoritativehit timing และ loop เดิมยังเล่นได้

### BK-25 — Wolf art และ animations

**พื้นที่งาน:** `Monsters/Wolf`, `ABP_Wolf`, Wolf montages และ telegraphvisual

- [ ] นำเข้า Wolfmesh/skeleton และ Idle, Walk, Run, Bite, Hit, Death
- [ ] จัด Bite ให้ตรง windup/resolve/recovery, facinglock และ capsulecollision ของ placeholder
- [ ] ตรวจ telegraph บนจอเล็กและแสงสนาม; reaction ไม่สร้าง stun โดยอัตโนมัติ
- [ ] ตั้ง LOD/material/texture และตรวจ corpsecleanup/respawn โดยใช้ art จริง

**ตรวจรับ:** ผู้เล่นอ่านท่ากัดได้, model กับพื้นที่โจมตีไม่หลอกตา, off-camera combat และ networkstate ไม่เปลี่ยนจาก placeholder

### BK-26 — Environment, FX/UI polish และ asset cooking

**พื้นที่งาน:** `World/L_M1`, materials/lighting, foliage, UI, `FX`, cooking settings

- [ ] ทำเมือง/สนามเฉพาะพื้นที่เล่น, landmark กลับเมือง, foliage/collision/NavMesh และ lighting ที่ mobile รองรับ
- [ ] ใส่ Hit/SlashFX, damage-numberpool, HP bars, icon และ soundplaceholder ตาม scope; อย่าให้ effect บัง telegraph
- [ ] ตรวจ camera มุมคงที่, clipping/occlusion และ modularoutline ต้นทุนจริง; ลดรายละเอียดจุดที่ผู้เล่นไม่ใช้
- [ ] Audit soft-reference/cook ของ meshes, icons, DT, abilities, maps; ติดตั้ง build ใหม่บนเครื่องที่ไม่มี editorassets ให้พึ่ง

**ตรวจรับ:** packagedgame หน้าตา/อุปกรณ์ครบ, ไม่มี missingcriticalasset, no-menu-inputregression และ scene ทดสอบพร้อมสำหรับ profiling

### BK-27 — Android profiling และ optimization

**ผลส่งมอบ:** performance report และ **Android build #3** ที่ใช้รับงาน

- [ ] Pin device/profile/resolution/render scale และฉากผู้เล่น 2 คน+Wolf6 ตัว+Slash/UI ตาม baseline
- [ ] บันทึก frame-time, game/render/GPU time เท่าที่เครื่องมือรองรับ, memory, loadinghitch และ thermal หลังเล่น 15 นาที
- [ ] เปรียบเทียบเปิด/ปิด outline, material sections, shadow/FX/foliage; แก้คอขวดที่วัดพบและรัน scene เดิมหลังแก้
- [ ] ทดสอบ Vulkan จริง; หากจะระบุ GLESfallback เป็น feature ที่ผ่าน ต้องมีผลของ path นั้นแยก

**ตรวจรับ:** เป้าหมาย 30fps บนเครื่องที่ระบุ พร้อม distribution และ hitch ที่อธิบายได้; ไม่ใช้ FPS เฉลี่ยเพียงค่าเดียวปิดงาน หากไม่ผ่านให้ปรับ budget/คุณภาพที่มองเห็นได้และวัดใหม่ ไม่เลื่อนปัญหาไปหลังรับ M1

## 10. รายละเอียดงาน G6 — รับ M1

### BK-28 — Network, race และ failure regression

**พื้นที่งาน:** functional tests, development test map/harness และบันทึกผล

- [ ] ทดสอบ host/remote, latejoin, rapidloadoutchange, avatar เปลี่ยนระหว่าง asyncload และ disconnect ระหว่าง action
- [ ] ทดสอบ normalnetwork, RTT วัดจริงประมาณ 150ms, loss5% และกรณีรวม; ระบุ delay ขาเข้า/ออกที่ใช้
- [ ] Replaycommands, allocationrace, craftout-of-range, fullbag, duplicateddeath, simultaneouslethalhit และ cancellation
- [ ] ตรวจ serverstate/ledger ไม่สรุป anti-cheat จากการแก้ค่า console ใน client เพียงอย่างเดียว

**ตรวจรับ:** ไม่มี itemdupe/state loss/reward ซ้ำ/ability ค้าง; normalreject ไม่ disconnect; cosmeticpacketloss ไม่ทำให้ HP/death ผิด ทุก failure มี steps และ buildID

### BK-29 — Solo/pair playtest และ tuning

**ผลส่งมอบ:** playtest report, tuning changelog และ data revision

- [ ] ใช้ผู้เล่นใหม่ประมาณ 4–6 คนทั้ง solo และ pair รวม Android จริง; ให้ลอง flow โดยไม่บอกปุ่มระหว่างทำ
- [ ] วัดเวลา firstcombat/firstkill/craft/equip แยกรายคน, TTK ก่อน/หลังดาบ, deaths, เวลารอ spawn/หา NPC/อ่าน UI และความต่างของ reward
- [ ] ตรวจว่า L1 ไม่ลงแต้มก็ชนะได้, รู้ว่า Dash หลบพื้นที่, รับรู้ความแรงของดาบใหม่และเข้าใจ killer-only
- [ ] ปรับทีละตัวแปร: combat ก่อน → spawn/travel → UI → recipe/drop เฉพาะเมื่อหลักฐานชี้ว่าคอขวดอยู่ตรงนั้น
- [ ] ตรวจว่าผลที่ได้ยังอยู่ใน M1; ข้อเสนอ assist/sharedloot เป็น designchange แยก ไม่เพิ่มกลาง tuning

**ตรวจรับ:** รายงานสิ่งที่ผู้เล่นทำได้/ติดขัดพร้อมหลักฐานและการแก้; เป้าหมาย 10–15 นาทีและ TTK เป็นค่าที่ประเมินจากเกมจริง ไม่อ้าง loot simulation แทนเวลาเล่น

### BK-30 — Final regression และ delivery

**ผลส่งมอบ:** Windows build, Android package, test evidence และข้อจำกัดที่ทราบ

- [ ] รัน automatedsuites ที่เกี่ยวข้องและ regression ที่ถูกกระทบหลัง art/tuning บน candidatebuild เดียวกัน
- [ ] ทำ fresh-sessionloop สองผู้เล่น, respawn3 รอบ, craft/equip และ latejoin ด้วย assets จริง; ตรวจ performance15 นาที
- [ ] บันทึก commit/buildID, UE/toolchain, device/settings, host/join/install steps, testresults และ knownissues
- [ ] ตรวจว่าไม่มี bug ที่บล็อก loop หรือทำ authoritativestate เสีย; ปัญหา visual เล็กน้อยที่เหลือระบุผลกระทบชัด
- [ ] สร้าง releasecandidate/tag หรือ archive ตาม workflow ของ repo เมื่อได้รับมอบหมายให้ส่งมอบจริง; ไม่รวมการ publishstore ใน M1

**ตรวจรับ M1:** ทั้งสองคนเล่นตั้งแต่เริ่มจนใส่ดาบใหม่ได้บน build ที่ส่งมอบ, stat/item ถูกต้องหลังเกิดใหม่, Android ตาม target ผ่าน และมีหลักฐานที่ทำซ้ำได้

## 11. Test coverage และหลักฐาน

อ้างอิง T01–T16 ใน continuation เพื่อให้ตามกลับไปยังข้อออกแบบได้:

| กลุ่มความเสี่ยง | Acceptance IDs | Ticket ที่สร้าง/พิสูจน์ | หลักฐาน |
|---|---|---|---|
| สูตรและ gearbonus | T01, T02 | 05, 08, 10, 11 | deterministictests + lifecyclelog |
| Bag/transaction | T03–T06 | 06, 07, 08, 20, 21 | before/afterstate, revision, failureinjection |
| Combat/cancellation | T07, T08 | 11–14, 28 | attack/resultlog + remotevideo |
| Safezone/AI/reward | T09, T10 | 15–17 | state/reward/spawngenerationlog |
| Progression | T11 | 18 | multilevel/point-racetests |
| Visual async/latejoin | T08, T12 | 09, 24–26, 28 | rapidchange/latejoinvideo |
| Network integrity | T13 | 28, 30 | measuredRTT/lossprofile + serverstate |
| Mobile usability | T14 | 03, 13, 19, 23 | physicaldevice two-finger test |
| Experience/pacing | T15 | 23, 29 | per-player report |
| Performance | T16 | 27, 30 | device/settings/frame-timecapture |

เริ่ม test suite แยกตาม domain เช่น `BK.Damage`, `BK.Inventory`, `BK.Equipment`, `BK.Crafting`, `BK.Progression`, `BK.Lifecycle` และ networkfunctionaltests ไม่เขียน test ที่แค่สะท้อน implementation ของ label/UI ตกแต่ง; ใช้ manualchecks สำหรับงานเหล่านั้น

บันทึกหลักฐานใน repo ที่กำหนด เช่น `Docs/Validation/<BuildId>/` โดยแต่ละผลมีวิธีรัน, expected/actual, platform และ pass/fail คำสั่ง UE build/automation แบบเต็มต้องบันทึกจาก environment จริงหลัง BK-02 ไม่ใส่ path สมมติแล้วอ้างว่ารันได้แล้ว

## 12. วิธีใช้แผนระหว่างพัฒนา

1. หยิบ ticket ที่ dependency ผ่านแล้วทีละงาน; ticket ใหญ่แบ่งเป็น commit ย่อยที่ compile ได้ เช่น types → implementation → integration/tests
2. ก่อนแก้ sharedschema แจ้งคนที่ทำ ticket คู่กันและอัปเดต contract เดียว ไม่ทำ adapter เฉพาะหน้าหลายชุด
3. ทุก ticket ส่งผลที่ทดลองได้, การตรวจที่รันจริง และข้อจำกัด; อย่าปิดงานด้วยคำว่า “เขียนเสร็จ” หากไม่มีหลักฐานตามเกณฑ์
4. ชุด test ผ่านแล้วไม่รันซ้ำทั้งหมดทุกครั้งโดยไม่มีเหตุผล; รันเฉพาะสิ่งที่เปลี่ยน และ fullregression ที่ milestone/finalcandidate
5. Build Android ซ้ำเมื่อมีความเสี่ยง platform ใหม่ เช่น input/prediction, GASpayload, softassets, shader/FX; อย่ารอเฉพาะ build ท้ายสุด
6. ค่าทดลองเกมแก้ผ่าน data/changelog ส่วน ownership/transaction/reward invariants ต้องคงเดิมตลอด M1

**งานที่ควรเริ่มทันที:** BK-01 → BK-02 → BK-03 โดยเริ่ม BK-04 คู่กับ BK-03 ได้ จากนั้น BK-05 และแยกสาย inventory/equipment กับ damage/combat ก่อนมารวมเป็น greybox loop ที่ G4

## เอกสารอ้างอิงภายในงาน

- [M1 Analysis & Design Continuation](/home/linuxuser/Documents/Codex/2026-09-21/2026-09-21-bko-m1-vertical/outputs/2026-09-21-bko-m1-analysis-design-continuation.md) — design continuation, acceptance T01–T16 และแหล่งอ้างอิง Epic
- `2026-09-21-bko-m1-vertical-slice-design.md` — ต้นฉบับที่ผู้ใช้แนบ; ใช้ baseline เดิมในส่วนที่ continuation ไม่ได้เสนอแก้

แผนนี้ยังไม่เริ่ม implementation และไม่เปลี่ยนไฟล์ออกแบบเดิม
