import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createSideDepthBays} from '../src/defense-side-depth-bays.mjs';

test('side depth bays stay outside the central object lane and remain finite',()=>{
 const kit=createSideDepthBays();try{const r=kit.inspection();assert.ok(r.meshes<70);assert.ok(r.triangles<15000);assert.equal(r.id,'virtual-side-depth-bays-r16');assert.equal(r.virtual,true);assert.equal(r.physicalCAD,false);assert.equal(r.centralOpening.open,true);
  for(const b of kit.localSolids){assert.ok(b.min.every((v,i)=>Number.isFinite(v)&&v<b.max[i]));assert.equal(new T.Box3(new T.Vector3(...b.min),new T.Vector3(...b.max)).intersectsBox(new T.Box3(new T.Vector3(-55,0,82),new T.Vector3(55,700,182))),false,b.id);}
  assert.deepEqual(r.stations.map(s=>s.y),[45,240,440,640]);assert.equal(r.assemblies.length,2);
  assert.ok(r.clearance.minimumInnerAbsX>=60);assert.equal(r.clearance.margin,5);
  assert.ok(r.stations.every((s,i)=>i===0||s.half<r.stations[i-1].half),'station widths should contract');
  assert.ok(r.stations.every((s,i)=>i===0||s.x<r.stations[i-1].x),'side rails should converge toward the centre');
 }finally{kit.dispose();}
});

test('repeated side sections show two-sided depth and disposal owns only local geometry',()=>{
 const shared=new T.MeshStandardMaterial(),kit=createSideDepthBays({materials:{alloy:shared}});let released=0,disposed=0;shared.addEventListener('dispose',()=>released++);kit.root.traverse(o=>o.isMesh&&o.geometry.addEventListener('dispose',()=>disposed++));
  const r=kit.inspection();assert.ok(r.assemblies.every(a=>a.sourceY.length===4));assert.ok(r.assemblies.every(a=>a.halfWidths.every((v,i)=>i===0||v<a.halfWidths[i-1])));assert.ok(r.assemblies[0].sourceX[0]!==r.assemblies[0].sourceX[3]);const n=r.meshes;kit.dispose();kit.dispose();assert.equal(disposed,n);assert.equal(released,0);shared.dispose();
});

test('side signals travel from near to far without changing the finite geometry or central opening',()=>{
 const kit=createSideDepthBays();try{
  const before=kit.inspection(),boxes=kit.localSolids.map(b=>({id:b.id,min:b.min.slice(),max:b.max.slice()}));
  kit.update(0,{wave:1,paused:false});const near=kit.root.children.filter(o=>o.name.includes('sequential signal')).map(o=>o.material.emissiveIntensity);
  kit.update(2.1,{wave:1,paused:false});const far=kit.root.children.filter(o=>o.name.includes('sequential signal')).map(o=>o.material.emissiveIntensity);
  assert.notDeepEqual(near,far);assert.deepEqual(kit.inspection().centralOpening,before.centralOpening);assert.deepEqual(kit.localSolids.map(b=>({id:b.id,min:b.min.slice(),max:b.max.slice()})),boxes);
  kit.update(2.1,{wave:1,paused:true});assert.ok(kit.root.children.filter(o=>o.name.includes('sequential signal')).every(o=>o.material.emissiveIntensity<=.07));
 }finally{kit.dispose();}
});

test('near-to-far sweep markers move on inner rails, pause in place, and far locators stay visual-only',()=>{
 const kit=createSideDepthBays();try{
  const before=kit.inspection(),boxes=kit.localSolids.map(b=>({id:b.id,min:b.min.slice(),max:b.max.slice()}));
  assert.equal(before.dynamic.markerCount,2);assert.equal(before.dynamic.farLocatorRods,4);assert.equal(before.dynamic.farLocatorCollision,false);
  const markers=()=>kit.root.children.filter(o=>o.name.includes('near-far sweep marker'));
  const locators=kit.root.children.filter(o=>o.name.includes('far station /')&&o.name.includes('locator rod'));
  assert.equal(markers().length,2);assert.equal(locators.length,4);
  kit.update(0,{wave:1,paused:false});const near=markers().map(o=>o.position.toArray());
  kit.update(2.1,{wave:1,paused:false});const far=markers().map(o=>o.position.toArray());
  assert.notDeepEqual(far,near,'active sweep changes marker position');
  assert.ok(far.flat().every(Number.isFinite));
  for(const position of far)assert.ok(Math.abs(position[0])>60,'marker remains outside central lane');
  const central=new T.Box3(new T.Vector3(-55,0,82),new T.Vector3(55,700,182));
  for(const marker of markers())assert.equal(new T.Box3().setFromObject(marker).intersectsBox(central),false,'marker geometry remains outside central lane');
  kit.update(2.6,{wave:1,paused:true});assert.deepEqual(markers().map(o=>o.position.toArray()),far,'pause freezes marker world position');
  assert.deepEqual(kit.inspection().centralOpening,before.centralOpening);
  assert.deepEqual(kit.localSolids.map(b=>({id:b.id,min:b.min.slice(),max:b.max.slice()})),boxes,'visual markers and locators do not become collision solids');
 }finally{kit.dispose();}
});
