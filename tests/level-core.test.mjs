import test from 'node:test';
import assert from 'node:assert/strict';
import {LevelGame,LEVEL,WEAPONS,ENCOUNTERS,CROWD,COMBO_TIERS,ENEMIES,CORNICES,AVALANCHE,VEHICLE,VEHICLES,sToZ,zToS} from '../src/level-core.mjs';

const flat=(extra={})=>({ground:()=>0,halfWidth:()=>9,boxes:()=>[],...extra});
function run(g,seconds,each){const n=Math.round(seconds*60);for(let i=0;i<n;i++){each?.(g);g.advance(1/60);}return g;}
const types=(g,type)=>g.events.filter(e=>e.type===type);
function parkDrone(g,S,x=0,y=1.6){const e=g.spawnEnemy('drone',S,x);Object.assign(e,{spawnedAt:-10,y,previous:[x,y,sToZ(S)],nextAttackAt:1e9});return e;}

test('walking follows the yaw and sprint is faster',()=>{
 const a=run(new LevelGame({world:flat()}),1,g=>g.setInput({forward:true,yaw:0}));
 const b=run(new LevelGame({world:flat()}),1,g=>g.setInput({forward:true,sprint:true,yaw:0}));
 assert.ok(a.S>LEVEL.startS+3.8&&a.S<LEVEL.startS+4.6,`walk S=${a.S}`);
 assert.ok(b.S-LEVEL.startS>6,`sprint S=${b.S}`);
 const c=run(new LevelGame({world:flat()}),1,g=>g.setInput({forward:true,yaw:Math.PI/2}));
 assert.ok(c.player.x<-3.8&&Math.abs(c.S-LEVEL.startS)<.01,'yaw 90° walks toward -x');
});

test('the valley walls and the start fence hold the player',()=>{
 const g=run(new LevelGame({world:flat()}),6,g=>g.setInput({right:true,yaw:0}));
 assert.ok(Math.abs(g.player.x)<=9.9+1e-9,`x=${g.player.x}`);
 run(g,6,g=>g.setInput({right:false,back:true}));
 assert.ok(g.S>=LEVEL.minS-1e-9);
});

test('jumping leaves the ground and lands again',()=>{
 const g=new LevelGame({world:flat()});g.setInput({jump:true});run(g,.2);
 assert.ok(g.player.y>.5&&!g.player.onGround);
 run(g,1.5);assert.equal(g.player.y,0);assert.ok(g.player.onGround);
 assert.equal(types(g,'jump').length,1);
});

test('the player follows terrain height and cannot climb a cliff',()=>{
 const slope=(x,z)=>-.05*z;
 const g=run(new LevelGame({world:flat({ground:slope})}),2,g=>g.setInput({forward:true,yaw:0}));
 assert.ok(Math.abs(g.player.y-slope(g.player.x,g.player.z))<1e-6);
 const wall=(x,z)=>z<5?3:0,h=run(new LevelGame({world:flat({ground:wall})}),3,g=>g.setInput({forward:true,yaw:0}));
 assert.ok(h.player.z>=5-1e-6&&h.player.y<.01,`z=${h.player.z} y=${h.player.y}`);
});

test('scenery boxes block the body circle',()=>{
 const box={id:'rock/1',min:[-1,0,4],max:[1,2,6]};
 const g=run(new LevelGame({world:flat({boxes:()=>[box]})}),2,g=>g.setInput({forward:true,yaw:0}));
 assert.ok(g.player.z>=6+LEVEL.radius-1e-6,`z=${g.player.z}`);
});

test('a rooted spruce blocks the body at its canopy skirt even though its crown box starts overhead',()=>{
 const tree={id:'tree/0/1',min:[-1.4,1.9,3],max:[1.4,8,6],column:{radius:2.2,base:0}};
 const g=run(new LevelGame({world:flat({boxes:()=>[tree]})}),3,g=>g.setInput({forward:true,yaw:0}));
 assert.ok(g.player.z>=4.5+2.2+LEVEL.radius*.5-1e-6,`walked into the canopy: z=${g.player.z}`);
 const plain={id:'tree/0/2',min:[-1.4,1.9,3],max:[1.4,8,6]};
 const h=run(new LevelGame({world:flat({boxes:()=>[plain]})}),3,g=>g.setInput({forward:true,yaw:0}));
 assert.ok(h.player.z<3,'without a column an overhead box does not block (the old behaviour this replaces)');
 // a dense stand: three overlapping skirts form one wall; walking and strafing into it never ends inside any
 const stand=[[-1.6,0],[1.4,.6],[0,-1.2]].map(([x,dz],i)=>({id:'tree/0/'+(10+i),min:[x-1,2,dz-1],max:[x+1,8,dz+1],column:{radius:2,base:0}}));
 const inside=g=>stand.some(b=>Math.hypot(g.player.x-(b.min[0]+b.max[0])/2,g.player.z-(b.min[2]+b.max[2])/2)<2+LEVEL.radius*.5-1e-6);
 const k=new LevelGame({world:flat({boxes:()=>stand})});let bad=0;
 run(k,6,g=>{g.setInput({forward:true,left:g.time%2<1,right:g.time%2>=1,yaw:0});if(inside(g))bad++;});
 assert.equal(bad,0,'the body entered a canopy in a dense stand');
});

