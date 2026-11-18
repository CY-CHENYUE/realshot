import * as T from 'three';
import {WEAPONS} from './level-core.mjs';
import {loadViewmodel} from './viewmodel.mjs';
import {loadWeaponModels,ARMS,barrelCollar,COLLAR_STEEL} from './level-arms.mjs';
import {defenseOutput} from './defense-output.mjs';

// RealShot r28 · the armory. The three weapons of 雪线行动 — the same models, materials, names and numbers the level
// uses — in a white studio at three depths: the chosen one close to the lens, large and sharp; the other two further
// back, smaller, out of focus and paler. White is the point: on the transparent box screen white is the see-through
// part, so only the weapons show.
// The picture follows what armory and loadout screens of shipped shooters do: three-quarter side view from slightly
// above, strip lights that draw long highlights along the barrels, a soft shadow on the floor, a slow turn that shows
// the weapon, callouts on its parts, and a short track along the row when the selection changes.
// What makes the depth: a close lens (near things large, far things small), a floor of measuring marks that runs to
// the back, haze, focus, snow drifting in front of and behind the weapons, and the weapon in front covering the big
// name printed behind it.
//  ?w=rifle|minigun|rpg  weapon in front at the start        ?loop=5  seconds per weapon (0 = stay)
//  ?text=0  weapons only (box screen, video)                 ?capture=1  no clock: armoryDebug.step(dt) draws a frame
//  ?surface=box|box-preview  the transparent box: the same output mapping as level-glass.html, weapons only, row centred
//  ?fine=0  without the finer colour maps and the paint grain (to compare)
//  ?finest=1|0  the blur a recording gets (twice the neighbours); on with ?capture=1, off otherwise.  ?taps= ?reach= set it by hand
const BUILD='armory-20261117-r30';
const params=new URLSearchParams(location.search),$=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),lerp=(a,b,t)=>a+(b-a)*t,ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,mod=(a,n)=>((a%n)+n)%n;
const ORDER=['rifle','minigun','rpg'];
const SURFACE=['box','box-preview'].includes(params.get('surface'))?params.get('surface'):null,TEXT=!SURFACE&&params.get('text')!=='0';
// what the card says. Every number is read from WEAPONS, the table the level plays by.
const rpm=w=>Math.round(60/w.interval);
const COPY={
 rifle:{line:'标准配发 · 全自动 · 备弹不限',specs:w=>[['射速',rpm(w),'RPM'],['弹匣',w.mag,'发'],['有效射程',w.range,'M'],['爆头倍率',w.headMul,'×']],
  // callouts: a point on the weapon (fractions of its box: across, bottom to top, muzzle to rear), where the label goes from there (in 1/100 of the picture height), and the words
  notes:w=>[{at:[.2,.98,.6],to:[13,-12],title:'光学瞄具',sub:`开镜 ${w.zoom}×`},{at:[.2,.1,.46],to:[-13,12],left:true,title:'弹匣',sub:`${w.mag} 发`},{at:[.3,.8,.03],to:[-6,-11],left:true,title:'枪口制退器',sub:`初速 ${w.speed} M/S`}]},
 minigun:{line:'六管转膛 · 预热后火力全开 · 一发穿两人',specs:w=>[['射速',rpm(w),'RPM'],['弹链',w.mag,'发'],['预热',w.spinUp,'S'],['穿透',w.pierce,'人']],
  notes:w=>[{at:[.25,.6,.14],to:[-8,14],left:true,title:'六管枪管组',sub:`${rpm(w)} RPM`},{at:[.05,.2,.84],to:[10,12],title:'弹箱',sub:`${w.mag} 发弹链`},{at:[.3,.99,.66],to:[13,-9],title:'提把导轨',sub:`预热 ${w.spinUp} S`}]},
 rpg:{line:'高爆战斗部 · 一发清空一片雪地',specs:w=>[['杀伤半径',w.splash,'M'],['单发伤害',w.damage,''],['备弹',w.reserve,'发'],['装填',w.reload,'S']],
  notes:w=>[{at:[.3,.66,.04],to:[-6,-12],left:true,title:'高爆战斗部',sub:`杀伤半径 ${w.splash} M`},{at:[.3,.97,.5],to:[5,-9],title:'光学瞄具',sub:`开镜 ${w.zoom}×`},{at:[.3,.9,.97],to:[-5,-14],left:true,title:'尾喷口',sub:`装填 ${w.reload} S`}]},
};
// the row: where a weapon hangs (metres, the lens looks down -z) and how it is turned, front to back. yaw 90° = side
// on, muzzle to the left; the one in front is turned a little towards the lens.
const SLOTS=[{at:[.17,0,0],yaw:Math.PI/2-.4,pitch:.03,roll:-.07},{at:[.02,.05,-2.2],yaw:Math.PI/2+.24,pitch:0,roll:-.04},{at:[1.62,.16,-4.9],yaw:Math.PI/2-.14,pitch:0,roll:-.03}];
const LOOP=Math.max(0,Number(params.get('loop')??5)),TRANS=.95,FLOOR=-.3;
// every idle motion is a whole number of turns per round of the three weapons, so a recording of one round loops without a seam
const CYCLE=3*(LOOP||5),W=2*Math.PI/CYCLE;
// the lens: close and a little wide, so size falls off quickly with distance. With the card on the left the weapon in
// front sits right of centre; alone it is centred.
// ?ss=1|1.5|2  how much finer than the screen the scene is drawn. Left out, the page picks: 1.5 on an ordinary display,
// 1 on a dense one, and it steps down to 1 by itself when the machine does not keep up.
const SS=Number(params.get('ss'))||0,CAPTURE=params.get('capture')==='1',FINEST=params.has('finest')?params.get('finest')!=='0':CAPTURE;
const EYE=[0,.47,1.44],AIM=[TEXT?-.02:.3,-.37,-1.56],FOV=34,WIDE=16/9;
// the weapon in front fills this part of the picture whatever its length (centre and half size, in half pictures: x right, y up)
const FRAME=TEXT?{x:.3,y:-.12,w:.56,h:.52}:{x:0,y:-.06,w:.66,h:.6};

