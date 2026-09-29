import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const cache = new WeakMap<THREE.Object3D, THREE.Object3D>();
const materials = new Map<number, THREE.MeshStandardMaterial>();
const material = (color: number) => {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .65, metalness: 0, side: THREE.DoubleSide }));
  return materials.get(color)!;
};

/** Shared rest-pose anatomy for the world and bestiary. Source GLBs remain untouched. */
export function monsterModel(source: THREE.Object3D, kind: string) {
  const cached = cache.get(source); if (cached) return cached;
  const model = clone(source);
  model.updateMatrixWorld(true);
  const attach = (mesh: THREE.Mesh, bone: string) => {
    mesh.castShadow = mesh.receiveShadow = true;
    model.add(mesh); model.updateMatrixWorld(true);
    model.getObjectByName(bone)?.attach(mesh);
    return mesh;
  };
  const mammal = ['wolf', 'alpha', 'fox', 'boar', 'bear'].includes(kind);
  // Smaller cranium, a longer rib cage and substantial legs replace the toy-like silhouette.
  const head = model.getObjectByName('head');
  const scaleHead = mammal ? (kind === 'bear' ? .70 : .60) : kind === 'bat' ? .62 : kind === 'stump' ? .88 : .94;
  if (['wolf', 'alpha', 'fox', 'bat'].includes(kind)) {
    const ears: THREE.Object3D[] = [];
    model.traverse(n => { if (/_Ears$/.test(n.name)) ears.push(n); });
    ears.forEach(n => n.removeFromParent());
    const fur = kind === 'fox' ? 0xa8582c : kind === 'bat' ? 0x392d3c : kind === 'alpha' ? 0x37343e : 0x666b70;
    for (const side of [-1, 1]) {
      const x = side * .145, height = kind === 'bat' ? .23 : .16;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([x-.065,.76,.025, x+.065,.76,.025, x+side*.025,.76+height,-.005, x-.05,.76,-.04, x+.05,.76,-.04], 3));
      geo.setIndex([0,1,2,3,2,4,0,2,3,1,4,2,0,3,4,0,4,1]); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, material(fur)); mesh.name='anatomy-ear'; attach(mesh, side>0?'ear_l':'ear_r');
    }
  }
  if (kind === 'boar') {
    for (const side of [-1,1]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(side*.105,.505,.29), new THREE.Vector3(side*.145,.52,.36), new THREE.Vector3(side*.15,.575,.38)]);
      const geo = new THREE.TubeGeometry(curve,10,.015,7,false);
      const tusk = new THREE.Mesh(geo,material(0xd7ccb0)); tusk.name='anatomy-tusk'; attach(tusk,'head');
    }
  }
  if (kind === 'bat') {
    for (const side of [-1,1]) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute([side*.12,.38,0, side*.31,.49,0, side*.66,.48,-.025, side*.53,.32,.015, side*.42,.21,.015, side*.30,.27,.01, side*.19,.19,.02],3));
      geo.setIndex([0,1,2,0,2,3,0,3,4,0,4,5,0,5,6]);geo.computeVertexNormals();
      const wing=new THREE.Mesh(geo,material(0x4b3543));wing.name='anatomy-wing';attach(wing,side>0?'upperarm_l':'upperarm_r');
    }
  }
  if (head) head.scale.multiplyScalar(scaleHead);
  if (mammal) {
    const spine = model.getObjectByName('spine_01'); if(spine) spine.scale.set(1.03,1.22,1.08);
    for (const name of ['upperarm_l','upperarm_r','thigh_l','thigh_r']) model.getObjectByName(name)?.scale.set(1.12,1.08,1.12);
  }
  model.updateMatrixWorld(true); cache.set(source,model); return model;
}