test('rifle shots travel, hit and kill a drone; the magazine reloads from an endless reserve',()=>{
 const g=new LevelGame({world:flat(),godMode:true}),e=parkDrone(g,30);
 for(let i=0;i<3;i++){assert.ok(g.fire({origin:[0,1.6,7.8],target:[e.x,e.y,e.z]}),'shot '+i);run(g,.1);}
 assert.equal(types(g,'kill').length,1);assert.equal(g.kills,1);assert.equal(g.inv.rifle.mag,WEAPONS.rifle.mag-3);
 g.inv.rifle.mag=0;assert.equal(g.fire({origin:[0,1.6,7.8],target:[0,1.6,0]}),null);assert.ok(g.reloading);
 run(g,WEAPONS.rifle.emptyReload+.1);assert.equal(g.inv.rifle.mag,WEAPONS.rifle.mag);assert.equal(g.inv.rifle.reserve,Infinity);
});

test('the aim query reports the first thing under the view ray',()=>{
 const g=new LevelGame({world:flat()}),e=parkDrone(g,30);
 const a=g.aim([0,1.6,7.8],[0,0,-1]);assert.equal(a.type,'enemy');assert.equal(a.enemyId,e.id);
 const b=g.aim([0,1.6,7.8],[0,-.5,-1]);assert.equal(b.type,'ground');assert.ok(Math.abs(b.point[1])<.02);
});

test('weapons are switched only when owned; an airdrop delivers and equips a new one',()=>{
 const g=new LevelGame({world:flat()});
 assert.equal(g.switchWeapon('minigun'),false);assert.equal(g.switchWeapon('missile'),false);
 const d=g.dropSupply({S:18,x:1,loot:'minigun'});run(g,12);
 assert.equal(d.state,'landed');assert.equal(types(g,'airdropLanded').length,1);
 g.teleport(zToS(d.z),d.x+.5);g.setInput({interact:true});run(g,.7);
 assert.equal(d.state,'opened');assert.equal(g.weapon,'minigun');assert.deepEqual(g.snapshot().owned,['rifle','minigun']);
 run(g,.5);assert.ok(g.switchWeapon('rifle'));assert.equal(g.weapon,'rifle');assert.ok(g.switchWeapon('last'));assert.equal(g.weapon,'minigun');
 run(g,.5);assert.ok(g.switchWeapon('next'));assert.equal(g.weapon,'rifle');
});

test('the minigun has to spin up, then fires faster than the rifle and slows the gunner',()=>{
 const g=new LevelGame({world:flat()});g.give('minigun');assert.ok(g.switchWeapon('minigun'));run(g,.5);
 const shoot=()=>g.fire({origin:[0,1.6,7.8],target:[0,1.6,-20]});
 assert.equal(shoot(),null,'a cold barrel does not fire');
 g.setInput({trigger:true});run(g,.1);assert.equal(shoot(),null,'still spinning up');
 run(g,WEAPONS.minigun.spinUp);let n=0;run(g,1,()=>{if(shoot())n++;});
 assert.ok(n>=20,`only ${n} rounds in a second at full spin`);
 g.setInput({forward:true,yaw:0});const before=g.S;run(g,1,()=>shoot());
 assert.ok(g.S-before<LEVEL.walk*.8,`moved ${g.S-before} m while spinning`);
 g.setInput({trigger:false,forward:false});run(g,WEAPONS.minigun.spinDown+.05);assert.equal(g.spin,0);
});

test('walking into a trigger starts the authored encounter: soldiers break out of the snow ahead',()=>{
 const g=new LevelGame({world:flat()}),first=ENCOUNTERS[0];
 g.teleport(first.at+.5);run(g,.05);
 assert.equal(types(g,'encounter')[0].encounter,first.id);
 run(g,1.5);const spawned=types(g,'crowdSpawn');assert.ok(spawned.length>=6,`${spawned.length} soldiers after 1.5 s`);
 for(const e of spawned)assert.ok(zToS(e.position[2])>g.S+30,'a soldier appeared too close to the player');
 run(g,first.crowd.count/first.crowd.rate+5);
 assert.equal(types(g,'crowdSpawn').length,first.crowd.count);
 assert.equal(g.enemies.filter(e=>e.type==='drone').length,first.spawns.length);
});

test('the crowd rushes the player, keeps its spacing and a few at a time swing at a still player',()=>{
 const g=new LevelGame({world:flat()});
 for(let i=0;i<60;i++)g.spawnMinion('trooper',g.S+18+(i%6)*1.2,-4+Math.floor(i/6)*.9);
 run(g,8);
 const near=g.crowd.filter(m=>Math.hypot(m.x-g.player.x,m.z-g.player.z)<3);assert.ok(near.length>=8,`${near.length} soldiers reached the player`);
 let overlap=0;for(const a of g.crowd)for(const b of g.crowd)if(a.id<b.id&&Math.hypot(a.x-b.x,a.z-b.z)<.36*(a.scale+b.scale)*.6)overlap++;
 assert.ok(overlap<=3,`${overlap} soldier pairs stand inside each other`);
 assert.ok(g.crowd.every(m=>Math.hypot(m.x-g.player.x,m.z-g.player.z)>=LEVEL.radius+.25),'a soldier stands inside the player');
 const strikes=types(g,'crowdStrike');assert.ok(strikes.length>0);assert.ok(g.player.hp<LEVEL.hp);
 let worst=0;for(let i=0;i<240;i++){g.advance(1/120);worst=Math.max(worst,g.crowd.filter(m=>m.state==='attack').length);}
 assert.ok(worst<=LEVEL.maxAttackers,`${worst} attacking at once`);
 const h=new LevelGame({world:flat(),godMode:true});for(let i=0;i<20;i++)h.spawnMinion('trooper',h.S+3+i*.5,0);run(h,6);assert.equal(h.player.hp,LEVEL.hp);
});

