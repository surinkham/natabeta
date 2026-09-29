import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Q } from "./quality";

// Renderer, scene, 2.5D camera (spec §4.1), lights, toon material factory, outline post pass.
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Q.pixelRatio);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;   // PCFSoft cost a player's integrated GPU far more than its softness shows through the toon shading

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

export const scene = new THREE.Scene();
// Soft reflection lighting lets the knight's baked metal and leather read distinctly.
const reflectionRoom = new RoomEnvironment();
const reflectionGenerator = new THREE.PMREMGenerator(renderer);
const characterReflections = reflectionGenerator.fromScene(reflectionRoom, 0.04);
reflectionRoom.dispose(); reflectionGenerator.dispose();
/** The same reflections for gear built at runtime (actors/gear.ts). */
export const characterEnv = characterReflections.texture;
scene.background = new THREE.Color(0xa9d3ef);
scene.fog = new THREE.Fog(0xa9d3ef, 28, 50);

export const CAM_FAR = 62;   // fog closes at 50, so nothing beyond this is visible — keep the post pass in sync
export const camera = new THREE.PerspectiveCamera(35, 1, 0.1, CAM_FAR);
export const CAM_OFF = new THREE.Vector3(0, 7.4, 7.4);   // pitch -45°, fixed yaw

export const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a6a2e, 0.75); scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xffedd0, 2.2);
sun.position.set(6, 12, 4); sun.castShadow = true;
sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
sun.shadow.camera.left = sun.shadow.camera.bottom = -26; sun.shadow.camera.right = sun.shadow.camera.top = 26; sun.shadow.camera.far = 80;
scene.add(sun); scene.add(sun.target);

// Continuous soft-toon ramp: hard lighting bands made smooth meshes look faceted.
const ramp = new Uint8Array(256 * 4);
for (let i = 0; i < 256; i++) {
  const t = i / 255;
  const light = Math.round(95 + 160 * t * t * (3 - 2 * t));
  ramp.set([light, light, light, 255], i * 4);
}
const grad = new THREE.DataTexture(ramp, 256, 1, THREE.RGBAFormat);
grad.minFilter = grad.magFilter = THREE.LinearFilter;
grad.generateMipmaps = false; grad.needsUpdate = true;
export const toon = (color: THREE.ColorRepresentation, extra: Record<string, unknown> = {}) =>
  new THREE.MeshToonMaterial({ color, gradientMap: grad, ...extra } as THREE.MeshToonMaterialParameters);
/** Props / ground: physically-lit so the moving sun, torches and shadows read as real light (characters stay toon). */
export function pbrFrom(m: THREE.MeshStandardMaterial): THREE.Material {
  // Preserve authored colour, roughness, metallic, AO and surface detail.
  const mat = m.clone();
  // The procedural vertex-colour kit exports glTF's default metallic=1.
  // Its wood, stone and cloth need a matte dielectric surface.
  if (mat.vertexColors && !mat.map && !mat.metalnessMap) {
    mat.metalness = 0;
    mat.roughness = 0.88;
  }
  return mat;
}
/** Physically lit skin/cloth shares the scene lighting; authored armor keeps its metal maps. */
export function characterMaterial(src:THREE.MeshStandardMaterial):THREE.Material {
  const mat=src.clone();
  const armor=/M_(SK_Knight_|SM_KnightSword|SM_KiteShield)/.test(src.name);
  mat.envMap=characterReflections.texture;mat.envMapIntensity=armor?.7:.25;
  if(!armor){mat.metalness=0;mat.roughness=/eye|gem|slime/i.test(src.name)?.32:.84;}
  else mat.metalness=Math.min(mat.metalness,/Sword|Shield/.test(src.name)?.8:.3);   // baked as full metal: a dyed tunic at roughness 1 renders black
  return mat;
}
/** Baked-texture mesh keeps its maps under toon shading; vertex-colour placeholders go flat toon. */
export function toonFrom(m: THREE.MeshStandardMaterial): THREE.Material {
  if (/M_(SK_Knight_|SM_KnightSword|SM_KiteShield)/.test(m.name)) {
    const armor = m.clone();
    // the bake marks every gear piece as fully metallic; at roughness 1 that renders a dyed tunic near-black, so keep
    // gear mostly dielectric — plate still catches the reflection map, cloth shows its colour
    armor.metalness = Math.min(armor.metalness, /Sword|Shield/.test(m.name) ? 0.8 : 0.3);
    armor.envMap = characterReflections.texture;
    armor.envMapIntensity = 0.7;
    return armor;
  }
  const toon = new THREE.MeshToonMaterial({
    color: m.color, map: m.map, vertexColors: m.vertexColors,
    normalMap: m.normalMap, normalScale: m.normalScale,
    bumpMap: m.bumpMap, bumpScale: m.bumpScale,
    aoMap: m.aoMap, aoMapIntensity: m.aoMapIntensity,
    emissiveMap: m.emissiveMap, emissive: m.emissive,
    emissiveIntensity: m.emissiveIntensity,
    alphaMap: m.alphaMap, alphaTest: m.alphaTest,
    transparent: m.transparent, opacity: m.opacity, side: m.side,
    depthWrite: m.depthWrite, gradientMap: grad,
  });
  return furRim(toon);
}

