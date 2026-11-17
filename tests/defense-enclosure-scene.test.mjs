import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ENCLOSURE} from '../src/enclosure-profile.mjs';
import {EnclosureSpace} from '../src/enclosure-space.mjs';
import {createEnclosureDefenseScene} from '../src/defense-enclosure-scene.mjs';

function camera(aspect=195/146,transformed=false){const c=new T.PerspectiveCamera(55,aspect,.025,70);if(transformed){c.position.set(1.4,1.65,7.8);c.lookAt(-.1,1.15,-1.8);}c.updateProjectionMatrix();c.updateMatrixWorld(true);return c;}
const close=(a,b,t=3e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} (tolerance ${t})`);
function project(point,stage,c){const p=new T.Vector3(...point).applyMatrix4(stage.root.matrixWorld).project(c);return {x:(p.x+1)/2,y:(1-p.y)/2};}
function proxyFirst(ray,boxes){let result=null;for(const b of boxes){const p=ray.intersectBox(new T.Box3(new T.Vector3(...b.min),new T.Vector3(...b.max)),new T.Vector3());if(!p)continue;const distance=p.distanceTo(ray.origin);if(!result||distance<result.distance)result={id:b.id,distance};}return result;}
function towardsSource(point,stage,c){const target=new T.Vector3(...point).applyMatrix4(stage.root.matrixWorld);return new T.Ray(c.getWorldPosition(new T.Vector3()),target.sub(c.position).normalize());}

test('the actual transformed CAD front loop matches physical aperture UV for native and changed cameras',()=>{
 const stage=createEnclosureDefenseScene(),a=ENCLOSURE.aperture;
 for(const aspect of[195/146,16/10,16/9,.76])for(const transformed of[false,true]){
  const c=camera(aspect,transformed);stage.configure(c);
  for(const [index,point] of a.loop.entries()){
   const uv=project(point,stage,c),vertical=point.reduce((sum,v,i)=>sum+(v-a.center[i])*a.up[i],0);
   close(uv.x,.5+point[0]/a.width);close(uv.y,.5-vertical/a.height);
   close(stage.inspection().frontUV[index].x,uv.x);close(stage.inspection().frontUV[index].y,uv.y);
  }
  const uvs=stage.inspection().frontUV;
  close(Math.min(...uvs.map(v=>v.x)),0);close(Math.max(...uvs.map(v=>v.x)),1);
  close(Math.min(...uvs.map(v=>v.y)),0);close(Math.max(...uvs.map(v=>v.y)),1);
 }
 stage.dispose();
});

test('all four curved source seams retain their actual CAD points and correct camera-space projection',()=>{
 const stage=createEnclosureDefenseScene(),c=camera(1.6,true);stage.configure(c);const space=new EnclosureSpace(c,10),report=stage.inspection();
 assert.equal(report.sideGuides.length,4);assert.equal(report.frontLoopSource.length,40);
 for(const [i,path] of ENCLOSURE.cavity.paths.entries()){
  assert.deepEqual(report.sideGuides[i].sourcePoints,path.points);
  assert.equal(path.points.length,74);
  for(const [j,p] of path.points.entries()){
   const cameraLocal=new T.Vector3(...p).applyMatrix4(space.matrix),renderedLocal=new T.Vector3(...p).applyMatrix4(stage.root.matrixWorld).applyMatrix4(c.matrixWorldInverse);
   close(renderedLocal.x,cameraLocal.x,1e-9);close(renderedLocal.y,cameraLocal.y,1e-9);close(renderedLocal.z,cameraLocal.z,1e-9);
   const ndc=cameraLocal.applyMatrix4(c.projectionMatrix),uv=report.sideGuides[i].uv[j];close(uv.x,(ndc.x+1)/2);close(uv.y,(1-ndc.y)/2);
  }
  const initialDirection=new T.Vector3(...path.points[1]).sub(new T.Vector3(...path.points[0])).normalize();
  assert.ok(path.points.some((p,j)=>j>1&&new T.Vector3(...p).sub(new T.Vector3(...path.points[j-1])).normalize().cross(initialDirection).length()>.1),'CAD rounded transition was flattened');
 }
 assert.equal(report.designEyeMM.measured,false);close(report.designEyeMM.distance,487.200166);stage.dispose();
});

test('central physical-object reservation is open through real meshes and all collision proxies',()=>{
 const stage=createEnclosureDefenseScene(),c=camera(195/146,true);stage.configure(c);const caster=new T.Raycaster();
 let samples=0;
 for(let ix=0;ix<=10;ix++)for(let iy=0;iy<=12;iy++){
  caster.setFromCamera(new T.Vector2(-.52+ix*.104,-.72+iy*.12),c);
  assert.equal(caster.intersectObject(stage.root,true).length,0,`visible obstruction at ${ix}, ${iy}`);
  assert.equal(proxyFirst(caster.ray,stage.activeCollisionBoxes),null,`phantom obstruction at ${ix}, ${iy}`);samples++;
 }
 assert.equal(samples,143);assert.equal(stage.inspection().hiddenFloor,false);assert.equal(stage.inspection().centralRearPanel,false);
 stage.dispose();
});

test('side service fittings have real finite ray hits consistent with conservative bounds',()=>{
 const stage=createEnclosureDefenseScene(),c=camera(195/146,true);stage.configure(c);const caster=new T.Raycaster();
 for(const side of[-1,1])for(const z of[151,158,165]){
  const ray=towardsSource([side*94.5,9,z],stage,c);caster.ray.copy(ray);const hit=caster.intersectObject(stage.root,true)[0],proxy=proxyFirst(ray,stage.activeCollisionBoxes);
  assert.ok(hit,'visible finite cassette missed');assert.ok(proxy,'finite cassette missing collision');
  assert.ok(hit.object.name.includes('side service cassette'));assert.ok(proxy.id.includes('side service cassette'));
  assert.ok(proxy.distance<=hit.distance+1e-6);assert.ok(hit.distance-proxy.distance<.08,'proxy encloses too much air');
 }
 // The real interior beside each cassette remains empty, including its
 // projected white gap; a single cavity-wide box would fail this trace.
 for(const side of[-1,1]){const ray=towardsSource([side*70,9,158],stage,c);caster.ray.copy(ray);assert.equal(caster.intersectObject(stage.root,true).length,0);assert.equal(proxyFirst(ray,stage.activeCollisionBoxes),null);}
 stage.dispose();
});

test('thin seams use short finite proxies rather than a diagonal box across the cavity',()=>{
 const stage=createEnclosureDefenseScene(),c=camera();stage.configure(c);const report=stage.inspection();
 const railMembers=report.members.filter(m=>m.sourcePoints);assert.equal(railMembers.length,5);
 for(const member of railMembers){assert.ok(member.radiusMM<=.43);assert.ok(member.pieces>=member.sourcePoints.length-1);assert.ok(member.maxSegmentMM<=4+1e-9);}
 assert.ok(report.meshes<=30);assert.ok(report.triangles<50000);assert.ok(report.collisionBoxes<700);
 for(const b of stage.activeCollisionBoxes)for(let i=0;i<3;i++)assert.ok(Number.isFinite(b.min[i])&&b.max[i]>b.min[i]);
 const ray=towardsSource([0,ENCLOSURE.cavity.rearY,150],stage,c);assert.equal(proxyFirst(ray,stage.activeCollisionBoxes),null);
 stage.dispose();
});

test('configure preserves collision-array identity and never accumulates prior camera transforms',()=>{
 const stage=createEnclosureDefenseScene(),reference=stage.activeCollisionBoxes,c=camera(195/146,true);assert.equal(reference.length,0);
 stage.configure(c);const matrix=stage.root.matrix.toArray(),boxes=JSON.stringify(reference);assert.equal(stage.root.matrixAutoUpdate,false);
 stage.configure(camera(16/9));assert.strictEqual(stage.activeCollisionBoxes,reference);
 stage.configure(c);assert.deepEqual(stage.root.matrix.toArray(),matrix);assert.equal(JSON.stringify(reference),boxes);
 assert.strictEqual(stage.collisionBoxes,reference);stage.dispose();assert.equal(reference.length,0);
});

test('disposal frees owned resources once and does not dispose shared industrial materials',()=>{
 const shared=new T.MeshStandardMaterial(),stage=createEnclosureDefenseScene({materials:{alloy:shared}});let sharedDisposals=0,geometryDisposals=0;
 shared.addEventListener('dispose',()=>sharedDisposals++);stage.root.traverse(o=>{if(o.isMesh)o.geometry.addEventListener('dispose',()=>geometryDisposals++);});
 const count=stage.inspection().meshes;stage.configure(camera());stage.dispose();stage.dispose();assert.equal(geometryDisposals,count);assert.equal(sharedDisposals,0);assert.equal(stage.root.children.length,0);assert.throws(()=>stage.configure(camera()),/disposed/);shared.dispose();
});
