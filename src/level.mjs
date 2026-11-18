import * as T from 'three';
import {LevelGame,LEVEL,WEAPONS,WEAPON_ORDER,ENEMIES,CROWD,COMBO_TIERS,LOOT,VEHICLE,sToZ,OVERLOOK,OVERLOOKS,overlookTerrain,overlookClear,overlookRock,PALM} from './level-core.mjs';
import {createDefenseWorldV3} from './defense-world-v3.mjs';
import {loadViewmodel} from './viewmodel.mjs';
import {WeaponFeedback} from './feedback.mjs';
import {GameSound} from './sound.mjs';
import {DefenseEffects} from './defense-effects.mjs';
import {installAlpineFog,createAlpineEnvironment,SUN_DIRECTION,SUN_COLOR,SKY_COLOR,BOUNCE_COLOR} from './snow-atmosphere-r19.mjs';
import {createSnowPost} from './snow-post-r19.mjs';
import {createLevelFX} from './level-fx.mjs';
import {loadSkyPalm} from './level-palm.mjs';
import {loadCrowdModels} from './level-crowd.mjs';
import {loadPropModels,PropField,LAYOUT} from './level-props.mjs';
import {loadWeaponModels,ARMS,barrelCollar,COLLAR_STEEL} from './level-arms.mjs';
import {ResolutionGovernor} from './level-resolution.mjs';
import {createMoodDirector,ARCS} from './level-mood.mjs';
import {createSetPieces,loadSetModels} from './level-set.mjs';
import {createComms,lineFor} from './level-comms.mjs';
import {createCine} from './level-cine.mjs';

// RealShot r23/r24 · 雪线行动 page controller: a free-roaming first-person level
// over the r19 alpine valley. Rules live in level-core.mjs; this file owns the
// renderer, camera, weapon presentation, sound, HUD and the box-glass channel.
// r24: the crowd, the rifle / minigun / rocket / 天锤 set, the combo counter,
// heavier kick and short slow-motion on the biggest hits.
// r26: time of day, generated soldiers and outposts, and three set pieces (level-set.mjs): avalanches let go by
// shooting the cornices, snowcats driven from a chase camera, and the dreadnought over the beacon.
const BUILD='snowline-level-20261117-r30';
const params=new URLSearchParams(location.search);
const $=id=>document.getElementById(id);
const clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp,damp=(a,b,k,dt)=>lerp(a,b,1-Math.exp(-k*dt));
const NOLOCK=params.get('nolock')==='1',BASE_FOV=62,SENS=.0021;
const v3=new T.Vector3(),UP=new T.Vector3(0,1,0);
// r25 look: the desktop level's own grade (other pages keep the r19 defaults). Haze is thinned and tinted toward sky
// blue so the valley keeps its depth instead of washing to white; light above the white point blooms.
const LOOK={haze:.62,hazeTint:new T.Color(.86,.92,1.0),bloom:.32,saturation:.13,curve:.24};
const qInv=new T.Quaternion();
// adaptive resolution (level-resolution.mjs); ?dpr=<ratio> fixes the ratio and ?drs=0 turns the governor off
const drs=params.get('dpr')||params.get('drs')==='0'?null:new ResolutionGovernor();

let renderer,scene,camera,weaponScene,weaponCamera,post,world,station,fx,sfx,weapon,game,attachments=null,mood=null,props=null,setp=null,runs=0;
// r27: the overlooks cut into the valley walls (?overlooks=off leaves the walls as they were)
const OV=params.get('overlooks')==='off'||params.get('roam')==='off'?[]:OVERLOOKS;
const sceneBoxes=[]; // what the rules collide with: the world's live boxes plus the outposts' (refilled every frame)
const weaponLights={};
const sound=new GameSound(),feedback=new WeaponFeedback();
// r29 · the handler's radio voice with subtitles, the opening briefing film, and letterbox bars on the big beats
let comms=null,cine=null,introSeen=false,barsUntil=-1,FILM_OUT=false;const RADIO_DELAY={spawn:1.5,win:1.1,down:.9,bossDown:1.2,hold:.8,avalanche:.3,playerHit:.2};
function bars(seconds){barsUntil=clock+seconds;document.body.dataset.bars='1';}
let spy=null;
let screen='loading',ready=false,clock=0,last=performance.now(),lastPresent=last,lastEventId=0,flashUntil=-1,wonAt=null,shownWeapon='rifle';
const keys=new Set();let fireHeld=false,fireQueued=false,queuedAt=-9,adsHeld=false,wheelAt=-9;
const look={yaw:0,pitch:-.02,recoilP:0,recoilY:0,swayX:0,swayY:0,mx:0,my:0};
const cam={bob:0,amp:0,land:0,trauma:0,ads:0,sprint:0,bobX:0,bobY:0,punch:0,drive:0,fly:0};
// the snowcat being driven (kept through the blend back to the eye), its engine voice and the run of soldiers it has gone through
const ride={last:null,kills:0,killAt:-9,engine:null};
const bossHud={lag:1,warn:'',warnUntil:-9,seen:false};
const slow={until:-1,scale:1},strike={at:-9,dur:1,hit:-9};let whiteAt=-9,whiteK=0,spinShots=0,hum=null;
const gates={};const once=(key,gap)=>{if(clock-(gates[key]??-9)<gap)return false;gates[key]=clock;return true;};
function slowMo(scale,seconds){if(clock<slow.until&&slow.scale<=scale)return;slow.scale=scale;slow.until=clock+seconds;}
const hud={hitUntil:-1,killUntil:-1,headUntil:-1,bannerUntil:-1,hurtAt:-9,surgeAt:-9,lagHP:100,dmg:[],feed:[],section:null,markers:new Map(),combo:0,tierAt:-9,tierLabel:'',taken:new Set()};
const frameTimes=[];const tmpT={};
const groundAt=(x,z)=>station.terrainAt(x,z,tmpT).h;

// ---------------- sound ----------------
let noiseBuffer=null;
function noise(){const c=sound.context;if(!noiseBuffer){const n=c.sampleRate*2,b=c.createBuffer(1,n,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;noiseBuffer=b;}return noiseBuffer;}
function noiseHit({gain=.5,dur=1,from=800,to=120,type='lowpass',q=.7,pan=0,delay=0,attack=.008}={}){
 const c=sound.context;if(!c||!sound.enabled||!sound.input)return;
 const t=c.currentTime+delay,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain(),p=c.createStereoPanner();
 s.buffer=noise();s.loop=true;f.type=type;f.Q.value=q;f.frequency.setValueAtTime(from,t);f.frequency.exponentialRampToValueAtTime(Math.max(20,to),t+dur);
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+dur);p.pan.value=clamp(pan,-1,1);
 s.connect(f).connect(g).connect(p).connect(sound.input);s.start(t,Math.random());s.stop(t+dur+.05);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();p.disconnect();};
}
function jetSound(){
 const c=sound.context;if(!c||!sound.enabled||!sound.input)return;
 const t=c.currentTime,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain(),p=c.createStereoPanner();
 s.buffer=noise();s.loop=true;f.type='bandpass';f.Q.value=.9;f.frequency.setValueAtTime(380,t);f.frequency.linearRampToValueAtTime(1500,t+1.7);f.frequency.linearRampToValueAtTime(320,t+3.8);
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.55,t+1.6);g.gain.exponentialRampToValueAtTime(.0001,t+4);p.pan.setValueAtTime(-.8,t);p.pan.linearRampToValueAtTime(.8,t+3.6);
 s.connect(f).connect(g).connect(p).connect(sound.input);s.start(t);s.stop(t+4.1);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();p.disconnect();};
}
const panOf=pos=>{if(!pos)return 0;v3.set(...pos).project(camera);return clamp(v3.x*.6,-.7,.7);};
function boom(distance,big,pan){const k=clamp(1-distance/140,.15,1);noiseHit({gain:(big?.85:.6)*k,dur:big?2.4:1.5,from:big?1500:1900,to:55,pan,delay:Math.min(.4,distance/340)});sound.thump(.3*k,pan);sound.later(.04,'wallBody',.6*k,.55,pan);}
function weaponSound(id){
 if(id==='rifle'){sound.play('shot');sound.thump(.1);}
 else if(id==='minigun'){const n=++spinShots;sound.voice('shot',.5,1.3+Math.sin(n*2.399)*.04,.04);if(n%2===0)sound.thump(.08);if(n%3===0)sound.voice('case0',.07,1.3+Math.random()*.2,.25,.02);}
 else if(id==='rpg'){noiseHit({gain:.55,dur:.9,from:2600,to:180});sound.voice('wallBody',.8,.62);sound.thump(.34);sound.later(.05,'bolt',.25,.55,.1);}
 else if(id==='missile'){sound.voice('hit0',.3,2.4);sound.later(.1,'hit0',.3,2.4);sound.later(.2,'hit0',.32,3);}
}
// the minigun's motor: a filtered saw whose pitch follows the spin
function updateHum(){
 const c=sound.context;if(!c||!sound.input)return;
 const on=sound.enabled&&screen==='play'&&game.weapon==='minigun'?game.spin:0;
 if(!hum){if(on<=0)return;const o=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain();o.type='sawtooth';f.type='bandpass';f.Q.value=2.2;g.gain.value=0;o.connect(f).connect(g).connect(sound.input);o.start();hum={o,f,g};}
 const t=c.currentTime;hum.o.frequency.setTargetAtTime(55+on*190,t,.05);hum.f.frequency.setTargetAtTime(380+on*900,t,.05);hum.g.gain.setTargetAtTime(on*.05,t,.06);
}
// the snowcat's diesel: two detuned saws under a low-pass that opens with the revs
function updateEngine(){
 const c=sound.context;if(!c||!sound.input)return;
 const v=sound.enabled&&screen==='play'?game.driving:null;
 if(!ride.engine){if(!v)return;const a=c.createOscillator(),b=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain();a.type='sawtooth';b.type='square';f.type='lowpass';f.Q.value=1.4;g.gain.value=0;a.connect(f);b.connect(f);f.connect(g).connect(sound.input);a.start();b.start();ride.engine={a,b,f,g};}
 const t=c.currentTime,k=v?Math.abs(v.speed)/VEHICLE.forward:0,E=ride.engine;
 E.a.frequency.setTargetAtTime(34+k*58,t,.08);E.b.frequency.setTargetAtTime(17.2+k*29,t,.08);E.f.frequency.setTargetAtTime(170+k*620,t,.08);E.g.gain.setTargetAtTime(v?.07+k*.06:0,t,.09);
}
// a tone that slides: the dreadnought's capacitor charging, its beam
function sweepTone({from=200,to=1200,dur=1.5,gain=.08,type='sawtooth',delay=0}={}){
 const c=sound.context;if(!c||!sound.enabled||!sound.input)return;
 const t=c.currentTime+delay,o=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(from,t);o.frequency.exponentialRampToValueAtTime(to,t+dur);f.type='lowpass';f.frequency.value=Math.max(from,to)*2.2;
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+dur*.85);g.gain.exponentialRampToValueAtTime(.0001,t+dur+.06);o.connect(f).connect(g).connect(sound.input);o.start(t);o.stop(t+dur+.1);o.onended=()=>{o.disconnect();f.disconnect();g.disconnect();};
}
// an incoming missile: a falling whistle that ends in the impact
function whistle(delay){const c=sound.context;if(!c||!sound.enabled||!sound.input)return;const t=c.currentTime+Math.max(0,delay-1.6),o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(1900,t);o.frequency.exponentialRampToValueAtTime(380,t+1.55);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.09,t+.6);g.gain.exponentialRampToValueAtTime(.0001,t+1.6);o.connect(g).connect(sound.input);o.start(t);o.stop(t+1.65);o.onended=()=>{o.disconnect();g.disconnect();};noiseHit({gain:.3,dur:1.5,from:600,to:3800,type:'bandpass',q:1.4,delay:Math.max(0,delay-1.5),attack:1.2});}

// ---------------- box glass channel ----------------
const channel='BroadcastChannel' in window?new BroadcastChannel('realshot-level-v1'):null;let glassSent=0,glassAt=-1;
function toGlass(msg){if(!channel)return;try{channel.postMessage({...msg,build:BUILD});glassSent++;}catch{}}

