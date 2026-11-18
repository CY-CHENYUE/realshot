import * as T from 'three';
import {loadWeaponModels} from './level-arms.mjs';

async function unpack(url,type){
 const response=await fetch(url);if(!response.ok)throw new Error(`装备文件未能读取：${url}`);
 const stream=response.body.pipeThrough(new DecompressionStream('gzip'));
 const unpacked=new Response(stream);
 return type==='json'?unpacked.json():unpacked.arrayBuffer();
}
// Glove and sleeve cloth. The supplied export broke this material twice: its
// colour map keeps the weave only in alpha (every RGB texel is 0, so base x map
// rendered the arms pure black under any light), and the arm meshes carry no
// UVs (every uv is 0,0), so the weave, normal and AO maps each sampled a single
// texel and the cloth read as smooth black plastic. The authored look survives
// in the vertex colours: HDR zone tints (slate-blue sleeve, coyote glove, darker
// pads and seams, an orange cuff tab) multiplying the dark base colour. Here the
// maps are re-projected triplanar in object space (the CPU clips deform position
// and normal, so the weave rides the cloth), the weave is read from alpha, the
// weave normals are blended in (whiteout), the sleeve gets soft creases across
// the arm, and a grazing fuzz term stands in for cloth sheen.
function fabric(m){
 const weave=m.map,weaveN=m.normalMap,weaveO=m.aoMap;
 for(const t of [weave,weaveN,weaveO])if(t){t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;t.needsUpdate=true;}
 m.map=null;m.normalMap=null;m.aoMap=null;m.roughnessMap=null;m.metalnessMap=null;
 m.color.set('#23262a');m.metalness=0;m.roughness=.84;m.envMapIntensity=.8;
 const u=m.userData.fabric={uWeave:{value:weave},uWeaveN:{value:weaveN},uWeaveO:{value:weaveO},uWeaveScale:{value:60},uWeaveNormal:{value:.85},uGain:{value:1.0},uCrease:{value:.002},uSheen:{value:new T.Color(.045,.055,.07)},uZoneDebug:{value:0},uRipstop:{value:3.3},uRipH:{value:.00026},
  // linear albedo per authored zone (median zone brightness in .w): slate softshell sleeve, coyote glove, darker palm, near-black pads, the orange tab as authored
  uPalSleeve:{value:new T.Vector4(.028,.034,.046,6.8)},uPalGlove:{value:new T.Vector4(.13,.088,.048,13.4)},uPalPalm:{value:new T.Vector4(.10,.072,.045,9.0)},uPalPad:{value:new T.Vector4(.022,.024,.027,4.2)},uPalTab:{value:new T.Vector4(.216,.081,.021,11.9)}};
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,u);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vFabP;varying vec3 vFabN;varying vec3 vFabX;varying vec3 vFabY;varying vec3 vFabZ;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvFabP=position;vFabN=normal;vFabX=normalMatrix[0];vFabY=normalMatrix[1];vFabZ=normalMatrix[2];');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
uniform sampler2D uWeave,uWeaveN,uWeaveO;uniform float uWeaveScale,uWeaveNormal,uGain,uCrease,uZoneDebug,uRipstop,uRipH;uniform vec4 uPalSleeve,uPalGlove,uPalPalm,uPalPad,uPalTab;uniform vec3 uSheen;
varying vec3 vFabP;varying vec3 vFabN;varying vec3 vFabX;varying vec3 vFabY;varying vec3 vFabZ;
float fbH(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
// ripstop: raised reinforcement threads on a ~5 mm grid, faded out before they alias
float fbRip(vec2 t){vec2 f=abs(fract(t)-.5)*2.,aa=fwidth(t)*1.5;vec2 l=smoothstep(vec2(.86)-aa,vec2(.93),f);return max(l.x,l.y)*(1.-smoothstep(.12,.35,max(aa.x,aa.y)));}
float fbN3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(fbH(i),fbH(i+vec3(1,0,0)),f.x),mix(fbH(i+vec3(0,1,0)),fbH(i+vec3(1,1,0)),f.x),f.y),mix(mix(fbH(i+vec3(0,0,1)),fbH(i+vec3(1,0,1)),f.x),mix(fbH(i+vec3(0,1,1)),fbH(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
  .replace('#include <map_fragment>',`vec3 fbOn=normalize(vFabN),fbW=pow(abs(fbOn),vec3(4.));fbW/=dot(fbW,vec3(1.));
vec3 fbP=vFabP*uWeaveScale;vec2 fbUx=fbP.zy,fbUy=fbP.xz+.37,fbUz=fbP.xy+.71;
float fbA=texture2D(uWeave,fbUx).a*fbW.x+texture2D(uWeave,fbUy).a*fbW.y+texture2D(uWeave,fbUz).a*fbW.z;
float fbAO=texture2D(uWeaveO,fbUx).r*fbW.x+texture2D(uWeaveO,fbUy).r*fbW.y+texture2D(uWeaveO,fbUz).r*fbW.z;
// zones by vertex-colour hue (the authored tints); hard thresholds give crisp seams
float fbL=dot(vColor.rgb,vec3(1./3.));vec3 fbHz=vColor.rgb/max(fbL,1e-3);
float fbZone=fbHz.b>1.15?0.:fbHz.r>1.8?4.:fbHz.r>1.35?1.:fbHz.r>1.18?2.:3.;
vec4 fbPal=fbZone<.5?uPalSleeve:fbZone<1.5?uPalGlove:fbZone<2.5?uPalPalm:fbZone<3.5?uPalPad:uPalTab;
float fbSleeve=step(fbZone,.5);
float fbRs=(fbRip(fbUx*uRipstop)*fbW.x+fbRip(fbUy*uRipstop)*fbW.y+fbRip(fbUz*uRipstop)*fbW.z)*fbSleeve;
diffuseColor.rgb=fbPal.rgb*clamp(fbL/fbPal.w,.6,1.35)*clamp(fbA/.59,.6,1.4)*uGain*(1.+.12*fbRs);`).replace('#include <color_fragment>','')
  .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
roughnessFactor=clamp((fbZone>1.5&&fbZone<2.5?.66:fbZone<.5?.8:.86)+(.5-fbA)*.18,.5,1.);`)
  .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
{vec3 tx=texture2D(uWeaveN,fbUx).xyz*2.-1.,ty=texture2D(uWeaveN,fbUy).xyz*2.-1.,tz=texture2D(uWeaveN,fbUz).xyz*2.-1.;
 tx=vec3(tx.xy*uWeaveNormal+fbOn.zy,abs(tx.z)*fbOn.x);ty=vec3(ty.xy*uWeaveNormal+fbOn.xz,abs(ty.z)*fbOn.y);tz=vec3(tz.xy*uWeaveNormal+fbOn.xy,abs(tz.z)*fbOn.z);
 vec3 on=normalize(tx.zyx*fbW.x+ty.xzy*fbW.y+tz.xyz*fbW.z);
 normal=normalize(vFabX*on.x+vFabY*on.y+vFabZ*on.z);
 #ifdef DOUBLE_SIDED
 normal*=faceDirection;
 #endif
 // creases: folds run around the arm, so the noise changes fast along it (object z)
 float h=(fbN3(vFabP*vec3(38.,38.,105.))*.7+fbN3(vFabP*vec3(80.,80.,230.)+9.)*.3)*uCrease*(.35+.65*fbSleeve)+fbRs*uRipH;
 vec3 dpdx=dFdx(-vViewPosition),dpdy=dFdy(-vViewPosition);float dhx=dFdx(h),dhy=dFdy(h);
 vec3 r1=cross(dpdy,normal),r2=cross(normal,dpdx);float det=dot(dpdx,r1);
 normal=normalize(abs(det)*normal-sign(det)*(dhx*r1+dhy*r2));}`)
  .replace('#include <aomap_fragment>',`#include <aomap_fragment>
reflectedLight.indirectDiffuse*=mix(1.,fbAO,.7);reflectedLight.indirectSpecular*=mix(1.,fbAO,.7);
totalEmissiveRadiance+=uSheen*pow(1.-saturate(dot(normal,normalize(vViewPosition))),3.)*(.5+.5*fbA)*fbAO;
if(uZoneDebug>.5){vec3 hz=fbHz;reflectedLight.directDiffuse=reflectedLight.indirectDiffuse=reflectedLight.directSpecular=reflectedLight.indirectSpecular=vec3(0.);
 totalEmissiveRadiance=hz.b>1.15?vec3(0.,0.,.6):hz.r>1.8?vec3(.6,0.,.6):hz.r>1.35?vec3(.6,0.,0.):hz.r>1.18?vec3(.6,.6,0.):vec3(0.,.6,0.);}`);
 };
 m.customProgramCacheKey=()=>'viewmodel-fabric-r25';
 m.needsUpdate=true;
}

