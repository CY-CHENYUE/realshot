import * as T from 'three';
import {mulberry} from './snow-noise.mjs';

// Layered snowfall for the r19 snow world. Every flake is a GPU-animated,
// velocity-stretched capsule. Its motion is the falling speed plus wind, plus
// our forward travel through still air, so near flakes streak toward the
// viewer while the distant veil only drifts.
// Flakes (layer 1) render in a separate coverage pass, depth-tested by hand
// against the resolved scene depth. The final grade then colours them by what
// lies behind: soft grey over bright snow and the white sky, near white over
// pine and rock. Snowfall stays visible on a white transparent display.
export const FLAKE_LAYER=1;
export const SCENE_DEPTH={tSceneDepth:{value:null},uRes:{value:new T.Vector2(1,1)},uDepthNear:{value:.08},uDepthFar:{value:1400}};
const DEPTH_TEST=`
#include <packing>
uniform sampler2D tSceneDepth;uniform vec2 uRes;uniform float uDepthNear,uDepthFar;
float sceneOcclusion(){
 float sd=texture2D(tSceneDepth,gl_FragCoord.xy/uRes).x;
 if(sd>=.9999999)return 1.;
 float scene=-perspectiveDepthToViewZ(sd,uDepthNear,uDepthFar),me=-perspectiveDepthToViewZ(gl_FragCoord.z,uDepthNear,uDepthFar);
 return smoothstep(0.,.35,scene-me);
}`;

const VERT=`
attribute vec2 corner;
attribute vec4 aSeed;
uniform float uTime,uTravel,uTravelSpeed,uStretch,uDensity,uAlpha,uMinPixels,uCentreFade,uFlutter,uAnchorK;
uniform vec3 uOrigin,uBoxMin,uBoxSize,uWind;
uniform vec2 uSize,uFall,uViewport,uNearFade;
uniform vec4 uCentre;
varying vec2 vSeg;varying float vLen;varying float vAlpha;
void main(){
 float keep=fract(aSeed.x*7.137+aSeed.y*3.913+aSeed.z*5.71);
 if(keep>uDensity){gl_Position=vec4(2.,2.,2.,1.);vAlpha=0.;return;}
 float fall=mix(uFall.x,uFall.y,aSeed.w),ph=aSeed.w*61.0+aSeed.x*17.0,t=uTime;
 vec3 local=aSeed.xyz*uBoxSize;
 local.x+=uWind.x*t+(sin(t*1.31+ph)*.22+sin(t*.43+ph*1.7)*.38)*uFlutter;
 local.y-=fall*t;
 local.z+=uTravel+uWind.z*t+cos(t*1.07+ph)*.16*uFlutter;
 // uAnchorK=1 pins flakes to the world while the wrap box follows a free camera
 vec3 q=mod(local-uOrigin*uAnchorK,uBoxSize)/uBoxSize;   // 0..1 inside the wrapping box
 vec3 p=uOrigin+uBoxMin+q*uBoxSize;
 vec3 vel=vec3(uWind.x+(cos(t*1.31+ph)*.29+cos(t*.43+ph*1.7)*.16)*uFlutter,-fall,uTravelSpeed+uWind.z);
 vec4 h=projectionMatrix*viewMatrix*vec4(p,1.),tl=projectionMatrix*viewMatrix*vec4(p-vel*uStretch,1.);
 if(h.w<.12){gl_Position=vec4(2.,2.,2.,1.);vAlpha=0.;return;}
 float aspect=uViewport.x/uViewport.y;
 vec2 hn=h.xy/h.w,tn=tl.xy/max(tl.w,.05);
 vec2 d=(tn-hn)*vec2(aspect,1.);float len=length(d);vec2 dir=len>1e-6?d/len:vec2(0.,1.);vec2 perp=vec2(-dir.y,dir.x);
 float size=mix(uSize.x,uSize.y,fract(aSeed.w*13.7));
 float r=size*projectionMatrix[1][1]/h.w;              // NDC (vertical units)
 float minR=uMinPixels*2./uViewport.y,cover=clamp(r/minR,0.,1.);r=max(r,minR);
 len=min(len,r*40.);
 vec2 off=perp*r*corner.x+dir*(corner.y<0.?-r:len+r);
 gl_Position=vec4((hn+off/vec2(aspect,1.))*h.w,h.z,h.w);
 vSeg=vec2(corner.x,corner.y<0.?-1.:len/r+1.);vLen=len/r;
 // fade at the wrapping faces, near the camera, and into the distance
 vec3 edge=smoothstep(vec3(0.),vec3(.07),q)*smoothstep(vec3(1.),vec3(.93),q);
 float a=edge.x*edge.y*edge.z*uAlpha*cover*cover;
 a*=smoothstep(uNearFade.x,uNearFade.y,h.w)*exp(-h.w*.0035);
 vec2 uv=hn*.5+.5;float m=1.-smoothstep(.78,1.05,length((uv-uCentre.xy)/max(uCentre.zw,vec2(1e-3))));
 a*=1.-m*uCentreFade;
 vAlpha=a/(1.+vLen*.42);                               // a streak spreads one flake's light
}`;
const FRAG=`
uniform vec3 uTint;
varying vec2 vSeg;varying float vLen;varying float vAlpha;
${DEPTH_TEST}
void main(){
 float y=clamp(vSeg.y,0.,vLen);float d=length(vec2(vSeg.x,vSeg.y-y));
 float a=vAlpha*(1.-smoothstep(.35,1.,d));
 if(a<.002)discard;
 a*=sceneOcclusion();if(a<.002)discard;
 gl_FragColor=vec4(uTint*a,a);
}`;