// ---------------- screens ----------------
function setScreen(next){
 screen=next;document.body.dataset.screen=next;if(next==='play')drs?.hold();
 for(const id of ['title','pause','down','won'])$(id).hidden=id!==next;
 $('hud').hidden=!['play','pause','down'].includes(next);
 keys.clear();fireHeld=false;fireQueued=false;adsHeld=false;
 if(next!=='play'&&next!=='cine'&&document.pointerLockElement)document.exitPointerLock?.();
 if(next==='pause'||next==='title')comms?.flush(true);if(next!=='play'){barsUntil=-1;delete document.body.dataset.bars;}
 toGlass({kind:'screen',screen:next});
}
function lock(){if(NOLOCK)return;const c=$('view');try{const r=c.requestPointerLock?.({unadjustedMovement:true});r?.catch?.(()=>{try{c.requestPointerLock?.()?.catch?.(()=>{});}catch{}});}catch{}}
// the first start of a visit plays the briefing film (any key skips); restarts go straight in
function begin(){
 if(!ready||screen==='cine')return;sound.unlock();
 if(introSeen||!cine?.ready('intro')||params.get('intro')==='0')return startGame();
 introSeen=true;comms?.reset();setScreen('cine');lock();cine.play('intro',()=>startGame());
}
function startGame(){
 if(!ready)return;comms?.reset();comms?.say('start',{delay:1.6});
 game.restart();lastEventId=0;wonAt=null;if(mood&&!params.get('arc'))mood.setArc(runs++);world.reset();props?.reset();fx.reset();sfx.reset();setp?.reset();cam.drive=0;ride.last=null;ride.kills=0;bossHud.seen=false;bossHud.lag=1;weapon.reset();feedback.reset();sound.clear();slow.until=-1;whiteK=0;strike.at=strike.hit=-9;hud.combo=0;hud.taken.clear();
 Object.assign(look,{yaw:0,pitch:-.02,recoilP:0,recoilY:0});hud.lagHP=LEVEL.hp;hud.section=null;
 for(const d of hud.dmg)d.el.remove();hud.dmg=[];for(const f of hud.feed)f.el.remove();hud.feed=[];
 applyWeaponVisual('rifle');setScreen('play');lock();sound.unlock();
 banner('雪线行动','杀穿四段山谷 · 点亮尽头的救援信标',4);toGlass({kind:'event',type:'start'});
}
function resume(){setScreen('play');lock();}
function respawn(){if(game.respawn()){setScreen('play');lock();}}

// ---------------- HUD ----------------
function banner(title,sub='',seconds=2.6,cls=''){$('banner-title').textContent=title;$('banner-sub').textContent=sub;$('banner').className='on '+cls;hud.bannerUntil=clock+seconds;}
function feedLine(html,cls=''){const el=document.createElement('div');el.className=cls;el.innerHTML=html;$('feed').prepend(el);hud.feed.push({el,at:clock});while(hud.feed.length>5){const f=hud.feed.shift();f.el.remove();}}
function damageArc(angle){const el=document.createElement('i');el.style.transform=`rotate(${angle}rad)`;$('dmg').append(el);hud.dmg.push({el,at:clock});}
const COMPASS_PX=3.4,LABELS={0:'N',45:'NE',90:'E',135:'SE',180:'S',225:'SW',270:'W',315:'NW'};
function buildCompass(){const s=$('compass-strip');for(let d=-360;d<=720;d+=15){const e=document.createElement('span'),m=((d%360)+360)%360;if(LABELS[m]){e.textContent=LABELS[m];}else if(m%45){e.className='minor';}e.style.left=d*COMPASS_PX+'px';s.append(e);}}
const heading=()=>((-(look.yaw)*180/Math.PI)%360+360)%360;
function bearingTo(x,z){const p=game.player;return Math.atan2(x-p.x,-(z-p.z))*180/Math.PI;}
function marker(key,cls,bearing){let el=hud.markers.get(key);if(!el){el=document.createElement('span');el.className='mark '+cls;$('compass').append(el);hud.markers.set(key,el);}let rel=((bearing-heading()+540)%360)-180;el.style.left=`calc(50% + ${rel*COMPASS_PX}px)`;el.style.opacity=Math.abs(rel)<75?'1':'0';el.dataset.seen='1';return el;}
const cueEls=new Map();
// r27 · a supply drop is pointed out from the moment it is called until it is opened
function dropCues(s){return s.driving?[]:s.airdrops.map(d=>({kind:'drop',id:d.id,gold:d.gold||d.loot==='perch',label:d.loot==='perch'?'军火箱':d.loot==='palm'?'天掌':d.gold?'金色补给':'空投补给',position:[d.position[0],Math.min(d.position[1],groundAt(d.position[0],d.position[2])+30)+2.6,d.position[2]]}));}
// r27 · the way up to an overlook: a cue over the foot of its ramp until the shelf is taken
function overlookAnchor(o,u,e){const S=o.S+u,x=o.side*(station.field.rowInfo(S,o.side).w+e),z=sToZ(S);return [x,groundAt(x,z),z];}
function overlookCues(s){
 if(s.driving||s.perch)return [];const out=[];
 for(const o of OV){if(s.S<o.S-40||s.S>o.S+o.ramp+o.shelf+4||hud.taken.has(o.id))continue;const a=overlookAnchor(o,1.5,OVERLOOK.inner+o.width*.5);out.push({kind:'overlook',id:o.id,position:[a[0],a[1]+2.3,a[2]]});}
 return out;
}
// what stands on an overlook: a fuel store beside the ramp (for whoever climbs it), cover on the rim, a lamp at the far end
function overlookProps(){
 const out=[];
 for(const o of OV){
  const K=OVERLOOK,at=(u,e)=>{const S=o.S+u;return [S,o.side*(station.field.rowInfo(S,o.side).w+e)];},add=(kind,u,e,yaw=0,scale=1)=>out.push([kind,...at(u,e),yaw,scale]);
  add('fuel-barrels',o.ramp*.56,K.inner+o.width-.95,o.side>0?20:-20);
  add('sandbags',o.ramp+o.shelf*.24,K.inner+1.75,0);add('sandbags',o.ramp+o.shelf*.72,K.inner+1.75,0);
  add('crates',o.ramp+o.shelf*.5,o.deep-1.3,o.side>0?-18:18);add('barrier',o.ramp+o.shelf-1.6,K.inner+4.6,o.side>0?92:-88);
  add('floodlight',o.ramp+o.shelf-2.6,o.deep-1.6,o.side>0?135:45);
 }
 return out;
}
function updateCues(s){
 const p=game.player,live=new Set(),on=screen==='play'&&setp&&s.state==='running';
 if(on)for(const c of [...setp.cues(game),...overlookCues(s),...dropCues(s)]){
  const d=Math.hypot(c.position[0]-p.x,c.position[2]-p.z);
  // a cornice is pointed out from the stretch it would bury and the approach to it; a snowcat from close by
  if(c.kind==='cornice'?(s.S<c.S-c.length/2-55||s.S>c.S+c.length/2+6||s.driving):c.kind==='overlook'?d<3:c.kind==='drop'?d>110||d<3.2:d>70||d<4)continue;
  v3.set(...c.position).project(camera);if(v3.z>1||Math.abs(v3.x)>.96||Math.abs(v3.y)>.92)continue;
  const key=c.kind+c.id;let el=cueEls.get(key);
  if(!el){el=document.createElement('div');el.className='cue '+c.kind;el.innerHTML=c.kind==='cornice'?'<i></i><b>雪檐</b><small>射击引发雪崩</small>':c.kind==='overlook'?'<i></i><b>制高点</b><small>由此上山</small>':c.kind==='drop'?`<i></i><b>${c.label}</b><small></small>`:'<i></i><b>雪地车</b><small></small>';$('cues').append(el);cueEls.set(key,el);
   if(c.kind==='cornice'&&once('cueCornice',600))feedLine('<em>提示</em><b>射击山壁上的雪檐，雪崩会埋掉下方的敌人</b>','loot');}
  if(c.kind==='vehicle'||c.kind==='drop')el.lastChild.textContent=Math.round(d)+' m';if(c.kind==='drop')el.classList.toggle('gold',!!c.gold);
  el.style.transform=`translate(${((v3.x+1)/2*innerWidth).toFixed(1)}px,${((1-v3.y)/2*innerHeight).toFixed(1)}px)`;live.add(key);
 }
 for(const [k,el] of cueEls)if(!live.has(k)){el.remove();cueEls.delete(k);}
}
function updateHUD(){
 const s=game.snapshot(),w=WEAPONS[s.weapon],p=game.player;
 $('compass-strip').style.transform=`translateX(${-heading()*COMPASS_PX}px)`;
 for(const el of hud.markers.values())el.dataset.seen='';
 const bz=sToZ(LEVEL.beaconS);marker('beacon','',bearingTo(0,bz));
 for(const d of s.airdrops)if(d.state==='landed')marker('drop'+d.id,d.gold?'drop gold':'drop',bearingTo(d.position[0],d.position[2]));
 for(const [k,el] of hud.markers)if(!el.dataset.seen){el.remove();hud.markers.delete(k);}
 const landed=s.airdrops.filter(d=>d.state==='landed'),near=landed.map(d=>({d,dist:Math.hypot(d.position[0]-p.x,d.position[2]-p.z)})).sort((a,b)=>a.dist-b.dist)[0];
 if(near&&near.dist>LEVEL.interactRadius&&near.dist<80){$('obj-label').textContent=near.d.gold?'金色补给':'空投补给';$('obj-dist').textContent=Math.round(near.dist)+' m';}
 else if(s.boss){$('obj-label').textContent='击毁母舰';$('obj-dist').textContent=Math.round(Math.hypot(s.boss.position[0]-p.x,s.boss.position[2]-p.z))+' m';}
 else{$('obj-label').textContent=s.hold?'坚守信标':'救援信标';$('obj-dist').textContent=Math.round(s.distanceToBeacon)+' m';}
 const sec=station.section();$('section-cn').textContent=sec.name;$('section-en').textContent=sec.en;
 if(hud.section!==sec.index){if(hud.section!==null&&screen==='play')banner(sec.name,sec.en,2.6);hud.section=sec.index;}
 // vitals
 const hp=Math.max(0,s.player.hp);$('hp-num').textContent=Math.ceil(hp);$('hp-fill').style.width=hp+'%';hud.lagHP=Math.max(hp,hud.lagHP-.6);$('hp-lag').style.width=hud.lagHP+'%';document.body.classList.toggle('low',hp<35);
 $('vignette').style.opacity=String(Math.max(clamp(1-(clock-hud.hurtAt)/.6,0,1)*.9,hp<35?.35+.15*Math.sin(clock*4):0));
 // weapon
 $('w-name').textContent=w.full;$('w-mode').textContent=w.mode;$('w-mag').textContent=String(s.mag).padStart(w.mag>=100?3:2,'0');$('w-res').textContent=w.charged?'—':Number.isFinite(s.reserve)?s.reserve:'∞';document.body.classList.toggle('empty',s.mag===0&&!w.charged);
 $('reload-bar').style.visibility=s.reloading?'visible':'hidden';$('reload-bar').firstElementChild.style.width=s.reloadProgress*100+'%';
 const slots=$('slots');if(!slots.childElementCount)for(const id of WEAPON_ORDER){const e=document.createElement('span');e.dataset.id=id;e.textContent=`${WEAPONS[id].slot} ${WEAPONS[id].name}`;slots.append(e);}
 for(const e of slots.children){const id=e.dataset.id,own=s.owned.includes(id);e.className=id===s.weapon?'on':own?(id==='missile'?'ready':''):(id==='missile'?'charge':'none');
  if(id==='missile'){const k=own?1:s.charge;e.style.setProperty('--c',(k*100).toFixed(1)+'%');e.textContent=own?`4 ${WEAPONS.missile.name} 就绪`:`4 ${WEAPONS.missile.name} ${Math.floor(k*100)}%`;}}
 // reticle spread in pixels
 const speed=Math.hypot(p.vx,p.vz),spread=(p.ads?w.adsSpread:w.spread)+w.moveSpread*clamp(speed/LEVEL.walk,0,1.5)+(p.onGround?0:w.moveSpread*1.5)+s.bloom;
 const px=spread/Math.tan(T.MathUtils.degToRad(camera.fov/2))*innerHeight/2;
 const ret=$('reticle');ret.style.setProperty('--gap',(5+px)+'px');ret.className=(s.weapon==='rpg'?'rpg ':s.weapon==='missile'?'mark ':s.weapon==='minigun'?'spin ':'')+(cam.ads>.6&&s.weapon==='rifle'?'ads':'');
 const hm=$('hitmark');hm.style.opacity=clock<hud.hitUntil?'1':'0';hm.className=clock<hud.killUntil?'kill':clock<hud.headUntil?'head':'';
 // combo: the count, its tier name and the window left before it drops
 const cb=$('combo'),c=s.combo;
 if(c.count>=2&&screen!=='won'){cb.classList.add('on');if(c.count!==hud.combo){$('combo-n').textContent=c.count;if(c.count>hud.combo)$('combo-n').animate([{transform:'scale(1.32)'},{transform:'scale(1)'}],{duration:150,easing:'cubic-bezier(.2,.8,.3,1)'});}
  $('combo-label').textContent=c.tier>0?COMBO_TIERS[c.tier-1].label:'连斩';cb.dataset.tier=c.tier;$('combo-bar').style.transform=`scaleX(${clamp(c.left/LEVEL.comboWindow,0,1)})`;cb.classList.toggle('fresh',clock-hud.tierAt<.9);}
 else cb.classList.remove('on','fresh');hud.combo=c.count;
 const fl=s.flight,flying=!!fl&&['play','pause'].includes(screen);$('palm').hidden=!flying;document.body.dataset.fly=flying?'1':'';
 if(flying){$('palm-bar').style.width=(fl.left/fl.total*100).toFixed(1)+'%';$('palm-t').textContent=fl.left.toFixed(1);$('palm').classList.toggle('ready',fl.ready>=1&&fl.state!=='down');$('palm-n').textContent=fl.kills;}
 const hi=s.high;$('perch').hidden=!hi||!['play','pause'].includes(screen);if(hi)$('perch-n').textContent=hi.kills;
 const foes=s.crowd.alive+s.crowd.incoming;$('threat').hidden=foes<=0||!['play','pause'].includes(screen);$('threat-n').textContent=foes;
 // the sky darkens while a palm gathers over the valley, and clears on the blow
 {const k=clamp((clock-strike.at)/strike.dur,0,1),gone=strike.hit>strike.at?clamp(1-(clock-strike.hit)/.05,0,1):clock-strike.at>strike.dur+.4?0:1;$('strikeveil').style.opacity=(Math.sqrt(k)*gone).toFixed(3);}
 const wa=clock-whiteAt;$('whiteout').style.opacity=String(whiteK*(wa<.06?1:clamp(1-(wa-.06)/.75,0,1)));
 // prompt
 const I=s.interact,target=I.kind==='drop'?game.airdrops.find(d=>d.id===I.target):null,ask=target?'drop':I.kind==='vehicle'?'vehicle':I.kind==='exit'&&I.progress>0?'exit':null;$('prompt').hidden=!ask||screen!=='play';
 if(ask){if(hud.ask!==ask){hud.ask=ask;$('prompt-text').innerHTML=ask==='drop'?'按住 <kbd>E</kbd> 打开空投':ask==='vehicle'?'按住 <kbd>E</kbd> 驾驶雪地车':'按住 <kbd>E</kbd> 下车';}
  $('prompt-loot').textContent=ask==='drop'?(LOOT[target.loot]??LOOT.supply).label:ask==='vehicle'?'W / S 油门 · 鼠标或 A / D 转向 · 撞开人群':'';$('prompt-ring').style.strokeDashoffset=String(94.25*(1-clamp(I.progress,0,1)));}
 // the snowcat: hull and speed where the weapon was
 const drv=s.driving?s.vehicles.find(v=>v.id===s.driving):null;document.body.dataset.drive=drv?'1':'';
 if(drv){const k=drv.hp/drv.maxHP;$('veh-hp').style.width=k*100+'%';$('vehicle').classList.toggle('low',k<.3);$('veh-speed').textContent=Math.round(Math.abs(drv.speed)*3.6);$('veh-run').textContent=ride.kills>=2&&clock-ride.killAt<2.5?`碾压 ×${ride.kills}`:'';}
 if(ride.kills&&clock-ride.killAt>=2.5){if(ride.kills>=5)feedLine(`<em>雪地车</em><b>碾压 ${ride.kills} 人</b>`,'loot');ride.kills=0;}
 // things worth pointing at in the world: a cornice that still hangs, a snowcat that can be driven
 updateCues(s);
 // hold, then the dreadnought
 const uploaded=s.hold&&s.hold.elapsed>=s.hold.duration;
 $('hold').hidden=!s.hold||s.state==='won'||(uploaded&&!s.boss);if(s.hold){$('hold-fill').style.width=clamp(s.hold.elapsed/s.hold.duration,0,1)*100+'%';$('hold-time').textContent=uploaded?'':Math.max(0,Math.ceil(s.hold.duration-s.hold.elapsed));
  const label=uploaded?'信标上传完成 · 击毁母舰':s.boss?'坚守信标 · 母舰来袭':'坚守信标 · 救援直升机接近中';if(hud.holdLabel!==label){hud.holdLabel=label;$('hold-label').textContent=label;}}
 $('boss').hidden=!s.boss||!['play','pause'].includes(screen);
 if(s.boss){const k=s.boss.hp/s.boss.maxHP;if(!bossHud.seen){bossHud.seen=true;bossHud.lag=1;}bossHud.lag=Math.max(k,bossHud.lag-.004);$('boss-fill').style.width=k*100+'%';$('boss-lag').style.width=bossHud.lag*100+'%';
  const warn=clock<bossHud.warnUntil?bossHud.warn:'瞄准机首的红色核心 · 弱点伤害 ×2.6',h=$('boss-hint');if(h.textContent!==warn)h.textContent=warn;h.classList.toggle('warn',clock<bossHud.warnUntil);}else bossHud.seen=false;
 if(clock>hud.bannerUntil)$('banner').classList.remove('on');
 for(const d of hud.dmg){const a=clock-d.at;d.el.style.opacity=String(clamp(1-a/1.4,0,1));}for(const d of hud.dmg.filter(d=>clock-d.at>1.5))d.el.remove();hud.dmg=hud.dmg.filter(d=>clock-d.at<=1.5);
 for(const f of hud.feed)if(clock-f.at>4.5)f.el.classList.add('out');for(const f of hud.feed.filter(f=>clock-f.at>5.2))f.el.remove();hud.feed=hud.feed.filter(f=>clock-f.at<=5.2);
}

