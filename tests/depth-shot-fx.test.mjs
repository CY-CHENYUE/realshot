import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {tracerSegment,WallImpactFX} from '../src/depth-shot-fx.mjs';
import {DefenseGame} from '../src/defense-core.mjs';

const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const contact=(overrides={})=>({type:'scenery',position:[2,1.3,-11],normal:[0,0,1],projectileId:1,colliderId:'far panel',...overrides});

test('tracer follows the actual shot, clips at origin and never changes simulation data',()=>{
 const origin=[.23,1.5,7.15],direction=new T.Vector3(.1,.025,-1).normalize();
 for(const distance of[0,.12,.75,1,5,18,35]){
  const p={id:1,origin:origin.slice(),position:new T.Vector3(...origin).addScaledVector(direction,distance).toArray(),direction:direction.toArray(),distance,age:distance/45,life:.8},before=structuredClone(p),segment=tracerSegment(p);
  assert.deepEqual(p,before);assert.deepEqual(segment.head,p.position);near(segment.length,Math.min(45*.09,distance));near(new T.Vector3(...segment.head).distanceTo(new T.Vector3(...segment.tail)),segment.length);
  const tailAlong=new T.Vector3(...segment.tail).sub(new T.Vector3(...origin)).dot(direction);assert.ok(tailAlong>=-1e-9);near(segment.radius,.009);near(segment.width,.018);
  const shorter=tracerSegment(p,{exposure:.02});near(shorter.length,Math.min(.9,distance));
 }
});

test('tracer width is measured in metres and has natural perspective shrinkage',()=>{
 const camera=new T.PerspectiveCamera(60,1.6,.06,160);camera.updateMatrixWorld(true);const screenHeight=900,projectedDiameter=depth=>{const a=new T.Vector3(.009,0,-depth).project(camera),b=new T.Vector3(-.009,0,-depth).project(camera);return (a.x-b.x)*screenHeight*camera.aspect/2;};
 near(projectedDiameter(5)/projectedDiameter(20),4);assert.ok(projectedDiameter(20)<1);assert.ok(projectedDiameter(5)>2);
 const s=tracerSegment({position:[0,0,-.3],origin:[0,0,0],direction:[0,0,-1],distance:9});near(s.length,.3);near(s.tail[2],0);
 assert.equal(tracerSegment({position:[0,0,0],origin:[0,0,0],direction:[0,0,0]}),null);assert.equal(tracerSegment({position:[NaN,0,0]}),null);
});

test('real simulation wall arrival gates the mark, while range miss makes no impact',()=>{
 const scene=new T.Scene(),fx=new WallImpactFX(scene),game=new DefenseGame({rules:{groundEnabled:false},spawns:[{at:60,position:[4,1,-20]}],sceneryBoxes:[{id:'far panel',min:[-5,0,-11.1],max:[5,5,-10.9]}]});
 const shot=game.fire({origin:[2,1.3,7],direction:[0,0,-1]});assert.ok(shot);const early=game.advance(.2);for(const e of early)fx.trigger(e);assert.equal(fx.inspection().marks.length,0);const late=game.advance(.25),wall=late.find(e=>e.type==='scenery');assert.ok(wall);assert.ok(wall.time>.39&&wall.time<.41);assert.ok(fx.trigger(wall));assert.equal(fx.inspection().marks.length,1);near(fx.inspection().marks[0].position[2],-10.9);
 const count=fx.inspection().marks.length;assert.equal(fx.trigger({type:'miss',position:[2,1,-29],normal:[0,0,1]}),false);assert.equal(fx.inspection().marks.length,count);fx.dispose();
});

test('only a valid surface contact is accepted, with its plane normal and fixed location',()=>{
 const scene=new T.Scene(),fx=new WallImpactFX(scene);
 for(const type of['miss','rangeMiss','hit','kill','blocked','protectorHit','ground'])assert.equal(fx.trigger(contact({type})),false);
 assert.equal(fx.trigger(contact({normal:[0,0,0]})),false);assert.equal(fx.trigger(contact({normal:[0,NaN,1]})),false);
 assert.equal(fx.scarMaterial.transparent,false,'finite opaque chipped faces must not blend with the HDR white backstop');assert.equal(fx.scar.attributes.color.itemSize,3);
 assert.ok(fx.trigger(contact({position:[-3,2,1],normal:[1,0,0]})));const mark=fx.marks[0],normal=new T.Vector3(0,0,1).applyQuaternion(mark.object.quaternion);near(normal.x,1);near(normal.y,0);near(normal.z,0);assert.deepEqual(fx.inspection().marks[0].renderPosition,[-2.998,2,1]);
 for(const chip of fx.inspection().chips)assert.ok(chip.velocity[0]>.7,'wall chips leave the surface normal hemisphere');for(let i=0;i<5;i++)fx.update(.1);assert.equal(fx.inspection().active.length,0);assert.equal(fx.inspection().chips.length,0);assert.deepEqual(fx.inspection().marks[0].position,[-3,2,1]);fx.dispose();
});

test('paused zero-dt leaves dust, chips and fixed marks frozen',()=>{
 const fx=new WallImpactFX(new T.Scene());fx.trigger(contact());fx.update(.06);const before=fx.inspection();for(let i=0;i<20;i++)fx.update(0);assert.deepEqual(fx.inspection(),before);fx.dispose();
});

test('rapid contact stress stays bounded and reset clears all objects without dropping shared resources',()=>{
 const scene=new T.Scene(),fx=new WallImpactFX(scene,{maxMarks:5,maxBursts:3,maxChips:20});
 for(let i=0;i<40;i++)fx.trigger(contact({position:[i*.03,1,-11],projectileId:i}));const s=fx.inspection();assert.equal(s.marks.length,5);assert.equal(s.active.length,3);assert.equal(s.chips.length,20);assert.equal(scene.children.length,1+5+3);fx.reset();assert.equal(scene.children.length,1);assert.equal(fx.inspection().marks.length,0);assert.equal(fx.inspection().active.length,0);assert.equal(fx.chipPool.count,0);assert.ok(fx.trigger(contact()),'reset remains reusable');fx.dispose();assert.equal(scene.children.length,0);
});

test('dispose releases owned geometry/material resources once and rejects later triggers',()=>{
 const scene=new T.Scene(),fx=new WallImpactFX(scene),disposed=[];fx.scar.addEventListener('dispose',()=>disposed.push('geometry'));fx.scarMaterial.addEventListener('dispose',()=>disposed.push('material'));fx.trigger(contact());fx.dispose();fx.dispose();assert.deepEqual(disposed,['geometry','material']);assert.equal(fx.trigger(contact()),false);assert.equal(scene.children.length,0);assert.equal(fx.inspection().disposed,true);
});
