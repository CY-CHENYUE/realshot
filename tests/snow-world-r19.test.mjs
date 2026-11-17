import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createSnowWorldR19,CHUNK_LENGTH,CHUNK_COUNT,TRAVEL_SPEED,CORRIDOR_X,CORRIDOR_TOP} from '../src/snow-world-r19.mjs';
import {DEFENSE_RULES} from '../src/defense-core.mjs';

// snow mode hit volume for drones (src/defense.mjs hitVolumes.enemyHalfExtents[1])
const DRONE_BELLY=DEFENSE_RULES.enemyCenterY-.41;
import {SECTIONS,CYCLE,sectionWeights,sectionAt,profileAt,createTerrainField,MIN_FLOOR_HALF_WIDTH} from '../src/snow-terrain-r19.mjs';
import {pineGeometry,rockGeometry,grassTuftGeometry,iceSpireGeometry,markerPoleGeometry,crateGeometry} from '../src/snow-flora-r19.mjs';
import {coniferGeometry,branchTextureData} from '../src/snow-conifer-r25.mjs';

function camera(aspect=1.6){const c=new T.PerspectiveCamera(60,aspect,.08,1400);c.position.set(0,1.65,7.8);c.lookAt(0,1.15,-1.8);c.updateMatrixWorld(true);return c;}
function world(options={}){const w=createSnowWorldR19(options);w.configure(camera(options.enclosure?195/146:1.6));return w;}

test('the four route sections blend as a partition of unity and repeat in order',()=>{
 let worst=0;for(let S=0;S<CYCLE;S+=.5)worst=Math.max(worst,Math.abs(sectionWeights(S).reduce((a,b)=>a+b,0)-1));
 assert.ok(worst<1e-9);
 const order=[];for(let S=0;S<CYCLE*2;S+=5){const id=sectionAt(S).id;if(order.at(-1)!==id)order.push(id);}
 assert.deepEqual(order,[...SECTIONS,...SECTIONS].map(s=>s.id));
 // no visible jump in the valley shape anywhere along the loop
 const a={},b={};let jump=0;for(let S=0;S<CYCLE;S+=.5){profileAt(S,a);profileAt(S+.5,b);jump=Math.max(jump,Math.abs(b.W-a.W),Math.abs(b.slope-a.slope),Math.abs(b.cliff-a.cliff));}
 assert.ok(jump<.1,`profile jump ${jump}`);
});

test('the route bed stays flat and the drone corridor stays below hover height',()=>{
 const f=createTerrainField();let bed=0,corridor=0;
 for(let S=0;S<CYCLE;S+=2){for(let x=-2.3;x<=2.3;x+=.1)bed=Math.max(bed,Math.abs(f.height(x,S)));for(let x=-6;x<=6;x+=.25)corridor=Math.max(corridor,f.height(x,S));}
 assert.ok(bed<.15,`route bed ${bed}`);assert.ok(corridor<.6,`corridor ${corridor}`);assert.ok(MIN_FLOOR_HALF_WIDTH>=6.4);
});

test('the world streams toward the viewer, reaches every section and freezes on pause',()=>{
 const w=world();
 try{
  const a=w.inspection();assert.equal(a.chunks.length,CHUNK_COUNT);assert.equal(a.section.id,'pine-valley');assert.equal(a.travel,0);
  const seen=new Set();let t=0;for(;t<=CYCLE/TRAVEL_SPEED+5;t+=.1){w.update(t);seen.add(w.section().id);}
  assert.deepEqual([...seen],SECTIONS.map(s=>s.id));
  const b=w.inspection();assert.ok(Math.abs(b.travel-TRAVEL_SPEED*(t-.1))<.5);assert.ok(Math.min(...b.chunks)>0);
  // each chunk is filled once when it enters at the far end
  assert.ok(b.rebuilds<=CHUNK_COUNT+Math.ceil(b.travel/CHUNK_LENGTH)+1,`rebuilds ${b.rebuilds}`);
  const frozen=w.travel;w.update(t+1,{paused:true});w.update(t+4,{paused:true});assert.equal(w.travel,frozen);
 }finally{w.dispose();}
});