function streakGeometry(count,seed){
 const base=new T.InstancedBufferGeometry();
 base.setAttribute('corner',new T.Float32BufferAttribute([-1,-1, 1,-1, 1,1, -1,1],2));
 base.setIndex([0,1,2,0,2,3]);
 const rand=mulberry(seed),s=new Float32Array(count*4);for(let i=0;i<s.length;i++)s[i]=rand();
 base.setAttribute('aSeed',new T.InstancedBufferAttribute(s,4));base.instanceCount=count;
 // a large static bound, positions are animated on the GPU
 base.boundingSphere=new T.Sphere(new T.Vector3(),1e5);
 return base;
}

export function createSnowLayer({name,count,boxMin,boxMax,size=[.01,.02],fall=[.8,1.4],stretch=.035,alpha=.55,minPixels=.9,tint=[.66,.70,.76],flutter=1,groundRelative=false,nearFade=[.12,.55],seed=1}){
 const geometry=streakGeometry(count,seed);
 const uniforms={
  uTime:{value:0},uTravel:{value:0},uTravelSpeed:{value:0},uStretch:{value:stretch},uDensity:{value:1},uAlpha:{value:alpha},uMinPixels:{value:minPixels},
  uCentreFade:{value:0},uFlutter:{value:flutter},uAnchorK:{value:0},uOrigin:{value:new T.Vector3()},uBoxMin:{value:new T.Vector3(...boxMin)},
  uBoxSize:{value:new T.Vector3(boxMax[0]-boxMin[0],boxMax[1]-boxMin[1],boxMax[2]-boxMin[2])},uWind:{value:new T.Vector3()},
  uSize:{value:new T.Vector2(...size)},uNearFade:{value:new T.Vector2(...nearFade)},uFall:{value:new T.Vector2(...fall)},uViewport:{value:new T.Vector2(1280,800)},
  uCentre:{value:new T.Vector4(.5,.5,0,0)},uTint:{value:new T.Color(...tint)},...SCENE_DEPTH,
 };
 const material=new T.ShaderMaterial({name:'snowfall / '+name,uniforms,vertexShader:VERT,fragmentShader:FRAG,transparent:true,depthWrite:false,depthTest:false,side:T.DoubleSide, // the (perp, dir) screen basis is mirrored: single-sided, every flake is culled as a back face
  blending:T.CustomBlending,blendSrc:T.OneFactor,blendDst:T.OneMinusSrcAlphaFactor,blendSrcAlpha:T.OneFactor,blendDstAlpha:T.OneMinusSrcAlphaFactor,fog:false});
 const mesh=new T.Mesh(geometry,material);mesh.name='snowfall / '+name;mesh.frustumCulled=false;mesh.renderOrder=20;mesh.castShadow=false;mesh.receiveShadow=false;mesh.layers.set(FLAKE_LAYER);
 const viewport=new T.Vector4();
 mesh.onBeforeRender=(renderer,scene,camera)=>{renderer.getCurrentViewport(viewport);uniforms.uViewport.value.set(Math.max(1,viewport.z),Math.max(1,viewport.w));
  if(groundRelative)uniforms.uOrigin.value.set(camera.position.x,0,camera.position.z);else uniforms.uOrigin.value.copy(camera.position);};
 return {mesh,uniforms,count,dispose(){geometry.dispose();material.dispose();}};
}