test('a rifle round passes through one soldier into the next; a head shot drops a soldier with one round',()=>{
 const g=new LevelGame({world:flat()}),a=g.spawnMinion('trooper',g.S+10,0),b=g.spawnMinion('trooper',g.S+11.2,0);
 a.speed=b.speed=0;
 g.fire({origin:[0,1.1,g.player.z],target:[0,1.1,g.player.z-30]});run(g,.2);
 const hits=types(g,'crowdHit');assert.deepEqual(hits.map(h=>h.crowdId),[a.id,b.id]);assert.ok(hits.every(h=>!h.head));
 const c=g.spawnMinion('trooper',g.S+14,3);c.speed=0;run(g,.2);
 g.fire({origin:[3,c.y+1.6*c.scale,g.player.z],target:[3,c.y+1.6*c.scale,c.z]});run(g,.2);
 const k=types(g,'crowdKill').find(e=>e.crowdId===c.id);assert.ok(k&&k.head,'head shot did not kill');
 assert.ok(types(g,'crowdHit').some(h=>h.crowdId===c.id&&h.head));
});

test('a rocket throws a packed group, counts a multi-kill and builds the combo',()=>{
 const g=new LevelGame({world:flat()});g.give('rpg');assert.ok(g.switchWeapon('rpg'));run(g,.5);
 const pack=[];for(let i=0;i<14;i++){const m=g.spawnMinion('trooper',g.S+30+(i%4)*1.1,-2+Math.floor(i/4)*1.2);m.speed=0;pack.push(m);}
 assert.ok(g.fire({origin:[0,1.5,g.player.z],target:[0,.9,sToZ(g.S+31.5)]}));run(g,1);
 const kills=types(g,'crowdKill').filter(e=>e.weapon==='rpg');assert.ok(kills.length>=10,`${kills.length} of 14 killed`);
 assert.ok(kills.every(k=>k.direction[1]>.3&&k.force>3),'bodies were not thrown up and out');
 assert.ok(types(g,'multiKill').length===1);assert.ok(g.combo>=10);
 assert.equal(types(g,'combo').at(-1).label,COMBO_TIERS[0].label);
 assert.equal(g.player.hp,LEVEL.hp,'a rocket thirty metres away does not hurt the shooter');
 run(g,LEVEL.comboWindow+.1);assert.equal(g.combo,0);assert.ok(g.bestCombo>=10);assert.equal(types(g,'comboEnd').length,1);
});

test('a bomber dies in a blast that sets off the bombers around it, and hurts a player standing close',()=>{
 const g=new LevelGame({world:flat()});
 const line=[];for(let i=0;i<6;i++){const m=g.spawnMinion('bomber',g.S+20+i*2.6,0);m.speed=0;line.push(m);}
 const t=line[0];g._hitCrowd(t,5,{point:[t.x,t.y+1,t.z],direction:[0,0,-1]},[]);run(g,1.5);
 assert.ok(line.every(m=>m.dead),'the chain stopped');
 const blasts=types(g,'explosion').filter(e=>e.source==='bomber');assert.equal(blasts.length,6);
 assert.ok(new Set(blasts.map(b=>b.time.toFixed(3))).size>=3,'the chain should ripple, not pop all at once');
 assert.equal(g.player.hp,LEVEL.hp);
 const h=new LevelGame({world:flat()}),m=h.spawnMinion('bomber',h.S+6,0);run(h,3);
 assert.ok(m.dead);assert.ok(types(h,'explosion').some(e=>e.source==='bomber'));assert.ok(h.player.hp<LEVEL.hp-5,`hp ${h.player.hp}`);
});

test('kills charge the tactical missile; the marked point is struck after a delay and the gun comes back',()=>{
 const g=new LevelGame({world:flat()});
 assert.ok(!g.snapshot().owned.includes('missile'));
 let n=0;while(g.charge<1&&n<400){const m=g.spawnMinion('trooper',g.S+40,0);g._hitCrowd(m,9,{point:[m.x,m.y+1,m.z],direction:[0,0,-1]},[]);n++;}
 assert.ok(n>60&&n<120,`${n} kills to charge`);
 assert.equal(types(g,'missileReady').length,1);assert.ok(g.snapshot().owned.includes('missile'));
 run(g,.2);const field=[];for(let i=0;i<30;i++){const m=g.spawnMinion('trooper',g.S+60+(i%6)*2,-6+Math.floor(i/6)*3);m.speed=0;field.push(m);}
 const brute=g.spawnMinion('brute',g.S+64,0);brute.speed=0;
 assert.ok(g.switchWeapon('missile'));run(g,.5);
 const call=g.fire({origin:[0,1.5,g.player.z],target:[0,0,sToZ(g.S+64)]});assert.ok(call&&call.missile);
 assert.equal(g.charge,0);run(g,.8);assert.equal(g.weapon,'rifle');assert.ok(!g.snapshot().owned.includes('missile'));
 assert.ok(field.every(m=>!m.dead),'struck before the delay');
 run(g,WEAPONS.missile.delay);
 assert.equal(types(g,'missileImpact').length,1);assert.ok(field.every(m=>m.dead)&&brute.dead,'the strike left survivors');
 run(g,1);assert.ok(types(g,'explosion').filter(e=>e.source==='secondary').length>=5);
 assert.equal(g.player.hp,LEVEL.hp);
});

