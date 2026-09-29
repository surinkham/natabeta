import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { retargetClip } from '../client/src/actors/retarget';

describe('breed animation retargeting', () => {
  it('preserves a drooping ear rest pose and authored motion without changing shared clips', () => {
    const source = new THREE.Group(), target = new THREE.Group();
    const a = new THREE.Bone(), b = new THREE.Bone();
    a.name = b.name = 'ear_l'; source.add(a); target.add(b);
    a.position.set(.11, .32, 0); b.position.set(.19, .25, .01);
    a.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), .3);
    b.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 2.8);
    const motion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), .1);
    const clip = new THREE.AnimationClip('Idle', 1, [
      new THREE.QuaternionKeyframeTrack('ear_l.quaternion', [0, 1], [...a.quaternion.toArray(), ...a.quaternion.clone().multiply(motion).toArray()]),
      new THREE.VectorKeyframeTrack('ear_l.position', [0, 1], [...a.position.toArray(), ...a.position.clone().add(new THREE.Vector3(0, .02, 0)).toArray()]),
    ]);
    const before = Array.from(clip.tracks[0].values);
    const adjusted = retargetClip(clip, source, target);
    expect(new THREE.Quaternion().fromArray(adjusted.tracks[0].values).angleTo(b.quaternion)).toBeLessThan(.001);
    expect(new THREE.Quaternion().fromArray(adjusted.tracks[0].values, 4).angleTo(b.quaternion.clone().multiply(motion))).toBeLessThan(.001);
    expect(adjusted.tracks[1].values[1]).toBeCloseTo(.25);
    expect(adjusted.tracks[1].values[4]).toBeCloseTo(.27);
    expect(Array.from(clip.tracks[0].values)).toEqual(before);
  });
});