// The muzzle, its flash and its light: the same for every carbine this module can return.
function muzzleRig(root){
 const muzzle=new T.Object3D();muzzle.position.set(0,0,-.531);root.add(muzzle);
 const flash=new T.Group();muzzle.add(flash);flash.visible=false;
 for(let i=0;i<2;i++){
  const length=i?.060:.038,geometry=new T.ConeGeometry(i?.017:.010,length,5);geometry.rotateX(-Math.PI/2);geometry.translate(0,0,-length*.5);
  const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({color:i?'#ffad55':'#fff0c4',transparent:true,opacity:i?.55:.86,depthWrite:false}));mesh.rotation.z=i*.8;flash.add(mesh);
 }
 const light=new T.PointLight('#ffa657',0,.9,2);muzzle.add(light);
 return {muzzle,flash,light};
}
// The second PAC-9: our own model (assets/weapons/vm-carbine.* and vm-arm.*, built part by part and baked into one set
// of maps each). The carbine, gloves, sleeves and motions the game was first built round are an external asset
// (THIRD_PARTY_NOTICES.md); when their files are absent this one takes their place. It has the same frame (bore along -z through the origin, pistol grip near z = +.05, muzzle
// at z = -.531, the sight's axis .069 above the bore) and the same interface. Its motions are made here: recoil is a
// kick of the whole weapon; on reload the carbine cants so its well shows, the magazine (its own piece) drops out, a
// fresh one comes up and seats, and the carbine comes back. After an empty magazine it ends with the bolt going home.
// The left arm that holds the handguard (vm-arm.*: glove, cuff and sleeve) is our own model as well; it lets go for the
// magazine and comes back. The right hand is never in the frame.
const CARBINE='vm-carbine',ARM='vm-arm';
async function carbine(onProgress){
 const {[CARBINE]:M}=await loadWeaponModels('assets/weapons/',[CARBINE]);onProgress(1,3);
 const relief=await new T.TextureLoader().loadAsync(`assets/weapons/${CARBINE}-relief.jpg`).catch(()=>null);
 if(relief){relief.flipY=false;relief.colorSpace=T.NoColorSpace;relief.anisotropy=8;M.material.normalMap=relief;M.material.normalScale.set(1,1);}
 M.material.name='carbine / baked';onProgress(2,3);
 const host=new T.Group(),root=new T.Group();host.add(root);
 const piece=(geometry,material=M.material)=>{const o=new T.Mesh(geometry,material);o.frustumCulled=false;return o;};
 root.add(piece(M.parts.body));const mag=new T.Group();if(M.parts.mag)mag.add(piece(M.parts.mag));root.add(mag);
 // the sight's glass (leaning a little, so it catches the sky) and the dot on its axis: the aiming eye sits on that axis
 const glass=new T.Mesh(new T.PlaneGeometry(.0326,.0274),new T.MeshPhysicalMaterial({name:'carbine / sight glass',color:'#bfe6dc',roughness:.04,metalness:0,transparent:true,opacity:.14,depthWrite:false,envMapIntensity:1.6}));
 glass.position.set(0,.0699,-.067);glass.rotation.x=-.09;glass.frustumCulled=false;root.add(glass);
 const dot=new T.Mesh(new T.CircleGeometry(.00042,12),new T.MeshBasicMaterial({name:'carbine / sight dot',color:'#ff2a1a',toneMapped:false,depthWrite:false}));dot.position.set(0,.069,-.0668);dot.renderOrder=1;dot.frustumCulled=false;root.add(dot);
 // the arm: the game finds arms by this material name (they stay when another weapon takes the carbine's place)
 const A=await loadWeaponModels('assets/weapons/',[ARM]).then(m=>m[ARM]).catch(()=>null),arm=new T.Group();arm.name='left arm';
 if(A){const n=await new T.TextureLoader().loadAsync(`assets/weapons/${ARM}-relief.jpg`).catch(()=>null);
  if(n){n.flipY=false;n.colorSpace=T.NoColorSpace;n.anisotropy=8;A.material.normalMap=n;}
  A.material.name='glove_fabric';A.material.envMapIntensity=.8;arm.add(piece(A.parts.arm,A.material));root.add(arm);}
 const {muzzle,flash,light}=muzzleRig(root);
 const DURATION={recoil:.11,reload:1.9,'reload-empty':2.5};let action=null,actionTime=0;
 const ss=(a,b,x)=>T.MathUtils.smoothstep(x,a,b);
 const rest=()=>{root.position.set(0,0,0);root.rotation.set(0,0,0);mag.position.set(0,0,0);mag.visible=true;arm.position.set(0,0,0);};
 const pose=(name,time)=>{const t=Math.min(DURATION[name],Math.max(0,time));rest();
  if(name==='recoil'){const r=(1-t/DURATION.recoil)**2;root.position.z=.014*r;root.rotation.x=.02*r;return;}
  // cant: muzzle up, the left side turned to the eye, the whole carbine a little lower and nearer the middle
  const cant=ss(0,.30,t)*(1-ss(1.40,1.82,t));
  root.rotation.set(.26*cant,.12*cant,-.58*cant);root.position.set(-.03*cant,-.02*cant,.015*cant);
  // the magazine: out and down (it falls faster as it goes), gone, a fresh one up, the last centimetre pushed home
  const out=ss(.28,.58,t),up=ss(.86,1.20,t),home=ss(1.20,1.27,t),drop=t<.72?.30*out*out:up<1?.012+.288*(1-up)*(1-up):.012*(1-home);
  mag.position.set(0,-drop,-drop*.06);mag.visible=!(t>.58&&t<.86);
  // the left hand lets go, takes the old magazine away below the frame, and is back on the handguard as the carbine levels
  const away=ss(.08,.34,t)*(1-ss(1.30,1.72,t));arm.position.set(-.02*away,-.30*away,.15*away);
  // seating the magazine jolts the carbine up; after an empty magazine the bolt goes home with a short tug forward
  const seat=Math.sin(Math.PI*ss(1.20,1.36,t));root.position.y+=.006*seat;root.rotation.x+=.02*seat;
  if(name==='reload-empty'){const tug=Math.sin(Math.PI*ss(1.92,2.24,t));root.position.z-=.012*tug;root.rotation.z+=.07*tug;root.rotation.x+=.025*tug;}
 };
 onProgress(3,3);
 return {host,root,muzzle,flash,light,basePose:{p:new T.Vector3(),q:new T.Quaternion()},
  play(name){if(!DURATION[name])return;action=name;actionTime=0;pose(name,0);},
  update(dt){if(!action)return;actionTime+=dt;pose(action,actionTime);if(actionTime>=DURATION[action]){action=null;rest();}},
  showHands(value){arm.visible=value;},reset(){action=null;rest();},get action(){return action;},get actionTime(){return actionTime;},handCount:A?1:0,source:'PAC-9 carbine and left arm, own models (used when the main viewmodel files are absent)',standIn:true,
  // for the armory: the model's kind and material (it gives generated weapons a finer colour map and a grain), and where its callouts point
  model:{kind:CARBINE,material:M.material},
  sample(name,time){if(DURATION[name])pose(name,time);}};
}

