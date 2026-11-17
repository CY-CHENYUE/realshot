import test from 'node:test';
import assert from 'node:assert/strict';
import {LevelGame,LEVEL,WEAPONS,CROWD,PALM,LOOT,SURGE,ENCOUNTERS,sToZ,zToS} from '../src/level-core.mjs';

const W=9,flat=(extra={})=>({ground:()=>0,halfWidth:()=>W,boxes:()=>[],...extra});
function run(g,seconds,each){const n=Math.round(seconds*60);for(let i=0;i<n;i++){each?.(g);g.advance(1/60);}return g;}
const types=(g,type)=>g.events.filter(e=>e.type===type);
const quiet=(opt={})=>{const g=new LevelGame({world:flat(),...opt});g._triggers=()=>{};if(!opt.surge)g._surge=()=>0;g.teleport(60,0);return g;};
// the ground point `ahead` metres in front of the player (forward is -z)
const strike=(g,ahead,x=g.player.x)=>g.fire({origin:g.eye(),target:[x,0,g.player.z-ahead]});

test('a palm crate lifts the player over the valley and sets them down again',()=>{
 const g=quiet();const d=g.dropSupply({S:62,x:0,loot:'palm',gold:true});
 run(g,12);assert.equal(d.state,'landed');assert.equal(g.flight,null);
 g.openSupply(d);
 assert.equal(types(g,'airdropOpened').at(-1).label,LOOT.palm.label);
 assert.equal(types(g,'palmStart').length,1);assert.equal(g.snapshot().flight.state,'up');
 run(g,2);
 assert.ok(Math.abs(g.player.y-PALM.height)<.3,`hovering, y=${g.player.y}`);assert.equal(g.flight.state,'hover');assert.equal(g.player.onGround,false);
 // free movement in the air, faster than a sprint, and no jumping out of it
 const z0=g.player.z;run(g,1,g=>g.setInput({forward:true,yaw:0,jump:true}));
 assert.ok(z0-g.player.z>PALM.speed*.8,`flew ${z0-g.player.z} m`);assert.ok(PALM.speed>LEVEL.sprint);
 assert.ok(Math.abs(g.player.y-PALM.height)<.3);
 g.setInput({forward:false});run(g,PALM.time-3+.2);
 assert.equal(g.flight.state,'down');assert.equal(types(g,'palmEnd').length,1);
 run(g,PALM.height/PALM.sink+.3);
 assert.equal(g.flight,null);assert.equal(g.snapshot().flight,null);assert.ok(g.player.onGround&&g.player.y===0);
 assert.equal(g.player.hp,LEVEL.hp,'no fall damage');assert.equal(types(g,'palmLand').length,1);
 // back on foot the rifle works as before
 const mag=g.inv.rifle.mag;assert.equal(strike(g,20).weapon,'rifle');assert.equal(g.inv.rifle.mag,mag-1);
});

test('each click in the air brings a palm down on the ground under the crosshair',()=>{
 const g=quiet();g.takeOff();run(g,2);
 const S=g.S+24,near=[],far=[];
 for(let i=0;i<24;i++){const a=i/24*Math.PI*2,r=1+(i%4)*1.8;near.push(g.spawnMinion(i%6?'trooper':'brute',S+Math.sin(a)*r,Math.cos(a)*r));}
 for(const x of [-1,1])far.push(g.spawnMinion('brute',S+PALM.radius+4,x*2),g.spawnMinion('trooper',S-PALM.radius-4,x*2));
 const mag=g.inv.rifle.mag,r=strike(g,24,0);
 assert.equal(r.weapon,'palm');assert.equal(g.inv.rifle.mag,mag,'no ammunition is spent');
 const call=types(g,'palmCall').at(-1);assert.ok(Math.abs(zToS(call.target[2])-S)<1e-6&&call.target[0]===0);assert.ok(Math.abs(call.impactAt-g.time-PALM.delay)<1e-9);
 assert.equal(strike(g,24,0),null,'one at a time');
 run(g,PALM.delay-.1);assert.ok(near.every(m=>!m.dead),'nothing happens before the hand lands');
 run(g,.2);
 assert.ok(near.every(m=>m.dead),`everyone under the hand is gone (${near.filter(m=>!m.dead).length} left)`);
 assert.ok(far.every(m=>!m.dead),'those outside it are not');
 const hit=types(g,'palmImpact');assert.equal(hit.length,1);assert.equal(hit[0].radius,PALM.radius);
 assert.equal(g.snapshot().flight.kills,near.length);assert.equal(g.snapshot().flight.strikes,1);
 assert.equal(types(g,'explosion').at(-1).source,'palm');
 run(g,PALM.cooldown);assert.equal(strike(g,24,0).weapon,'palm','and the next one is ready');
});

