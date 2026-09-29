import * as THREE from "three";

/** Preserve each breed's rest shape while applying motion authored on the shared rig. */
export function retargetClip(clip: THREE.AnimationClip, source: THREE.Object3D, target: THREE.Object3D) {
  const result = clip.clone();
  for (const track of result.tracks) {
    const binding = THREE.PropertyBinding.parseTrackName(track.name);
    const from = source.getObjectByName(binding.nodeName), to = target.getObjectByName(binding.nodeName);
    if (!from || !to) continue;
    if (binding.propertyName === "quaternion") {
      const offset = to.quaternion.clone().multiply(from.quaternion.clone().invert());
      const q = new THREE.Quaternion();
      for (let i = 0; i < track.values.length; i += 4) {
        q.fromArray(track.values, i).premultiply(offset).normalize().toArray(track.values, i);
      }
    } else if (binding.propertyName === "position") {
      const delta = to.position.clone().sub(from.position).toArray();
      for (let i = 0; i < track.values.length; i++) track.values[i] += delta[i % 3];
    } else if (binding.propertyName === "scale") {
      const ratio = to.scale.clone().divide(from.scale).toArray();
      for (let i = 0; i < track.values.length; i++) track.values[i] *= ratio[i % 3];
    }
  }
  return result;
}
