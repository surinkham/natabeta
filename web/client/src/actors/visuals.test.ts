import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyEquipVisuals } from "./visuals";

describe("refined equipment parts", () => {
  it("replaces the whole shield and hides all legacy trim without changing source colours", () => {
    const root = new THREE.Group();
    for (const name of ["SM_KiteShield", "SM_KiteShield_Trim", "SM_KiteShield_Emblem"]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({color:0x233c72}));
      mesh.name = name; root.add(mesh);
    }
    applyEquipVisuals(root, {});
    expect(root.children.every(n => !n.visible)).toBe(true);
    applyEquipVisuals(root, {OffHand:"KITE_SHIELD"});
    expect(root.children.filter(n=>n.userData.designedEquipment)).toHaveLength(1);
    expect(root.children.filter(n=>!n.userData.designedEquipment).every(n=>!n.visible)).toBe(true);
    for (const child of root.children.filter(n=>!n.userData.designedEquipment)) expect(((child as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x233c72);
    applyEquipVisuals(root, {});
    expect(root.children.every(n => !n.visible)).toBe(true);
  });
  it("repeated refreshes do not accumulate an equipment tint", () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({color:0xb9b9b9}));
    mesh.name = "SK_Knight_Chest"; root.add(mesh);
    applyEquipVisuals(root, {Chest:"STARTER_CHEST"});
    const first = mesh.material.color.clone(), firstGeometry=mesh.geometry;
    applyEquipVisuals(root, {Chest:"STARTER_CHEST"});
    expect(mesh.material.color.equals(first)).toBe(true);
    applyEquipVisuals(root, {Chest:"KNIGHT_CHEST"});
    expect(mesh.material.color.getHex()).toBe(0xffffff);
    expect(mesh.geometry).not.toBe(firstGeometry);
    expect(mesh.geometry.getAttribute("color")).toBeDefined();
    applyEquipVisuals(root,{Chest:"STARTER_CHEST"});
    expect(mesh.geometry).toBe(firstGeometry);
  });
  it("an item with a model of its own replaces the authored piece in its place, and removes the replacement when unequipped", () => {
    const root = new THREE.Group(), hand = new THREE.Group(), sword = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    sword.name = "SM_KnightSword"; sword.position.set(0.1, 0.2, 0.3); hand.add(sword); root.add(hand);
    const built = () => hand.children.filter(n => n.userData.designedEquipment);
    applyEquipVisuals(root, {MainWeapon:"FROST_BLADE"});
    expect(sword.visible).toBe(false);
    const n = built().length;
    expect(n).toBeGreaterThan(0);
    const box = new THREE.Box3(); for (const m of built()) box.expandByObject(m);
    expect(box.containsPoint(new THREE.Vector3(0.1, 0.2, 0.3))).toBe(true);   // built where the authored sword was
    applyEquipVisuals(root, {MainWeapon:"FROST_BLADE"});
    expect(built()).toHaveLength(n);   // a refresh keeps the model, not a second copy
    applyEquipVisuals(root, {MainWeapon:"IRON_SWORD"});
    expect(built().length).toBeGreaterThan(0);
    applyEquipVisuals(root, {});
    expect(built()).toHaveLength(0);
    expect(sword.visible).toBe(false);
    applyEquipVisuals(root, {MainWeapon:"WOLF_FANG_SWORD"});
    expect(sword.visible).toBe(false);
    expect(built().length).toBeGreaterThan(0);
  });
});