let renderer,scene,camera,target,half,half2,blur,soft,post,quad,postScene,postCamera,marks;
// the teardown film of a weapon: the model the game uses, taken apart in the studio it was built in (rendered ahead; see
// assets/cine/NOTICE.md). T or the button under the figures plays it; while the row turns by itself it plays once in each
// stay of that weapon.  ?film=0 leaves it out; a recording (?capture=1) never plays it.
const FILM={minigun:'assets/cine/vx6-teardown.mp4'},film={on:false,ready:false,video:null,stay:-1};
const items=[],state={t:0,c:0,tween:null,auto:LOOP>0,period:0,shown:-1,settled:0,drag:0,dragging:false,ready:false,notes:null,lean:false,ss:0};
const view={w:1,h:1};

function size(){
 let w=innerWidth,h=innerHeight;const pr=Math.min(devicePixelRatio||1,2),st=$('stage').style;
 if(SURFACE){const out=defenseOutput(w,h,SURFACE);w=out.logicalWidth;h=out.logicalHeight;Object.assign(st,{inset:'auto',left:out.left+'px',top:out.top+'px',width:w+'px',height:h+'px',transform:`scaleX(${out.scaleX})`});}
 view.w=w;view.h=h;renderer.setPixelRatio(pr);renderer.setSize(w,h,false);
 // the scene is drawn finer than the screen on ordinary displays (1.5 samples a side per pixel) and read back smaller,
 // within a budget of pixels so a very large or very dense window does not cost more than the machine has; a recording
 // (?capture=1) is not held to the budget
 const ss=state.ss||SS||Math.min(pr>=1.5||state.lean?1:1.5,CAPTURE?9:Math.sqrt((state.lean?2.5e6:5.4e6)/(w*h*pr*pr))),Wp=Math.round(w*pr*ss),Hp=Math.round(h*pr*ss);target.setSize(Wp,Hp);half.setSize(Math.ceil(Wp/2),Math.ceil(Hp/2));half2.setSize(half.width,half.height);
 // the lens keeps the width of the row: a narrower picture gets a taller view, never a cropped row
 camera.aspect=w/h;camera.fov=2*Math.atan(Math.tan(FOV*Math.PI/360)*Math.max(1,WIDE/camera.aspect))*180/Math.PI;camera.updateProjectionMatrix();
 const u=post.uniforms;u.uPx.value.set(1/Wp,1/Hp);u.uMaxR.value=Hp*.0105;u.uAperture.value=Hp*.013;
 items.forEach(home);
}
// where a weapon hangs when it is in front: on the line of sight through a fixed point of the picture, at the distance
// where its outline fills the frame above — a long weapon hangs further back, a short one closer, all of them whole
const HV=new T.Vector3(),HQ=new T.Quaternion(),HE=new T.Euler();
function home(it){
 const S=SLOTS[0],eye=HV.clone().set(...EYE);camera.position.copy(eye);camera.lookAt(...AIM);camera.updateMatrixWorld(true);
 it.object.updateMatrix();HQ.setFromEuler(HE.set(S.pitch,S.yaw,S.roll,'YXZ'));
 const corners=[];for(let i=0;i<8;i++)corners.push(new T.Vector3(i&1?it.box.max.x:it.box.min.x,i&2?it.box.max.y:it.box.min.y,i&4?it.box.max.z:it.box.min.z).applyMatrix4(it.object.matrix).applyQuaternion(HQ));
 const at=new T.Vector3(),dir=new T.Vector3(),b={};let ax=FRAME.x,ay=FRAME.y,low=0;
 const shot=d=>{at.copy(eye).addScaledVector(dir,d);b.x0=b.y0=1e9;b.x1=b.y1=-1e9;low=1e9;
  for(const c of corners){HV.copy(c).add(at);low=Math.min(low,HV.y);HV.project(camera);b.x0=Math.min(b.x0,HV.x);b.x1=Math.max(b.x1,HV.x);b.y0=Math.min(b.y0,HV.y);b.y1=Math.max(b.y1,HV.y);}
  return Math.max((b.x1-b.x0)/2/FRAME.w,(b.y1-b.y0)/2/FRAME.h);};
 for(let pass=0;pass<4;pass++){dir.set(ax,ay,.5).unproject(camera).sub(eye).normalize();let near=.7,far=6;
  for(let i=0;i<24;i++){const mid=(near+far)/2;if(shot(mid)>1)near=mid;else far=mid;}
  shot(far);ax-=(b.x0+b.x1)/2-FRAME.x;ay-=(b.y0+b.y1)/2-FRAME.y;}
 // never into the floor
 at.y+=Math.max(0,FLOOR+.05-low);it.home=at.toArray();
}
// the box of what is actually drawn of an object (hidden parts and gloves left out), in the object's own space
function boxOf(root,skip=()=>false){
 root.updateMatrixWorld(true);const inv=root.matrixWorld.clone().invert(),box=new T.Box3(),m=new T.Matrix4(),v=new T.Vector3();
 root.traverse(o=>{if(!o.isMesh||skip(o))return;for(let q=o;q;q=q.parent){if(!q.visible)return;if(q===root)break;}
  const pos=o.geometry.attributes.position;m.multiplyMatrices(inv,o.matrixWorld);for(let i=0;i<pos.count;i+=3)box.expandByPoint(v.fromBufferAttribute(pos,i).applyMatrix4(m));});
 return box;
}
function hang(id,object,box,extra={}){
 // the box stays in the object's own space, so a callout can name a point on the weapon by fractions of it
 const pivot=new T.Group(),c=box.getCenter(new T.Vector3());object.position.sub(c);pivot.add(object);
 const an=renderer.capabilities.getMaxAnisotropy();
 pivot.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
  for(const m of [].concat(o.material))for(const k of ['map','normalMap','roughnessMap','metalnessMap'])if(m?.[k]&&m[k].anisotropy<an){m[k].anisotropy=an;m[k].needsUpdate=true;}});
 scene.add(pivot);items.push({id,pivot,object,box,home:SLOTS[0].at,length:box.getSize(new T.Vector3()).z,...extra});
}
// the studio the metal mirrors: a pale room with long lamps. The lamps are what put the long bright lines on barrels
// and edges; a plain even room leaves metal looking like grey plastic.
function studio(){
 const room=new T.Scene(),lamp=(w,h,power,at,look=[0,0,0])=>{const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color().setScalar(power),side:T.DoubleSide}));m.position.set(...at);m.lookAt(...look);room.add(m);};
 room.add(new T.Mesh(new T.SphereGeometry(20,32,16),new T.MeshBasicMaterial({color:new T.Color(.62,.65,.69),side:T.BackSide})));
 lamp(9,1.1,9,[0,6,1.5]);lamp(1,7,6,[-7,2.5,2],[0,1,0]);lamp(.8,7,7,[7,3,-3],[0,1,0]);lamp(10,.7,5,[0,3.4,7],[0,1,0]);lamp(14,14,.95,[0,-3,0]);
 const pmrem=new T.PMREMGenerator(renderer),tex=pmrem.fromScene(room,.012).texture;pmrem.dispose();return tex;
}
async function build(){
 renderer=new T.WebGLRenderer({canvas:$('view'),antialias:false,alpha:true,premultipliedAlpha:true,powerPreference:'high-performance'});renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NoToneMapping;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.VSMShadowMap;renderer.setClearColor(0x000000,0);
 scene=new T.Scene();camera=new T.PerspectiveCamera(FOV,1,.12,40);scene.environment=studio();scene.environmentIntensity=.9;
 // one steep key from the upper front left: it shades the weapons, throws their parts' shadows on themselves and lays
 // each weapon's shadow on the floor just behind it; a hard cool rim from behind on the right; a low kick from the left
 const key=new T.DirectionalLight('#fff4e8',2.5);key.position.set(-1.9,6.2,2.6);key.target.position.set(.5,0,-2.1);key.castShadow=true;
 Object.assign(key.shadow.camera,{left:-3.4,right:3.4,top:3.6,bottom:-3.6,near:1,far:14});const SM=Number(params.get('sm'))||2048;key.shadow.mapSize.set(SM,SM);key.shadow.radius=4*SM/4096;key.shadow.blurSamples=Number(params.get('sb'))||8;key.shadow.bias=-.0005;key.shadow.normalBias=.004;
 const rim=new T.DirectionalLight('#d6e6ff',3.4);rim.position.set(2.8,2.1,-4.6);rim.target.position.set(.2,0,-.6);
 const kick=new T.DirectionalLight('#ffffff',.7);kick.position.set(-3,1.2,1.5);kick.target.position.set(.2,0,-.5);
 scene.add(key,key.target,rim,rim.target,kick,kick.target,new T.HemisphereLight('#ffffff','#cfd6dd',.4));
 // the floor: only shadow, and a lattice of small measuring marks, a quarter of a metre apart, that runs to the back of the room
 const floor=new T.Mesh(new T.PlaneGeometry(60,60).rotateX(-Math.PI/2),new T.ShadowMaterial({color:'#16232f',opacity:.46,depthWrite:false}));floor.position.y=FLOOR;floor.receiveShadow=true;scene.add(floor);
 marks=new T.Mesh(new T.PlaneGeometry(26,26).rotateX(-Math.PI/2),new T.ShaderMaterial({name:'armory / floor marks',transparent:true,depthWrite:true,
  uniforms:{uInk:{value:new T.Color('#5b6b7a')}},
  vertexShader:'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader:`uniform vec3 uInk;varying vec3 vW;
// a plus mark at every lattice point. A bar never gets thinner than the picture can draw; it gets paler instead.
float mark(vec2 p,vec2 w,float cell,float arm,float thick){
 vec2 g=abs(fract(p/cell+.5)-.5)*cell,th=max(vec2(thick),w*.5);
 float bx=(1.-smoothstep(th.y,th.y+w.y,g.y))*(1.-smoothstep(arm,arm+w.x,g.x))*min(1.,thick/th.y*1.8);
 float bz=(1.-smoothstep(th.x,th.x+w.x,g.x))*(1.-smoothstep(arm,arm+w.y,g.y))*min(1.,thick/th.x*1.8);
 return max(bx,bz);}
void main(){
 vec2 p=vW.xz,w=fwidth(p);
 float far=1.-smoothstep(5.5,11.,length(p-vec2(0.,1.4)));
 // a small mark every quarter metre and a larger one every metre: the floor reads as a floor all the way back
 float a=max(mark(p,w,.25,.011,.0013)*.4,mark(p,w,1.,.045,.0018)*.58)*far;if(a<.02)discard;
 gl_FragColor=vec4(uInk,a);
}`}));marks.position.y=FLOOR+.002;marks.renderOrder=1;marks.visible=!SURFACE;scene.add(marks);

 const [vm,arms]=await Promise.all([loadViewmodel(),loadWeaponModels()]);
 // PAC-9: the level's own carbine without the hands, with the surface values the level gives it (level.mjs tuneViewmodel)
 vm.showHands(false);vm.flash.visible=false;vm.light.intensity=0;
 vm.root.traverse(o=>{if(!o.isMesh)return;for(const m of [].concat(o.material)){if(!m?.isMeshStandardMaterial)continue;
  if(m.name==='pac9_anodised')m.color.setRGB(.034,.038,.044);if(m.name==='pac9_phosphate')m.color.setRGB(.042,.046,.050);if(m.name!=='glove_fabric')m.envMapIntensity=Math.max(m.envMapIntensity,1.25);}});
 const glove=o=>[].concat(o.material).some(m=>m?.name==='glove_fabric')||o.material?.isMeshBasicMaterial;
 hang('rifle',vm.host,boxOf(vm.host,glove));
 // VX-6 and RK-3: the generated models the level holds (level-arms.mjs), barrel cluster and warhead included. Seen this
 // close they get a relief map made from the fine structure of their own colour map (seams, vents, lettering), so the
 // light picks those out instead of sliding over a flat picture.
 const loader=new T.TextureLoader(),relief=async kind=>{try{const t=await loader.loadAsync(`assets/weapons/${kind}-relief.jpg`);t.flipY=false;t.colorSpace=T.NoColorSpace;return t;}catch{return null;}};
 // ...and a colour map twice as fine (the original enlarged with a sharp filter, edges tightened), and a grain in the
 // paint: small unevenness in how rough and which way the surface is, the size of a few pixels, which is what a flat
 // area of a real painted or cast part shows from this close. The grain fades out where it would be smaller than a pixel.
 const FINE=params.get('fine')!=='0',sharp=async kind=>{if(!FINE)return null;try{const t=await loader.loadAsync(`assets/weapons/${kind}-albedo-fine.jpg`);t.flipY=false;t.colorSpace=T.SRGBColorSpace;return t;}catch{return null;}};
 const [reliefM,reliefR,sharpM,sharpR]=await Promise.all([relief(ARMS.minigun),relief(ARMS.rpg),sharp(ARMS.minigun),sharp(ARMS.rpg)]);
 const grain=m=>{m.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
float gHash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float gNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gHash(i),gHash(i+vec2(1.,0.)),f.x),mix(gHash(i+vec2(0.,1.)),gHash(i+vec2(1.,1.)),f.x),f.y);}
float gGrain(vec2 p){return gNoise(p)*.6+gNoise(p*2.3+7.)*.4;}`).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
vec2 gP=vMapUv*900.;float gK=1.-smoothstep(.3,.9,max(fwidth(gP.x),fwidth(gP.y))),gH=gGrain(gP);
roughnessFactor=clamp(roughnessFactor*(1.+(gH-.5)*.5*gK),.04,1.);`).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
#ifdef USE_NORMALMAP_TANGENTSPACE
{float gE=.35;vec2 gD=vec2(gGrain(gP+vec2(gE,0.))-gH,gGrain(gP+vec2(0.,gE))-gH)/gE;normal=normalize(normal-(tbn[0]*gD.x+tbn[1]*gD.y)*.09*gK);}
#endif`);};m.customProgramCacheKey=()=>'armory / grain';};
 // parts built here (collar, warhead) have no maps of their own: flat ones, so they take the same grain
 const flat=(r,g,b)=>{const t=new T.DataTexture(new Uint8Array([r,g,b,255]),1,1);t.needsUpdate=true;return t;},plain=o=>{const m=new T.MeshStandardMaterial({...o,map:flat(255,255,255),normalMap:flat(128,128,255)});if(FINE)grain(m);return m;};
 const fine=(m,map,colour)=>{if(map){m.normalMap=map;m.normalScale.set(1.1,1.1);}if(colour)m.map=colour;if(FINE)grain(m);m.envMapIntensity=1.3;m.needsUpdate=true;return m;};
 const mini=new T.Group(),M=arms[ARMS.minigun],spin=new T.Group();fine(M.material,reliefM,sharpM);mini.add(new T.Mesh(M.parts.body,M.material));if(M.parts.spin)spin.add(new T.Mesh(M.parts.spin,M.material));mini.add(spin);
 // the steel collar where the barrels enter the housing (level-arms.mjs: the same one the level's minigun wears)
 if(params.get('collar')!=='0'&&M.meta.collar!==false)mini.add(barrelCollar(plain({...COLLAR_STEEL,envMapIntensity:1.3})));
 hang('minigun',mini,boxOf(mini),{spin,angle:0});
 const tube=new T.Group(),R=arms[ARMS.rpg];fine(R.material,reliefR,sharpR);tube.add(new T.Mesh(R.parts.body,R.material));
 const wm=plain({name:'module / warhead',color:'#4e5642',roughness:.5,metalness:.45,envMapIntensity:1.2}),head=new T.Group(),bulb=new T.Mesh(new T.SphereGeometry(.045,48,24),wm),cone=new T.Mesh(new T.ConeGeometry(.045,.12,48),wm);
 bulb.scale.set(1,1,1.5);bulb.position.set(0,0,-.5);cone.rotation.x=-Math.PI/2;cone.position.set(0,0,-.605);head.add(bulb,cone);head.scale.set(1.2,1.2,1);tube.add(head);
 hang('rpg',tube,boxOf(tube));
 // snow in the air, from just in front of the lens to the back of the room: the near flakes are big soft discs, the far
 // ones fine dots. Solid dots that write depth, so the lens blurs each one by its own distance.
 const N=420,pos=new Float32Array(N*3),seed=new Float32Array(N);let s=7;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;
 for(let i=0;i<N;i++){const z=.9-Math.pow(rnd(),.8)*7.5;pos[i*3]=(rnd()*2-1)*(1.1+(.9-z)*.55)+.3;pos[i*3+1]=rnd()*3.4+FLOOR;pos[i*3+2]=z;seed[i]=rnd();}
 const dot=document.createElement('canvas');dot.width=dot.height=64;const g=dot.getContext('2d');g.fillStyle='#fff';g.beginPath();g.arc(32,32,30,0,Math.PI*2);g.fill();
 const flakes=new T.Points(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(pos,3)),new T.PointsMaterial({color:'#aebccb',size:.011,map:new T.CanvasTexture(dot),alphaTest:.5,sizeAttenuation:true}));
 flakes.frustumCulled=false;flakes.userData={seed,base:pos.slice()};scene.add(flakes);items.flakes=flakes;

 // the picture: scene (premultiplied, alpha = how much of the pixel is a thing) -> lens -> sharpen what is in focus ->
 // tone -> haze by distance -> out with its alpha, so the page (white, and the big name) shows behind it.
 // The lens works in three steps. At half size, twice: for every point, what the out-of-focus things around it add up to. At
 // full size: each pixel keeps its own sharp colour and takes as much of that blur as it is out of focus itself, or as
 // something blurred in front of it spills over it. Half size is where the cost goes down: the blur is soft anyway.
 target=new T.WebGLRenderTarget(4,4,{type:T.HalfFloatType,samples:4,depthTexture:new T.DepthTexture(4,4)});
 const halfRT=()=>new T.WebGLRenderTarget(4,4,{type:T.HalfFloatType,count:2,depthBuffer:false,minFilter:T.NearestFilter,magFilter:T.NearestFilter});half=halfRT();half2=halfRT();
 const vs='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',LENS=`uniform sampler2D tColor,tDepth;uniform vec2 uPx;uniform float uNear,uFar,uFocus,uRange,uAperture,uMaxR;varying vec2 vUv;
float zOf(vec2 uv){float d=texture(tDepth,uv).x;return uNear*uFar/(uFar-d*(uFar-uNear));}
// blur radius in pixels: nothing inside the focus range, growing with the distance from it (in front as well as behind)
float cocOf(float z){return min(uMaxR,max(0.,abs(z-uFocus)-uRange)/z*uAperture);}
`,TAPS=Number(params.get('taps'))||(FINEST?64:32),REACH=params.has('reach')?Number(params.get('reach')):2,defines={TAPS,REACH,SIDE:2*REACH+1};
 // how many neighbours the blur looks at and how widely it is smoothed afterwards: the live page looks at half as many as a
 // recording does and smooths as widely (smoothed over 3×3 instead of 5×5, the turned taps show as grain)
 const lens={tColor:{value:target.texture},tDepth:{value:target.depthTexture},uPx:{value:new T.Vector2()},uNear:{value:camera.near},uFar:{value:camera.far},uFocus:{value:1.5},uRange:{value:.42},uAperture:{value:36},uMaxR:{value:20}};
 blur=new T.ShaderMaterial({name:'armory / lens blur',glslVersion:T.GLSL3,defines,depthTest:false,depthWrite:false,uniforms:lens,vertexShader:vs,
  fragmentShader:`layout(location=0) out highp vec4 oBlur;layout(location=1) out highp vec4 oAux;
${LENS}void main(){
 float cz=zOf(vUv),cc=cocOf(cz),ws=0.,zs=0.,front=0.;vec4 acc=vec4(0.);
 // the ring of neighbours is turned by a different amount at every point: a few dozen of them cannot cover a wide blur,
 // and turned alike they would draw as many faint copies of every edge; turned differently they leave a fine grain instead,
 // which the next step smooths away
 float turn=6.2831853*fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
 for(int i=1;i<TAPS;i++){float fi=float(i),r=sqrt(fi/float(TAPS))*uMaxR,a=fi*2.39996323+turn;vec2 uv=vUv+vec2(cos(a),sin(a))*r*uPx;
  float sz=zOf(uv),sc=cocOf(sz),near=sz<cz+.06?1.:0.;
  // a neighbour counts when its own blur reaches this far, and it is in front of this point or this point is as blurred
  float w=smoothstep(r-1.,r+1.,sc)*max(near,smoothstep(r-1.,r+1.,cc));
  vec4 s=texture(tColor,uv);acc+=s*w;ws+=w;zs+=sz*s.a*w;front+=w*near;}
 // the blur times its share of the point (so the full-size step can add shares up and divide), the share, the share
 // that comes from in front, the distance of what was blurred (times its cover), and this point's own distance
 oBlur=acc/(1.+ws);oAux=vec4(ws/(1.+ws),front/(1.+ws),zs/(1.+ws),cz);
}`});
 // ...and smoothed over its neighbours at half size. A point in focus keeps its own values and gives none, so nothing
 // blurred leaks onto the edge of the weapon in front.
 soft=new T.ShaderMaterial({name:'armory / lens smooth',glslVersion:T.GLSL3,defines,depthTest:false,depthWrite:false,uniforms:{...lens,tBlur:{value:half.textures[0]},tAux:{value:half.textures[1]}},vertexShader:vs,
  fragmentShader:`layout(location=0) out highp vec4 oBlur;layout(location=1) out highp vec4 oAux;
${LENS}uniform sampler2D tBlur,tAux;
void main(){
 ivec2 q=ivec2(gl_FragCoord.xy),hs=textureSize(tBlur,0);vec4 A0=texelFetch(tAux,q,0);
 if(cocOf(A0.w)<.5){oBlur=texelFetch(tBlur,q,0);oAux=A0;return;}
 vec4 b=vec4(0.);vec3 a=vec3(0.);float ws=0.;
 for(int j=0;j<SIDE*SIDE;j++){ivec2 o=ivec2(j%SIDE-REACH,j/SIDE-REACH),p=clamp(q+o,ivec2(0),hs-1);vec4 A=texelFetch(tAux,p,0);
  float w=float(REACH+1-abs(o.x))*float(REACH+1-abs(o.y))*step(.5,cocOf(A.w));b+=texelFetch(tBlur,p,0)*w;a+=A.xyz*w;ws+=w;}
 oBlur=b/ws;oAux=vec4(a/ws,A0.w);
}`});
 post=new T.ShaderMaterial({name:'armory / lens',depthTest:false,depthWrite:false,
  uniforms:{...lens,tBlur:{value:half2.textures[0]},tAux:{value:half2.textures[1]},uExposure:{value:1.08},uSharp:{value:.55},uHaze:{value:new T.Vector3(2.6,8.,.32)}},vertexShader:vs,
  fragmentShader:`${LENS}uniform sampler2D tBlur,tAux;uniform float uExposure,uSharp;uniform vec3 uHaze;
vec3 film(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
 vec4 c0=texture(tColor,vUv);float cz=zOf(vUv),cc=cocOf(cz),soft=smoothstep(.3,.8,cc);
 // the four half-size points around this pixel. A pixel in focus listens only to those at its own distance, so the
 // edge of the weapon in front stays as sharp as it was drawn; a blurred pixel takes all four.
 ivec2 hs=textureSize(tBlur,0);vec2 p=vUv*vec2(hs)-.5,fl=floor(p),fr=p-fl;vec4 bf=vec4(0.);vec3 ax=vec3(0.);float wsum=0.;
 for(int j=0;j<4;j++){ivec2 o=ivec2(j&1,j>>1),q=clamp(ivec2(fl)+o,ivec2(0),hs-1);vec4 A=texelFetch(tAux,q,0);
  float w=(o.x==1?fr.x:1.-fr.x)*(o.y==1?fr.y:1.-fr.y)*mix(step(abs(A.w-cz),.12),1.,soft);
  bf+=texelFetch(tBlur,q,0)*w;ax+=A.xyz*w;wsum+=w;}
 if(wsum>1e-5){bf/=wsum;ax/=wsum;}
 float f=ax.x,k=f<.004?0.:mix(ax.y,max(f,smoothstep(.5,2.,cc)),soft);vec4 B=bf/max(f,1e-4),acc=mix(c0,B,k);
 // what is in focus gets its fine contrast back: the difference to its four neighbours, added again
 if(k<.02){vec4 n=(texture(tColor,vUv+vec2(uPx.x,0.))+texture(tColor,vUv-vec2(uPx.x,0.))+texture(tColor,vUv+vec2(0.,uPx.y))+texture(tColor,vUv-vec2(0.,uPx.y)))*.25;
  acc.rgb=max(vec3(0.),acc.rgb+(c0.rgb-n.rgb)*uSharp*step(.999,min(c0.a,n.a)));}
 float a=clamp(acc.a,0.,1.);vec3 col=a>1e-4?acc.rgb/acc.a:vec3(0.);
 float za=c0.a*(1.-k)+B.a*k,z=za>1e-4?(cz*c0.a*(1.-k)+ax.z/max(f,1e-4)*k)/za:cz,haze=smoothstep(uHaze.x,uHaze.y,z)*uHaze.z;
 col=mix(film(col*uExposure),vec3(1.),haze);
 gl_FragColor=vec4(linearToOutputTexel(vec4(col,1.)).rgb*a,a);
}`});
 postScene=new T.Scene();postCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);quad=new T.Mesh(new T.PlaneGeometry(2,2),post);quad.frustumCulled=false;postScene.add(quad);
 size();addEventListener('resize',size);
}
// where the weapon sitting at row coordinate u (0 = front, 1, 2, and 3 = front again) hangs
function place(u,out,it){
 const i=Math.floor(u)%3,j=(i+1)%3,f=u-Math.floor(u),A=SLOTS[i],B=SLOTS[j],k=Math.sin(f*Math.PI),wrap=i===2?1:0,a=i?A.at:it.home,b=j?B.at:it.home;
 out.x=lerp(a[0],b[0],f)+wrap*k*.4;out.y=lerp(a[1],b[1],f)+wrap*k*.3;out.z=lerp(a[2],b[2],f);
 out.yaw=lerp(A.yaw,B.yaw,f)-wrap*k*.5;out.pitch=lerp(A.pitch,B.pitch,f);out.roll=lerp(A.roll,B.roll,f);
 out.front=Math.max(0,1-Math.min(u,3-u));return out;
}
function filmSetup(){
 if(params.get('film')==='0'||CAPTURE)return;
 const box=document.createElement('div'),v=document.createElement('video'),tip=document.createElement('span');box.id='film';tip.innerHTML='<b>ESC</b>返回军械库';
 v.playsInline=true;v.preload='auto';v.src=`${FILM.minigun}?v=${BUILD}`;box.append(v,tip);$('stage').append(box);film.video=v;
 v.addEventListener('canplaythrough',()=>{film.ready=true;document.body.dataset.reel='1';},{once:true});
 v.addEventListener('ended',()=>teardown(false));box.addEventListener('click',()=>teardown(false));
 $('strip').addEventListener('click',()=>teardown(true));
}
// sound only when the visitor has touched the page: a film that starts by itself starts silent
function teardown(on){
 if(!film.ready||on===film.on)return;film.on=on;document.body.dataset.film=on?'1':'0';const v=film.video;
 if(on){v.currentTime=0;v.muted=!navigator.userActivation?.hasBeenActive;v.play().catch(()=>{v.muted=true;v.play().catch(()=>teardown(false));});}
 else{v.pause();film.stay=state.period;}
}
function select(index,{user=true}={}){
 const to=Math.round(state.c)+mod(index-Math.round(state.c)+1,3)-1;if(user)state.auto=false;
 if(to===Math.round(state.c)&&!state.tween)return;state.tween={from:state.c,to,at:state.t};
}
const SVG='http://www.w3.org/2000/svg',el=(n,a={})=>{const e=document.createElementNS(SVG,n);for(const k in a)e.setAttribute(k,a[k]);return e;};
function card(index){
 if(state.shown===index)return;state.shown=index;const id=ORDER[index],w=WEAPONS[id],C=COPY[id];
 $('slot').textContent=`0${w.slot} / 0${ORDER.length} — ${w.mode}`;$('name').textContent=w.name;$('ghost').textContent=w.name;$('full').textContent=w.full.replace(w.name,'').trim();$('line').textContent=C.line;
 $('specs').replaceChildren(...C.specs(w).map(([k,v,u])=>{const d=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=String(v);if(u){const s=document.createElement('small');s.textContent=u;dd.append(s);}d.append(dt,dd);return d;}));
 for(const b of $('tabs').children)b.setAttribute('aria-current',String(b.dataset.id===id));$('strip').hidden=!FILM[id];
 // the callouts of this weapon: a dot on the part, a line out of it, two lines of words at its end
 state.notes=C.notes(w).map(n=>{const g=el('g'),line=el('polyline',{class:'lead'}),dot=el('circle',{r:3,class:'dot'}),title=el('text',{class:'nt'}),sub=el('text',{class:'ns'});title.textContent=n.title;sub.textContent=n.sub;g.append(line,dot,title,sub);return {...n,g,line,dot,title,sub};});
 $('notes').replaceChildren(...state.notes.map(n=>n.g));
}
const P={},V=new T.Vector3(),S3=new T.Vector3();
function notes(t){
 if(!TEXT||!state.notes)return;const it=items[mod(Math.round(state.c),3)],vh=view.h/100;
 // they grow once the weapon has arrived, and go out with the card when it leaves
 const tw=state.tween,leaving=tw&&Math.round(state.c)===Math.round(tw.from),since=tw&&!leaving?-1:t-state.settled,out=tw?clamp(1-Math.abs(state.c-Math.round(state.c))/.2,0,1):1;
 $('notes').setAttribute('viewBox',`0 0 ${view.w} ${view.h}`);const sz=it.box.getSize(S3);
 state.notes.forEach((n,i)=>{
  const k=since<0?0:clamp((since-.2-i*.16)/.5,0,1);n.g.style.opacity=(k*out).toFixed(3);if(k<=0)return;
  V.set(it.box.min.x+sz.x*n.at[0],it.box.min.y+sz.y*n.at[1],it.box.min.z+sz.z*n.at[2]);it.object.localToWorld(V).project(camera);
  const x=(V.x*.5+.5)*view.w,y=(.5-V.y*.5)*view.h,ex=x+n.to[0]*vh,ey=y+n.to[1]*vh,dir=n.left?-1:1,tail=6.5*vh,grow=ease(k);
  // the line grows out of the dot: first the slanted part, then the level part
  const a=clamp(grow*2,0,1),b=clamp(grow*2-1,0,1),mx=lerp(x,ex,a),my=lerp(y,ey,a);
  n.line.setAttribute('points',`${x.toFixed(1)},${y.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)} ${(mx+dir*tail*b).toFixed(1)},${my.toFixed(1)}`);
  n.dot.setAttribute('cx',x.toFixed(1));n.dot.setAttribute('cy',y.toFixed(1));
  for(const [e,dy] of [[n.title,-.9*vh],[n.sub,2.3*vh]]){e.setAttribute('x',(ex+dir*.4*vh).toFixed(1));e.setAttribute('y',(ey+dy).toFixed(1));e.setAttribute('text-anchor',n.left?'end':'start');e.style.opacity=b.toFixed(3);}
 });
}
function step(dt){
 state.t+=dt;const t=state.t;
 // one stay = LOOP seconds, the move to the next weapon included; it starts where the lens is furthest back
 const period=LOOP>0?Math.floor(t/LOOP):0;if(period!==state.period){state.period=period;if(state.auto&&!state.tween)state.tween={from:state.c,to:Math.round(state.c)+1,at:t};}
 if(state.tween){const k=clamp((t-state.tween.at)/TRANS,0,1);state.c=lerp(state.tween.from,state.tween.to,ease(k));if(k>=1){state.c=state.tween.to;state.tween=null;state.settled=t;}}
 // the card goes out as the row starts to move and comes back with the next weapon's text (driven from here, not from a
 // CSS transition, so a captured frame shows exactly what a live one would)
 const off=Math.abs(state.c-Math.round(state.c)),show=clamp(1-off/.2,0,1),cs=$('card').style,gs=$('ghost').style;card(mod(Math.round(state.c),3));
 cs.opacity=show.toFixed(3);cs.transform=`translateY(${((1-show)*12).toFixed(1)}px)`;
 if(!state.dragging)state.drag*=Math.exp(-dt*2.2);
 // while it stays in front a weapon turns once to each side, slowly, to show itself
 const turn=LOOP>0?Math.sin(2*Math.PI*t/LOOP):Math.sin(t*W*3);
 items.forEach((it,i)=>{
  place(mod(i-state.c,3),P,it);const f=P.front,sway=Math.sin(t*W+i*2.1);
  it.pivot.position.set(P.x,P.y+Math.sin(t*2*W+i*1.7)*.01,P.z);
  it.pivot.rotation.set(P.pitch+Math.sin(t*W+i)*.018,P.yaw+sway*.07*(1-f)+turn*.17*f*f+state.drag*f,P.roll+Math.cos(t*W+i*.6)*.016,'YXZ');
  if(it.spin){it.angle+=dt*(1.2+22*f*f);it.spin.rotation.z=it.angle;}
 });
 const fl=items.flakes,pa=fl.geometry.attributes.position,b=fl.userData.base,sd=fl.userData.seed,H=3.4;
 for(let i=0;i<sd.length;i++){const fall=H/CYCLE*(sd[i]>.55?2:1);pa.setXYZ(i,b[i*3]+Math.sin(t*W*(sd[i]>.3?2:1)+sd[i]*40)*.06,FLOOR+mod(b[i*3+1]-FLOOR-t*fall,H),b[i*3+2]);}pa.needsUpdate=true;
 // the lens breathes in and out over one stay and swings sideways, so the three depths slide against each other
 const breathe=(1-Math.cos(2*Math.PI*t/(LOOP||7)))/2,swing=Math.sin(t*W);
 camera.position.set(EYE[0]+swing*.16,EYE[1]+Math.sin(t*W+1.3)*.02,EYE[2]-.1*breathe);camera.lookAt(AIM[0]+swing*.05,AIM[1],AIM[2]);camera.updateMatrixWorld(true);
 // focus pulls from the weapon that leaves to the one that arrives while the row moves
 const fa=Math.floor(state.c),fk=ease(state.c-fa),dist=i=>camera.position.distanceTo(items[mod(i,3)].pivot.position);post.uniforms.uFocus.value=lerp(dist(fa),dist(fa+1),fk);
 // the big name printed on the back wall slides a little against the weapon as the lens swings
 gs.opacity=(show*.06).toFixed(4);gs.transform=`translate(${(-swing*1.2).toFixed(2)}vh,0)`;
 const bar=$('tabs').querySelector('[aria-current="true"] i');if(bar)bar.style.transform=`scaleX(${(state.auto&&LOOP>0?mod(t,LOOP)/LOOP:1).toFixed(4)})`;
 // a recording may direct the picture itself (weapon, lens, focus) after the page has set its own: armoryDebug.direct(fn)
 state.direct?.(dt,t);
 draw();
 // ...and may draw over the finished picture (light that adds: flashes, glows): armoryDebug.after(fn)
 state.after?.(dt,t);notes(t);
}
function draw(){
 renderer.setRenderTarget(target);renderer.clear(true,true,true);renderer.render(scene,camera);
 quad.material=blur;renderer.setRenderTarget(half);renderer.render(postScene,postCamera);
 quad.material=soft;renderer.setRenderTarget(half2);renderer.render(postScene,postCamera);
 quad.material=post;renderer.setRenderTarget(null);renderer.clear(true,true,true);renderer.render(postScene,postCamera);
}

