"""UE5 editor script: import everything the Blender pipeline produced, onto ONE skeleton (SK_BK_Chibi).

Run inside the editor (Python plugin on): Tools > Execute Python Script, or
    UnrealEditor-Cmd.exe <Project>.uproject -run=pythonscript -script="ue_import_assets.py"

Edit SRC to point at work/blender on this machine. Order matters: the first skeletal mesh creates the skeleton,
every later one (gear, other races, ingested models, Dog Knight) reuses it — that is what makes modular equipment
and shared animations work (spec §7.1). Written against UE 5.4/5.5; not executed here (no UE on this machine).
"""
import os

import unreal

SRC = r"C:\bko\work\blender"          # <- folder that holds out/, out_knight/, out_env/, out_anim/
DEST = "/Game/BK"

SKELETAL = [  # (fbx, content folder) — first entry creates the skeleton
    ("out/SK_Shiba.fbx", "Characters/Canine/Shiba"),
    ("out/SK_Chest_Starter.fbx", "Items/Armor"), ("out/SK_Boots_Starter.fbx", "Items/Armor"),
    ("out_knight/SK_DogKnight.fbx", "Characters/Canine/DogKnight"),
    ("out_knight/SK_Knight_Helmet.fbx", "Items/Armor"), ("out_knight/SK_Knight_Chest.fbx", "Items/Armor"),
    ("out_knight/SK_Knight_Gloves.fbx", "Items/Armor"), ("out_knight/SK_Knight_Boots.fbx", "Items/Armor"),
    ("out_knight/SK_Knight_Cape.fbx", "Items/Armor"),
]
STATIC = [
    ("out/SM_WoodenSword.fbx", "Items/Weapons"), ("out/SM_WolfFangSword.fbx", "Items/Weapons"),
    ("out_knight/SM_KnightSword.fbx", "Items/Weapons"), ("out_knight/SM_KiteShield.fbx", "Items/Weapons"),
] + [(f"out_env/{n}.fbx", "World/Props") for n in
     ("SM_Tree_Round", "SM_Tree_Pine", "SM_Bush", "SM_Rock_A", "SM_Rock_B", "SM_Fence", "SM_Flower", "SM_House", "SM_Lamp", "SM_Barrel", "SM_Crate", "SM_Anvil")]
TEXTURE_DIRS = [("out_knight/textures", "Characters/Canine/DogKnight/Textures"), ("out_env/textures", "World/Ground")]
ANIMS = [("out_anim", "Animations")]   # A_*.fbx from retarget_mixamo.py


def _task(path, dest, options):
    t = unreal.AssetImportTask()
    t.filename = os.path.join(SRC, path); t.destination_path = f"{DEST}/{dest}"
    t.automated = True; t.replace_existing = True; t.save = True; t.options = options
    return t


def skeletal_options(skeleton):
    ui = unreal.FbxImportUI()
    ui.import_mesh = True; ui.import_as_skeletal = True; ui.import_materials = True; ui.import_textures = True; ui.import_animations = False
    ui.mesh_type_to_import = unreal.FBXImportType.FBXIT_SKELETAL_MESH
    ui.skeleton = skeleton                                  # None on the very first import -> UE creates SK_BK_Chibi_Skeleton
    ui.skeletal_mesh_import_data.import_content_type = unreal.FBXImportContentType.FBXICT_ALL
    ui.skeletal_mesh_import_data.use_t0_as_ref_pose = True
    ui.skeletal_mesh_import_data.convert_scene = True
    ui.skeletal_mesh_import_data.vertex_color_import_option = unreal.VertexColorImportOption.REPLACE
    ui.skeletal_mesh_import_data.import_morph_targets = False
    return ui


def static_options():
    ui = unreal.FbxImportUI()
    ui.import_mesh = True; ui.import_as_skeletal = False; ui.import_materials = True; ui.import_textures = True
    ui.mesh_type_to_import = unreal.FBXImportType.FBXIT_STATIC_MESH
    ui.static_mesh_import_data.combine_meshes = True
    ui.static_mesh_import_data.generate_lightmap_u_vs = False
    ui.static_mesh_import_data.vertex_color_import_option = unreal.VertexColorImportOption.REPLACE
    ui.static_mesh_import_data.auto_generate_collision = True
    return ui


def anim_options(skeleton):
    ui = unreal.FbxImportUI()
    ui.import_mesh = False; ui.import_as_skeletal = True; ui.import_animations = True; ui.import_materials = False; ui.import_textures = False
    ui.mesh_type_to_import = unreal.FBXImportType.FBXIT_ANIMATION
    ui.skeleton = skeleton
    ui.anim_sequence_import_data.import_bone_tracks = True
    ui.anim_sequence_import_data.remove_redundant_keys = True
    return ui


def run(tasks):
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks(tasks)
    out = []
    for t in tasks:
        out += list(t.imported_object_paths)
    return out


def main():
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    skeleton = None
    for path, dest in SKELETAL:
        paths = run([_task(path, dest, skeletal_options(skeleton))])
        if skeleton is None:
            skel = [p for p in paths if p.endswith("_Skeleton")]
            assert skel, "first skeletal import did not create a skeleton: " + str(paths)
            skeleton = unreal.EditorAssetLibrary.load_asset(skel[0])
            unreal.EditorAssetLibrary.rename_asset(skel[0], f"{DEST}/Characters/Shared/SK_BK_Chibi")
            skeleton = unreal.EditorAssetLibrary.load_asset(f"{DEST}/Characters/Shared/SK_BK_Chibi")
            unreal.log(f"skeleton created: {DEST}/Characters/Shared/SK_BK_Chibi")
    run([_task(p, d, static_options()) for p, d in STATIC])
    for folder, dest in TEXTURE_DIRS:
        full = os.path.join(SRC, folder)
        if os.path.isdir(full):
            run([_task(os.path.join(folder, f), dest, None) for f in os.listdir(full) if f.lower().endswith(".png")])
    for folder, dest in ANIMS:
        full = os.path.join(SRC, folder)
        if os.path.isdir(full):
            run([_task(os.path.join(folder, f), dest, anim_options(skeleton)) for f in os.listdir(full) if f.startswith("A_") and f.endswith(".fbx")])
    # sockets the spec asks for, on the shared skeleton, at the bones the Blender rig exported
    for name, bone in (("socket_head", "socket_head"), ("socket_hand_r", "socket_hand_r"), ("socket_hand_l", "socket_hand_l"), ("socket_back", "socket_back"), ("socket_waist", "socket_waist")):
        unreal.log(f"add socket {name} on bone {bone} (Skeleton editor > Add Socket; Python has no socket API in 5.4)")
    unreal.EditorAssetLibrary.save_directory(DEST)
    unreal.log("import done")


if __name__ == "__main__":
    main()