test('the strike is kept inside its range and the valley, and hits what flies in its column',()=>{
 const g=quiet();g.takeOff();run(g,2);
 const r=strike(g,400,60);const far=Math.hypot(r.palm.x-g.player.x,r.palm.z-g.player.z);
 assert.ok(far<=PALM.range+1e-6,`range ${far}`);assert.ok(Math.abs(r.palm.x)<=W+LEVEL.roam+3);
 run(g,PALM.cooldown+.1);
 const drone=g.spawnEnemy('drone',g.S+20,0),heavy=g.spawnEnemy('heavy',g.S+20,3),away=g.spawnEnemy('drone',g.S+20+PALM.radius+6,0);
 for(const e of [drone,heavy,away]){e.y=9;e.state='hover';}
 strike(g,20,0);run(g,PALM.delay+.1);
 assert.ok(drone.hp<=0&&heavy.hp<=0,'both in the column are down');assert.ok(away.hp>0);
});

test('in the air the crowd cannot reach the player, and what does land hurts less',()=>{
 const g=quiet({godMode:false});g.takeOff();run(g,2);
 for(let i=0;i<30;i++)g.spawnMinion(i%5?'trooper':'bomber',g.S+(i%6)-3,(i%5)-2);
 run(g,5);assert.equal(g.player.hp,LEVEL.hp);
 g._hurt(20,[0,20,0],[],'bullet');assert.ok(Math.abs(LEVEL.hp-g.player.hp-20*PALM.guard)<1e-9);
 // the minigun does not spin up from a held trigger while flying
 g.give('minigun');g.switchWeapon('minigun');run(g,.6);g.setInput({trigger:true});run(g,1);assert.equal(g.spin,0);
});

test('flight keeps to the valley, ends with the level state, and a second crate refreshes it',()=>{
 const g=quiet();g.takeOff();run(g,6,g=>g.setInput({right:true,yaw:0}));
 assert.ok(Math.abs(g.player.x-(W+g.roam))<1e-6,`x=${g.player.x}`);
 g.setInput({right:false});const left=g.snapshot().flight.left;g.takeOff();
 assert.ok(g.snapshot().flight.left>left+5);assert.equal(types(g,'palmStart').at(-1).again,true);
 strike(g,10);g.player.hp=1;g.godMode=false;g._hurt(99,[0,0,0],[],'bullet');assert.equal(g.state,'down');
 g.respawn();assert.equal(g.flight,null);assert.equal(g.palms.length,0);assert.ok(g.player.onGround);
 g.takeOff();g.restart();assert.equal(g.flight,null);
});

test('the route hands out the palm before the col and again during the hold',()=>{
 const e=ENCOUNTERS.find(e=>e.id==='drop-palm');assert.equal(e.airdrop.loot,'palm');assert.ok(e.at<ENCOUNTERS.find(e=>e.id==='col-surge').at);
 const g=new LevelGame({world:flat(),godMode:true});g.teleport(e.at-2,0);run(g,1,g=>g.setInput({forward:true,yaw:0}));
 const d=g.airdrops.find(d=>d.loot==='palm');assert.ok(d&&d.gold);
 const h=new LevelGame({world:flat(),godMode:true});h.teleport(LEVEL.beaconS,0);h.startHold(0);run(h,15);
 assert.ok(h.airdrops.some(d=>d.loot==='palm'),'a palm crate comes down on the beacon');
});

