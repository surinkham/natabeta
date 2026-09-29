"""Blender pipeline outputs -> client/public/assets. Run after any script in ../work/blender changed its output.

    python3 tools/export.py            # everything
    python3 tools/export.py --skip-blender   # only copy/downsize (no bpy runs)

Steps: shiba.glb (export_game_glb.py) · knight.glb 512px JPEG (export_web_glb.py) · cat/mouse/wolf/alpha/SM_Horse (build_beasts.py)
       · env props (copy SM_*.glb)
       · ground textures PNG -> 512 JPEG. Needs ../work/blender/.venv (see ../work/blender/README.md) and Pillow.
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
BL = os.path.join(os.path.dirname(WEB), "work", "blender")
PY = os.path.join(BL, ".venv", "bin", "python")
OUT = os.path.join(WEB, "client", "public", "assets")
ENV = os.path.join(OUT, "env")
os.makedirs(ENV, exist_ok=True)


def run(script, *args):
    print("»", script, *args)
    subprocess.run([PY, script, *args], cwd=BL, check=True, stdout=subprocess.DEVNULL)


if "--skip-blender" not in sys.argv:
    run("export_game_glb.py", OUT)                                                          # shiba.glb (wooden sword source) + the old wolf, overwritten below
    run("export_web_glb.py", "out_knight/DogKnight_Textured.blend", os.path.join(OUT, "knight.glb"), "--size", "512", "--no-datauri")
    refined = os.path.join(BL, "out_knight_refined")
    if not os.path.exists(os.path.join(refined, "DogKnight_Refined.blend")):
        run("refine_dog_knight.py", refined)
        run("finalize_knight_refined.py", os.path.join(refined, "DogKnight_Textured.blend"), os.path.join(refined, "DogKnight_Refined.blend"))
    run("export_web_glb.py", os.path.join(refined, "DogKnight_Refined.blend"), os.path.join(OUT, "knight-refined.glb"), "--size", "1024")
    run("build_beasts.py", os.path.join(BL, "out_beasts"))                                  # cat/mouse (races), wolf/alpha (monsters), SM_Horse (mount)

for f in ("cat.glb", "mouse.glb", "wolf.glb", "alpha.glb", "SM_Horse.glb"):                 # W4 characters
    shutil.copy(os.path.join(BL, "out_beasts", f), OUT)

shutil.copy(os.path.join(BL, "out_anim", "anims.glb"), OUT)                                  # build_anim_clips.py
for src in ("out_env", "out_town"):                                                          # build_env_kit.py, build_town_kit.py
    for f in os.listdir(os.path.join(BL, src)):
        if f.startswith("SM_") and f.endswith(".glb"):
            shutil.copy(os.path.join(BL, src, f), ENV)

from PIL import Image
tex = os.path.join(BL, "out_env", "textures")
for f in os.listdir(tex):
    if f.startswith("T_Ground_") and f.endswith(".png"):
        im = Image.open(os.path.join(tex, f)).convert("RGB").resize((512, 512), Image.LANCZOS)
        im.save(os.path.join(ENV, f[:-4] + ".jpg"), quality=90 if "Normal" in f else 85)

total = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(OUT) for f in fs)
print("OK assets:", sorted(os.listdir(OUT)), "| env:", len(os.listdir(ENV)), "files |", total // 1024, "KB")
