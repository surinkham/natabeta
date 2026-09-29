import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { Q } from "./quality";

const loader = new GLTFLoader();
// <img src="data:..."> path for textures — works everywhere incl. CSP sandboxes that block blob:/fetch
loader.register(parser => { (parser as any).textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: "BK_ForceImgTextures" } as any; });
const texLoader = new THREE.TextureLoader();

// Load progress: every asset request passes through `track` and reports bytes as they arrive, so the loading card
// shows how much has really been downloaded. A file whose size is not known yet (queued behind the browser's
// connection limit, or no Content-Length) counts as the average of the known ones until its headers land.
interface Req { loaded: number; total: number; done: boolean; name: string }
const reqs: Req[] = [];
type ProgressFn = (frac: number, what: string, done: number, count: number) => void;
const listeners = new Set<ProgressFn>();
export function assetFraction() {
  const known = reqs.filter(r => r.total > 0), avg = known.length ? known.reduce((s, r) => s + r.total, 0) / known.length : 1;
  let num = 0, den = 0;
  for (const r of reqs) { const t = r.total > 0 ? r.total : avg; den += t; num += r.done ? t : Math.min(r.loaded, t); }
  return den ? num / den : 0;
}
function emit(what: string) { const f = assetFraction(), done = reqs.filter(r => r.done).length; for (const fn of listeners) fn(f, what, done, reqs.length); }
export function onAssetProgress(fn: ProgressFn) { listeners.add(fn); fn(assetFraction(), "", reqs.filter(r => r.done).length, reqs.length); return () => listeners.delete(fn); }
function track<T>(url: string, start: (progress: (e: ProgressEvent) => void) => Promise<T>): Promise<T> {
  const r: Req = { loaded: 0, total: 0, done: false, name: url.split("/").pop() ?? url }; reqs.push(r); emit(r.name);
  const progress = (e: ProgressEvent) => { r.loaded = e.loaded; if (e.lengthComputable) r.total = e.total; emit(r.name); };
  return start(progress).finally(() => { r.done = true; emit(r.name); });
}

// Single-file build (tools/embed.py) inlines every asset as base64 / data: URI on window.__EMBED — every loader must go through here.
const EMBED: Record<string, string> | undefined = (window as any).__EMBED;
// one request per URL: the creator preview and the game both ask for the same breed models
const gltfCache = new Map<string, Promise<GLTF>>();
export const loadGltf = (url: string) => { let p = gltfCache.get(url); if (!p) gltfCache.set(url, p = fetchGltf(url)); return p; };
const fetchGltf = (url: string) => track(url, progress => new Promise<GLTF>((res, rej) => {
  const ready = (g: GLTF) => {
    g.scene.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) {
          value.anisotropy = Q.anisotropy;
          value.needsUpdate = true;
        }
      }
    });
    res(g);
  };
  const b64 = EMBED?.[url];
  if (b64) { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); loader.parse(bin.buffer, "", ready, rej); }
  else loader.load(url, ready, progress, rej);
}));
export const loadGlb = (url: string) => loadGltf(url).then(g => g.scene);

export function loadTex(url: string, srgb = true) {
  let t!: THREE.Texture;
  track(url, () => new Promise<void>(res => { t = texLoader.load(EMBED?.[url] ?? url, () => res(), undefined, () => res()); }));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = Q.anisotropy;
  return t;
}
