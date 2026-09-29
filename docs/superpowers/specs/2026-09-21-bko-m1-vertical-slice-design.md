# Beast Kingdom Online — Technical Design: Milestone 1 Vertical Slice

> อ้างอิง GDD v0.3 §28, §31, §35
> วันที่: 2026-09-21
> สถานะ: Approved design → รอ implementation plan

---

## 0. สรุป

| หัวข้อ | ค่าที่ lock |
|---|---|
| Engine | Unreal Engine 5.5+, C++ เป็นหลัก, Blueprint เฉพาะ data/visual/anim |
| Gameplay framework | Gameplay Ability System (GAS) |
| Network | Server-authoritative ตั้งแต่วันแรก, M1 ทดสอบด้วย ListenServer (PIE 2 client) |
| Backend / Save | ไม่มีใน M1 (v0.2) |
| Project layout | 1 game module `BeastKingdom`, folder แยก domain (ไม่แยก plugin) |
| Platform | PC (Windows) + Android (Vulkan) — build Android ตั้งแต่ task 03 |
| ทีม | 1–2 คน |

**Definition of Done M1:**
loop `Starter Town → Grassland → เจอ Wolf → สู้ → Drop → Inventory → กลับเมือง → Craft Wolf Fang Sword → ดาบโผล่ในมือ` เล่นได้บน PC และ Android, 2 client พร้อมกันบน ListenServer, ทุก client เห็นดาบตรงกัน

---

## 1. Scope M1

### 1.1 In scope

- เผ่า Dog สายพันธุ์ Shiba 1 ตัว (ไม่มี Character Creator — ใช้ default)
- Map: `L_StarterTown` (safe zone, Craft NPC) + `L_Grassland` (Wolf spawner ×3) — M1 ใช้ 1 level ที่มี 2 โซนติดกัน ไม่ต้อง level streaming
- Camera 2.5D (pitch −45°, ไม่หมุน, zoom ได้)
- Movement: WASD (PC) / virtual joystick (Mobile), CMC prediction
- Combat: Basic Attack, Slash (AoE), Dash, soft-target nearest enemy in cone
- Monster: Forest Wolf 1 ชนิด — aggro (sight + damage), chase, leash, respawn
- Loot: auto-loot เข้า inventory ของ killer
- Inventory: stack, capacity 30 ช่อง
- EXP / Level / StatPoints (5/level, max 20)
- Equipment: slot MainWeapon, Chest, Boots (visual ครบ), stat mods
- Crafting: Craft NPC + 1 recipe
- Gold: ได้จาก Wolf drop, ใช้ใน recipe
- UI: HP bar, damage number, inventory grid, craft panel, stat allocate panel, skill bar
- Android build บนเครื่องจริง

### 1.2 Out of scope (มีใน roadmap แต่ไม่ทำ M1)

Cat/Mouse, character creator, skill shop, world boss, mount, trade, guild, save/DB, login, death penalty, durability, enhancement, transmog, object fade, camera rotate, day/night, sound (placeholder เท่านั้น)

### 1.3 Decision ที่ปิดสำหรับ M1 (ทับ GDD §34 open list)

| Decision | ค่า | เหตุผล |
|---|---|---|
| Loot | auto-loot ให้ killer | ไม่ต้องทำ pickup actor + ownership timer |
| Death penalty | ไม่มี, respawn ที่ town 5s | ไม่กระทบ loop |
| Stat point/level | 5 | ค่าตั้งต้น ปรับใน DT_Levels |
| Max level | 20 | พอสำหรับ M1 |
| Skill acquisition | ได้ฟรี 3 ตัวตอน spawn | ยังไม่มีร้าน |
| Camera rotate | ไม่หมุน | ทดสอบ 2 แบบใน v0.2 |
| Item durability / enhance | ไม่มี | — |
| Damage formula | §4.3 | ค่าทั้งหมดใน CurveTable |
| Movement input | WASD/joystick ไม่ใช่ click-to-move | CMC prediction ฟรี, click-to-move ต้องทำ path replication เอง |

---

## 2. Architecture

### 2.1 Ownership

```
ABKGameMode        (server only)   spawn player, respawn, spawner registry
ABKGameState       (replicated)    — (M1 ว่าง; เผื่อ world time / boss state)
ABKPlayerState     (replicated)    UBKAbilitySystemComponent
                                   UBKAttributeSet
                                   UBKInventoryComponent   (owner-only)
ABKPlayerController (owner)        Enhanced Input, Server RPC ทั้งหมด, HUD
ABKPlayerCharacter  (replicated)   UBKEquipmentComponent   (ทุกคนเห็น)
                                   UBKEquipVisualComponent (client cosmetic)
                                   UBKCameraComponent, CMC
ABKMonsterCharacter (replicated)   ASC + AttributeSet บนตัวเอง, UBKLootComponent
ABKMonsterAIController (server)    Perception + BehaviorTree
ABKSpawner          (server)       respawn timer
```

**ทำไม ASC/Inventory อยู่บน PlayerState:** ตายแล้ว pawn ถูก destroy แต่ PlayerState อยู่ → ค่าไม่หาย, v0.2 save/load serialize จาก PlayerState ที่เดียว (pattern เดียวกับ Lyra)

**ทำไม Equipment อยู่บน Character:** ทุก client ต้องเห็น visual → replicate จาก actor ที่ relevant ให้ทุกคน (PlayerState replicate ให้ทุกคนอยู่แล้วแต่ visual ต้องผูก mesh ของ pawn)