test('a few hundred soldiers stay cheap to simulate',()=>{
 const g=new LevelGame({world:flat()});
 for(let i=0;i<LEVEL.crowdCap;i++)g.spawnMinion(i%17?'trooper':'brute',g.S+20+(i%20)*1.3,-8+Math.floor(i/20)*1.4);
 g.give('minigun');g.switchWeapon('minigun');run(g,.5);g.setInput({trigger:true});
 const t0=performance.now();run(g,4,g=>g.fire({origin:[0,1.4,g.player.z],target:[0,1.1,g.player.z-30]}));const ms=performance.now()-t0;
 assert.ok(ms<2500,`4 s of simulation took ${ms.toFixed(0)} ms`);
 assert.ok(g.crowdKills>20,`${g.crowdKills} kills`);
});

test('a drone winds up, locks and hits a still player; moving after the lock dodges',()=>{
 const g=new LevelGame({world:flat()}),e=parkDrone(g,24,0,2.4);e.nextAttackAt=0;
 run(g,1.6);const hit=types(g,'enemyFire')[0];
 assert.ok(types(g,'windup').length>=1);assert.ok(hit&&hit.hit);assert.equal(g.player.hp,LEVEL.hp-11);
 const h=new LevelGame({world:flat()}),f=parkDrone(h,24,0,2.4);f.nextAttackAt=0;
 run(h,.05);assert.equal(f.state,'windup');run(h,.8);h.teleport(h.S,2.4);run(h,.5);
 const miss=types(h,'enemyFire')[0];assert.ok(miss&&!miss.hit);assert.equal(h.player.hp,LEVEL.hp);
});

test('downing the hidden logo target calls a carpet strike that clears the drones and the crowd, and drops gold',()=>{
 const g=new LevelGame({world:flat(),godMode:true});
 const drones=[parkDrone(g,40,-6,2.6),parkDrone(g,44,6,2.6)],heavy=g.spawnEnemy('heavy',50,0);Object.assign(heavy,{spawnedAt:-10,y:3.5});
 const crowd=[];for(let i=0;i<30;i++){const m=g.spawnMinion('trooper',g.S+40+(i%10)*2,-4+Math.floor(i/10)*4);m.speed=0;crowd.push(m);}
 const logo=g.spawnEnemy('logo',60,0);
 g._damageEnemy(logo,99,{point:[logo.x,logo.y,logo.z],direction:[0,0,-1]},[]);
 assert.equal(g.logoState,'down');assert.equal(types(g,'airstrike').length,1);assert.ok(g.bombs.length>=22);
 assert.ok(g.airdrops.some(d=>d.gold));
 run(g,6);
 assert.ok(types(g,'explosion').filter(e=>e.source==='airstrike').length>=22);
 for(const d of [...drones,heavy])assert.ok(d.hp<=0,`enemy ${d.id} survived with ${d.hp}`);
 assert.ok(crowd.filter(m=>m.dead).length>=26,`${crowd.filter(m=>m.dead).length} of 30 soldiers died`);
 assert.equal(g.player.hp,LEVEL.hp,'the strike never hurts the player');
});

test('the logo target weaves inside the open valley, clear of the slope forest',()=>{
 const g=new LevelGame({world:flat()});g.spawnEnemy('logo',60,-11);let worst=0;
 run(g,3);run(g,15,g=>{const l=g.enemies.find(e=>e.type==='logo');if(l)worst=Math.max(worst,Math.abs(l.x));});
 assert.ok(worst<=9-1.2,`logo reached |x|=${worst.toFixed(2)} in a 9 m half-width valley`);
});

test('the logo target escapes if ignored',()=>{
 const g=new LevelGame({world:flat()});g.spawnEnemy('logo',60,0);run(g,23.5);
 assert.equal(g.logoState,'escaped');assert.equal(g.enemies.length,0);
});

test('rockets explode on contact and hurt the shooter only at danger-close range',()=>{
 const g=new LevelGame({world:flat()});g.give('rpg');assert.ok(g.switchWeapon('rpg'));run(g,.5);
 assert.ok(g.fire({origin:[0,1.5,7.8],target:[0,0,5.6]}));run(g,.4);
 const boom=types(g,'explosion')[0];assert.ok(boom&&boom.big);assert.ok(g.player.hp<LEVEL.hp);
 assert.equal(types(g,'playerHit').at(-1).cause,'self');
 assert.equal(g.inv.rpg.mag,0);run(g,WEAPONS.rpg.reload+.1);assert.equal(g.inv.rpg.mag,0,'no auto reload without a trigger pull');
 g.fire({origin:[0,1.5,7.8],target:[0,1.5,-30]});run(g,WEAPONS.rpg.emptyReload+.1);assert.equal(g.inv.rpg.mag,1);
});

