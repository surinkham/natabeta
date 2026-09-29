"""UE5 editor script: the 2.5D chibi look — toon material, outline post-process, post volume, lights, camera settings.

Run inside the editor after ue_import_assets.py. Creates under /Game/BK/Look:
    M_Toon_VC        vertex-colour (or texture) base, stepped lighting done in PP so it works with Lumen/mobile
    M_Toon_Tex       same, textured (BaseColor / Normal / ORM) for baked characters (Dog Knight)
    PP_Outline       post-process material: depth + normal edge detection -> dark outline (GDD §2.1 "2.5D look")
    PP_CelShade      post-process material: quantises scene luminance into 3 bands (keeps colour)
and in the current level: PostProcessVolume (unbound) with bloom / vignette / colour grade, a warm DirectionalLight,
SkyLight, and the 2.5D camera numbers from spec §5.17 logged for the CameraComponent.

Written against UE 5.4/5.5 Python (MaterialEditingLibrary). Not executed here (no UE). If an expression class name
differs on your version the log names it; the HLSL in the Custom nodes is the part to keep.
"""
import unreal

DEST = "/Game/BK/Look"
MEL = unreal.MaterialEditingLibrary
AT = unreal.AssetToolsHelpers.get_asset_tools()

OUTLINE_HLSL = r"""
// Sobel on scene depth + world normal. Returns 0..1 edge mask. Thickness in pixels via Px.
float2 uv = GetDefaultSceneTextureUV(Parameters, 1);
float2 px = View.ViewSizeAndInvSize.zw * Px;
float d0 = SceneTextureLookup(uv, 1, false).r;
float3 n0 = SceneTextureLookup(uv, 8, false).rgb;
float depthEdge = 0, normEdge = 0;
float2 o[4] = { float2(px.x, 0), float2(-px.x, 0), float2(0, px.y), float2(0, -px.y) };
for (int i = 0; i < 4; i++) {
    float d = SceneTextureLookup(uv + o[i], 1, false).r;
    float3 n = SceneTextureLookup(uv + o[i], 8, false).rgb;
    depthEdge += saturate(abs(d - d0) / max(d0, 1) * DepthScale);
    normEdge += saturate((1 - dot(n, n0)) * NormalScale);
}
return saturate(max(depthEdge, normEdge));
"""

CEL_HLSL = r"""
// Quantise luminance into Bands steps while keeping hue/saturation; blend by Strength.
float3 c = SceneTextureLookup(GetDefaultSceneTextureUV(Parameters, 14), 14, false).rgb;   // PostProcessInput0
float l = dot(c, float3(0.299, 0.587, 0.114));
float q = (floor(pow(l, 0.8) * Bands) + 0.5) / Bands;
float3 cel = c * (q / max(l, 1e-4));
return lerp(c, cel, Strength);
"""


def new_material(name, domain=unreal.MaterialDomain.MD_SURFACE):
    m = AT.create_asset(name, DEST, unreal.Material, unreal.MaterialFactoryNew())
    m.set_editor_property("material_domain", domain)
    return m


def expr(m, cls, x, y):
    return MEL.create_material_expression(m, cls, x, y)