### 2.2 Trust boundary

| ฝั่ง | ทำได้ | ทำไม่ได้ |
|---|---|---|
| Client | input, CMC prediction, ability local-predict (anim/VFX), UI, camera | คำนวณ damage, เปลี่ยน attribute, เพิ่ม item, roll drop, craft |
| Server | ทุกอย่างข้างขวา + validate ทุก RPC | — |

ทุก `Server_*` RPC ใช้ `WithValidation` และเช็ค ownership/range/state ก่อนทำ

### 2.3 Damage path (path เดียว ห้ามมีทางอื่น)

```
GA_* (server + local predict)
  → MakeOutgoingSpec(GE_Damage) + SetByCaller(Data.Coef)
  → ApplyGameplayEffectSpecToTarget
  → UBKDamageExecCalc::Execute_Implementation   ← สูตรอยู่ตรงนี้ที่เดียว
  → Meta attribute Damage
  → UBKAttributeSet::PostGameplayEffectExecute
       HP -= Damage; clamp
       broadcast OnDamaged (damage number, hit anim)
       if HP <= 0 → ABKCharacterBase::HandleDeath (server)
            monster: UBKLootComponent::GrantLoot(killer) + Exp
            player : GameMode->RequestRespawn(5s)
```

---

## 3. Project layout

### 3.1 Source

```
Source/BeastKingdom/
├── BeastKingdom.Build.cs        deps: GameplayAbilities, GameplayTags, GameplayTasks,
│                                      EnhancedInput, AIModule, NavigationSystem, UMG, NetCore
├── Core/
│   ├── BKGameMode.h/.cpp
│   ├── BKGameState.h/.cpp
│   ├── BKPlayerController.h/.cpp
│   ├── BKPlayerState.h/.cpp
│   └── BKGameplayTags.h/.cpp      native tag declarations
├── Attributes/
│   └── BKAttributeSet.h/.cpp
├── Abilities/
│   ├── BKAbilitySystemComponent.h/.cpp
│   ├── BKGameplayAbility.h/.cpp
│   ├── BKAbilitySet.h/.cpp         UPrimaryDataAsset: abilities + init effects
│   ├── BKDamageExecCalc.h/.cpp
│   └── BKAbility_MeleeBase.h/.cpp  overlap sweep helper ให้ BasicAttack/Slash
├── Characters/
│   ├── BKCharacterBase.h/.cpp
│   ├── BKPlayerCharacter.h/.cpp
│   └── BKMonsterCharacter.h/.cpp
├── AI/
│   ├── BKMonsterAIController.h/.cpp
│   ├── BKSpawner.h/.cpp
│   └── BTTask_BKAttack.h/.cpp
├── Inventory/
│   ├── BKItemTypes.h                FBKItemInstance, FBKInventoryList (FastArray)
│   └── BKInventoryComponent.h/.cpp
├── Equipment/
│   ├── BKEquipmentComponent.h/.cpp
│   └── BKEquipVisualComponent.h/.cpp
├── Crafting/
│   └── BKCraftingLibrary.h/.cpp
├── Loot/
│   └── BKLootComponent.h/.cpp
├── Interaction/
│   ├── BKInteractable.h             UINTERFACE
│   └── BKCraftNPC.h/.cpp
├── Camera/
│   └── BKCameraComponent.h/.cpp
├── Data/
│   ├── BKDataTypes.h                struct ของทุก DataTable
│   └── BKDataSubsystem.h/.cpp       UGameInstanceSubsystem: DT cache + lookup
├── UI/
│   ├── BKHUD.h/.cpp
│   └── BKDamageNumberComponent.h/.cpp
└── Tests/
    ├── BKDamageCalcTest.cpp
    ├── BKInventoryTest.cpp
    ├── BKCraftingTest.cpp
    └── BKDropRollTest.cpp
```

### 3.2 Content (ตัด GDD §26 เหลือที่ใช้ M1)

```
Content/
├── Core/            BP_GameMode, BP_PlayerController, BP_PlayerState, Input/ (IMC_KBM, IMC_Touch, IA_*)
├── Characters/Canine/Shiba/   SK_Shiba_Body, parts, ABP_Chibi, AM_*
├── Characters/Shared/         SK_BK_Chibi (skeleton), M_Toon, MF_CelShade, PP_Outline
├── Monsters/Wolf/             SK_Wolf, ABP_Wolf, BP_Wolf, BT_Monster, BB_Monster
├── Abilities/                 GA_BasicAttack, GA_Slash, GA_Dash, GE_Damage, GE_InitStats,
│                              GE_LevelUp, GE_EquipStats, DA_AbilitySet_Player, DA_AbilitySet_Wolf
├── Items/Weapons/             SM_WolfFangSword, SM_WoodenSword
├── Items/Armor/               SK_Chest_Starter, SK_Boots_Starter
├── Data/                      DT_Items, DT_Monsters, DT_Drops, DT_Recipes, DT_Skills,
│                              DT_EquipVisuals, DT_Levels, CT_Formulas  (+ CSV source ใน /Data/Source)
├── World/                     L_M1 (town + grassland), BP_Spawner, BP_CraftNPC, BP_RespawnPoint
├── UI/                        WBP_HUD, WBP_HPBar, WBP_DamageNumber, WBP_Inventory, WBP_Craft,
│                              WBP_Stats, WBP_SkillBar, WBP_TouchControls
└── FX/                        NS_Hit, NS_Slash (Niagara, mobile-safe)
```