test('going down returns the player to the last checkpoint with re-armed encounters',()=>{
 const g=new LevelGame({world:flat()});g.teleport(130);run(g,.05);
 assert.equal(g.checkpoint,120);
 g._hurt(200,[0,0,0],[],'beam');assert.equal(g.state,'down');
 assert.ok(g.respawn());assert.equal(g.state,'running');assert.equal(g.player.hp,LEVEL.hp);assert.ok(Math.abs(g.S-120)<1e-9);
 assert.equal(g.enemies.length,0);assert.equal(g.crowd.length,0);assert.ok(!g.triggered.has('glacier-surge'));
});

test('holding at the beacon brings the dreadnought; the level is won when the upload is done and it is down',()=>{
 const g=new LevelGame({world:flat(),godMode:true});g.teleport(LEVEL.beaconS-8);
 run(g,LEVEL.holdTime+2);
 assert.equal(g.state,'running','the hold alone no longer ends the level');
 const b=g.enemies.find(e=>e.type==='boss');assert.ok(b,'no dreadnought');assert.equal(types(g,'spawn').filter(e=>e.enemyType==='boss').length,1);
 assert.ok(types(g,'crowdSpawn').length>=100,`${types(g,'crowdSpawn').length} soldiers in the hold`);
 g._damageEnemy(b,1e6,{point:[b.x,b.y,b.z],direction:[0,0,-1]},[]);
 assert.equal(types(g,'bossDown').length,1);run(g,1.5);assert.equal(g.state,'running','it is still coming apart');
 run(g,3.6);
 assert.equal(g.state,'won');assert.equal(types(g,'win').length,1);assert.equal(g.crowd.length,0);
 assert.ok(types(g,'explosion').filter(e=>e.source==='bossWreck').length>=8,'the wreck did not go up');
});

test('the simulation is deterministic for a seed',()=>{
 const play=()=>{const g=new LevelGame({world:flat(),seed:7});g.teleport(31);run(g,6,g=>{g.setInput({forward:true,yaw:.2});if(g.time%1<.02)g.fire({origin:[g.player.x,1.6,g.player.z],target:[0,2,g.player.z-20]});});const s=g.snapshot();return JSON.stringify({s,crowd:g.crowd.map(m=>[m.id,m.x,m.z,m.hp,m.state])});};
 assert.equal(play(),play());
});

test('event ids are one strictly rising sequence, so a page reading `id > lastId` sees every event; soldiers are named by crowdId',()=>{
 const g=new LevelGame({world:flat(),seed:11});g.teleport(31);
 const seen=[];let last=0;
 run(g,5,g=>{g.setInput({trigger:true});g.fire({origin:[g.player.x,1.6,g.player.z],target:[g.player.x,1.2,g.player.z-20]});for(const e of g.events)if(e.id>last){last=e.id;seen.push(e);}});
 const ids=g.events.map(e=>e.id);
 for(let i=1;i<ids.length;i++)assert.ok(ids[i]>ids[i-1],`event ${i} id ${ids[i]} after ${ids[i-1]}`);
 assert.equal(seen.length,g.events.length,'a lastId reader skipped events');
 const crowdEvents=g.events.filter(e=>e.type.startsWith('crowd'));
 assert.ok(types(g,'crowdSpawn').length>10&&types(g,'crowdKill').length>0,'the fight did not happen');
 assert.ok(crowdEvents.every(e=>Number.isInteger(e.crowdId)),'a crowd event lost its soldier');
});

// r26 · props: solid boxes the soldiers walk round, and fuel drums that blow up
const box=(id,S,x,{w=1.4,d=1.3,h=1.1,...rest}={})=>({id,min:[x-w/2,-.3,sToZ(S)-d/2],max:[x+w/2,h,sToZ(S)+d/2],solid:true,...rest});
const DRUM={radius:6.5,damage:22,playerDamage:38,hp:3};
const inside=(m,b,r=0)=>m.x>b.min[0]-r&&m.x<b.max[0]+r&&m.z>b.min[2]-r&&m.z<b.max[2]+r;

test('soldiers walk round a solid prop instead of through it, and still reach the player',()=>{
 const wall=box('prop:0',26,0,{w:4,d:1.4,h:1.5}),g=new LevelGame({world:flat({boxes:()=>[wall]}),godMode:true,seed:3});
 const squad=[-1.2,-.4,.4,1.2].map(x=>g.spawnMinion('trooper',34,x));let through=0,reached=0;
 run(g,14,g=>{for(const m of squad){if(!m.dead&&inside(m,wall,-.05))through++;if(zToS(m.z)<g.S+3)reached++;}});
 assert.equal(through,0,'a soldier stood inside the prop');
 assert.ok(reached>0,'nobody got round the prop');
});

test('a soldier is never spawned inside a solid prop',()=>{
 const b=box('prop:0',40,2,{w:3,d:3}),g=new LevelGame({world:flat({boxes:()=>[b]})});
 const m=g.spawnMinion('trooper',40,2);assert.ok(!inside(m,b),`spawned at ${m.x},${m.z}`);
});