test('live collision proxies are finite, near the player and never stand in the drone corridor',()=>{
 for(const seed of [0x51a0,7,12345]){
  const w=world({seed});
  try{
   let checked=0,corridorTop=0,tallSaplings=0;
   for(let t=0;t<=160;t+=.1){
    w.update(t);
    for(const b of w.activeCollisionBoxes){
     checked++;assert.ok(b.min.every((v,i)=>Number.isFinite(v)&&Number.isFinite(b.max[i])&&b.max[i]>b.min[i]),b.id);
     assert.ok(b.max[2]>=-46&&b.min[2]<=9,b.id); // live window z∈[-46,9], edges inclusive
     assert.ok(b.min[0]*b.max[0]>=0,`${b.id} crosses the route centre`);
     const inner=Math.min(Math.abs(b.min[0]),Math.abs(b.max[0]));
     if(inner<CORRIDOR_X)corridorTop=Math.max(corridorTop,b.max[1]);
     if(b.id.startsWith('sapling/')&&b.max[1]-b.min[1]>CORRIDOR_TOP){tallSaplings++;assert.ok(inner>=CORRIDOR_X-1e-9,`${b.id} reaches x=${inner}`);}
    }
   }
   assert.ok(checked>1000);assert.ok(tallSaplings>0,'route should include tall saplings beside the corridor');
   assert.ok(CORRIDOR_TOP<DRONE_BELLY);assert.ok(corridorTop<=CORRIDOR_TOP+1e-9,`seed ${seed}: corridor proxy top ${corridorTop} (drone belly ${DRONE_BELLY})`);
  }finally{w.dispose();}
 }
});

test('ground shots snap onto the rendered terrain and scenery shots keep their material',()=>{
 const w=world();
 try{
  for(let t=0;t<3;t+=.1)w.update(t);
  const r=w.resolveSurface({type:'ground',position:[1.2,0,-6],direction:[0,-.3,-1]});
  assert.equal(r.resolved,true);assert.equal(r.kind,'snow');assert.ok(Math.abs(r.position[1]-w.terrainAt(r.position[0],r.position[2]).h)<.02);assert.ok(r.normal[1]>.9);
  for(const [id,kind] of [['tree/3/12','tree'],['rock/1/4','rock'],['ice/2/1','ice'],['crate/4/0','wood'],['hut/main','wood']])assert.equal(w.resolveSurface({type:'scenery',colliderId:id,position:[8,2,-10]}).kind,kind);
  w.impact({position:r.position,normal:r.normal,surfaceKind:r.kind});assert.ok(w.inspection().impacts.particles>0||w.inspection().impacts.craters>0);
  w.reset();
 }finally{w.dispose();}
});

test('the valley is deterministic per seed, varies between seeds and disposes cleanly',()=>{
 const a=world(),b=world(),c=world({seed:99});
 try{
  for(let t=0;t<5;t+=.1){a.update(t);b.update(t);c.update(t);}
  assert.deepEqual(a.inspection().props,b.inspection().props);assert.equal(a.terrainAt(3.1,-12).h,b.terrainAt(3.1,-12).h);
  assert.notDeepEqual(a.inspection().props,c.inspection().props);
  const p=a.inspection().props;for(const k of ['pineA','pineB','pineFar','rock','tuft','pole'])assert.ok(p[k]>0,k);
 }finally{b.dispose();c.dispose();}
 const instanced=[];a.root.traverse(o=>{if(o.isInstancedMesh)instanced.push(o);});
 let released=0;for(const im of instanced)im.addEventListener('dispose',()=>released++);
 a.dispose();a.dispose();
 assert.ok(instanced.length>=CHUNK_COUNT*6);assert.equal(released,instanced.length);
 assert.equal(a.root.children.length,0);assert.equal(a.activeCollisionBoxes.length,0);
});

test('box output calms the central object window and keeps flakes off it',()=>{
 const w=world({enclosure:true});
 try{
  const m=w.centreMask;assert.equal(m.enclosure,true);
  assert.ok(m.x>.4&&m.x<.6&&m.y>.2&&m.y<.6,JSON.stringify(m));assert.ok(m.rx>.05&&m.rx<.35&&m.ry>.05&&m.ry<.35,JSON.stringify(m));
  assert.equal(w.inspection().weather.centreFade,.78);
 }finally{w.dispose();}
 const open=world();try{assert.equal(open.inspection().weather.centreFade,0);}finally{open.dispose();}
});

