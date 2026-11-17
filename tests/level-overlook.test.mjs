import test from 'node:test';
import assert from 'node:assert/strict';
import {LevelGame,LEVEL,WEAPONS,CROWD,OVERLOOK,OVERLOOKS,overlookAt,overlookLift,overlookOuter,overlookHeight,overlookTerrain,overlookClear,overlookRock,sToZ,zToS} from '../src/level-core.mjs';

// a plain valley: flat floor of half width W, then a hillside rising `slope` per metre; the overlooks are cut into it
const W=9,O=OVERLOOKS[0],K=OVERLOOK;
const valley=(slope=.9,list=[O])=>{const shape=overlookTerrain(list);return {ground:(x,z)=>shape(x,zToS(z),Math.max(0,Math.abs(x)-W)*slope,W),halfWidth:()=>W,boxes:()=>[],overlooks:list,roam:LEVEL.roam};};
function run(g,seconds,each){const n=Math.round(seconds*60);for(let i=0;i<n;i++){each?.(g);g.advance(1/60);}return g;}
const types=(g,type)=>g.events.filter(e=>e.type===type);
const mid=O.side*(W+K.inner+O.width/2);
// walk toward a point (the level's forward is -z; yaw turns left)
const toward=(g,x,S)=>{const p=g.player,dx=x-p.x,dz=sToZ(S)-p.z;g.setInput({forward:Math.hypot(dx,dz)>.3,yaw:Math.atan2(-dx,-dz)});};
function climb(g){
 g.teleport(O.S-K.lead+1,mid);g._triggers=()=>{};
 run(g,14,g=>toward(g,mid,O.S+O.ramp+O.shelf*.5));g.setInput({forward:false});run(g,.2);return g;
}

test('the overlook cut: flat ramp, flat shelf, untouched valley floor',()=>{
 const y=(e,u)=>overlookHeight(O,e,u,Math.max(0,e)*.9);
 assert.ok(Math.abs(y(K.inner+1,-2)-K.foot)<1e-9,'run-in is level');
 assert.ok(Math.abs(y(K.inner+1,O.ramp+5)-(K.foot+O.rise))<1e-9,'shelf sits rise above the foot');
 assert.ok(Math.abs(y(O.deep-.5,O.ramp+5)-(K.foot+O.rise))<1e-9,'shelf reaches its outer edge');
 assert.equal(y(-.5,O.ramp+5),0,'floor untouched');
 assert.equal(y(4,O.ramp+O.shelf+K.end+.1),4*.9,'hillside untouched past the end');
 // the ramp never asks for more than a walkable grade, the face is far too steep to stand on
 let steepest=0;for(let u=0;u<O.ramp;u+=.25)steepest=Math.max(steepest,(overlookLift(O,u+.25)-overlookLift(O,u))/.25);
 assert.ok(steepest<LEVEL.maxSlope*.6,`ramp grade ${steepest}`);
 assert.ok((y(K.inner-.6,O.ramp+5)-y(K.inner-1.2,O.ramp+5))/.6>LEVEL.slideSlope,'the face slides');
 for(const o of OVERLOOKS){assert.ok(o.deep+K.back<=LEVEL.roam+.6,o.id+' fits inside the open strip');assert.ok(o.S+o.ramp+o.shelf+K.end<LEVEL.endS,o.id+' ends before the level does');}
 assert.equal(overlookAt(OVERLOOKS,O.S+5,-O.side),null);assert.equal(overlookAt(OVERLOOKS,O.S+5,O.side),O);
 assert.ok(overlookOuter(O,0)<overlookOuter(O,O.ramp+3));
 assert.equal(overlookClear([O])(O.side*(W+5),O.S+O.ramp+4,W),true);assert.equal(overlookClear([O])(O.side*(W-3),O.S+O.ramp+4,W),false);
 assert.ok(overlookRock([O])(O.side*(W+1),O.S+O.ramp+4,()=>W)>.9);assert.equal(overlookRock([O])(O.side*(W-2),O.S+O.ramp+4,W),0);
});

test('walking up the ramp takes the overlook; leaving it ends the hold',()=>{
 const g=climb(new LevelGame({world:valley()}));
 assert.ok(Math.abs(g.player.y-(K.foot+O.rise))<.05,`on the shelf, y=${g.player.y}`);
 assert.equal(g.perch,O);assert.equal(g.high,O.id);
 const ev=types(g,'overlook');assert.equal(ev.length,1);assert.equal(ev[0].state,'enter');assert.equal(ev[0].overlook,O.id);
 assert.equal(g.snapshot().high.id,O.id);
 // off the inner edge: a fall to the floor, no damage, and the hold is over
 run(g,3,g=>toward(g,O.side*(W-4),g.S));
 assert.ok(g.player.y<.3&&g.player.onGround,`back on the floor, y=${g.player.y}`);
 assert.equal(g.perch,null);assert.equal(g.high,null);assert.equal(types(g,'overlook').at(-1).state,'leave');
 assert.equal(g.player.hp,LEVEL.hp);
});

test('the face cannot be climbed from the floor, with or without jumping',()=>{
 const g=new LevelGame({world:valley()});g._triggers=()=>{};
 const S=O.S+O.ramp+O.shelf*.5;g.teleport(S,O.side*(W-2));
 run(g,5,g=>toward(g,O.side*(W+6),S));
 assert.ok(g.player.y<1.2,`walking: y=${g.player.y}`);
 let k=0;run(g,12,g=>{toward(g,O.side*(W+6),S);if(k++%20===0)g.setInput({jump:true});});
 assert.ok(g.player.y<2.2,`hopping: y=${g.player.y}`);assert.equal(g.perch,null);
});