test('a fuel drum takes three rifle hits, then blows up the squad round it and sets off the next drum',()=>{
 const a=box('prop:0',30,0,{explosive:DRUM}),b=box('prop:1',34,3,{explosive:DRUM}),far=box('prop:2',70,0,{explosive:DRUM});
 const g=new LevelGame({world:flat({boxes:()=>[a,b,far].filter(o=>!g.spent.has(o.id))}),godMode:true,seed:5});
 const squad=[];for(let i=0;i<8;i++){const m=g.spawnMinion('trooper',31+(i%4),-2+(i>>2)*3);m.speed=0;squad.push(m);}
 const aim={origin:[0,1.4,g.player.z],target:[0,.6,sToZ(30)]};let shots=0;
 run(g,1.2,g=>{if(!g.spent.has('prop:0')&&g.fire(aim))shots++;});
 assert.equal(shots,3,`${shots} shots to set the drum off`);assert.equal(types(g,'propHit').length,2);
 run(g,1);
 const blown=types(g,'propExplode').map(e=>e.colliderId);
 assert.deepEqual(blown.sort(),['prop:0','prop:1'],'the second drum chains, the far one does not');
 assert.ok(types(g,'explosion').filter(e=>e.source==='barrel').length===2);
 assert.ok(squad.filter(m=>m.dead).length>=6,`${squad.filter(m=>m.dead).length} of 8 soldiers died`);
 assert.ok(g.spent.has('prop:0')&&g.spent.has('prop:1')&&!g.spent.has('prop:2'));
});

test('standing next to a drum that goes up hurts, and a restart stands the drums back up',()=>{
 const a=box('prop:0',17,2.5,{explosive:DRUM}),g=new LevelGame({world:flat({boxes:()=>[a].filter(o=>!g.spent.has(o.id))})});
 g._hitProp('prop:0',Infinity,[]);run(g,.3);
 assert.ok(g.player.hp<LEVEL.hp&&g.player.hp>0,`hp ${g.player.hp}`);assert.ok(g.spent.has('prop:0'));
 g.restart();assert.equal(g.spent.size,0);assert.equal(g.propHP.size,0);
});

// r26 · cornices and avalanches, the snowcats, the dreadnought
const quiet=g=>{for(const e of ENCOUNTERS)g.triggered.add(e.id);return g;};

test('shooting a cornice releases the slope: soldiers in its stretch are buried and scored, the rest are not',()=>{
 const g=quiet(new LevelGame({world:flat(),seed:9}));g.teleport(100);
 const c=g.cornices.find(o=>o.id==='pine'),under=[];
 for(let i=0;i<12;i++){const m=g.spawnMinion('trooper',116+i*2.8,-7+i*1.2);m.speed=0;under.push(m);}
 const beyond=g.spawnMinion('trooper',160,0),before=g.spawnMinion('trooper',108,4);beyond.speed=before.speed=0;
 let shots=0;run(g,1.4,g=>{if(c.state==='ready'&&g.fire({origin:g.eye(),target:[c.x,c.y,c.z]}))shots++;});
 assert.equal(c.state,'released');assert.equal(types(g,'corniceHit').length,AVALANCHE.hp,`${shots} rifle rounds fired`);
 const a=types(g,'avalanche')[0];assert.ok(a&&!a.danger&&a.S0===112&&a.S1===152&&a.side===-1);
 run(g,.5);assert.ok(under.every(m=>!m.dead),'nothing is buried before the slide reaches the floor');
 run(g,4);
 assert.ok(under.every(m=>m.dead),`${under.filter(m=>m.dead).length} of 12 buried`);assert.ok(!beyond.dead&&!before.dead,'the slide left its stretch');
 assert.ok(types(g,'crowdKill').filter(e=>e.cause==='avalanche'&&e.score>0).length===12);assert.equal(g.kills,12);assert.ok(g.bestCombo>=10);
 assert.deepEqual(types(g,'avalancheEnd').map(e=>[e.buried,e.caught]),[[12,false]]);assert.equal(g.player.hp,LEVEL.hp);assert.equal(g.flows.length,0);
});

test('standing under a cornice that goes is paid for; one rocket is enough to bring it down; a restart hangs it again',()=>{
 const g=quiet(new LevelGame({world:flat()}));g.teleport(132);g.give('rpg');g.switchWeapon('rpg');run(g,.6);
 const c=g.cornices.find(o=>o.id==='pine');
 g.fire({origin:g.eye(),target:[c.x,c.y,c.z]});run(g,1);
 assert.equal(c.state,'released');assert.ok(types(g,'avalanche')[0].danger);
 run(g,3);const hit=types(g,'playerHit').filter(e=>e.cause==='avalanche');
 assert.equal(hit.length,1);assert.equal(hit[0].damage,AVALANCHE.playerDamage);assert.equal(g.state,'running');
 const drone=parkDrone(g,214,0,2);g.releaseCornice('canyon');run(g,4);assert.ok(drone.hp<=0,'a low drone is knocked down by the slide');
 g.restart();assert.ok(g.cornices.every(o=>o.state==='ready'&&o.hp===AVALANCHE.hp));
});

const aboard=(extra={})=>{const g=quiet(new LevelGame({world:flat(extra),seed:4})),v=g.vehicles[0];g.teleport(v.S0,v.x-3.2);run(g,.7,g=>g.setInput({interact:true}));g.setInput({interact:false});return {g,v};};

