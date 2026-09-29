import { describe, expect, it } from 'vitest';
import { BLUEPRINT_OF, BOSS_LOOT, EQUIP_VISUALS, ITEMS, KINGDOM_BOSSES, MONSTERS, RECIPES, UNIQUE_OF } from '../data';
const kingdom = new Set(KINGDOM_BOSSES.map(b => b.id));   // they drop the retired Tyrants' blueprints and souls (BOSS_LOOT)
import { craft } from '../crafting';
import { addItem, countOf, createInventory } from '../inventory';

// Every monster kind drops a material nothing else drops; every boss drops a blueprint whose secret recipe turns its
// soul plus unique materials of its land into divine gear.
describe('unique materials and divine gear', () => {
  it('every monster kind has its own unique material, all different', () => {
    const lord = (k: string) => (MONSTERS[k].night || MONSTERS[k].pk) && MONSTERS[k].boss;   // night and PK bosses drop their Tyrant's soul
    const ids = Object.keys(MONSTERS).filter(k => !lord(k) && !kingdom.has(k)).map(k => UNIQUE_OF[k]);
    expect(ids.every(id => ITEMS[id]?.type === 'Material')).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of Object.keys(MONSTERS).filter(lord)) expect(UNIQUE_OF[k]).toBe(UNIQUE_OF[`BOSS_${MONSTERS[k].base}`]);
  });
  it('every boss has a blueprint → secret recipe → divine gear made from unique materials', () => {
    for (const k of kingdom) { expect(BOSS_LOOT[k]?.length, k).toBeGreaterThan(0); for (const e of BOSS_LOOT[k]) expect(ITEMS[e.item], e.item).toBeTruthy(); }
    for (const [k, d] of Object.entries(MONSTERS)) if (d.base && !kingdom.has(k)) {
      const bp = ITEMS[BLUEPRINT_OF[k]], r = RECIPES[bp.unlocks!], gear = ITEMS[r.result];
      expect(r.secret).toBe(true); expect(gear.slot).toBeTruthy(); expect(gear.rare).toBe(true);
      expect(!gear.visual || !!EQUIP_VISUALS[gear.visual]).toBe(true);
      expect(r.ingredients.every(i => i.item.startsWith('UNQ_') && ITEMS[i.item])).toBe(true);
      const inv = createInventory(); for (const i of r.ingredients) addItem(inv, i.item, i.count);
      expect(craft(inv, 1e6, bp.unlocks!)).toBeGreaterThanOrEqual(0); expect(countOf(inv, r.result)).toBe(1);
    }
  });
});
