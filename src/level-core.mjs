// RealShot r24 · 雪线行动 (OPERATION SNOWLINE): a free-roaming snow level.
// Pure deterministic rules: no three.js, no DOM, no clock. The page injects
// the terrain through `world`:
//   ground(x,z)        -> rendered terrain height (m)
//   halfWidth(S,side)  -> walkable half width of the valley floor at S
//   overlooks          -> optional list of overlooks (OVERLOOKS) the page has cut into the terrain
//   roam               -> optional: how far beyond the floor's edge the hillside is open (m). The default .9 keeps
//                         everyone on the floor; with more, steepness is the wall: nobody walks up a slope past
//                         maxSlope, and ground past slideSlope slides the player back down
//   boxes()            -> live scenery AABBs [{id,min:[x,y,z],max:[x,y,z],column?}]; an optional
//                         column {radius,base} marks a rooted prop (a spruce) that blocks the body as
//                         a cylinder from base up to max[1], centred on the box; shots keep the AABB.
//                         r26: `solid` makes the foot soldiers walk round the box, and
//                         `explosive:{radius,damage,playerDamage,hp}` makes it a fuel store that blows up
//                         after `hp` bullet damage or any blast that reaches it (the page then drops the box)
// Axes match the r19 snow world: x across the valley, y up, forward is -z.
// Track distance S = ORIGIN_Z - z grows as the player walks down the valley.
//
// r24 adds the crowd: hundreds of ice-shell foot soldiers that break out of the
// snow and rush the player. They live in `crowd`, apart from the flying
// `enemies`, and use cheap sphere hit tests plus a spatial grid for spacing, so
// a few hundred cost about as much as a handful of drones. Kills feed a combo
// counter and charge the tactical missile (slot 4).
import {traceScenery,traceEnemy} from './defense-core.mjs';

const EPS=1e-9;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const len3=v=>Math.hypot(v[0],v[1],v[2]);
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const lerp3=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const norm=v=>{const l=len3(v);return l>EPS?[v[0]/l,v[1]/l,v[2]/l]:[0,0,-1];};
const dist3=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
// first contact of segment a->b with a sphere, as a fraction of the segment (0 when a starts inside)
function segSphere(a,b,cx,cy,cz,r){
 const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],fx=a[0]-cx,fy=a[1]-cy,fz=a[2]-cz;
 const C=fx*fx+fy*fy+fz*fz-r*r;if(C<=0)return 0;
 const A=dx*dx+dy*dy+dz*dz;if(A<EPS)return null;
 const B=2*(fx*dx+fy*dy+fz*dz),D=B*B-4*A*C;if(D<0)return null;
 const t=(-B-Math.sqrt(D))/(2*A);return t>=0&&t<=1?t:null;
}
const boxCentre=b=>[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,(b.min[2]+b.max[2])/2];
// a circle of radius r at (x,z) against a box's footprint: null when clear, else [x,z,axis] moved out through the
// nearest face (axis 0: an x face, 1: a z face)
function pushOut(x,z,b,r){
 const a=x-(b.min[0]-r),c=(b.max[0]+r)-x,d=z-(b.min[2]-r),e=(b.max[2]+r)-z;if(a<=0||c<=0||d<=0||e<=0)return null;
 const m=Math.min(a,c,d,e);return m===a?[b.min[0]-r,z,0]:m===c?[b.max[0]+r,z,0]:m===d?[x,b.min[2]-r,1]:[x,b.max[2]+r,1];
}
export function rng(seed){let a=seed>>>0;return ()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}

export const ORIGIN_Z=21.8;
export const sToZ=S=>ORIGIN_Z-S,zToS=z=>ORIGIN_Z-z;
export const SECTION_NAMES=Object.freeze(['松林雪谷','冰川峡谷','风口垭口','冰湖雪原']);
export const sectionIndex=S=>clamp(Math.floor(S/120),0,3);

export const LEVEL=Object.freeze({
 step:1/120,startS:14,minS:5,beaconS:456,endS:474,
 eye:1.62,radius:.36,height:1.8,stepUp:.45,maxSlope:1.1,slideSlope:1.3,slideSpeed:5,crowdSlope:1.3,
 walk:4.4,sprint:7.0,adsSpeed:2.4,accel:46,airAccel:8,gravity:19,jump:6.4,
 roam:12,hp:100,regenDelay:4.5,regenRate:24,
 interactRadius:2.6,interactTime:.5,
 holdTime:36,bossAt:22,
 crowdCap:240,maxAttackers:4,comboWindow:2.6,
 checkpoints:Object.freeze([14,120,240,360]),
});

// Handling numbers are authored for feel, not copied from any game. Names are original.
// knock: shove on a crowd soldier per hit; headMul: head-sphere damage multiplier; pierce: soldiers a round passes through;
// size: round radius against the soldiers' hit spheres (a rocket body does not slip between two of them).
export const WEAPONS=Object.freeze({
 rifle:Object.freeze({id:'rifle',slot:1,name:'PAC-9',full:'PAC-9 突击步枪',mode:'AUTO',mag:40,reserve:Infinity,interval:.082,auto:true,damage:1,pellets:1,pierce:1,spread:.004,adsSpread:.0011,moveSpread:.011,bloom:.0011,bloomMax:.009,speed:360,range:150,reload:1.9,emptyReload:2.4,kick:.011,zoom:1.4,knock:1.6,headMul:2.5,size:.05}),
 minigun:Object.freeze({id:'minigun',slot:2,name:'VX-6',full:'VX-6 转管机枪',mode:'SPIN',mag:300,reserve:900,interval:.04,slowInterval:.14,spinUp:.55,spinDown:.9,auto:true,damage:1,pellets:1,pierce:2,spread:.013,adsSpread:.009,moveSpread:.008,bloom:0,bloomMax:0,speed:420,range:150,reload:3.4,emptyReload:3.8,kick:.0045,zoom:1.12,knock:2.4,headMul:2,moveMul:.72,size:.06}),
 rpg:Object.freeze({id:'rpg',slot:3,name:'RK-3',full:'RK-3 火箭筒',mode:'HE',mag:1,reserve:14,interval:.4,auto:false,damage:16,pellets:1,splash:7.5,selfDamage:30,spread:.002,adsSpread:.001,moveSpread:.008,bloom:0,bloomMax:0,speed:62,gravity:1.2,range:180,fuse:3.2,reload:1.6,emptyReload:1.6,kick:.05,zoom:1.3,knock:11,headMul:1,big:true,size:.3}),
 missile:Object.freeze({id:'missile',slot:4,name:'天锤',full:'天锤 · 战术导弹',mode:'MARK',mag:1,reserve:0,interval:1,auto:false,damage:90,pellets:0,splash:17,selfDamage:0,spread:0,adsSpread:0,moveSpread:0,bloom:0,bloomMax:0,speed:0,range:240,reload:99,emptyReload:99,kick:.02,zoom:1.6,knock:24,headMul:1,charged:true,delay:2.6}),
});
export const WEAPON_ORDER=Object.freeze(['rifle','minigun','rpg','missile']);

export const ENEMIES=Object.freeze({
 drone:Object.freeze({hp:3,scale:1,speed:4.4,standoff:[8,13],alt:[2.1,3.3],windup:.95,lockAt:.7,lockTolerance:1.05,cooldown:[2.3,3.5],damage:11,shots:1,score:100,range:26,stun:.22,knock:2.2,charge:.05,name:'冰壳无人机'}),
 heavy:Object.freeze({hp:16,scale:1.7,speed:2.6,standoff:[11,16],alt:[3.2,4.3],windup:1.3,lockAt:.75,lockTolerance:1.3,cooldown:[2.8,3.6],damage:20,shots:2,score:450,range:34,stun:.06,knock:.5,charge:.16,name:'重装截击机'}),
 // r26 the dreadnought that comes for the beacon. half: its hit box; core: the weak point on the face toward the player
 // (centre offset from the hull centre, radius, damage multiplier); blastMul: what a blast source does to its armour
 boss:Object.freeze({hp:1400,scale:1,speed:6,standoff:[0,0],alt:[9.5,11],windup:0,lockAt:0,lockTolerance:0,cooldown:[99,99],damage:0,shots:0,score:5000,range:0,stun:0,knock:0,charge:0,name:'冰壳母舰',
  half:Object.freeze([5.1,3,5.2]),core:Object.freeze({at:Object.freeze([0,-1.05,5]),r:1.45,mul:2.6}),blastMul:Object.freeze({rpg:5,missile:5,secondary:1.5,airstrike:.6,palm:2}),
  mortar:Object.freeze({radius:4.2,damage:32,fuse:1.45}),beam:Object.freeze({damage:30,radius:1.9,half:13})}),
 logo:Object.freeze({hp:9,scale:1.18,speed:8,standoff:[0,0],alt:[9,12],windup:0,lockAt:0,lockTolerance:0,cooldown:[99,99],damage:0,shots:0,score:1000,range:0,stun:.05,knock:.4,life:19,charge:0,name:'隐藏目标'}),
});
const BASE_HALF=[.76,.41,.76];
// the emblem is a vertical disc that turns to face the player: a cube-like volume covers every yaw
const TYPE_RULES=Object.fromEntries(Object.entries(ENEMIES).map(([k,v])=>[k,{enemyHalfExtents:k==='logo'?[1.05,1.05,1.05]:v.half?v.half.slice():BASE_HALF.map(h=>h*v.scale)}]));
const SWARM=e=>e.type!=='logo'&&e.type!=='boss';
// area damage that never touches the hidden emblem: only a direct rocket can bring it down
const SPARES_LOGO=new Set(['airstrike','missile','secondary','bomber','barrel','palm','palmLand']);

// The crowd. Hit volume per soldier: legs, body, head spheres [height, radius] times scale; index 2 is the head.
export const CROWD_PARTS=Object.freeze([[.5,.3],[1.08,.4],[1.6,.2]]);
export const CROWD=Object.freeze({
 trooper:Object.freeze({hp:2,scale:1,speed:[3.5,4.6],reach:1.25,windup:.42,damage:4,cooldown:1.1,score:20,charge:.011,mass:1,name:'冰壳步兵'}),
 brute:Object.freeze({hp:12,scale:1.42,speed:[2.5,2.9],reach:1.7,windup:.7,damage:12,cooldown:1.6,score:150,charge:.05,mass:3.2,name:'重甲步兵'}),
 bomber:Object.freeze({hp:1,scale:.92,speed:[5.4,6.2],reach:1.9,windup:.25,damage:18,cooldown:9,score:40,charge:.02,mass:.8,blast:4.6,blastDamage:8,name:'爆冰兵'}),
});
export const COMBO_TIERS=Object.freeze([{n:10,label:'连斩'},{n:30,label:'破阵'},{n:60,label:'横扫千军'},{n:100,label:'万夫莫敌'},{n:200,label:'一骑当千'}]);
const CELL=1.5,cellKey=(i,j)=>(i+4096)*8192+(j+4096);

// The authored route. `at` is the S where the player trips the trigger.
// crowd: a stream of soldiers that breaks out of the snow dS metres from the player at `rate` per second.
export const ENCOUNTERS=Object.freeze([
 {id:'pine-1',at:30,banner:'接敌 · 冰壳步兵正从雪下钻出来',crowd:{count:26,dS:[34,50],rate:6},spawns:[{type:'drone',S:70,x:-9,delay:4},{type:'drone',S:72,x:9,delay:4}]},
 {id:'drop-minigun',at:56,banner:'空投补给正在降落 · VX-6 转管机枪',airdrop:{S:80,x:3,loot:'minigun'}},
 {id:'pine-surge',at:96,banner:'步兵潮 · 顶住，别后退',crowd:{count:90,dS:[40,62],rate:10,mix:{brute:.05,bomber:.08}},spawns:[{type:'drone',S:132,x:-10,delay:5},{type:'drone',S:134,x:10,delay:5}]},
 {id:'drop-rpg',at:146,banner:'空投补给正在降落 · RK-3 火箭筒',airdrop:{S:170,x:-3,loot:'rpg'}},
 {id:'glacier-surge',at:176,banner:'冰川峡谷 · 重甲步兵带队冲锋',crowd:{count:110,dS:[40,64],rate:12,mix:{brute:.09,bomber:.1}},spawns:[{type:'drone',S:210,x:-9,delay:3},{type:'drone',S:212,x:9,delay:3},{type:'drone',S:216,x:0,delay:6}]},
 {id:'logo',at:192,logo:true},
 {id:'drop-palm',at:222,banner:'金色空投正在降落 · 天掌',airdrop:{S:243,x:-2.5,loot:'palm',gold:true}},
 {id:'col-surge',at:262,banner:'风口垭口 · 重装截击机与步兵潮',crowd:{count:130,dS:[42,66],rate:13,mix:{brute:.1,bomber:.12}},spawns:[{type:'heavy',S:300,x:0,delay:2},{type:'drone',S:292,x:-11,delay:3},{type:'drone',S:292,x:11,delay:3}]},
 {id:'drop-supply',at:330,banner:'空投补给正在降落 · 弹药与医疗',airdrop:{S:352,x:2.5,loot:'supply'}},
 {id:'lake-surge',at:372,banner:'冰湖雪原 · 信标前最后一道拦截',crowd:{count:150,dS:[40,66],rate:15,mix:{brute:.1,bomber:.14}},spawns:[{type:'drone',S:404,x:-12,delay:2},{type:'drone',S:404,x:12,delay:2},{type:'drone',S:410,x:-5,delay:6},{type:'drone',S:410,x:5,delay:6}]},
 {id:'hold',at:LEVEL.beaconS-9,hold:true},
]);
const HOLD_WAVES=Object.freeze([
 {t:2,crowd:{count:40,dS:[16,24],rate:10,mix:{bomber:.08}},spawns:[{type:'drone',dS:28,x:-12},{type:'drone',dS:30,x:12}]},
 {t:10,crowd:{count:50,dS:[-48,-30],rate:11,mix:{brute:.08,bomber:.1}},spawns:[{type:'drone',dS:-14,x:-10},{type:'drone',dS:-14,x:10}]},
 {t:14,airdrop:{dS:-5,x:4.5,loot:'palm',gold:true}},
 {t:18,crowd:{count:60,dS:[16,24],rate:12,mix:{brute:.12,bomber:.12}},spawns:[{type:'heavy',dS:30,x:0}]},
 {t:26,crowd:{count:60,dS:[-50,-30],rate:14,mix:{brute:.1,bomber:.16}},spawns:[{type:'drone',dS:30,x:-6},{type:'drone',dS:30,x:6}]},
]);