// ---------------- weapon presentation ----------------
// Viewmodel surfaces for snow light: black anodising and phosphate read as near-black but not as holes (real albedo
// ~.03-.05), the polymer keeps a little sheen, and every weapon/glove surface reflects the alpine sky at full strength.
function tuneViewmodel(root){
 root.traverse(o=>{if(!o.isMesh)return;for(const m of [].concat(o.material)){if(!m?.isMeshStandardMaterial)continue;
  if(m.name==='pac9_anodised')m.color.setRGB(.034,.038,.044);
  if(m.name==='pac9_phosphate')m.color.setRGB(.042,.046,.050);
  if(m.name==='glove_fabric'){/* fabric() in viewmodel.mjs owns the cloth */}
  else m.envMapIntensity=Math.max(m.envMapIntensity,1.1);}});
}
// r28 · the hands. The arms of the viewmodel are rigid meshes modelled for one camera: the hip pose and size below stay
// close to the pose the model was authored in (weapon.basePose, scale 1), so the forearms come in from below the frame
// at the angle they were made for instead of standing up as stubs under a shrunken carbine.
const HIP=Object.freeze({at:[.128,-.128,-.29],scale:.92,adsScale:.72});
// where a generated weapon's bore sits in the viewmodel's own space (the carbine's bore is the origin, muzzle towards -z):
// placed so its pistol grip is in the right hand, which holds the carbine's grip at z ~ +.05
const HELD={minigun:[0,.07,-.12],rpg:[0,.03,.04]};
// how a generated weapon is carried. at/rot = the hip pose: low on the right and canted, so the eye sees the left hand
// on the foregrip and the forearm coming up to it (a heavy weapon held level hides both hands behind its own body);
// left = how far the left arm moves so its fist closes round the weapon's own foregrip; ads = where the host goes when
// braced (heavy weapons are not sighted: they come up and in, the reticle stays); dip/tilt = the reload (the weapon
// drops, hands stay on it)
const CARRY={minigun:{at:[.22,-.22,-.5],rot:[.05,.15,-.6],left:[0,-.05,.06],ads:[.11,-.22,-.5],adsRot:[.02,.07,-.28],dip:.2,tilt:[.1,.25,-.5]},
 rpg:{at:[.2,-.2,-.45],rot:[.03,.12,-.4],left:[0,-.05,.005],ads:[.12,-.16,-.42],adsRot:[.02,.06,-.18],dip:.17,tilt:[.6,.2,.3]}};
