"""Inline the GLBs into dist/index.html so the page ships as a single artifact."""
import base64, os
here = os.path.dirname(os.path.abspath(__file__))
html = open(os.path.join(here, "index.html"), encoding="utf-8").read()
tags = "".join('<script id="glb-%s" type="text/plain">%s</script>\n' % (n, base64.b64encode(open(os.path.join(here, "assets", n + ".glb"), "rb").read()).decode())
               for n in ("shiba", "wolf", "knight"))
env = os.path.join(here, "assets", "env")
for f in sorted(os.listdir(env)):
    n, ext = os.path.splitext(f); data = base64.b64encode(open(os.path.join(env, f), "rb").read()).decode()
    if ext == ".glb": tags += '<script id="glb-env_%s" type="text/plain">%s</script>\n' % (n, data)
    else: tags += '<script id="img-%s" type="text/plain">data:image/jpeg;base64,%s</script>\n' % (n, data)
html = html.replace('<script type="importmap">', tags + '<script type="importmap">', 1)
os.makedirs(os.path.join(here, "dist"), exist_ok=True)
open(os.path.join(here, "dist", "index.html"), "w", encoding="utf-8").write(html)
print("dist/index.html", len(html) // 1024, "KB")