// Fake fur: a fresnel term lightens the silhouette so coats catch the light at the edge the way fuzz does, instead
// of ending in a hard outline. Real shell fur (N copies of the mesh) costs N× the draw calls; this costs nothing.
function furRim(m: THREE.MeshToonMaterial) {
  m.onBeforeCompile = shader => {
    shader.uniforms.rimPower = { value: 2.6 };
    shader.uniforms.rimStrength = { value: 0.42 };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRimN; varying vec3 vRimV;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n  vRimN = normalize(mat3(modelMatrix) * objectNormal);\n  vRimV = normalize(cameraPosition - (modelMatrix * vec4(transformed, 1.0)).xyz);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRimN; varying vec3 vRimV; uniform float rimPower, rimStrength;")
      .replace("#include <dithering_fragment>", "#include <dithering_fragment>\n  float rim = pow(1.0 - clamp(dot(normalize(vRimN), normalize(vRimV)), 0.0, 1.0), rimPower);\n  gl_FragColor.rgb += gl_FragColor.rgb * rim * rimStrength;");
  };
  m.customProgramCacheKey = () => "bk-toon-furrim";
  return m;
}

// --- post: render to HalfFloat target + depth, then depth-Sobel outline + vignette + ACES (three skips tone mapping on targets)
const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: Q.msaa });
rt.depthTexture = new THREE.DepthTexture(2, 2);
const postMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: rt.texture }, tDepth: { value: rt.depthTexture }, res: { value: new THREE.Vector2(2, 2) }, near: { value: 0.1 }, far: { value: CAM_FAR }, outlineColor: { value: new THREE.Color(0x354438) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `#include <packing>
    uniform sampler2D tDiffuse, tDepth; uniform vec2 res; uniform float near, far; uniform vec3 outlineColor; varying vec2 vUv;
    float lz(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv); vec2 px = 1.0 / res; float z0 = lz(vUv);
      float e = abs(lz(vUv + vec2(px.x, 0.)) - z0) + abs(lz(vUv - vec2(px.x, 0.)) - z0) + abs(lz(vUv + vec2(0., px.y)) - z0) + abs(lz(vUv - vec2(0., px.y)) - z0);
      float edge = smoothstep(0.045, 0.14, e / z0);
      c.rgb = mix(c.rgb, outlineColor, edge * 0.22);
      float v = 1.0 - smoothstep(0.6, 1.4, length((vUv - 0.5) * vec2(res.x / res.y, 1.0)));
      c.rgb *= mix(0.9, 1.0, v);
      gl_FragColor = c;
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`, depthTest: false, depthWrite: false });
postMat.toneMapped = true;
const postScene = new THREE.Scene(); postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// Adaptive resolution. Frame intervals lie (vsync, a 30 Hz pane, a throttled tab), so this steers on the GPU's own
// timer where the browser exposes it and otherwise leaves the resolution alone. The outline pass hides the softness.
const BASE_DPR = Q.pixelRatio, WINDOW = 30, TARGET_MS = 11, SLOW_MS = 18;
let scale = 1, lastChange = 0, lastMedian = 0;
const gl = renderer.getContext() as WebGL2RenderingContext;
const timer = (gl as any).getExtension?.("EXT_disjoint_timer_query_webgl2");
const inflight: WebGLQuery[] = []; const samples: number[] = [];
// Exactly one query may be open at a time. The old version pushed the query at begin and ended "a" query whenever
// any were in flight, so once three were pending it called endQuery with nothing open — an INVALID_OPERATION every
// frame, until the driver gave up reporting and the frame loop stalled behind the error flood.
let open: WebGLQuery | null = null;
function beginFrame() {
  if (!timer || open || inflight.length > 3) return;
  const q = gl.createQuery(); if (!q) return;
  gl.beginQuery(timer.TIME_ELAPSED_EXT, q); open = q;
}
function endFrame() {
  if (!timer) return;
  if (open) { gl.endQuery(timer.TIME_ELAPSED_EXT); inflight.push(open); open = null; }
  if (gl.getParameter(timer.GPU_DISJOINT_EXT)) { for (const q of inflight) gl.deleteQuery(q); inflight.length = 0; return; }   // timings invalid this frame
  for (let i = inflight.length - 1; i >= 0; i--) {
    const q = inflight[i];
    if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
    samples.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); inflight.splice(i, 1);
  }
  if (samples.length < WINDOW) return;
  samples.sort((a, b) => a - b); const median = lastMedian = samples[WINDOW >> 1]; samples.length = 0;
  const want = median > SLOW_MS ? Math.max(0.6, scale - 0.1) : median < TARGET_MS ? Math.min(1, scale + 0.1) : scale;
  const now = performance.now();
  // already at the lowest resolution and the GPU is still slow: fewer pixels no longer help, the shadow pass (about half
  // the GPU's frame, and a second draw list on the CPU) is what is left — the player is asked, once per visit
  if (median > SLOW_MS && scale <= 0.6 && shadowsOn() && !askedShadows && now - lastChange > 4000) { lastChange = now; askedShadows = true; onSlowShadows?.(); return; }
  if (want !== scale && now - lastChange > 2000) { lastChange = now; scale = want; renderer.setPixelRatio(BASE_DPR * scale); resize(); }   // reallocating the target is itself a hitch
}
export const renderScale = () => scale;