// Three depth layers plus wind-driven ground spindrift.
export function createSnowWeather({seed=0x5eed,anchored=false}={}){
 const root=new T.Group();root.name='r19 weather / snowfall + spindrift';
 // The transit view (a fixed camera looking down the track) keeps the r19 layout: boxes ahead of the lens.
 // A free camera (the level) gets boxes centred on the player, so it snows whichever way they look, with
 // each layer handing over to the next by distance. `capacity` is the heaviest snowfall the instance
 // counts are sized for (the storm mood); an ordinary day draws about a third of them.
 const capacity=anchored?2.6:1;
 const layers=anchored?{
  near:createSnowLayer({name:'near flakes',count:14000,boxMin:[-8,-3.2,-8],boxMax:[8,6.4,8],size:[.006,.014],fall:[.85,1.55],stretch:.016,alpha:.92,minPixels:1.25,nearFade:[.25,1.3],seed:seed+1}),
  mid:createSnowLayer({name:'mid flakes',count:22000,boxMin:[-30,-6,-30],boxMax:[30,22,30],size:[.022,.05],fall:[.9,1.5],stretch:.013,alpha:.82,minPixels:1.05,nearFade:[5,9],seed:seed+2}),
  far:createSnowLayer({name:'far veil',count:12000,boxMin:[-110,-12,-110],boxMax:[110,70,110],size:[.1,.22],fall:[1.0,1.7],stretch:.01,alpha:.34,minPixels:.9,nearFade:[22,34],seed:seed+3}),
  drift:createSnowLayer({name:'ground spindrift',count:1400,boxMin:[-18,-.05,-18],boxMax:[18,.75,18],size:[.025,.05],fall:[.02,.12],stretch:.16,alpha:.0,minPixels:.9,flutter:.5,groundRelative:true,seed:seed+4}),
 }:{
  near:createSnowLayer({name:'near streaks',count:1400,boxMin:[-9,-2.4,-26],boxMax:[9,6.6,1.4],size:[.012,.03],fall:[.85,1.55],stretch:.045,alpha:.85,minPixels:1.1,seed:seed+1}),
  mid:createSnowLayer({name:'mid flakes',count:2600,boxMin:[-34,-2,-82],boxMax:[34,22,-24],size:[.04,.075],fall:[.9,1.5],stretch:.03,alpha:.62,minPixels:1,seed:seed+2}),
  far:createSnowLayer({name:'far veil',count:2200,boxMin:[-110,0,-230],boxMax:[110,60,-82],size:[.16,.3],fall:[1.0,1.7],stretch:.02,alpha:.36,minPixels:.9,seed:seed+3}),
  drift:createSnowLayer({name:'ground spindrift',count:800,boxMin:[-15,-.05,-42],boxMax:[15,.75,5],size:[.025,.05],fall:[.02,.12],stretch:.16,alpha:.0,minPixels:.9,flutter:.5,groundRelative:true,seed:seed+4}),
 };
 for(const l of Object.values(layers)){root.add(l.mesh);l.uniforms.uAnchorK.value=anchored?1:0;}
 const state={density:1,wind:0,gust:0,centreFade:0};
 function setCentre(mask,strength=0){
  // mask: {x,y,rx,ry} in UV with y up; near and mid flakes fade over the physical object.
  for(const [k,l] of Object.entries(layers)){l.uniforms.uCentre.value.set(mask.x,mask.y,mask.rx,mask.ry);l.uniforms.uCentreFade.value=k==='near'?strength:k==='mid'?strength*.6:strength*.3;}
  state.centreFade=strength;
 }
 // time: presentation seconds; travel: metres; profile: blended section profile.
 function update(time,{travel=0,travelSpeed=0,profile=null}={}){
  const snow=profile?.snow??.7,wind=profile?.wind??.3;
  const gust=Math.sin(time*.23)*.6+Math.sin(time*.71+1.3)*.3+Math.sin(time*1.9)*.1;
  const wx=-(0.6+wind*3.4)*(1+gust*.35),wz=wind*.8;
  state.density=.42+.58*snow;state.wind=wx;state.gust=gust;
  for(const [k,l] of Object.entries(layers)){
   const u=l.uniforms;u.uTime.value=time;u.uTravel.value=travel;u.uTravelSpeed.value=travelSpeed;
   u.uWind.value.set(k==='drift'?wx*2.2:wx,0,k==='drift'?wz*1.5:wz);
   u.uDensity.value=k==='drift'?1:state.density/capacity;
  }
  layers.drift.uniforms.uAlpha.value=.05+.42*Math.max(0,wind-.1)*(.75+.25*gust);
 }
 function inspection(){return {layers:Object.fromEntries(Object.entries(layers).map(([k,l])=>[k,{count:l.count,density:l.uniforms.uDensity.value,alpha:l.uniforms.uAlpha.value,centreFade:l.uniforms.uCentreFade.value}])),capacity,...state};}
 function dispose(){for(const l of Object.values(layers))l.dispose();root.clear();}
 return {root,layers,update,setCentre,inspection,dispose};
}