// r28 · a gold crate brings its own crowd
const pendingOf=g=>g.streams.reduce((n,s)=>n+s.left,0);
test('opening the palm crate makes the snow around the player erupt, in the air and again mid-flight',()=>{
 const g=quiet({surge:true});const d=g.dropSupply({S:62,x:0,loot:'palm',gold:true});run(g,12);
 assert.equal(g.crowd.length,0);g.openSupply(d);
 const e=types(g,'surge');assert.equal(e.length,1);assert.equal(e[0].reason,'palm');assert.equal(e[0].count,SURGE.palm.count);
 assert.ok(g.events.findIndex(x=>x.type==='palmStart')<g.events.findIndex(x=>x.type==='surge'),'the player is already lifting off');
 run(g,2.5);
 const first=g.crowd.length;assert.ok(first>=SURGE.palm.count*.6,`${first} soldiers within 2.5 s`);
 const ahead=g.crowd.filter(m=>zToS(m.z)>g.S).length;assert.ok(ahead>first*.5&&ahead<first,'most ahead, some behind');
 for(const m of g.crowd){const dS=Math.abs(zToS(m.z)-g.S);assert.ok(dS>=5&&dS<=60,`ring distance ${dS}`);}
 assert.ok(pendingOf(g)>=SURGE.palm.count*.3,'a second wave is still to come while the palm is up');
 run(g,5);assert.equal(pendingOf(g),0);assert.ok(g.crowd.length>=SURGE.palm.count*.9,`${g.crowd.length} alive, nobody reaches a flying player`);
 assert.equal(g.player.hp,LEVEL.hp);
 // and the palm has something to hit: one strike into the thick of it
 const before=g.kills,S=g.S+30;strike(g,30,0);run(g,PALM.delay+.2);
 assert.ok(g.kills-before>=8,`one palm took ${g.kills-before}`);
});
test('a golden supply crate calls a smaller crowd, and a field that is already full gets none',()=>{
 const g=quiet({surge:true});const d=g.dropSupply({S:66,x:0,loot:'gold',gold:true});run(g,12);g.openSupply(d);
 assert.equal(types(g,'surge').at(-1).count,SURGE.gold.count);assert.equal(types(g,'surge').at(-1).reason,'gold');
 run(g,3);assert.ok(g.crowd.length>=SURGE.gold.count*.9);assert.equal(g.inv.missile?.mag,1,'the missile is ready for them');
 // plain crates stay quiet
 const q=quiet({surge:true});const p=q.dropSupply({S:66,x:0,loot:'supply'});run(q,12);q.openSupply(p);assert.equal(types(q,'surge').length,0);assert.equal(q.streams.length,0);
 // room: a surge only tops the field up
 const f=quiet({surge:true});const c=f.dropSupply({S:62,x:0,loot:'gold',gold:true});run(f,12);
 for(let i=0;i<SURGE.room-30;i++)f.spawnMinion('trooper',f.S+30+(i%20),(i%9)-4);f.openSupply(c);
 assert.equal(types(f,'surge').at(-1).count,30);assert.equal(pendingOf(f),30);
 const full=quiet({surge:true});const c2=full.dropSupply({S:62,x:0,loot:'gold',gold:true});run(full,12);
 for(let i=0;i<SURGE.room-SURGE.least+1;i++)full.spawnMinion('trooper',full.S+30+(i%20),(i%9)-4);full.openSupply(c2);
 assert.equal(types(full,'surge').length,0);assert.equal(full.streams.length,0);assert.equal(full.inv.missile?.mag,1,'the crate itself still pays out');
});
test('at the beacon the surge comes from the side that has room',()=>{
 const g=quiet({surge:true});g.teleport(LEVEL.beaconS,0);const d=g.dropSupply({S:LEVEL.beaconS-3,x:2,loot:'palm',gold:true});run(g,12);g.openSupply(d);
 assert.equal(types(g,'surge').length,1);for(const s of g.streams)assert.ok(s.dS[0]<0&&s.dS[1]<0,`dS ${s.dS}`);
 run(g,1.5);for(const m of g.crowd)assert.ok(zToS(m.z)<=LEVEL.endS&&zToS(m.z)>=LEVEL.minS);
});
