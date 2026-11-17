import * as T from 'three';
import {SUN_DIRECTION,ATMOSPHERE} from './snow-atmosphere-r19.mjs';

// RealShot r26 · time of day and weather for the level.
//
// A mood is one flat table of numbers: where the sun is and what colour it has, the sky dome and snow
// bounce, the aerial haze, the painted sky (gradient, clouds, sun glow, stars, aurora), the grade and the
// snowfall (and `lamp`: how strongly the outposts' floodlights show). The director blends two moods number by number and writes the result into the things that
// already exist: the world's light rig, the shared haze uniforms, the post pass and the weapon lights.
// Nothing is recompiled, so the level can drift from a blue dawn into a backlit golden hour, into a
// whiteout and out into dusk while the player runs.
//
// Angles in degrees. az 0 is straight up the valley (the way the player runs, -z), positive to the right.
// Colours are linear.
export const MOODS={
 // the r25 look, kept for comparison (?mood=noon)
 noon:{az:-24,el:31,sun:[1,.93,.84],sunI:3.4,skyC:[.45,.6,.76],groundC:[.86,.9,.92],hemiI:.62,
  fog:[.86,.92,1],hazeNear:[.7,.8,.93],hazeFar:[1.46,1.48,1.52],hazeTint:[.55,.34,.12],haze:.62,lobe:0,
  zen:[.3,.47,.8],hor:[1.1,1.2,1.35],glow:[.9,.75,.55],cloudLit:[1.5,1.5,1.5],cloudDark:[.7,.76,.86],disk:[30,27,22],cover:.3,cloudScale:1.1,sharp:.2,glowFall:5,stars:0,aurora:0,
  exposure:.76,white:1.42,toneLo:[.93,.975,1.07],toneHi:[1.035,1,.955],sat:.13,curve:.24,bloom:.32,vignette:.06,grain:0,shaft:.25,shaftCol:[1,.9,.75],
  lamp:0,env:.34,envWeapon:1,wSun:2.9,wSky:1.15,wFill:.55,flake:[.97,.985,1],snow:1,wind:1},
 // blue hour: the sun is just clearing the ridge at the head of the valley
 dawn:{az:-16,el:7,sun:[1,.56,.34],sunI:2.6,skyC:[.24,.36,.66],groundC:[.34,.4,.58],hemiI:.72,
  fog:[1,1,1],hazeNear:[.2,.28,.46],hazeFar:[.56,.44,.48],hazeTint:[.95,.42,.2],haze:.9,lobe:.7,
  zen:[.07,.15,.36],hor:[.95,.56,.46],glow:[1.8,.85,.42],cloudLit:[1.5,.78,.6],cloudDark:[.16,.2,.34],disk:[34,20,9],cover:.42,cloudScale:1.0,sharp:.22,glowFall:4.5,stars:.5,aurora:0,
  exposure:1.0,white:1.42,toneLo:[.9,.97,1.13],toneHi:[1.07,1,.92],sat:.2,curve:.34,bloom:.5,vignette:.24,grain:.035,shaft:1.0,shaftCol:[1,.62,.36],
  lamp:0.6,env:.3,envWeapon:.9,wSun:2.4,wSky:.8,wFill:.3,flake:[.8,.8,.96],snow:0.7,wind:.7},
 // golden hour, backlit: low warm sun ahead, long blue shadows running toward the player
 golden:{az:-13,el:12,sun:[1,.74,.47],sunI:3.9,skyC:[.36,.5,.82],groundC:[.62,.6,.62],hemiI:.5,
  fog:[1,1,1],hazeNear:[.4,.48,.68],hazeFar:[.74,.6,.54],hazeTint:[.8,.42,.17],haze:.7,lobe:.6,
  zen:[.13,.28,.62],hor:[1.15,.88,.64],glow:[1.9,1.2,.6],cloudLit:[1.8,1.35,.95],cloudDark:[.32,.36,.5],disk:[44,34,20],cover:.36,cloudScale:1.15,sharp:.2,glowFall:4,stars:0,aurora:0,
  exposure:.8,white:1.42,toneLo:[.9,.97,1.12],toneHi:[1.06,1.005,.93],sat:.2,curve:.36,bloom:.5,vignette:.2,grain:.03,shaft:.7,shaftCol:[1,.8,.52],
  lamp:0.15,env:.34,envWeapon:1,wSun:3.4,wSky:.85,wFill:.3,flake:[1,.93,.8],snow:0.6,wind:.8},
 // whiteout: the front arrives, flat grey light, the valley closes in
 storm:{az:24,el:38,sun:[.82,.88,1],sunI:.8,skyC:[.5,.57,.68],groundC:[.5,.55,.62],hemiI:.95,
  fog:[1,1,1],hazeNear:[.3,.35,.42],hazeFar:[.46,.5,.57],hazeTint:[.1,.1,.1],haze:2.3,lobe:0,
  zen:[.16,.19,.24],hor:[.42,.46,.52],glow:[.25,.26,.28],cloudLit:[.62,.66,.72],cloudDark:[.2,.23,.28],disk:[0,0,0],cover:.97,cloudScale:1.5,sharp:.3,glowFall:5,stars:0,aurora:0,
  exposure:.86,white:1.42,toneLo:[.92,.98,1.1],toneHi:[1.0,1.0,1.0],sat:.04,curve:.4,bloom:.5,vignette:.36,grain:.05,shaft:0,shaftCol:[1,1,1],
  lamp:0.8,env:.42,envWeapon:.85,wSun:1.0,wSky:1.25,wFill:.3,flake:[.86,.88,.92],snow:2.6,wind:2.4},
 // the front passes at sunset: a red sun under the cloud deck, side-on
 dusk:{az:34,el:5.5,sun:[1,.6,.34],sunI:3.2,skyC:[.14,.34,.62],groundC:[.3,.4,.48],hemiI:.6,
  fog:[1,1,1],hazeNear:[.18,.32,.5],hazeFar:[.6,.47,.4],hazeTint:[.75,.36,.12],haze:1.0,lobe:.8,
  zen:[.06,.08,.26],hor:[1.25,.5,.3],glow:[2.3,.85,.34],cloudLit:[1.9,.72,.42],cloudDark:[.15,.12,.26],disk:[46,20,7],cover:.56,cloudScale:1.1,sharp:.24,glowFall:3.6,stars:.35,aurora:0,
  exposure:1.0,white:1.42,toneLo:[.9,.98,1.1],toneHi:[1.06,1.01,.92],sat:.15,curve:.38,bloom:.6,vignette:.26,grain:.035,shaft:1.2,shaftCol:[1,.55,.3],
  lamp:0.85,env:.3,envWeapon:.9,wSun:3.0,wSky:.7,wFill:.25,flake:[.9,.78,.8],snow:.9,wind:1.1},
 // clear polar night: moonlight, stars, aurora over the ridge
 night:{az:-30,el:34,sun:[.62,.74,1],sunI:1.25,skyC:[.1,.16,.36],groundC:[.12,.16,.28],hemiI:.7,
  fog:[1,1,1],hazeNear:[.05,.08,.16],hazeFar:[.12,.2,.34],hazeTint:[.1,.3,.25],haze:.8,lobe:.3,
  zen:[.012,.022,.06],hor:[.06,.14,.24],glow:[.16,.24,.4],cloudLit:[.22,.3,.44],cloudDark:[.02,.03,.07],disk:[9,10,12],cover:.2,cloudScale:1.0,sharp:.2,glowFall:4,stars:1.4,aurora:1.1,
  exposure:1.35,white:1.42,toneLo:[.88,.97,1.16],toneHi:[1.0,1.02,1.02],sat:.16,curve:.3,bloom:.7,vignette:.3,grain:.05,shaft:.2,shaftCol:[.6,.75,1],
  lamp:1,env:.3,envWeapon:.8,wSun:1.4,wSky:.6,wFill:.2,flake:[.5,.58,.76],snow:0.6,wind:.6},
};
// Each run plays one of these: [where along the route (metres), mood] keys, then the mood the hold ends in.
export const ARCS=[
 {name:'黎明突围',keys:[[0,'dawn'],[90,'dawn'],[190,'golden'],[330,'golden'],[420,'storm']],hold:'dusk'},
 {name:'落日追击',keys:[[0,'golden'],[120,'golden'],[230,'storm'],[300,'storm'],[400,'dusk']],hold:'night'},
 {name:'极夜',keys:[[0,'dusk'],[110,'dusk'],[220,'night'],[420,'night']],hold:'dawn'},
];

const lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>t*t*(3-2*t);
function mix(a,b,t,out={}){
 for(const k of Object.keys(a)){const x=a[k],y=b[k];
  if(Array.isArray(x)){const o=out[k]??(out[k]=[0,0,0]);for(let i=0;i<x.length;i++)o[i]=lerp(x[i],y[i],t);}else out[k]=lerp(x,y,t);}
 return out;
}
const ENV_FRAG=`varying vec3 vDir;uniform vec3 uSun,uZen,uHor,uGnd,uGlow;void main(){
 vec3 d=normalize(vDir);float y=d.y;vec3 c=y>0.?mix(uHor,uZen,pow(clamp(y,0.,1.),.55)):mix(uHor,uGnd,clamp(-y*4.,0.,1.));
 float mu=max(dot(d,uSun),0.);c+=uGlow*(pow(mu,700.)*26.+pow(mu,10.)*.4);gl_FragColor=vec4(c,1.);}`;

export function createMoodDirector({renderer,scene,weaponScene,lights,weaponLights,post,weather}){
 const sky=new T.Scene(),envMat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{uSun:{value:new T.Vector3()},uZen:{value:new T.Vector3()},uHor:{value:new T.Vector3()},uGnd:{value:new T.Vector3()},uGlow:{value:new T.Vector3()}},
  vertexShader:'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:ENV_FRAG});
 sky.add(new T.Mesh(new T.SphereGeometry(10,32,16),envMat));
 const pmrem=new T.PMREMGenerator(renderer);let env=null,envKey=null;
 const now={},patch={};let arc=ARCS[0],fixed=null,drift=0,name='';
 const U=post.uniforms;
 function bakeEnvironment(m){
  const u=envMat.uniforms;u.uSun.value.copy(SUN_DIRECTION);u.uZen.value.fromArray(m.zen);u.uHor.value.fromArray(m.hor);u.uGnd.value.fromArray(m.groundC).multiplyScalar(m.hemiI*1.3+m.sunI*.12);u.uGlow.value.fromArray(m.glow);
  const target=pmrem.fromScene(sky,.02);env?.dispose();env=target;scene.environment=weaponScene.environment=target.texture;
 }
 function apply(m){
  const a=T.MathUtils.degToRad(m.az),e=T.MathUtils.degToRad(m.el),c=Math.cos(e);
  SUN_DIRECTION.set(Math.sin(a)*c,Math.sin(e),-Math.cos(a)*c);SUN_DIRECTION.toArray(ATMOSPHERE.sun);
  lights.sun.color.fromArray(m.sun);lights.sun.intensity=m.sunI;lights.hemi.color.fromArray(m.skyC);lights.hemi.groundColor.fromArray(m.groundC);lights.hemi.intensity=m.hemiI;
  ATMOSPHERE.near.set(m.hazeNear);ATMOSPHERE.far.set(m.hazeFar);ATMOSPHERE.tint.set(m.hazeTint);ATMOSPHERE.extra[0]=m.lobe;scene.fog.color.fromArray(m.fog);
  U.uSun.value.copy(SUN_DIRECTION);U.uSkyZen.value.fromArray(m.zen);U.uSkyHor.value.fromArray(m.hor);U.uSkyGlow.value.fromArray(m.glow);U.uCloudLit.value.fromArray(m.cloudLit);U.uCloudDark.value.fromArray(m.cloudDark);U.uSunDisk.value.fromArray(m.disk);
  U.uSkyP.value.set(m.cover,m.cloudScale,drift,m.glowFall);U.uSkyQ.value.set(m.stars,m.aurora,m.sharp,.00014);
  U.uExposure.value=m.exposure;U.uWhite.value=m.white;U.uToneLo.value.fromArray(m.toneLo);U.uToneHi.value.fromArray(m.toneHi);U.uSat.value=m.sat;U.uCurve.value=m.curve;if(U.uBloom.value>0||m.bloom===0)U.uBloom.value=m.bloom;U.uVignette.value=m.vignette;U.uGrain.value=m.grain;
  U.uShaft.value=m.shaft;U.uShaftCol.value.fromArray(m.shaftCol);U.uFlake?.value.fromArray(m.flake);
  scene.environmentIntensity=m.env;weaponScene.environmentIntensity=m.envWeapon;
  weaponLights.sun.color.fromArray(m.sun);weaponLights.sun.intensity=m.wSun;weaponLights.sky.color.fromArray(m.skyC);weaponLights.sky.groundColor.fromArray(m.groundC);weaponLights.sky.intensity=m.wSky;weaponLights.fill.intensity=m.wFill;
  // the image-based light follows in a few steps: rebaking costs a few milliseconds, so not every frame
  const key=[m.az,m.el,...m.zen,...m.hor,m.hemiI].map(v=>Math.round(v*14)).join();if(key!==envKey){envKey=key;bakeEnvironment(m);}
 }
 // S: metres along the route; hold: 0..1 through the beacon hold, or null
 function update(dt,{S=0,hold=null}={}){
  drift+=dt*.012*(now.wind??1);
  let a,b,t=0;
  if(fixed){a=b=MOODS[fixed];name=fixed;}
  else if(hold!==null){a=MOODS[arc.keys.at(-1)[1]];b=MOODS[arc.hold];t=smooth(T.MathUtils.clamp((hold-.3)/.55,0,1));name=t>.5?arc.hold:arc.keys.at(-1)[1];}
  else{const k=arc.keys;let i=0;while(i<k.length-2&&S>=k[i+1][0])i++;a=MOODS[k[i][1]];b=MOODS[k[i+1][1]];t=smooth(T.MathUtils.clamp((S-k[i][0])/Math.max(1,k[i+1][0]-k[i][0]),0,1));name=t>.5?k[i+1][1]:k[i][1];}
  mix(a,b,t,now);for(const [k,v] of Object.entries(patch))now[k]=v;
  apply(now);
 }
 // after world.update: the storm thickens the snowfall and the wind the sections ask for
 function applyWeather(){
  if(!weather?.layers)return;
  for(const [k,l] of Object.entries(weather.layers)){const u=l.uniforms;if(k!=='drift')u.uDensity.value*=now.snow;else u.uAlpha.value=Math.min(.9,u.uAlpha.value*(.4+.6*now.wind)+(now.wind>1.5?.25:0));u.uWind.value.multiplyScalar(now.wind);}
 }
 return {update,applyWeather,
  setArc(i){arc=ARCS[((i%ARCS.length)+ARCS.length)%ARCS.length];return arc.name;},
  fix(value){fixed=value&&MOODS[value]?value:null;},
  patch(values){for(const k of Object.keys(patch))delete patch[k];Object.assign(patch,values??{});},
  get haze(){return now.haze??1;},get name(){return name;},get arc(){return arc.name;},get values(){return now;},
  inspection(){return {arc:arc.name,mood:name,fixed,sun:SUN_DIRECTION.toArray().map(v=>+v.toFixed(3)),exposure:now.exposure,haze:now.haze,snow:now.snow};},
  dispose(){env?.dispose();pmrem.dispose();envMat.dispose();sky.children[0].geometry.dispose();}};
}
