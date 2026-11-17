import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createDepthExtension} from '../src/defense-depth-extension.mjs';
import {traceScenery,DEFENSE_RULES} from '../src/defense-core.mjs';

const close=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
function meshHit(extension,start,end){const o=new T.Vector3(...start),d=new T.Vector3(...end).sub(o);return new T.Raycaster(o,d.clone().normalize(),1e-6,d.length()).intersectObject(extension.root,true)[0];}
function withExtension(fn){const e=createDepthExtension();try{fn(e);}finally{e.dispose();}}

test('same metre-scale rib openings recede in formal camera through actual perspective',()=>withExtension(e=>{
 const s=e.inspection();assert.deepEqual(s.ribDepths,[-15,-20,-24.7]);assert.equal(s.opening.width,7.9);assert.equal(s.opening.height,3.1);
 for(const aspect of[1440/900,1920/1080,1024/768]){
  const camera=new T.PerspectiveCamera(T.MathUtils.clamp(T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(43))/aspect)),55,86),aspect,.06,160);camera.position.set(0,1.65,7.8);camera.lookAt(0,1.15,-1.8);camera.updateMatrixWorld(true);
  const sizes=s.ribDepths.map(z=>{const p=[[-3.95,0,z],[3.95,0,z],[3.95,3.1,z],[-3.95,3.1,z]].map(a=>new T.Vector3(...a).project(camera));assert.ok(p.every(v=>Math.abs(v.x)<1&&Math.abs(v.y)<1&&v.z>0&&v.z<1));return {width:p[1].x-p[0].x,height:p[3].y-p[0].y};});
  assert.ok(sizes[0].width>sizes[1].width&&sizes[1].width>sizes[2].width);assert.ok(sizes[0].height>sizes[1].height&&sizes[1].height>sizes[2].height);
  const ratio=sizes[2].width/sizes[0].width;assert.ok(ratio>.68&&ratio<.72,'actual depth gives appreciable but plausible reduction');
 }
}));

test('central missed-target shot travels through empty ribs and hits finite white backstop',()=>withExtension(e=>{
 const start=[.91,1.58,7.1],end=[.91,1.58,-28],actual=meshHit(e,start,end),rule=traceScenery(start,end,e.collisionBoxes);
 assert.ok(actual);assert.ok(rule);assert.equal(actual.object.name,'depth backstop / white panel');assert.equal(rule.colliderId,actual.object.name);close(actual.point.z,-24.97,1e-6);close(rule.position[2],actual.point.z,1e-6);
 const distance=new T.Vector3(...start).distanceTo(actual.point),flight=distance/DEFENSE_RULES.projectileSpeed;assert.ok(distance>32&&distance<DEFENSE_RULES.projectileRange);assert.ok(flight>.70&&flight<.73);
}));

test('finite side gaps and air below bay do not acquire invisible floors or walls',()=>withExtension(e=>{
 for(const[start,end]of[[[4.7,1.5,-12],[4.7,1.5,-28]],[[0,-1.2,-12],[0,-1.2,-28]],[[0,4,-12],[0,4,-28]],[[0,1.5,-12],[0,-2,-12]]]){
  assert.equal(meshHit(e,start,end),undefined);assert.equal(traceScenery(start,end,e.collisionBoxes),null);
 }
 const s=e.inspection();assert.equal(s.hiddenFloor,false);assert.equal(s.opaqueSideWalls,false);assert.equal(s.sky,false);assert.equal(s.fog,false);
}));

test('every named solid matches its actual mesh and does not bridge a rib opening',()=>withExtension(e=>{
 const s=e.inspection(),names=new Set();for(const b of e.collisionBoxes){assert.ok(b.min.every((v,i)=>Number.isFinite(v)&&v<b.max[i]));assert.equal(names.has(b.id),false);names.add(b.id);
  const mesh=e.root.getObjectByName(b.objectName);assert.ok(mesh?.isMesh);const actual=new T.Box3().setFromObject(mesh);for(let i=0;i<3;i++){close(actual.min.getComponent(i),b.min[i],1e-6);close(actual.max.getComponent(i),b.max[i],1e-6);}
 }
 for(const z of s.ribDepths){const start=[0,1.55,z+.18],end=[0,1.55,z-.18];assert.equal(meshHit(e,start,end),undefined);assert.equal(traceScenery(start,end,e.collisionBoxes),null);}
 const start=[3.99,1.55,-14.4],end=[3.99,1.55,-15.5],hit=meshHit(e,start,end),rule=traceScenery(start,end,e.collisionBoxes);assert.ok(hit);assert.equal(rule.colliderId,hit.object.name);close(rule.position[2],hit.point.z,1e-6);
}));

test('panel and attached service seams both have matching visible contact surfaces',()=>withExtension(e=>{
 for(const point of[[-1.975,1.55],[.80,1.03],[-3.72,.45],[1.05,2.7]]){
  const start=[point[0],point[1],-24],end=[point[0],point[1],-26],actual=meshHit(e,start,end),rule=traceScenery(start,end,e.collisionBoxes);assert.ok(actual);assert.equal(rule.colliderId,actual.object.name);close(rule.position[2],actual.point.z,1e-6);
  const swept=traceScenery(start,end,e.collisionBoxes,.025);close(swept.position[2],actual.point.z,1e-6);
 }
 const panel=e.root.getObjectByName('depth backstop / white panel');assert.equal(panel.material.isMeshBasicMaterial,true);assert.equal(panel.material.color.getHex(),0xffffff);assert.equal(panel.material.toneMapped,false);assert.equal(panel.receiveShadow,false);
}));

test('extension is a modest owned assembly and disposal is safe and complete',()=>{
 const e=createDepthExtension(),s=e.inspection();assert.ok(s.meshes<55);assert.ok(s.triangles<700);assert.equal(s.meshes,s.collisionBoxes);let geometryDisposals=0,materialDisposals=0;const materials=new Set();e.root.traverse(o=>{if(o.isMesh){o.geometry.addEventListener('dispose',()=>geometryDisposals++);materials.add(o.material);}});for(const m of materials)m.addEventListener('dispose',()=>materialDisposals++);e.dispose();assert.equal(e.root.children.length,0);assert.equal(geometryDisposals,s.meshes);assert.equal(materialDisposals,materials.size);e.dispose();assert.equal(geometryDisposals,s.meshes);
});

test('wide range continuation keeps the whole 12 by 4.4 metre gate open until the finite rear panel',()=>{
 const e=createDepthExtension({width:12,height:4.4});try{
  assert.equal(e.inspection().opening.width,12);assert.equal(e.inspection().opening.height,4.4);
  for(const x of[-5.6,-4.2,0,4.2,5.6])for(const y of[.2,2.2,4.2]){
   const a=[x,y,-12],b=[x,y,-24.5];assert.equal(meshHit(e,a,b),undefined);assert.equal(traceScenery(a,b,e.collisionBoxes),null);
   const actual=meshHit(e,a,[x,y,-26]),rule=traceScenery(a,[x,y,-26],e.collisionBoxes);assert.ok(actual);assert.equal(actual.object.name,'depth backstop / white panel');assert.equal(rule.colliderId,actual.object.name);close(rule.position[2],-24.97,1e-6);
  }
  for(const x of[-7,7]){assert.equal(meshHit(e,[x,2.2,-12],[x,2.2,-28]),undefined);assert.equal(traceScenery([x,2.2,-12],[x,2.2,-28],e.collisionBoxes),null);}
 }finally{e.dispose();}
 assert.throws(()=>createDepthExtension({width:NaN}),RangeError);
});