function buildAttachments(arms=null){
 const root=weapon.root;weapon.host.updateMatrixWorld(true);
 // everything that belongs to the carbine itself (not the gloves, not the flash): a generated weapon takes its place in the hands
 const own=[];root.traverse(o=>{if(!o.isMesh)return;if([].concat(o.material).some(x=>x?.name==='glove_fabric'))return;for(let q=o;q;q=q.parent)if(q===weapon.muzzle)return;own.push(o);});
 const inv=root.matrixWorld.clone().invert(),m=new T.Matrix4(),v=new T.Vector3();let minY=Infinity,maxY=-Infinity;
 root.traverse(o=>{if(!o.isMesh||!o.visible)return;const mats=Array.isArray(o.material)?o.material:[o.material];if(mats.some(x=>x?.name==='glove_fabric'))return;const pos=o.geometry.attributes.position;if(!pos)return;m.multiplyMatrices(inv,o.matrixWorld);
  for(let i=0;i<pos.count;i+=2){v.fromBufferAttribute(pos,i).applyMatrix4(m);if(v.z<-.3&&v.z>-.47&&Math.abs(v.x)<.03){minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);}}});
 if(!Number.isFinite(minY)){minY=-.035;maxY=.03;}
 const dark=new T.MeshStandardMaterial({name:'module / polymer',color:'#1c2023',roughness:.62,metalness:.15}),steel=new T.MeshStandardMaterial({name:'module / phosphate steel',color:'#2a2e31',roughness:.42,metalness:.85}),olive=new T.MeshStandardMaterial({name:'module / olive anodised',color:'#3f4636',roughness:.5,metalness:.55});
 const tube=(r,l,mat,pos,r2=r)=>{const g=new T.CylinderGeometry(r,r2,l,20);g.rotateX(Math.PI/2);const o=new T.Mesh(g,mat);o.position.set(...pos);return o;};
 const box=(s,mat,pos)=>{const o=new T.Mesh(new T.BoxGeometry(...s),mat);o.position.set(...pos);return o;};
 const under=minY-.004;
 const kits={rifle:new T.Group(),minigun:new T.Group(),rpg:new T.Group(),missile:new T.Group()};
 // VX-6: six barrels round the bore that spin with the motor, a drum magazine and a motor housing
 const spinner=new T.Group();spinner.position.set(0,0,-.47);
 for(let i=0;i<6;i++){const a=i/6*Math.PI*2;spinner.add(tube(.0062,.3,steel,[Math.cos(a)*.02,Math.sin(a)*.02,-.15]));}
 spinner.add(tube(.031,.012,dark,[0,0,-.03]),tube(.031,.012,dark,[0,0,-.2]),tube(.028,.01,steel,[0,0,-.295]));
 const gen={},held=(kind,at)=>{const M=arms?.[ARMS[kind]];if(!M)return null;const g=new T.Group();g.position.set(...at);g.add(new T.Mesh(M.parts.body,M.material));gen[kind]=g;return g;};
 // VX-6 (generated): its pistol grip in the right hand, the barrel cluster turns round the bore
 const mini=held('minigun',HELD.minigun);
 if(mini){spinner.clear();spinner.position.set(0,0,0);if(arms[ARMS.minigun].parts.spin)spinner.add(new T.Mesh(arms[ARMS.minigun].parts.spin,arms[ARMS.minigun].material));mini.add(spinner);
  // the collar over the cut between the housing and the turning barrels (?collar=0 leaves it off, to compare). Darker and
  // duller than in the armory's studio: out here it mirrors snow and sky, and bright steel next to the blued barrels reads as chrome
  if(params.get('collar')!=='0'&&arms[ARMS.minigun].meta.collar!==false)mini.add(barrelCollar(new T.MeshStandardMaterial({...COLLAR_STEEL,color:'#23262a',roughness:.5,metalness:.85,envMapIntensity:.7}),48));kits.minigun.add(mini);}
 else kits.minigun.add(spinner,tube(.03,.12,olive,[0,0,-.41]),box([.075,.08,.12],olive,[0,under-.05,-.33]),tube(.04,.07,dark,[0,under-.05,-.33]),box([.014,.05,.05],dark,[.042,under-.02,-.22]));
 // RK-3: a launch tube alongside on the right with a warhead that shows while loaded
 const rx=.078,ry=maxY-.012,warheadMat=new T.MeshStandardMaterial({name:'module / warhead',color:'#4e5642',roughness:.55,metalness:.4});
 const launcher=held('rpg',HELD.rpg);
 if(launcher)kits.rpg.add(launcher);
 else kits.rpg.add(tube(.046,.6,olive,[rx,ry,-.32]),tube(.051,.05,dark,[rx,ry,-.04]),tube(.051,.04,dark,[rx,ry,-.6]),box([.02,.055,.03],dark,[rx,ry-.065,-.24]),box([.012,.032,.08],steel,[rx-.05,ry+.012,-.34]),box([.006,.04,.012],steel,[rx,ry+.06,-.5]));
 const warhead=new T.Group(),bulb=new T.Mesh(new T.SphereGeometry(.045,18,12),warheadMat),cone=new T.Mesh(new T.ConeGeometry(.045,.12,18),warheadMat);
 bulb.scale.set(1,1,1.5);bulb.position.set(rx,ry,-.655);cone.rotation.x=-Math.PI/2;cone.position.set(rx,ry,-.76);warhead.add(bulb,cone);
 if(launcher){bulb.position.set(0,0,-.5);cone.position.set(0,0,-.605);warhead.scale.set(1.2,1.2,1);launcher.add(warhead);}else kits.rpg.add(warhead);
 // 天锤: a laser designator clamped to the left rail, with a lens that blinks while the strike is ready
 const lens=new T.Mesh(new T.CircleGeometry(.011,16),new T.MeshBasicMaterial({color:'#ff3b26',toneMapped:false}));lens.position.set(-.046,maxY-.004,-.432);lens.rotation.y=Math.PI;
 kits.missile.add(box([.034,.04,.12],dark,[-.046,maxY-.004,-.37]),tube(.014,.014,steel,[-.046,maxY-.004,-.425]),box([.004,.07,.004],steel,[-.06,maxY+.04,-.33]),lens);
 for(const k of Object.values(kits)){k.visible=false;k.traverse(o=>{if(o.isMesh){o.frustumCulled=false;}});root.add(k);}
 const muzzle={rifle:[0,0,-.531],minigun:mini?[HELD.minigun[0],HELD.minigun[1],HELD.minigun[2]-.5]:[0,0,-.775],rpg:launcher?[HELD.rpg[0],HELD.rpg[1],HELD.rpg[2]-.68]:[rx,ry,-.8],missile:[-.046,maxY-.004,-.44]};
 // the two arms are separate top-level parts; the left one is the one whose glove reaches furthest forward
 const armsOf=root.children.filter(c=>{let g=false;c.traverse(o=>{if(o.isMesh&&[].concat(o.material).some(x=>x?.name==='glove_fabric'))g=true;});return g;}).map(c=>({node:c,z:new T.Box3().setFromObject(c).min.z})).sort((a,b)=>a.z-b.z);
 return {kits,spinner,warhead,lens,muzzle,own,gen,carry:structuredClone(CARRY),hip:structuredClone(HIP),leftArm:armsOf[0]?.node??null,profile:{minY,maxY}};
}
function applyWeaponVisual(id){
 shownWeapon=id;for(const [k,g] of Object.entries(attachments.kits))g.visible=k===id;
 // a generated weapon replaces the carbine; a layer hides it (the hand animation rewrites .visible every frame)
 const layer=attachments.gen[id]?1:0;for(const o of attachments.own)o.layers.set(layer);
 // the left hand goes to this weapon's foregrip. The clips rewrite every node, so start from the idle pose each time
 // (generated weapons play no clips: the offset stays until the next switch)
 weapon.reset();const left=attachments.gen[id]?attachments.carry[id]?.left:null;if(left&&attachments.leftArm)attachments.leftArm.position.add(new T.Vector3(...left));
 weapon.muzzle.position.set(...(attachments.muzzle[id]??attachments.muzzle.rifle));weapon.flash.scale.setScalar(id==='minigun'?1.35:id==='rpg'?2.1:id==='missile'?.01:1.08);
}
function updateWeapon(dt){
 weaponCamera.position.set(0,0,0);weaponCamera.quaternion.identity();weaponCamera.updateMatrixWorld(true);
 const p=game.player,playing=['play','pause','down'].includes(screen);
 weapon.host.visible=playing&&game.state!=='down'&&cam.drive<.3&&!spy&&!game.flight;
 if(dt>0){attachments.spinner.rotation.z+=dt*game.spin*46;const r=game.inv.rpg;attachments.warhead.visible=!!r&&r.mag>0&&!(game.weapon==='rpg'&&game.reloading&&game.time-game.reloadStart<game.reloadDuration*.6);attachments.lens.visible=Math.sin(clock*9)>-.3;}
 const switchLeft=game.switching?(game.switchUntil-game.time)/.42:0,low=game.switching?Math.sin(clamp(switchLeft,0,1)*Math.PI):0;
 if(shownWeapon!==game.weapon&&(!game.switching||switchLeft<.5))applyWeaponVisual(game.weapon);
 const carry=attachments.gen[shownWeapon]?attachments.carry[shownWeapon]:null;
 const H=attachments.hip,hip=new T.Vector3(...(carry?carry.at:H.at)),dir=new T.Vector3(0,0,-4).sub(hip).normalize();
 const qHip=carry?new T.Quaternion().setFromEuler(new T.Euler(carry.rot[0]+feedback.pitch,carry.rot[1],carry.rot[2]+feedback.roll))
  :new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,-1),dir).multiply(new T.Quaternion().setFromEuler(new T.Euler(.025+feedback.pitch,.025,-.025+feedback.roll)));
 const adsAt=carry?new T.Vector3(...carry.ads):new T.Vector3(0,-.069,-.135).multiplyScalar(H.adsScale);
 const qAds=carry?new T.Quaternion().setFromEuler(new T.Euler(carry.adsRot[0]+feedback.pitch,carry.adsRot[1],carry.adsRot[2]+feedback.roll)):new T.Quaternion().setFromEuler(new T.Euler(feedback.pitch,0,feedback.roll));
 const pos=hip.clone().lerp(adsAt,cam.ads),q=qHip.slerp(qAds,cam.ads);
 if(dt>0){look.swayX=damp(look.swayX,clamp(-look.mx*.00022,-.03,.03),9,dt);look.swayY=damp(look.swayY,clamp(look.my*.00022,-.03,.03),9,dt);look.mx=look.my=0;}
 const k=1-cam.ads*.85;pos.x+=(cam.bobX*.45+look.swayX)*k;pos.y+=(cam.bobY*.5-look.swayY)*k-cam.land*.25;
 const s=cam.sprint;pos.add(new T.Vector3(-.03*s,-.035*s,.03*s));q.multiply(new T.Quaternion().setFromEuler(new T.Euler(-.22*s,.55*s,.3*s)));
 pos.y-=.24*low;q.multiply(new T.Quaternion().setFromEuler(new T.Euler(-.7*low,.15*low,0)));
 if(carry&&game.reloading&&game.weapon===shownWeapon){const u=clamp((game.time-game.reloadStart)/game.reloadDuration,0,1),r=T.MathUtils.smoothstep(u,0,.22)*(1-T.MathUtils.smoothstep(u,.74,1));pos.y-=carry.dip*r;q.multiply(new T.Quaternion().setFromEuler(new T.Euler(carry.tilt[0]*r,carry.tilt[1]*r,carry.tilt[2]*r)));}
 pos.z+=feedback.z;weapon.host.position.copy(pos);weapon.host.quaternion.copy(q);weapon.host.scale.setScalar(lerp(H.scale,carry?H.scale:H.adsScale,cam.ads));weapon.host.updateMatrixWorld(true);
 weapon.flash.visible=playing&&game.time<flashUntil;weapon.flash.rotation.z=game.time*31;weapon.light.intensity=weapon.flash.visible?(game.weapon==='rpg'?7:game.weapon==='missile'?0:4):0;
}
function actualMuzzle(){
 const v=weapon.muzzle.getWorldPosition(new T.Vector3()),local=v.clone().applyMatrix4(weaponCamera.matrixWorldInverse),uv=v.clone().project(weaponCamera);
 const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(uv.x,uv.y),camera);const forward=camera.getWorldDirection(new T.Vector3());
 return ray.ray.origin.clone().addScaledVector(ray.ray.direction,(-local.z)/Math.max(.2,ray.ray.direction.dot(forward)));
}
function tryFire(){
 const w=WEAPONS[game.weapon],s=game.inv[game.weapon];
 if(game.flight){
  // in the air a click is a palm: the ground under the crosshair
  fireQueued=false;if(game.state!=='running')return;
  camera.updateMatrixWorld(true);const eye=camera.position.toArray(),a=game.aim(eye,camera.getWorldDirection(new T.Vector3()).toArray(),PALM.range+40);
  if(game.fire({origin:eye,target:a.point})){cam.punch+=1.6;look.recoilP-=.02;}
  return;
 }
 if(game.driving){fireQueued=false;return;}
 if(!w.auto&&!fireQueued)return;
 if(fireQueued&&clock-queuedAt>.25)fireQueued=false;
 if(game.state!=='running'||game.switching||game.reloading)return;
 if(s.mag<=0){fireQueued=false;game.reload();return;}
 if(game.time+1e-6<game.nextFire)return;
 camera.updateMatrixWorld(true);const eye=camera.position.toArray(),dir=camera.getWorldDirection(new T.Vector3()).toArray();
 const aim=game.aim(eye,dir,w.range);updateWeapon(0);const origin=actualMuzzle();
 const shot=game.fire({origin:origin.toArray(),target:aim.point});if(!shot)return;
 fireQueued=false;if(w.id!=='missile'&&!attachments.gen[w.id])weapon.play('recoil');feedback.shoot(game.player.ads);flashUntil=game.time+(w.id==='rpg'?.09:.05);weaponSound(w.id);
 const ads=game.player.ads?.65:1;look.pitch=clamp(look.pitch+w.kick*.5*ads,-1.45,1.45);look.recoilP+=w.kick*.55*ads;look.recoilY+=(Math.random()-.5)*w.kick*.6*ads;
 // camera kick: a tap for the rifle, a constant rattle for the minigun, a shove for the rocket
 const kick={rifle:.06,minigun:.05,rpg:.42,missile:.04}[w.id]??.05,cap=w.id==='rpg'?1:w.id==='minigun'?.36:.3;cam.trauma=Math.max(cam.trauma,Math.min(cap,cam.trauma+kick));
 if(w.id==='rpg'){cam.punch+=3.5;const back=dir.map(v=>-v);sfx.smoke.puff({position:origin.toArray(),velocity:[dir[0]*3,.4,dir[2]*3],color:'#e9ecee',size:.5,grow:1.6,life:1.8,opacity:.5,drag:2.2});sfx.smoke.puff({position:[eye[0]+back[0]*1.3,eye[1]-.2,eye[2]+back[2]*1.3],velocity:[back[0]*5,.6,back[2]*5],color:'#d9dcdd',size:.9,grow:2.4,life:2.2,opacity:.45,drag:2});}
}

