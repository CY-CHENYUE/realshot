import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createEnclosureDefenseScene} from '../src/defense-enclosure-scene.mjs';
import {createEnclosureArt} from '../src/defense-enclosure-art.mjs';
import {traceScenery} from '../src/defense-core.mjs';

function camera(){const c=new T.PerspectiveCamera(69.844780816,195/146.000001,.06,160);c.position.set(0,1.65,7.8);c.lookAt(0,1.15,-1.8);c.updateMatrixWorld(true);return c;}

test('detailed facilities retain the measured aperture and do not turn the reserved centre into a collider',()=>{
 const c=camera(),guide=createEnclosureDefenseScene(),artKit=createEnclosureArt(),detailed=createEnclosureDefenseScene({artKit});
 try{
  guide.configure(c);detailed.configure(c);assert.deepEqual(detailed.inspection().frontUV,guide.inspection().frontUV);assert.deepEqual(detailed.inspection().sideGuides,guide.inspection().sideGuides);assert.ok(detailed.inspection().details);
  for(const x of[-50,-25,0,25,50])for(const z of[95,130,170,200]){
   const a=new T.Vector3(x,-72,z).applyMatrix4(detailed.root.matrixWorld),b=new T.Vector3(x,65,z).applyMatrix4(detailed.root.matrixWorld);assert.equal(traceScenery(a.toArray(),b.toArray(),detailed.activeCollisionBoxes),null,`reserved ray ${x}/${z}`);
  }
  assert.equal(detailed.inspection().hiddenFloor,false);assert.equal(detailed.inspection().centralRearPanel,false);
 }finally{guide.dispose();detailed.dispose();}
});

test('late CAD prop registration updates the same collision array and stays within its finite side footprint',()=>{
 const s=createEnclosureDefenseScene({artKit:createEnclosureArt()}),c=camera();s.configure(c);const boxes=s.activeCollisionBoxes,count=boxes.length,model=new T.Mesh(new T.BoxGeometry(12,18,20),new T.MeshStandardMaterial());model.position.set(87.8,-46,94.4);model.updateMatrixWorld(true);const local=new T.Box3().setFromObject(model);
 try{
  s.addCADProp('test finite side prop',model,local);assert.equal(s.activeCollisionBoxes,boxes);assert.equal(boxes.length,count+1);assert.equal(boxes.at(-1).id,'test finite side prop');
  const a=new T.Vector3(87.8,-70,94.4).applyMatrix4(s.root.matrixWorld),b=new T.Vector3(87.8,-30,94.4).applyMatrix4(s.root.matrixWorld);assert.ok(traceScenery(a.toArray(),b.toArray(),boxes));
  const middleA=new T.Vector3(0,-70,130).applyMatrix4(s.root.matrixWorld),middleB=new T.Vector3(0,65,130).applyMatrix4(s.root.matrixWorld);assert.equal(traceScenery(middleA.toArray(),middleB.toArray(),boxes),null);
  s.configure(c);assert.equal(boxes.length,count+1,'resize/configure cannot duplicate the prop');
 }finally{model.geometry.dispose();model.material.dispose();s.dispose();}
});
