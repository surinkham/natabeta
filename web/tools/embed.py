"""Single-file build for hosts that cannot serve .glb (claude.ai artifacts): inline every asset on window.__EMBED.

    SINGLE=1 npm run build && python3 tools/embed.py      -> dist/single.html
GLB images become data: URIs (artifact CSP blocks blob:/fetch, allows <img src=data:>); textures become data: URIs too.
"""
import base64, json, os, struct
HERE = os.path.dirname(os.path.abspath(__file__)); WEB = os.path.dirname(HERE)
ASSETS = os.path.join(WEB, "client", "public", "assets"); DIST = os.path.join(WEB, "dist")
# The artifact has a hard 16 MB ceiling, so this build is allowed to differ from the hosted one:
#   SKIP      assets nothing loads any more (the client moved to knight-refined.glb)
#   tools/artifact/<name>  a smaller stand-in embedded under the same path (same model, 512px textures)
SKIP = {"assets/knight.glb"}
OVERRIDE = os.path.join(HERE, "artifact")

def glb_images_to_data_uris(b: bytes) -> bytes:
    jlen = struct.unpack_from("<I", b, 12)[0]; j = json.loads(b[20:20 + jlen])
    blen = struct.unpack_from("<I", b, 20 + jlen)[0]; bin_ = b[28 + jlen:28 + jlen + blen]
    for img in j.get("images", []):
        if "bufferView" in img:
            v = j["bufferViews"][img.pop("bufferView")]; data = bin_[v["byteOffset"]:v["byteOffset"] + v["byteLength"]]
            img["uri"] = "data:%s;base64,%s" % (img.pop("mimeType"), base64.b64encode(data).decode())
    jb = json.dumps(j, separators=(",", ":")).encode(); jb += b" " * (-len(jb) % 4)
    body = struct.pack("<II", len(jb), 0x4E4F534A) + jb + struct.pack("<II", len(bin_), 0x004E4942) + bin_
    return struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body

embed = {}
for d, _, fs in os.walk(ASSETS):
    for f in fs:
        p = os.path.join(d, f); rel = "assets/" + os.path.relpath(p, ASSETS).replace(os.sep, "/")
        if rel in SKIP: continue
        alt = os.path.join(OVERRIDE, os.path.relpath(p, ASSETS))
        if os.path.exists(alt): p = alt
        data = open(p, "rb").read()
        if f.endswith(".glb"): embed[rel] = base64.b64encode(glb_images_to_data_uris(data)).decode()
        elif f.endswith((".jpg", ".png")): embed[rel] = "data:image/%s;base64,%s" % ("jpeg" if f.endswith(".jpg") else "png", base64.b64encode(data).decode())
html = open(os.path.join(DIST, "index.html"), encoding="utf-8").read()
tag = "<script>window.__EMBED=%s</script>\n" % json.dumps(embed, separators=(",", ":")).replace("</", "<\\/")
html = html.replace("<script", tag + "<script", 1)
open(os.path.join(DIST, "single.html"), "w", encoding="utf-8").write(html)
print("OK dist/single.html", len(html) // 1024, "KB,", len(embed), "assets")