---

## 4. Data

### 4.1 Gameplay Tags (native, `BKGameplayTags.h`)

```
Attribute.Primary.STR / AGI / VIT / INT / DEX / LUK
Attribute.Derived.MaxHP / HP / ATK / MATK / DEF / MDEF / AtkSpeed / MoveSpeed / Crit / Dodge / Hit
Attribute.Meta.Damage
Data.Coef                          SetByCaller ค่าคูณ skill
Data.Crit                          SetByCaller flag (1/0) จาก ExecCalc
Ability.Attack.Basic
Ability.Attack.Slash
Ability.Movement.Dash
State.Dead
State.Stunned                      (reserve)
Event.Death
Event.Damaged
Event.LevelUp
Item.Type.Material / Weapon / Armor / Consumable
Item.Slot.MainWeapon / OffHand / Head / Chest / Gloves / Pants / Boots / Back
Station.Craft.Blacksmith
Input.Move / Look / Attack / Skill1 / Skill2 / Interact / Inventory
```

### 4.2 DataTable row structs (`BKDataTypes.h`)

```cpp
USTRUCT(BlueprintType)
struct FBKItemStack { FName ItemId; int32 Count = 1; };

USTRUCT(BlueprintType)
struct FBKItemDef : public FTableRowBase
{
    FName ItemId;                       // == row name
    FText DisplayName;
    FGameplayTag ItemType;              // Item.Type.*
    int32 MaxStack = 99;                // equipment = 1
    FGameplayTag EquipSlot;             // Item.Slot.* หรือ empty
    TMap<FGameplayTag, float> StatMods; // Attribute.* → additive
    FName VisualId;                     // row ใน DT_EquipVisuals
    int32 SellPrice = 0;
    TSoftObjectPtr<UTexture2D> Icon;
};

USTRUCT(BlueprintType)
struct FBKMonsterDef : public FTableRowBase
{
    FName MonsterId;
    FText DisplayName;
    int32 Level = 1;
    float STR, AGI, VIT, INT, DEX, LUK;
    int32 Exp = 0;
    FName DropTableId;
    TSoftClassPtr<ABKMonsterCharacter> PawnClass;
    float AggroRadius = 800.f;
    float LeashRadius = 2000.f;
    float RespawnSec = 30.f;
};

USTRUCT(BlueprintType)
struct FBKDropEntry : public FTableRowBase
{
    FName DropTableId;      // หลาย row ใช้ DropTableId เดียวกัน
    FName ItemId;           // "GOLD" = gold
    float Chance = 1.f;     // 0..1 roll แยกต่อ row
    int32 Min = 1, Max = 1;
};

USTRUCT(BlueprintType)
struct FBKRecipe : public FTableRowBase
{
    FName RecipeId;
    FName ResultItemId;
    int32 ResultCount = 1;
    TArray<FBKItemStack> Ingredients;
    int32 GoldCost = 0;
    FGameplayTag StationTag;   // Station.Craft.*
};

USTRUCT(BlueprintType)
struct FBKSkillDef : public FTableRowBase
{
    FName SkillId;
    FText DisplayName;
    TSoftClassPtr<UBKGameplayAbility> AbilityClass;
    float Coef = 1.f;          // ส่งเป็น SetByCaller Data.Coef
    float Cooldown = 1.f;
    int32 GoldPrice = 0;       // ยังไม่ใช้ M1
    TSoftObjectPtr<UTexture2D> Icon;
};

USTRUCT(BlueprintType)
struct FBKEquipVisual : public FTableRowBase
{
    FName VisualId;
    FGameplayTag Slot;
    TSoftObjectPtr<UStreamableRenderAsset> Mesh;   // SkeletalMesh (armor) หรือ StaticMesh (weapon)
    FName Socket;                                   // ใช้เฉพาะ StaticMesh
    FTransform Offset;
};

USTRUCT(BlueprintType)
struct FBKLevelRow : public FTableRowBase
{
    int32 Level;
    int32 ExpToNext;
    int32 StatPoints = 5;
};
```

### 4.3 CurveTable `CT_Formulas` (row = ชื่อค่า, X=Level แต่ M1 flat)

| Row | ค่า M1 |
|---|---|
| HP_Base | 100 |
| HP_PerVIT | 10 |
| HP_PerLevel | 5 |
| ATK_PerSTR | 2 |
| ATK_PerDEX | 0.5 |
| MATK_PerINT | 2 |
| DEF_PerVIT | 1 |
| MDEF_PerINT | 0.5 |
| Crit_Base | 5 |
| Crit_PerLUK | 0.5 |
| Crit_Cap | 50 |
| Crit_Mult | 1.5 |
| Dodge_PerAGI | 0.3 |
| Dodge_Cap | 30 |
| Hit_Base | 90 |
| Hit_PerDEX | 0.2 |
| AtkSpeed_PerAGI | 0.01 |
| MoveSpeed_Base | 600 |
| Dmg_VarMin | 0.95 |
| Dmg_VarMax | 1.05 |

**สูตร (ใน `UBKDamageExecCalc` + `UBKAttributeSet` recalc):**