/** Directional shadows on or off (on by default). Turning them off drops the shadow pass; the shaders rebuild once
 *  (a short hitch). Only the player turns them off, and that choice is remembered for this browser. */
export const shadowsOn = () => sun.castShadow;
export function setShadows(on: boolean) {
  sun.castShadow = renderer.shadowMap.enabled = on; renderer.shadowMap.needsUpdate = true;
  try { if (on) { localStorage.removeItem("bk.noshadow"); localStorage.setItem("bk.shadowon", "1"); } else { localStorage.setItem("bk.noshadow", "1"); localStorage.removeItem("bk.shadowon"); } } catch {}
  onShadowChange?.(on);
}
let askedShadows = false;
export let onShadowChange: ((on: boolean) => void) | undefined, onSlowShadows: (() => void) | undefined;
export const setOnShadowChange = (f: typeof onShadowChange) => { onShadowChange = f; };
/** Called once per visit when the GPU stays slow even at the lowest resolution, to offer turning shadows off. */
export const setOnSlowShadows = (f: typeof onSlowShadows) => { onSlowShadows = f; };
// "auto" was the old silent switch-off: those browsers get their shadows back (and are asked instead)
// the smooth mode ("ลื่น") starts without shadows (the shadow pass is about half the GPU's frame); either mode keeps
// what the player last chose in Options
try { const v = localStorage.getItem("bk.noshadow"); if (v === "auto") localStorage.removeItem("bk.noshadow"); else if (v || (Q.name === "low" && !localStorage.getItem("bk.shadowon"))) sun.castShadow = renderer.shadowMap.enabled = false; } catch {}
export const gpuMs = () => lastMedian;   // median GPU time of the last window, 0 when the browser hides the timer

/** Compile every program the game will need before play starts — a shader that first appears mid-fight is a hitch.
 *  `extra` holds throwaway copies of models that only show up later (monsters, mounts, other races). */
/** Compile every program the scene needs, then draw once so they are bound. One material at a time, handing the
 *  page back between them: a single renderer.compile() plus render of ~130 programs froze the tab for tens of seconds
 *  on the loading card ("Page Unresponsive"). `progress` gets the fraction done. */
export async function warmup(extra: THREE.Object3D[] = [], progress?: (f: number) => void) {
  for (const o of extra) scene.add(o);
  const seen = new Set<THREE.Material>(), todo: THREE.Object3D[] = [];
  scene.traverse(o => { const m = (o as THREE.Mesh).material, list = Array.isArray(m) ? m : m ? [m] : []; if (list.some(x => !seen.has(x))) { list.forEach(x => seen.add(x)); todo.push(o); } });
  let yielded = performance.now();
  renderer.setRenderTarget(rt);   // the world draws into rt (linear, no tone map): programs compiled for the screen were a different variant, built again on the first frame
  for (let i = 0; i < todo.length; i++) {
    await renderer.compileAsync(todo[i], camera, scene);
    // finish the link now, in this small task: where "ready" is reported early the link blocked on the first frame;
    // the same for texture uploads (seconds of texSubImage2D on the first frame otherwise)
    todo[i].traverse(o => { const m = (o as THREE.Mesh).material; for (const x of Array.isArray(m) ? m : m ? [m] : []) {
      (renderer.properties.get(x) as any).currentProgram?.getUniforms();
      for (const v of Object.values(x)) if ((v as THREE.Texture)?.isTexture && !(v as any).isRenderTargetTexture) renderer.initTexture(v as THREE.Texture);
    } });
    if (performance.now() - yielded > 40) { progress?.(i / todo.length); await new Promise(r => setTimeout(r)); yielded = performance.now(); }   // let the bar paint
  }
  renderer.setRenderTarget(null); progress?.(1);
  renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  for (const o of extra) { scene.remove(o); o.traverse((n: any) => { if (n.isMesh) n.geometry?.dispose?.(); }); }
}

(window as any).__gfx = { renderer, scene, camera, rt, postMat };   // console handle for profiling / render debugging

export function render() {
  beginFrame();
  renderer.setRenderTarget(rt); renderer.render(scene, camera); drawn.calls = renderer.info.render.calls; drawn.tris = renderer.info.render.triangles;
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  endFrame();
}
/** The main pass of the last frame (shadows included): renderer.info itself is reset by the post pass. */
export const drawn = { calls: 0, tris: 0 };
export function resize() {
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  const w = Math.floor(innerWidth * renderer.getPixelRatio()), h = Math.floor(innerHeight * renderer.getPixelRatio());
  rt.setSize(w, h); postMat.uniforms.res.value.set(w, h);
}
/** World position -> screen px; third value false when behind the camera. */
export function project(v: THREE.Vector3): [number, number, boolean] {
  const p = v.clone().project(camera); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight, p.z < 1];
}