// ---------------- events ----------------
function enemyName(type){return ENEMIES[type]?.name??'目标';}
function handle(e){
 {const key=lineFor(e,{maxHP:LEVEL.hp});if(key)comms?.say(key,{delay:RADIO_DELAY[e.type]??.6});}
 const p=game.player;
 switch(e.type){
  case 'hit':case 'kill':{
   if(e.enemyType==='boss'){
    setp?.boss?.hit(e);const pan=panOf(e.position),dist=camera.position.distanceTo(v3.set(...e.position));
    if(e.type==='kill'){hud.hitUntil=clock+.4;hud.killUntil=clock+.4;feedLine(`<em>${WEAPONS[e.weapon]?.name??'爆炸'}</em><b>击毁 ${enemyName('boss')}</b><em>+${e.score}</em>`,'gold');break;}
    if(e.cause==='bullet'){hud.hitUntil=clock+.12;if(e.core)hud.headUntil=clock+.16;feedback.impact('shield');}
    if(once(e.core?'bossCore':'bossHull',e.core?.06:.05))sound.play(e.core?'armorBreak':'metalHit',{x:.5+pan/1.2,distance:dist*.5});
    break;}
   const r=world.resolveImpact(e);world.pulse(r);fx.pulse(r);
   const dist=camera.position.distanceTo(v3.set(...r.position)),pan=panOf(r.position);
   if(e.type==='hit'){if(e.cause==='bullet'){hud.hitUntil=clock+.12;feedback.impact('shield');}if(e.hp>0){const brk=[.5,.25].some(t=>e.hp<=e.maxHP*t&&e.hp+e.damage>e.maxHP*t);sound.play(brk?'armorBreak':'metalHit',{x:.5+pan/1.2,distance:dist});}if(e.enemyType==='logo')sfx.emblem.hit(game.time);}
   else{hud.hitUntil=clock+.26;hud.killUntil=clock+.26;sound.play('enemyDestroy',{x:.5+pan/1.2,distance:dist});const w=WEAPONS[e.weapon]?.name??(e.weapon==='airstrike'||e.weapon==='logo'?'空中支援':'');
    if(e.enemyType==='logo')feedLine(`<em>${w}</em><b>击落 隐藏目标</b><em>+${e.score}</em>`,'gold');else feedLine(`<em>${w}</em><b>击落 ${enemyName(e.enemyType)}</b><em>+${e.score}</em>`);}
   break;}
  case 'ground':case 'scenery':{
   // an outpost prop: sparks and a puff of the snow lying on it, no terrain march
   if(typeof e.colliderId==='string'&&(e.colliderId.startsWith('prop:')||e.colliderId.startsWith('vehicle:'))){const n=e.normal??[0,1,0],pan=panOf(e.position),dist=camera.position.distanceTo(v3.set(...e.position));
    sfx.sparks.burst(e.position,{n:7,direction:n,speed:4.5,spread:.8,colors:['#ffffff','#ffd9a0','#ffb057'],life:.3,seed:e.id});
    if(once('propPuff',.05))sfx.smoke.puff({position:e.position,velocity:[n[0]*1.2,n[1]*1.2+.5,n[2]*1.2],color:'#eef2f5',size:.22,grow:.8,life:.7,opacity:.5,drag:3});
    if(once('propHit',.04))sound.play('metalHit',{x:.5+pan/1.2,distance:dist});break;}
   const r=world.resolveImpact(e);world.pulse(r);sound.play('wallHit',{x:.5+panOf(r.position)/1.2,distance:camera.position.distanceTo(v3.set(...r.position))});break;}
  case 'explosion':{
   const pos=e.position,g=groundAt(pos[0],pos[2]),dist=camera.position.distanceTo(v3.set(...pos));
   if(e.source==='palm'||e.source==='palmLand'){
    // snow and ice, no fire: the hand and its print are drawn by level-palm.mjs
    const big=e.source==='palm';for(let i=0;i<(big?8:3);i++){const a=i*2.1+pos[0];world.pulse(world.resolveImpact({type:'ground',position:[pos[0]+Math.cos(a)*e.radius*.4,g,pos[2]+Math.sin(a)*e.radius*.4],direction:[0,-1,0]}));}
    cam.trauma=Math.min(1,cam.trauma+clamp((big?1.2:.5)-dist/90,.1,.8));break;}
   sfx.explosions.trigger({position:pos,radius:e.huge?e.radius*.75:e.radius,big:e.big,huge:!!e.huge,ground:pos[1]-g<1.2?g:null,normal:game.groundNormal(pos[0],pos[2])});
   if(pos[1]-g<2)for(let i=0;i<(e.huge?8:e.big?4:2);i++){const a=i*2.1+pos[0];world.pulse(world.resolveImpact({type:'ground',position:[pos[0]+Math.cos(a)*e.radius*.3,g,pos[2]+Math.sin(a)*e.radius*.3],direction:[0,-1,0]}));}
   // chained blasts land a few frames apart: the first gets the full report, the rest only a thump
   if(once('boom',.07))boom(dist,e.big,panOf(pos));else sound.thump(clamp(.3-dist/200,.05,.3),panOf(pos));
   cam.trauma=Math.min(1,cam.trauma+clamp((e.big?1.1:.8)-dist/(e.big?60:30),0,.7));
   // the dreadnought's last blast
   if(e.huge&&e.source==='bossWreck'){whiteK=clamp(.75-dist/220,.2,.6);whiteAt=clock;cam.trauma=1;cam.punch+=7;slowMo(.3,.7);sfx.shock.trigger(pos,e.radius*.6,g);noiseHit({gain:1,dur:4,from:800,to:28,attack:.004});sound.thump(.6);}
   if(!e.huge)toGlass({kind:'event',type:'explosion',big:!!e.big,distance:dist});break;}
  // ---- fuel stores ----
  case 'propHit':{const i=props?.item(e.colliderId);if(i&&once('propLeak',.08)){const c=[i.position[0],i.position[1]+1,i.position[2]];sfx.smoke.puff({position:c,velocity:[0,1.6,0],color:'#3a3a3c',size:.3,grow:1,life:1.2,opacity:.6,drag:1});sound.voice('bolt',.3,.6,panOf(c));}break;}
  case 'propExplode':{const i=props?.remove(e.colliderId);if(!i)break;const [x,y,z]=i.position;
   sfx.debris.burst([x,y+.6,z],{n:22,speed:10,up:8,spread:1.4,size:[.34,.1,.26],colors:['#7c1c14','#a3251a','#262321','#3b3836'],life:6,ground:y,seed:e.id});
   sfx.fire.burn([x,y,z],game.time,10);
   feedLine('<em>殉爆</em><b>燃料桶</b>','loot');break;}
  case 'enemyFire':sfx.beams.trigger(e.from,e.to,e.hit);sound.voice('shot',.32,1.85,panOf(e.from));sound.voice('hit0',.18,1.6,panOf(e.from));break;
  case 'windup':sound.voice('bolt',.08,1.9,panOf(e.position));break;
  case 'playerHit':{
   if(e.damage<=0)break;hud.hurtAt=clock;if(e.cause==='avalanche'){whiteK=.85;whiteAt=clock;cam.trauma=1;noiseHit({gain:.7,dur:1.4,from:500,to:60});}const fwd=[-Math.sin(look.yaw),-Math.cos(look.yaw)],right=[Math.cos(look.yaw),-Math.sin(look.yaw)],vx=e.from[0]-p.x,vz=e.from[2]-p.z;
   const angle=Math.atan2(vx*right[0]+vz*right[1],vx*fwd[0]+vz*fwd[1]);damageArc(angle);cam.trauma=Math.min(1,cam.trauma+.25);sound.thump(.22);sound.voice('hit1',.5,.62);
   toGlass({kind:'event',type:'hurt',angle,damage:e.damage,hp:e.hp,cause:e.cause});break;}
  case 'down':setScreen('down');toGlass({kind:'event',type:'down'});break;
  case 'respawn':setp?.boss?.reset();cam.drive=0;banner('检查点','重新部署',2);toGlass({kind:'event',type:'respawn'});break;
  case 'reloadStart':if(!attachments.gen[game.weapon])weapon.play(e.empty?'reload-empty':'reload');sound.play('reload',{duration:e.duration});break;
  case 'switch':sound.voice('bolt',.35,1.15,.05);sound.later(.22,'case1',.18,.9,.05);break;
  case 'jump':break;
  case 'land':cam.land=Math.min(.12,e.speed*.012);noiseHit({gain:.12,dur:.16,from:2400,to:500,type:'bandpass'});sound.thump(.08);break;
  case 'step':noiseHit({gain:e.sprint?.075:.05,dur:e.sprint?.11:.09,from:3400,to:800,type:'bandpass',q:.9,pan:(Math.random()-.5)*.2});break;
  case 'checkpoint':feedLine('<b>检查点已记录</b>');break;
  case 'encounter':if(e.banner){const [a,b]=e.banner.split(' · ');banner(a,b??'',3,'alert');}break;
  case 'overlookAhead':banner('发现制高点',`${e.side>0?'右':'左'}侧坡道可以上山 · 军火箱已空投到平台`,3.4,'gold');feedLine(`<em>制高点</em><b>${e.name} · 上去用重武器压制山下</b>`,'loot');toGlass({kind:'event',type:'overlookAhead'});break;
  case 'overlook':
   if(e.state==='enter'){hud.taken.add(e.overlook);banner('已占领制高点',`${e.name} · 居高临下 · 击杀得分与天锤充能 ×${OVERLOOK.bonus}`,3.2,'gold');sound.voice('hit0',.3,1.3);sound.later(.14,'hit0',.3,1.75);toGlass({kind:'event',type:'overlook'});}
   else if(e.kills>0)feedLine(`<em>制高点</em><b>居高临下压制 ${e.kills} 人</b>`,'gold');
   break;
  case 'hold':bars(3.6);banner('坚守信标',`救援直升机正在接近 · 守住 ${LEVEL.holdTime} 秒`,3.4,'alert');break;
  // ---- cornices and avalanches ----
  case 'corniceHit':setp?.cornices.hit(e);if(once('corniceHit',.06)){const pan=panOf(e.position);noiseHit({gain:.2,dur:.22,from:1800,to:500,type:'bandpass',pan});if(e.hp>0)sound.thump(.06,pan);}hud.hitUntil=clock+.1;break;
  case 'avalanche':{
   setp?.cornices.release(e,game.time);setp?.flows.start(e);const dist=camera.position.distanceTo(v3.set(...e.position)),k=clamp(1.15-dist/150,.3,1),pan=panOf(e.position);
   noiseHit({gain:.8*k,dur:.5,from:4200,to:700,type:'bandpass',q:.6,pan});sound.thump(.4*k,pan);
   noiseHit({gain:.95*k,dur:e.end-e.start+3,from:210,to:48,q:.5,attack:1.1,delay:.15,pan:pan*.5});noiseHit({gain:.4*k,dur:e.end-e.start+2,from:1500,to:300,type:'bandpass',q:.4,attack:1.2,delay:.4,pan:pan*.5});
   cam.trauma=Math.min(1,cam.trauma+.45*k);banner('雪崩',e.danger?'你在雪道上 · 冲到山谷另一侧':'雪檐崩落 · 正在掩埋下方敌军',2.8,e.danger?'alert':'gold');toGlass({kind:'event',type:'avalanche',danger:e.danger});break;}
  case 'avalancheEnd':if(e.buried>0){feedLine(`<em>雪崩</em><b>掩埋 ${e.buried} 人</b>`,'gold');if(e.buried>=12)banner(`雪崩掩埋 ${e.buried} 人`,'',2.2,'gold');}break;
  // ---- snowcats ----
  case 'vehicleEnter':look.pitch=-.14;ride.kills=0;sound.voice('bolt',.5,.7);sound.later(.12,'wallBody',.5,.6);noiseHit({gain:.3,dur:.7,from:220,to:90,attack:.05});feedLine('<em>驾驶</em><b>雪地车</b>','loot');toGlass({kind:'event',type:'vehicle',on:true});break;
  case 'vehicleExit':sound.voice('bolt',.4,.8);if(e.thrown){cam.trauma=1;look.pitch=-.05;}toGlass({kind:'event',type:'vehicle',on:false});break;
  case 'vehicleHit':{setp?.cats?.hit(e,game);if(e.vehicleId!==game.driving?.id)break;hud.hurtAt=clock-.3;cam.trauma=Math.min(1,cam.trauma+clamp(e.damage/60,.08,.5));
   if(e.cause==='avalanche'){whiteK=.6;whiteAt=clock;}if(once('vehHit',.08)){sound.thump(.2);sound.voice('metalHit',.5,.7);}break;}
  case 'vehicleCrash':setp?.cats?.crash(e);cam.trauma=Math.min(1,cam.trauma+.5);cam.punch+=2.5;sound.thump(.4);sound.voice('wallBody',.9,.55);sound.voice('metalHit',.6,.6);break;
  case 'vehicleDestroyed':setp?.cats?.destroyed(e,game.time);feedLine('<em>雪地车</em><b>已损毁</b>');break;
  case 'propBreak':{const i=props?.remove(e.colliderId);if(!i)break;const [x,y,z]=i.position,kind=e.prop,pan=panOf(i.position);
   sfx.debris.burst([x,y+.7,z],{n:kind==='sandbags'?14:20,direction:e.direction,speed:e.speed*.6,up:4.5,spread:1.1,size:kind==='crates'?[.34,.06,.24]:[.3,.2,.26],colors:kind==='crates'?['#6f5a3c','#8a7450','#4a3c28','#30343a']:kind==='sandbags'?['#9a8a6a','#7f7257','#b3a380']:['#8d9196','#6c7075','#a9adb1'],life:5,ground:y,seed:e.id});
   sfx.smoke.puff({position:[x,y+.8,z],velocity:[e.direction[0]*3,1.2,e.direction[2]*3],color:kind==='sandbags'?'#b9ab8c':'#e8ecef',size:1,grow:2.2,life:1.4,opacity:.5,drag:1.6});
   cam.trauma=Math.min(1,cam.trauma+.22);sound.voice('break',.7,.7,pan);sound.thump(.2,pan);break;}
  // ---- the dreadnought ----
  case 'bossPhase':{if(e.phase<2)break;const at=setp?.boss?.phase(e);if(at)boom(camera.position.distanceTo(v3.set(...at)),true,panOf(at));slowMo(.45,.3);
   if(e.phase===2)banner('母舰受创','一台引擎起火 · 金色补给已投下',3,'gold');else banner('母舰濒临坠毁','它开始全力开火 · 集中攻击核心',3,'alert');break;}
  case 'bossMortar':setp?.boss?.mortar(e,game.time);sound.thump(.3,panOf(e.from));noiseHit({gain:.35,dur:.5,from:1400,to:200,pan:panOf(e.from)});whistle(e.marks[0].at-game.time);bossHud.warn='迫击炮 · 离开红圈';bossHud.warnUntil=clock+1.7;break;
  case 'bossCharge':sweepTone({from:140,to:1500,dur:e.duration,gain:.07});noiseHit({gain:.2,dur:e.duration,from:300,to:4200,type:'bandpass',q:2,attack:e.duration*.9});bossHud.warn='光束蓄能 · 跳过红线或离开它';bossHud.warnUntil=clock+e.duration+.6;break;
  case 'bossBeam':sweepTone({from:92,to:70,dur:e.duration,gain:.12,type:'square'});noiseHit({gain:.5,dur:e.duration,from:2600,to:1400,type:'bandpass',q:1.2,attack:.05});cam.trauma=Math.min(1,cam.trauma+.3);break;
  case 'bossSummon':feedLine(`<em>母舰</em><b>空投增援 ×${e.count}</b>`);sound.voice('hit0',.25,.8);sound.later(.14,'hit0',.25,.7);break;
  case 'bossDown':bars(4);setp?.boss?.down(e,game.time);banner('母舰已击毁','它正在坠落 · 远离残骸',3,'gold');slowMo(.3,.9);cam.trauma=1;sweepTone({from:520,to:60,dur:2.6,gain:.1});toGlass({kind:'event',type:'bossDown'});break;
  case 'airdropIncoming':sfx.airdrops.incoming(e);sound.voice('hit0',.25,1.45);sound.later(.18,'hit0',.2,1.7);toGlass({kind:'event',type:'airdrop',gold:e.gold});break;
  case 'airdropLanded':sound.thump(.18,panOf(e.position));noiseHit({gain:.2,dur:.5,from:900,to:120,pan:panOf(e.position)});break;
  case 'airdropOpened':sfx.airdrops.opened(e,game.time);sound.voice('bolt',.6,.85);sound.later(.15,'case1',.35,.8);feedLine(`<em>获得</em><b>${e.label}</b>`,e.gold?'gold':'loot');if(e.loot!=='palm'&&e.gold){const up=clock-hud.surgeAt<.2;banner(up?'金色补给 · 敌群涌现':'金色补给',up?'弹药补满 · 天锤就绪 · 按 4 标记打击点':'全部武器弹药已补满',up?3.4:2.6,'gold');}break;
  case 'spawn':if(e.enemyType==='boss'){bars(4.6);banner(ENEMIES.boss.name,'它来摧毁信标 · 瞄准机首的红色核心',4.2,'alert');noiseHit({gain:.6,dur:4.5,from:70,to:160,attack:2.6});sweepTone({from:60,to:95,dur:4,gain:.09,type:'square'});toGlass({kind:'event',type:'bossSpawn'});break;}
   if(e.enemyType==='logo'){sfx.emblem.spawn(e);sound.voice('hit0',.22,2.2);sound.later(.12,'hit0',.16,2.6);sound.later(.24,'hit0',.12,3);toGlass({kind:'event',type:'logoSpawn'});}break;
  case 'logoDown':banner('隐藏目标已击落','空中支援已呼叫 · 地毯式轰炸',3.6,'gold');sfx.emblem.hide();toGlass({kind:'event',type:'logoDown'});break;
  case 'logoEscaped':feedLine('<em>隐藏目标</em><b>已飞离</b>');break;
  case 'airstrike':sfx.strikes.trigger(e,game.time,groundAt);jetSound();if(e.source!=='logo')banner('空中支援','地毯式轰炸',2.4,'gold');toGlass({kind:'event',type:'airstrike'});break;
  // ---- the crowd ----
  case 'crowdSpawn':sfx.crowdSpawn(e,groundAt);break;
  case 'crowdHit':{
   sfx.crowdHit(e);hud.hitUntil=clock+.1;if(e.head)hud.headUntil=clock+.14;
   if(once('crowdHit',.035)){const pan=panOf(e.position),dist=camera.position.distanceTo(v3.set(...e.position));sound.voice(e.head?'hit1':'hit0',clamp(.42-dist/90,.08,.42),e.head?1.55:1.1+Math.random()*.25,pan);}
   break;}
  case 'crowdKill':{
   if(e.cause==='avalanche'){sfx.crowd.kill(e,game.time,groundAt);break;} // swept away inside the cloud: the body only
   sfx.crowdKill(e,game.time,groundAt);if(e.cause==='win')break;
   if(e.cause==='ram'){ride.kills++;ride.killAt=clock;cam.trauma=Math.min(1,cam.trauma+.12);cam.punch+=.5;if(once('ram',.05)){sound.thump(.26);sound.voice('wallBody',.55,.8+Math.random()*.3);}}
   const dist=camera.position.distanceTo(v3.set(...e.position)),pan=panOf(e.position);
   if(e.cause==='bullet'){hud.hitUntil=clock+.2;hud.killUntil=clock+.2;}
   if(once('crowdKill',.03))sound.voice('break',clamp(.7-dist/80,.12,.7),.85+Math.random()*.4,pan);
   if(e.kind==='brute'&&e.score)feedLine(`<em>${WEAPONS[e.weapon]?.name??'爆炸'}</em><b>击倒 ${CROWD.brute.name}</b><em>+${e.score}</em>`);
   break;}
  case 'crowdWindup':if(Math.hypot(e.position[0]-p.x,e.position[2]-p.z)<6&&once('crowdWindup',.18))sound.voice('bolt',.16,.7,panOf(e.position));break;
  case 'crowdStrike':sfx.crowdStrike(e);if(e.hit)sound.voice('wallBody',.4,1.3,panOf(e.position));break;
  case 'combo':hud.tierAt=clock;sound.voice('hit0',.32,1.9+e.tier*.18);sound.later(.07,'hit0',.26,2.4+e.tier*.18);if(e.tier>=2)sound.thump(.25);toGlass({kind:'event',type:'combo',count:e.count,tier:e.tier,label:e.label});break;
  case 'comboEnd':if(e.count>=10)feedLine(`<em>连斩结束</em><b>${e.count} 连斩</b>`,'loot');break;
  case 'multiKill':{const w=WEAPONS[e.source]?.name??(e.source==='airstrike'?'空中支援':e.source==='barrel'?'燃料桶':e.source==='bomber'?'连环殉爆':e.source==='secondary'?'天锤':'爆炸');
   if(e.count>=6||e.source==='rpg')feedLine(`<em>${w}</em><b>一击 ${e.count} 杀</b>`,'loot');if(e.count>=10)slowMo(.4,.16);break;}
  // ---- 天掌 · the sky palm ----
  // r28 · a gold crate calls up its own crowd: say so, and let the snow rumble as they come up through it
  case 'surge':hud.surgeAt=clock;feedLine(`<em>敌群涌现</em><b>${e.count} 个目标从雪下钻出 · ${e.reason==='palm'?'用天掌清场':'用天锤和重武器清场'}</b>`,'gold');
   if(e.reason==='palm')banner('天掌 · 敌群涌现',`凌空 ${PALM.time} 秒 · 左键向准星处拍下冰掌`,3.6,'gold');
   noiseHit({gain:.5,dur:2.2,from:90,to:260,attack:.5});sweepTone({from:70,to:130,dur:1.8,gain:.08,type:'sawtooth'});sweepTone({from:520,to:780,dur:.5,gain:.05,type:'square',delay:.1});sweepTone({from:520,to:780,dur:.5,gain:.05,type:'square',delay:.75});
   cam.trauma=Math.min(1,cam.trauma+.3);toGlass({kind:'event',type:'surge',reason:e.reason,count:e.count});break;
  case 'palmStart':{const p=game.player;sfx.palms.lift([p.x,groundAt(p.x,p.z),p.z]);banner('天掌',`凌空 ${e.duration} 秒 · 左键向准星处拍下冰掌`,3.4,'gold');
   sweepTone({from:180,to:1500,dur:1.1,gain:.09,type:'sine'});noiseHit({gain:.4,dur:1.3,from:500,to:5200,type:'bandpass',q:1.2,attack:.5});sound.thump(.35);cam.punch+=5;toGlass({kind:'event',type:'airdrop',gold:true});break;}
  case 'palmCall':sfx.palms.call(e,game.time,groundAt);strike.at=clock;strike.dur=e.delay;strike.hit=-9;noiseHit({gain:.6,dur:e.delay+.1,from:5200,to:200,type:'bandpass',q:.9,attack:e.delay*.8});sweepTone({from:1100,to:60,dur:e.delay,gain:.09,type:'sine'});sweepTone({from:60,to:110,dur:e.delay,gain:.1,type:'sawtooth'});cam.trauma=Math.min(1,cam.trauma+.18);break;
  case 'palmImpact':{
   sfx.palms.impact(e,game.time,groundAt);const pos=e.position,dist=camera.position.distanceTo(v3.set(...pos)),pan=panOf(pos);
   boom(dist,true,pan);sound.thump(.6,pan);noiseHit({gain:.9,dur:2.6,from:1400,to:36,attack:.004,pan});sound.later(.06,'break',.8,.5,pan);sound.later(.2,'wallBody',.7,.4,pan);
   sweepTone({from:74,to:26,dur:1.9,gain:.2,type:'sine'});sound.later(.5,'break',.9,.7,pan);sound.later(.55,'wallBody',.6,.6,pan);
   // the whole valley takes the blow: a held beat, the ground wave, then the hand breaks up
   sfx.shock.trigger(pos,e.radius*1.5,groundAt(pos[0],pos[2]),{dust:false});strike.hit=clock;cam.trauma=1;cam.land=Math.max(cam.land,.3);
   cam.punch+=clamp(13-dist/8,4,11);whiteK=clamp(.42-dist/220,.1,.32);whiteAt=clock;slowMo(.22,.5);toGlass({kind:'event',type:'explosion',big:true,huge:true,distance:dist});break;}
  case 'palmEnd':feedLine(`<em>天掌</em><b>${e.strikes} 掌 · 击倒 ${e.kills}</b>`,'gold');sweepTone({from:900,to:200,dur:1.4,gain:.06,type:'sine'});break;
  case 'palmLand':sfx.palms.land(e.position);sound.thump(.5);noiseHit({gain:.5,dur:1.2,from:900,to:60});cam.land=.22;cam.trauma=Math.min(1,cam.trauma+.4);break;
  // ---- 天锤 tactical missile ----
  case 'missileReady':banner('天锤已就绪','按 4 标记打击点',2.6,'gold');sound.voice('hit0',.3,1.6);sound.later(.12,'hit0',.3,2.1);sound.later(.24,'hit0',.34,2.7);toGlass({kind:'event',type:'missileReady'});break;
  case 'missileCall':sfx.missiles.call(e,game.time);banner('天锤已发射',`${e.delay.toFixed(1)} 秒后命中 · 远离红色标记`,2.4,'alert');whistle(e.delay);toGlass({kind:'event',type:'missile',delay:e.delay});break;
  case 'missileImpact':{
   sfx.missiles.impact(e.missileId);const pos=e.position,g=groundAt(pos[0],pos[2]),dist=camera.position.distanceTo(v3.set(...pos));sfx.shock.trigger(pos,WEAPONS.missile.splash,g);
   whiteK=clamp(.5-dist/160,.08,.34);whiteAt=clock;cam.trauma=1;cam.punch+=clamp(12-dist/8,3,10);slowMo(.3,.45);
   noiseHit({gain:1,dur:3.6,from:900,to:30,attack:.004});sound.thump(.6);sound.later(.08,'wallBody',.9,.4);sound.later(.35,'wallBody',.6,.32);
   toGlass({kind:'event',type:'explosion',big:true,huge:true,distance:dist});break;}
  case 'win':bars(6);wonAt=clock;banner('信标已点亮','救援直升机已锁定你的位置',4,'gold');toGlass({kind:'event',type:'win',score:e.score,kills:e.kills});break;
 }
}
function consumeEvents(){for(const e of game.events){if(e.id<=lastEventId)continue;lastEventId=e.id;handle(e);}}