test('a snowcat is boarded with the interact key, outruns a sprint, turns toward the view and is left the same way',()=>{
 const {g,v}=aboard();
 assert.equal(g.driving,v);assert.equal(types(g,'vehicleEnter').length,1);assert.equal(g.snapshot().driving,v.id);
 const h=quiet(new LevelGame({world:flat()})),w=h.vehicles[0];h.teleport(w.S0,w.x-3.2);run(h,2,h=>h.setInput({interact:true}));
 assert.equal(h.driving,w,'holding the key on does not climb straight back out');
 assert.equal(g.fire({origin:g.eye(),target:[0,1,g.player.z-20]}),null,'no shooting from the cab');
 const S0=g.S;run(g,3,g=>g.setInput({forward:true,yaw:0}));
 assert.ok(v.speed>12&&v.speed<=VEHICLE.forward+1e-9,`speed ${v.speed}`);assert.ok(g.S-S0>20,`${g.S-S0} m in 3 s`);assert.ok(Math.abs(g.player.x-v.x)<1e-9&&Math.abs(g.player.z-v.z)<1e-9);
 run(g,1.2,g=>g.setInput({forward:true,yaw:.9}));assert.ok(Math.abs(v.yaw-.9)<.05,`yaw ${v.yaw}`);
 run(g,2.5,g=>g.setInput({forward:false,yaw:.9}));run(g,.5,g=>g.setInput({interact:true}));
 assert.equal(g.driving,null);assert.equal(v.state,'parked');assert.ok(Math.hypot(g.player.x-v.x,g.player.z-v.z)>2,'stands beside it');
 assert.equal(types(g,'vehicleExit').length,1);
 run(g,2,g=>g.setInput({interact:false,forward:true,yaw:Math.atan2(-(v.x-g.player.x),-(v.z-g.player.z))}));
 assert.ok(g._hull(v).every(k=>Math.hypot(g.player.x-k[0],g.player.z-k[1])>=k[2]+LEVEL.radius-1e-6),'walked into the parked hull');
});

test('ramming at speed throws soldiers aside and scores them; at a crawl it only shoulders them out of the way',()=>{
 const {g,v}=aboard(),line=[];
 for(let i=0;i<14;i++){const m=g.spawnMinion('trooper',v.S0+22+i*1.6,v.x+(i%3-1)*.9);m.speed=0;line.push(m);}
 const brute=g.spawnMinion('brute',v.S0+50,v.x);brute.speed=0;
 run(g,5.5,g=>g.setInput({forward:true,yaw:0}));
 assert.ok(line.every(m=>m.dead),`${line.filter(m=>m.dead).length} of 14 run down`);assert.ok(brute.dead,'a brute at full speed goes too');
 assert.equal(types(g,'crowdKill').filter(e=>e.cause==='ram').length,15);assert.equal(g.kills,15);assert.ok(g.bestCombo>=10);
 assert.ok(v.hp<VEHICLE.hp&&v.hp>VEHICLE.hp-40,`wear ${VEHICLE.hp-v.hp}`);assert.equal(g.player.hp,LEVEL.hp);
 const slow=aboard(),m=slow.g.spawnMinion('trooper',slow.v.S0+1.5,slow.v.x+.2);m.speed=0;
 run(slow.g,1,g=>g.setInput({forward:false}));
 assert.ok(!m.dead,'a parked snowcat kills nobody');assert.ok(Math.abs(m.x-slow.v.x)>=VEHICLE.half[0],'pushed out from under the hull');
});

test('what hits a driven snowcat wears the snowcat, not the driver; spent, it throws the driver clear and goes up',()=>{
 const {g,v}=aboard();
 g._hurt(50,[0,0,0],[],'beam');
 assert.equal(g.player.hp,LEVEL.hp);assert.ok(Math.abs(v.hp-(VEHICLE.hp-50*VEHICLE.armor))<1e-9);assert.equal(types(g,'vehicleHit').length,1);
 g._hurt(2000,[0,0,0],[],'beam');
 assert.equal(g.driving,null);assert.equal(v.state,'wreck');assert.equal(types(g,'vehicleDestroyed').length,1);assert.ok(types(g,'vehicleExit')[0].thrown);
 run(g,.3);assert.equal(types(g,'explosion').filter(e=>e.source==='vehicle').length,1);assert.ok(g.player.hp<LEVEL.hp&&g.player.hp>0,`hp ${g.player.hp}`);
 run(g,1,g=>g.setInput({interact:true}));assert.equal(g.driving,null,'a wreck is not boarded');
});

test('a snowcat goes straight through a barrier and sets off a drum, but a cabin stops it; going down parks it where it was',()=>{
 const x=VEHICLES[0].x,S=VEHICLES[0].S;
 const barrier=box('prop:0',S+14,x,{prop:'barrier'}),drum=box('prop:1',S+30,x,{prop:'fuel-barrels',explosive:DRUM}),cabin=box('prop:2',S+52,x,{prop:'outpost-cabin',w:3,d:3,h:3});
 const {g,v}=aboard({boxes:()=>[barrier,drum,cabin]});
 run(g,7,g=>g.setInput({forward:true,yaw:0}));
 assert.deepEqual(types(g,'propBreak').map(e=>e.colliderId),['prop:0']);assert.ok(g.spent.has('prop:0')&&g.spent.has('prop:1'));
 assert.equal(types(g,'propExplode').length,1);assert.ok(types(g,'vehicleHit').some(e=>e.cause==='blast'),'the drum it ran into hurt it');
 assert.ok(zToS(v.z)<S+52-1.5-VEHICLE.circle[1]+1e-6,`stopped at S ${zToS(v.z)}`);assert.ok(types(g,'vehicleCrash').length>=1);assert.ok(Math.abs(v.speed)<2);
 g.leave();g._hurt(500,[0,0,0],[],'beam');assert.equal(g.state,'down');g.respawn();
 assert.equal(v.state,'parked');const again=g.vehicles[0];assert.ok(Math.abs(zToS(again.z)-S)<1e-9&&again.hp===VEHICLE.hp,'the snowcat ahead of the checkpoint is back on its mark');
});