// The last resort, if the carbine's own files cannot be read either: a carbine put together from boxes and tubes, in the
// same frame and with the same interface; reload and recoil are a simple dip and kick of the whole weapon.
function standIn(onProgress){
 const host=new T.Group(),root=new T.Group();host.add(root);
 const mat=(name,color,roughness,metalness,extra={})=>new T.MeshStandardMaterial({name,color,roughness,metalness,...extra});
 const polymer=mat('stand-in / polymer','#0e0f11',.92,0),steel=mat('stand-in / steel','#131518',.62,.55),tan=mat('stand-in / tan polymer','#3a342b',.9,0);
 const add=(geometry,material,at,tilt=0)=>{const o=new T.Mesh(geometry,material);o.position.set(...at);o.rotation.x=tilt;o.frustumCulled=false;root.add(o);return o;};
 const box=(size,material,at,tilt)=>add(new T.BoxGeometry(...size),material,at,tilt);
 const tube=(radius,length,material,at,sides=20,open=false)=>{const g=new T.CylinderGeometry(radius,radius,length,sides,1,open);g.rotateX(Math.PI/2);if(sides<12)g.rotateZ(Math.PI/sides);return add(g,material,at);};
 // the bore is the origin and the muzzle points to -z, as in the carbine this stands in for; nothing reaches behind
 // z = +.13, because the camera sits about .3 behind the origin
 box([.040,.050,.26],polymer,[0,-.004,-.09]);             // upper receiver
 box([.036,.036,.11],polymer,[0,-.044,-.055]);            // lower receiver and magazine well
 tube(.027,.24,polymer,[0,-.002,-.34],8);                 // handguard
 tube(.0095,.06,steel,[0,0,-.47]);                        // barrel
 tube(.014,.045,steel,[0,0,-.508]);                       // muzzle device
 box([.022,.008,.44],steel,[0,.026,-.2]);                 // top rail
 box([.026,.022,.04],steel,[0,.041,-.05]);                // sight mount
 tube(.019,.055,mat('stand-in / sight tube','#1d2023',.7,.4,{side:T.DoubleSide}),[0,.069,-.05],24,true); // sight: open, so aiming looks through it
 box([.028,.115,.046],tan,[0,-.112,-.07],.18);            // magazine
 box([.030,.085,.038],polymer,[0,-.092,.03],-.32);        // pistol grip
 tube(.015,.09,steel,[0,-.002,.085]);                     // buffer tube
 const {muzzle,flash,light}=muzzleRig(root);
 const DURATION={recoil:.11,reload:1.9,'reload-empty':2.5};let action=null,actionTime=0;
 const rest=()=>{root.position.set(0,0,0);root.rotation.set(0,0,0);};
 const pose=(name,time)=>{const k=Math.min(1,Math.max(0,time/DURATION[name]));rest();
  if(name==='recoil'){root.position.z=.014*(1-k)*(1-k);root.rotation.x=.02*(1-k)*(1-k);}
  else{const dip=Math.sin(Math.PI*k);root.position.y=-.11*dip;root.rotation.x=-.5*dip;root.rotation.z=.35*dip;}};
 onProgress(3,3);
 return {host,root,muzzle,flash,light,basePose:{p:new T.Vector3(),q:new T.Quaternion()},
  play(name){if(!DURATION[name])return;action=name;actionTime=0;pose(name,0);},
  update(dt){if(!action)return;actionTime+=dt;pose(action,actionTime);if(actionTime>=DURATION[action]){action=null;rest();}},
  showHands(){},reset(){action=null;rest();},get action(){return action;},get actionTime(){return actionTime;},handCount:0,source:'box carbine (last resort)',standIn:true,
  sample(name,time){if(DURATION[name])pose(name,time);}};
}