// ---------------- camera ----------------
function updateCamera(dt){
 const p=game.player,w=WEAPONS[game.weapon],playing=screen==='play';
 if(screen==='title'||screen==='loading'){look.yaw=Math.sin(clock*.05)*.45;look.pitch=.04+Math.sin(clock*.09)*.02;}
 look.recoilP=damp(look.recoilP,0,9,dt);look.recoilY=damp(look.recoilY,0,9,dt);
 const drv=game.driving;if(drv){ride.last=drv;look.pitch=clamp(look.pitch,-.85,.32);}
 cam.drive=damp(cam.drive,drv&&screen!=='title'?1:0,drv?7:5,dt);
 const fl=game.flight;cam.fly=damp(cam.fly,fl&&fl.state!=='down'?1:0,3,dt);
 // lifting off, the view tips down to the valley unless the player is already looking there
 if(fl&&fl.state==='up'&&playing&&look.pitch>-.5)look.pitch=damp(look.pitch,-.5,2.6,dt);
 cam.ads=damp(cam.ads,p.ads&&playing&&!game.switching&&!game.reloading?1:0,16,dt);cam.sprint=damp(cam.sprint,p.sprinting&&playing?1:0,10,dt);
 const speed=Math.hypot(p.vx,p.vz);if(p.onGround)cam.bob+=dt*speed*1.75;
 cam.amp=damp(cam.amp,p.onGround&&speed>.4&&!drv?(p.sprinting?.05:.03)*(1-cam.ads*.8):0,8,dt);
 cam.bobY=Math.sin(cam.bob*2)*cam.amp*.6;cam.bobX=Math.sin(cam.bob)*cam.amp;cam.land=damp(cam.land,0,7,dt);
 cam.trauma=Math.max(0,cam.trauma-dt*1.2);const sh=cam.trauma*cam.trauma,t=clock*28;
 const shP=sh*.035*Math.sin(t*1.1+1.3),shY=sh*.035*Math.sin(t*.9+4.2),shR=sh*.03*Math.sin(t*1.3+2.1);
 const rx=Math.cos(look.yaw),rz=-Math.sin(look.yaw);
 camera.position.set(p.x+rx*cam.bobX*.4,p.y+LEVEL.eye+cam.bobY-cam.land+sh*.06*Math.sin(t*1.7),p.z+rz*cam.bobX*.4);
 // driving: the eye swings out behind and above the hull, on the line the player looks along, and keeps clear of the slopes
 let chase=0;
 if(cam.drive>.003&&ride.last){
  const v=ride.last,k=cam.drive*cam.drive*(3-2*cam.drive),cp=Math.cos(look.pitch),dx=-Math.sin(look.yaw)*cp,dy=Math.sin(look.pitch),dz=-Math.cos(look.yaw)*cp;
  let dist=7.6+Math.abs(v.speed)*.09,x=0,y=0,z=0;
  for(let i=0;i<8;i++){x=v.x-dx*dist;y=v.y+3.3-dy*dist;z=v.z-dz*dist;if(y>groundAt(x,z)+.9)break;dist*=.82;}
  camera.position.lerp(v3.set(x,Math.max(y,groundAt(x,z)+.9)+sh*.06*Math.sin(t*1.7),z),k);chase=k*clamp(Math.abs(v.speed)/VEHICLE.forward,0,1);
 }
 camera.rotation.set(look.pitch+look.recoilP+shP,look.yaw+look.recoilY+shY,shR+cam.bobX*.15,'YXZ');
 cam.punch=damp(cam.punch,0,7,dt);
 const zoom=lerp(1,w.zoom,cam.ads),fov=T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(BASE_FOV/2))/zoom))+cam.sprint*4+cam.punch+chase*9+cam.fly*9;
 if(Math.abs(camera.fov-fov)>.01){camera.fov=fov;camera.updateProjectionMatrix();}
 if(spy){camera.position.set(...spy.at);camera.lookAt(...spy.to);} // debug: a free look at a set piece
 camera.updateMatrixWorld(true);
}

