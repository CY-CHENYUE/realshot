import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createEnclosureArt} from '../src/defense-enclosure-art.mjs';

test('side equipment preserves the central physical-object volume in real geometry and finite source proxies',()=>{
 const kit=createEnclosureArt();try{
  const report=kit.inspection();assert.ok(report.meshes<=120);assert.ok(report.triangles<50000);
  const reservation=new T.Box3(new T.Vector3(-55,-100,85),new T.Vector3(55,80,210));
  for(const b of kit.localSolids){assert.equal(Array.isArray(b.min),true);assert.ok(b.min.every((v,i)=>Number.isFinite(v)&&v<b.max[i]));assert.equal(new T.Box3(new T.Vector3(...b.min),new T.Vector3(...b.max)).intersectsBox(reservation),false,b.id);}
  const ray=new T.Raycaster();for(const x of[-54,-27,0,27,54])for(const z of[86,110,145,180,209]){ray.ray.set(new T.Vector3(x,-100,z),new T.Vector3(0,1,0));assert.equal(ray.intersectObject(kit.root,true).length,0);}
  assert.equal(report.hiddenFloor,false);assert.equal(report.centralRearPanel,false);assert.equal(report.assemblies.length,3);
 }finally{kit.dispose();}
});

test('continuous side skins and roof service band follow measured cavity limits without a low central ceiling',()=>{
 const kit=createEnclosureArt();try{
  for(const side of['port','starboard']){
   assert.equal(kit.localSolids.filter(b=>b.id.startsWith(side+' wall / formed skin')).length,3);
   assert.ok(kit.localSolids.some(b=>b.id===side+' wall / continuous skirting'));
  }
  const roof=kit.localSolids.filter(b=>b.id.startsWith('overhead / sealed service skin'));
  assert.equal(roof.length,3);assert.ok(roof.every(b=>b.min[2]>215));
  const samples=kit.inspection().assemblies.find(a=>a.id==='continuous-side-shell-and-roof').ceilingSamplesMM;
  assert.ok(samples[0].z>samples.at(-1).z,'roof recedes on the actual descending CAD ceiling');
 }finally{kit.dispose();}
});

test('all equipment is supported at the finite CAD side floor and the reserved toolbox has its own bounded support',()=>{
 const kit=createEnclosureArt();try{
  const report=kit.inspection(),bounds=new T.Box3().setFromObject(kit.root);assert.ok(bounds.min.z>=80.39);assert.ok(bounds.min.x>=-97.5);assert.ok(bounds.max.x<=97.5);
  for(const side of[-1,1])assert.ok(kit.localSolids.some(b=>b.id.includes('maintenance deck')&&b.min[0]*side>0&&Math.abs(b.min[2]-80.5)<.001));
  const prop=report.cadPropPlacements[0];assert.equal(prop.url,'assets/hangar/metal_toolbox.glb');assert.equal(prop.centerCAD[2]-prop.heightMM/2,prop.supportTopCAD);assert.ok(Math.abs(prop.centerCAD[0])-prop.maximumSizeMM[0]/2>55);
 }finally{kit.dispose();}
});

test('source millimetres become metre UVs and disposal does not release the caller industrial materials',()=>{
 const shared=new T.MeshStandardMaterial(),kit=createEnclosureArt({materials:{alloy:shared}});let released=0,geometryCount=0;shared.addEventListener('dispose',()=>released++);
 kit.root.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position,u=o.geometry.attributes.uv;assert.equal(u.count,p.count);for(let i=0;i<u.count;i++)assert.ok(Math.abs(u.getX(i))<1&&Math.abs(u.getY(i))<1,'UVs cannot retain raw millimetres');o.geometry.addEventListener('dispose',()=>geometryCount++);});
 const meshCount=kit.inspection().meshes;kit.dispose();kit.dispose();assert.equal(geometryCount,meshCount);assert.equal(released,0);assert.equal(kit.root.children.length,0);assert.equal(kit.localSolids.length,0);shared.dispose();
});
