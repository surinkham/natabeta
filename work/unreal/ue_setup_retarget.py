"""UE5 editor script: build IK Rigs + IK Retargeter from a Mixamo skeleton to SK_BK_Chibi and batch-retarget clips.

Run inside the Unreal Editor (Python plugin enabled):  Tools > Execute Python Script, or
    UnrealEditor-Cmd.exe <Project>.uproject -run=pythonscript -script="ue_setup_retarget.py"

Prereqs in the project (Content Browser paths below are the defaults — edit CONFIG):
  /Game/Characters/Shared/SK_BK_Chibi_Mesh   skeletal mesh on the SK_BK_Chibi skeleton (any race, Shiba is fine)
  /Game/Anim/Mixamo/SK_Mixamo                any Mixamo character mesh (Y-Bot) imported with its skeleton
  /Game/Anim/Mixamo/<clips>                  Mixamo animation sequences imported onto that skeleton

Written against the UE 5.4/5.5 Python API (IKRigController / IKRetargeterController). Not run here (no UE on
this machine) — if a call name differs on your version, the editor log names it; the mapping table is the part
that matters.
"""
import unreal

CONFIG = {
    "target_mesh": "/Game/Characters/Shared/SK_BK_Chibi_Mesh",
    "source_mesh": "/Game/Anim/Mixamo/SK_Mixamo",
    "clips_dir": "/Game/Anim/Mixamo",
    "out_dir": "/Game/Anim/Retarget",
    "out_prefix": "A_BK_",
}

# chain name -> (start bone, end bone) on each rig. Chain names must match on both sides (auto-map EXACT).
CHAINS_MIXAMO = {
    "Root":   ("mixamorig:Hips", "mixamorig:Hips"),
    "Spine":  ("mixamorig:Spine", "mixamorig:Spine2"),
    "Neck":   ("mixamorig:Neck", "mixamorig:Neck"),
    "Head":   ("mixamorig:Head", "mixamorig:Head"),
    "LeftArm":  ("mixamorig:LeftArm", "mixamorig:LeftHand"),
    "RightArm": ("mixamorig:RightArm", "mixamorig:RightHand"),
    "LeftLeg":  ("mixamorig:LeftUpLeg", "mixamorig:LeftFoot"),
    "RightLeg": ("mixamorig:RightUpLeg", "mixamorig:RightFoot"),
}
CHAINS_BK = {
    "Root":   ("pelvis", "pelvis"),
    "Spine":  ("spine_01", "spine_01"),
    "Neck":   ("neck_01", "neck_01"),
    "Head":   ("head", "head"),
    "LeftArm":  ("upperarm_l", "hand_l"),
    "RightArm": ("upperarm_r", "hand_r"),
    "LeftLeg":  ("thigh_l", "foot_l"),
    "RightLeg": ("thigh_r", "foot_r"),
}
RETARGET_ROOT = {"mixamo": "mixamorig:Hips", "bk": "pelvis"}


def make_ik_rig(name, mesh, chains, root):
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    rig = tools.create_asset(name, CONFIG["out_dir"], unreal.IKRigDefinition, unreal.IKRigDefinitionFactory())
    c = unreal.IKRigController.get_controller(rig)
    c.set_skeletal_mesh(mesh)
    c.set_retarget_root(root)
    for chain, (start, end) in chains.items():
        c.add_retarget_chain(chain, start, end, "")
    unreal.EditorAssetLibrary.save_loaded_asset(rig)
    return rig


def make_retargeter(src_rig, tgt_rig):
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    rtg = tools.create_asset("RTG_Mixamo_to_BK", CONFIG["out_dir"], unreal.IKRetargeter, unreal.IKRetargeterFactory())
    c = unreal.IKRetargeterController.get_controller(rtg)
    c.set_ik_rig(unreal.RetargetSourceOrTarget.SOURCE, src_rig)
    c.set_ik_rig(unreal.RetargetSourceOrTarget.TARGET, tgt_rig)
    c.auto_map_chains(unreal.AutoMapChainType.EXACT, True)
    # chibi: arms are short and the head is huge — keep FK only, no IK goals, and let the retargeter scale
    # translation on the Root chain by the pelvis-height ratio (default) so the hop height matches
    unreal.EditorAssetLibrary.save_loaded_asset(rtg)
    return rtg


def batch_retarget(rtg, src_mesh, tgt_mesh):
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    clips = [a.get_asset() for a in reg.get_assets_by_path(CONFIG["clips_dir"], recursive=True)
             if a.asset_class_path.asset_name == "AnimSequence"]
    if not clips:
        unreal.log_warning("no AnimSequence under " + CONFIG["clips_dir"]); return
    op = unreal.IKRetargetBatchOperation()
    ctx = unreal.BatchRetargetContext() if hasattr(unreal, "BatchRetargetContext") else None
    if ctx:   # 5.4+ signature
        ctx.assets_to_retarget = clips; ctx.source_mesh = src_mesh; ctx.target_mesh = tgt_mesh; ctx.ik_retarget_asset = rtg
        ctx.name_rule.prefix = CONFIG["out_prefix"]; ctx.name_rule.folder_path = CONFIG["out_dir"]
        op.run_retarget(ctx)
    else:     # older signature
        op.duplicate_and_retarget(clips, src_mesh, tgt_mesh, rtg, "", "", CONFIG["out_prefix"], "", True)
    unreal.log(f"retargeted {len(clips)} clips -> {CONFIG['out_dir']}")


def main():
    src_mesh = unreal.EditorAssetLibrary.load_asset(CONFIG["source_mesh"])
    tgt_mesh = unreal.EditorAssetLibrary.load_asset(CONFIG["target_mesh"])
    assert src_mesh and tgt_mesh, "set CONFIG paths to your imported meshes"
    unreal.EditorAssetLibrary.make_directory(CONFIG["out_dir"])
    src_rig = make_ik_rig("IK_Mixamo", src_mesh, CHAINS_MIXAMO, RETARGET_ROOT["mixamo"])
    tgt_rig = make_ik_rig("IK_BK_Chibi", tgt_mesh, CHAINS_BK, RETARGET_ROOT["bk"])
    rtg = make_retargeter(src_rig, tgt_rig)
    batch_retarget(rtg, src_mesh, tgt_mesh)


if __name__ == "__main__":
    main()
