"""Feline silhouettes and facial features on the existing shared chibi rig."""
import math
import bpy
from mathutils import Vector

CATS = {'cat', 'persian', 'siamese', 'fold'}


def configure(chars, shiba, knight):
    for name in CATS:
        spec = chars[name]
        head = next(k for k in spec['vols'] if k.endswith('_Head'))
        width = {'cat': .245, 'persian': .26, 'siamese': .225, 'fold': .255}[name]
        spec['vols'][head] = [
            ('ell', (0, 0, .60), (width, .205, .195), (0, 0, 0)),
            ('ell', (.145, -.09, .53), (.078, .065, .055), (0, 0, 0)),
        ]
        if name == 'persian':
            spec['vols'][head] += [('ell', (.18, -.045, .52), (.08, .08, .065), (0, 0, 0))]
        iris = {'cat': (.35,.65,.28), 'persian': (.80,.43,.12), 'siamese': (.20,.58,.90), 'fold': (.90,.64,.18)}[name]
        # Broad almond-like eyes, with vertical pupils; forward of the fur surface.
        spec['face'] = [
            (knight.DARK, (.098,-.187,.634), (.061,.027,.049), 0),
            (iris, (.098,-.208,.634), (.050,.015,.038), 0),
            (knight.BLACK, (.098,-.221,.634), (.011,.007,.032), 0),
            (knight.WHITE, (.083,-.226,.648), (.010,.004,.011), 1),
            (knight.WHITE if name != 'siamese' else (.49,.36,.29), (.036,-.215,.549), (.044,.031,.031), 0),
        ]
        if name == 'siamese':
            spec['marks'][head] = [((.30,.22,.18), (0,-.18,.59), (.20,.105,.145))]
        spec['budgets'][head] = 2800
        if name == 'siamese':
            for kind in ('Ears', 'Tail'):
                key = next(k for k in spec['vols'] if k.endswith('_' + kind))
                spec['marks'][key] = [((.30,.22,.18), (0,0,.5), (2,2,2))]


def mesh(name, vertices, faces):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces); data.update()
    ob = bpy.data.objects.new(name, data); bpy.context.collection.objects.link(ob)
    return ob


def tube(name, points, radius):
    curve = bpy.data.curves.new(name, 'CURVE'); curve.dimensions = '3D'
    curve.resolution_u = 10; curve.bevel_depth = radius; curve.bevel_resolution = 3
    curve.use_fill_caps = True
    spline = curve.splines.new('BEZIER'); spline.bezier_points.add(len(points)-1)
    for i, (bp, p) in enumerate(zip(spline.bezier_points, points)):
        bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
        bp.radius = 1 - .65 * i / max(1, len(points)-1)
    ob = bpy.data.objects.new(name, curve); bpy.context.collection.objects.link(ob)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


def part(name, pname, spec, shiba):
    if pname.endswith('_Tail'):
        return tube(pname, [(0,.10,.28),(.11,.21,.32),(.24,.22,.43),(.28,.20,.60),(.24,.18,.68),(.19,.17,.65)], .047 if name == 'persian' else .029)
    height = {'cat': .91, 'persian': .845, 'siamese': .94, 'fold': .81}[name]
    verts, faces = [], []
    for sign in (1,-1):
        tip_y = -.10 if name == 'fold' else -.005
        # Sink the entire broad root inside the skull, including the narrower Siamese head.
        points = [(.065,-.050,.675),(.205,-.040,.675),(.19,tip_y,height),(.065,.045,.675),(.205,.045,.675),(.19,.03,height-.008)]
        n=len(verts); verts += [(sign*x,y,z) for x,y,z in points]
        for face in [(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)]:
            faces.append(tuple(n+i for i in (tuple(reversed(face)) if sign == 1 else face)))
    ob = mesh(pname,verts,faces)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bevel = ob.modifiers.new('Soft ear rim', 'BEVEL'); bevel.width = .004; bevel.segments = 3
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return ob


def details(head, name, shiba, knight):
    extras=[]
    def add(ob, color):
        shiba.paint_flat(ob,color); ob.data.materials.append(bpy.data.materials['M_Toon_VC']); extras.append(ob)
    # Inverted triangular nose and a split feline mouth, instead of a round dog nose.
    add(mesh('CatNose',[(-.022,-.249,.571),(.022,-.249,.571),(0,-.257,.550),(0,-.230,.564)],[(0,2,1),(0,1,3),(1,2,3),(2,0,3)]),knight.PINK if name != 'siamese' else (.24,.14,.14))
    add(tube('Philtrum',[(0,-.247,.552),(0,-.249,.538)],.003),knight.DARK)
    for sign in (1,-1):
        add(tube('Mouth',[(0,-.249,.538),(sign*.018,-.247,.529),(sign*.034,-.240,.538)],.003),knight.DARK)
        for dz in (-.022,0,.022):
            add(tube('Whisker',[(sign*.068,-.237,.55+dz*.3),(sign*.16,-.222,.55+dz),(sign*.30,-.185,.55+dz*1.7)],.0028),(.34,.28,.23))
    knight._join(head,extras)


def ear_insets(ears, name, shiba, knight):
    if name == 'fold': return
    extras = []
    height = {'cat': .91, 'persian': .845, 'siamese': .94}[name]
    for sign in (1, -1):
        # Inset sits on the new sloping front plane, inside the ear outline.
        a, b, tip = Vector((.065,-.050,.675)), Vector((.205,-.040,.675)), Vector((.19,-.005,height))
        points = [a*.38 + b*.10 + tip*.52, a*.10 + b*.38 + tip*.52, a*.07 + b*.07 + tip*.86]
        ob = mesh('InnerEar', [(sign*p.x,p.y-.0015,p.z) for p in points], [(0,1,2) if sign == 1 else (0,2,1)])
        shiba.paint_flat(ob, knight.PINK); ob.data.materials.append(bpy.data.materials['M_Toon_VC']); extras.append(ob)
    knight._join(ears, extras)


def anchor_ear_roots(ears):
    """Keep buried roots on the head while the exposed tips can swivel with the ear bones."""
    head = ears.vertex_groups.get('head') or ears.vertex_groups.new(name='head')
    for v in ears.data.vertices:
        t = max(0.0, min(1.0, (v.co.z - .735) / .10))
        t = t*t*(3-2*t)
        for group in list(v.groups):
            ears.vertex_groups[group.group].remove([v.index])
        head.add([v.index], 1-t, 'REPLACE')
        ears.vertex_groups['ear_l' if v.co.x > 0 else 'ear_r'].add([v.index], t, 'REPLACE')
