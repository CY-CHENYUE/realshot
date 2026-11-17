import * as T from 'three';
import {CombatBursts} from './combat-burst.mjs';
import {ImpactBursts} from './impact-burst.mjs';
import {tracerSegment,WallImpactFX} from './depth-shot-fx.mjs';
export class DefenseEffects{
 constructor(scene,{depthFeedback=false}={}){this.scene=scene;this.depthFeedback=depthFeedback;this.wallFX=depthFeedback?new WallImpactFX(scene):null;this.tracerGeometry=new T.CylinderGeometry(1,0,1,6);this.tracerMaterial=new T.MeshBasicMaterial({color:'#b76825',toneMapped:false});this.bursts=new CombatBursts(scene);this.impacts=new ImpactBursts(scene);this.bullets=new Map();this.bits=[];this.g=new T.SphereGeometry(.035,8,6);this.m=new T.MeshBasicMaterial({color:'#e8a53b',toneMapped:false});this.trailM=new T.LineBasicMaterial({color:'#cf8a37',transparent:true,opacity:.68});this.bitG=new T.IcosahedronGeometry(1,0);this.bitM=new T.MeshStandardMaterial({color:'#e99655',roughness:.55,metalness:.15,transparent:true});this.pool=new T.InstancedMesh(this.bitG,this.bitM,180);this.pool.instanceMatrix.setUsage(T.DynamicDrawUsage);this.pool.frustumCulled=false;this.pool.count=0;scene.add(this.pool);this.temp=new T.Object3D();this.color=new T.Color();this.marks=[];this.haze=[];this.cameraQ=new T.Quaternion();
 // The real exposure segment tapers geometrically toward its past position.
 // Opaque colour stays readable over the white backstop without HDR alpha wash.

 const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,.7)');g.addColorStop(.3,'rgba(255,255,255,.38)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);this.hazeTexture=new T.CanvasTexture(c);this.hazeGeometry=new T.PlaneGeometry(1,1);
 const hole=document.createElement('canvas');hole.width=hole.height=64;const h=hole.getContext('2d'),hg=h.createRadialGradient(32,32,1,32,32,30);hg.addColorStop(0,'rgba(0,0,0,.95)');hg.addColorStop(.15,'rgba(0,0,0,.85)');hg.addColorStop(.25,'rgba(0,0,0,.25)');hg.addColorStop(.6,'rgba(0,0,0,.18)');hg.addColorStop(1,'rgba(0,0,0,0)');h.fillStyle=hg;h.fillRect(0,0,64,64);this.holeTexture=new T.CanvasTexture(hole);this.holeMaterial=new T.MeshBasicMaterial({map:this.holeTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
 }
 surfaceEvent(e){
  if(!e.position)return;
  if(this.depthFeedback&&e.type==='scenery')return;
  if(['ground','scenery'].includes(e.type)){
   const mark=new T.Mesh(this.hazeGeometry,this.holeMaterial),n=new T.Vector3(...(e.normal||[0,1,0]));mark.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),n);mark.position.fromArray(e.position).addScaledVector(n,.006);mark.scale.setScalar(.11);this.scene.add(mark);this.marks.push(mark);if(this.marks.length>30)this.scene.remove(this.marks.shift());
  }
  if(['scenery','ground'].includes(e.type)){
   const m=new T.MeshBasicMaterial({map:this.hazeTexture,color:e.type==='kill'?'#807d71':'#afb0a5',transparent:true,opacity:.28,depthWrite:false});const o=new T.Mesh(this.hazeGeometry,m);o.position.fromArray(e.position);this.scene.add(o);this.haze.push({o,age:0,life:e.type==='kill'?.8:.48,origin:o.position.clone()});
   if(this.haze.length>24){const old=this.haze.shift();this.scene.remove(old.o);old.o.material.dispose();}
  }
 }
 
 sync(projectiles,camera){
  this.cameraQ.copy(camera.quaternion);const ids=new Set(projectiles.map(p=>p.id));
  for(const[id,v]of this.bullets)if(!ids.has(id)){this.scene.remove(v.head,v.trail);if(!v.worldTracer)v.trail.geometry.dispose();this.bullets.delete(id);}
  for(const p of projectiles){
   let b=this.bullets.get(p.id);
   if(!b){
    const head=new T.Mesh(this.g,this.m),worldTracer=this.depthFeedback;
    const geo=worldTracer?this.tracerGeometry:new T.BufferGeometry();if(!worldTracer)geo.setAttribute('position',new T.BufferAttribute(new Float32Array(6),3));
    const trail=worldTracer?new T.Mesh(geo,this.tracerMaterial):new T.Line(geo,this.trailM);this.scene.add(head,trail);b={head,trail,worldTracer};this.bullets.set(p.id,b);
   }
   b.head.position.fromArray(p.position);
   if(b.worldTracer){
    const segment=tracerSegment(p);b.trail.visible=!!segment&&segment.length>.0001;
    if(segment){const tail=new T.Vector3(...segment.tail),head=new T.Vector3(...segment.head),delta=head.clone().sub(tail);b.trail.position.copy(head).add(tail).multiplyScalar(.5);b.trail.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());b.trail.scale.set(segment.radius,segment.length,segment.radius);b.head.scale.setScalar(.72);}
   }else{
    const depth=-b.head.position.clone().applyMatrix4(camera.matrixWorldInverse).z;b.head.scale.setScalar(Math.min(1,Math.max(.025,depth*.002/.035)));
    const length=Math.min(.75,p.distance||0),tail=p.position.map((v,i)=>v-p.direction[i]*length);b.trail.geometry.attributes.position.array.set([...tail,...p.position]);b.trail.geometry.attributes.position.needsUpdate=true;b.trail.visible=p.age>0;
   }
  }
 }
 pulse(e){this.wallFX?.trigger(e);this.surfaceEvent(e);if(e.type==='kill')this.bursts.trigger(e);if(e.type==='hit')this.impacts.trigger(e);if(!e.position||!['hit','kill','blocked','ground','scenery','protectorHit'].includes(e.type))return;const n=['kill','hit'].includes(e.type)||(this.depthFeedback&&e.type==='scenery')?0:e.type==='protectorHit'?15:8;for(let i=0;i<n;i++){const a=i*2.399+(e.enemyId||0),s=.6+(i%4)*.23;this.bits.push({p:new T.Vector3(...e.position),v:new T.Vector3(Math.cos(a)*s,.8+(i%5)*.2,Math.sin(a)*s),age:0,life:.38+(i%3)*.13,size:e.type==='kill'?.065:.034,color:e.type==='blocked'?'#5aab93':e.type==='protectorHit'?'#e16040':'#e4a66b'});}this.bits=this.bits.slice(-180);}
 update(dt){this.wallFX?.update(dt);this.bursts.update(dt);this.impacts.update(dt);for(const h of this.haze){h.age+=dt;const f=h.age/h.life;h.o.quaternion.copy(this.cameraQ);h.o.position.copy(h.origin);h.o.position.y+=h.age*.23;h.o.scale.setScalar(.12+h.age*.62);h.o.material.opacity=(1-f)*.24;}for(const h of this.haze.filter(h=>h.age>=h.life)){this.scene.remove(h.o);h.o.material.dispose();}this.haze=this.haze.filter(h=>h.age<h.life);let i=0;for(const p of this.bits){p.age+=dt;if(p.age>=p.life)continue;p.v.y-=3.5*dt;p.p.addScaledVector(p.v,dt);this.temp.position.copy(p.p);this.temp.rotation.set(p.age*4,p.age*6,p.age);this.temp.scale.setScalar(p.size*(1-p.age/p.life));this.temp.updateMatrix();this.pool.setMatrixAt(i,this.temp.matrix);this.pool.setColorAt(i,this.color.set(p.color));i++;}this.bits=this.bits.filter(p=>p.age<p.life);this.pool.count=i;this.pool.instanceMatrix.needsUpdate=true;if(this.pool.instanceColor)this.pool.instanceColor.needsUpdate=true;}
 reset(){this.wallFX?.reset();this.bursts.reset();this.impacts.reset();for(const b of this.bullets.values()){this.scene.remove(b.head,b.trail);if(!b.worldTracer)b.trail.geometry.dispose();}this.bullets.clear();this.bits=[];this.pool.count=0;for(const o of this.marks)this.scene.remove(o);this.marks=[];for(const h of this.haze){this.scene.remove(h.o);h.o.material.dispose();}this.haze=[];}
 inspection(){return {depthFeedback:this.depthFeedback,wall:this.wallFX?.inspection()??null,tracers:[...this.bullets.entries()].map(([id,b])=>({id,head:b.head.position.toArray(),worldTracer:b.worldTracer,tailCenter:b.trail.position.toArray(),length:b.worldTracer?b.trail.scale.y:null})),bursts:this.bursts.inspection(),impacts:this.impacts.inspection(),impactBits:this.bits.length,haze:this.haze.length,marks:this.marks.length,bulletVisuals:this.bullets.size};}
 prewarm(){const e={enemyId:-999,position:[0,1,-2],enemyPosition:[0,1,-2.2],direction:[0,0,-1],normal:[0,0,1],hp:1,maxHP:2};this.impacts.trigger({...e,type:'hit'});this.bursts.trigger({...e,type:'kill',hp:0});this.impacts.update(.07);this.bursts.update(.07);}
 dispose(){this.reset();this.bursts.dispose();this.impacts.dispose();this.wallFX?.dispose();this.tracerGeometry.dispose();this.tracerMaterial.dispose();this.scene.remove(this.pool);for(const geometry of [this.g,this.bitG,this.hazeGeometry])geometry.dispose();for(const material of [this.m,this.trailM,this.bitM,this.holeMaterial])material.dispose();this.hazeTexture.dispose();this.holeTexture.dispose();}
}