// ---------------- main loop ----------------
function frame(now){
 requestAnimationFrame(frame); // scheduled first: one bad frame must not freeze the level (the error still reaches the console)
 const dt=Math.min(.05,Math.max(0,(now-last)/1000));lastPresent=last;last=now;clock+=dt;frameTimes.push(now);if(frameTimes.length>120)frameTimes.shift();
 comms?.update();if(barsUntil>0&&clock>barsUntil){barsUntil=-1;delete document.body.dataset.bars;}
 if(screen==='cine'){cine.update();return;} // the film covers the view: nothing to simulate or draw under it
 const paused=screen==='pause',playing=screen==='play',sim=paused?0:clock<slow.until?dt*slow.scale:dt;
 if(!paused){
  if(playing&&game.driving){const st=(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0);if(st)look.yaw+=st*1.8*dt;}
  game.setInput(playing?{forward:keys.has('KeyW')||keys.has('ArrowUp'),back:keys.has('KeyS')||keys.has('ArrowDown'),left:keys.has('KeyA')||keys.has('ArrowLeft'),right:keys.has('KeyD')||keys.has('ArrowRight'),sprint:keys.has('ShiftLeft')||keys.has('ShiftRight'),ads:adsHeld,interact:keys.has('KeyE'),trigger:fireHeld,yaw:look.yaw+look.recoilY}
   :{forward:false,back:false,left:false,right:false,sprint:false,ads:false,interact:false,jump:false,trigger:false,yaw:look.yaw});
  if(playing&&(fireHeld||fireQueued))tryFire();
  if(playing&&drs&&!document.hidden&&drs.frame(now-lastPresent)!==null)resize();
  game.advance(sim);consumeEvents();
  // the win: her last line over the scene, then the ending film (when there is one), then the score sheet
  if(wonAt!==null&&screen==='play'&&clock-wonAt>(FILM_OUT?5.8:3.4)){const s=game.snapshot();$('st-time').textContent=`${Math.floor(s.time/60)}:${String(Math.floor(s.time%60)).padStart(2,'0')}`;$('st-kills').textContent=s.kills;$('st-acc').textContent=Math.round(s.accuracy*100)+'%';$('st-combo').textContent=s.combo.best;$('st-score').textContent=s.score;wonAt=null;if(FILM_OUT){setScreen('cine');cine.play('outro',()=>setScreen('won'));}else setScreen('won');}
 }
 const p=game.player,step=paused?0:dt;
 station.setView(p.x,p.z);
 sceneBoxes.length=0;for(const b of station.activeCollisionBoxes)sceneBoxes.push(b);if(props)for(const b of props.live)sceneBoxes.push(b);
 updateCamera(step);
 // time of day first: the world aims the sun's shadow camera from the same direction
 mood?.update(step,{S:game.S,hold:game.hold?clamp((game.time-game.hold.start)/LEVEL.holdTime,0,1):game.state==='won'?1:null});
 world.update(game.time,{enemies:game.enemies.filter(e=>e.type!=='logo'&&e.type!=='boss')});mood?.applyWeather();
 if(mood){const m=mood.values,L=[0,1,2].map(i=>m.sun[i]*m.sunI*.36+m.skyC[i]*m.hemiI*.8),D=[0,1,2].map(i=>(m.skyC[i]+m.groundC[i])*.22*m.hemiI);sfx.fire.setLight(L,D);}
 props?.update(clock,camera.position,mood?mood.values.lamp??0:0);
 if(scene.fog?.isFogExp2)scene.fog.density=station.fogDensity*(mood?mood.haze:LOOK.haze);post.setCentre(station.centreMask,0);
 const bz=sToZ(LEVEL.beaconS);sfx.beacon.place(0,groundAt(0,bz),bz,groundAt);sfx.beacon.update(clock,game.hold?clamp((game.time-game.hold.start)/LEVEL.holdTime,0,1):0,game.state==='won');
 if(step>0){weapon.update(step);feedback.update(step);sound.update(step);fx.update(sim);}
 camera.getWorldDirection(sfx.crowd.forward??(sfx.crowd.forward=new T.Vector3()));
 sfx.update(sim,game.time,game,groundAt,camera.position);
 if(setp){setp.update(sim,game.time,game,camera.position,mood?mood.values.lamp??0:0);const k=setp.flows.near(game.time,p.x,p.z);if(k>0&&step>0)cam.trauma=Math.max(cam.trauma,k*.5);}
 fx.sync(game.projectiles.filter(q=>!q.splash),camera);
 if(playing&&game.weapon==='missile'&&game.state==='running'&&!game.switching){const a=game.aim(camera.position.toArray(),camera.getWorldDirection(v3).toArray(),WEAPONS.missile.range);sfx.missiles.preview(a.type?[a.point[0],groundAt(a.point[0],a.point[2]),a.point[2]]:null,WEAPONS.missile.splash,game.time);}
 else sfx.missiles.preview(null);
 if(playing&&game.flight&&game.flight.state!=='down'&&game.state==='running'){const a=game.aim(camera.position.toArray(),camera.getWorldDirection(v3).toArray(),PALM.range+40),t=game.palmAim(a.point);sfx.palms.preview({...t,ready:clamp(1-(game.flight.nextStrike-game.time)/PALM.cooldown,0,1)},clock,groundAt);}
 else sfx.palms.preview(null);
 updateHum();updateEngine();
 updateWeapon(step);updateHUD();
 if(clock-glassAt>.1){glassAt=clock;toGlass({kind:'state',screen,hp:p.hp,maxHP:LEVEL.hp,state:game.state,section:station.section().index,weapon:game.weapon,hold:game.hold?(game.time-game.hold.start)/LEVEL.holdTime:null,logo:game.logoState,combo:game.combo,charge:game.charge,crowd:game.crowd.length});}
 renderer.info.reset();renderer.setRenderTarget(null);renderer.clear();syncWeaponLight();post.render(drawWeapon);
}
// The weapon is lit by the world's own light: the sun and the sky/snow bounce are rotated into weapon-camera space each
// frame, and the environment map with them, so turning toward the sun backlights the gun and the snow lights it from below.
function syncWeaponLight(){
 qInv.copy(camera.quaternion).invert();
 weaponLights.sun.position.copy(SUN_DIRECTION).applyQuaternion(qInv).multiplyScalar(10);
 weaponLights.sky.position.copy(UP).applyQuaternion(qInv);
 weaponLights.fill.position.set(-SUN_DIRECTION.x,.35,-SUN_DIRECTION.z).applyQuaternion(qInv).multiplyScalar(10);
 weaponScene.environmentRotation.setFromQuaternion(qInv);
}
// Drawn into the world's HDR target (one grade, one bloom). No depth clear: the weapon's depth is squeezed into
// [0, .02] so it always wins against the world while the world's depth (snowflake occlusion) stays intact.
function drawWeapon(){const gl=renderer.getContext();gl.depthRange(0,.02);renderer.render(weaponScene,weaponCamera);gl.depthRange(0,1);}

// ---------------- input ----------------
function bindInput(){
 const view=$('view');
 addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT')return;const k=e.code;
  if(screen==='play'){
   keys.add(k);
   if(k==='Space'){game.setInput({jump:true});e.preventDefault();}
   else if(k==='KeyR')game.reload();
   else if(/^Digit[1-4]$/.test(k))game.switchWeapon(WEAPON_ORDER[+k.slice(5)-1]);
   else if(k==='KeyQ')game.switchWeapon('last');
   else if(k==='KeyM'){sound.enabled=!sound.enabled;}
   else if(k==='KeyP'||(NOLOCK&&k==='Escape'))setScreen('pause');
  }else if(screen==='down'&&['Space','Enter'].includes(k)){e.preventDefault();respawn();}
  else if(screen==='won'&&k==='Enter')startGame();
  else if(screen==='pause'&&['KeyP','Enter'].includes(k))resume();
  else if(screen==='title'&&k==='Enter')begin();
  else if(screen==='cine'&&['Space','Enter','Escape'].includes(k)){e.preventDefault();cine.skip();}
  if(['Space','Tab'].includes(k))e.preventDefault();
 });
 addEventListener('keyup',e=>keys.delete(e.code));
 addEventListener('mousemove',e=>{if(screen!=='play'||(!document.pointerLockElement&&!NOLOCK))return;const z=lerp(1,WEAPONS[game.weapon].zoom,cam.ads);look.yaw-=e.movementX*SENS/z;look.pitch=clamp(look.pitch-e.movementY*SENS/z,-1.45,1.45);look.mx+=e.movementX;look.my+=e.movementY;});
 view.addEventListener('mousedown',e=>{if(screen!=='play')return;e.preventDefault();sound.unlock();if(!document.pointerLockElement&&!NOLOCK){lock();return;}if(e.button===0){fireHeld=true;fireQueued=true;queuedAt=clock;}if(e.button===2)adsHeld=true;});
 addEventListener('mouseup',e=>{if(e.button===0)fireHeld=false;if(e.button===2)adsHeld=false;});
 view.addEventListener('contextmenu',e=>e.preventDefault());
 addEventListener('wheel',e=>{if(screen!=='play'||clock-wheelAt<.15)return;wheelAt=clock;game.switchWeapon(e.deltaY>0?'next':'prev');},{passive:true});
 document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&screen==='play'&&!NOLOCK)setScreen('pause');});
 $('cine').addEventListener('mousedown',()=>cine.skip());$('replay-intro').onclick=e=>{e.preventDefault();introSeen=false;begin();};
 addEventListener('blur',()=>{keys.clear();fireHeld=false;adsHeld=false;if(screen==='play'&&!NOLOCK)setScreen('pause');});
 $('start').onclick=begin;$('resume').onclick=resume;$('restart').onclick=startGame;$('respawn').onclick=respawn;$('again').onclick=startGame;
 $('volume').oninput=e=>sound.setVolume(+e.target.value/100);
 addEventListener('resize',resize);
}
function resize(){
 if(!renderer)return;const w=innerWidth,h=innerHeight;
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,Number(params.get('dpr'))||1.25)*(drs?.scale??1));renderer.setSize(w,h,false);post?.resize();drs?.hold();
 // sharpen more the further the internal resolution sits below full
 if(post)post.uniforms.uSharp.value=params.has('sharp')?Number(params.get('sharp'))||0:.3+(1-(drs?.scale??1))*1.6;
 camera.aspect=w/h;weaponCamera.aspect=w/h;camera.updateProjectionMatrix();weaponCamera.updateProjectionMatrix();world?.configureView(camera);
}

