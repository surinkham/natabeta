"""Web-sized GLB from a baked .blend: downscale textures, JPEG-encode, export armature + meshes.

    .venv/bin/python export_web_glb.py out_knight/DogKnight_Textured.blend ../game/assets/knight.glb [--size 512] [--no-datauri]
    Images inside the GLB are rewritten as data: URIs (skip with --no-datauri when self-hosting) (artifact CSP blocks blob:/fetch, allows <img src=data:>).
"""
import os
import sys

import bpy

blend, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
size = int(sys.argv[sys.argv.index("--size") + 1]) if "--size" in sys.argv else 512
bpy.ops.wm.open_mainfile(filepath=blend)
for img in bpy.data.images:
    if img.size[0] > size:
        img.scale(size if img.size[0] >= 1024 else size // 2, size if img.size[1] >= 1024 else size // 2)
objs = [o for o in bpy.data.objects if o.type in ("ARMATURE", "MESH") and o.name != "Backdrop"]
bpy.ops.object.select_all(action="DESELECT")
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = next(o for o in objs if o.type == "ARMATURE")
glb = out
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True, export_apply=True, export_animations=False,
                          export_yup=True, export_image_format="JPEG", export_jpeg_quality=80)


def glb_images_to_data_uris(glb_path):
    """Rewrite the GLB in place: geometry stays in the BIN chunk (parsed from memory, no fetch), every image becomes a
    data: URI so three.js loads it through <img> — the only path an artifact CSP allows (blob:/fetch are blocked)."""
    import base64, json, struct
    b = open(glb_path, "rb").read()
    jlen = struct.unpack_from("<I", b, 12)[0]; j = json.loads(b[20:20 + jlen])
    blen = struct.unpack_from("<I", b, 20 + jlen)[0]; bin_ = b[28 + jlen:28 + jlen + blen]
    views = j["bufferViews"]
    for img in j.get("images", []):
        if "bufferView" in img:
            v = views[img.pop("bufferView")]; data = bin_[v["byteOffset"]:v["byteOffset"] + v["byteLength"]]
            img["uri"] = "data:%s;base64,%s" % (img.pop("mimeType"), base64.b64encode(data).decode())
    jb = json.dumps(j, separators=(",", ":")).encode(); jb += b" " * (-len(jb) % 4)
    body = struct.pack("<II", len(jb), 0x4E4F534A) + jb + struct.pack("<II", len(bin_), 0x004E4942) + bin_
    open(glb_path, "wb").write(struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body)


if "--no-datauri" not in sys.argv:
    glb_images_to_data_uris(out)
print("OK", out, os.path.getsize(out) // 1024, "KB")