// Impact snow: bursts, puffs and craters that live in the moving track space
// (the caller parents root to the scrolling terrain group), so they travel
// with the ground and the air instead of hanging still in front of the camera.
const P_VERT=`
attribute float aSize;attribute vec4 aColor;
uniform float uViewportH;
varying vec4 vColor;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;
 gl_PointSize=clamp(aSize*projectionMatrix[1][1]*uViewportH*.5/max(-mv.z,.05),0.,96.);vColor=aColor;}`;
const P_FRAG=`varying vec4 vColor;
${DEPTH_TEST}
void main(){vec2 c=gl_PointCoord*2.-1.;float d=dot(c,c);float a=vColor.a*(1.-smoothstep(.25,1.,d));if(a<.003)discard;a*=sceneOcclusion();if(a<.003)discard;gl_FragColor=vec4(vColor.rgb*a,a);}`;
export function createSnowImpacts({maxParticles=640,maxCraters=28}={}){
 const root=new T.Group();root.name='r19 snow impacts';
 const pos=new Float32Array(maxParticles*3),size=new Float32Array(maxParticles),color=new Float32Array(maxParticles*4);
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.BufferAttribute(pos,3).setUsage(T.DynamicDrawUsage));
 geometry.setAttribute('aSize',new T.BufferAttribute(size,1).setUsage(T.DynamicDrawUsage));
 geometry.setAttribute('aColor',new T.BufferAttribute(color,4).setUsage(T.DynamicDrawUsage));
 geometry.boundingSphere=new T.Sphere(new T.Vector3(),1e5);geometry.setDrawRange(0,0);
 const uniforms={uViewportH:{value:800},...SCENE_DEPTH};
 const material=new T.ShaderMaterial({name:'snow impact particles',uniforms,vertexShader:P_VERT,fragmentShader:P_FRAG,transparent:true,depthWrite:false,depthTest:false,
  blending:T.CustomBlending,blendSrc:T.OneFactor,blendDst:T.OneMinusSrcAlphaFactor,blendSrcAlpha:T.OneFactor,blendDstAlpha:T.OneMinusSrcAlphaFactor});
 const points=new T.Points(geometry,material);points.name='snow impact spray';points.frustumCulled=false;points.renderOrder=18;points.layers.set(FLAKE_LAYER);root.add(points);
 const viewport=new T.Vector4();points.onBeforeRender=renderer=>{renderer.getCurrentViewport(viewport);uniforms.uViewportH.value=Math.max(1,viewport.w);};
 // craters: soft blue-grey scoop with a bright thrown rim
 const craterMaterial=new T.ShaderMaterial({name:'snow crater',transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,
  uniforms:{},vertexShader:'attribute float aFade;varying vec2 vUv;varying float vFade;void main(){vUv=uv*2.-1.;vFade=aFade;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec2 vUv;varying float vFade;void main(){float r=length(vUv);float pit=1.-smoothstep(.0,.55,r);float rim=smoothstep(.45,.7,r)*(1.-smoothstep(.75,1.,r));
   vec3 c=mix(vec3(.30,.38,.48),vec3(.62,.70,.80),smoothstep(0.,.5,r));float a=(pit*.55+rim*.18)*vFade;if(a<.004)discard;
   c=mix(c,vec3(.98),rim*.8);gl_FragColor=vec4(c*a,a);}`,
  blending:T.CustomBlending,blendSrc:T.OneFactor,blendDst:T.OneMinusSrcAlphaFactor,blendSrcAlpha:T.OneFactor,blendDstAlpha:T.OneMinusSrcAlphaFactor});
 const crater=new T.InstancedMesh(new T.PlaneGeometry(1,1),craterMaterial,maxCraters);crater.name='snow craters';crater.count=0;crater.frustumCulled=false;crater.renderOrder=5;
 const fade=new Float32Array(maxCraters);crater.geometry.setAttribute('aFade',new T.InstancedBufferAttribute(fade,1).setUsage(T.DynamicDrawUsage));root.add(crater);
 const particles=[],craters=[];let next=0;const temp=new T.Object3D(),up=new T.Vector3(0,0,1);
 const PALETTE={snow:[.86,.9,.95],powder:[.95,.97,1],rock:[.05,.055,.06],ice:[.55,.75,.86],wood:[.22,.16,.11],frame:[.75,.78,.8]};
 function spawn(p,v,s,life,c,alpha,drag=1.6,grav=6.5,grow=0){if(particles.length>=maxParticles)particles.shift();particles.push({p:p.clone(),v:v.clone(),s,life,age:0,c,alpha,drag,grav,grow});}
 // position/normal in the impacts root's local space
 function trigger({position,normal=[0,1,0],kind='snow',direction=null,strength=1}){
  const p=new T.Vector3(...position),n=new T.Vector3(...normal).normalize(),rand=mulberry((next++*2654435761)>>>0);
  const tangent=new T.Vector3().crossVectors(n,Math.abs(n.y)<.9?new T.Vector3(0,1,0):new T.Vector3(1,0,0)).normalize(),bit=new T.Vector3().crossVectors(n,tangent);
  const count=Math.round((kind==='tree'?30:kind==='rock'?20:kind==='frame'?10:34)*strength);
  for(let i=0;i<count;i++){
   const a=rand()*Math.PI*2,spread=kind==='tree'?.9:.55+rand()*.5,speed=(kind==='tree'?.9:1.6)+rand()*(kind==='tree'?1.2:2.6);
   const v=n.clone().multiplyScalar(speed).addScaledVector(tangent,Math.cos(a)*spread*speed).addScaledVector(bit,Math.sin(a)*spread*speed);v.y+=.6+rand()*.8;
   const rock=kind==='rock'&&i<8;
   spawn(p,v,rock?.025+rand()*.03:.03+rand()*.06,.55+rand()*.7,rock?PALETTE.rock:kind==='ice'&&i<10?PALETTE.ice:PALETTE.snow,rock?.95:.85,rock?.6:2.2,rock?9.8:kind==='tree'?3.2:5.5);
  }
  // soft lingering puff
  for(let i=0;i<(kind==='frame'?2:5);i++){const v=n.clone().multiplyScalar(.35+rand()*.5).add(new T.Vector3((rand()-.5)*.5,.35+rand()*.4,(rand()-.5)*.5));spawn(p,v,.16+rand()*.12,1.1+rand()*.7,PALETTE.powder,.34,2.8,.25,.85);}
  if(kind==='tree')for(let i=0;i<14;i++){const q=p.clone().add(new T.Vector3((rand()-.5)*.6,rand()*.4,(rand()-.5)*.6));spawn(q,new T.Vector3((rand()-.5)*.3,-.2-rand()*.4,(rand()-.5)*.3),.05+rand()*.07,1.4+rand()*.8,PALETTE.powder,.75,1.2,2.2);}
  if(kind==='snow'||kind==='rock'||kind==='ice'){
   if(craters.length>=maxCraters)craters.shift();
   craters.push({p:p.clone().addScaledVector(n,.012),n:n.clone(),s:.16+rand()*.08,age:0,life:7,spin:rand()*Math.PI*2});
  }
 }
 function update(dt){
  let i=0;
  for(const q of particles){q.age+=dt;if(q.age>=q.life)continue;const k=Math.exp(-q.drag*dt);q.v.multiplyScalar(k);q.v.y-=q.grav*dt;q.p.addScaledVector(q.v,dt);
   const f=q.age/q.life;pos[i*3]=q.p.x;pos[i*3+1]=q.p.y;pos[i*3+2]=q.p.z;size[i]=q.s*(1+q.grow*q.age*2.2);
   color[i*4]=q.c[0];color[i*4+1]=q.c[1];color[i*4+2]=q.c[2];color[i*4+3]=q.alpha*(1-f)*(1-f)*Math.min(1,q.age*25+.2);i++;}
  for(let j=particles.length-1;j>=0;j--)if(particles[j].age>=particles[j].life)particles.splice(j,1);
  geometry.setDrawRange(0,i);for(const k of ['position','aSize','aColor'])geometry.attributes[k].needsUpdate=true;
  let c=0;for(const q of craters){q.age+=dt;if(q.age>=q.life)continue;temp.position.copy(q.p);temp.quaternion.setFromUnitVectors(up,q.n);temp.rotateZ(q.spin);temp.scale.setScalar(q.s*Math.min(1,q.age*18+.3));temp.updateMatrix();crater.setMatrixAt(c,temp.matrix);fade[c]=1-Math.max(0,(q.age-q.life*.6)/(q.life*.4));c++;}
  for(let j=craters.length-1;j>=0;j--)if(craters[j].age>=craters[j].life)craters.splice(j,1);
  crater.count=c;crater.instanceMatrix.needsUpdate=true;crater.geometry.attributes.aFade.needsUpdate=true;
 }
 function reset(){particles.length=0;craters.length=0;geometry.setDrawRange(0,0);crater.count=0;}
 function inspection(){return {particles:particles.length,craters:craters.length};}
 function dispose(){geometry.dispose();material.dispose();crater.geometry.dispose();craterMaterial.dispose();crater.dispose();root.clear();}
 return {root,trigger,update,reset,inspection,dispose};
}
