import * as T from 'three';
const clamp=T.MathUtils.clamp,UP=new T.Vector3(0,1,0);
const vector=(value,fallback=[0,0,-1])=>new T.Vector3(...(Array.isArray(value)&&value.length===3&&value.every(Number.isFinite)?value:fallback));
export function cloneDamageMaterial(source){const m=source.clone();m.onBeforeCompile=source.onBeforeCompile;m.customProgramCacheKey=source.customProgramCacheKey;return m;}

// Damage moves only rendered bodies. Rules/collision centres remain untouched.
// Pending impulses and detachments are consumed by update, never by pulse.
export function createEnemyDamageSystem({root,maxVisualOffset=.16}={}){
 const layer=new T.Group();layer.name='interceptor / real detached armour';root.add(layer);
 const states=new Map(),debris=[];let serial=0,disposed=false;
 function register(actor){const parts=[];actor.model.traverse(o=>{if(o.isMesh&&o.userData.damageArmour)parts.push({object:o,...o.userData.damageArmour,attached:true});});const state={id:actor.id,actor,parts,pending:new Map(),lastImpulseKey:null,impulses:0,hp:actor.data.hp??2,maxHP:actor.data.maxHP??2,offset:new T.Vector3(),velocity:new T.Vector3(),angle:new T.Vector3(),angularVelocity:new T.Vector3(),deathAt:null,deathDirection:new T.Vector3(0,0,-1),rotorAngles:actor.rotors.map(()=>0),flicker:1,detached:0,lastTime:null};states.set(actor.id,state);return state;}
 function queue(id,event){const s=states.get(id);if(!s||disposed)return false;const stamp=Number.isFinite(event.time)?event.time:0,key=`${event.projectileId??'contact'}/${stamp.toFixed(6)}`;const previous=s.pending.get(key);s.pending.set(key,{...previous,...event,type:event.type==='kill'||previous?.type==='kill'?'kill':'hit',key});return true;}
 function detach(s,part,event,time){if(!part?.attached)return;const mesh=part.object;mesh.updateWorldMatrix(true,false);const origin=mesh.localToWorld(vector(part.localCenter,[0,0,0]));
  // Keep every original vertex/UV unchanged at rest. The detached object's
  // centre-of-mass group supplies the later tumbling pivot instead.
  const object=new T.Group();object.name=`wreck armour / ${s.id} / ${part.id}`;layer.add(object);object.position.copy(layer.worldToLocal(origin.clone()));object.updateWorldMatrix(true,false);object.attach(mesh);
  const source=mesh.material,owned=(Array.isArray(source)?source:[source]).map(cloneDamageMaterial);mesh.material=Array.isArray(source)?owned:owned[0];part.attached=false;s.detached++;
  const direction=vector(event.direction).normalize(),normal=vector(event.normal,[part.id.includes('port')?-1:1,.4,0]).normalize(),side=part.id.includes('port')?-1:part.id.includes('starboard')?1:(s.id%2?1:-1);
  const velocity=direction.multiplyScalar(event.type==='kill'?.55:.31).addScaledVector(normal,.24);velocity.y+=.24;velocity.x+=side*.08;
  const localOrigin=object.position.clone(),inv=layer.getWorldQuaternion(new T.Quaternion()).invert();velocity.applyQuaternion(inv);const gravity=new T.Vector3(0,-1.8,0).applyQuaternion(inv),angular=new T.Vector3(side*2.3,1.1+serial%3*.3,-side*1.7);
  debris.push({id:++serial,enemyId:s.id,part:part.id,object,mesh,materials:owned,born:time,life:1.75+(serial%3)*.10,origin:localOrigin,velocity,gravity,quaternion:object.quaternion.clone(),angular,contact:event.position?.slice()??null});
 }
 function applyPending(s,time){for(const event of s.pending.values()){
   if(Number.isFinite(event.maxHP))s.maxHP=Math.max(1,event.maxHP);if(Number.isFinite(event.hp))s.hp=clamp(event.hp,0,s.maxHP);
   if(event.key!==s.lastImpulseKey){s.lastImpulseKey=event.key;s.impulses++;const inv=s.actor.group.getWorldQuaternion(new T.Quaternion()).invert(),direction=vector(event.direction).normalize().applyQuaternion(inv),normal=vector(event.normal,[.22,.1,1]).normalize().applyQuaternion(inv),torque=normal.clone().cross(direction);
    s.velocity.addScaledVector(direction,2.65);s.angularVelocity.addScaledVector(torque,4.8);s.angularVelocity.x+=direction.z*.75;s.angularVelocity.z+=normal.x*2.1+(s.id%2?1:-1)*.45;
   }
   const fatal=event.type==='kill'||s.hp<=0;
   if(fatal&&s.deathAt===null){s.hp=0;s.deathAt=Number.isFinite(event.time)?event.time:time;s.deathDirection.copy(vector(event.direction).normalize());}
   const target=fatal?s.parts.length:s.hp/s.maxHP<=.30?2:s.hp/s.maxHP<=.60?1:0,already=s.parts.filter(p=>!p.attached).length;
   const available=s.parts.filter(p=>p.attached&&(fatal||p.preDeath));s.actor.model.updateWorldMatrix(true,true);
   available.sort((a,b)=>{const hit=vector(event.position,[s.actor.data.x,s.actor.data.y??1.05,s.actor.data.z]);return a.object.localToWorld(vector(a.localCenter,[0,0,0])).distanceToSquared(hit)-b.object.localToWorld(vector(b.localCenter,[0,0,0])).distanceToSquared(hit);});
   for(let i=0;i<Math.max(0,target-already)&&i<available.length;i++)detach(s,available[i],event,time);
  }s.pending.clear();}
 function updateActor(s,time,dt){
  if(disposed)return {remove:false,flicker:1,deathAge:0};
  if(dt>0)applyPending(s,time);const fatal=s.deathAt!==null,deathAge=fatal?Math.max(0,time-s.deathAt):0,steps=Math.max(1,Math.ceil(dt/(1/120))),step=dt/steps;
  for(let i=0;i<steps&&step>0;i++){
   s.velocity.addScaledVector(s.offset,-300*step).multiplyScalar(Math.exp(-10.5*step));s.offset.addScaledVector(s.velocity,step);s.angularVelocity.addScaledVector(s.angle,-220*step).multiplyScalar(Math.exp(-10*step));s.angle.addScaledVector(s.angularVelocity,step);
  }
  if(s.offset.length()>.125)s.offset.setLength(.125);for(const key of ['x','y','z'])s.angle[key]=clamp(s.angle[key],-.18,.18);
  const ratio=s.hp/Math.max(1,s.maxHP),critical=!fatal&&ratio<=.30;
  const hull=s.actor.hull;hull.position.add(s.offset);hull.rotation.x+=s.angle.x;hull.rotation.y+=s.angle.y;hull.rotation.z+=s.angle.z;
  if(fatal){const settle=1-Math.exp(-deathAge*4);hull.position.y-=.10*settle;hull.position.x+=Math.sin(s.id*2.1)*.035*settle;hull.rotation.x+=.35*settle;hull.rotation.z+=(s.id%2?1:-1)*.78*settle;hull.rotation.y+=deathAge*.22;}
  else {hull.rotation.x=clamp(hull.rotation.x,-.20,.20);hull.rotation.z=clamp(hull.rotation.z,-.20,.20);}
  if(hull.position.length()>maxVisualOffset)hull.position.setLength(maxVisualOffset);
  s.flicker=fatal?(deathAge<.12?.25:0):critical?(.20+.80*(Math.sin(time*41+s.id*.7)>.12?1:0)):1;
  const slow=fatal?Math.max(0,1-deathAge/.48):critical?.46+.12*Math.sin(time*13):ratio<.7?.83:1;
  s.actor.rotors.forEach((rotor,i)=>{if(dt>0)s.rotorAngles[i]+=dt*(i%2?-18:18)*slow;rotor.rotation.y=s.rotorAngles[i];rotor.rotation.x=critical?Math.sin(time*27+i)*.075:fatal?Math.sin(deathAge*16+i)*.08*Math.max(0,1-deathAge):0;});
  const opacity=fatal?clamp((1.30-deathAge)/.48,0,1):1;
  for(const material of s.actor.ownedMaterials){if(fatal&&deathAge>.82&&!material.transparent){material.transparent=true;material.depthWrite=false;material.needsUpdate=true;}material.opacity=opacity;}
  s.lastTime=time;return {remove:fatal&&deathAge>=1.30,flicker:s.flicker,deathAge,critical};
 }
 function updateDebris(time){for(let i=debris.length-1;i>=0;i--){const d=debris[i],age=Math.max(0,time-d.born);if(age>=d.life){layer.remove(d.object);for(const m of d.materials)m.dispose();debris.splice(i,1);continue;}d.object.position.copy(d.origin).addScaledVector(d.velocity,age).addScaledVector(d.gravity,.5*age*age);const spin=new T.Quaternion().setFromEuler(new T.Euler(d.angular.x*age,d.angular.y*age,d.angular.z*age));d.object.quaternion.copy(d.quaternion).multiply(spin);const opacity=clamp((d.life-age)/.34,0,1);for(const m of d.materials){if(opacity<1&&!m.transparent){m.transparent=true;m.depthWrite=false;m.needsUpdate=true;}m.opacity=opacity;}d.mesh.castShadow=opacity>.98;}}
 function unregister(id){states.delete(id);}
 function reset(){for(const d of debris){layer.remove(d.object);for(const m of d.materials)m.dispose();}debris.length=0;states.clear();serial=0;}
 function inspection(){root.updateMatrixWorld(true);return {damageActors:[...states.values()].map(s=>({id:s.id,hp:s.hp,maxHP:s.maxHP,deathAt:s.deathAt,impulses:s.impulses,logicalPosition:[s.actor.data.x,s.actor.data.y??1.05,s.actor.data.z],visualCenter:s.actor.hull.getWorldPosition(new T.Vector3()).toArray(),visualScale:s.actor.group.scale.toArray(),pendingImpacts:s.pending.size,visualOffset:s.actor.hull.position.toArray(),visualRotation:s.actor.hull.rotation.toArray().slice(0,3),recoil:s.offset.toArray(),parts:s.parts.map(p=>({id:p.id,triangles:p.triangles,attached:p.attached,worldPosition:p.object.localToWorld(vector(p.localCenter,[0,0,0])).toArray()})),detached:s.detached,flicker:s.flicker})),damageDebris:debris.map(d=>({id:d.id,enemyId:d.enemyId,part:d.part,born:d.born,life:d.life,position:d.object.getWorldPosition(new T.Vector3()).toArray(),contact:d.contact?.slice()??null,opacity:d.materials[0].opacity}))};}
 function dispose(){if(disposed)return;reset();disposed=true;root.remove(layer);}
 return {register,queue,updateActor,updateDebris,unregister,reset,inspection,dispose,layer};
}
