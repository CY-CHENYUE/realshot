// Deterministic world-space defense simulation. It has no renderer, browser
// clock or audio owner: the caller pauses it simply by not advancing it.
export const DEFENSE_RULES=Object.freeze({
 step:1/120,protectedHP:100,magSize:18,fireInterval:.14,reloadTime:2.1,emptyReloadTime:2.72,
 projectileSpeed:45,projectileRange:36,projectileRadius:.025,enemyHP:2,enemyRadius:.45,enemyCenterY:1.05,
 enemySpeed:.85,enemyDamage:10,spawnDuration:.65,attackWindup:.95,attackCooldown:1.45,
 hitStun:.38,knockback:.16,attackRadius:1.4,protectorCenter:Object.freeze([0,1,0]),protectorRadius:.72,
 missionDuration:66,groundEnabled:true
});
const EPS=1e-9,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const length=a=>Math.hypot(...a),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const addScaled=(a,b,t)=>a.map((v,i)=>v+b[i]*t),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const copySpec=s=>({...s,position:s.position?.slice(),path:s.path?.map(p=>p.slice())});
function pointOnPath(path,t){
 if(path.length===2)return path[0].map((v,i)=>v+(path[1][i]-v)*t);
 const s=1-t;return path[0].map((v,i)=>s*s*v+2*s*t*path[1][i]+t*t*path[2][i]);
}
function pathLength(path){let result=0,prev=pointOnPath(path,0);for(let i=1;i<=32;i++){const p=pointOnPath(path,i/32);result+=Math.hypot(p[0]-prev[0],p[1]-prev[1]);prev=p;}return result;}
function defaultPath(lane,index){
 const offset=Math.sin(index*2.399)*.28;
 switch(lane){
  // Keep every approach in a side corridor so the protected centre remains
  // visible on the transparent box display. Enemies still attack the same
  // logical core from an oblique angle; only their visual route avoids the
  // physical-object reservation in the middle of the panel.
  case 0:{const side=index%2?-1:1;return [[side*(4.7+offset),-6.8],[side*4.45,-3.2],[side*3.8,-.05]];}
  case 1:return [[5.9,-1.8+offset],[4.65,-.45+offset],[4.0,.4]];
  case 2:{const side=index%2?-1:1;return [[side*(4.35+offset),3.9],[side*3.85,2.3],[side*3.25,1.3]];}
  default:return [[-5.9,-.6+offset],[-4.65,.45+offset],[-4.0,.4]];
 }
}
function defaultSpawns(baseSpeed=DEFENSE_RULES.enemySpeed){
 const result=[];for(let wave=0;wave<3;wave++)for(let i=0;i<6;i++)result.push({at:2+wave*21+i*(wave===2?2.5:2.8),lane:(i+wave)%4,wave:wave+1,speed:baseSpeed+wave*.1});
 return result;
}
// Earliest intersection of a swept point and a moving sphere, in normalized
// substep time. Relative motion catches enemies crossing a bullet's path.
function sweepSphere(start,end,centerStart,centerEnd,radius){
 const p=sub(start,centerStart),v=sub(sub(end,start),sub(centerEnd,centerStart)),c=dot(p,p)-radius*radius;
 if(c<=0)return 0;const a=dot(v,v);if(a<EPS)return null;
 const b=2*dot(p,v),d=b*b-4*a*c;if(d<0)return null;
 const t=(-b-Math.sqrt(d))/(2*a);return t>=-EPS&&t<=1+EPS?clamp(t):null;
}
function finiteVector(v){return Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);}
function halfExtents(value,label){
 if(value===undefined||value===null)return null;
 if(!finiteVector(value)||value.some(v=>v<=0))throw Error(label+' needs three finite positive half extents');
 return value;
}
function copyScenery(boxes){
 if(!Array.isArray(boxes))throw Error('Scenery collision boxes must be an array');
 const ids=new Set();
 return boxes.map((box,index)=>{
  if(!box||!finiteVector(box.min)||!finiteVector(box.max)||box.min.some((v,i)=>v>=box.max[i]))throw Error('Scenery collision boxes need finite min/max corners and positive volume');
  const id=String(box.id??`scenery-${index}`);if(ids.has(id))throw Error('Scenery collision box IDs must be unique');ids.add(id);
  return {id,min:box.min.slice(),max:box.max.slice()};
 });
}
// Slab intersection against a projectile-radius-expanded box. The returned
// normal is the entry face normal, including oblique/corner approaches.
function sweepBox(start,end,box,radius=0){
 const delta=sub(end,start);let near=0,far=1,normal=[0,0,0];
 for(let axis=0;axis<3;axis++){
  const low=box.min[axis]-radius,high=box.max[axis]+radius,d=delta[axis];
  if(Math.abs(d)<EPS){if(start[axis]<low-EPS||start[axis]>high+EPS)return null;continue;}
  let entry=(low-start[axis])/d,exit=(high-start[axis])/d,sign=-1;
  if(entry>exit){[entry,exit]=[exit,entry];sign=1;}
  if(entry>near){near=entry;normal=[0,0,0];normal[axis]=sign;}
  far=Math.min(far,exit);if(near>far+EPS)return null;
 }
 if(far<-EPS||near>1+EPS)return null;
 if(normal.every(v=>v===0)){
  const axis=delta.reduce((best,v,i)=>Math.abs(v)>Math.abs(delta[best])?i:best,0);normal[axis]=delta[axis]>0?-1:1;
 }
 return {t:clamp(near),normal};
}
// Aim selection can use the same solid volumes as the simulation. Position is
// on the visible surface; center is the projectile center at first contact.
export function traceScenery(start,end,boxes,radius=0){
 if(!finiteVector(start)||!finiteVector(end)||!Number.isFinite(radius)||radius<0)throw Error('Invalid scenery trace');
 let best=null;
 for(const box of boxes){const hit=sweepBox(start,end,box,radius);if(hit&&(!best||hit.t<best.t-EPS))best={...hit,colliderId:box.id};}
 if(!best)return null;
 const center=start.map((v,i)=>v+(end[i]-v)*best.t),position=center.map((v,i)=>v-best.normal[i]*radius);
 return {...best,center,position};
}
function traceBody(start,end,centerStart,centerEnd,{extents,sphereRadius},radius){
 if(!finiteVector(start)||!finiteVector(end)||!finiteVector(centerStart)||!finiteVector(centerEnd)||!Number.isFinite(radius)||radius<0)throw Error('Invalid body trace');
 let hit,normal;
 if(extents){
  // Relative translation keeps moving AABB proxies swept between physics
  // endpoints. These opt-in bounds deliberately do not claim mesh precision.
  hit=sweepBox(sub(start,centerStart),sub(end,centerEnd),{min:extents.map(v=>-v),max:extents},radius);
  if(!hit)return null;normal=hit.normal;
 }else{
  const t=sweepSphere(start,end,centerStart,centerEnd,sphereRadius+radius);if(t===null)return null;
  const relative=sub(addScaled(start,sub(end,start),t),addScaled(centerStart,sub(centerEnd,centerStart),t)),n=length(relative);
  normal=n>EPS?relative.map(v=>v/n):[0,0,0];hit={t};
 }
 const center=addScaled(start,sub(end,start),hit.t),position=center.map((v,i)=>v-normal[i]*radius);
 return {t:hit.t,normal,center,position,shape:extents?'aabb':'sphere'};
}
// Shared aim/simulation contract. Radius=0 selects the proxy aim surface;
// a projectile radius expands the same body for continuous collision. If no
// optional half extents are supplied, the historical sphere stays unchanged.
export function traceProtector(start,end,rules=DEFENSE_RULES,radius=0){
 // A physical display prop has no software silhouette or collision volume.
 // This option removes the virtual core's friendly-fire blocker as well as
 // its visual; enemy attacks still reduce the abstract objective's health.
 if(rules.protectorBlocksShots===false)return null;
 const center=rules.protectorCenter??DEFENSE_RULES.protectorCenter;
 return traceBody(start,end,center,center,{extents:halfExtents(rules.protectorHalfExtents,'protectorHalfExtents'),sphereRadius:rules.protectorRadius??DEFENSE_RULES.protectorRadius},radius);
}
// Aim uses the current enemy center by default. Simulation supplies the sixth
// argument (previousCenter) to sweep its real translation in this substep.
// enemyHalfExtents is a yaw-independent, conservative gameplay AABB; recoil,
// detached armour, holes and the exact rendered silhouette are not simulated.
export function traceEnemy(start,end,enemy,rules=DEFENSE_RULES,radius=0,previousCenter=null){
 const center=[enemy.x,enemy.y??rules.enemyCenterY??DEFENSE_RULES.enemyCenterY,enemy.z];
 return traceBody(start,end,previousCenter??center,center,{extents:halfExtents(rules.enemyHalfExtents,'enemyHalfExtents'),sphereRadius:rules.enemyRadius??DEFENSE_RULES.enemyRadius},radius);
}
export class DefenseGame{
 constructor({rules={},spawns,sceneryBoxes=rules.sceneryBoxes??[]}={}){
  this.rules={...DEFENSE_RULES,...rules,protectorCenter:(rules.protectorCenter||DEFENSE_RULES.protectorCenter).slice()};
  for(const key of ['protectorHalfExtents','enemyHalfExtents']){const value=halfExtents(this.rules[key],key);if(value)this.rules[key]=value.slice();}
  this.sceneryBoxes=copyScenery(sceneryBoxes);
  // A caller may ask for finer integration, but cannot accidentally reintroduce
  // coarse-step tunneling by increasing this value.
  this.rules.step=Math.min(DEFENSE_RULES.step,Math.max(1/1000,this.rules.step));
  this.schedule=(spawns??defaultSpawns(this.rules.enemySpeed)).map(copySpec).sort((a,b)=>a.at-b.at);
  for(const s of this.schedule){if(!Number.isFinite(s.at)||s.at<0)throw Error('Spawn time must be nonnegative');}
  this.restart();
 }
 restart(){
  this.time=0;this._tick=0;this._accumulator=0;this._spawnIndex=0;this._enemySequence=0;this._shotSequence=0;this._announcedWave=0;
  this.state='running';this.protectedHP=this.rules.protectedHP;this.magSize=this.rules.magSize;this.ammo=this.magSize;
  this.nextFire=0;this.reloadAt=null;this.reloadStartedAt=null;this.reloadDuration=this.rules.reloadTime;
  this.enemies=[];this.projectiles=[];this.score=0;this.kills=0;this.shots=0;this.hits=0;this.wave=1;return this;
 }
 get reloading(){return this.reloadAt!==null;}
 reload(){
  if(this.state!=='running'||this.reloading||this.ammo===this.magSize)return false;
  this.reloadDuration=this.ammo===0?this.rules.emptyReloadTime:this.rules.reloadTime;
  this.reloadStartedAt=this.time;this.reloadAt=this.time+this.reloadDuration;return true;
 }
 fire({origin,direction}={}){
  if(this.state!=='running'||this.reloading||this.ammo<=0||this.time+EPS<this.nextFire||!finiteVector(origin)||!finiteVector(direction))return null;
  const size=length(direction);if(size<EPS)return null;
  const dir=direction.map(v=>v/size),speed=this.rules.projectileSpeed;
  const shot={id:++this._shotSequence,position:origin.slice(),previous:origin.slice(),origin:origin.slice(),direction:dir,velocity:dir.map(v=>v*speed),age:0,life:this.rules.projectileRange/speed,start:this.time,distance:0};
  this.ammo--;this.shots++;this.nextFire=this.time+this.rules.fireInterval;this.projectiles.push(shot);return shot;
 }
 _spawn(spec,events){
  const id=++this._enemySequence,lane=((spec.lane??(id-1)%4)%4+4)%4;
  let path=spec.path;
  if(!path&&spec.position){
   const [x,,z]=spec.position,r=Math.hypot(x,z)||1,end=[x/r*this.rules.attackRadius,z/r*this.rules.attackRadius];path=[[x,z],[(x+end[0])/2,(z+end[1])/2],end];
  }
  path=(path||defaultPath(lane,id)).map(p=>p.slice());if(![2,3].includes(path.length)||path.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))throw Error('Enemy path must contain two or three XZ points');
  const [x,z]=pointOnPath(path,0),hp=spec.hp??this.rules.enemyHP,y=spec.position?.[1]??this.rules.enemyCenterY;
  const e={id,x,y,z,hp,maxHP:hp,lane,wave:spec.wave??1,state:'spawning',attackProgress:0,spawnedAt:this.time,hitAt:-999,lastAttackAt:-999,
   path,pathLength:pathLength(path),distance:0,speed:spec.speed??this.rules.enemySpeed,spawnDuration:spec.spawnDuration??this.rules.spawnDuration,atGoal:false,nextAttackAt:null,cycleLength:this.rules.attackWindup,stunUntil:0,previous:[x,y,z]};
  this.enemies.push(e);this.wave=Math.max(this.wave,e.wave);
  if(e.wave>this._announcedWave){this._announcedWave=e.wave;events.push({type:'wave',wave:e.wave,time:this.time});}
  events.push({type:'spawn',enemyId:id,lane,position:[e.x,e.y,e.z],time:this.time});
 }
 _moveEnemy(e,dt){
  e.previous=[e.x,e.y,e.z];
  if(this.time+EPS<e.spawnedAt+e.spawnDuration){e.state='spawning';return;}
  if(this.time+EPS<e.stunUntil){e.state='stunned';e.attackProgress=0;return;}
  if(!e.atGoal){
   e.distance=Math.min(e.pathLength,e.distance+e.speed*dt);
   const [x,z]=pointOnPath(e.path,e.pathLength>EPS?e.distance/e.pathLength:1);e.x=x;e.z=z;e.state='moving';
   if(e.distance+EPS>=e.pathLength){e.atGoal=true;e.nextAttackAt=this.time+this.rules.attackWindup;e.cycleLength=this.rules.attackWindup;}
  }
  if(e.atGoal){e.state=this.time-e.lastAttackAt<.18?'attacking':'windup';e.attackProgress=clamp(1-(e.nextAttackAt-this.time)/e.cycleLength);}
 }
 _trace(p,end){
  let best=null;const consider=(type,t,extra={})=>{if(t!==null&&(!best||t<best.t-EPS))best={type,t,...extra};};
  // Protector wins exact ties: a shot cannot pass through its non-damageable body.
  consider('blocked',traceProtector(p.position,end,this.rules,this.rules.projectileRadius)?.t??null);
  for(const box of this.sceneryBoxes){const hit=sweepBox(p.position,end,box,this.rules.projectileRadius);if(hit)consider('scenery',hit.t,{normal:hit.normal,colliderId:box.id});}
  for(const e of this.enemies)if(e.hp>0)consider('enemy',traceEnemy(p.position,end,e,this.rules,this.rules.projectileRadius,e.previous)?.t??null,{enemy:e});
  if(this.rules.groundEnabled){
   const floor=this.rules.projectileRadius;
   if(p.position[1]<=floor)consider('ground',0);else if(end[1]<=floor)consider('ground',(p.position[1]-floor)/(p.position[1]-end[1]));
  }
  return best;
 }
 _damage(e,p,point,events){
  e.hp=Math.max(0,e.hp-1);e.hitAt=this.time;this.hits++;this.score+=20;
  const enemyPosition=[e.x,e.y,e.z],outward=sub(point,enemyPosition),n=length(outward);
  const base={enemyId:e.id,projectileId:p.id,position:point.slice(),enemyPosition,
   direction:p.direction.slice(),normal:n>EPS?outward.map(v=>v/n):p.direction.map(v=>-v),
   hp:e.hp,maxHP:e.maxHP,time:this.time,lane:e.lane};
  events.push({type:'hit',hp:e.hp,...base});
  if(e.hp===0){this.kills++;this.score+=80;events.push({type:'kill',...base});return;}
  e.stunUntil=this.time+this.rules.hitStun;e.state='stunned';e.attackProgress=0;e.atGoal=false;e.nextAttackAt=null;
  e.distance=Math.max(0,e.distance-this.rules.knockback);const q=pointOnPath(e.path,e.pathLength>EPS?e.distance/e.pathLength:1);e.x=q[0];e.z=q[1];
 }
 _stepProjectiles(dt,events){
  const traces=this.projectiles.map(p=>{
   p.previous=p.position.slice();const duration=Math.max(0,Math.min(dt,p.life-p.age)),end=addScaled(p.position,p.velocity,duration);
   return {p,end,duration,hit:this._trace(p,end),finished:false};
  });
  // Resolve impacts in within-step time order, not firing/insertion order. If
  // another bullet killed an occluder first, retrace the remaining segment.
  while(true){
   const candidates=traces.filter(t=>!t.finished&&t.hit).sort((a,b)=>a.hit.t*a.duration-b.hit.t*b.duration||a.p.id-b.p.id);
   if(!candidates.length)break;const trace=candidates[0],{p,end}=trace;
   if(trace.hit.enemy?.hp===0){trace.hit=this._trace(p,end);continue;}
   const hit=trace.hit,point=p.position.map((v,i)=>v+(end[i]-v)*hit.t);p.position=point;p.age+=trace.duration*hit.t;trace.finished=true;
   if(hit.type==='enemy')this._damage(hit.enemy,p,point,events);
   else if(hit.type==='scenery')events.push({type:'scenery',projectileId:p.id,position:point.map((v,i)=>v-hit.normal[i]*this.rules.projectileRadius),normal:hit.normal.slice(),colliderId:hit.colliderId,time:this.time});
   else events.push({type:hit.type,projectileId:p.id,position:point,time:this.time});
  }
  for(const t of traces)if(!t.finished){
   t.p.position=t.end;t.p.age+=t.duration;t.p.distance=this.rules.projectileSpeed*t.p.age;
   if(t.p.age+EPS>=t.p.life){t.finished=true;events.push({type:'miss',projectileId:t.p.id,position:t.end.slice(),time:this.time});}
  }
  this.projectiles=traces.filter(t=>!t.finished).map(t=>t.p);
 }
 _finish(state,events){
  this.state=state;this.reloadAt=null;this.projectiles=[];
  events.push({type:state==='won'?'win':'lose',position:this.rules.protectorCenter.slice(),time:this.time,protectedHP:this.protectedHP});
 }
 _step(events){
  const dt=this.rules.step;this._tick++;this.time=this._tick*dt;
  while(this._spawnIndex<this.schedule.length&&this.schedule[this._spawnIndex].at<=this.time+EPS)this._spawn(this.schedule[this._spawnIndex++],events);
  if(this.reloading&&this.time+EPS>=this.reloadAt){this.ammo=this.magSize;this.reloadAt=null;events.push({type:'reload',time:this.time});}
  for(const e of this.enemies)this._moveEnemy(e,dt);
  this._stepProjectiles(dt,events);
  for(const e of this.enemies)if(e.hp>0&&e.atGoal&&this.time+EPS>=e.stunUntil&&this.time+EPS>=e.nextAttackAt){
   this.protectedHP=Math.max(0,this.protectedHP-this.rules.enemyDamage);e.lastAttackAt=this.time;e.nextAttackAt=this.time+this.rules.attackCooldown;e.cycleLength=this.rules.attackCooldown;e.attackProgress=0;e.state='attacking';
   events.push({type:'protectorHit',enemyId:e.id,lane:e.lane,damage:this.rules.enemyDamage,protectedHP:this.protectedHP,position:this.rules.protectorCenter.slice(),time:this.time});
   if(this.protectedHP===0){this._finish('lost',events);break;}
  }
  this.enemies=this.enemies.filter(e=>e.hp>0);
  if(this.state==='running'&&this._spawnIndex===this.schedule.length&&this.enemies.length===0)this._finish('won',events);
 }
 advance(dt){
  if(this.state!=='running'||!Number.isFinite(dt)||dt<=0)return [];
  this._accumulator+=dt;const events=[];
  while(this._accumulator+EPS>=this.rules.step&&this.state==='running'){
   this._accumulator=Math.max(0,this._accumulator-this.rules.step);this._step(events);
  }
  if(this.state!=='running')this._accumulator=0;return events;
 }
 snapshot(){
  const charge=this.state==='won'?100:Math.min(99,100*this.time/this.rules.missionDuration);
  return {state:this.state,time:this.time,protectedHP:this.protectedHP,maxProtectedHP:this.rules.protectedHP,ammo:this.ammo,magSize:this.magSize,reloading:this.reloading,reloadDuration:this.reloadDuration,
   reloadProgress:this.reloading?clamp((this.time-this.reloadStartedAt)/this.reloadDuration):0,wave:this.wave,waveCount:Math.max(1,...this.schedule.map(s=>s.wave??1)),score:this.score,kills:this.kills,shots:this.shots,hits:this.hits,accuracy:this.shots?this.hits/this.shots:0,
   totalEnemies:this.schedule.length,remaining:this.schedule.length-this.kills,remainingSpawns:this.schedule.length-this._spawnIndex,alive:this.enemies.length,inFlight:this.projectiles.length,charge,progress:charge/100,nextSpawnIn:this._spawnIndex<this.schedule.length?Math.max(0,this.schedule[this._spawnIndex].at-this.time):null};
 }
}