export const LOOT=Object.freeze({
 minigun:{label:'VX-6 转管机枪',weapon:'minigun'},
 rpg:{label:'RK-3 火箭筒',weapon:'rpg'},
 supply:{label:'弹药与医疗补给'},
 perch:{label:'制高点军火箱 · VX-6 与 RK-3 满弹',arsenal:true},
 gold:{label:'金色补给 · 全武器满弹 · 天锤充满',weapon:'rpg',all:true,charge:true},
 palm:{label:'天掌 · 凌空 12 秒',palm:true},
});
// r28 · a gold crate is a power trip, so it brings its own audience: the moment one is opened the snow around the player
// erupts with soldiers for the palm, the missile and the full magazines to work on. waves: [share of count, [near,far]
// metres from the player along the route (negative = behind), soldiers per second, delay]; a wave with no room on its
// side of the route comes from the other side. room: the surge shrinks so the crowd alive plus everything already on
// its way stays under it, and below `least` it is not worth announcing.
export const SURGE=Object.freeze({room:210,least:8,
 palm:Object.freeze({count:150,mix:Object.freeze({brute:.08,bomber:.05}),waves:Object.freeze([[.45,[14,54],60,0],[.2,[-40,-14],40,.2],[.35,[18,58],40,5]])}),
 gold:Object.freeze({count:80,mix:Object.freeze({brute:.06,bomber:.08}),waves:Object.freeze([[.7,[20,54],45,.3],[.3,[-42,-18],30,.6]])}),
});
// r27 · the sky palm. A gold crate lifts the player over the valley for `time` seconds; from up there every click brings
// a giant hand of ice down on the ground under the crosshair, `delay` after the call. guard: what is left of damage
// taken in the air; land: the ring of snow thrown out by touching down again.
export const PALM=Object.freeze({time:12,height:15,rise:14,sink:7,speed:11,accel:42,delay:1,cooldown:1.5,radius:10,damage:40,knock:26,range:64,guard:.3,
 land:Object.freeze({radius:6,damage:10,knock:14})});

// r26 · snow cornices over the route. Enough fire (or any blast that reaches one) releases the slope: the slide
// crosses the valley floor between S-length/2 and S+length/2 and buries whatever stands in its way.
export const CORNICES=Object.freeze([
 {id:'pine',S:132,side:-1,length:40},
 {id:'canyon',S:214,side:-1,length:44},
 {id:'col',S:306,side:1,length:46},
]);
// out: how far up the slope the cornice hangs beyond the floor's edge; delay: crack to release; speed: the front, m/s
// seconds from the dreadnought's death to the end of the level: it falls for 2.7, goes up, and the wreck gets a moment on screen
const BOSS_WRECK=4.6;
export const AVALANCHE=Object.freeze({hp:10,radius:3.4,out:13,lift:1.6,band:2.5,top:15,along:10,delay:.9,speed:15,reach:3,playerDamage:60,vehicleDamage:70,airDamage:6,airHeight:6});
// r26 · the snowcats. Driven from a chase view: the hull turns toward where the camera looks. half: [half width, half length].
export const VEHICLE=Object.freeze({hp:320,forward:13.5,reverse:5.5,accel:8.5,brake:18,coast:3.5,turn:2.1,half:Object.freeze([1.3,2.05]),circle:Object.freeze([.8,1.35]),
 ramMin:3.2,armor:.6,enterRadius:2.2,enterTime:.4,exitTime:.3,wear:.9,blast:Object.freeze({radius:7,damage:40,playerDamage:20})});