```
MaxHP  = HP_Base + VIT*HP_PerVIT + Level*HP_PerLevel
ATK    = STR*ATK_PerSTR + DEX*ATK_PerDEX + Σ equip StatMods[ATK]
DEF    = VIT*DEF_PerVIT + Σ equip StatMods[DEF]
Crit%  = min(Crit_Cap, Crit_Base + LUK*Crit_PerLUK)
Dodge% = min(Dodge_Cap, AGI*Dodge_PerAGI)
Hit%   = Hit_Base + DEX*Hit_PerDEX

ExecCalc:
  if rand100 > Hit_attacker - Dodge_target → Miss (Damage = 0, tag Miss)
  raw   = ATK_attacker * Coef - DEF_target
  crit  = rand100 < Crit_attacker
  dmg   = max(1, raw) * (crit ? Crit_Mult : 1) * rand(Dmg_VarMin, Dmg_VarMax)
  output Damage = floor(dmg), SetByCaller Data.Crit = crit
```

Random ใช้ `FMath::RandRange` ฝั่ง server เท่านั้น (ExecCalc รันบน server; client ไม่ predict damage)

### 4.4 Seed data M1

**DT_Items**

| ItemId | Type | MaxStack | Slot | StatMods | VisualId | Sell |
|---|---|---|---|---|---|---|
| WOLF_FANG | Material | 99 | — | — | — | 5 |
| WOLF_HIDE | Material | 99 | — | — | — | 8 |
| IRON_ORE | Material | 99 | — | — | — | 3 |
| WOODEN_SWORD | Weapon | 1 | MainWeapon | ATK+5 | VIS_WOODEN_SWORD | 10 |
| WOLF_FANG_SWORD | Weapon | 1 | MainWeapon | ATK+18, Crit+2 | VIS_WOLF_FANG_SWORD | 120 |
| STARTER_CHEST | Armor | 1 | Chest | DEF+3 | VIS_STARTER_CHEST | 5 |
| STARTER_BOOTS | Armor | 1 | Boots | DEF+1 | VIS_STARTER_BOOTS | 3 |

**DT_Monsters:** `MON_WOLF_001` Forest Wolf L5, STR12 AGI10 VIT15 INT1 DEX8 LUK3, Exp 20, Drop `DROP_WOLF`, Aggro 800, Leash 2000, Respawn 30

**DT_Drops (DROP_WOLF):** WOLF_FANG 60% 1–2, WOLF_HIDE 40% 1, IRON_ORE 30% 1–2, GOLD 100% 5–15

**DT_Recipes:** `RCP_WOLF_FANG_SWORD` → WOLF_FANG_SWORD ×1; ingredients WOLF_FANG×10, IRON_ORE×5 (IRON_ORE drop จาก Wolf ใน M1 เพื่อไม่ต้องทำ Mine/shop); Gold 50; Station.Craft.Blacksmith

**DT_Levels:** ExpToNext = 50 × Level (L1→2 = 50 … L19→20 = 950), StatPoints 5

**Player start:** L1, STR5 AGI5 VIT5 INT5 DEX5 LUK5, Gold 0, WOODEN_SWORD + STARTER_CHEST + STARTER_BOOTS equipped

---

## 5. Class spec

### 5.1 `UBKAttributeSet`

- Primary: STR, AGI, VIT, INT, DEX, LUK — `COND_OwnerOnly`
- Derived: MaxHP, HP, ATK, MATK, DEF, MDEF, AtkSpeed, MoveSpeed, Crit, Dodge, Hit — HP/MaxHP replicate ทุกคน, ที่เหลือ owner-only
- Progress: Level, Exp, StatPoints, Gold — Level ทุกคน, ที่เหลือ owner-only
- Meta: Damage (ไม่ replicate)
- `PreAttributeChange`: clamp HP ∈ [0, MaxHP]
- `PostGameplayEffectExecute`: handle Damage → HP → death; handle Exp → level up loop (อาจขึ้นหลาย level ต่อครั้ง)
- `RecalculateDerived()`: server เรียกหลัง primary/equipment เปลี่ยน — คำนวณจาก CT_Formulas + equip mods (equip mods apply เป็น infinite GE `GE_EquipStats` ต่อ slot, ExecCalc อ่านค่า derived ที่รวมแล้ว)
- MoveSpeed → `CMC->MaxWalkSpeed` ผ่าน delegate (server + owner)

### 5.2 `UBKAbilitySystemComponent`

- `ReplicationMode`: Player = `Mixed`, Monster = `Minimal`
- `GrantAbilitySet(UBKAbilitySet*)` server only
- Input binding ผ่าน `Ability.*` tag → `TryActivateAbilitiesByTag`

### 5.3 `UBKGameplayAbility` / abilities

| Ability | Tag | Cost/CD | Behavior |
|---|---|---|---|
| GA_BasicAttack | Ability.Attack.Basic | CD = 1/AtkSpeed | montage AM_Attack01/02 สลับ, AnimNotify `Hit` → sweep sphere r=120 หน้าตัว 90° → apply GE_Damage Coef 1.0 ให้ target ใกล้สุด 1 ตัว |
| GA_Slash | Ability.Attack.Slash | CD 4s | montage AM_Slash, sweep r=250 หน้า 120° → ทุก target Coef 1.6 |
| GA_Dash | Ability.Movement.Dash | CD 3s | `RootMotionSource` constant force 800uu 0.2s ทิศ input, tag `State.Dashing` กัน activate ซ้ำ |

