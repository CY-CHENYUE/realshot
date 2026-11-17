import * as T from 'three';

const MAX_BURSTS=4,MAX_SHARDS=96,MAX_SPARKS=192;
const clamp=T.MathUtils.clamp;
const hash=n=>{const v=Math.sin(n*127.1+41.7)*43758.5453;return v-Math.floor(v);};
export function cloudGeometry(seed){
 const geometry=new T.IcosahedronGeometry(1,3),p=geometry.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),scale=.90+.12*Math.sin(x*5.1+y*3.7+seed)+.09*Math.sin(z*7.3-x*4.1);p.setXYZ(i,x*scale,y*scale,z*scale);}
 // PolyhedronGeometry is unindexed. Recomputing its normals would turn every
 // triangle into a visibly flat face; retain the original smooth radial field.
 return geometry;
}
export function plumeMaterial(seed,kind='fire'){
 return new T.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,uniforms:{phase:{value:0},opacity:{value:1},seed:{value:seed},smoke:{value:kind==='smoke'?1:0}},vertexShader:`
  varying vec3 localPoint; varying vec3 surfaceNormal; varying vec3 viewDirection;
  void main(){localPoint=position;vec4 mv=modelViewMatrix*vec4(position,1.);surfaceNormal=normalMatrix*normal;viewDirection=-mv.xyz;gl_Position=projectionMatrix*mv;}
 `,fragmentShader:`
  uniform float phase;uniform float opacity;uniform float seed;uniform float smoke;
  varying vec3 localPoint;varying vec3 surfaceNormal;varying vec3 viewDirection;
  float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
  float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
  void main(){
   vec3 p=localPoint*3.8+vec3(seed*.17,-phase*mix(6.,1.4,smoke),phase*2.);
   float turbulence=.65*noise(p)+.25*noise(p*2.1)+.1*noise(p*4.3);
   float facing=abs(dot(normalize(surfaceNormal),normalize(viewDirection)));
   float alpha=opacity*smoothstep(.03,.40,facing)*smoothstep(mix(.20,.13,smoke),mix(.48,.47,smoke),turbulence);
   if(alpha<.012)discard;
   vec3 ember=vec3(.58,.12,.018),orange=vec3(1.,.35,.035),hot=vec3(1.,.84,.40);
   vec3 color=mix(ember,orange,smoothstep(.18,.47,turbulence));
   color=mix(color,hot,smoothstep(.43,.76,turbulence)*(.38+.62*facing));
   float shade=.65+.35*max(0.,dot(normalize(surfaceNormal),normalize(vec3(-.3,.8,.5))));
   vec3 smokeColor=mix(vec3(.17,.20,.22),vec3(.39,.42,.42),turbulence)*shade;
   color=mix(color,smokeColor,smoke);
   gl_FragColor=vec4(color,alpha);
  }
 `});
}