async function main(){
 document.body.dataset.text=TEXT?'1':'0';if(SURFACE)document.body.dataset.surface=SURFACE;if(CAPTURE)document.body.dataset.capture='1';
 await build();filmSetup();
 for(const id of ORDER){const w=WEAPONS[id],b=document.createElement('button');b.type='button';b.dataset.id=id;b.innerHTML=`<i></i><b>${w.slot}</b>${w.name}`;b.addEventListener('click',()=>select(ORDER.indexOf(id)));$('tabs').append(b);}
 const first=Math.max(0,ORDER.indexOf(params.get('w')??'rifle'));state.c=first;card(first);
 // the round opens the way every later stay does, with the first weapon coming forward: frame one of a recording of one
 // round then follows its last frame without a cut
 if(state.auto){state.c=first-1;state.tween={from:first-1,to:first,at:0};state.settled=-9;}
 addEventListener('keydown',e=>{if(film.on){teardown(false);if(!['1','2','3'].includes(e.key))return;}
  if((e.key==='t'||e.key==='T'||e.key==='Enter')&&FILM[ORDER[mod(Math.round(state.c),3)]]&&!state.tween){teardown(true);return;}
  if(['1','2','3'].includes(e.key))select(Number(e.key)-1);else if(e.key==='ArrowRight')select(mod(Math.round(state.c)+1,3));else if(e.key==='ArrowLeft')select(mod(Math.round(state.c)-1,3));else if(e.key===' ')state.auto=!state.auto;});
 // drag turns the weapon in front; it settles back when let go
 const cv=$('view');let lastX=0;cv.addEventListener('pointerdown',e=>{state.dragging=true;lastX=e.clientX;cv.setPointerCapture(e.pointerId);});
 cv.addEventListener('pointermove',e=>{if(!state.dragging)return;state.drag=clamp(state.drag+(e.clientX-lastX)*.006,-1.6,1.6);lastX=e.clientX;});
 for(const n of ['pointerup','pointercancel'])cv.addEventListener(n,()=>{state.dragging=false;});
 step(0);renderer.compile(scene,camera);state.ready=true;document.body.dataset.state='ready';
 window.armoryDebug={build:BUILD,three:T,items:()=>items,floor:FLOOR,direct:fn=>{state.direct=fn;},after:fn=>{state.after=fn;},film:()=>({on:film.on,ready:film.ready,stay:film.stay,time:film.video?.currentTime??null,muted:film.video?.muted??null}),teardown,get ready(){return state.ready;},step,select:(i,o)=>select(i,o),renderer:()=>renderer,scene:()=>scene,camera:()=>camera,post:()=>post,blur:()=>blur,lens:(taps,reach)=>{for(const m of [blur,soft]){Object.assign(m.defines,{TAPS:taps,REACH:reach,SIDE:2*reach+1});m.needsUpdate=true;}},quality:(ss,samples)=>{state.ss=ss;if(samples!==undefined&&samples!==target.samples){target.samples=samples;target.dispose();}size();},slots:SLOTS,eye:EYE,aim:AIM,
  surface:SURFACE,state:()=>({t:state.t,c:state.c,front:ORDER[mod(Math.round(state.c),3)],auto:state.auto,loop:LOOP,lean:state.lean,size:[innerWidth,innerHeight],target:[target.width,target.height],calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,items:items.map(i=>({id:i.id,at:i.pivot.position.toArray().map(v=>+v.toFixed(3)),home:i.home.map(v=>+v.toFixed(3)),length:+i.length.toFixed(3)}))})};
 if(CAPTURE)return;
 let last=performance.now(),seen=0,spent=0;const frame=now=>{const raw=(now-last)/1000,dt=Math.min(.05,raw);last=now;
  // the row stands still under the film and goes on where it stopped
  if(film.on){requestAnimationFrame(frame);return;}
  if(film.ready&&state.auto&&!state.tween&&LOOP>0&&film.stay!==state.period&&FILM[ORDER[mod(Math.round(state.c),3)]]&&mod(state.t,LOOP)>LOOP*.6)teardown(true);
  step(dt);
  // two seconds of frames over 19 ms each: draw the scene at screen size from here on
  if(!SS&&!state.lean&&++seen>40){spent+=Math.min(.1,raw);if(seen===160){if(spent/120>.019){state.lean=true;size();}seen=40;spent=0;}}
  requestAnimationFrame(frame);};requestAnimationFrame(frame);
}
main().catch(e=>{console.error(e);$('load').textContent='武器未能取出：'+e.message;});