- Policy: `LocalPredicted` ทั้ง 3 (anim/dash ลื่น) — damage apply เฉพาะ `HasAuthority()`
- Blocked by `State.Dead`
- `UBKAbility_MeleeBase::SweepTargets(radius, angle)` ใช้ `SphereOverlapActors` filter `ABKCharacterBase` + team check (player ตี monster เท่านั้น M1)

### 5.4 `UBKDamageExecCalc`

- Capture: source ATK, Crit, Hit; target DEF, Dodge
- อ่าน CT_Formulas ผ่าน `UBKDataSubsystem`
- ตาม §4.3
- Output modifier: `Damage` additive + `SetByCaller Data.Crit` ใน spec (ให้ AttributeSet/UI รู้ว่า crit)

### 5.5 `ABKCharacterBase`

```cpp
class ABKCharacterBase : public ACharacter, public IAbilitySystemInterface
{
    virtual UAbilitySystemComponent* GetAbilitySystemComponent() const override; // pure virtual-ish, override ใน subclass
    UPROPERTY(ReplicatedUsing=OnRep_Dead) bool bDead;
    virtual void HandleDeath(AActor* Killer);   // server
    UFUNCTION() void OnRep_Dead();               // anim + disable collision
    virtual uint8 GetTeamId() const;             // 0 player, 1 monster
};
```

- Death: set `bDead`, add tag `State.Dead`, `CancelAllAbilities`, disable capsule, montage AM_Death, monster → `SetLifeSpan(3)` หลัง loot

### 5.6 `ABKPlayerCharacter`

- `PossessedBy` (server) + `OnRep_PlayerState` (client): `InitAbilityActorInfo(PlayerState, this)`; server grant `DA_AbilitySet_Player` ครั้งเดียว (flag บน PlayerState)
- Components: `UBKCameraComponent`, `UBKEquipmentComponent`, `UBKEquipVisualComponent`
- Body parts: `USkeletalMeshComponent` ×(Body, Head, Ears, Tail, Chest, Boots, Hair) ทั้งหมด `SetLeaderPoseComponent(Body)`
- Soft target: `FindSoftTarget()` — nearest monster ใน 600uu หน้า 120° → ใช้ rotate ตัวก่อน attack (client ส่งทิศผ่าน ability payload; server sweep ใหม่เอง ไม่ trust target จาก client)

### 5.7 `ABKMonsterCharacter`

- `MonsterId` (FName) set โดย spawner → `BeginPlay` (server) อ่าน DT_Monsters → init attributes ผ่าน GE_InitStats SetByCaller
- ASC + AttributeSet ในตัว, `InitAbilityActorInfo(this, this)`
- `UBKLootComponent`
- `HandleDeath(Killer)`: loot → ให้ Exp killer → notify spawner → lifespan

### 5.8 `ABKMonsterAIController` + `BT_Monster`

Blackboard: `TargetActor`, `HomeLocation`, `bLeashing`

```
Selector
├── [bDead] → Idle
├── [bLeashing] → MoveTo HomeLocation → clear bLeashing
├── [TargetActor valid]
│     Sequence: if dist(Home) > Leash → set bLeashing, clear Target
│               MoveTo Target (accept 150)
│               BTTask_BKAttack → ASC TryActivate Ability.Attack.Basic
└── Wander around Home r=400 / Wait 2–4s
```

- Aggro: `AIPerception` Sight (radius = AggroRadius, lose 1.5×) + `OnDamaged` delegate → set Target ทันที
- Target priority: ตัวที่ damage ล่าสุด (M1 ไม่ทำ threat table)
- Server only — AIController ไม่ spawn บน client

### 5.9 `ABKSpawner` (server)

- `MonsterId`, `Count`, `Radius`
- BeginPlay spawn `Count` ตัว random ใน radius บน NavMesh
- `OnMonsterDied` → timer `RespawnSec` → spawn ใหม่

### 5.10 `UBKInventoryComponent` (บน PlayerState)

```cpp
USTRUCT() struct FBKItemInstance : public FFastArraySerializerItem
{ FGuid InstanceId; FName ItemId; int32 Count; };

USTRUCT() struct FBKInventoryList : public FFastArraySerializer
{ TArray<FBKItemInstance> Items; /* NetDeltaSerialize */ };

class UBKInventoryComponent : public UActorComponent
{
    UPROPERTY(Replicated) FBKInventoryList List;   // COND_OwnerOnly
    int32 Capacity = 30;

    // server only
    bool AddItem(FName ItemId, int32 Count);          // stack ก่อน, เต็ม → false ไม่ partial
    bool RemoveItem(FName ItemId, int32 Count);       // ข้าม stack
    bool RemoveInstance(FGuid Id);
    // any
    int32 CountOf(FName ItemId) const;
    bool HasAll(const TArray<FBKItemStack>&) const;
    const FBKItemInstance* Find(FGuid Id) const;
    DECLARE_MULTICAST_DELEGATE(FOnInventoryChanged) OnChanged;  // FastArray PostReplicatedAdd/Change/Remove → broadcast
};
```

Gold ไม่ใช่ item — เป็น attribute `Gold` ใน AttributeSet (GDD: currency เดียว, ให้ GE จัดการ)

### 5.11 `UBKEquipmentComponent` (บน Character)