const duel=(opts={})=>{const g=quiet(new LevelGame({world:flat(),seed:21,...opts}));g.teleport(LEVEL.beaconS);const b=g.spawnBoss();g.hold.fired=new Set([2,10,18,26]);return {g,b};};
const until=(g,type,max=20)=>{for(let i=0;i<max*60&&!types(g,type).length;i++)g.advance(1/60);return types(g,type)[0];};

test('the mortar marks the ground before it lands: standing on the mark hurts, leaving it does not',()=>{
 const a=duel(),m=until(a.g,'bossMortar');assert.ok(m&&m.marks.length===4);
 assert.ok(Math.hypot(m.marks[0].position[0]-a.g.player.x,m.marks[0].position[2]-a.g.player.z)<.01,'the first shell is for the player');
 assert.ok(m.marks.every(k=>k.at-a.g.time>1.3),'time to move');
 run(a.g,2.2);const hits=types(a.g,'playerHit').filter(e=>e.cause==='blast');assert.ok(hits.length>=1&&a.g.player.hp<LEVEL.hp);assert.equal(a.b.hp,a.b.maxHP,'its own shells do nothing to it');
 const b=duel();until(b.g,'bossMortar');b.g.teleport(b.g.S-30);run(b.g,2.2);
 assert.equal(types(b.g,'playerHit').length,0);assert.equal(types(b.g,'explosion').filter(e=>e.source==='boss').length,4);
});

test('the beam is drawn across where the player stood: staying burns once, stepping off the line or jumping it does not',()=>{
 const a=duel({godMode:true}),beam=until(a.g,'bossBeam');assert.ok(beam&&types(a.g,'bossCharge').length===1);
 const mid=[(beam.a[0]+beam.b[0])/2,(beam.a[1]+beam.b[1])/2];assert.ok(Math.hypot(mid[0]-a.g.player.x,mid[1]-a.g.player.z)<.01);
 run(a.g,beam.duration+.2);assert.equal(types(a.g,'playerHit').filter(e=>e.cause==='beam').length,1);
 const b=duel({godMode:true}),bb=until(b.g,'bossBeam');b.g.teleport(b.g.S-5);run(b.g,bb.duration+.2);
 assert.equal(types(b.g,'playerHit').filter(e=>e.cause==='beam').length,0);
 const c=duel({godMode:true}),cb=until(c.g,'bossBeam');run(c.g,cb.duration/2-.3);run(c.g,.9,g=>{if(g.player.onGround)g.setInput({jump:true});});run(c.g,cb.duration/2);
 assert.equal(types(c.g,'playerHit').filter(e=>e.cause==='beam').length,0,'jumped the beam');
});

test('the core takes more than the hull; rockets bite its armour; half way down a gold crate arrives',()=>{
 const {g,b}=duel({godMode:true});run(g,3.6);b.ai.until=1e9;
 const C=ENEMIES.boss.core,core=[b.x+C.at[0],b.y+C.at[1],b.z+C.at[2]];
 g.fire({origin:[core[0],core[1],core[2]+18],target:core});run(g,.2);
 const hull=[b.x+4.6,b.y+1.2,b.z];g.fire({origin:[hull[0],hull[1],hull[2]+18],target:hull});run(g,.2);
 const hits=types(g,'hit').filter(e=>e.enemyType==='boss');
 assert.deepEqual(hits.map(e=>[e.core,e.damage]),[[true,C.mul],[false,1]]);
 g.give('rpg');g.switchWeapon('rpg');run(g,.6);const hp=b.hp;
 g.fire({origin:[b.x,b.y,b.z+25],target:[b.x,b.y,b.z]});run(g,1);
 assert.ok(hp-b.hp>WEAPONS.rpg.damage*2.5,`a rocket took ${hp-b.hp}`);
 g._damageEnemy(b,b.hp-b.maxHP*.55,{point:[b.x,b.y,b.z],direction:[0,0,-1]},[]);run(g,.1);
 assert.deepEqual(types(g,'bossPhase').map(e=>e.phase),[2]);assert.ok(types(g,'airdropIncoming').some(e=>e.gold));
 assert.equal(g.snapshot().boss.phase,2);
});

test('going down in front of the dreadnought starts the stand again from the checkpoint',()=>{
 const {g}=duel();g._hurt(500,[0,0,0],[],'beam');assert.equal(g.state,'down');g.respawn();
 assert.equal(g.enemies.length,0);assert.equal(g.hold,null);assert.equal(g.snapshot().boss,null);assert.ok(!g.triggered.has('hold'));
});
