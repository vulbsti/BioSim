import type * as T from 'three';
/**
 * Surface detail no atlas mesh carries: the fine bumpy grain of the cortex and the web of small surface vessels
 * (the pia's arterioles and venules). Both come from 3D noise in the brain's own coordinates, so they stay fixed
 * to the tissue as it turns. They are drawn, not measured: illustrative texture, like the rest of the surface colour.
 */
const NOISE=`varying vec3 vTissue;
float tHash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float tNoise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(tHash(i),tHash(i+vec3(1,0,0)),f.x),mix(tHash(i+vec3(0,1,0)),tHash(i+vec3(1,1,0)),f.x),f.y),
  mix(mix(tHash(i+vec3(0,0,1)),tHash(i+vec3(1,0,1)),f.x),mix(tHash(i+vec3(0,1,1)),tHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`;
export function addTissueDetail(material:T.Material,{grain=1,vessels=1}:{grain?:number;vessels?:number}={}){
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTissue;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvTissue=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${NOISE}`)
   // Thin branching vessels: the ridges of two noise octaves, tinted dark red where they cross the surface.
   .replace('#include <color_fragment>',`#include <color_fragment>
 {float a=1.-abs(tNoise(vTissue*190.)*2.-1.),b=1.-abs(tNoise(vTissue*430.+7.)*2.-1.);
  float vessel=smoothstep(.955,.993,a)*.8+smoothstep(.965,.996,b)*.4;
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.72,.34,.33),clamp(vessel,0.,1.)*${(.4*vessels).toFixed(3)});}`)
   // Fine grain as a bump on the shading normal (derivative bump mapping, as in three's bumpmap chunk).
   .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 {vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
  // Each octave fades out once it is finer than a few pixels, so the grain never turns into speckle when zoomed out.
  float px=max(length(sx),length(sy)),f1=1.-smoothstep(.0003,.0006,px),f2=1.-smoothstep(.00015,.0003,px);
  float h=(tNoise(vTissue*650.)*.65*f1+tNoise(vTissue*1400.)*.35*f2)*${(.00012*grain).toFixed(6)};
  vec3 r1=cross(sy,normal),r2=cross(normal,sx);
  float det=dot(sx,r1)*faceDirection;vec3 grad=sign(det)*(dFdx(h)*r1+dFdy(h)*r2);
  normal=normalize(abs(det)*normal-grad);}`);
 };
 material.customProgramCacheKey=()=>`tissue-${grain}-${vessels}`;
}
