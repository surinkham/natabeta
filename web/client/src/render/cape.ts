// Capes flutter: a vertex-shader sway on every "SK_Knight_Cape" mesh (all capes share that mesh, tinted per item). The
// hem swings most and the shoulders not at all; it swings harder while the wearer runs. Patched once per material —
// rigs clone their materials, so each wearer is patched when first seen.
import * as THREE from "three";

const time = { value: 0 };
const patched = new WeakSet<THREE.Material>();
/** Patch the capes under `root` (cheap to call again: patched materials are skipped). */
export function flutterCapes(root: THREE.Object3D) {
  root.traverse((n: any) => {
    if (!n.isMesh || n.name !== "SK_Knight_Cape") return;
    for (const m of (Array.isArray(n.material) ? n.material : [n.material]) as THREE.Material[]) {
      if (patched.has(m)) continue; patched.add(m);
      n.geometry.computeBoundingBox(); const bb = n.geometry.boundingBox as THREE.Box3, top = bb.max.y, len = Math.max(0.05, bb.max.y - bb.min.y);
      const run = { value: 0 }; n.userData.capeRun = run;
      const before = m.onBeforeCompile, key = m.customProgramCacheKey();
      m.onBeforeCompile = (sh, r) => {
        before.call(m, sh, r);
        sh.uniforms.capeTime = time; sh.uniforms.capeRun = run;
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float capeTime; uniform float capeRun;")
          .replace("#include <begin_vertex>", `#include <begin_vertex>
          { float hang = clamp((${top.toFixed(4)} - transformed.y) / ${len.toFixed(4)}, 0.0, 1.0); hang *= hang;
            float amp = 0.018 + 0.03 * capeRun;
            transformed.z -= hang * (amp * (1.0 + sin(capeTime * (3.0 + 3.0 * capeRun) + transformed.y * 9.0)) + 0.03 * capeRun);   // back and forth behind the body
            transformed.x += hang * amp * 0.6 * sin(capeTime * 2.3 + transformed.x * 7.0); }`);
      };
      m.customProgramCacheKey = () => key + "-cape"; m.needsUpdate = true;
    }
  });
}
/** Every frame: the clock, and how hard each cape blows (0 standing … 1 running). */
export function tickCapes(dt: number) { time.value += dt; }
export function capeRunning(root: THREE.Object3D, moving: boolean, dt: number) {
  root.traverse((n: any) => { const r = n.userData?.capeRun; if (r) r.value += ((moving ? 1 : 0) - r.value) * Math.min(1, dt * 4); });
}