test('r25 spruce cards carry uv, snow load and a needle texture with real gaps',()=>{
 const g=coniferGeometry(11,{tiers:14,boughs:7,width:.74});
 for(const k of ['uv','aSnow','color','normal'])assert.ok(g.attributes[k],k);
 g.computeBoundingBox();assert.ok(g.boundingBox.min.y>-.12,`roots ${g.boundingBox.min.y}`);assert.ok(Math.max(g.boundingBox.max.x,g.boundingBox.max.z)<=.5*.74+.01,'crown stays inside the walker column');
 const s=g.attributes.aSnow.array;assert.ok(s.some(v=>v<0)&&s.some(v=>v>.5),'core marked, boughs loaded');
 const {data}=branchTextureData();let on=0;for(let i=3;i<data.length;i+=4)on+=data[i]>127;const f=on/(data.length/4);assert.ok(f>.3&&f<.7,`coverage ${f}`);
 g.dispose();
});
test('procedural flora meshes are finite and authored at unit height for instancing',()=>{
 for(const [name,g,top] of [['pine',pineGeometry(11),1.03],['conifer',coniferGeometry(11,{tiers:14,boughs:7,width:.74}),1],['conifer far',coniferGeometry(37,{tiers:8,boughs:5,width:.7,segments:2}),1],['spire',iceSpireGeometry(5),1],['pole',markerPoleGeometry(),1],['tuft',grassTuftGeometry(9),.88],['rock',rockGeometry(3),.68],['crate',crateGeometry(7),.84]]){
  assert.ok(Array.from(g.attributes.position.array).every(Number.isFinite),name);assert.ok(g.attributes.normal,name);
  g.computeBoundingBox();assert.ok(Math.abs(g.boundingBox.max.y-top)<.05,`${name} top ${g.boundingBox.max.y}`);g.dispose();
 }
});

// r27: the flake quad is built in a mirrored screen basis; single-sided, every flake was culled and it never snowed
test('snowfall is drawn double-sided, and the free camera gets boxes centred on the player sized for a storm',async()=>{
 const T=await import('three'),{createSnowWeather}=await import('../src/snow-weather-r19.mjs');
 const rail=createSnowWeather({anchored:false}),free=createSnowWeather({anchored:true});
 try{
  for(const w of [rail,free])for(const l of Object.values(w.layers))assert.equal(l.mesh.material.side,T.DoubleSide,l.mesh.name);
  assert.equal(rail.layers.near.count,1400);assert.equal(rail.inspection().capacity,1);
  const cap=free.inspection().capacity;assert.ok(cap>2);
  for(const k of ['near','mid','far']){const u=free.layers[k].uniforms,min=u.uBoxMin.value,size=u.uBoxSize.value;
   assert.ok(Math.abs(min.x+size.x/2)<1e-6&&Math.abs(min.z+size.z/2)<1e-6,k+' box is centred on the camera');assert.equal(u.uAnchorK.value,1);}
  assert.ok(free.layers.near.count>rail.layers.near.count*4);
  free.update(1,{profile:{snow:1,wind:.3}});
  const d=free.layers.near.uniforms.uDensity.value;assert.ok(Math.abs(d-1/cap)<1e-9,`an ordinary day draws 1/${cap} of the flakes (${d})`);
  assert.ok(d*cap<=1+1e-9&&d*2.6<=1+1e-9,'the storm mood (x2.6) still fits the instance count');
  // each layer hands over to the next by distance
  assert.ok(free.layers.mid.uniforms.uNearFade.value.x>=free.layers.near.uniforms.uNearFade.value.y);
 }finally{rail.dispose();free.dispose();}
});

test('r27 spruce core is a stack of snow-loaded skirts, and the cards stay inside the crown limit',()=>{
 for(const [seed,o] of [[11,{tiers:14,boughs:7,width:.74,snowiness:.8}],[23,{tiers:12,boughs:6,width:.58,snowiness:.62}],[37,{tiers:8,boughs:5,width:.7,snowiness:.82,segments:2}]]){
  const g=coniferGeometry(seed,o);g.computeBoundingBox();const b=g.boundingBox;
  assert.ok(Math.max(b.max.x,b.max.z,-b.min.x,-b.min.z)<=.5*o.width+.01,`width ${o.width}`);assert.ok(b.min.y>-.12);
  const s=Array.from(g.attributes.aSnow.array);
  assert.ok(s.some(v=>v<-1.5),'core vertices carry a snow load (aSnow below -1)');assert.ok(s.every(v=>v>=-2&&v<=1.6));
  g.dispose();
 }
});