// Short, bounded world-space destruction. Closed, shaped meshes are used
// instead of large smoke billboards: depth/occlusion and the optical opening
// mask can then agree on the same actual volume. No floor or screen overlay.
export class CombatBursts{
 constructor(scene){
  this.scene=scene;this.active=[];this.shards=[];this.sparks=[];this.sequence=0;this.disposed=false;
  this.geometries=[cloudGeometry(.3),cloudGeometry(2.8),new T.TorusGeometry(1,.015,5,48),new T.TetrahedronGeometry(1,0),new T.CylinderGeometry(.16,.05,1,5)];
  this.shardMaterial=new T.MeshStandardMaterial({color:'#596a6b',roughness:.48,metalness:.67});
  this.sparkMaterial=new T.MeshBasicMaterial({color:'#e57922',toneMapped:false});
  this.shardPool=new T.InstancedMesh(this.geometries[3],this.shardMaterial,MAX_SHARDS);this.sparkPool=new T.InstancedMesh(this.geometries[4],this.sparkMaterial,MAX_SPARKS);
  for(const pool of [this.shardPool,this.sparkPool]){pool.frustumCulled=false;pool.instanceMatrix.setUsage(T.DynamicDrawUsage);pool.count=0;pool.castShadow=false;pool.receiveShadow=false;scene.add(pool);}
  this.transform=new T.Object3D();this.color=new T.Color();this.up=new T.Vector3(0,1,0);
  this.lights=Array.from({length:MAX_BURSTS},()=>{const light=new T.PointLight('#ff9c40',0,4,2);light.castShadow=false;scene.add(light);return light;});
  // compileAsync traverses hidden meshes, whereas rendering/depth masks do not.
  // Keep one program reference alive after short-lived burst materials dispose.
  this.shaderAnchor=new T.Mesh(this.geometries[0],plumeMaterial(0));this.shaderAnchor.name='persistent FX shader cache';this.shaderAnchor.visible=false;scene.add(this.shaderAnchor);
 }
 trigger(event){
  if(this.disposed||!event.position||event.type!=='kill')return false;
  while(this.active.length>=MAX_BURSTS)this.remove(this.active.shift());
  const seed=(event.enemyId??this.sequence)+17*this.sequence++,origin=new T.Vector3(...(event.enemyPosition??event.position)),impact=new T.Vector3(...event.position),group=new T.Group();group.name=`enemy rupture / ${event.enemyId??seed}`;group.position.copy(origin);this.scene.add(group);
  const direction=new T.Vector3(...(event.direction??[0,0,-1])).normalize(),normal=new T.Vector3(...(event.normal??direction.clone().negate().toArray())).normalize();
  if(direction.lengthSq()<.5)direction.set(0,0,-1);if(normal.lengthSq()<.5)normal.copy(direction).negate();
  const axis=direction.clone().reflect(normal).addScaledVector(normal,.65).normalize();
  const offset=impact.clone().sub(origin);if(offset.length()>.5)impact.copy(origin).add(offset.setLength(.5));
  const materials=[],fire=[],smoke=[];
  const mesh=(geometry,color,parent=group,material=null)=>{material??=new T.MeshBasicMaterial({color,transparent:true,opacity:1,depthWrite:false,toneMapped:false});materials.push(material);const object=new T.Mesh(geometry,material);object.castShadow=false;object.receiveShadow=false;object.visible=false;parent.add(object);return object;};
  for(let i=0;i<3;i++){const o=mesh(this.geometries[i%2],null,group,plumeMaterial(seed+i*7));o.rotation.set(hash(seed+i)*2,hash(seed+i+8)*3,hash(seed+i+32)*2);fire.push(o);}
  for(let i=0;i<5;i++){const o=mesh(this.geometries[i%2],null,group,plumeMaterial(seed+i*6,'smoke'));o.rotation.set(hash(seed+i+56)*2,hash(seed+i+18)*3,hash(seed+i+2)*2);smoke.push(o);}
  const ring=mesh(this.geometries[2],'#c46622');ring.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);ring.rotateZ(hash(seed)*Math.PI);ring.material.side=T.DoubleSide;
  const light=this.lights.find(light=>!this.active.some(b=>b.light===light));light.position.copy(origin);light.intensity=0;
  this.active.push({group,materials,fire,smoke,ring,light,origin,impact,direction,normal,axis,age:0,life:1.22,seed});
  for(let i=0;i<7;i++){
   const y=hash(seed+i*3)*1.6-.6,theta=i*2.399+seed,rad=Math.sqrt(Math.max(.05,1-y*y));
   const velocity=new T.Vector3(Math.cos(theta)*rad,y+.25,Math.sin(theta)*rad).multiplyScalar(.75+hash(seed+i*7)*1.1).addScaledVector(direction,.85);
   this.shards.push({origin:origin.clone(),position:origin.clone(),velocity,age:0,life:.40+hash(seed+i*11)*.35,size:.016+hash(seed+i*13)*.025,seed:seed+i});
  }
  for(let i=0;i<26;i++){
   const y=hash(seed+i*3+78)*1.8-.7,theta=i*2.399+seed+1.3,rad=Math.sqrt(Math.max(.05,1-y*y));
   const ray=new T.Vector3(Math.cos(theta)*rad,y+.2,Math.sin(theta)*rad).multiplyScalar(.65).addScaledVector(axis,1.15).normalize();
   this.sparks.push({origin:impact.clone(),position:impact.clone(),velocity:ray.multiplyScalar(2.2+hash(seed+i*17)*3.2),age:0,life:.18+hash(seed+i*29)*.30,size:.015+hash(seed+i*19)*.015,seed:seed+i});
  }
  this.shards=this.shards.slice(-MAX_SHARDS);this.sparks=this.sparks.slice(-MAX_SPARKS);this.update(0);return true;
 }
 remove(burst){this.scene.remove(burst.group);burst.light.intensity=0;for(const m of burst.materials)m.dispose();burst.group.clear();}
 update(dt){
  if(this.disposed)return;dt=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  for(const b of this.active){
   b.age+=dt;const t=b.age;
   b.fire.forEach((o,i)=>{
    const delay=i*.025,age=t-delay,life=.18+i*.055,progress=clamp(age/life,0,1);o.visible=age>=0&&age<life;
    const radius=(.08+Math.sin(progress*Math.PI*.72)*(.30+i*.06))*(1-i*.08);
    o.scale.set(radius*(1+i*.11),radius*(1.18-i*.08),radius*.85);o.position.copy(b.axis).multiplyScalar(i*.06+age*.18);o.position.y+=age*.18;
    o.material.uniforms.opacity.value=(1-progress)**.65*(i===2?.64:.98);o.material.uniforms.phase.value=age;o.rotation.z+=dt*(i%2?-1.5:1.5);
   });
   b.smoke.forEach((o,i)=>{
    const delay=.13+i*.037,age=t-delay,life=b.life-delay,progress=clamp(age/life,0,1);o.visible=age>=0&&age<life;
    const spread=.14+progress*.27,a=i*2.399+b.seed;const radius=(.12+Math.sin(Math.min(1,progress*1.35)*Math.PI*.5)*.24)*(1-i*.045);
    o.scale.set(radius,radius*(1.18+i*.03),radius*.88);o.position.set(Math.cos(a)*spread,age*.39+(i%3)*.08,Math.sin(a)*spread*.7);
    o.position.addScaledVector(b.direction,progress*.18);const fadeIn=Math.min(1,Math.max(0,age/.09));o.material.uniforms.opacity.value=fadeIn*(1-progress)**1.45*(i%2?.23:.29);o.material.uniforms.phase.value=age;o.rotation.z+=dt*(i%2?.12:-.1);
   });
   const ringAge=t-.035,ringProgress=clamp(ringAge/.26,0,1);b.ring.visible=ringAge>=0&&ringAge<.26;b.ring.scale.setScalar(.10+ringProgress*.45);b.ring.material.opacity=(1-ringProgress)**1.4*.38;
   b.light.intensity=t<.15?5.2*(1-t/.15)**2:0;
  }
  for(const b of this.active.filter(b=>b.age>=b.life))this.remove(b);this.active=this.active.filter(b=>b.age<b.life);
  const renderParticles=(particles,pool,spark)=>{
   let n=0;for(const p of particles){p.age+=dt;if(p.age>=p.life)continue;const fade=1-p.age/p.life;p.position.copy(p.origin).addScaledVector(p.velocity,p.age);p.position.y-=(spark?.7:1.6)*p.age*p.age;
    this.transform.position.copy(p.position);
    if(spark){this.transform.quaternion.setFromUnitVectors(this.up,p.velocity.clone().normalize());this.transform.scale.set(p.size,p.size*(2.0+fade*5),p.size);}
    else{this.transform.rotation.set(p.age*(7+p.seed%3),p.age*9+p.seed,p.age*5);this.transform.scale.set(p.size*fade,p.size*.6*fade,p.size*1.6*fade);}
    this.transform.updateMatrix();pool.setMatrixAt(n,this.transform.matrix);pool.setColorAt(n,this.color.set(spark?(fade>.55?'#f3a543':'#a9521c'):p.seed%3?'#677c80':'#bac8c8'));n++;
   }
   pool.count=n;pool.instanceMatrix.needsUpdate=true;if(pool.instanceColor)pool.instanceColor.needsUpdate=true;return particles.filter(p=>p.age<p.life);
  };
  this.shards=renderParticles(this.shards,this.shardPool,false);this.sparks=renderParticles(this.sparks,this.sparkPool,true);
 }
 reset(){for(const b of this.active)this.remove(b);this.active=[];this.shards=[];this.sparks=[];this.shardPool.count=0;this.sparkPool.count=0;}
 inspection(){return {bursts:this.active.map(b=>({age:b.age,life:b.life,position:b.origin.toArray(),impact:b.impact.toArray(),direction:b.direction.toArray(),normal:b.normal.toArray(),sprayAxis:b.axis.toArray(),flashVisible:b.fire.some(o=>o.visible),smokeVisible:b.smoke.some(o=>o.visible),lightIntensity:b.light.intensity})),shards:this.shards.length,sparks:this.sparks.length,budget:{bursts:MAX_BURSTS,shards:MAX_SHARDS,sparks:MAX_SPARKS},worldSpace:true,floorReceiver:false};}
 dispose(){if(this.disposed)return;this.reset();this.disposed=true;this.scene.remove(this.shardPool,this.sparkPool,this.shaderAnchor,...this.lights);this.shaderAnchor.material.dispose();for(const light of this.lights)light.dispose();for(const g of this.geometries)g.dispose();this.shardMaterial.dispose();this.sparkMaterial.dispose();}
}
