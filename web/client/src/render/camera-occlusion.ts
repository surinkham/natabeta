import * as THREE from 'three';
const target={value:new THREE.Vector3()},eye={value:new THREE.Vector3(0,7.4,7.4)};
const enabled={value:0};
const installed=new WeakSet<THREE.Material>();
/** Dither foreground props instead of tipping the camera over or zooming into the player. */
export function cameraOcclusion(material:THREE.Material) {
 if(installed.has(material))return;installed.add(material);
 const before=material.onBeforeCompile,key=material.customProgramCacheKey();
 material.onBeforeCompile=function(shader,renderer){
   before.call(this,shader,renderer);
   shader.uniforms.occlusionEnabled=enabled;shader.uniforms.occlusionTarget=target;shader.uniforms.occlusionEye=eye;
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n varying vec3 vOcclusionPosition;')
    .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vec4 occlusionPosition=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        occlusionPosition=instanceMatrix*occlusionPosition;
      #endif
      vOcclusionPosition=(modelMatrix*occlusionPosition).xyz;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n varying vec3 vOcclusionPosition; uniform float occlusionEnabled; uniform vec3 occlusionTarget; uniform vec3 occlusionEye;')
    .replace('#include <dithering_fragment>',`#include <dithering_fragment>
      vec3 segment=occlusionEye-occlusionTarget;
      float along=dot(vOcclusionPosition-occlusionTarget,segment)/max(dot(segment,segment),.001);
      float distanceToView=length(vOcclusionPosition-(occlusionTarget+clamp(along,0.,1.)*segment));
      float fade=(1.-smoothstep(.65,1.45,distanceToView))*smoothstep(.03,.15,along);
      // anything right at the lens is cut away outright: a canopy the camera swung through filled the screen green, and
      // a soft (dithered) band there became a screen-sized crawl of dots that flickered with every step
      fade=max(fade,step(length(vOcclusionPosition-occlusionEye),4.));
      // ordered 4x4 Bayer threshold, and the core fully cleared: the old per-pixel random noise left a crawl of green
      // specks on a tree between the camera and the player that sparkled as the camera moved
      vec2 bp=floor(gl_FragCoord.xy);vec2 bh=floor(bp*.5);
      float noise=fract(dot(bh,vec2(.5,bh.y*.75)))*.25+fract(dot(bp,vec2(.5,bp.y*.75)))+.03125;
      if(noise<fade*occlusionEnabled)discard;`);
 };
 material.customProgramCacheKey=()=>key+'-camera-occlusion-v2';material.needsUpdate=true;
}
export function updateCameraOcclusion(player:THREE.Vector3,camera:THREE.Vector3){enabled.value=1;target.value.copy(player);target.value.y+=.5;eye.value.copy(camera);}
