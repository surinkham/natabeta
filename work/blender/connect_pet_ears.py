"""Connect existing dog/rodent ear roots, preserving authored textures and rigs.
Usage: .venv/bin/python connect_pet_ears.py [output_dir]
Reads game GLBs; exports to a separate directory. Do not use processed output as input.
"""
import os, sys, math
import bpy
from mathutils import Vector
import build_shiba_chibi as shiba

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
ASSETS = os.path.join(ROOT, 'web/client/public/assets')
MODELS = {
    'golden': ('breeds/golden.glb', 'floppy'),
    'shiba': ('breeds/shiba.glb', 'upright'),
    'husky': ('breeds/husky.glb', 'upright'),
    'chihuahua': ('breeds/chihuahua.glb', 'upright'),
    'hamster': ('breeds/hamster.glb', 'upright'),
    'dumbo': ('breeds/dumbo.glb', 'side'),
    'whitemouse': ('breeds/whitemouse.glb', 'upright'),
    'mouse': ('mouse.glb', 'upright'),
    'knight-refined': ('knight-refined.glb', 'floppy'),
    'shiba-legacy': ('shiba.glb', 'upright'),
}


def smooth(t):
    t = max(0, min(1, t))
    return t*t*(3-2*t)


def connect(ears, style):
    head = ears.vertex_groups.get('head') or ears.vertex_groups.new(name='head')
    anchored = []
    for v in ears.data.vertices:
        x, y, z = v.co
        if style == 'floppy':
            influence = smooth((z-.60)/.105)
            dx, dz = -.060, -.015
        elif style == 'side':
            influence = 1-smooth((abs(x)-.205)/.075)
            dx, dz = -.065, 0
        else:
            influence = 1-smooth((z-.735)/.080)
            dx, dz = -.026, -.048
        v.co.x += (1 if x>0 else -1)*dx*influence
        v.co.z += dz*influence
        h = smooth((influence-.40)/.45)
        for group in list(v.groups):
            ears.vertex_groups[group.group].remove([v.index])
        if h>0: head.add([v.index], h, 'REPLACE')
        if h<1: ears.vertex_groups['ear_l' if x>0 else 'ear_r'].add([v.index],1-h,'REPLACE')
        if h>.999: anchored.append(v.index)
    assert anchored, 'No anchored root vertices'
    ears.data.update()
    bpy.context.view_layer.objects.active=ears
    bpy.ops.mesh.customdata_custom_splitnormals_clear()
    return anchored


def verify(ears, arm, roots):
    bpy.context.view_layer.update()
    def positions():
        ob=ears.evaluated_get(bpy.context.evaluated_depsgraph_get())
        return [ob.matrix_world @ ob.data.vertices[i].co for i in roots]
    before=positions()
    saved=[]
    for key in ('ear_l','ear_r'):
        bone=arm.pose.bones[key]; saved.append((bone,bone.matrix_basis.copy()))
        bone.rotation_mode='XYZ'; bone.rotation_euler.y=math.radians(25)
    bpy.context.view_layer.update()
    assert max((a-b).length for a,b in zip(before,positions()))<1e-5
    for bone, matrix in saved: bone.matrix_basis=matrix
    bpy.context.view_layer.update()


def restore_open_lids(objects, name):
    # Original exports have Blink=1 and a malformed Basis. Rebuild the open
    # pose from the existing closed lid surface in world coordinates.
    from build_beasts import CHARS
    color=CHARS.get(name, CHARS['shiba'])['base']
    for ob in objects:
        if ob.type!='MESH' or not ob.data.shape_keys: continue
        keys=ob.data.shape_keys.key_blocks
        if 'Blink' not in keys: continue
        blink=keys['Blink']; basis=keys['Basis']; matrix=ob.matrix_world; inv=matrix.inverted()
        points=[matrix @ v.co for v in blink.data]
        top=max(p.z for p in points)
        for dst, p in zip(basis.data,points):
            dst.co=inv @ Vector((p.x, p.y+.15, top+(p.z-top)*.035))
        blink.value=0
        mat=bpy.data.materials.new('M_'+name+'_Lids'); mat.use_nodes=True
        bs=mat.node_tree.nodes.get('Principled BSDF')
        bs.inputs['Base Color'].default_value=(*shiba.lin(color),1); bs.inputs['Roughness'].default_value=.85
        ob.data.materials.clear(); ob.data.materials.append(mat)


def main(out):
    os.makedirs(out, exist_ok=True)
    source_dir=os.path.join(out,'originals'); os.makedirs(source_dir, exist_ok=True)
    import shutil
    for name,(rel,style) in MODELS.items():
        # Immutable input snapshot makes reruns idempotent after installing outputs.
        source=os.path.join(source_dir,name+'.glb')
        if not os.path.exists(source): shutil.copy2(os.path.join(ASSETS,rel),source)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=source)
        objects=list(bpy.context.scene.objects)
        ears=next(o for o in objects if o.type=='MESH' and o.name.endswith('_Ears'))
        arm=next(o for o in objects if o.type=='ARMATURE')
        roots=connect(ears,style); verify(ears,arm,roots)
        restore_open_lids(objects,name)
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects: ob.select_set(True)
        bpy.context.view_layer.objects.active=arm
        bpy.ops.export_scene.gltf(filepath=os.path.join(out,name+'.glb'),export_format='GLB',use_selection=True,export_animations=True,export_yup=True)
        # Keep the production meshes intact; hide equipment only in the inspection render.
        for ob in objects:
            if ob.name.startswith(('SK_Knight_', 'SM_Knight', 'SM_Kite', 'SM_Wooden', 'SM_WolfFang')): ob.hide_render=True
        shoot=shiba.setup_render(out)
        bpy.context.scene.render.use_freestyle=False; bpy.context.scene.cycles.samples=24
        bpy.context.scene.render.resolution_x=bpy.context.scene.render.resolution_y=512
        shoot('preview_'+name+'.png',(.75,-2,.95))
        for ob in objects: ob.hide_render=False
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out,name+'.blend'))
        print('PASS',name,len(roots),'root vertices stable during 25-degree ear rotation',flush=True)

if __name__=='__main__':
    main(os.path.abspath(sys.argv[1] if len(sys.argv)>1 else 'out_connected_pets'))
