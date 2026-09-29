"""Refine the existing rigged Dog Knight toward the supplied silver/gold concept.
Keeps mesh names and SK_BK_Chibi. Rebuilds/bakes into a separate output directory.
Run: .venv/bin/python refine_dog_knight.py out_knight_refined
"""
import math, os, sys
import bpy
from mathutils import Vector
import build_dog_knight as k
import build_shiba_chibi as shiba
import build_shiba_gear as gear
import build_dog_knight_textured as textured

original_build = k.build
original_helmet = k.build_helmet
original_cape = k.build_cape

def ellipsoid(name, pos, scale, color):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, location=pos)
    ob=bpy.context.object; ob.name=name; ob.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    shiba.paint_flat(ob,color)
    for face in ob.data.polygons: face.use_smooth=True
    return ob

def helmet(arm,bones):
    ob=original_helmet(arm,bones)
    # Add raised fasteners around the brow, catching specular highlights.
    extras=[]
    for x in [-0.21,-0.14,0.14,0.21]:
        extras.append(ellipsoid("BrowRivet",(x,-0.223,0.688),(0.012,0.008,0.012),k.GOLD))
    for side in [-1,1]:
        extras.append(ellipsoid("Hinge",(side*0.25,-0.055,0.69),(0.009,0.032,0.032),k.GOLD))
    # Raised steel ribs and gold brow edging; recesses remain dark between ribs.
    for x in [-0.16,-0.08,0,0.08,0.16]:
        rib=gear.box("VisorRib",(x,-0.247,0.74),(0.019,0.014,0.085),k.STEEL)
        bevel=rib.modifiers.new("SoftEdge","BEVEL");bevel.width=0.004;bevel.segments=2
        bpy.context.view_layer.objects.active=rib;bpy.ops.object.modifier_apply(modifier=bevel.name)
        extras.append(rib)
    k._join(ob,extras);shiba.weight(ob,["head"],bones)
    return ob

def cape(arm,bones):
    ob=original_cape(arm,bones)
    # Sculpt broad fabric folds into the existing mesh without adding triangles.
    for vert in ob.data.vertices:
        t=max(0,min(1,(vert.co.z-0.06)/0.36))
        vert.co.y += 0.023*math.cos(vert.co.x*48)*(1-t)
        vert.co.x *= 1.25
    for face in ob.data.polygons:face.use_smooth=True
    return ob

def build():
    result=original_build()
    chest=next(o for o in result["armour"] if o.name=="SK_Knight_Chest")
    extras=[]
    # A real raised paw clasp, leather pouches and golden shoulder rivets.
    extras.append(ellipsoid("PawPad",(0,-0.157,0.359),(0.028,0.011,0.024),k.GOLD))
    for x,z in [(-0.026,0.385),(-0.009,0.397),(0.009,0.397),(0.026,0.385)]:
        extras.append(ellipsoid("PawToe",(x,-0.156,z),(0.009,0.009,0.011),k.GOLD))
    for side in [-1,1]:
        pouch=gear.box("Pouch",(side*0.125,-0.105,0.205),(0.07,0.055,0.075),k.BROWN)
        bevel=pouch.modifiers.new("LeatherEdge","BEVEL");bevel.width=0.009;bevel.segments=2
        bpy.context.view_layer.objects.active=pouch;bpy.ops.object.modifier_apply(modifier=bevel.name)
        extras.append(pouch)
        extras.append(ellipsoid("PouchStud",(side*0.125,-0.137,0.22),(0.006,0.004,0.006),k.GOLD))
        for dx in [-0.027,0.027]:
            extras.append(ellipsoid("ShoulderStud",(side*0.16+dx,-0.059,0.42),(0.007,0.006,0.007),k.GOLD))
    k._join(chest,extras)
    shiba.weight(chest,["pelvis","spine_01","upperarm_l","upperarm_r"],result["bones"])
    # The old shield was a very narrow strip. Broaden its silhouette to the sheet.
    shield=result["shield"]
    for vert in shield.data.vertices:vert.co.x*=2.4
    # Round hard gear edges slightly, preserving authored silhouette and weights.
    for ob in [result["sword"]]:
        bpy.context.view_layer.objects.active=ob
        bevel=ob.modifiers.new("ForgedEdges","BEVEL");bevel.width=0.002;bevel.segments=2
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    return result

k.build_helmet=helmet;k.build_cape=cape;k.build=build
if __name__=="__main__":
    textured.main(os.path.abspath(sys.argv[1] if len(sys.argv)>1 else "out_knight_refined"))
