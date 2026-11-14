"""Standing EVA astronaut with arms down, split into jointed limbs for walking (Blender CLI).

The NASA suit (public/assets/astronaut.glb) is a rigid, unrigged mesh in a T-pose. This bakes the
arms down alongside the body and separates arms and legs into their own objects whose origins sit
at the shoulder / hip joints, so the game can swing them while walking (Walk_armL, Walk_armR,
Walk_legL, Walk_legR, Walk_body). Run: blender -b --python scripts/pose-walker.py
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath='public/assets/astronaut.glb')
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
points = [o.matrix_world @ v.co for o in objects for v in o.data.vertices]
lo = Vector(tuple(min(p[i] for p in points) for i in range(3)))
hi = Vector(tuple(max(p[i] for p in points) for i in range(3)))
scale = 1.85 / (hi.z - lo.z)
for o in objects:
    transform = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = Matrix.Identity(4)
    for v in o.data.vertices:
        p = transform @ v.co
        v.co = Vector(((p.x-(lo.x+hi.x)/2)*scale, (p.y-(lo.y+hi.y)/2)*scale, (p.z-lo.z)*scale))
    o.data.update()

SHOULDER_Z, HIP_Z = 1.40, .91
def region(c):
    # Same limb regions as scripts/pose-crew.py (measured on this suit).
    if abs(c.x) > .29 and c.z > 1.02: return 'armL' if c.x > 0 else 'armR'
    if c.z < HIP_Z: return 'legL' if c.x > 0 else 'legR'
    return 'body'
PIVOT = {'armL': Vector((.235, 0, SHOULDER_Z)), 'armR': Vector((-.235, 0, SHOULDER_Z)),
         'legL': Vector((.1, 0, HIP_Z)), 'legR': Vector((-.1, 0, HIP_Z)), 'body': Vector((0, 0, 0))}

def pose(p, part):
    if part in ('armL', 'armR'):
        side = 1 if part == 'armL' else -1
        shoulder = PIVOT[part]
        # Lower the T-pose arm to hang beside the suit (78° as in the seated bake, a little
        # less so the bulky gloves clear the hip), then a relaxed 12° elbow bend forward.
        p = shoulder + Matrix.Rotation(side*math.radians(76), 3, 'Y') @ (p - shoulder)
        if p.z < 1.05:
            elbow = Vector((p.x, 0, 1.05))
            p = elbow + Matrix.Rotation(math.radians(-12), 3, 'X') @ (p - elbow)
    return p

made = []
for o in objects:
    for part in ('body', 'armL', 'armR', 'legL', 'legR'):
        bm = bmesh.new(); bm.from_mesh(o.data)
        bm.faces.ensure_lookup_table()
        drop = [f for f in bm.faces if region(f.calc_center_median()) != part]
        bmesh.ops.delete(bm, geom=drop, context='FACES')
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
        if not bm.faces: bm.free(); continue
        pivot = PIVOT[part]
        for v in bm.verts: v.co = pose(v.co.copy(), part) - pivot
        mesh = bpy.data.meshes.new(f'Walk_{part}_{len(made)}')
        bm.to_mesh(mesh); bm.free()
        for m in o.data.materials: mesh.materials.append(m)
        ob = bpy.data.objects.new(f'Walk_{part}_{len(made)}', mesh)
        ob.location = pivot
        bpy.context.scene.collection.objects.link(ob)
        made.append(ob)
for o in objects: bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.object.select_all(action='DESELECT')
for o in made: o.select_set(True)
out = os.path.abspath('public/models/colony/team-astronaut-walk.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True)
print('EXPORTED', out, len(made), 'parts')

# QA render, front three-quarter.
bpy.ops.object.camera_add(location=(2.8, -4.5, 2.2))
cam = bpy.context.object
cam.rotation_euler = (Vector((0, 0, .95)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.6
scene = bpy.context.scene; scene.camera = cam
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'; scene.display.shading.color_type = 'MATERIAL'
scene.render.resolution_x = scene.render.resolution_y = 600
os.makedirs('output', exist_ok=True)
scene.render.filepath = os.path.abspath('output/crew-walker.png')
bpy.ops.render.render(write_still=True)