// The carbine, gloves and sleeves the game was first built round are an external asset (THIRD_PARTY_NOTICES.md);
// without its files the repository's own carbine is used. Their animations include
// vertex deformation for fingers and sleeves; transform-only export loses those poses.
export async function loadViewmodel(onProgress=()=>{}){
 if((await fetch('assets/reference-viewmodel.json.gz',{method:'HEAD'})).status===404){
  try{return await carbine(onProgress);}catch(error){console.warn('RealShot: the carbine model could not be read; using the box carbine.',error);return standIn(onProgress);}
 }
 const data=await unpack('assets/reference-viewmodel.json.gz','json');
 const root=await new T.ObjectLoader().parseAsync(data);const nodes=[];root.traverse(o=>nodes.push(o));
 const detail=await fetch('assets/pac9-detail.json').then(r=>r.json());
 const basePose={p:new T.Vector3().fromArray(root.position.toArray()),q:root.quaternion.clone()};
 const inverseBase=basePose.q.clone().invert();const rests=nodes.map(o=>({p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone(),visible:o.visible}));
 root.position.set(0,0,0);root.quaternion.identity();
 const host=new T.Group();host.add(root);
 let handCount=0;
 root.traverse(o=>{
  o.layers.set(0);
  if(!o.isMesh)return;o.frustumCulled=false;o.castShadow=false;o.receiveShadow=false;
  for(const m of Array.isArray(o.material)?o.material:[o.material]){
   if(!m.isMeshStandardMaterial)continue;
   // Baked fabric maps use their existing UVs. Cloth is dielectric, not metal.
   if(m.name==='glove_fabric'){fabric(m);handCount++;}
   if(m.name==='pac9_anodised')m.color.setRGB(.018,.022,.026);
   if(m.name==='pac9_phosphate')m.color.setRGB(.025,.030,.034);
   const kind={pac9_anodised:0,pac9_phosphate:1,pac9_polymer:2,pac9_polymer_tan:2}[m.name];
   if(kind!==undefined){
    m.onBeforeCompile=shader=>{
     shader.uniforms.uKind={value:kind};shader.uniforms.uRain={value:.12};
     shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vObjP; varying vec3 vWNrm; varying vec3 vONrm;').replace('#include <begin_vertex>','#include <begin_vertex>\nvObjP=position;vONrm=normal;vWNrm=normalize(mat3(modelMatrix)*normal);');
     shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+detail.AC).replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n'+detail.RC).replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+detail.CC);
    };m.customProgramCacheKey=()=>`private-pac9-detail-${kind}`;
   }
  }
 });
 // The old source's flash shader uses uniforms owned by its original renderer.
 // Replace only that effect; keep the actual weapon and hand geometry.
 const oldFlash=root.children[8];if(oldFlash)oldFlash.visible=false;
 const muzzle=new T.Object3D();muzzle.position.set(0,0,-.531);root.add(muzzle);
 const flash=new T.Group();muzzle.add(flash);flash.visible=false;
 for(let i=0;i<2;i++){
  const length=i?.060:.038,geometry=new T.ConeGeometry(i?.017:.010,length,5);geometry.rotateX(-Math.PI/2);geometry.translate(0,0,-length*.5);
  const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({color:i?'#ffad55':'#fff0c4',transparent:true,opacity:i?.55:.86,depthWrite:false}));mesh.rotation.z=i*.8;flash.add(mesh);
 }
 const light=new T.PointLight('#ffa657',0,.9,2);muzzle.add(light);
 const clips={};let loaded=0;
 await Promise.all(['recoil','reload','reload-empty'].map(async name=>{
  const [meta,bytes]=await Promise.all([fetch(`assets/${name}.json`).then(r=>{if(!r.ok)throw new Error('动作元数据读取失败');return r.json();}),unpack(`assets/${name}.bin.gz`)]);
  const buffer=new Float32Array(bytes);if(buffer.length!==meta.frames*meta.stride||meta.nodeCount!==nodes.length)throw new Error('动作文件与模型结构不匹配');
  clips[name]={...meta,buffer};onProgress(++loaded,3);
 }));
 let action=null,actionTime=0;const q0=new T.Quaternion(),q1=new T.Quaternion();
 function restore(){
  for(let i=0;i<nodes.length;i++){const o=nodes[i],s=rests[i];o.position.copy(s.p);o.quaternion.copy(s.q);o.scale.copy(s.s);o.visible=s.visible;}
  root.position.set(0,0,0);root.quaternion.identity();if(oldFlash)oldFlash.visible=false;
 }
 function pose(clip,time){
  const f=Math.min(clip.frames-1,Math.max(0,time*clip.fps)),a=Math.floor(f),b=Math.min(a+1,clip.frames-1),mix=f-a,buf=clip.buffer;
  for(let i=0;i<nodes.length;i++){
   const o=nodes[i],ia=a*clip.stride+i*11,ib=b*clip.stride+i*11;
   o.position.set(T.MathUtils.lerp(buf[ia],buf[ib],mix),T.MathUtils.lerp(buf[ia+1],buf[ib+1],mix),T.MathUtils.lerp(buf[ia+2],buf[ib+2],mix));
   q0.fromArray(buf,ia+3);q1.fromArray(buf,ib+3);o.quaternion.copy(q0).slerp(q1,mix);
   o.scale.set(T.MathUtils.lerp(buf[ia+7],buf[ib+7],mix),T.MathUtils.lerp(buf[ia+8],buf[ib+8],mix),T.MathUtils.lerp(buf[ia+9],buf[ib+9],mix));o.visible=buf[ia+10]>.5;
  }
  root.position.sub(basePose.p);root.quaternion.premultiply(inverseBase);
  for(const d of clip.dynamic){
   const attributes=nodes[d.node].geometry.attributes;
   for(const [name,offset] of [['position',d.positionOffset],['normal',d.normalOffset]]){
    const array=attributes[name].array,oa=a*clip.stride+offset,ob=b*clip.stride+offset;
    for(let i=0;i<d.length;i++)array[i]=buf[oa+i]*(1-mix)+buf[ob+i]*mix;
    attributes[name].needsUpdate=true;
   }
  }
  if(oldFlash)oldFlash.visible=false;
 }
 function play(name){action=name;actionTime=0;pose(clips[name],0);}
 function update(dt){if(!action)return;actionTime+=dt;const c=clips[action];pose(c,actionTime);if(actionTime>=c.duration){action=null;restore();pose(clips.recoil,0);}}
 restore();pose(clips.recoil,0);
 return {host,root,muzzle,flash,light,basePose,play,update,showHands(value){root.traverse(o=>{if(o.isMesh&&o.material?.name==='glove_fabric')o.visible=value;});},reset(){action=null;restore();pose(clips.recoil,0);},get action(){return action;},get actionTime(){return actionTime;},handCount,source:'PAC-9 carbine and hands (external asset, see THIRD_PARTY_NOTICES.md)',sample(name,time){pose(clips[name],time);}};
}
