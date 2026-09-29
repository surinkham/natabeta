import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyEquipVisuals } from '../../client/src/actors/visuals';

describe('fur tint', () => {
  it('two rigs sharing one cached material get their own colours and keep the fur-rim hook', () => {
    const shared = new THREE.MeshToonMaterial(); const hook = () => {}; shared.onBeforeCompile = hook; shared.customProgramCacheKey = () => 'bk-toon-furrim';
    const rig = () => { const root = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(), shared); m.name = 'SK_Husky_Head'; root.add(m); return { root, m }; };
    const a = rig(), b = rig();
    applyEquipVisuals(a.root, {}, 0xff0000, 'husky'); applyEquipVisuals(b.root, {}, 0x0000ff, 'husky');
    const ca = (a.m.material as THREE.MeshToonMaterial).color, cb = (b.m.material as THREE.MeshToonMaterial).color;
    expect(ca.equals(cb)).toBe(false);
    expect(shared.color.getHex()).toBe(0xffffff);                       // the cached source is never touched
    expect(a.m.material).not.toBe(shared);
    expect((a.m.material as THREE.Material).onBeforeCompile).toBe(hook);
    expect((a.m.material as THREE.Material).customProgramCacheKey()).toBe('bk-toon-furrim');
    applyEquipVisuals(a.root, {}, 0, 'husky');                           // natural coat again, same owned copy
    expect((a.m.material as THREE.MeshToonMaterial).color.getHex()).toBe(0xffffff);
  });
  it("a cloned, already-tinted material (equipment doll) keeps a real colour", () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({color:0xb9b9b9}));
    mesh.name = "SK_Knight_Chest"; root.add(mesh);
    applyEquipVisuals(root, {Chest:"STARTER_CHEST"});
    const doll = root.clone(true); doll.traverse((n: any) => { if (n.isMesh) n.material = n.material.clone(); });
    applyEquipVisuals(doll, {Chest:"STARTER_CHEST"});
    const c = ((doll.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color;
    expect([c.r, c.g, c.b].every(Number.isFinite)).toBe(true);
    expect(c.getHex()).toBe((mesh.material as THREE.MeshStandardMaterial).color.getHex());
  });
});