```cpp
USTRUCT() struct FBKEquipSlot { FGameplayTag Slot; FName ItemId; FGuid InstanceId; FActiveGameplayEffectHandle StatsHandle; };

UPROPERTY(ReplicatedUsing=OnRep_Slots) TArray<FBKEquipSlot> Slots;   // ทุกคนเห็น (ItemId พอ)

// server
bool Equip(FGuid InstanceId);     // validate: instance อยู่ใน inventory, item มี EquipSlot, ไม่ dead
bool Unequip(FGameplayTag Slot);  // คืน inventory (ต้องมีที่ว่าง)
// เอา item ออกจาก inventory ตอน equip, ใส่กลับตอน unequip → item อยู่ที่เดียวเสมอ
// apply GE_EquipStats (infinite, SetByCaller ต่อ StatMods) เก็บ handle; unequip → RemoveActiveGameplayEffect
void OnRep_Slots() → UBKEquipVisualComponent::Refresh(Slots)
```

### 5.12 `UBKEquipVisualComponent` (client + server cosmetic)

- `Refresh(Slots)`: ต่อ slot → lookup DT_EquipVisuals[VisualId]
  - SkeletalMesh (armor) → set mesh ของ part component ที่ตรง slot (Chest→ChestComp, Boots→BootsComp), ว่าง → default starter mesh
  - StaticMesh (weapon) → `UStaticMeshComponent` attach socket `hand_r` + Offset
- Async load ผ่าน `UAssetManager::GetStreamableManager().RequestAsyncLoad`

### 5.13 `UBKCraftingLibrary` (static, pure — test ได้ไม่ต้อง world)

```cpp
static bool CanCraft(const UBKInventoryComponent*, float Gold, const FBKRecipe&, FText& OutReason);
static bool Craft(UBKInventoryComponent*, UBKAbilitySystemComponent*, const FBKRecipe&);
// Craft: server only. ลำดับ: CanCraft → RemoveItem ทุก ingredient → apply GE Gold -Cost → AddItem result
// ถ้า AddItem fail (เต็ม) → ห้ามเกิด: CanCraft ต้องเช็คช่องว่างหลังเอาวัตถุดิบออกแล้วก่อน
```

### 5.14 `UBKLootComponent` (บน Monster, server)

- `GrantLoot(ABKPlayerState* Killer)`: roll ทุก row ของ DropTableId → `Inventory->AddItem` / Gold GE; item ที่ใส่ไม่ลง → ทิ้ง + log (M1 ยอมรับ)
- Exp: apply GE `Exp += MonsterDef.Exp`
- ส่ง `Client_LootToast(ItemId, Count)` ให้ killer แสดง UI

### 5.15 `ABKPlayerController`

```cpp
// Enhanced Input: IMC_KBM (PC) / IMC_Touch (Android) เลือกตาม platform ตอน BeginPlay
// IA_Move → CMC AddMovementInput (world XY ตาม camera yaw fix)
// IA_Attack → ASC tag Ability.Attack.Basic
// IA_Skill1/2 → Slash / Dash
// IA_Interact → trace nearest IBKInteractable r=200 → Server_Interact
// IA_Inventory → toggle WBP_Inventory

UFUNCTION(Server, Reliable, WithValidation) void Server_Craft(FName RecipeId);
UFUNCTION(Server, Reliable, WithValidation) void Server_Equip(FGuid InstanceId);
UFUNCTION(Server, Reliable, WithValidation) void Server_Unequip(FGameplayTag Slot);
UFUNCTION(Server, Reliable, WithValidation) void Server_AllocateStat(FGameplayTag Attr, int32 Points);
UFUNCTION(Server, Reliable, WithValidation) void Server_Interact(AActor* Target);
UFUNCTION(Client, Reliable) void Client_LootToast(FName ItemId, int32 Count);
UFUNCTION(Client, Reliable) void Client_CraftResult(bool bOk, const FText& Reason);
```

Validate rules:
- `Server_Craft`: pawn อยู่ห่าง Craft NPC ≤ 300uu, NPC มี StationTag ตรง recipe, ไม่ dead
- `Server_Equip/Unequip`: ไม่ dead
- `Server_AllocateStat`: Points ≥1, ≤ StatPoints, Attr เป็น Attribute.Primary.*
- `Server_Interact`: dist ≤ 300, implements IBKInteractable

### 5.16 `ABKGameMode`

- `PostLogin` → spawn pawn ที่ `BP_RespawnPoint` (town)
- `RequestRespawn(PC, 5s)` → destroy old pawn, spawn ใหม่, HP = MaxHP (GE_Respawn), PlayerState คงเดิม
- ตอน spawn ครั้งแรก: grant starter items + equip (flag `bInitialized` บน PlayerState)

### 5.17 `UBKCameraComponent`

- `USpringArmComponent`: length 1200 (range 800–1600), rotation pitch −45°, yaw 0 fixed, `bUsePawnControlRotation=false`, `bDoCollisionTest=true`, lag 0.1
- `UCameraComponent`: FOV 35
- Zoom: IA_Zoom (wheel / pinch) ± 100 per tick, clamp
- ไม่มี rotate M1 → movement input ใช้ world axis คงที่ (X = ขวาจอ)

### 5.18 `UBKDataSubsystem` (`UGameInstanceSubsystem`)

- โหลด DT ทั้งหมดจาก `UBKDeveloperSettings` (soft ref, ตั้งใน Project Settings)
- `const FBKItemDef* GetItem(FName)`, `GetMonster`, `GetRecipe`, `GetSkill`, `GetVisual`, `GetLevel(int32)`, `float Formula(FName Row)`
- `TArray<const FBKDropEntry*> GetDrops(FName DropTableId)` cache map ตอน init