// ---------------- boot ----------------
async function init(){
 // the scene is anti-aliased in the post chain's own 4x MSAA target; the canvas only ever receives one full-screen quad,
 // so a multisampled canvas would just add a resolve per frame (?aa=1 restores it for comparison)
 renderer=new T.WebGLRenderer({canvas:$('view'),antialias:params.get('aa')==='1',powerPreference:'high-performance'});renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;renderer.autoClear=false;renderer.info.autoReset=false;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;/* three 0.187 removed PCFSoft and silently swaps it for PCF on the first shadow pass, which changes every program key: programs warmed before that (the whole init compile) went stale and recompiled mid-play */
 scene=new T.Scene();weaponScene=new T.Scene();camera=new T.PerspectiveCamera(BASE_FOV,1,.08,1400);camera.rotation.order='YXZ';weaponCamera=new T.PerspectiveCamera(60,1,.012,20);
 $('load-label').textContent='生成雪山天光';installAlpineFog();const env=createAlpineEnvironment(renderer);
 scene.environment=env;scene.environmentIntensity=.34;scene.background=null;scene.fog=new T.FogExp2(LOOK.hazeTint.clone(),1);weaponScene.environment=env;weaponScene.environmentIntensity=1.0;
 weaponLights.sun=new T.DirectionalLight(SUN_COLOR,2.9);weaponLights.sky=new T.HemisphereLight(SKY_COLOR,BOUNCE_COLOR,1.15);weaponLights.fill=new T.DirectionalLight('#cfe0f0',.55);weaponScene.add(weaponLights.sun,weaponLights.sky,weaponLights.fill);
 world=createDefenseWorldV3({environment:'industrial',combatReadability:true,depthRange:false,enclosureOutput:false,snowScene:true,snowFree:true,snowTerrain:OV.length?{shape:overlookTerrain(OV),rock:overlookRock(OV),keepOut:overlookClear(OV)}:null});scene.add(world.root);world.setDisplayMode('desktop');world.core.visible=false;station=world.openStation;
 fx=new DefenseEffects(scene,{depthFeedback:true});sfx=createLevelFX(scene,{logo:params.get('logo')});
 post=createSnowPost(renderer,scene,camera,{sky:params.get('sky')==='white'?'white':'gradient',bloom:params.get('bloom')==='0'?0:LOOK.bloom,saturation:LOOK.saturation,curve:LOOK.curve});
 // r26: time of day and weather move with the run (level-mood.mjs). ?mood=<name> pins one, ?arc=<n> picks the run's arc, ?mood=off keeps the r25 light
 if(params.get('mood')!=='off'&&params.get('sky')!=='white'){mood=createMoodDirector({renderer,scene,weaponScene,lights:station.lights,weaponLights,post,weather:station.weather});post.setSky('mood');mood.fix(params.get('mood'));mood.setArc(Number(params.get('arc'))||0);}
 game=new LevelGame({world:{ground:groundAt,halfWidth:(S,side)=>station.field.rowInfo(S,side).w,boxes:()=>sceneBoxes,overlooks:OV,roam:params.get('roam')==='off'?.9:LEVEL.roam},seed:Number(params.get('seed'))||0x5e0a,godMode:params.get('god')==='1'});
 resize();buildCompass();
 $('load-label').textContent='载入装备';
 let soldiers=null,propModels=null,setModels=null,arms=null,palmModel=null;
 [weapon,,,soldiers,propModels,setModels,arms,palmModel]=await Promise.all([loadViewmodel((n,t)=>{$('load-label').textContent=`装备动作 ${n} / ${t}`;}),sound.prepare(),world.prepareAssets({enemyUrl:'assets/industrial-r10/interceptor.glb'}),
  // r26: the generated soldiers; without them (?soldiers=box, or a missing file) the crowd stays the r24 box troops
  params.get('soldiers')==='box'?null:loadCrowdModels().catch(e=>{console.warn('soldier models unavailable',e);return null;}),
  // r26: the outposts along the route (level-props.mjs); ?props=off leaves the valley empty
  params.get('props')==='off'?null:loadPropModels().catch(e=>{console.warn('prop models unavailable',e);return null;}),
  // r26: the snowcat and the dreadnought (level-set.mjs)
  loadSetModels().catch(e=>{console.warn('set-piece models unavailable',e);return null;}),
  // r26: the generated minigun and launcher (level-arms.mjs); ?arms=kit keeps the bolt-on kits
  params.get('arms')==='kit'?null:loadWeaponModels().catch(e=>{console.warn('weapon models unavailable',e);return null;}),
  // r27: the generated hand of ice for the sky palm (level-palm.mjs); without it a stand-in built from capsules
  loadSkyPalm().catch(e=>{console.warn('sky palm model unavailable',e);return null;})]);
 if(palmModel){sfx.palms.setModel(palmModel.geometry,palmModel.map);renderer.initTexture(palmModel.map);}
 if(soldiers)sfx.crowd.useModels(soldiers);
 if(propModels){props=new PropField(scene,propModels,{groundAt,layout:[...LAYOUT,...overlookProps()]});for(const t of props.textures)renderer.initTexture(t);/* uploaded now: a 2048 map decoded on first sight is a visible hitch */}
 setp=createSetPieces(scene,sfx,setModels,{groundAt,halfWidth:(S,side)=>station.field.rowInfo(S,side).w});for(const t of setp.textures)renderer.initTexture(t);
 if(soldiers)for(const m of Object.values(soldiers))for(const x of m.materials)for(const t of [x.map,x.roughnessMap,x.emissiveMap])if(t)renderer.initTexture(t);
 weaponScene.add(weapon.host);tuneViewmodel(weapon.root);attachments=buildAttachments(arms);if(arms)for(const m of Object.values(arms))for(const t of [m.material.map,m.material.roughnessMap])renderer.initTexture(t);applyWeaponVisual('rifle');
 $('load-label').textContent='准备战场';
 // warm every program once (enemy, bursts, explosion, smoke) so the first fight does not stall
 const warm={id:-1,x:2.5,y:2.2,z:2,hp:3,maxHP:3,state:'moving',spawnedAt:-.1,hitAt:-99,attackProgress:.5,face:[0,7.8],beam:false};
 station.setView(0,7.8);world.update(0,{enemies:[warm]});fx.prewarm?.();sfx.explosions.trigger({position:[0,1,-6],radius:3,big:true,ground:0});sfx.smoke.puff({position:[0,2,-4]});sfx.explosions.update(.1);sfx.fire.update(.1,0,[0,0,0],null);
 sfx.stage(groundAt);sfx.prewarm();setp.stage(game,[0,groundAt(0,7.8),7.8],0);sfx.rockets.sync([{id:-1,position:[1,1.4,-5],direction:[0,0,-1]}],0);sfx.missiles.call({missileId:-1,target:[0,0,-14],delay:1,time:0,impactAt:1},0);sfx.missiles.update(.5);sfx.missiles.preview([0,0,-8],4,0);sfx.shock.trigger([0,0,-10],4,0);sfx.shock.update(.1);
 weapon.host.visible=true;weapon.flash.visible=true;updateCamera(0);
 renderer.setRenderTarget(post.target);await renderer.compileAsync(scene,camera);await renderer.compileAsync(weaponScene,weaponCamera);renderer.setRenderTarget(null);/* the weapon now draws into the HDR target too, so both compile against it */
 // one real hidden frame: compile() never draws, so the shadow-pass depth variants and the GPU pipeline per blend state (drone death fade) were still built on first use mid-fight
 {const ahead=camera.position.clone().addScaledVector(camera.getWorldDirection(new T.Vector3()),7);world.warmDraw(ahead.toArray());/* shadow-depth ladder: three's shared shadow depth material re-picks its program only when the caster switches between plain and instanced mesh, taking the side/map of whichever caster comes first, so the variant a frame needs depends on draw order (the first carpet strike compiled one mid-fight). Each side x map (x instance colour) caster here follows a caster of the other kind, so the warm frames compile every variant; the programs live on three's never-disposed depth material, and colorWrite/depthWrite off keeps the ladder out of the picture */const ladder=new T.Group();ladder.name='shadow depth ladder / warm-up only';{const g=new T.PlaneGeometry(.01,.01),tex=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);tex.needsUpdate=true;const mat=(side,map)=>new T.MeshBasicMaterial({side,map,colorWrite:false,depthWrite:false}),plain=m=>new T.Mesh(g,m),inst=(m,color)=>{const i=new T.InstancedMesh(g,m,1);if(color)i.setColorAt(0,new T.Color());return i;};for(const side of [T.FrontSide,T.BackSide,T.DoubleSide])for(const map of [null,tex]){ladder.add(inst(mat(T.FrontSide,null)),plain(mat(side,map)));for(const color of [false,true])ladder.add(plain(mat(T.FrontSide,null)),inst(mat(side,map),color));}ladder.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});ladder.position.copy(ahead);scene.add(ladder);}const unculled=[];scene.traverse(o=>{if(o.castShadow&&o.frustumCulled){o.frustumCulled=false;unculled.push(o);}});/* the shadow pass culls to the sun's box, so casters outside it (pines down the valley, the bombers) never got their depth variant *//* two frames: three runs the shadow pass before it sets up lights, so a frame's shadow-depth programs are keyed by the lights of the previous render of this scene; in play that is post's flake pass (flake layer only, zero lights), so only the second frame matches play */for(let i=0;i<2;i++){renderer.setRenderTarget(null);renderer.clear();syncWeaponLight();post.render(drawWeapon);}for(const o of unculled)o.frustumCulled=true;ladder.visible=false;world.warmDraw(null);}
 fx.reset();sfx.reset();setp.reset();world.reset();world.syncEnemies([]);weapon.flash.visible=false;
 for(const k of Object.values(attachments.kits))k.visible=false;applyWeaponVisual('rifle');
 comms=createComms({sound,root:$('comms'),enabled:params.get('voice')!=='0'});cine=createCine({root:$('cine'),comms,sound});
 const voiceReady=comms.load(),cineReady=cine.probe().then(ok=>{$('replay-intro').hidden=!ok.intro;FILM_OUT=ok.outro&&params.get('intro')!=='0';return ok;});
 bindInput();ready=true;$('start').disabled=false;$('load-label').textContent='开始行动';setScreen('title');
 window.levelDebug={
  build:BUILD,game,sfx,
  programs:()=>renderer.info.programs.map(p=>`${p.type}/${p.name}#${p.id}`),
  scene:()=>scene,weaponScene:()=>weaponScene,renderer:()=>renderer,weaponHost:()=>weapon.host,weapon:()=>weapon,weaponCamera:()=>weaponCamera,attachments:()=>attachments,post:()=>post,
  programKeys:()=>renderer.info.programs.map(p=>({n:`${p.type}/${p.name}`,id:p.id,k:p.cacheKey})),
  snapshot:()=>game.snapshot(),
  events:(n=80)=>game.events.slice(-n).map(e=>({...e})),
  view:()=>({screen,ready,fps:frameTimes.length>2?1000*(frameTimes.length-1)/(frameTimes.at(-1)-frameTimes[0]):0,camera:camera.position.toArray(),yaw:look.yaw,pitch:look.pitch,fov:camera.fov,ads:cam.ads,render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},pointerLock:!!document.pointerLockElement,size:[innerWidth,innerHeight],pixelRatio:renderer.getPixelRatio(),resolution:drs?drs.inspection():{scale:1,fixed:true},weaponShown:shownWeapon,attachments:attachments.profile,glassSent}),
  fx:()=>({...sfx.inspection(),effects:fx.inspection()}),palms:()=>sfx.palms,
  snow:()=>station.inspection(),
  mood:()=>mood,props:()=>props,set:()=>setp,camera:()=>camera,
  spy:(at=null,to=[0,0,0])=>{spy=at?{at,to}:null;document.body.dataset.spy=spy?'1':'';},

  start:()=>startGame(),
  look:(yaw,pitch=look.pitch)=>{look.yaw=yaw;look.pitch=pitch;},
  lookAt:(x,y,z)=>{const e=camera.position;look.yaw=Math.atan2(-(x-e.x),-(z-e.z));look.pitch=Math.atan2(y-e.y,Math.hypot(x-e.x,z-e.z));return {yaw:look.yaw,pitch:look.pitch};},
  keys:(list=[])=>{keys.clear();for(const k of list)keys.add(k);},
  fire:(hold=true)=>{fireHeld=hold;fireQueued=hold;queuedAt=clock;},
  ads:v=>{adsHeld=!!v;},
  teleport:(S,x=0)=>game.teleport(S,x),
  god:(v=true)=>{game.godMode=v;},
  switchWeapon:id=>game.switchWeapon(id),
  give:id=>game.give(id),
  crowd:()=>({...game.snapshot().crowd,combo:game.snapshot().combo,charge:game.charge,live:game.crowd.slice(0,400).map(m=>({id:m.id,kind:m.kind,state:m.state,position:[m.x,m.y,m.z]}))}),
  spawnCrowd:(n=40,dS=[14,26],kind='trooper')=>{const out=[];for(let i=0;i<n;i++){const S=game.S+dS[0]+Math.random()*(dS[1]-dS[0]),x=(Math.random()*2-1)*Math.max(1.5,station.field.rowInfo(S,1).w-1.5);out.push(game.spawnMinion(kind,S,x).id);}return out;},
  sound:()=>sound.snapshot(),comms:()=>comms.state(),say:(k,o)=>comms.say(k,o),cine:()=>cine.state(),begin:()=>begin(),bars,assets:()=>Promise.all([voiceReady,cineReady]),
  pause:()=>setScreen('pause'),resume,
 };
 requestAnimationFrame(frame);
 if(params.get('autostart')==='1')startGame();
}
init().catch(e=>{$('fatal').hidden=false;$('fatal').querySelector('p').textContent=e?.message||String(e);console.error(e);});
