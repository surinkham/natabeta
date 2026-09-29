import type { Object3D } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { graft } from "./actor";

/** Both the creator and world assemble the same rig without changing cached GLBs. */
export function playerModel(base: Object3D, armour: Object3D, weapons: Object3D, _race = "") {   // breeds keep their own authored ears/head (no runtime reshaping)
  const model = clone(base);
  graft(model, armour, name => /^(SK_Knight_|SM_KnightSword|SM_KiteShield)/.test(name) && !model.getObjectByName(name));
  graft(model, weapons, name => name === "SM_WoodenSword" && !model.getObjectByName(name));
  return model;
}
