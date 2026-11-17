import * as T from 'three';

// Weld only spatially identical vertices so UV/normal seams do not split a
// real manufactured panel. Triangles and every original attribute survive.
export function geometryIslands(geometry,{weldTolerance=1e-5}={}){
 const p=geometry.attributes.position,index=geometry.index,canonical=new Map(),vertexKeys=new Int32Array(p.count),parent=[];
 function find(a){while(parent[a]!==a){parent[a]=parent[parent[a]];a=parent[a];}return a;}
 const join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
 for(let i=0;i<p.count;i++){
  const key=`${Math.round(p.getX(i)/weldTolerance)},${Math.round(p.getY(i)/weldTolerance)},${Math.round(p.getZ(i)/weldTolerance)}`;
  let id=canonical.get(key);if(id===undefined){id=parent.length;canonical.set(key,id);parent.push(id);}vertexKeys[i]=id;
 }
 const triangles=(index?index.count:p.count)/3,at=i=>index?index.getX(i):i;
 for(let i=0;i<triangles;i++){const a=vertexKeys[at(i*3)],b=vertexKeys[at(i*3+1)],c=vertexKeys[at(i*3+2)];join(a,b);join(a,c);}
 const groups=new Map();
 for(let i=0;i<triangles;i++){const key=find(vertexKeys[at(i*3)]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
 return [...groups.values()].map((faces,id)=>{const bounds=new T.Box3();for(const f of faces)for(let j=0;j<3;j++)bounds.expandByPoint(new T.Vector3().fromBufferAttribute(p,at(f*3+j)));return {id,faces,triangles:faces.length,bounds,center:bounds.getCenter(new T.Vector3()),size:bounds.getSize(new T.Vector3())};}).sort((a,b)=>b.triangles-a.triangles);
}

export function extractFaces(geometry,faces){
 const out=new T.BufferGeometry(),index=geometry.index,at=i=>index?index.getX(i):i;
 for(const [name,attribute]of Object.entries(geometry.attributes)){
  const values=new attribute.array.constructor(faces.length*3*attribute.itemSize);let k=0;
  for(const face of faces)for(let j=0;j<3;j++){const vertex=at(face*3+j);for(let c=0;c<attribute.itemSize;c++)values[k++]=attribute.getComponent(vertex,c);}
  out.setAttribute(name,new T.BufferAttribute(values,attribute.itemSize,attribute.normalized));
 }
 out.computeBoundingBox();out.computeBoundingSphere();return out;
}

export function prepareEnemyDamageParts(model){
 // New authored assets retain their real armour objects and pivots. The
 // legacy island splitter remains only for the older material-batched model.
 const authored=[];model.traverse(o=>{if(o.isMesh&&/^DamageArmour_/i.test(o.name))authored.push(o);});
 if(authored.length){
  const parts=authored.map(mesh=>{
   mesh.geometry.computeBoundingBox();const role=mesh.name.replace(/^DamageArmour_/i,'').toLowerCase(),triangles=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
   mesh.userData.damageArmour={id:role,role,triangles,preDeath:/fore|aft|dorsal|upper/i.test(role),authoredMesh:mesh.name,localCenter:mesh.geometry.boundingBox.getCenter(new T.Vector3()).toArray()};
   return {...mesh.userData.damageArmour};
  });
  return {authored:true,audit:[],parts,triangleConservation:true,replacementGeometryCount:0};
 }
 const audit=[],removedGeometry=new Set(),pieces=[];model.updateMatrixWorld(true);const sources=[];model.traverse(o=>{if(o.isMesh&&['Orbital_Ceramic','Orbital_CoolCeramic'].includes(o.material?.name))sources.push(o);});
 for(const mesh of sources){
  const original=mesh.geometry,islands=geometryIslands(original),selected=islands.filter(island=>mesh.material.name==='Orbital_Ceramic'?Math.abs(island.center.x)<.04&&island.size.x>.20&&island.size.z>.18:Math.abs(island.center.x)>.40&&island.size.x<.15&&island.size.y<.05);
  if(!selected.length)continue;
  const movedFaces=new Set(selected.flatMap(island=>island.faces)),total=(original.index?.count??original.attributes.position.count)/3,remaining=[];
  for(let i=0;i<total;i++)if(!movedFaces.has(i))remaining.push(i);
  mesh.geometry=extractFaces(original,remaining);removedGeometry.add(original);mesh.updateMatrix();
  for(const island of selected){
   const role=mesh.material.name==='Orbital_Ceramic'?(island.center.z>0?'fore upper armour':'aft upper armour'):(island.center.x<0?'port guard':'starboard guard');
   const geometry=extractFaces(original,island.faces);
   const part=new T.Mesh(geometry,mesh.material);part.name=`damage armour / ${role}`;part.position.copy(mesh.position);part.quaternion.copy(mesh.quaternion);part.scale.copy(mesh.scale);part.castShadow=mesh.castShadow;part.receiveShadow=mesh.receiveShadow;
   part.userData.damageArmour={id:role,role,triangles:island.triangles,preDeath:role.includes('upper armour'),authoredMesh:mesh.name,localCenter:island.center.toArray()};mesh.parent.add(part);pieces.push(part);
  }
  audit.push({source:mesh.name,material:mesh.material.name,sourceTriangles:total,retainedTriangles:remaining.length,islands:islands.length,parts:selected.map(x=>({triangles:x.triangles,center:x.center.toArray(),size:x.size.toArray()})),conserved:remaining.length+selected.reduce((sum,x)=>sum+x.triangles,0)===total});
 }
 for(const g of removedGeometry)g.dispose();model.updateMatrixWorld(true);
 return {audit,parts:pieces.map(p=>({...p.userData.damageArmour})),triangleConservation:audit.every(x=>x.conserved),replacementGeometryCount:audit.length+pieces.length};
}
