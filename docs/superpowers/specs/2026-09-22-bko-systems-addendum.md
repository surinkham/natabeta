# Systems addendum — "RO-style shell" (reference: Toonda, feature-only, no code/assets copied)

> เพิ่มบน Web edition spec. คง GDD: classless, ไม่มี quest, Gold เดียว, skeleton เดียว

## 1. รายการระบบ + สถานะ

| # | ระบบ | ฝั่ง | Stage | หมายเหตุ / mapping กับ GDD |
|---|---|---|---|---|
| S1 | Character creator: ชื่อ, เผ่า Dog/Cat/Mouse, สายพันธุ์, สีขน, หมุนดู; guest เข้าเล่นทันที จำชื่อใน localStorage | client | A | W4 ค่อยมี Cat/Mouse จริง — creator เตรียมช่องไว้ |
| S2 | Status window: 6 primary + ปุ่ม + (คลิก 1 / Shift 10 / Ctrl สุด), derived (ATK/MATK/DEF/MDEF/Hit/Flee/Aspd/Crit), Points, auto-attack mode | client → server (W2 `allocate`) | A | ไม่มี Job Lv; Flee = Dodge, Aspd = 1/cooldown |
| S3 | Hotbar F1–F9: ลาก item/skill ใส่, กดคีย์ใช้, cooldown overlay, จำใน localStorage | client | A | skill จาก skill shop (GDD §8) |
| S4 | Inventory window: tab item / equip / etc, capacity 30 (GDD) ลากใส่ hotbar/equip, คลิกขวาใช้/สวม | client → server | A | card tab ตัดออก (ไม่มีใน GDD) |
| S5 | Equip window: slot Head/Chest/Gloves/Pants/Boots/Back/MainWeapon/OffHand/Accessory (spec §7.1) แสดง stat รวม | client → server | A | |
| S6 | Chat panel: tab ทั้งหมด/คุย/โลก/ปาร์ตี้/กระซิบ/ระบบ, `/help /w /p /sit /pos /roll`, ↑ ข้อความเดิม; system log = damage/loot/level | client (log) → server (channels) | A log, B channels | |
| S7 | NPC dialog: กดคุย → กล่องบทสนทนา + ปุ่ม; NPC: Blacksmith (craft), Tool Shop (ซื้อ/ขาย potion/ore), Stylist (เปลี่ยนสี), ชาวเมือง (ambient talk) | client → server (trade validate) | A | Job Guide ตัดออก; Refiner = Enhancement (GDD open) → C |
| S8 | Minimap: canvas top-down + จุด player/monster/NPC + พิกัด + zoom | client | A | |
| S9 | Objective guide: hint ถัดไป (แจกแต้ม → ล่า wolf 10 ตัว → craft) — ไม่ใช่ quest แค่ tutorial hint ครั้งเดียว | client | A | GDD "no quest" ยังจริง: ไม่มี reward |
| S10 | Death screen + respawn ในเมือง, sit (พักฟื้นเร็วขึ้น), camera zoom/reset | client | A | |
| S11 | Options: bgm/sfx toggle, quality, fps | client | A | |
| S12 | Consumables: HP potion (hotbar/คลิกขวา), cooldown 1s | shared | A | items.json type Consumable |
| S13 | Online count + players list + party (invite/leave, แชร์ EXP) + ranking (level/kills) + MVP (world boss killer) | server | B (W2/W4) | |
| S14 | Enhancement (Refiner) + Mount (Stable) | server | C (W4) | GDD §18 mount, §34 enhancement |

## 2. Data เพิ่ม (`shared/data`)

- `items.json`: `HP_POTION` {type Consumable, heal 60, cooldown 1, buy 20, sell 5}, `IRON_ORE.buy 15`
- `npcs.json`: `{ id, name, kind: "shop"|"craft"|"stylist"|"talk", pos, lines[], stock[] }`
- `skills.json`: เพิ่ม `icon`, `hotbarDefault`
- `objectives.json`: ลำดับ hint + เงื่อนไขจบ (client-only)

## 3. UI framework

- `ui/windows.ts`: `Window(id, title)` ลากได้, toggle จากปุ่มมุมขวาล่าง, จำตำแหน่งใน localStorage, ปิดด้วย x/Esc
- `ui/drag.ts`: drag source (inventory slot / skill) → drop target (hotbar / equip slot)
- ทุก panel อ่าน state จาก `Player` ผ่าน `ui.refresh()` ต่อเฟรม (throttle 10 Hz)
- Layout ตาม Toonda: portrait+HP/MP/EXP ซ้ายบน · minimap ขวาบน · chat ซ้ายล่าง · hotbar กลางล่าง · ปุ่ม window ขวาล่าง · objective ใต้ portrait

## 4. ลำดับทำ Stage A

A1 windows framework + status window + allocate · A2 inventory/equip windows + potion + drag → hotbar · A3 chat/system log + commands · A4 minimap + coords · A5 NPC dialog (shop/craft/stylist/talk) · A6 character creator + guest name · A7 objective + death screen + options + sit