export const VEHICLES=Object.freeze([{id:'pine',S:68,x:3.6,yaw:0},{id:'col',S:249,x:2.6,yaw:0},{id:'lake',S:368,x:3.2,yaw:0}]);
// r27 · overlooks. A ramp cut along one valley wall climbs `rise` metres over `ramp` metres of route and opens into
// a shelf above the floor: ground to hold with the heavy weapons while the crowd has to come round by the ramp.
// Across the valley everything is measured from the floor's edge, e = |x| - halfWidth(S, side); along it, u = S - o.S.
// width: the ramp's flat; deep: the shelf's outer edge (e). The page cuts the same shape into the terrain.
// lead: flat run-in before the ramp; inner: the face between floor and flat; back/end: blend into the hillside;
// perch: the lift from which the player counts as above the crowd; bonus: score and missile charge while holding the shelf
export const OVERLOOK=Object.freeze({lead:6,inner:2.4,foot:.45,back:2.5,end:2.5,margin:.45,perch:1.6,bonus:1.5,call:26});
export const OVERLOOKS=Object.freeze([
 {id:'pine',name:'松林哨台',S:74,side:1,rise:6.2,ramp:24,shelf:20,width:4.4,deep:9.5},
 {id:'canyon',name:'冰川岩台',S:166,side:1,rise:7.4,ramp:24,shelf:22,width:4.2,deep:9},
 {id:'col',name:'垭口哨位',S:262,side:-1,rise:6.6,ramp:22,shelf:22,width:4.4,deep:9.5},
 {id:'lake',name:'信标高地',S:420,side:-1,rise:5.4,ramp:22,shelf:22,width:4.6,deep:10},
].map(o=>Object.freeze(o)));
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
export const overlookLift=(o,u)=>o.rise*sstep(0,o.ramp,u);
export const overlookOuter=(o,u)=>{const a=OVERLOOK.inner+o.width;return a+(o.deep-a)*sstep(o.ramp-9,o.ramp-1,u);};
// the overlook whose cut covers (S, side); pad: metres of blend beyond either end
export function overlookAt(list,S,side,pad=0){for(const o of list)if(o.side===side&&S>=o.S-OVERLOOK.lead-pad&&S<=o.S+o.ramp+o.shelf+pad)return o;return null;}
// the terrain with the overlook cut in: h is the natural height at (e, u)
export function overlookHeight(o,e,u,h){
 const K=OVERLOOK,out=overlookOuter(o,u),L=o.ramp+o.shelf;
 // the face does not run ruler-straight: its foot wanders up to .6 m out from the floor's edge
 const S=o.S+u,e0=.3+.3*Math.sin(S*.83+o.S)*Math.sin(S*.31+1.3);
 const m=sstep(e0,K.inner,e)*(1-sstep(out,out+K.back,e))*sstep(-K.lead-K.end,-K.lead,u)*(1-sstep(L,L+K.end,u));
 return m>0?h+(K.foot+overlookLift(o,u)-h)*m:h;
}
// what the page hands to the terrain: (x, S, natural height, floor half width on that side) -> height
export const overlookTerrain=(list=OVERLOOKS)=>(x,S,h,w)=>{const o=overlookAt(list,S,x<0?-1:1,OVERLOOK.end+.5);return o?overlookHeight(o,Math.abs(x)-w,S-o.S,h):h;};
// where the cut exposes the hillside: its steep faces show as rock, not as drifted snow (w may be a function, read only inside a cut)
export const overlookRock=(list=OVERLOOKS)=>(x,S,w)=>{const o=overlookAt(list,S,x<0?-1:1,OVERLOOK.end+1);if(!o)return 0;const e=Math.abs(x)-(typeof w==='function'?w():w),out=overlookOuter(o,S-o.S)+OVERLOOK.back;return sstep(-.4,.3,e)*(1-sstep(out,out+2,e));};
// where the page may not grow a tree or drop a boulder
export const overlookClear=(list=OVERLOOKS)=>(x,S,w)=>{const o=overlookAt(list,S,x<0?-1:1,1);if(!o)return false;const e=Math.abs(x)-(typeof w==='function'?w():w);return e>-.4&&e<overlookOuter(o,S-o.S)+1.2;};
// outpost props a snowcat at speed goes straight through
const BREAKABLE=new Set(['crates','barrier','sandbags']);
const wrap=a=>((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;

function basis(d){const up=Math.abs(d[1])<.95?[0,1,0]:[1,0,0];const u=norm([d[1]*up[2]-d[2]*up[1],d[2]*up[0]-d[0]*up[2],d[0]*up[1]-d[1]*up[0]]);const v=[d[1]*u[2]-d[2]*u[1],d[2]*u[0]-d[0]*u[2],d[0]*u[1]-d[1]*u[0]];return [u,v];}

export class LevelGame{
 constructor({world,seed=0x5e0a,godMode=false}={}){
  if(!world||typeof world.ground!=='function')throw Error('LevelGame needs world.ground(x,z)');
  this.world={halfWidth:()=>9,boxes:()=>[],...world};this.overlooks=world.overlooks??[];this.roam=world.roam??.9;this.steep=this.roam>1||this.overlooks.length>0;
  this.seed=seed;this.godMode=godMode;this.restart();
 }
 restart(){
  this.rand=rng(this.seed);this.time=0;this._acc=0;this._eid=0;this._pid=0;this._aid=0;this._evid=0;this._cid=0;this._mid=0;
  this.state='running';this.events=[];this.enemies=[];this.projectiles=[];this.airdrops=[];this.bombs=[];this.pending=[];
  this.crowd=[];this.streams=[];this.blasts=[];this.missiles=[];this.grid=new Map();
  this.triggered=new Set();this.checkpoint=LEVEL.startS;this.hold=null;this.logoState='waiting';
  this.score=0;this.kills=0;this.crowdKills=0;this.shots=0;this.hits=0;this.deaths=0;this.airstrikes=0;
  this.combo=0;this.comboAt=-99;this.comboTier=0;this.bestCombo=0;this.charge=0;this.spin=0;this.pendingSwitch=null;
  this.spent=new Set();this.propHP=new Map();this.flows=[];this.driving=null;this.bossDownAt=null;
  this.perch=null;this.high=null;this.highSince=0;this.highKills=0;this.flight=null;this.palms=[];
  this.cornices=CORNICES.map(c=>this._cornice(c));this.vehicles=VEHICLES.map(v=>this._vehicle(v));
  const S=LEVEL.startS,z=sToZ(S);
  this.player={x:0,y:this.world.ground(0,z),z,vx:0,vz:0,vy:0,yaw:0,onGround:true,hp:LEVEL.hp,lastHurt:-99,stride:0,sprinting:false,ads:false,fireSuppress:0};
  this.input={forward:0,back:0,left:0,right:0,sprint:false,ads:false,jump:false,interact:false,trigger:false,yaw:0};
  this.inv={rifle:{mag:WEAPONS.rifle.mag,reserve:WEAPONS.rifle.reserve}};this.weapon='rifle';this.lastWeapon='rifle';
  this.switchUntil=0;this.nextFire=0;this.reloadAt=null;this.reloadStart=0;this.reloadDuration=0;this.bloom=0;
  this.interact={target:null,kind:null,vehicle:null,key:null,progress:0,lock:false};
  return this;
 }
 // a cornice runs along the wall: what a shot or a blast can reach is a row of spheres (nodes) down its length
 _cornice(c){
  const A=AVALANCHE,span=c.length-2*A.radius,n=2*Math.max(1,Math.round(span/8)),nodes=[];
  for(let i=0;i<=n;i++){const S=c.S+(i/n-.5)*span,z=sToZ(S),x=c.side*(this.world.halfWidth(S,c.side)+A.out);nodes.push([x,this.world.ground(x,z)+A.lift,z]);}
  const m=nodes[n/2];return {id:c.id,S:c.S,side:c.side,length:c.length,x:m[0],z:m[2],y:m[1],nodes,hp:A.hp,state:'ready'};
 }
 _vehicle(v){const z=sToZ(v.S);return {id:v.id,S0:v.S,x:v.x,z,y:this.world.ground(v.x,z),yaw:v.yaw??0,speed:0,hp:VEHICLE.hp,state:'parked',hitAt:-99,travel:0};}
 // ---------- derived ----------
 get S(){return zToS(this.player.z);}
 get section(){return sectionIndex(this.S);}
 chest(){const p=this.player;return [p.x,p.y+1.3,p.z];}
 eye(){const p=this.player;return [p.x,p.y+LEVEL.eye,p.z];}
 get reloading(){return this.reloadAt!==null;}
 get switching(){return this.time<this.switchUntil;}
 // `id` is the event's own sequence number (pages consume `id > lastId`); a payload can never overwrite it
 _emit(ev,e){const out={time:this.time,...e,id:++this._evid};ev.push(out);this.events.push(out);if(this.events.length>3000)this.events.splice(0,this.events.length-3000);return out;}
 // ---------- input & actions ----------
 setInput(i={}){Object.assign(this.input,i);}
 switchWeapon(id){
  if(this.state!=='running')return false;
  if(id==='last')id=this.lastWeapon;
  if(id==='next'||id==='prev'){const owned=WEAPON_ORDER.filter(w=>this._owns(w));const k=owned.indexOf(this.weapon);id=owned[(k+(id==='next'?1:owned.length-1))%owned.length];}
  if(!this._owns(id)||id===this.weapon)return false;
  this.lastWeapon=this.weapon;this.weapon=id;this.reloadAt=null;this.switchUntil=this.time+.42;this.nextFire=Math.max(this.nextFire,this.switchUntil);this.bloom=0;this.spin=0;
  this._emit([], {type:'switch',weapon:id,from:this.lastWeapon});return true;
 }
 _owns(id){const s=this.inv[id];return !!s&&(id!=='missile'||s.mag>0||this.weapon==='missile');}
 reload(){
  if(this.state!=='running'||this.reloading||this.switching)return false;
  const w=WEAPONS[this.weapon],s=this.inv[this.weapon];if(s.mag>=w.mag||s.reserve<=0)return false;
  this.reloadDuration=s.mag===0?w.emptyReload:w.reload;this.reloadStart=this.time;this.reloadAt=this.time+this.reloadDuration;
  this._emit([], {type:'reloadStart',weapon:this.weapon,duration:this.reloadDuration,empty:s.mag===0});return true;
 }
 // origin: world muzzle; target: world point under the crosshair (for the missile: the point to strike).
 fire({origin,target}={}){
  if(this.state!=='running'||this.switching||this.reloading||this.driving)return null;
  if(!Array.isArray(origin)||!Array.isArray(target)||![...origin,...target].every(Number.isFinite))return null;
  if(this.flight)return this._palmCall(target);
  const w=WEAPONS[this.weapon],s=this.inv[this.weapon];
  if(s.mag<=0){this.reload();return null;}
  if(this.time+EPS<this.nextFire)return null;
  if(w.charged)return this._callMissile(w,s,origin,target);
  let interval=w.interval;
  if(w.spinUp){if(this.spin<.3)return null;interval=w.slowInterval+(w.interval-w.slowInterval)*clamp((this.spin-.3)/.7,0,1);}
  const p=this.player,base=norm(sub(target,origin)),speed=Math.hypot(p.vx,p.vz);
  const spread=(this.input.ads?w.adsSpread:w.spread)+w.moveSpread*clamp(speed/LEVEL.walk,0,1.5)+(p.onGround?0:w.moveSpread*1.5)+this.bloom;
  const [u,v]=basis(base),shots=[];
  for(let i=0;i<w.pellets;i++){
   const r=spread*Math.sqrt(this.rand()),a=this.rand()*Math.PI*2;
   const dir=norm([base[0]+u[0]*r*Math.cos(a)+v[0]*r*Math.sin(a),base[1]+u[1]*r*Math.cos(a)+v[1]*r*Math.sin(a),base[2]+u[2]*r*Math.cos(a)+v[2]*r*Math.sin(a)]);
   const shot={id:++this._pid,weapon:w.id,damage:w.damage,origin:origin.slice(),position:origin.slice(),previous:origin.slice(),direction:dir,velocity:dir.map(c=>c*w.speed),
    age:0,life:w.gravity?w.fuse:w.range/w.speed,distance:0,start:this.time,pierce:w.pierce??0,splash:w.splash??0,selfDamage:w.selfDamage??0,gravity:w.gravity??0,
    knock:w.knock??1,headMul:w.headMul??1,big:!!w.big,size:w.size??0,hitIds:[],crowdIds:[]};
   this.projectiles.push(shot);shots.push(shot);
  }
  s.mag--;this.shots++;this.nextFire=this.time+interval;this.bloom=Math.min(w.bloomMax,this.bloom+w.bloom);p.fireSuppress=.32;
  this._emit([], {type:'fire',weapon:w.id,origin:origin.slice(),direction:base,mag:s.mag,pellets:w.pellets,spin:this.spin});
  if(s.mag===0&&s.reserve>0)this.nextFire=Math.max(this.nextFire,this.time+interval);
  return {weapon:w.id,shots};
 }
 // the designator marks the ground under the crosshair; the missile arrives after w.delay
 _callMissile(w,s,origin,target){
  const x=target[0],z=target[2],m={id:++this._mid,x,z,y:this.world.ground(x,z),at:this.time+w.delay,calledAt:this.time};
  this.missiles.push(m);s.mag=0;this.charge=0;this.shots++;this.nextFire=this.time+w.interval;
  const back=this.lastWeapon!=='missile'&&this.inv[this.lastWeapon]?this.lastWeapon:'rifle';
  this.pendingSwitch={at:this.time+.6,to:back};
  this._emit([], {type:'fire',weapon:w.id,origin:origin.slice(),direction:norm(sub(target,origin)),mag:0,pellets:0});
  this._emit([], {type:'missileCall',missileId:m.id,target:[m.x,m.y,m.z],impactAt:m.at,delay:w.delay});
  return {weapon:w.id,shots:[],missile:{...m}};
 }
 respawn(){
  if(this.state!=='down')return false;
  const S=this.checkpoint,z=sToZ(S),p=this.player;
  Object.assign(p,{x:0,z,y:this.world.ground(0,z),vx:0,vz:0,vy:0,onGround:true,hp:LEVEL.hp,lastHurt:-99});
  this.enemies=[];this.projectiles=[];this.pending=[];this.bombs=[];this.hold=null;this.crowd=[];this.streams=[];this.blasts=[];this.missiles=[];
  this.combo=0;this.comboTier=0;this.spin=0;this.flows=[];this.driving=null;this.bossDownAt=null;this.perch=null;this.high=null;this.flight=null;this.palms=[];
  // what lies ahead of the checkpoint is as it was: the snowcats parked, the cornices hanging
  this.vehicles=this.vehicles.map(v=>v.S0>=S?this._vehicle(VEHICLES.find(o=>o.id===v.id)):(v.state==='driven'?{...v,state:'parked',speed:0}:v));
  this.cornices=this.cornices.map(c=>c.S>=S?this._cornice(c):c);
  for(const e of ENCOUNTERS)if(e.at>=S&&!e.airdrop&&!e.logo)this.triggered.delete(e.id);
  for(const w of Object.keys(this.inv)){const W=WEAPONS[w];this.inv[w].reserve=Math.max(this.inv[w].reserve,Math.round(W.reserve*.5));if(w!=='missile')this.inv[w].mag=Math.max(this.inv[w].mag,W.mag);}
  this.reloadAt=null;this.state='running';this._emit([], {type:'respawn',S});return true;
 }
 // ---------- simulation ----------
 advance(dt){
  if(!Number.isFinite(dt)||dt<=0)return [];
  const ev=[];this._acc+=Math.min(dt,.25);
  while(this._acc+EPS>=LEVEL.step){this._acc-=LEVEL.step;this._step(LEVEL.step,ev);}
  return ev;
 }
 _step(dt,ev){
  this.time+=dt;
  const p=this.player,w=WEAPONS[this.weapon];
  if(this.state==='running'){
   if(this.reloading&&this.time+EPS>=this.reloadAt){const s=this.inv[this.weapon],n=Math.min(w.mag-s.mag,s.reserve);s.mag+=n;s.reserve-=n;this.reloadAt=null;this._emit(ev,{type:'reload',weapon:this.weapon});}
   if(w.spinUp){const on=this.input.trigger&&!this.reloading&&!this.switching&&!this.flight&&this.inv[this.weapon].mag>0;this.spin=on?Math.min(1,this.spin+dt/w.spinUp):Math.max(0,this.spin-dt/w.spinDown);}else this.spin=0;
   if(this.pendingSwitch&&this.time+EPS>=this.pendingSwitch.at){const to=this.pendingSwitch.to;this.pendingSwitch=null;if(this.weapon==='missile'&&this.inv.missile?.mag<=0)this.switchWeapon(to);if(this.inv.missile?.mag<=0&&this.weapon!=='missile')delete this.inv.missile;}
   this.bloom=Math.max(0,this.bloom-dt*.03);p.fireSuppress=Math.max(0,p.fireSuppress-dt);
   if(this.driving)this._drive(dt,ev);else if(this.flight)this._fly(dt,ev);else this._movePlayer(dt,ev);
   if(this.overlooks.length)this._perch(ev);
   this._triggers(ev);
   if(this.time-p.lastHurt>LEVEL.regenDelay&&p.hp<LEVEL.hp)p.hp=Math.min(LEVEL.hp,p.hp+LEVEL.regenRate*dt);
   if(!this.flight)this._interact(dt,ev);
  }
  for(let i=this.pending.length-1;i>=0;i--)if(this.pending[i].at<=this.time+EPS){const job=this.pending.splice(i,1)[0];if(this.state==='running')this._spawn(job.spec,ev);}
  if(this.state==='running')this._runStreams(dt,ev);
  for(const e of this.enemies)this._updateEnemy(e,dt,ev);
  this._updateCrowd(dt,ev);
  if(this.flows.length)this._runFlows(ev);
  this._stepProjectiles(dt,ev);
  for(let i=this.blasts.length-1;i>=0;i--){const b=this.blasts[i];if(b.at>this.time+EPS)continue;this.blasts.splice(i,1);this._explode(b.pos,b,ev);}
  for(let i=this.missiles.length-1;i>=0;i--){const m=this.missiles[i];if(m.at>this.time+EPS)continue;this.missiles.splice(i,1);this._missileImpact(m,ev);}
  for(let i=this.palms.length-1;i>=0;i--){const s=this.palms[i];if(s.at>this.time+EPS)continue;this.palms.splice(i,1);this._palmImpact(s,ev);}
  this.enemies=this.enemies.filter(e=>e.hp>0&&!e.gone);
  if(this.crowd.some(m=>m.dead))this.crowd=this.crowd.filter(m=>!m.dead);
  this._updateAirdrops(dt,ev);
  for(let i=this.bombs.length-1;i>=0;i--){const b=this.bombs[i];if(b.at<=this.time+EPS){this.bombs.splice(i,1);let x=b.x,z=b.z;const t=b.enemyId?this.enemies.find(e=>e.id===b.enemyId&&e.hp>0):null;if(t){x=t.x+b.jx;z=t.z+b.jz;}const g=this.world.ground(x,z);this._explode([x,g+.25,z],{radius:7.2,damage:40,source:'airstrike',big:true,selfDamage:0,knock:14},ev);}}
  if(this.hold&&this.state==='running'){
   const t=this.time-this.hold.start;
   for(const wv of HOLD_WAVES)if(!this.hold.fired.has(wv.t)&&t>=wv.t){this.hold.fired.add(wv.t);for(const s of wv.spawns??[])this._spawn({...s,S:LEVEL.beaconS+s.dS},ev);if(wv.crowd)this.streams.push(this._stream(wv.crowd));if(wv.airdrop)this.dropSupply({...wv.airdrop,S:LEVEL.beaconS+wv.airdrop.dS},ev);}
   // the dreadnought comes for the beacon before the upload is through: the level ends when both are done
   if(t>=LEVEL.bossAt&&!this.hold.boss){this.hold.boss=true;this._spawn({type:'boss',S:LEVEL.endS+70,x:0},ev);}
   if(t>=LEVEL.holdTime&&this.hold.boss&&this.bossDownAt!==null&&this.time>=this.bossDownAt+BOSS_WRECK&&!this.enemies.some(e=>e.type==='boss'&&e.hp>0)){
    this.state='won';for(const e of this.enemies)e.gone=true;this.enemies=[];this.projectiles=this.projectiles.filter(q=>q.splash===0);this.blasts=[];this.flows=[];
    for(const m of this.crowd)this._crowdDie(m,{cause:'win',force:.4},ev,{score:false});this.crowd=[];this.streams=[];
    this._emit(ev,{type:'win',time:this.time,score:this.score,kills:this.kills,bestCombo:this.bestCombo});
   }
  }
  if(this.combo>0&&this.time-this.comboAt>LEVEL.comboWindow){this._emit(ev,{type:'comboEnd',count:this.combo});this.combo=0;this.comboTier=0;}
 }
 _movePlayer(dt,ev){
  const p=this.player,i=this.input,g=this.world.ground,w=WEAPONS[this.weapon];
  p.yaw=Number.isFinite(i.yaw)?i.yaw:p.yaw;
  const fx=-Math.sin(p.yaw),fz=-Math.cos(p.yaw),rx=Math.cos(p.yaw),rz=-Math.sin(p.yaw);
  const mf=(i.forward?1:0)-(i.back?1:0),ms=(i.right?1:0)-(i.left?1:0);
  let wx=fx*mf+rx*ms,wz=fz*mf+rz*ms;const wl=Math.hypot(wx,wz);if(wl>EPS){wx/=wl;wz/=wl;}
  const heavy=w.spinUp&&this.spin>.3;
  p.ads=!!i.ads;p.sprinting=!!i.sprint&&mf>0&&!p.ads&&p.fireSuppress<=0&&!this.reloading&&!heavy;
  const top=(wl<EPS?0:p.sprinting?LEVEL.sprint:p.ads?LEVEL.adsSpeed:LEVEL.walk)*(heavy?w.moveMul:1);
  const tx=wx*top,tz=wz*top,acc=(p.onGround?LEVEL.accel:LEVEL.airAccel)*dt;
  const dx=tx-p.vx,dz=tz-p.vz,dl=Math.hypot(dx,dz);
  if(dl<=acc){p.vx=tx;p.vz=tz;}else if(p.onGround||wl>EPS){p.vx+=dx/dl*acc;p.vz+=dz/dl*acc;}
  if(i.jump){i.jump=false;if(p.onGround&&!p.sliding){p.vy=LEVEL.jump;p.onGround=false;this._emit(ev,{type:'jump'});}}
  const prevX=p.x,prevZ=p.z;
  let nx=p.x+p.vx*dt,nz=p.z+p.vz*dt;
  // scenery: push the body circle out of any AABB that overlaps its height
  // rooted props (spruces): the body — and the eye riding on it — never enters a canopy skirt. Dense stands
  // overlap, so push out twice and cancel the step if it would still end inside one.
  const cols=this._columns(p),pen=(x,z)=>{let m=0;for(const c of cols)m=Math.max(m,c.R-Math.hypot(x-c.x,z-c.z));return m;};
  for(let pass=0;pass<2;pass++)for(const c of cols){const ox=nx-c.x,oz=nz-c.z,d=Math.hypot(ox,oz);if(d>=c.R)continue;if(d>EPS){nx=c.x+ox/d*c.R;nz=c.z+oz/d*c.R;}else nx=c.x+c.R;}
  if(cols.length&&pen(nx,nz)>1e-6&&pen(p.x,p.z)<=1e-6){nx=p.x;nz=p.z;p.vx*=.2;p.vz*=.2;}
  for(const b of this.world.boxes()){
   if(b.column||this.spent.has(b.id))continue;
   if(b.max[1]<p.y+LEVEL.stepUp||b.min[1]>p.y+LEVEL.height)continue;
   const cx=clamp(nx,b.min[0],b.max[0]),cz=clamp(nz,b.min[2],b.max[2]),ox=nx-cx,oz=nz-cz,d=Math.hypot(ox,oz);
   if(d>=LEVEL.radius)continue;
   if(d>EPS){nx=cx+ox/d*LEVEL.radius;nz=cz+oz/d*LEVEL.radius;}
   else{const pen=[[b.min[0]-nx,0],[b.max[0]-nx,0],[0,b.min[2]-nz],[0,b.max[2]-nz]].sort((a,c)=>Math.hypot(...a)-Math.hypot(...c))[0];nx+=pen[0]+Math.sign(pen[0])*LEVEL.radius;nz+=pen[1]+Math.sign(pen[1])*LEVEL.radius;}
  }
  // a snowcat standing in the snow is a solid thing
  for(const v of this.vehicles)for(const k of this._hull(v)){const ox=nx-k[0],oz=nz-k[1],d=Math.hypot(ox,oz),R=k[2]+LEVEL.radius;if(d<R&&d>EPS){nx=k[0]+ox/d*R;nz=k[1]+oz/d*R;}}
  // the valley: soft side walls, a start fence and the far end
  let S=zToS(nz);S=clamp(S,LEVEL.minS,LEVEL.endS);nz=sToZ(S);
  const hw=this._reach(S,nx<0?-1:1);if(Math.abs(nx)>hw){nx=Math.sign(nx)*hw;p.vx*=.3;}
  // a slope too steep for a step stops horizontal motion (in the air too, once the feet are level with it: no hopping up a face)
  const gNew=g(nx,nz),gOld=g(p.x,p.z),run=Math.hypot(nx-p.x,nz-p.z);
  if(run>1e-4&&(gNew-gOld)/run>LEVEL.maxSlope&&gNew>p.y+(p.onGround?.04:-.05)&&(p.onGround||this.steep)){nx=p.x;nz=p.z;p.vx*=.2;p.vz*=.2;}
  p.x=nx;p.z=nz;
  p.vy-=LEVEL.gravity*dt;let ny=p.y+p.vy*dt;const ground=g(p.x,p.z);
  if(ny<=ground){if(!p.onGround&&p.vy<-3)this._emit(ev,{type:'land',speed:-p.vy});ny=ground;p.vy=0;p.onGround=true;}
  else if(p.onGround&&p.vy<=0&&ny-ground<LEVEL.stepUp){ny=ground;p.vy=0;}
  else p.onGround=false;
  p.y=ny;
  // ground too steep to stand on (a rock face, the cut of an overlook): the body slides back down it and cannot jump from it
  p.sliding=false;
  if(p.onGround&&this.steep&&Math.abs(p.x)>this.world.halfWidth(this.S,p.x<0?-1:1)-.5){
   const n=this.groundNormal(p.x,p.z),s=Math.hypot(n[0],n[2]);
   if(s>n[1]*LEVEL.slideSlope){
    p.sliding=true;const k=LEVEL.slideSpeed*dt/s,sx=p.x+n[0]*k,sz=sToZ(clamp(zToS(p.z+n[2]*k),LEVEL.minS,LEVEL.endS)),sd=sx<0?-1:1;
    if(Math.abs(sx)<=this._reach(zToS(sz),sd)){p.x=sx;p.z=sz;p.y=Math.min(p.y,g(sx,sz));p.vx*=.6;p.vz*=.6;}
   }
  }
  if(p.onGround){const moved=Math.hypot(p.x-prevX,p.z-prevZ);p.stride+=moved;const len=p.sprinting?2.45:1.8;if(p.stride>=len){p.stride-=len;this._emit(ev,{type:'step',sprint:p.sprinting,position:[p.x,p.y,p.z]});}}
 }
 // ---------- the sky palm ----------
 takeOff(ev=[]){
  if(this.state!=='running')return false;
  if(this.driving)this._exit(this.driving,ev);
  const p=this.player,again=!!this.flight;
  this.flight={start:this.time,until:this.time+PALM.time,state:again?this.flight.state==='down'?'up':this.flight.state:'up',nextStrike:this.time+(again?0:.45),strikes:again?this.flight.strikes:0,kills:again?this.flight.kills:0};
  Object.assign(p,{onGround:false,vy:0,sliding:false,sprinting:false,ads:false});this.spin=0;
  this._emit(ev,{type:'palmStart',duration:PALM.time,height:PALM.height,again});return true;
 }
 // in the air: free over the valley and its open hillsides, held `height` above whatever is underneath
 _fly(dt,ev){
  const p=this.player,i=this.input,g=this.world.ground,F=this.flight;
  p.yaw=Number.isFinite(i.yaw)?i.yaw:p.yaw;
  const fx=-Math.sin(p.yaw),fz=-Math.cos(p.yaw),rx=Math.cos(p.yaw),rz=-Math.sin(p.yaw);
  const mf=(i.forward?1:0)-(i.back?1:0),ms=(i.right?1:0)-(i.left?1:0);
  let wx=fx*mf+rx*ms,wz=fz*mf+rz*ms;const wl=Math.hypot(wx,wz);if(wl>EPS){wx/=wl;wz/=wl;}
  const top=wl<EPS?0:PALM.speed*(F.state==='down'?.55:1),dx=wx*top-p.vx,dz=wz*top-p.vz,dl=Math.hypot(dx,dz),acc=PALM.accel*dt;
  if(dl<=acc){p.vx=wx*top;p.vz=wz*top;}else{p.vx+=dx/dl*acc;p.vz+=dz/dl*acc;}
  i.jump=false;p.ads=false;p.sprinting=false;p.sliding=false;
  let nx=p.x+p.vx*dt,nz=p.z+p.vz*dt;
  for(const c of this._columns(p)){const ox=nx-c.x,oz=nz-c.z,d=Math.hypot(ox,oz);if(d<c.R&&d>EPS){nx=c.x+ox/d*c.R;nz=c.z+oz/d*c.R;}}
  const S=clamp(zToS(nz),LEVEL.minS,LEVEL.endS);nz=sToZ(S);
  const hw=this._reach(S,nx<0?-1:1);if(Math.abs(nx)>hw){nx=Math.sign(nx)*hw;p.vx*=.3;}
  p.x=nx;p.z=nz;
  const ground=g(p.x,p.z);
  if(F.state!=='down'&&this.time+EPS>=F.until){F.state='down';this._emit(ev,{type:'palmEnd',strikes:F.strikes,kills:F.kills});}
  if(F.state==='down'){
   p.vy=-PALM.sink;p.y=Math.max(ground,p.y-PALM.sink*dt);
   if(p.y<=ground+EPS){
    p.y=ground;p.vy=0;p.onGround=true;this.flight=null;
    this._emit(ev,{type:'palmLand',position:[p.x,p.y,p.z]});
    this._explode([p.x,p.y+.5,p.z],{radius:PALM.land.radius,damage:PALM.land.damage,source:'palmLand',big:true,knock:PALM.land.knock},ev);
   }
   return;
  }
  const d=ground+PALM.height-p.y,v=clamp(d*3,-PALM.sink,PALM.rise);
  p.vy=v;p.y=Math.max(ground+1.5,p.y+v*dt);p.onGround=false;
  if(F.state==='up'&&Math.abs(d)<.8)F.state='hover';
 }
 // the ground under the crosshair, kept inside the strike's range and the valley; yaw: the way the fingers point
 palmAim(target){
  const p=this.player;let dx=target[0]-p.x,dz=target[2]-p.z;const d=Math.hypot(dx,dz);
  if(d>PALM.range){dx*=PALM.range/d;dz*=PALM.range/d;}
  const S=clamp(zToS(p.z+dz),LEVEL.minS,LEVEL.endS+60),z=sToZ(S);let x=p.x+dx;
  const hw=this.world.halfWidth(Math.min(S,LEVEL.endS),x<0?-1:1)+this.roam+3;x=clamp(x,-hw,hw);
  return {x,z,y:this.world.ground(x,z),yaw:d>.5?Math.atan2(-dx,-dz):p.yaw};
 }
 _palmCall(target){
  const F=this.flight,p=this.player;
  if(F.state==='down'||this.time+EPS<F.nextStrike)return null;
  const s={id:++this._mid,...this.palmAim(target),at:this.time+PALM.delay,calledAt:this.time};
  this.palms.push(s);F.strikes++;F.nextStrike=this.time+PALM.cooldown;
  this._emit([], {type:'palmCall',palmId:s.id,target:[s.x,s.y,s.z],yaw:s.yaw,impactAt:s.at,delay:PALM.delay,radius:PALM.radius});
  return {weapon:'palm',shots:[],palm:{...s}};
 }
 // the hand comes straight down: whatever flies inside its column is struck as well as what stands under it
 _palmImpact(s,ev){
  const R=PALM.radius,pos=[s.x,s.y+.5,s.z],pad=e=>e.type==='boss'?3.6:0,flat=e=>Math.max(0,Math.hypot(e.x-s.x,e.z-s.z)-pad(e));
  const above=this.enemies.filter(e=>e.hp>0&&!e.gone&&e.type!=='logo'&&flat(e)<=R&&Math.max(0,dist3(pos,[e.x,e.y,e.z])-pad(e))>R+.6*e.scale);
  const alive=this.enemies.filter(e=>e.hp>0&&!e.gone),k0=this.crowdKills;
  this._emit(ev,{type:'palmImpact',palmId:s.id,position:[s.x,s.y,s.z],yaw:s.yaw,radius:R});
  this._explode(pos,{radius:R,damage:PALM.damage,source:'palm',big:true,huge:true,knock:PALM.knock},ev);
  for(const e of above)if(e.hp>0)this._damageEnemy(e,PALM.damage*(1-clamp(flat(e)/R,0,1)*.6)*(e.type==='boss'?ENEMIES.boss.blastMul.palm:1),{point:[e.x,e.y+.4*e.scale,e.z],direction:[0,-1,0],weapon:'palm',cause:'explosion'},ev);
  if(this.flight)this.flight.kills+=this.crowdKills-k0+alive.filter(e=>e.hp<=0).length;
 }
 // walkable half width at S: the valley floor plus the open strip of hillside
 _reach(S,side){return this.world.halfWidth(S,side)+this.roam;}
 // perch: the overlook the player stands on, above the crowd (the soldiers then come round by the ramp);
 // high: the one whose shelf has been reached and not yet left (score and missile charge count for more)
 _perch(ev){
  const p=this.player,K=OVERLOOK,side=p.x<0?-1:1,S=this.S,o=this.driving||this.flight?null:overlookAt(this.overlooks,S,side);let on=null,top=false;
  if(o){const u=S-o.S,lift=overlookLift(o,u),e=Math.abs(p.x)-this.world.halfWidth(S,side);if(e>K.inner-.4&&lift>=K.perch&&p.y>=K.foot+lift-1){on=o;top=lift>=o.rise-.4;}}
  this.perch=on;
  if(on&&top&&this.high!==on.id){
   if(this.high)this._emit(ev,{type:'overlook',state:'leave',overlook:this.high,kills:this.highKills,held:this.time-this.highSince});
   this.high=on.id;this.highSince=this.time;this.highKills=0;this._emit(ev,{type:'overlook',state:'enter',overlook:on.id,name:on.name,side:on.side,rise:on.rise});
  }else if(!on&&this.high){this._emit(ev,{type:'overlook',state:'leave',overlook:this.high,kills:this.highKills,held:this.time-this.highSince});this.high=null;}
 }
 // where a soldier below the perched player runs to: the run-in of the ramp, then up the middle of it
 _perchWay(o,m){
  const K=OVERLOOK,side=o.side,S=zToS(m.z),u=S-o.S,mid=K.inner+o.width*.5;
  const on=m.x*side>0&&u>=-K.lead&&u<=o.ramp+o.shelf&&Math.abs(m.x)-this.world.halfWidth(S,side)>K.inner-.5&&m.y>=K.foot+overlookLift(o,u)-1.1;
  // on the cut: up the middle of it. In front of the run-in: onto it. Anywhere else: along the floor to the run-in, clear of the face.
  const [tu,te]=on?[Math.min(u+5,o.ramp+2),mid]:m.x*side>0&&u>-K.lead+.5&&u<-1?[-1.5,mid]:[-K.lead*.6,-1.3],tS=o.S+tu;
  return [side*(this.world.halfWidth(tS,side)+te),sToZ(tS)];
 }
 _triggers(ev){
  const S=this.S;
  // an overlook ahead: its arsenal comes down on the shelf, so the smoke marks the way up
  for(const o of this.overlooks){
   const key='overlook:'+o.id;if(this.triggered.has(key)||S<o.S-OVERLOOK.call||S>o.S+o.ramp+o.shelf)continue;this.triggered.add(key);
   const Sc=o.S+o.ramp+o.shelf*.42,x=o.side*(this.world.halfWidth(Sc,o.side)+OVERLOOK.inner+(o.deep-OVERLOOK.inner)*.62);
   this.dropSupply({S:Sc,x,loot:'perch'},ev);this._emit(ev,{type:'overlookAhead',overlook:o.id,name:o.name,side:o.side,S:o.S});
  }
  for(const cp of LEVEL.checkpoints)if(S>=cp&&cp>this.checkpoint){this.checkpoint=cp;this._emit(ev,{type:'checkpoint',S:cp,section:sectionIndex(cp)});}
  for(const e of ENCOUNTERS){
   if(this.triggered.has(e.id)||S<e.at)continue;this.triggered.add(e.id);
   this._emit(ev,{type:'encounter',encounter:e.id,banner:e.banner??null,crowd:e.crowd?.count??0});
   if(e.spawns)for(const s of e.spawns){if(s.delay)this.pending.push({at:this.time+s.delay,spec:s});else this._spawn(s,ev);}
   if(e.crowd)this.streams.push(this._stream(e.crowd));
   if(e.airdrop)this.dropSupply(e.airdrop,ev);
   if(e.logo)this._spawn({type:'logo',S:e.at+30,x:-11},ev);
   if(e.hold){this.hold={start:this.time,fired:new Set()};this._emit(ev,{type:'hold',duration:LEVEL.holdTime});}
  }
 }
 // ---------- flying enemies ----------
 _spawn(spec,ev){
  const T=ENEMIES[spec.type];if(!T)throw Error('Unknown enemy '+spec.type);
  const z=sToZ(spec.S),x=spec.x??0,g=this.world.ground(x,z),r=this.rand;
  const e={id:++this._eid,type:spec.type,x,z,y:g+(spec.type==='logo'?T.alt[0]:9),dropY:g+(spec.type==='logo'?T.alt[0]:9),hp:T.hp,maxHP:T.hp,scale:T.scale,
   state:'spawning',spawnedAt:this.time,spawnDuration:spec.type==='logo'?.01:1.1,attackProgress:0,hitAt:-99,lastAttackAt:-99,stunUntil:0,
   nextAttackAt:this.time+1.6+r()*1.4,windupAt:0,lock:null,burst:0,vx:0,vz:0,
   angle:Math.atan2(z-this.player.z,x-this.player.x),orbit:(r()<.5?-1:1)*(.18+r()*.2),standoff:T.standoff[0]+r()*(T.standoff[1]-T.standoff[0]),alt:T.alt[0]+r()*(T.alt[1]-T.alt[0]),
   previous:[x,g+9,z],face:[this.player.x,this.player.z],beam:false,lane:0,wave:1,gone:false,origin:[x,z]};
  if(spec.type==='boss')Object.assign(e,{y:g+46,dropY:g+46,spawnDuration:.01,previous:[x,g+46,z],ai:{mode:'arrive',at:this.time,until:0,dur:0,n:0,phase:1,flip:false,lock:null,hit:false},beamAt:null});
  this.enemies.push(e);
  if(spec.type==='logo')this.logoState='active';
  this._emit(ev,{type:'spawn',enemyId:e.id,enemyType:e.type,position:[e.x,e.y,e.z]});
  return e;
 }
 _los(a,b){
  if(traceScenery(a,b,this.world.boxes()))return false;
  const g=this.world.ground;
  for(let i=1;i<10;i++){const p=lerp3(a,b,i/10);if(p[1]<g(p[0],p[2])+.05)return false;}
  return true;
 }
 _updateEnemy(e,dt,ev){
  e.previous=[e.x,e.y,e.z];
  const T=ENEMIES[e.type],p=this.player,g=this.world.ground;
  e.face=[p.x,p.z];
  if(e.type==='logo')return this._updateLogo(e,dt,ev);
  if(e.type==='boss')return this._updateBoss(e,dt,ev);
  const age=this.time-e.spawnedAt,bob=Math.sin(this.time*1.7+e.id*1.3)*.18;
  const base=Math.max(g(e.x,e.z),g(p.x,p.z)-.6),wantY=base+e.alt+bob;
  if(age<e.spawnDuration){const f=age/e.spawnDuration;e.y=e.dropY+(wantY-e.dropY)*(1-(1-f)**3);e.state='spawning';return;}
  e.angle+=e.orbit*dt;
  let tx=p.x+Math.cos(e.angle)*e.standoff,tz=p.z+Math.sin(e.angle)*e.standoff;
  const hw=this.world.halfWidth(clamp(zToS(tz),0,LEVEL.endS),tx<0?-1:1)+3.5;tx=clamp(tx,-hw,hw);
  let ax=tx-e.x,az=tz-e.z;const d=Math.hypot(ax,az),want=d>.3?Math.min(T.speed,d*1.1):0;
  let dvx=d>EPS?ax/d*want:0,dvz=d>EPS?az/d*want:0;
  for(const o of this.enemies){if(o===e||o.hp<=0||!SWARM(o))continue;const sx=e.x-o.x,sz=e.z-o.z,sd=Math.hypot(sx,sz),r=2.6*(e.scale+o.scale)/2;if(sd<r&&sd>EPS){dvx+=sx/sd*(r-sd)*2.2;dvz+=sz/sd*(r-sd)*2.2;}}
  const stunned=this.time<e.stunUntil,k=Math.min(1,dt*(stunned?1:2.6));
  e.vx+=(dvx-e.vx)*k;e.vz+=(dvz-e.vz)*k;e.x+=e.vx*dt;e.z+=e.vz*dt;
  e.y+=(Math.max(wantY,g(e.x,e.z)+1.2)-e.y)*Math.min(1,dt*2.4);
  if(stunned){e.state='stunned';e.attackProgress=0;return;}
  const chest=this.chest(),here=[e.x,e.y,e.z],dist=dist3(here,chest);
  if(e.state==='windup'){
   const k=(this.time-e.windupAt)/T.windup;e.attackProgress=clamp(k,0,1);
   if(!e.lock&&k>=T.lockAt)e.lock=chest.slice();
   if(k>=1)this._enemyFire(e,T,ev);
   return;
  }
  if(e.state==='attacking'&&this.time-e.lastAttackAt<.18)return;
  e.state='moving';e.attackProgress=0;
  if(e.burst>0&&this.time>=e.nextAttackAt){e.burst--;e.lock=chest.slice();this._enemyFire(e,T,ev,true);return;}
  if(this.time<e.nextAttackAt||this.state!=='running')return;
  const winding=this.enemies.filter(o=>o.state==='windup'&&SWARM(o)).length;
  if(winding<2&&dist<T.range&&this._los(here,chest)){e.state='windup';e.windupAt=this.time;e.lock=null;e.attackProgress=0;this._emit(ev,{type:'windup',enemyId:e.id,enemyType:e.type,position:here});}
  else e.nextAttackAt=this.time+.35+this.rand()*.4;
 }
 _enemyFire(e,T,ev,follow=false){
  const from=[e.x,e.y-.08*e.scale,e.z],chest=this.chest(),lock=e.lock??chest;
  const clear=this._los(from,chest),hit=this.state==='running'&&clear&&dist3(chest,lock)<T.lockTolerance;
  let to=hit?chest:lock;
  if(!hit){const b=traceScenery(from,lock.map((v,i)=>v+(lock[i]-from[i])*.6),this.world.boxes());if(b)to=b.position;}
  e.lastAttackAt=this.time;e.state='attacking';e.attackProgress=0;e.lock=null;
  if(!follow){e.burst=T.shots-1;}
  e.nextAttackAt=this.time+(e.burst>0?.28:T.cooldown[0]+this.rand()*(T.cooldown[1]-T.cooldown[0]));
  this._emit(ev,{type:'enemyFire',enemyId:e.id,enemyType:e.type,from,to,hit,damage:hit?T.damage:0});
  if(hit)this._hurt(T.damage,from,ev,'beam');
 }
 _updateLogo(e,dt,ev){
  const T=ENEMIES.logo,u=this.time-e.spawnedAt,p=this.player,g=this.world.ground;
  e.state='moving';e.attackProgress=0;
  if(u>T.life){e.y+=dt*9;e.z-=dt*14;if(u>T.life+3){e.gone=true;this.logoState='escaped';this._emit(ev,{type:'logoEscaped',enemyId:e.id});}return;}
  const cz=Math.min(p.z,e.origin[1]+8)-24,cx=0;
  // weave inside the open valley: beyond the edge the slope forest's crowns would swallow the shots
  const S=zToS(cz),lane=Math.max(3,Math.min(this.world.halfWidth(S,-1),this.world.halfWidth(S,1))-2.2);
  const tx=cx+Math.sin(u*.42)*lane,tz=cz+Math.sin(u*.84)*7,ty=g(cx,cz)+10.5+Math.sin(u*1.3)*1.4;
  const k=Math.min(1,dt*1.6);e.vx+=(clamp((tx-e.x)*1.4,-T.speed,T.speed)-e.vx)*k;e.vz+=(clamp((tz-e.z)*1.4,-T.speed,T.speed)-e.vz)*k;
  e.x+=e.vx*dt;e.z+=e.vz*dt;e.y+=(ty-e.y)*Math.min(1,dt*1.5);
  e.face=[e.x+e.vx,e.z+e.vz];
 }
 _damageEnemy(e,amount,{point,direction,projectileId=null,weapon=null,cause='bullet',core=false},ev){
  if(e.hp<=0||e.gone)return;
  const T=ENEMIES[e.type];e.hp=Math.max(0,e.hp-amount);e.hitAt=this.time;if(cause==='bullet')this.hits++;this.score+=10;
  const center=[e.x,e.y,e.z],outward=sub(point,center),n=len3(outward);
  const base={enemyId:e.id,enemyType:e.type,core,projectileId,position:point.slice(),enemyPosition:center,direction:direction.slice(),normal:n>EPS?outward.map(v=>v/n):direction.map(v=>-v),hp:e.hp,maxHP:e.maxHP,lane:0,weapon,cause,damage:amount};
  this._emit(ev,{type:'hit',...base});
  if(e.hp<=0){this.kills++;this.score+=T.score;this._emit(ev,{type:'kill',...base,score:T.score});this._comboKill(ev);this._addCharge(T.charge??0,ev);if(e.type==='logo')this._logoDown(e,ev);if(e.type==='boss')this._bossDown(e,ev);return;}
  if(e.state==='windup'){e.state='moving';e.attackProgress=0;e.lock=null;e.nextAttackAt=this.time+.8+this.rand()*.6;this._emit(ev,{type:'interrupt',enemyId:e.id});}
  e.stunUntil=this.time+T.stun;e.vx+=direction[0]*T.knock;e.vz+=direction[2]*T.knock;
 }
 _hurt(amount,from,ev,cause){
  const p=this.player;if(this.state!=='running')return;
  if(this.driving)return this._vehicleDamage(this.driving,amount*VEHICLE.armor,ev,cause,from);
  if(this.flight)amount*=PALM.guard;
  p.lastHurt=this.time;if(this.godMode)amount=0;
  p.hp=Math.max(0,p.hp-amount);this._emit(ev,{type:'playerHit',damage:amount,from:from.slice(),hp:p.hp,cause});
  if(p.hp<=0){this.state='down';this.deaths++;this.reloadAt=null;this.spin=0;this._emit(ev,{type:'down',checkpoint:this.checkpoint});}
 }
 // ---------- the crowd ----------
 _stream(spec){return {left:spec.count,rate:spec.rate,acc:0,dS:spec.dS,mix:spec.mix??{},at:this.time+(spec.delay??0),x:spec.x??null};}
 _runStreams(dt,ev){
  if(!this.streams.length)return;
  for(const s of this.streams){
   if(this.time<s.at||s.left<=0)continue;
   s.acc+=s.rate*dt;
   while(s.acc>=1&&s.left>0&&this.crowd.length<LEVEL.crowdCap){
    s.acc-=1;s.left--;const r=this.rand(),mix=s.mix,kind=r<(mix.brute??0)?'brute':r<(mix.brute??0)+(mix.bomber??0)?'bomber':'trooper';
    let S=this.S+s.dS[0]+this.rand()*(s.dS[1]-s.dS[0]);S=clamp(S,LEVEL.minS+2,LEVEL.endS);
    if(Math.abs(S-this.S)<12)S=clamp(this.S-(14+this.rand()*16)*Math.sign(s.dS[0]||1),LEVEL.minS+2,LEVEL.endS);
    const side=this.rand()<.5?-1:1,hw=Math.max(1.5,this.world.halfWidth(S,side)-1.2),x=s.x??side*this.rand()*hw;
    this._spawnMinion(kind,S,x,ev,true);
   }
   if(this.crowd.length>=LEVEL.crowdCap)s.acc=Math.min(s.acc,1);
  }
  this.streams=this.streams.filter(s=>s.left>0);
 }
 _spawnMinion(kind,S,x,ev,rise=true){
  const K=CROWD[kind];if(!K)throw Error('Unknown soldier '+kind);
  const r=this.rand,p=this.player,scale=K.scale*(.94+r()*.12);let z=sToZ(S);
  for(const b of this.world.boxes())if(b.solid){const q=pushOut(x,z,b,.3*scale+.15);if(q){x=q[0];z=q[1];}}
  const g=this.world.ground(x,z);
  const m={id:++this._cid,kind,x,z,y:rise?g-1.7*scale:g,ground:g,vx:0,vz:0,kx:0,kz:0,hp:K.hp,maxHP:K.hp,scale,speed:K.speed[0]+r()*(K.speed[1]-K.speed[0]),
   state:rise?'rise':'run',bornAt:this.time,riseDur:.55+r()*.35,yaw:Math.atan2(p.x-x,p.z-z),phase:r()*6,hitAt:-99,nextAttack:this.time+.6+r()*.8,attackAt:0,staggerUntil:0,dead:false};
  this.crowd.push(m);
  this._emit(ev,{type:'crowdSpawn',crowdId:m.id,kind,position:[x,g,z],rise});
  return m;
 }
 _updateCrowd(dt,ev){
  const list=this.crowd;if(!list.length)return;
  const p=this.player,g=this.world.ground,grid=this.grid,running=this.state==='running',decay=Math.exp(-5*dt),turn=Math.min(1,dt*7);
  const perch=running?this.perch:null;
  const solids=this.world.boxes().filter(b=>b.solid&&!this.spent.has(b.id)),hulls=this.vehicles.filter(v=>v!==this.driving).flatMap(v=>this._hull(v)),reachMore=this.driving?1.7:0;
  grid.clear();
  for(const m of list){if(m.dead)continue;const k=cellKey(Math.floor(m.x/CELL),Math.floor(m.z/CELL));let c=grid.get(k);if(!c){c=[];grid.set(k,c);}c.push(m);}
  let attackers=0;for(const m of list)if(!m.dead&&m.state==='attack')attackers++;
  // steer straight at the player; shoves from hits decay on their own
  for(const m of list){
   if(m.dead)continue;const K=CROWD[m.kind];
   if(m.state==='rise'){const u=clamp((this.time-m.bornAt)/m.riseDur,0,1);m.ground=g(m.x,m.z);m.y=m.ground-1.7*m.scale*(1-u)**2;if(u>=1){m.state='run';m.y=m.ground;}continue;}
   if(m.state==='stagger'&&this.time>=m.staggerUntil)m.state='run';
   let dx=p.x-m.x,dz=p.z-m.z,d=Math.hypot(dx,dz)||EPS;
   // the player holds an overlook: a soldier below cannot climb its face and comes round by the ramp
   const below=perch&&p.y-m.y>1.3;
   if(below){const w=this._perchWay(perch,m);dx=w[0]-m.x;dz=w[1]-m.z;d=Math.hypot(dx,dz)||EPS;}
   const want=running&&m.state==='run'&&(below||d>K.reach*.8+reachMore)?m.speed:0;
   m.vx+=(dx/d*want-m.vx)*turn;m.vz+=(dz/d*want-m.vz)*turn;
   m.ox=m.x;m.oz=m.z;
   m.x+=(m.vx+m.kx)*dt;m.z+=(m.vz+m.kz)*dt;m.kx*=decay;m.kz*=decay;
   m.phase+=Math.hypot(m.vx,m.vz)*dt;m.yaw=Math.atan2(dx,dz);
  }
  // spacing: positional relaxation against neighbours in the grid, then the player's body and the valley walls
  for(const m of list){
   if(m.dead||m.state==='rise')continue;
   const ci=Math.floor(m.x/CELL),cj=Math.floor(m.z/CELL),wm=CROWD[m.kind].mass;
   for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const c=grid.get(cellKey(ci+i,cj+j));if(!c)continue;
    for(const o of c){if(o.id<=m.id||o.dead||o.state==='rise')continue;const sx=m.x-o.x,sz=m.z-o.z,sd=Math.hypot(sx,sz),R=.36*(m.scale+o.scale);if(sd>=R)continue;
     const nx=sd>EPS?sx/sd:1,nz=sd>EPS?sz/sd:0,wo=CROWD[o.kind].mass,push=(R-sd),km=wo/(wm+wo),ko=wm/(wm+wo);
     m.x+=nx*push*km;m.z+=nz*push*km;o.x-=nx*push*ko;o.z-=nz*push*ko;}}
   const px=m.x-p.x,pz=m.z-p.z,pd=Math.hypot(px,pz),PR=LEVEL.radius+.32*m.scale+.42+.9*Math.max(0,m.scale-1);/* arm's length: a helmet never fills the lens */
   if(pd<PR&&!this.driving&&Math.abs(p.y-m.y)<1.9){m.x=p.x+(pd>EPS?px/pd:1)*PR;m.z=p.z+(pd>EPS?pz/pd:0)*PR;}
   for(const k of hulls){const ox=m.x-k[0],oz=m.z-k[1],d=Math.hypot(ox,oz),R=k[2]+.3*m.scale;if(d<R&&d>EPS){m.x=k[0]+ox/d*R;m.z=k[1]+oz/d*R;}}
   // solid props: out through the nearest face, then along it toward whichever end leads round to the player
   for(const b of solids){
    if(m.y>b.max[1]-.3)continue;const q=pushOut(m.x,m.z,b,.3*m.scale);if(!q)continue;
    const slide=m.speed*.85*dt;
    if(q[2]===0){const inside=p.z>b.min[2]&&p.z<b.max[2],s=inside?(m.z>(b.min[2]+b.max[2])/2?1:-1):Math.sign(p.z-m.z)||1;q[1]+=s*slide;}
    else{const inside=p.x>b.min[0]&&p.x<b.max[0],s=inside?(m.x>(b.min[0]+b.max[0])/2?1:-1):Math.sign(p.x-m.x)||1;q[0]+=s*slide;}
    m.x=q[0];m.z=q[1];
   }
   const S=clamp(zToS(m.z),LEVEL.minS,LEVEL.endS),fw=this.world.halfWidth(S,m.x<0?-1:1),hw=fw+Math.max(.6,this.roam-.3);if(Math.abs(m.x)>hw)m.x=Math.sign(m.x)*hw;
   let gy=g(m.x,m.z);
   // steep ground is a wall for the soldiers too. It is the ground's own steepness that counts, not the grade along the
   // step: nobody gains height by working sideways across a face. One who runs into it follows its foot the way he was heading.
   if(this.steep&&m.ox!==undefined&&gy>m.y+.004&&Math.abs(m.x)>fw-.4){
    const e=.3,tilt=(x,z,h)=>Math.hypot(g(x+e,z)-h,g(x,z+e)-h)/e;
    if(tilt(m.x,m.z,gy)>LEVEL.crowdSlope){
     const h0=g(m.ox,m.oz),gx=g(m.ox+e,m.oz)-h0,gz=g(m.ox,m.oz+e)-h0,gl=Math.hypot(gx,gz)||1;
     let cx=-gz/gl,cz=gx/gl;if(cx*m.vx+cz*m.vz<0){cx=-cx;cz=-cz;}
     const step=Math.min(Math.hypot(m.x-m.ox,m.z-m.oz),m.speed*dt),sx=m.ox+cx*step,sz=m.oz+cz*step,sg=g(sx,sz);
     if(sg<=m.y+.004||tilt(sx,sz,sg)<=LEVEL.crowdSlope){m.x=sx;m.z=sz;gy=sg;}else{m.x=m.ox;m.z=m.oz;gy=h0;}
    }
   }
   // pushed off an edge, a soldier falls instead of appearing at the bottom
   m.ground=gy;m.y=m.y>gy+.5?Math.max(gy,m.y-16*dt):gy;
  }
  if(!running)return;
  // close-range threat: a few at a time swing at the player; a bomber that reaches the player detonates
  for(const m of list){
   if(m.dead||m.state==='rise'||m.state==='stagger')continue;const K=CROWD[m.kind];
   const d=Math.abs(p.y-m.y)<1.9?Math.hypot(p.x-m.x,p.z-m.z):1e9;
   if(m.state==='attack'){
    if(this.time-m.attackAt<K.windup)continue;
    if(m.kind==='bomber'){this._crowdDie(m,{cause:'detonate',force:0},ev,{score:false});continue;}
    m.state='run';attackers--;m.nextAttack=this.time+K.cooldown*(.85+this.rand()*.3);
    const hit=d<K.reach+.5+reachMore;this._emit(ev,{type:'crowdStrike',crowdId:m.id,kind:m.kind,position:[m.x,m.y+1.1*m.scale,m.z],hit});
    if(hit)this._hurt(K.damage,[m.x,m.y+1,m.z],ev,'melee');
    continue;
   }
   if(d<K.reach+reachMore&&this.time>=m.nextAttack&&(attackers<LEVEL.maxAttackers||m.kind==='bomber')){m.state='attack';m.attackAt=this.time;attackers++;this._emit(ev,{type:'crowdWindup',crowdId:m.id,kind:m.kind,position:[m.x,m.y+1,m.z]});}
  }
 }
 _hitCrowd(m,amount,{point,direction,weapon=null,cause='bullet',head=false,knock=1},ev){
  if(m.dead)return;
  const K=CROWD[m.kind];m.hp-=amount;m.hitAt=this.time;
  if(cause==='bullet'){this.hits++;this._emit(ev,{type:'crowdHit',crowdId:m.id,kind:m.kind,position:point.slice(),direction:direction.slice(),head,weapon,hp:Math.max(0,m.hp),maxHP:m.maxHP});}
  if(m.hp<=1e-6){this._crowdDie(m,{direction,force:knock,cause,weapon,head},ev);return;}
  const shove=knock/K.mass;m.kx+=direction[0]*shove;m.kz+=direction[2]*shove;
  if(shove>.9||cause==='explosion'){m.state='stagger';m.staggerUntil=this.time+Math.min(.6,.12+shove*.04);}
 }
 _crowdDie(m,{direction=[0,1,0],force=1,cause='bullet',weapon=null,head=false}={},ev,{score=true}={}){
  if(m.dead)return;m.dead=true;m.hp=0;const K=CROWD[m.kind];
  // kills made while holding an overlook's shelf count for more
  const high=score&&this.high?OVERLOOK.bonus:1;
  if(score){this.kills++;this.crowdKills++;this.score+=Math.round((K.score+(head?10:0))*high);this._comboKill(ev);this._addCharge(K.charge*high,ev);if(this.high)this.highKills++;}
  this._emit(ev,{type:'crowdKill',crowdId:m.id,kind:m.kind,position:[m.x,m.y,m.z],yaw:m.yaw,phase:m.phase,scale:m.scale,direction:direction.slice(),force,cause,weapon,head,score:score?K.score:0});
  if(m.kind==='bomber'&&cause!=='win')this.blasts.push({at:this.time+.05+this.rand()*.07,pos:[m.x,m.y+.8,m.z],radius:K.blast,damage:K.blastDamage,source:'bomber',big:false,knock:9,playerDamage:K.damage,cause:'blast'});
 }
 _comboKill(ev){
  if(this.time-this.comboAt>LEVEL.comboWindow){this.combo=0;this.comboTier=0;}
  this.combo++;this.comboAt=this.time;this.bestCombo=Math.max(this.bestCombo,this.combo);
  let tier=this.comboTier;while(tier<COMBO_TIERS.length&&this.combo>=COMBO_TIERS[tier].n)tier++;
  if(tier>this.comboTier){this.comboTier=tier;this._emit(ev,{type:'combo',count:this.combo,tier:tier-1,label:COMBO_TIERS[tier-1].label});}
 }
 _addCharge(v,ev){
  if(!(v>0)||this.inv.missile?.mag>0)return;
  const before=this.charge;this.charge=Math.min(1,this.charge+v);
  if(before<1&&this.charge>=1){this.inv.missile={mag:1,reserve:0};this._emit(ev,{type:'missileReady'});}
 }
 _crowdTrace(a,b,skip,size=0){
  let best=null;
  const minX=Math.min(a[0],b[0])-1.3,maxX=Math.max(a[0],b[0])+1.3,minZ=Math.min(a[2],b[2])-1.3,maxZ=Math.max(a[2],b[2])+1.3;
  for(const m of this.crowd){
   if(m.dead||m.x<minX||m.x>maxX||m.z<minZ||m.z>maxZ||(skip&&skip.includes(m.id)))continue;
   for(let i=0;i<3;i++){const P=CROWD_PARTS[i],t=segSphere(a,b,m.x,m.y+P[0]*m.scale,m.z,P[1]*m.scale+size);if(t!==null&&(!best||t<best.t))best={t,minion:m,head:i===2};}
  }
  return best;
 }
 // ---------- projectiles ----------
 _terrainT(a,b){
  const g=this.world.ground,L=dist3(a,b),n=Math.max(1,Math.ceil(L/.5));
  if(a[1]<g(a[0],a[2]))return 0;
  let prev=0;
  for(let i=1;i<=n;i++){const t=i/n,q=lerp3(a,b,t);if(q[1]<g(q[0],q[2])){let lo=prev,hi=t;for(let k=0;k<9;k++){const m=(lo+hi)/2,r=lerp3(a,b,m);if(r[1]<g(r[0],r[2]))hi=m;else lo=m;}return hi;}prev=t;}
  return null;
 }
 _columns(p){const out=[];for(const b of this.world.boxes()){if(!b.column||b.max[1]<p.y+LEVEL.stepUp||b.column.base>p.y+LEVEL.height)continue;const x=(b.min[0]+b.max[0])/2,z=(b.min[2]+b.max[2])/2;if(Math.abs(x-p.x)>b.column.radius+4||Math.abs(z-p.z)>b.column.radius+4)continue;out.push({x,z,R:b.column.radius+LEVEL.radius*.5});}return out;}
 groundNormal(x,z){const g=this.world.ground,e=.25;return norm([-(g(x+e,z)-g(x-e,z))/(2*e),1,-(g(x,z+e)-g(x,z-e))/(2*e)]);}
 _trace(a,b,p,boxes){
  let best=null;const take=(type,t,extra)=>{if(t!==null&&t!==undefined&&(!best||t<best.t-EPS))best={type,t,...extra};};
  const s=traceScenery(a,b,boxes,.02);if(s)take('scenery',s.t,{normal:s.normal,colliderId:s.colliderId});
  for(const e of this.enemies){if(e.hp<=0||e.gone||p.hitIds.includes(e.id))continue;const h=traceEnemy(a,b,e,TYPE_RULES[e.type],.02,e.previous);if(h)take('enemy',h.t,{enemy:e});}
  const c=this._crowdTrace(a,b,p.crowdIds,p.size??0);if(c)take('crowd',c.t,{minion:c.minion,head:c.head});
  for(const c of this.cornices){if(c.state!=='ready')continue;for(const n of c.nodes){const t=segSphere(a,b,n[0],n[1],n[2],AVALANCHE.radius);if(t!==null)take('cornice',t,{cornice:c});}}
  for(const v of this.vehicles){if(v===this.driving)continue;for(const k of this._hull(v)){const cy=v.y+1.1,t=segSphere(a,b,k[0],cy,k[1],k[2]);if(t!==null)take('scenery',t,{normal:norm(sub(lerp3(a,b,t),[k[0],cy,k[1]])),colliderId:'vehicle:'+v.id});}}
  const tg=this._terrainT(a,b);if(tg!==null)take('ground',tg,{});
  return best;
 }
 _splash(p,point,ev){this._explode(point,{radius:p.splash,damage:p.damage,source:p.weapon,selfDamage:p.selfDamage,big:p.big,knock:p.knock},ev);}
 _stepProjectiles(dt,ev){
  const boxes=this._liveBoxes(),keep=[];
  for(const p of this.projectiles){
   const dur=Math.max(0,Math.min(dt,p.life-p.age));
   p.previous=p.position.slice();
   if(p.gravity){p.velocity[1]-=p.gravity*dur;p.direction=norm(p.velocity);}
   let a=p.position,b=a.map((v,i)=>v+p.velocity[i]*dur),alive=true,guard=0;
   while(alive&&guard++<6){
    const hit=this._trace(a,b,p,boxes);
    if(!hit){p.position=b;break;}
    const point=lerp3(a,b,hit.t);
    if(hit.type==='enemy'||hit.type==='crowd'){
     if(p.splash){this._splash(p,point,ev);p.position=point;alive=false;break;}
     if(hit.type==='enemy'){const core=this._coreHit(hit.enemy,point);this._damageEnemy(hit.enemy,p.damage*(core?ENEMIES.boss.core.mul:1),{point,direction:p.direction,projectileId:p.id,weapon:p.weapon,core},ev);p.hitIds.push(hit.enemy.id);}
     else{this._hitCrowd(hit.minion,p.damage*(hit.head?p.headMul:1),{point,direction:p.direction,weapon:p.weapon,cause:'bullet',head:hit.head,knock:p.knock},ev);p.crowdIds.push(hit.minion.id);}
     if(p.pierce>0){p.pierce--;p.damage*=.75;a=point;continue;}
     p.position=point;alive=false;break;
    }
    if(hit.type==='cornice'){if(p.splash)this._splash(p,point,ev);else this._hitCornice(hit.cornice,p.damage,point,ev);p.position=point;alive=false;break;}
    const normal=hit.type==='ground'?this.groundNormal(point[0],point[2]):hit.normal.slice();
    if(hit.type==='ground'&&!p.splash){const c=this.cornices.find(c=>c.state==='ready'&&this._onSlope(c,point));if(c)this._hitCornice(c,p.damage,point,ev);}
    if(p.splash)this._splash(p,point.map((v,i)=>v+normal[i]*.15),ev);
    else{this._emit(ev,{type:hit.type,projectileId:p.id,weapon:p.weapon,position:point,normal,colliderId:hit.colliderId??null,direction:p.direction.slice()});if(hit.type==='scenery')this._hitProp(hit.colliderId,p.damage,ev,boxes);}
    p.position=point;alive=false;
   }
   p.age+=dur;p.distance=dist3(p.origin,p.position);
   if(alive&&p.age+EPS>=p.life){alive=false;if(p.splash)this._splash(p,p.position,ev);else this._emit(ev,{type:'miss',projectileId:p.id,position:p.position.slice()});}
   if(alive)keep.push(p);
  }
  this.projectiles=keep;
 }
 // selfDamage: the shooter's own blast, felt only inside 60% of the radius; playerDamage: an enemy blast over the full radius
 _explode(pos,{radius,damage,source,big=false,huge=false,selfDamage=0,playerDamage=0,knock=7,cause='blast'},ev){
  this._emit(ev,{type:'explosion',position:pos.slice(),radius,source,big,huge});
  for(const e of this.enemies){
   if(e.hp<=0||e.gone||(e.type==='logo'&&SPARES_LOGO.has(source)))continue;
   const boss=e.type==='boss';if(boss&&(source==='boss'||source==='bossWreck'))continue;
   // the dreadnought is measured from its hull, not its centre, and its armour answers to rockets and the missile
   const c=[e.x,e.y,e.z],d=Math.max(0,dist3(pos,c)-(boss?3.6:0));if(d>radius+.6*e.scale)continue;
   const dir=norm(sub(c,pos)),amount=damage*(1-clamp(d/radius,0,1)*.6)*(boss?ENEMIES.boss.blastMul[source]??1:1);if(!(amount>0))continue;
   this._damageEnemy(e,amount,{point:c.map((v,i)=>v-dir[i]*.4*e.scale),direction:dir,weapon:source,cause:'explosion'},ev);
  }
  let killed=0;
  for(const m of this.crowd){
   if(m.dead)continue;
   const c=[m.x,m.y+.9*m.scale,m.z],d=dist3(pos,c);if(d>radius+.3*m.scale)continue;
   const f=clamp(d/radius,0,1),o=sub(c,pos),h=Math.hypot(o[0],o[2])||EPS,dir=norm([o[0]/h,.55+.7*(1-f),o[2]/h]);
   this._hitCrowd(m,damage*(1-f*.6),{point:c,direction:dir,weapon:source,cause:'explosion',knock:knock*(1-f*.5)},ev);
   if(m.dead)killed++;
  }
  // fuel stores inside the blast go up a moment later: a chain down a line of drums
  for(const b of this.world.boxes()){if(!b.explosive||this.spent.has(b.id))continue;if(dist3(pos,boxCentre(b))<=radius+.8)this._hitProp(b.id,Infinity,ev,null,.1+this.rand()*.22);}
  for(const c of this.cornices)if(c.state==='ready'&&source!=='boss'&&(c.nodes.some(n=>dist3(pos,n)<=radius+AVALANCHE.radius)||this._onSlope(c,pos,radius*.5)))this._hitCornice(c,Infinity,[c.x,c.y,c.z],ev);
  const chest=this.chest(),dc=dist3(pos,chest);
  if(selfDamage>0&&dc<radius*.6)this._hurt(selfDamage*(1-dc/(radius*.6)),pos,ev,'self');
  if(playerDamage>0&&dc<radius)this._hurt(playerDamage*(1-dc/radius),pos,ev,cause);
  if(killed>=4)this._emit(ev,{type:'multiKill',count:killed,source,position:pos.slice()});
  return killed;
 }
 // a fuel store: `amount` of damage; at zero it is spent and its blast is queued
 _hitProp(id,amount,ev,boxes=null,delay=.03){
  if(id==null||this.spent.has(id))return false;
  const b=(boxes??this.world.boxes()).find(o=>o.id===id);if(!b?.explosive)return false;
  if(!(amount>0))return false;
  const X=b.explosive,hp=(this.propHP.get(id)??X.hp??3)-amount;this.propHP.set(id,hp);
  if(hp>0){this._emit(ev,{type:'propHit',colliderId:id,hp});return false;}
  this.spent.add(id);const c=boxCentre(b);
  this._emit(ev,{type:'propExplode',colliderId:id,position:c,delay});
  this.blasts.push({at:this.time+delay,pos:c,radius:X.radius??6.5,damage:X.damage??22,source:'barrel',big:true,knock:13,playerDamage:X.playerDamage??0,cause:'blast'});
  return true;
 }
 _missileImpact(m,ev){
  const W=WEAPONS.missile,g=this.world.ground;
  this._emit(ev,{type:'missileImpact',missileId:m.id,position:[m.x,m.y,m.z]});
  this._explode([m.x,m.y+.6,m.z],{radius:W.splash,damage:W.damage,source:'missile',big:true,huge:true,knock:W.knock},ev);
  // a ring of secondary blasts walks outward from the impact
  for(let i=0;i<7;i++){const a=i/7*Math.PI*2+this.rand()*.5,r=7+this.rand()*6,x=m.x+Math.cos(a)*r,z=m.z+Math.sin(a)*r;
   this.blasts.push({at:this.time+.16+i*.08,pos:[x,g(x,z)+.4,z],radius:5.5,damage:14,source:'secondary',big:true,knock:12});}
 }
 // ---------- logo reward: carpet bombing + golden supply ----------
 _logoDown(e,ev){
  this.logoState='down';this._emit(ev,{type:'logoDown',enemyId:e.id,position:[e.x,e.y,e.z]});
  this.airstrike(ev,{source:'logo'});
  const S=Math.min(LEVEL.endS-6,this.S+9);this.dropSupply({S,x:clamp(this.player.x+2.5,-5,5),loot:'gold',gold:true},ev);
 }
 airstrike(ev=[],{source='call'}={}){
  const p=this.player,targets=this.enemies.filter(e=>e.hp>0&&SWARM(e)),crowd=this.crowd.filter(m=>!m.dead&&Math.abs(m.z-p.z)<90);
  let cx=p.x,cz=p.z-20;
  // the carpet runs down the valley through the crowd (led a little toward the player, who they are running at)
  if(crowd.length){cx=crowd.reduce((s,m)=>s+m.x,0)/crowd.length;cz=crowd.reduce((s,m)=>s+m.z,0)/crowd.length;cz+=(p.z-cz)*.2;}
  else if(targets.length){cx=targets.reduce((s,e)=>s+e.x,0)/targets.length;cz=targets.reduce((s,e)=>s+e.z,0)/targets.length;}
  const start=this.time+1.9,bombs=[],n=crowd.length?22:16;
  for(let i=0;i<n;i++){const z=cz+(n*1.55)-i*3.1,x=clamp(cx+(i%2?1:-1)*(1.5+this.rand()*4.5),-12,12);bombs.push({x,z,at:start+i*.1});}
  // bombs aimed at a flying enemy follow it until they land, so the strike reliably clears the air
  targets.forEach((e,i)=>bombs.push({x:e.x,z:e.z,enemyId:e.id,jx:(this.rand()-.5)*1.6,jz:(this.rand()-.5)*1.6,at:start+.25+i*.13}));
  bombs.sort((a,b)=>a.at-b.at);this.bombs.push(...bombs);this.airstrikes++;
  const from=[cx-60,70,cz+120],to=[cx+60,70,cz-160];
  this._emit(ev,{type:'airstrike',source,from,to,start,bombs:bombs.map(b=>({...b}))});
  return bombs.length;
 }
 // ---------- supply drops ----------
 dropSupply({S,x=0,loot='supply',gold=false},ev=[]){
  const z=sToZ(S),g=this.world.ground(x,z),d={id:++this._aid,x,z,y:g+58,ground:g,vy:-5.4,loot,gold:gold||loot==='gold',state:'falling',spawnedAt:this.time,landedAt:null,openedAt:null};
  this.airdrops.push(d);this._emit(ev,{type:'airdropIncoming',dropId:d.id,loot,gold:d.gold,position:[x,d.y,z]});return d;
 }
 _updateAirdrops(dt,ev){
  for(const d of this.airdrops){
   if(d.state!=='falling')continue;
   d.x+=Math.sin(this.time*.5+d.id)*.35*dt;d.ground=this.world.ground(d.x,d.z);d.y+=d.vy*dt;
   if(d.y<=d.ground){d.y=d.ground;d.state='landed';d.landedAt=this.time;this._emit(ev,{type:'airdropLanded',dropId:d.id,loot:d.loot,gold:d.gold,position:[d.x,d.y,d.z]});}
  }
 }
 // one key for everything in reach: a landed supply crate, a parked snowcat, or leaving the one being driven.
 // The key has to come up between two of them, so boarding does not run straight on into leaving.
 _interact(dt,ev){
  const p=this.player,I=this.interact;let best=null,kind=null,bd=LEVEL.interactRadius;
  if(this.driving){best=this.driving;kind='exit';}
  else{
   for(const d of this.airdrops){if(d.state!=='landed')continue;const dd=Math.hypot(d.x-p.x,d.z-p.z);if(dd<bd){bd=dd;best=d;kind='drop';}}
   for(const v of this.vehicles){if(v.state!=='parked')continue;const dd=Math.min(...this._hull(v).map(k=>Math.hypot(k[0]-p.x,k[1]-p.z)-k[2]));if(dd<Math.min(bd,VEHICLE.enterRadius)){bd=dd;best=v;kind='vehicle';}}
  }
  const key=best?kind+':'+best.id:null;
  if(I.key!==key){I.key=key;I.kind=kind;I.target=kind==='drop'?best.id:null;I.vehicle=best&&kind!=='drop'?best.id:null;I.progress=0;}
  if(!this.input.interact)I.lock=false;
  if(!best||!this.input.interact||I.lock){I.progress=Math.max(0,I.progress-dt*3);return;}
  I.progress+=dt/(kind==='drop'?LEVEL.interactTime:kind==='vehicle'?VEHICLE.enterTime:VEHICLE.exitTime);
  if(I.progress>=1){I.progress=0;I.lock=true;if(kind==='drop')this.openSupply(best,ev);else if(kind==='vehicle')this._board(best,ev);else this._exit(best,ev);}
 }
 // ---------- surge: the crowd a gold crate calls up ----------
 _surge(kind,ev=[]){
  const K=SURGE[kind];if(!K||this.state!=='running')return 0;
  const busy=this.crowd.length+this.streams.reduce((n,s)=>n+s.left,0),total=Math.min(K.count,SURGE.room-busy);
  if(total<SURGE.least)return 0;
  const room=d=>d>0?LEVEL.endS-2-this.S:this.S-LEVEL.minS-4;let sent=0;
  for(const [i,[share,[a,b],rate,delay]] of K.waves.entries()){
   const count=i===K.waves.length-1?total-sent:Math.round(total*share);if(count<=0)continue;
   let d=Math.sign(a),near=Math.abs(d>0?a:b),far=Math.abs(d>0?b:a);
   if(room(d)<near+8)d=-d;far=Math.max(near+6,Math.min(far,room(d)));
   this.streams.push(this._stream({count,dS:d>0?[near,far]:[-far,-near],rate,mix:K.mix,delay}));sent+=count;
  }
  this._emit(ev,{type:'surge',reason:kind,count:sent});return sent;
 }
 openSupply(d,ev=[]){
  if(!d||d.state!=='landed')return false;
  d.state='opened';d.openedAt=this.time;const L=LOOT[d.loot]??LOOT.supply;
  if(L.weapon){const W=WEAPONS[L.weapon],had=!!this.inv[L.weapon];if(!had)this.inv[L.weapon]={mag:W.mag,reserve:W.reserve};else this.inv[L.weapon].reserve=Math.max(this.inv[L.weapon].reserve,W.reserve);}
  if(L.arsenal)for(const id of ['minigun','rpg']){const W=WEAPONS[id];this.inv[id]={mag:W.mag,reserve:W.reserve};}
  if(L.all||!L.weapon){for(const w of Object.keys(this.inv)){if(w==='missile')continue;const W=WEAPONS[w];this.inv[w].reserve=Math.max(this.inv[w].reserve,W.reserve);}this.player.hp=LEVEL.hp;}
  if(L.charge)this._addCharge(1,ev);
  if(L.palm)this.takeOff(ev);
  if(d.gold)this._surge(L.palm?'palm':'gold',ev);
  this.score+=d.gold?300:50;
  this._emit(ev,{type:'airdropOpened',dropId:d.id,loot:d.loot,gold:d.gold,label:L.label,weapon:L.weapon??null});
  if(L.weapon&&!L.all&&this.weapon!==L.weapon)this.switchWeapon(L.weapon);
  if(L.arsenal&&this.weapon==='rifle')this.switchWeapon('minigun');
  return true;
 }
 // ---------- the snowcats ----------
 // a hull is two circles along its length: [x, z, radius]
 _hull(v){const C=VEHICLE.circle,fx=-Math.sin(v.yaw),fz=-Math.cos(v.yaw);return [[v.x+fx*C[0],v.z+fz*C[0],C[1]],[v.x-fx*C[0],v.z-fz*C[0],C[1]]];}
 _liveBoxes(){const b=this.world.boxes();return this.spent.size?b.filter(o=>!this.spent.has(o.id)):b;}
 _board(v,ev){
  if(v.state!=='parked'||this.driving)return false;
  v.state='driven';v.speed=0;this.driving=v;this.reloadAt=null;this.spin=0;
  const p=this.player;Object.assign(p,{x:v.x,z:v.z,y:v.y,vx:0,vz:0,vy:0,onGround:true,sprinting:false,ads:false});
  this._emit(ev,{type:'vehicleEnter',vehicleId:v.id,position:[v.x,v.y,v.z],hp:v.hp});return true;
 }
 // out through the left door, or the right one when a wall or a prop is in the way
 _exit(v,ev,{thrown=false}={}){
  if(this.driving!==v)return false;
  const p=this.player,rx=Math.cos(v.yaw),rz=-Math.sin(v.yaw),d=VEHICLE.half[0]+LEVEL.radius+1,boxes=this._liveBoxes();
  const free=(x,z)=>{const S=zToS(z);if(S<LEVEL.minS||S>LEVEL.endS||Math.abs(x)>this.world.halfWidth(S,x<0?-1:1)+.6)return false;return !boxes.some(b=>!b.column&&b.max[1]>this.world.ground(x,z)+LEVEL.stepUp&&x>b.min[0]-LEVEL.radius&&x<b.max[0]+LEVEL.radius&&z>b.min[2]-LEVEL.radius&&z<b.max[2]+LEVEL.radius);};
  let x=v.x-rx*d,z=v.z-rz*d;if(!free(x,z)){const x2=v.x+rx*d,z2=v.z+rz*d;if(free(x2,z2)){x=x2;z=z2;}}
  z=sToZ(clamp(zToS(z),LEVEL.minS,LEVEL.endS));
  this.driving=null;if(v.state==='driven')v.state='parked';v.speed=0;
  Object.assign(p,{x,z,y:this.world.ground(x,z),vx:0,vz:0,vy:0,onGround:true});
  this._emit(ev,{type:'vehicleExit',vehicleId:v.id,position:[v.x,v.y,v.z],thrown});return true;
 }
 _vehicleDamage(v,amount,ev,cause='hit',from=null){
  if(v.state==='wreck'||!(amount>0))return;
  if(this.godMode)amount=0;
  v.hp=Math.max(0,v.hp-amount);v.hitAt=this.time;
  if(cause!=='ram')this._emit(ev,{type:'vehicleHit',vehicleId:v.id,damage:amount,hp:v.hp,cause,from:from?from.slice():[v.x,v.y,v.z]});
  if(v.hp>0)return;
  // gone: the driver is thrown clear and the hull goes up
  if(this.driving===v)this._exit(v,ev,{thrown:true});
  v.state='wreck';v.speed=0;const X=VEHICLE.blast;
  this._emit(ev,{type:'vehicleDestroyed',vehicleId:v.id,position:[v.x,v.y,v.z]});
  this.blasts.push({at:this.time+.05,pos:[v.x,v.y+1,v.z],radius:X.radius,damage:X.damage,source:'vehicle',big:true,knock:13,playerDamage:X.playerDamage,cause:'blast'});
 }
 _drive(dt,ev){
  const v=this.driving,p=this.player,i=this.input,g=this.world.ground,V=VEHICLE;
  const thr=(i.forward?1:0)-(i.back?1:0);
  // the hull turns toward where the camera looks, faster the faster it rolls
  if(Number.isFinite(i.yaw)){const grip=clamp(Math.abs(v.speed)/4,0,1);v.yaw=wrap(v.yaw+clamp(wrap(i.yaw-v.yaw),-V.turn*dt,V.turn*dt)*grip);}
  const want=thr>0?V.forward:thr<0?-V.reverse:0,against=want*v.speed<0&&Math.abs(v.speed)>.5,rate=thr===0?V.coast:against?V.brake:V.accel;
  v.speed+=clamp(want-v.speed,-rate*dt,rate*dt);
  const fx=-Math.sin(v.yaw),fz=-Math.cos(v.yaw);let nx=v.x+fx*v.speed*dt,nz=v.z+fz*v.speed*dt,abs=Math.abs(v.speed);
  const crash=()=>{if(abs>6){this._emit(ev,{type:'vehicleCrash',vehicleId:v.id,speed:abs,position:[nx,v.y,nz]});this._vehicleDamage(v,abs*1.2,ev,'crash');}v.speed*=.15;};
  const scrape=()=>{v.speed-=v.speed*Math.min(1,dt*1.4);};
  for(const b of this.world.boxes()){
   if(this.spent.has(b.id)||this.driving!==v)continue;
   if(b.column){const cx=(b.min[0]+b.max[0])/2,cz=(b.min[2]+b.max[2])/2,R=b.column.radius*.6+V.circle[1],ox=nx-cx,oz=nz-cz,d=Math.hypot(ox,oz);if(b.max[1]<v.y+.5||d>=R||d<EPS)continue;nx=cx+ox/d*R;nz=cz+oz/d*R;if(Math.abs(ox*fx+oz*fz)/d>.72)crash();else scrape();continue;}
   // saplings, stones and low rocks go under the tracks; a prop stops it from knee height
   if(b.max[1]<v.y+(b.prop?.45:1.3)||b.min[1]>v.y+2.4)continue;
   const q=pushOut(nx,nz,b,V.circle[1]);if(!q)continue;
   if(b.explosive){this._hitProp(b.id,Infinity,ev,null,.02);continue;}
   if(BREAKABLE.has(b.prop)&&abs>V.ramMin){this.spent.add(b.id);this._emit(ev,{type:'propBreak',colliderId:b.id,prop:b.prop,position:boxCentre(b),direction:[fx*Math.sign(v.speed),0,fz*Math.sign(v.speed)],speed:abs});v.speed*=.78;this._vehicleDamage(v,4,ev,'ram');continue;}
   // a square hit stops it; a scrape along a face or a clipped corner slides off
   const R=V.circle[1],head=Math.abs(q[2]?fz:fx),k=q[2]?0:2,at=k?nz:nx,off=Math.min(at-(b.min[k]-R),(b.max[k]+R)-at);
   if(head<.5){nx=q[0];nz=q[1];scrape();}
   else if(off<1.5){const step=(at-(b.min[k]-R)<(b.max[k]+R)-at?-1:1)*Math.min(off+.02,Math.max(abs,3)*dt*1.2);nx=q[0]+(k?0:step);nz=q[1]+(k?step:0);scrape();}
   else{nx=q[0];nz=q[1];crash();}
  }
  if(this.driving!==v)return;
  for(const o of this.vehicles){if(o===v)continue;for(const k of this._hull(o)){const ox=nx-k[0],oz=nz-k[1],d=Math.hypot(ox,oz),R=k[2]+V.circle[1];if(d<R&&d>EPS){nx=k[0]+ox/d*R;nz=k[1]+oz/d*R;crash();}}}
  let S=zToS(nz);if(S<LEVEL.minS||S>LEVEL.endS){S=clamp(S,LEVEL.minS,LEVEL.endS);nz=sToZ(S);v.speed*=.5;}
  const hw=this.world.halfWidth(S,nx<0?-1:1)-.2;if(Math.abs(nx)>hw){nx=Math.sign(nx)*hw;v.speed-=v.speed*Math.min(1,dt*2.5);}
  const run=Math.hypot(nx-v.x,nz-v.z);if(run>1e-4&&(g(nx,nz)-g(v.x,v.z))/run>LEVEL.maxSlope){nx=v.x;nz=v.z;v.speed*=.2;}
  v.travel+=run;v.x=nx;v.z=nz;v.y=g(nx,nz);abs=Math.abs(v.speed);
  // ramming: whoever is under the hull at speed is thrown aside; slower than that they are only shouldered out of the way
  const sg=Math.sign(v.speed)||1,rx=-fz,rz=fx;
  for(const m of this.crowd){
   if(m.dead)continue;const dx=m.x-v.x,dz=m.z-v.z;if(Math.abs(dx)>4.5||Math.abs(dz)>4.5)continue;
   const lon=dx*fx+dz*fz,lat=dx*rx+dz*rz,r=.3*m.scale;if(Math.abs(lat)>V.half[0]+r||Math.abs(lon)>V.half[1]+r)continue;
   const K=CROWD[m.kind],side=Math.sign(lat)||1;
   if(abs>V.ramMin&&m.state!=='rise'){
    const dir=norm([fx*sg+rx*side*.55,.8,fz*sg+rz*side*.55]);
    this._hitCrowd(m,abs*1.4,{point:[m.x,m.y+1*m.scale,m.z],direction:dir,cause:'ram',knock:abs*1.15},ev);
    v.speed-=sg*Math.min(abs,K.mass*.2);this._vehicleDamage(v,K.mass*V.wear,ev,'ram');if(this.driving!==v)return;
   }
   if(!m.dead){const out=V.half[0]+r-Math.abs(lat);m.x+=rx*side*out;m.z+=rz*side*out;}
  }
  Object.assign(p,{x:v.x,z:v.z,y:v.y,vx:fx*v.speed,vz:fz*v.speed,vy:0,onGround:true,sprinting:false,ads:false});p.yaw=Number.isFinite(i.yaw)?i.yaw:p.yaw;i.jump=false;
 }
 // ---------- avalanches ----------
 // the loaded wall under a cornice: the slope on its side for its whole length. Snow shot there shakes it loose.
 _onSlope(c,pos,slack=0){
  const A=AVALANCHE,S=zToS(pos[2]);if(Math.abs(S-c.S)>c.length/2+A.along+slack)return false;
  const o=pos[0]*c.side-this.world.halfWidth(clamp(S,0,LEVEL.endS),c.side);return o>=A.band-slack&&o<=A.out+A.top+slack;
 }
 _hitCornice(c,amount,point,ev){
  if(c.state!=='ready')return false;
  c.hp-=amount;this._emit(ev,{type:'corniceHit',corniceId:c.id,position:point.slice(),hp:Math.max(0,c.hp)});
  if(c.hp>0)return false;
  const A=AVALANCHE,x0=c.x,x1=-c.side*(this.world.halfWidth(c.S,-c.side)+A.reach),start=this.time+A.delay;
  c.state='released';
  const f={id:c.id,side:c.side,S0:c.S-c.length/2,S1:c.S+c.length/2,x0,x1,start,end:start+Math.abs(x1-x0)/A.speed,buried:0,caught:false,air:[]};
  this.flows.push(f);
  this._emit(ev,{type:'avalanche',corniceId:c.id,side:c.side,S0:f.S0,S1:f.S1,x0,x1,start,end:f.end,speed:A.speed,position:[c.x,c.y,c.z],danger:this.S>f.S0&&this.S<f.S1});
  return true;
 }
 // the front of a slide runs across the valley from the cornice's side; what it passes inside its stretch is buried
 _runFlows(ev){
  const A=AVALANCHE,p=this.player,g=this.world.ground;
  for(const f of this.flows){
   if(this.time<f.start)continue;
   const front=f.x0-f.side*A.speed*(this.time-f.start),under=(x,z)=>{const S=zToS(z);return S>f.S0&&S<f.S1&&(x-front)*f.side>0&&(x-f.x1)*f.side>0;};
   for(const m of this.crowd){if(m.dead||!under(m.x,m.z))continue;this._crowdDie(m,{direction:[-f.side,.35,0],force:6,cause:'avalanche'},ev);f.buried++;}
   for(const e of this.enemies){if(e.hp<=0||e.gone||!SWARM(e)||f.air.includes(e.id)||!under(e.x,e.z)||e.y-g(e.x,e.z)>A.airHeight)continue;f.air.push(e.id);this._damageEnemy(e,A.airDamage,{point:[e.x,e.y,e.z],direction:[-f.side,0,0],weapon:'avalanche',cause:'explosion'},ev);}
   if(!f.caught&&this.state==='running'&&under(p.x,p.z)){
    f.caught=true;const from=[front+f.side*4,p.y+1,p.z];
    if(this.driving){const v=this.driving;v.speed*=.3;this._vehicleDamage(v,A.vehicleDamage,ev,'avalanche',from);}
    else{this._hurt(A.playerDamage,from,ev,'avalanche');p.vx-=f.side*11;}
   }
  }
  for(const f of this.flows)if(this.time>=f.end)this._emit(ev,{type:'avalancheEnd',corniceId:f.id,buried:f.buried,caught:f.caught});
  this.flows=this.flows.filter(f=>this.time<f.end);
 }
 // ---------- the dreadnought ----------
 _coreHit(e,point){if(e.type!=='boss')return false;const C=ENEMIES.boss.core;return dist3(point,[e.x+C.at[0],e.y+C.at[1],e.z+C.at[2]])<C.r+.25;}
 _updateBoss(e,dt,ev){
  const B=ENEMIES.boss,p=this.player,g=this.world.ground,ai=e.ai,u=this.time-e.spawnedAt;
  e.state=ai.mode;e.attackProgress=0;e.face=[p.x,p.z];
  // station: ahead of the player beyond the beacon, weaving across the valley; it sinks while its beam is out
  const S=clamp(this.S+26,LEVEL.beaconS+8,LEVEL.endS+24),low=ai.mode==='charge'||ai.mode==='beam'?1.6:0;
  const tx=Math.sin(u*.33+1)*8.5,tz=sToZ(S)+Math.sin(u*.5)*3,ty=g(0,sToZ(Math.min(S,LEVEL.endS)))+B.alt[0]+Math.sin(u*.9)*.7-low;
  const top=ai.mode==='arrive'?B.speed*4.5:B.speed,k=Math.min(1,dt*1.8);
  e.vx+=(clamp((tx-e.x)*1.3,-top,top)-e.vx)*k;e.vz+=(clamp((tz-e.z)*1.3,-top,top)-e.vz)*k;e.x+=e.vx*dt;e.z+=e.vz*dt;
  e.y+=clamp((ty-e.y)*1.6,-16,8)*dt;
  if(ai.mode==='arrive'){if(u>3.4){ai.mode='idle';ai.until=this.time+1.4;}return;}
  if(this.state!=='running'){e.beamAt=null;return;}
  const frac=e.hp/e.maxHP,phase=frac>.6?1:frac>.3?2:3;
  if(phase!==ai.phase){ai.phase=phase;this._emit(ev,{type:'bossPhase',enemyId:e.id,phase});
   // half way down a gold crate lands by the beacon: full ammunition and a charged missile for the kill
   if(phase===2)this.dropSupply({S:clamp(this.S-5,LEVEL.minS+2,LEVEL.endS-4),x:clamp(p.x+(p.x>0?-3:3),-6,6),loot:'gold',gold:true},ev);}
  const t=this.time-ai.at;
  if(ai.mode==='idle'){
   if(this.time<ai.until)return;
   let next=['mortar','beam','mortar','summon'][ai.n++%4];
   if(next==='summon'&&this.crowd.length+this.streams.reduce((n,s)=>n+s.left,0)>90)next='beam';
   ai.at=this.time;ai.hit=false;ai.lock=null;
   if(next==='mortar'){
    const M=B.mortar,n=[4,6,8][phase-1],marks=[];
    for(let i=0;i<n;i++){
     let x,z;if(i===0){x=p.x+p.vx*.9;z=p.z+p.vz*.9;}else{const a=this.rand()*Math.PI*2,r=3.5+this.rand()*8;x=p.x+Math.cos(a)*r;z=p.z+Math.sin(a)*r;}
     const Sm=clamp(zToS(z),LEVEL.minS,LEVEL.endS),hw=this.world.halfWidth(Sm,x<0?-1:1);x=clamp(x,-hw,hw);z=sToZ(Sm);
     const y=g(x,z),at=this.time+M.fuse+i*.13;marks.push({position:[x,y,z],radius:M.radius,at});
     this.blasts.push({at,pos:[x,y+.3,z],radius:M.radius,damage:0,source:'boss',big:true,knock:8,playerDamage:M.damage,cause:'blast'});
    }
    ai.mode='mortar';ai.dur=1;this._emit(ev,{type:'bossMortar',enemyId:e.id,from:[e.x,e.y,e.z],marks});
   }else if(next==='beam'){ai.mode='charge';ai.dur=phase===3?1.15:1.5;this._emit(ev,{type:'bossCharge',enemyId:e.id,duration:ai.dur});}
   else{
    const n=[22,30,40][phase-1];this.streams.push(this._stream({count:n,dS:ai.flip?[-40,-24]:[14,24],rate:12,mix:{brute:.08,bomber:.12}}));ai.flip=!ai.flip;
    ai.mode='summon';ai.dur=.9;this._emit(ev,{type:'bossSummon',enemyId:e.id,count:n});
   }
   return;
  }
  const rest=()=>{ai.mode='idle';ai.until=this.time+(phase===3?1.1:phase===2?1.6:2.1);e.beamAt=null;};
  if(ai.mode==='charge'){
   const q=t/ai.dur;e.attackProgress=clamp(q,0,1);
   // the sweep is fixed a moment before it starts: a line across where the player stood, at right angles to the gun
   if(!ai.lock&&q>=.75){const ax=p.x-e.x,az=p.z-e.z,l=Math.hypot(ax,az)||1,dx=-az/l,dz=ax/l,h=B.beam.half*(this.rand()<.5?-1:1);ai.lock={a:[p.x-dx*h,p.z-dz*h],b:[p.x+dx*h,p.z+dz*h]};}
   if(q>=1){ai.mode='beam';ai.at=this.time;ai.dur=phase===3?1.7:2.3;this._emit(ev,{type:'bossBeam',enemyId:e.id,a:ai.lock.a.slice(),b:ai.lock.b.slice(),duration:ai.dur});}
   return;
  }
  if(ai.mode==='beam'){
   const q=clamp(t/ai.dur,0,1),x=ai.lock.a[0]+(ai.lock.b[0]-ai.lock.a[0])*q,z=ai.lock.a[1]+(ai.lock.b[1]-ai.lock.a[1])*q;e.beamAt=[x,g(x,z),z];
   // on the ground under the beam it burns; a jump clears it
   if(!ai.hit&&Math.hypot(p.x-x,p.z-z)<B.beam.radius&&p.y-g(p.x,p.z)<.35){ai.hit=true;this._hurt(B.beam.damage,[e.x,e.y,e.z],ev,'beam');}
   if(q>=1)rest();
   return;
  }
  if(t>=ai.dur)rest();
 }
 // it dies in a string of blasts that ends in one large enough to clear the ground under it; the level waits for the wreck to settle (BOSS_WRECK)
 _bossDown(e,ev){
  this.bossDownAt=this.time;e.beamAt=null;this.streams=[];this.blasts=this.blasts.filter(b=>b.source!=='boss');
  this._emit(ev,{type:'bossDown',enemyId:e.id,position:[e.x,e.y,e.z]});
  for(let i=0;i<7;i++)this.blasts.push({at:this.time+.2+i*.32,pos:[e.x+(this.rand()-.5)*8,e.y+(this.rand()-.5)*3-i*.5,e.z+(this.rand()-.5)*6],radius:5,damage:0,source:'bossWreck',big:true,knock:0});
  const gy=this.world.ground(e.x,e.z);
  this.blasts.push({at:this.time+2.7,pos:[e.x,gy+1.2,e.z],radius:15,damage:60,source:'bossWreck',big:true,huge:true,knock:20});
  for(let i=0;i<3;i++)this.blasts.push({at:this.time+3.15+i*.38,pos:[e.x+(this.rand()-.5)*14,gy+1,e.z+(this.rand()-.5)*10],radius:5,damage:0,source:'bossWreck',big:true,knock:0});
 }
 // ---------- inspection ----------
 snapshot(){
  const p=this.player,w=WEAPONS[this.weapon],s=this.inv[this.weapon];
  const ahead=this.airdrops.filter(d=>d.state!=='opened').map(d=>({id:d.id,state:d.state,loot:d.loot,gold:d.gold,position:[d.x,d.y,d.z]}));
  return {state:this.state,time:this.time,S:this.S,section:this.section,sectionName:SECTION_NAMES[this.section],checkpoint:this.checkpoint,
   player:{x:p.x,y:p.y,z:p.z,vx:p.vx,vz:p.vz,vy:p.vy,yaw:p.yaw,hp:p.hp,onGround:p.onGround,sprinting:p.sprinting,ads:p.ads},
   weapon:this.weapon,weaponName:w.full,mag:s.mag,reserve:s.reserve,magSize:w.mag,owned:WEAPON_ORDER.filter(k=>this._owns(k)),reloading:this.reloading,
   reloadProgress:this.reloading?clamp((this.time-this.reloadStart)/this.reloadDuration,0,1):0,switching:this.switching,bloom:this.bloom,spin:this.spin,
   enemies:this.enemies.map(e=>({id:e.id,type:e.type,hp:e.hp,maxHP:e.maxHP,state:e.state,position:[e.x,e.y,e.z]})),
   crowd:{alive:this.crowd.length,killed:this.crowdKills,incoming:this.streams.reduce((n,s)=>n+s.left,0)},
   combo:{count:this.combo,best:this.bestCombo,tier:this.comboTier,left:this.combo?Math.max(0,LEVEL.comboWindow-(this.time-this.comboAt)):0},
   charge:this.charge,missiles:this.missiles.map(m=>({id:m.id,target:[m.x,m.y,m.z],impactIn:m.at-this.time})),
   airdrops:ahead,bombs:this.bombs.length,projectiles:this.projectiles.length,interact:{target:this.interact.target,kind:this.interact.kind,vehicle:this.interact.vehicle,progress:this.interact.progress},
   hold:this.hold?{elapsed:this.time-this.hold.start,duration:LEVEL.holdTime,boss:!!this.hold.boss}:null,logo:this.logoState,
   boss:(e=>e?{id:e.id,hp:e.hp,maxHP:e.maxHP,phase:e.ai.phase,mode:e.ai.mode,position:[e.x,e.y,e.z]}:null)(this.enemies.find(e=>e.type==='boss'&&e.hp>0)),
   driving:this.driving?.id??null,vehicles:this.vehicles.map(v=>({id:v.id,state:v.state,hp:v.hp,maxHP:VEHICLE.hp,position:[v.x,v.y,v.z],yaw:v.yaw,speed:v.speed})),
   cornices:this.cornices.map(c=>({id:c.id,state:c.state,hp:c.hp,side:c.side,S:c.S,length:c.length,position:[c.x,c.y,c.z]})),flows:this.flows.length,
   flight:this.flight?{state:this.flight.state,left:Math.max(0,this.flight.until-this.time),total:PALM.time,ready:clamp(1-(this.flight.nextStrike-this.time)/PALM.cooldown,0,1),strikes:this.flight.strikes,kills:this.flight.kills,incoming:this.palms.map(s=>({id:s.id,position:[s.x,s.y,s.z],yaw:s.yaw,at:s.at}))}:null,perch:this.perch?.id??null,high:this.high?{id:this.high,kills:this.highKills,held:this.time-this.highSince,bonus:OVERLOOK.bonus}:null,
   score:this.score,kills:this.kills,shots:this.shots,hits:this.hits,accuracy:this.shots?Math.min(1,this.hits/this.shots):0,deaths:this.deaths,airstrikes:this.airstrikes,
   distanceToBeacon:Math.max(0,LEVEL.beaconS-this.S)};
 }
 // first thing under a view ray: scenery, an enemy, a soldier or the terrain
 aim(origin,dir,max=220){
  const d=norm(dir),b=origin.map((v,i)=>v+d[i]*max),h=this._trace(origin,b,{hitIds:[],crowdIds:null},this.world.boxes());
  return h?{point:lerp3(origin,b,h.t),distance:h.t*max,type:h.type,enemyId:h.enemy?.id??null,enemyType:h.enemy?.type??null,crowdId:h.minion?.id??null,head:!!h.head}:{point:b,distance:max,type:null,enemyId:null,enemyType:null,crowdId:null,head:false};
 }
 // test/debug hooks (used by the browser checks and the debug handle)
 teleport(S,x=0){const z=sToZ(clamp(S,LEVEL.minS,LEVEL.endS)),p=this.player;Object.assign(p,{x,z,y:this.world.ground(x,z),vx:0,vz:0,vy:0,onGround:true});for(const cp of LEVEL.checkpoints)if(this.S>=cp)this.checkpoint=Math.max(this.checkpoint,cp);}
 spawnEnemy(type,S,x=0){return this._spawn({type,S,x},[]);}
 spawnMinion(kind,S,x=0,{rise=false}={}){return this._spawnMinion(kind,S,x,[],rise);}
 board(id){const v=this.vehicles.find(o=>o.id===id);if(!v)return false;if(this.driving)this._exit(this.driving,[]);return this._board(v,[]);}
 leave(){return this.driving?this._exit(this.driving,[]):false;}
 releaseCornice(id){const c=this.cornices.find(o=>o.id===id);return c?this._hitCornice(c,Infinity,[c.x,c.y,c.z],[]):false;}
 startHold(elapsed=0){if(!this.hold){this.triggered.add('hold');this.hold={start:this.time-elapsed,fired:new Set()};}else this.hold.start=this.time-elapsed;return this.hold;}
 spawnBoss(){if(!this.hold)this.startHold(LEVEL.bossAt);this.hold.boss=true;const e=this._spawn({type:'boss',S:LEVEL.endS+70,x:0},[]);return e;}
 give(id){if(id==='palm')return this.takeOff([]);const W=WEAPONS[id];if(!W)return false;if(id==='missile'){this.charge=0;this._addCharge(1,[]);return true;}this.inv[id]={mag:W.mag,reserve:W.reserve};return true;}
}
