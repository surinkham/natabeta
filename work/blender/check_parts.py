"""Find floating pieces in character GLBs: every loose mesh island must touch (or sink into) the rest of the model.

    .venv/bin/python check_parts.py <glb> [<glb> ...] [--gap 0.012]

Prints, per model, each island whose nearest point on any *other* island is farther than --gap (model units),
with its size and centre, so a detached tail ball or a hovering head shows up without looking at every model.
"""
import sys

import bpy   # first: the bpy module brings bmesh and mathutils with it
import bmesh
from mathutils.bvhtree import BVHTree


def islands(ob):
    """Loose parts of one mesh in world space: [(verts, bvh)]."""
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.transform(ob.matrix_world)
    bm.verts.ensure_lookup_table(); seen, out = set(), []
    for v in bm.verts:
        if v.index in seen: continue
        stack, part = [v], []
        seen.add(v.index)
        while stack:
            u = stack.pop(); part.append(u)
            for e in u.link_edges:
                w = e.other_vert(u)
                if w.index not in seen: seen.add(w.index); stack.append(w)
        idx = {u.index for u in part}
        faces = [[u.index for u in f.verts] for f in bm.faces if f.verts[0].index in idx]
        cos = [u.co.copy() for u in bm.verts]
        out.append(([cos[i] for i in idx], BVHTree.FromPolygons(cos, faces) if faces else None, ob.name))
    bm.free()
    return out


def check(path, gap):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    parts = []
    for ob in bpy.context.scene.objects:
        if ob.type == "MESH" and "Lids" not in ob.name and ob.parent is not None: parts += islands(ob)   # skip the importer's bone-shape spheres
    bad = []
    for i, (vs, _, name) in enumerate(parts):
        lo = [min(v[k] for v in vs) for k in range(3)]; hi = [max(v[k] for v in vs) for k in range(3)]; size = max(hi[k] - lo[k] for k in range(3))
        if size < 0.03: continue                     # eye glints, nostrils: tiny details sit on the surface by design
        sample = vs[:: max(1, len(vs) // 80)]; near = [9.0] * len(sample)
        for j, (_, tree, _) in enumerate(parts):
            if i == j or tree is None: continue
            for k, v in enumerate(sample):
                hit = tree.find_nearest(v)
                if hit[0] is not None: near[k] = min(near[k], hit[3])
        best, touch = min(near), sum(d <= 0.02 for d in near) / len(near)
        # floating (a gap), or hanging on by a point (a bead on a string): under 6% of it meets anything else
        if len(parts) > 1 and (best > gap or touch < 0.06):
            bad.append((name, round(best, 3), round(touch, 2), [round((lo[k] + hi[k]) / 2, 2) for k in range(3)], round(size, 3)))
    return len(parts), bad


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    gap = float(argv[argv.index("--gap") + 1]) if "--gap" in argv else 0.012
    for p in [a for a in argv if a.endswith(".glb")]:
        n, bad = check(p, gap)
        print("MODEL", p.split("/")[-1], "islands", n, "floating", len(bad))
        for b in bad: print("   FLOAT", b)