test('steepness is the wall on an open hillside',()=>{
 const gentle=new LevelGame({world:valley(.6,[])});gentle.teleport(40,0);
 run(gentle,8,g=>g.setInput({right:true,yaw:0}));
 assert.ok(Math.abs(gentle.player.x-(W+LEVEL.roam))<1e-6,`a gentle slope is open to the cap, x=${gentle.player.x}`);
 assert.ok(gentle.player.y>6);
 const steep=new LevelGame({world:valley(1.6,[])});steep.teleport(40,0);
 let k=0;run(steep,8,g=>{g.setInput({right:true,yaw:0});if(k++%25===0)g.setInput({jump:true});});
 assert.ok(steep.player.x<W+1.2,`a steep one is not, x=${steep.player.x}`);
 // without `roam` the floor's edge is the wall, as before
 const old=new LevelGame({world:{ground:()=>0,halfWidth:()=>W,boxes:()=>[]}});run(old,6,g=>g.setInput({right:true,yaw:0}));
 assert.ok(Math.abs(old.player.x-(W+.9))<1e-9);
});

test('soldiers below a held overlook come round by the ramp and cannot strike through the shelf',()=>{
 const g=climb(new LevelGame({world:valley(),godMode:false}));
 const S=g.S,under=O.side*(W-1.2);
 const a=g.spawnMinion('trooper',S,under),b=g.spawnMinion('trooper',S+14,0),c=g.spawnMinion('trooper',O.S+2,0);
 run(g,2.5);
 assert.equal(g.player.hp,LEVEL.hp,'nobody below reaches the player');
 assert.equal(types(g,'crowdWindup').length,0);
 assert.ok(zToS(a.z)<S-4,'the one under the shelf has set off for the ramp');
 assert.ok(a.y<1.5&&b.y<1.5,'and nobody walked up the face');
 run(g,16);
 const up=[a,b,c].filter(m=>!m.dead&&m.y>K.foot+O.rise-.6);
 assert.ok(up.length>=2,`soldiers on the shelf: ${up.length} (y ${[a,b,c].map(m=>m.y.toFixed(1))})`);
 assert.ok(g.player.hp<LEVEL.hp,'and now they do reach the player');
});

test('a soldier shoved off the shelf falls to the floor',()=>{
 const g=climb(new LevelGame({world:valley()}));
 const m=g.spawnMinion('brute',g.S+3,O.side*(W+K.inner+.8));assert.ok(m.y>5);
 g.setInput({trigger:false});m.kx=-O.side*14;m.staggerUntil=g.time+.5;m.state='stagger';
 const seen=[];run(g,.8,()=>seen.push(m.y));
 assert.ok(m.y<1.6,`at the bottom, y=${m.y}`);
 assert.ok(seen.some(y=>y>1.6&&y<5),'it passed through the air on the way');
});

test('kills from the shelf score and charge for more',()=>{
 const g=climb(new LevelGame({world:valley()}));const T=CROWD.trooper;
 const s0=g.score,c0=g.charge,m=g.spawnMinion('trooper',g.S+12,0);
 g._crowdDie(m,{},[]);
 assert.equal(g.score-s0,Math.round(T.score*K.bonus));assert.ok(Math.abs(g.charge-c0-T.charge*K.bonus)<1e-12);assert.equal(g.snapshot().high.kills,1);
 const f=new LevelGame({world:valley()});const n=f.spawnMinion('trooper',f.S+12,0);f._crowdDie(n,{},[]);assert.equal(f.score,T.score);
});

test('an arsenal crate comes down on the shelf as the overlook comes up, and arms the player',()=>{
 const g=new LevelGame({world:valley(),godMode:true});g.teleport(O.S-K.call-3,0);
 run(g,2,g=>g.setInput({forward:true,yaw:0}));
 const ahead=types(g,'overlookAhead');assert.equal(ahead.length,1);assert.equal(ahead[0].overlook,O.id);
 const d=g.airdrops.find(d=>d.loot==='perch');assert.ok(d);
 const e=Math.abs(d.x)-W,u=zToS(d.z)-O.S;assert.ok(e>K.inner+1&&e<O.deep-1&&u>O.ramp+2&&u<O.ramp+O.shelf-2,`on the shelf: e=${e} u=${u}`);
 g.setInput({forward:false});run(g,14);assert.equal(d.state,'landed');assert.ok(Math.abs(d.y-(K.foot+O.rise))<.05);
 assert.ok(!g.inv.rpg);g.openSupply(d);
 assert.equal(g.inv.minigun.reserve,WEAPONS.minigun.reserve);assert.equal(g.inv.rpg.reserve,WEAPONS.rpg.reserve);assert.equal(g.weapon,'minigun');
 run(g,1);assert.equal(types(g,'overlookAhead').length,1,'called once');
});

test('a crowd pressed against the face does not creep up it',()=>{
 const g=climb(new LevelGame({world:valley(),godMode:true}));
 for(let i=0;i<60;i++)g.spawnMinion(i%9?'trooper':'brute',g.S+2+(i%12)*1.5,O.side*(W-1-(i%5)*1.2));
 let worst=0;run(g,7,g=>{for(const m of g.crowd){const u=zToS(m.z)-O.S;if(u>O.ramp+1&&m.x*O.side>W)worst=Math.max(worst,m.y<K.foot+O.rise-.8?m.y:0);}});
 assert.ok(worst<1.6,`highest soldier on the face: ${worst}`);
 run(g,14);assert.ok(g.crowd.filter(m=>m.y>K.foot+O.rise-.6).length>20,'the crowd arrives by the ramp');
});