### 5.19 UI

| Widget | Data source |
|---|---|
| WBP_HUD | container |
| WBP_HPBar (self + target) | ASC attribute change delegate HP/MaxHP |
| WBP_DamageNumber | `UBKDamageNumberComponent` (WidgetComponent pool 16) spawn ตอน OnDamaged, สีแดง crit / ขาวปกติ / เทา miss |
| WBP_Inventory | `Inventory->OnChanged` grid 30, click equipment → Server_Equip |
| WBP_Craft | เปิดจาก `Client_OpenCraft(NPC)`; แสดง recipe ที่ StationTag ตรง, ปุ่ม Craft → Server_Craft, แสดง Reason |
| WBP_Stats | 6 primary + StatPoints, ปุ่ม + → Server_AllocateStat |
| WBP_SkillBar | 3 ปุ่ม + cooldown (ASC `GetCooldownTimeRemaining`) |
| WBP_TouchControls | joystick + ปุ่ม attack/skill/interact — visible เฉพาะ Android |

---

## 6. Network

### 6.1 Replication matrix

| Data | Where | Condition | Reason |
|---|---|---|---|
| HP, MaxHP, Level | AttributeSet | All | HP bar เหนือหัวคนอื่น |
| Primary/derived อื่น, Exp, StatPoints, Gold | AttributeSet | OwnerOnly | ลด bandwidth, กันส่อง build |
| Inventory | PlayerState | OwnerOnly | — |
| Equipment Slots | Character | All | ทุกคนเห็น visual (GDD) |
| bDead | Character | All | anim |
| Monster attributes HP/MaxHP | Monster ASC (Minimal) | All | — |
| Monster movement | CMC | All | default |

### 6.2 Relevancy / perf

- Monster `NetCullDistanceSquared = 150m²`, `NetDormancy = DORM_DormantAll` ตอน idle, `FlushNetDormancy` ตอน aggro/damage
- Player `NetUpdateFrequency` 60, Monster 30
- M1 ไม่ทำ replication graph (v0.2/v0.3 เมื่อ >50 player)

### 6.3 Prediction

- Movement: CMC built-in
- Abilities: `LocalPredicted` — client เล่น montage/dash ทันที, server confirm; damage/attribute เกิด server เท่านั้น แล้ว replicate
- Inventory/Equipment/Craft: ไม่ predict — client รอ replicate (< 200ms ยอมรับได้)

### 6.4 Testing net

- PIE: Net Mode = Play As Listen Server, 2 client, `Run Under One Process` off
- Console: `Net PktLag=150 PktLoss=5` เช็ค prediction/rollback
- Cheat check: client `AbilitySystem.Debug` แก้ค่า → server ไม่เปลี่ยน

---

## 7. Art pipeline

### 7.1 Chibi modular (Blender → UE)

- Skeleton เดียว `SK_BK_Chibi` (Rigify metarig human ตัด finger) ใช้ทุกเผ่า
- สัดส่วน head : body ≈ 1 : 1.5, total ~90uu
- Socket มาตรฐาน (ใส่ใน skeleton asset ไม่ใช่ mesh): `head`, `hand_r`, `hand_l`, `back`, `waist`
- Body parts export แยก FBX ใช้ armature เดียว: Body(base), Head_Shiba, Ears_Shiba, Tail_Shiba, Hair_01, Chest_Starter, Boots_Starter
- Naming: `SK_<Race>_<Part>_<Variant>`; weapon `SM_<Name>`
- Weapon pivot ที่ grip, +X ชี้ปลายดาบ → Offset ใน DT ≈ identity
- ขนาดตัว (v0.2): scale bone `root` → socket ตามอัตโนมัติ

### 7.2 Toon

- `MF_CelShade`: stepped Lambert 3 band (0.0/0.5/1.0 threshold ใน scalar param) + rim light
- `M_Toon` master; instance ต่อ part (BaseColor texture + tint)
- Outline PC: `PP_Outline` (depth + normal edge detect) ใน PostProcessVolume
- Outline Mobile: inverted hull (duplicate mesh, flip normal, push 1.5uu) — เปิดผ่าน material switch `IsMobile`
- Budget: ≤ 2 material slot/part, triangle ≤ 8k ตัวเต็มชุด, texture 1024 PC / 512 Android (DeviceProfile TextureLODGroup)

### 7.3 Animation M1

| Shiba | Wolf |
|---|---|
| Idle, Run, Attack01, Attack02, Slash, Dash, Hit, Death | Idle, Walk, Run, Bite, Hit, Death |

- ABP: locomotion blendspace (speed) + slot `DefaultSlot` สำหรับ montage
- AnimNotify `BK_Hit` → ability sweep timing
- Root motion off (dash ใช้ RootMotionSource ให้ CMC predict)

### 7.4 Camera / environment

- Level `L_M1`: town (200×200m) + grassland (300×300m) ติดกัน, NavMesh ทั้งหมด
- Lighting: 1 directional (stationary) + skylight, ไม่มี dynamic point light (mobile)
- Foliage LOD 2 ระดับ, cull 80m

### 7.5 Mobile

- Android: Vulkan, ES3.1 fallback, `r.Mobile.ShadingPath=0`, MSAA 2×
- DeviceProfile `Android_Low/Mid/High` ตั้ง scalability
- Input: `IMC_Touch` + `WBP_TouchControls`
- ทดสอบเครื่องจริงตั้งแต่ task 03 (greybox) ไม่รอ art

