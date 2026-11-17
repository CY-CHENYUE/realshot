import * as T from 'three';
import {WHITE_POINT,SUN_DIRECTION} from './snow-atmosphere-r19.mjs';
import {FLAKE_LAYER,SCENE_DEPTH} from './snow-weather-r19.mjs';

// Final image for the r19 snow world.
//  1. The scene renders in linear HDR into a 4x MSAA half-float target, cleared
//     to alpha 0. Geometry writes alpha 1; snowflakes over the sky leave
//     premultiplied coverage.
//  2. One full-screen pass applies white-point-normalised ACES, a split-tone
//     grade that never tints pure white, and a gentle S-curve. Then it composites
//     the sky behind everything. The sky is the panel's white light
//     (transparent mode) or a soft alpine gradient (desktop mode).
//  3. Snowfall and impact spray (layer 1) render into a coverage target after
//     the scene; the grade colours that coverage by its background so flakes
//     are grey over white and white over dark surfaces.
//  4. Box surfaces lift whatever lies behind the physical object (by depth)
//     inside the central reservation toward white, so the real toy stays clear.
const VERT='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const FRAG=`
#include <packing>
uniform sampler2D tColor,tDepth,tFlakes;uniform vec2 uPx;uniform float uSharp;
uniform float uExposure,uWhite,uNear,uFar,uSkyMode,uCentreLift,uVignette,uTime,uAspect,uSat,uCurve,uBloom;
uniform sampler2D tBloom,tShafts;
uniform vec3 uToneLo,uToneHi,uSkyZen,uSkyHor,uSkyGlow,uCloudLit,uCloudDark,uSunDisk,uShaftCol,uFlake;
uniform vec4 uSkyP,uSkyQ;
uniform float uShaft,uGrain;
uniform vec4 uCentre;
uniform mat4 uInvProj,uCamWorld;
uniform vec3 uSun;
varying vec2 vUv;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
float acesf(float x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
vec3 toSRGB(vec3 c){c=clamp(c,0.,1.);return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec3 skyColor(){
 if(uSkyMode<.5)return vec3(1.);
 vec4 v=uInvProj*vec4(vUv*2.-1.,1.,1.);vec3 dir=normalize((uCamWorld*vec4(v.xyz/v.w,0.)).xyz);
 float e=clamp(dir.y,0.,1.);
 vec3 c=mix(vec3(1.),vec3(.56,.70,.88),pow(smoothstep(0.,.62,e),.8));
 float mu=max(dot(dir,uSun),0.);c+=vec3(1.,.86,.66)*pow(mu,24.)*.32;
 return min(c,vec3(1.));
}
// --- r26 mood sky: linear HDR, tone mapped with the scene so one exposure and one grade cover both ---
float sn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float sfbm(vec2 p){float a=.5,v=0.;for(int i=0;i<5;i++){v+=a*sn(p);p=p*2.03+vec2(17.3,9.1);a*=.5;}return v;}
vec3 viewDir(){vec4 v=uInvProj*vec4(vUv*2.-1.,1.,1.);return normalize((uCamWorld*vec4(v.xyz/v.w,0.)).xyz);}
// uSkyP: cloud cover, cloud scale, drift, horizon glow falloff. uSkyQ: stars, aurora, cloud sharpness, disk size
vec3 skyHDR(vec3 dir){
 float e=max(dir.y,0.),mu=max(dot(dir,uSun),0.);
 vec3 c=mix(uSkyHor,uSkyZen,pow(smoothstep(0.,.75,e),.62));
 float low=exp(-e*uSkyP.w);
 c+=uSkyGlow*(pow(mu,5.)*.5*low+pow(mu,2.5)*.12+pow(mu,48.)*.8);
 float occ=0.;
 if(uSkyQ.x>0.){vec2 sp=dir.xz/(e+.25)*90.;vec2 ci=floor(sp);float h=hash(ci);vec2 o=vec2(hash(ci+3.1),hash(ci+7.7));
  c+=vec3(.8,.9,1.1)*uSkyQ.x*step(.965,h)*smoothstep(.09,.0,length(fract(sp)-.2-.6*o))*(.4+.6*hash(ci+1.3))*smoothstep(.02,.3,e);}
 if(uSkyQ.y>0.&&dir.y>.05){float ax=dir.x/(dir.y+.3),az=dir.z/(dir.y+.3);float band=sfbm(vec2(ax*1.6+uSkyP.z*.6,az*.35));
  float curtain=smoothstep(.42,.75,band)*pow(sn(vec2(ax*14.+band*6.,uSkyP.z*1.5)),1.5);
  c+=mix(vec3(.08,.9,.45),vec3(.35,.25,.9),smoothstep(.2,.8,dir.y))*curtain*uSkyQ.y*smoothstep(.05,.22,dir.y)*(1.-smoothstep(.55,.95,dir.y));}
 if(uSkyP.x>0.&&dir.y>.012){
  vec2 p=dir.xz/(dir.y+.11)*uSkyP.y+vec2(uSkyP.z,uSkyP.z*.31);
  float d=sfbm(p)*.72+sfbm(p*2.9+11.)*.28,k=uSkyQ.z;
  float cov=smoothstep(1.-uSkyP.x-k,1.-uSkyP.x+k,d);
  vec2 sd=normalize(uSun.xz+vec2(1e-4))*.4;float ds=sfbm(p+sd)*.72+sfbm((p+sd)*2.9+11.)*.28;
  float lit=clamp(.55+(d-ds)*2.6,0.,1.);
  vec3 cc=mix(uCloudDark,uCloudLit,lit)+uSkyGlow*pow(mu,7.)*(1.-cov*.7)*1.3;
  float fade=smoothstep(.012,.14,dir.y);occ=cov*fade;
  c=mix(c,cc,occ);
 }
 c+=uSunDisk*smoothstep(1.-uSkyQ.w,1.-uSkyQ.w*.6,mu)*(1.-occ*.85);
 return c;
}
void main(){
 vec4 s=texture2D(tColor,vUv);
 float a=clamp(s.a,0.,1.);
 vec3 lin=a>1e-4?s.rgb/a:vec3(0.);
 float norm=1./acesf(uWhite*uExposure);
 // contrast-adaptive sharpening on luminance, in a compressed range so highlights cannot ring (after AMD FidelityFX RCAS):
 // the lobe is limited by the local min/max, so flat snow and hard edges are left alone and soft detail is firmed up.
 // The level raises uSharp as its dynamic resolution drops, which keeps a scaled frame reading as crisp as a native one.
 if(uSharp>0.&&a>.999){
  const vec3 LW=vec3(.2126,.7152,.0722);
  float e=dot(lin,LW);e=e/(1.+e);
  float n=dot(texture2D(tColor,vUv+vec2(0.,uPx.y)).rgb,LW),s2=dot(texture2D(tColor,vUv-vec2(0.,uPx.y)).rgb,LW),w=dot(texture2D(tColor,vUv-vec2(uPx.x,0.)).rgb,LW),ea=dot(texture2D(tColor,vUv+vec2(uPx.x,0.)).rgb,LW);
  n=n/(1.+n);s2=s2/(1.+s2);w=w/(1.+w);ea=ea/(1.+ea);
  float mn=min(min(n,s2),min(w,ea)),mx=max(max(n,s2),max(w,ea));
  float lobe=max(-mn/(4.*mx+1e-5),(1.-mx)/(4.*mn-4.-1e-5));
  lobe=max(-.1875,min(lobe,0.))*uSharp;
  float r=clamp((lobe*(n+s2+w+ea)+e)/(4.*lobe+1.),0.,.995);
  if(e>1e-4)lin*=clamp((r/(1.-r))/(e/(1.-e)),.5,2.);
 }
 if(uSkyMode>1.5){if(a<.999)lin=lin*a+skyHDR(viewDir())*(1.-a);a=1.;}
 vec3 c=aces(lin*uExposure)*norm;
 float l=dot(c,vec3(.2126,.7152,.0722));
 float keep=1.-smoothstep(.80,.97,l);
 vec3 tone=mix(uToneLo,uToneHi,smoothstep(.12,.72,l));
 c*=mix(vec3(1.),tone,keep);
 c=mix(vec3(l),c,1.0+uSat*keep);
 c=clamp(c,0.,1.);
 c=mix(c,c*c*(3.-2.*c),uCurve*keep);
 vec3 col=c;
 if(uSkyMode<1.5)col=c*a+skyColor()*(1.-a);
 // background-adaptive snowfall
 float f=clamp(texture2D(tFlakes,vUv).a,0.,1.);
 float lb=dot(col,vec3(.2126,.7152,.0722));
 // lit by the day's light over anything dark; over bright snow and sky a flake is only a soft grey shadow of itself
 float fb=smoothstep(.38,.8,lb);
 vec3 flake=mix(uFlake,col*.7+vec3(.0,.012,.035),fb);
 col=mix(col,flake,f*(1.-.35*fb));
 // bloom: linear light above the white point, tone mapped on its own and screen-blended so it never clips
 if(uBloom>0.){vec3 b=texture2D(tBloom,vUv).rgb*uBloom;vec3 bd=clamp(aces(b*uExposure)*norm,0.,1.);col=1.-(1.-col)*(1.-bd);}
 // light shafts: sky light near the sun smeared along rays from the sun, so trees and enemies cut beams into the haze
 if(uShaft>0.){vec3 sh=clamp(aces(texture2D(tShafts,vUv).r*uShaftCol*uShaft*uExposure)*norm,0.,1.);col=1.-(1.-col)*(1.-sh);}
 // centre reservation lift (box surfaces only)
 if(uCentreLift>0.){
  float d=texture2D(tDepth,vUv).x;
  float dist=d>=.9999999?1e4:-perspectiveDepthToViewZ(d,uNear,uFar);
  float m=1.-smoothstep(.72,1.0,length((vUv-uCentre.xy)/max(uCentre.zw,vec2(1e-3))));
  float lift=m*smoothstep(10.2,21.,dist)*uCentreLift;
  col=mix(col,vec3(1.),lift);
 }
 // subtle optical vignette: on the transparent panel this reads as a soft frame
 vec2 q=(vUv-.5)*vec2(uAspect,1.);float v=smoothstep(.42,1.05,length(q)/max(1.,uAspect*.62));
 col*=1.-uVignette*v;
 col+=(hash(vUv*1024.+fract(uTime))-.5)*(1./255.+uGrain*(.35+.65*(1.-dot(col,vec3(.333)))));
 gl_FragColor=vec4(toSRGB(col),1.);
}`;

// Bloom pyramid after Jimenez, "Next Generation Post Processing in Call of Duty:
// Advanced Warfare" (2014): a 13-tap downsample whose first level uses a Karis
// (1/(1+luma)) average so single hot pixels do not flicker, then 3x3 tent
// upsamples accumulated back up the chain. A soft threshold near the white
// point keeps sunlit snow out: only light brighter than white blooms (muzzle
// flash, explosions, visors, tracers, glints).
const DOWN_FRAG=`uniform sampler2D tSrc;uniform vec2 uTexel;uniform float uFirst,uThreshold,uKnee;varying vec2 vUv;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 tap(vec2 o){vec3 c=min(texture2D(tSrc,vUv+uTexel*o).rgb,vec3(256.));if(uFirst<.5)return c;float l=lum(c),k=clamp(l-uThreshold+uKnee,0.,2.*uKnee);k=k*k/(4.*uKnee+1e-4);return c*max(k,l-uThreshold)/max(l,1e-4);}
vec3 avg(vec3 a,vec3 b,vec3 c,vec3 d){if(uFirst<.5)return (a+b+c+d)*.25;float wa=1./(1.+lum(a)),wb=1./(1.+lum(b)),wc=1./(1.+lum(c)),wd=1./(1.+lum(d));return (a*wa+b*wb+c*wc+d*wd)/(wa+wb+wc+wd);}
void main(){
 vec3 A=tap(vec2(-2,2)),B=tap(vec2(0,2)),C=tap(vec2(2,2)),D=tap(vec2(-2,0)),E=tap(vec2(0)),F=tap(vec2(2,0)),G=tap(vec2(-2,-2)),H=tap(vec2(0,-2)),I=tap(vec2(2,-2));
 vec3 J=tap(vec2(-1,1)),K=tap(vec2(1,1)),L=tap(vec2(-1,-1)),M=tap(vec2(1,-1));
 gl_FragColor=vec4(avg(J,K,L,M)*.5+(avg(A,B,D,E)+avg(B,C,E,F)+avg(D,E,G,H)+avg(E,F,H,I))*.125,1.);
}`;
const UP_FRAG=`uniform sampler2D tSrc;uniform vec2 uTexel;varying vec2 vUv;
void main(){vec2 t=uTexel;
 vec3 c=texture2D(tSrc,vUv+vec2(-t.x,t.y)).rgb+2.*texture2D(tSrc,vUv+vec2(0.,t.y)).rgb+texture2D(tSrc,vUv+t).rgb
  +2.*texture2D(tSrc,vUv+vec2(-t.x,0.)).rgb+4.*texture2D(tSrc,vUv).rgb+2.*texture2D(tSrc,vUv+vec2(t.x,0.)).rgb
  +texture2D(tSrc,vUv-t).rgb+2.*texture2D(tSrc,vUv+vec2(0.,-t.y)).rgb+texture2D(tSrc,vUv+vec2(t.x,-t.y)).rgb;
 gl_FragColor=vec4(c/16.,1.);}`;

// Crepuscular rays (Mitchell, GPU Gems 3 ch. 13): march from each pixel toward the sun's screen position and
// accumulate the sky that is not hidden by geometry, weighted by an analytic glow around the sun.
const SHAFT_FRAG=`uniform sampler2D tSrc;uniform vec3 uSunUv;uniform float uAspect,uSpread,uSeed;varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){
 const int N=28;vec2 d=(uSunUv.xy-vUv)*(.92/float(N));vec2 uv=vUv+d*hash(vUv*913.+uSeed);float w=1.,sum=0.;
 for(int i=0;i<N;i++){
  vec2 q=(uv-uSunUv.xy)*vec2(uAspect,1.);float g=exp(-dot(q,q)*uSpread);
  sum+=(1.-clamp(texture2D(tSrc,clamp(uv,vec2(.002),vec2(.998))).a,0.,1.))*g*w;w*=.965;uv+=d;}
 vec2 q0=(vUv-uSunUv.xy)*vec2(uAspect,1.);
 gl_FragColor=vec4(vec3(sum/float(N)*2.2*uSunUv.z*exp(-dot(q0,q0)*.9)),1.);
}`;

export function createSnowPost(renderer,scene,camera,{sky='white',exposure=.94,white=WHITE_POINT,vignette=.06,saturation=.07,curve=.12,bloom=0,bloomThreshold=1.6,bloomKnee=.6,bloomLevels=6}={}){
 const size=new T.Vector2();renderer.getDrawingBufferSize(size);
 const depthTexture=new T.DepthTexture(Math.max(1,size.x),Math.max(1,size.y));
 const target=new T.WebGLRenderTarget(Math.max(1,size.x),Math.max(1,size.y),{type:T.HalfFloatType,samples:4,depthTexture,depthBuffer:true});
 target.texture.name='snow-r19 / hdr scene';
 const flakes=new T.WebGLRenderTarget(Math.max(1,size.x),Math.max(1,size.y),{type:T.HalfFloatType,depthBuffer:false});flakes.texture.name='snow-r19 / flake coverage';
 const uniforms={
  tColor:{value:target.texture},tDepth:{value:depthTexture},tFlakes:{value:flakes.texture},uExposure:{value:exposure},uWhite:{value:white},uNear:{value:camera.near},uFar:{value:camera.far},
  uSkyMode:{value:sky==='gradient'?1:0},uCentreLift:{value:0},uCentre:{value:new T.Vector4(.5,.34,.24,.3)},uVignette:{value:vignette},uTime:{value:0},uAspect:{value:size.x/Math.max(1,size.y)},
  uInvProj:{value:new T.Matrix4()},uCamWorld:{value:new T.Matrix4()},uSun:{value:SUN_DIRECTION.clone()},
  uPx:{value:new T.Vector2(1/Math.max(1,size.x),1/Math.max(1,size.y))},uSharp:{value:0},uSat:{value:saturation},uCurve:{value:curve},uBloom:{value:bloom},tBloom:{value:null},
  // r26 mood controls; the defaults reproduce the r19 grade
  uToneLo:{value:new T.Vector3(.93,.975,1.07)},uToneHi:{value:new T.Vector3(1.035,1.0,.955)},uGrain:{value:0},
  uSkyZen:{value:new T.Vector3(.2,.35,.7)},uSkyHor:{value:new T.Vector3(1,1,1)},uSkyGlow:{value:new T.Vector3(1,.8,.6)},uCloudLit:{value:new T.Vector3(1,1,1)},uCloudDark:{value:new T.Vector3(.5,.55,.65)},uSunDisk:{value:new T.Vector3(20,18,14)},
  uSkyP:{value:new T.Vector4(0,1.2,0,5)},uSkyQ:{value:new T.Vector4(0,0,.2,.00012)},tShafts:{value:null},uShaft:{value:0},uShaftCol:{value:new T.Vector3(1,.85,.65)},uFlake:{value:new T.Vector3(.97,.985,1)},
 };
 const material=new T.ShaderMaterial({name:'snow-r19 / final grade',uniforms,vertexShader:VERT,fragmentShader:FRAG,depthTest:false,depthWrite:false,toneMapped:false});
 const quad=new T.Mesh(new T.PlaneGeometry(2,2),material);quad.frustumCulled=false;
 const quadScene=new T.Scene(),quadCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);quadScene.add(quad);
 // bloom chain (half resolution and down); built only when a page asks for bloom
 const mips=[],black=new T.DataTexture(new Uint8Array([0,0,0,255]),1,1);black.needsUpdate=true;uniforms.tBloom.value=black;
 const downMat=new T.ShaderMaterial({name:'snow-r19 / bloom down',uniforms:{tSrc:{value:null},uTexel:{value:new T.Vector2()},uFirst:{value:0},uThreshold:{value:bloomThreshold},uKnee:{value:bloomKnee}},vertexShader:VERT,fragmentShader:DOWN_FRAG,depthTest:false,depthWrite:false,toneMapped:false});
 const upMat=new T.ShaderMaterial({name:'snow-r19 / bloom up',uniforms:{tSrc:{value:null},uTexel:{value:new T.Vector2()}},vertexShader:VERT,fragmentShader:UP_FRAG,depthTest:false,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending,transparent:true});
 const shaftMat=new T.ShaderMaterial({name:'snow-r19 / light shafts',uniforms:{tSrc:{value:null},uSunUv:{value:new T.Vector3(.5,.5,0)},uAspect:{value:1},uSpread:{value:3.2},uSeed:{value:0}},vertexShader:VERT,fragmentShader:SHAFT_FRAG,depthTest:false,depthWrite:false,toneMapped:false});
 let shafts=null;const sunClip=new T.Vector3();
 const passQuad=new T.Mesh(quad.geometry,downMat);passQuad.frustumCulled=false;const passScene=new T.Scene();passScene.add(passQuad);
 function sizeMips(){let w=Math.max(1,size.x>>1),h=Math.max(1,size.y>>1);for(let i=0;i<mips.length;i++){mips[i].setSize(w,h);w=Math.max(1,w>>1);h=Math.max(1,h>>1);}}
 if(bloom>0){for(let i=0;i<bloomLevels;i++){const m=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,depthBuffer:false});m.texture.name=`snow-r19 / bloom ${i}`;m.texture.generateMipmaps=false;mips.push(m);}sizeMips();uniforms.tBloom.value=mips[0].texture;}
 function pass(material,src,dst){passQuad.material=material;material.uniforms.tSrc.value=src.texture??src;const img=src.image??src.texture?.image;material.uniforms.uTexel.value.set(1/Math.max(1,src.width??img.width),1/Math.max(1,src.height??img.height));renderer.setRenderTarget(dst);if(material===downMat)renderer.clear(true,false,false);renderer.render(passScene,quadCamera);}
 function renderBloom(){if(!mips.length||uniforms.uBloom.value<=0)return;
  for(let i=0;i<mips.length;i++){downMat.uniforms.uFirst.value=i===0?1:0;pass(downMat,i===0?target:mips[i-1],mips[i]);}
  for(let i=mips.length-1;i>0;i--)pass(upMat,mips[i],mips[i-1]);
 }
 // sky mode 2 only: where the sun sits on screen and how much of it the frame can show
 function renderShafts(){
  if(uniforms.uSkyMode.value<1.5||uniforms.uShaft.value<=0)return;
  sunClip.copy(camera.position).addScaledVector(uniforms.uSun.value,1000).project(camera);
  const front=camera.getWorldDirection(new T.Vector3()).dot(uniforms.uSun.value);
  const edge=Math.max(Math.abs(sunClip.x),Math.abs(sunClip.y)),vis=front<=.05?0:Math.max(0,Math.min(1,(1.7-edge)/.7))*Math.min(1,(front-.05)/.2);
  if(!shafts){shafts=new T.WebGLRenderTarget(Math.max(1,size.x>>1),Math.max(1,size.y>>1),{type:T.HalfFloatType,depthBuffer:false});shafts.texture.name='snow-r19 / light shafts';uniforms.tShafts.value=shafts.texture;}
  shaftMat.uniforms.uSunUv.value.set(sunClip.x*.5+.5,sunClip.y*.5+.5,vis);shaftMat.uniforms.uAspect.value=uniforms.uAspect.value;shaftMat.uniforms.uSeed.value=uniforms.uTime.value;
  passQuad.material=shaftMat;shaftMat.uniforms.tSrc.value=target.texture;renderer.setRenderTarget(shafts);renderer.render(passScene,quadCamera);
 }
 // The grade reads the scene's alpha as "how much of this pixel is sky". Anything that writes depth is not sky, whatever alpha
 // it left behind: alpha-to-coverage foliage has to put its coverage in the fragment's alpha, so every bough edge over snow or
 // over its own tree ended up below 1 and had the sky mixed into it (a bright dot on each needle against a low sun).
 // Last thing in the scene pass: a far-plane triangle that passes only where a depth sample was written and sets that
 // sample's alpha to 1. Alpha channel only, per MSAA sample, so silhouettes against the sky keep their antialiasing.
 const solid=new T.Mesh(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3)),
  new T.ShaderMaterial({name:'snow-r19 / solid where depth was written',vertexShader:'void main(){gl_Position=vec4(position.xy,1.,1.);}',fragmentShader:'void main(){gl_FragColor=vec4(0.,0.,0.,1.);}',
   depthTest:true,depthFunc:T.GreaterDepth,depthWrite:false,transparent:true,blending:T.NoBlending,toneMapped:false,fog:false}));
 solid.name='snow-r19 / solid alpha';solid.frustumCulled=false;solid.renderOrder=1e6;solid.castShadow=false;solid.receiveShadow=false;solid.raycast=()=>{};
 solid.onBeforeRender=r=>{const c=r.state.buffers.color;c.setMask(true);r.getContext().colorMask(false,false,false,true);c.setLocked(true);};
 solid.onAfterRender=r=>{r.state.buffers.color.setLocked(false);r.getContext().colorMask(true,true,true,true);};
 scene.add(solid);
 const clear=new T.Color();let frames=0;
 function render(overlay=null){
  uniforms.uNear.value=camera.near;uniforms.uFar.value=camera.far;uniforms.uTime.value=(frames++%997)/997;
  uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);uniforms.uCamWorld.value.copy(camera.matrixWorld);
  const previousTarget=renderer.getRenderTarget(),previousAlpha=renderer.getClearAlpha();renderer.getClearColor(clear);
  renderer.setRenderTarget(target);renderer.setClearColor(0x000000,0);renderer.clear(true,true,true);renderer.render(scene,camera);
  // overlay (the level's first-person weapon): same HDR target, so one grade and one bloom for everything on screen
  if(overlay)overlay(target);
  // coverage pass: only layer-1 objects, no shadow work
  SCENE_DEPTH.tSceneDepth.value=depthTexture;SCENE_DEPTH.uRes.value.set(target.width,target.height);SCENE_DEPTH.uDepthNear.value=camera.near;SCENE_DEPTH.uDepthFar.value=camera.far;
  const mask=camera.layers.mask,autoShadow=renderer.shadowMap.autoUpdate;camera.layers.set(FLAKE_LAYER);renderer.shadowMap.autoUpdate=false;
  renderer.setRenderTarget(flakes);renderer.clear(true,false,false);renderer.render(scene,camera);
  camera.layers.mask=mask;renderer.shadowMap.autoUpdate=autoShadow;
  renderBloom();renderShafts();
  renderer.setRenderTarget(previousTarget);renderer.setClearColor(clear,previousAlpha);renderer.render(quadScene,quadCamera);
 }
 function resize(){renderer.getDrawingBufferSize(size);const w=Math.max(1,size.x),h=Math.max(1,size.y);target.setSize(w,h);flakes.setSize(w,h);sizeMips();shafts?.setSize(Math.max(1,w>>1),Math.max(1,h>>1));uniforms.uAspect.value=w/h;uniforms.uPx.value.set(1/w,1/h);}
 function setCentre(mask,lift=0){uniforms.uCentre.value.set(mask.x,mask.y,mask.rx,mask.ry);uniforms.uCentreLift.value=lift;}
 function setSky(mode){uniforms.uSkyMode.value=mode==='mood'?2:mode==='gradient'?1:0;}
 function inspection(){return {kind:'snow-r19 grade',samples:target.samples,size:[target.width,target.height],exposure:uniforms.uExposure.value,whitePoint:uniforms.uWhite.value,sky:uniforms.uSkyMode.value?'gradient':'white',centreLift:uniforms.uCentreLift.value,centre:uniforms.uCentre.value.toArray(),bloom:uniforms.uBloom.value,bloomLevels:mips.length,saturation:uniforms.uSat.value,curve:uniforms.uCurve.value};}
 function dispose(){scene.remove(solid);solid.geometry.dispose();solid.material.dispose();target.dispose();flakes.dispose();depthTexture.dispose();material.dispose();quad.geometry.dispose();for(const m of mips)m.dispose();shafts?.dispose();shaftMat.dispose();downMat.dispose();upMat.dispose();black.dispose();}
 return {render,resize,setCentre,setSky,inspection,dispose,preserveWhite:sky==='white',target,uniforms};
}
