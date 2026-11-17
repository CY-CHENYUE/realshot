import * as T from 'three';

// Colour lives on the actual authored surfaces. The source albedo is a
// neutral finish atlas, so these ratios retain its variation and all UVs,
// roughness, normal detail, marking meshes and optical reflections.
const SOURCE={
 Industrial_Graphite:[.027,.036,.041],
 Industrial_SlateCoat:[.15,.205,.215],
 Industrial_BoneCoat:[.63,.65,.60],
 Industrial_SafetyOrange:[.77,.24,.035],
 Industrial_Seal:[.012,.017,.018],
 Industrial_BareSteel:[.23,.27,.28]
};
const FINISH={
 enemy:{
  Industrial_Graphite:['#69777f',.25],
  Industrial_SlateCoat:['#ba5437',.25],
  Industrial_BoneCoat:['#e48b48',.40],
  Industrial_SafetyOrange:['#f5c36d',.45],
  Industrial_Seal:['#4c5558',1],
  Industrial_BareSteel:['#99a6a9',1]
 },
 protector:{
  Industrial_Graphite:['#527d84',.30],
  Industrial_SlateCoat:['#7c9fa9',.38],
  Industrial_BoneCoat:['#d3dbd4',.55]
 }
};
export function applyCombatAppearance(model,role){
 if(!FINISH[role])throw new RangeError('Unknown combat visual role: '+role);
 const seen=new Set(),changes=[];
 model.traverse(o=>{
  if(!o.isMesh)return;
  for(const m of Array.isArray(o.material)?o.material:[o.material]){
   if(seen.has(m))continue;seen.add(m);
   const finish=FINISH[role][m.name];
   if(finish){
    const target=new T.Color(finish[0]),source=new T.Color().setRGB(...SOURCE[m.name],T.SRGBColorSpace);
    // PNG albedo samples are sRGB; the shader samples them in working-linear.
    // Both operands of the ratio must use that same space.
    m.color.setRGB(target.r/source.r,target.g/source.g,target.b/source.b);
    // Metallic texture remains; the multiplier makes the painted cover a
    // dielectric coating, distinct from unchanged exposed steel and rubber.
    m.metalness*=finish[1];
    m.userData.combatRole=role;changes.push({material:m.name,finish:finish[0]});
   }
   if(role==='enemy'&&m.name==='Industrial_DeepOpticalCoating'){
    m.emissive.set('#e44827');m.emissiveIntensity=.22;
   }
   if(role==='enemy'&&m.isMeshStandardMaterial&&!/Optical|Emitter|Marking/.test(m.name)){
    const previous=m.onBeforeCompile;
    m.onBeforeCompile=(shader,renderer)=>{
     previous.call(m,shader,renderer);
     shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float combatRim=smoothstep(.18,.78,1.-clamp(dot(normalize(normal),normalize(vViewPosition)),0.,1.));
      outgoingLight+=vec3(.075,.022,.008)*combatRim;
      #include <opaque_fragment>`);
    };
    m.customProgramCacheKey=()=> 'combat-enemy-rim-r11-v1';
   }
  }
 });
 return {role,finishChanges:changes,geometryUnchanged:true,physicalMapsPreserved:true};
}

// Short world-space acquisition corners. Unlike a horizontal torus through
// the hull, these have visible height from the actual eye-level camera.
export function createAcquisitionGeometry(){
 const vertices=[];
 const rect=(x,y,w,h)=>{
  const l=x-w/2,r=x+w/2,b=y-h/2,t=y+h/2;
  vertices.push(l,b,0,r,b,0,r,t,0,l,b,0,r,t,0,l,t,0);
 };
 for(const x of [-1,1])for(const y of [-1,1]){
  rect(x*.80,y*.34,.16,.016);rect(x*.872,y*.288,.016,.12);
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
}

// The old tiny-to-full spawn suppressed the silhouette during the discovery
// window. Keep the full body visible; only its local acquisition cue evolves.
export function combatCue(time,spawnedAt,attackProgress=0,dead=false){
 const age=time-spawnedAt,entry=!dead&&age>=0&&age<.8;
 return {
  scale:1,
  entry,
  entryOpacity:entry?.70*Math.pow(1-age/.8,1.4):0,
  entryRadius:entry?1+age*.18:1,
  attack:!dead&&attackProgress>.12,
  attackIntensity:dead?0:T.MathUtils.clamp(attackProgress,0,1)
 };
}