---

## 8. Error handling

| กรณี | Behavior |
|---|---|
| RPC validate fail | `return false` → client disconnect (UE default) — ใช้กับ tamper ชัดๆ เท่านั้น (Points ติดลบ, Attr ผิด tag) |
| Logic fail ปกติ (ของไม่พอ, ไกล NPC, inventory เต็ม) | validate `true`, implementation return early + `Client_CraftResult(false, Reason)` |
| DT lookup ไม่เจอ | `ensureMsgf` + return nullptr; caller ข้าม (ไม่ crash server) |
| Loot ใส่ inventory ไม่ลง | ทิ้ง + `UE_LOG(LogBK, Warning)` — M1 ยอมรับ, v0.2 ทำ pickup |
| Async mesh load fail | คง default mesh, log |
| Player disconnect ระหว่าง craft | ไม่มี state ค้าง — craft atomic ใน 1 server call |

---

## 9. Tests

### 9.1 Automation (`Source/BeastKingdom/Tests/`, run `Automation RunTests BK.`)

| Test | Assert |
|---|---|
| `BK.Damage.Formula` | ATK 20 Coef 1 DEF 5 no-crit no-var → 15; DEF > ATK → 1; crit → ×1.5; Hit 0 → 0/miss |
| `BK.Inventory.Stack` | add 60+60 MaxStack 99 → 2 stack (99, 21); remove 100 → 20 เหลือ; add เกิน capacity → false ไม่ partial |
| `BK.Crafting.CanCraft` | ของครบ+gold ครบ → true; ขาด 1 → false + reason; inventory เต็มแต่ผลลัพธ์ stack ได้ → true |
| `BK.Drop.Roll` | roll 10000 ครั้ง chance 0.6 → 55–65%; Count ∈ [Min,Max] |

ExecCalc test: แยกสูตรเป็น static `UBKDamageExecCalc::ComputeDamage(FBKDamageInputs, FRandomStream)` ให้ test ยิงตรงไม่ต้อง ASC

### 9.2 Manual checklist (ต่อ task)

- [ ] 2 client เห็นกันเดิน/ตี/ตาย
- [ ] client B เห็นดาบของ A เปลี่ยนหลัง A craft+equip
- [ ] `Net PktLag=150` ตีแล้ว anim ไม่กระตุก, damage ตรงกับ server log
- [ ] client แก้ attribute ผ่าน console → server ไม่รับ
- [ ] Wolf leash กลับ home เมื่อลากไกล, respawn 30s
- [ ] Android: 30fps+ บนเครื่อง mid, joystick+attack ใช้ได้, ดาบโผล่

---

## 10. Task order

| # | Task | Output | Test |
|---|---|---|---|
| 01 | Project setup | UE 5.5 C++ project, plugins GAS/Tags/EnhancedInput, git + LFS `.gitattributes`, `.gitignore` UE | build ผ่าน |
| 02 | Core + Attributes | GameMode/State/PC/PS, AttributeSet, ASC, GE_InitStats, CT_Formulas, DataSubsystem, native tags | `BK.Damage.Formula` |
| 03 | Greybox + movement + camera + net | L_M1 greybox, CMC, camera, IMC_KBM/Touch, PIE 2 client, **Android build #1** | เดินเห็นกัน 2 client บน PC+Android |
| 04 | Shiba art | SK_BK_Chibi, Shiba parts, M_Toon, PP_Outline, ABP, anim ครบ | เดิน/idle ใน toon look |
| 05 | Combat | GA_BasicAttack, MeleeBase sweep, DamageExecCalc, GE_Damage, HP bar, damage number, death/respawn | ตี dummy → เลขขึ้น server-only |
| 06 | Wolf | SK_Wolf + anim, MonsterCharacter, AIController + BT, Spawner, DT_Monsters | aggro/leash/respawn, ตีคนตาย |
| 07 | Loot + Inventory + Level | LootComponent, InventoryComponent FastArray, Exp/Level/StatPoints, WBP_Inventory/Stats | `BK.Inventory.Stack`, `BK.Drop.Roll` |
| 08 | Equipment + Visual | EquipmentComponent, EquipVisualComponent, DT_EquipVisuals, ดาบ/ชุด mesh, Server_Equip | client B เห็นดาบ A |
| 09 | Crafting | CraftNPC, IBKInteractable, CraftingLibrary, WBP_Craft, DT_Recipes | `BK.Crafting.CanCraft`, loop ครบ |
| 10 | Skills | GA_Slash, GA_Dash, WBP_SkillBar, NS_Slash | cooldown/prediction ok |
| 11 | Polish + Android #2 | profiling (`stat unit`, `stat gpu`), DeviceProfiles, FX budget, sound placeholder | checklist §9.2 ครบ |

---

## 11. สิ่งที่ M1 ตั้งใจเว้น (ทางต่อ)

| ข้าม | เพิ่มเมื่อ |
|---|---|
| Loot pickup actor | v0.2 party/ownership |
| Threat table | boss (v0.3) |
| Replication Graph / Iris | >50 player ต่อ map |
| Save/DB | v0.2 — serialize PlayerState: attributes + inventory + equipment |
| Plugin split | เมื่อมี programmer คนที่ 2+ หรือ module compile > 2 นาที |
| Object fade | หลังมีอาคารจริง |
| Camera rotate test | v0.2 |
