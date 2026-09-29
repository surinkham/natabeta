"""Finish the baked concept variant without rebaking: clear eyes, smooth plume, raised shield emblem."""
import bpy, math, os, sys
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(sys.argv[1]))
helmet=bpy.data.objects["SK_Knight_Helmet"]
for v in helmet.data.vertices:v.co.z+=0.045
for p in helmet.data.polygons:
    if p.center.z>0.88:p.use_smooth=True

def mat(name,color,metal,rough):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes.get("Principled BSDF")
    from build_shiba_chibi import lin
    bs.inputs["Base Color"].default_value=(*lin(color),1)
    bs.inputs["Metallic"].default_value=metal;bs.inputs["Roughness"].default_value=rough
    return m
blue=mat("M_SM_KiteShield_Blue",(0.13,0.22,0.40),0.12,0.52)
gold=mat("M_SM_KiteShield_Trim",(0.84,0.63,0.27),0.65,0.3)
old=bpy.data.objects["SM_KiteShield"]
# Local shield front is -Y, matching attach_shield's basis.
outline=[(-.115,.155),(-.125,.115),(-.105,-.045),(0,-.19),(.105,-.045),(.125,.115),(.115,.155)]
verts=[(x,-.026,z) for x,z in outline]+[(x,.002,z) for x,z in outline]
n=len(outline);faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
mesh=bpy.data.meshes.new("ShieldBoard");mesh.from_pydata(verts,[],faces);mesh.materials.append(blue)
old.data=mesh
bpy.context.view_layer.objects.active=old
bevel=old.modifiers.new("ShieldEdge","BEVEL");bevel.width=.008;bevel.segments=3
bpy.ops.object.modifier_apply(modifier=bevel.name)
# Outer frame and paw have independent material, but follow the same equipment slot.
vs=[];fs=[]
for x,z in outline:vs.append((x,-.033,z))
for x,z in outline:vs.append((x*.87,-.037,z*.89))
for i in range(n):fs.append((i,(i+1)%n,(i+1)%n+n,i+n))
data=bpy.data.meshes.new("ShieldGold");data.from_pydata(vs,[],fs);data.materials.append(gold)
trim=old.copy();trim.data=data;trim.name="SM_KiteShield_Trim";trim.modifiers.clear();bpy.context.collection.objects.link(trim)
parts=[]
for x,z,sx,sz in [(0,-.022,.034,.027),(-.046,.022,.014,.017),(-.019,.051,.015,.019),(.019,.051,.015,.019),(.046,.022,.014,.017)]:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=10,location=(x,-.044,z))
    ob=bpy.context.object;ob.scale=(sx,.009,sz)
    bpy.ops.object.transform_apply(location=True,rotation=False,scale=True)
    ob.data.materials.append(gold)
    for p in ob.data.polygons:p.use_smooth=True
    parts.append(ob)
# Join ornaments in LOCAL space first, then copy the shield attachment transform.
bpy.ops.object.select_all(action="DESELECT")
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join()
paw=parts[0];paw.name="SM_KiteShield_Emblem"
paw.parent=old.parent;paw.parent_type=old.parent_type;paw.parent_bone=old.parent_bone
paw.matrix_parent_inverse=old.matrix_parent_inverse.copy();paw.matrix_basis=old.matrix_basis.copy()
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(sys.argv[2]))
print("Refined shield and helmet saved")