def toon_surface(name, textured):
    m = new_material(name)
    m.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_DEFAULT_LIT)
    if textured:
        base = expr(m, unreal.MaterialExpressionTextureSampleParameter2D, -600, -200); base.set_editor_property("parameter_name", "BaseColor")
        nrm = expr(m, unreal.MaterialExpressionTextureSampleParameter2D, -600, 100); nrm.set_editor_property("parameter_name", "Normal")
        nrm.set_editor_property("sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
        orm = expr(m, unreal.MaterialExpressionTextureSampleParameter2D, -600, 400); orm.set_editor_property("parameter_name", "ORM")
        orm.set_editor_property("sampler_type", unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
        MEL.connect_material_property(base, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
        MEL.connect_material_property(nrm, "RGB", unreal.MaterialProperty.MP_NORMAL)
        MEL.connect_material_property(orm, "G", unreal.MaterialProperty.MP_ROUGHNESS)
        MEL.connect_material_property(orm, "B", unreal.MaterialProperty.MP_METALLIC)
        em = expr(m, unreal.MaterialExpressionTextureSampleParameter2D, -600, 700); em.set_editor_property("parameter_name", "Emissive")
        MEL.connect_material_property(em, "RGB", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    else:
        vc = expr(m, unreal.MaterialExpressionVertexColor, -400, -100)
        MEL.connect_material_property(vc, "RGB", unreal.MaterialProperty.MP_BASE_COLOR)
        rough = expr(m, unreal.MaterialExpressionScalarParameter, -400, 200); rough.set_editor_property("parameter_name", "Roughness"); rough.set_editor_property("default_value", 0.8)
        MEL.connect_material_property(rough, "", unreal.MaterialProperty.MP_ROUGHNESS)
        metal = expr(m, unreal.MaterialExpressionScalarParameter, -400, 350); metal.set_editor_property("parameter_name", "Metallic"); metal.set_editor_property("default_value", 0.0)
        MEL.connect_material_property(metal, "", unreal.MaterialProperty.MP_METALLIC)
    MEL.recompile_material(m); unreal.EditorAssetLibrary.save_loaded_asset(m); return m


def pp_material(name, hlsl, params, blend_dark=False):
    m = new_material(name, unreal.MaterialDomain.MD_POST_PROCESS)
    m.set_editor_property("blendable_location", unreal.BlendableLocation.BL_BEFORE_TONEMAPPING)
    custom = expr(m, unreal.MaterialExpressionCustom, -300, 0)
    custom.set_editor_property("code", hlsl); custom.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT3 if not blend_dark else unreal.CustomMaterialOutputType.CMOT_FLOAT1)
    inputs = []
    for i, (pname, default) in enumerate(params):
        p = expr(m, unreal.MaterialExpressionScalarParameter, -700, i * 150); p.set_editor_property("parameter_name", pname); p.set_editor_property("default_value", default)
        ci = unreal.CustomInput(); ci.set_editor_property("input_name", pname); inputs.append(ci)
    custom.set_editor_property("inputs", inputs)          # pins must exist before they can be connected
    for i, (pname, _) in enumerate(params):
        p = [e for e in MEL.get_material_expressions(m) if isinstance(e, unreal.MaterialExpressionScalarParameter) and e.get_editor_property("parameter_name") == pname][0]
        MEL.connect_material_expressions(p, "", custom, pname)
    if blend_dark:
        # outline: scene colour * (1 - edge * OutlineStrength) tinted toward OutlineColor
        scene = expr(m, unreal.MaterialExpressionSceneTexture, -300, 300); scene.set_editor_property("scene_texture_id", unreal.SceneTextureId.PPI_POST_PROCESS_INPUT0)
        col = expr(m, unreal.MaterialExpressionVectorParameter, -300, 500); col.set_editor_property("parameter_name", "OutlineColor"); col.set_editor_property("default_value", unreal.LinearColor(0.08, 0.04, 0.02, 1))
        lerp = expr(m, unreal.MaterialExpressionLinearInterpolate, 0, 200)
        MEL.connect_material_expressions(scene, "Color", lerp, "A"); MEL.connect_material_expressions(col, "", lerp, "B"); MEL.connect_material_expressions(custom, "", lerp, "Alpha")
        MEL.connect_material_property(lerp, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    else:
        MEL.connect_material_property(custom, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    MEL.recompile_material(m); unreal.EditorAssetLibrary.save_loaded_asset(m); return m


def level_setup(pp_outline, pp_cel):
    ELL = unreal.EditorLevelLibrary
    ppv = ELL.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 0))
    ppv.set_editor_property("unbound", True)
    s = ppv.settings
    s.set_editor_property("override_bloom_intensity", True); s.set_editor_property("bloom_intensity", 0.25)
    s.set_editor_property("override_vignette_intensity", True); s.set_editor_property("vignette_intensity", 0.35)
    s.set_editor_property("override_color_saturation", True); s.set_editor_property("color_saturation", unreal.Vector4(1.12, 1.12, 1.12, 1.0))
    s.set_editor_property("override_color_contrast", True); s.set_editor_property("color_contrast", unreal.Vector4(1.08, 1.08, 1.08, 1.0))
    s.set_editor_property("override_auto_exposure_method", True); s.set_editor_property("auto_exposure_method", unreal.AutoExposureMethod.AEM_MANUAL)
    s.set_editor_property("override_auto_exposure_bias", True); s.set_editor_property("auto_exposure_bias", 0.6)
    s.set_editor_property("override_ambient_occlusion_intensity", True); s.set_editor_property("ambient_occlusion_intensity", 0.4)
    w = unreal.WeightedBlendables(array=[unreal.WeightedBlendable(weight=1.0, object=pp_outline), unreal.WeightedBlendable(weight=1.0, object=pp_cel)])
    s.set_editor_property("weighted_blendables", w)
    ppv.set_editor_property("settings", s)
    sun = ELL.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 500), unreal.Rotator(-48, -30, 0))
    sun.light_component.set_intensity(6.0); sun.light_component.set_light_color(unreal.LinearColor(1.0, 0.93, 0.80))
    sun.light_component.set_editor_property("cast_shadows", True)
    sky = ELL.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 600))
    sky.light_component.set_intensity(1.0); sky.light_component.set_editor_property("real_time_capture", True)
    unreal.log("camera (spec §5.17): SpringArm length 1200, pitch -45, yaw fixed, FOV 35, DoCollisionTest on, lag 0.1")


def main():
    unreal.EditorAssetLibrary.make_directory(DEST)
    toon_surface("M_Toon_VC", textured=False)
    toon_surface("M_Toon_Tex", textured=True)
    outline = pp_material("PP_Outline", OUTLINE_HLSL, [("Px", 1.5), ("DepthScale", 40.0), ("NormalScale", 2.5)], blend_dark=True)
    cel = pp_material("PP_CelShade", CEL_HLSL, [("Bands", 3.0), ("Strength", 0.6)])
    level_setup(outline, cel)
    unreal.log("look setup done -> " + DEST)


if __name__ == "__main__":
    main()
