import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Original continuous, daylight maintenance architecture. The central bay,
// observation window, service openings and roof are EMPTY space, not white
// surfaces. Shadow receivers are the visible load-bearing deck and hull only.
const Y=new T.Vector3(0,1,0),V=new T.Vector3(),N=new T.Vector3();
const rounded=(w,h,d,r=.025)=>new RoundedBoxGeometry(w,h,d,2,Math.min(r,w*.2,h*.2,d*.2));
const shape=points=>{const s=new T.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;};

export function createHangarScene({materials={}}={}){
 const root=new T.Group();root.name='HELION / daylight maintenance hangar 07';
 const hull=new T.Group(),deck=new T.Group(),roof=new T.Group(),back=new T.Group(),detail=new T.Group();
 hull.name='continuous port and starboard hull';deck.name='U service deck and inspection bridge';roof.name='load-bearing gantry and open roof';back.name='observation bulkhead and access doors';detail.name='attached mechanical fittings';root.add(hull,deck,roof,back,detail);
 const collisionBoxes=[],receivers=[],landmarks=[],ownedMaterials=new Set(),ownedTextures=new Set(),geometries=new Set(),batches=new Map(),moving=[],finishVariants=[];
 let disposed=false,mode='transparent';
 const own=m=>{ownedMaterials.add(m);return m;},fallback=(key,color,metalness,roughness)=>materials[key]||own(new T.MeshPhysicalMaterial({color,metalness,roughness}));
 const mat={shell:fallback('shell','#dfe4df',.04,.5),alloy:fallback('alloy','#74848a',.88,.34),graphite:fallback('graphite','#27353a',.12,.76),copper:fallback('copper','#ad895b',.78,.38),signal:materials.signal||own(new T.MeshStandardMaterial({color:'#abd6ce',roughness:.36,metalness:.12,emissive:'#63b9ad',emissiveIntensity:.32})),rubber:fallback('rubber','#28353a',0,.9)};
 mat.deck=materials.deck||own(mat.shell.clone());if(!materials.deck){mat.deck.name='Hangar / worn service deck';mat.deck.color.set('#71807e');mat.deck.metalness=.24;mat.deck.roughness=.66;}
 mat.caution=own(new T.MeshStandardMaterial({color:'#c29652',metalness:.1,roughness:.63}));
 mat.letter=own(new T.MeshStandardMaterial({color:'#c8cec6',metalness:0,roughness:.72}));
 const scratch=new T.Object3D();
 function metersUV(g,matrix){const p=g.attributes.position,n=g.attributes.normal;if(!p||!n)return;const uv=new Float32Array(p.count*2),nm=new T.Matrix3().getNormalMatrix(matrix);for(let i=0;i<p.count;i++){V.fromBufferAttribute(p,i).applyMatrix4(matrix);N.fromBufferAttribute(n,i).applyNormalMatrix(nm);const a=[Math.abs(N.x),Math.abs(N.y),Math.abs(N.z)];if(a[1]>=a[0]&&a[1]>=a[2]){uv[i*2]=V.x;uv[i*2+1]=V.z;}else if(a[0]>=a[2]){uv[i*2]=V.z;uv[i*2+1]=V.y;}else{uv[i*2]=V.x;uv[i*2+1]=V.y;}}g.setAttribute('uv',new T.BufferAttribute(uv,2));}
 function add(name,g,m,p=[0,0,0],r=[0,0,0],parent=hull,{collision=false,receiver=true,uv=true}={}){const o=new T.Mesh(g,m);o.name=name;o.position.set(...p);o.rotation.set(...r);o.castShadow=true;o.receiveShadow=receiver;parent.add(o);o.updateWorldMatrix(true,false);if(uv)metersUV(g,o.matrixWorld);geometries.add(g);if(receiver)receivers.push({name,uuid:o.uuid,reason:parent===deck?'visible bounded service deck':'visible hull or attached functional equipment'});if(collision){const b=new T.Box3().setFromObject(o);collisionBoxes.push({id:name,name,min:b.min.toArray(),max:b.max.toArray(),objectName:name});}return o;}
 function box(name,s,p,m=mat.shell,{r=[0,0,0],parent=hull,collision=true,bevel=.025,receiver=true}={}){return add(name,rounded(...s,bevel),m,p,r,parent,{collision,receiver});}
 function minor(g,m,p=[0,0,0],r=[0,0,0]){scratch.position.set(...p);scratch.rotation.set(...r);scratch.scale.set(1,1,1);scratch.updateMatrix();g.applyMatrix4(scratch.matrix);metersUV(g,new T.Matrix4());if(g.index){const old=g;g=g.toNonIndexed();old.dispose();}if(!batches.has(m))batches.set(m,[]);batches.get(m).push(g);}
 function strip(s,p,m=mat.alloy,r=[0,0,0]){minor(rounded(...s,Math.min(.012,...s.map(x=>x*.15))),m,p,r);}
 function bolt(p,r=[Math.PI/2,0,0],radius=.025){minor(new T.CylinderGeometry(radius,radius,.015,6),mat.alloy,p,r);minor(new T.CylinderGeometry(radius*.36,radius*.36,.016,6),mat.graphite,p,r);}
 function rod(name,a,b,radius,m=mat.alloy,{parent=hull,collision=true}={}){const v=new T.Vector3(...b).sub(new T.Vector3(...a)),g=new T.CylinderGeometry(radius,radius,v.length(),16);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(Y,v.clone().normalize()));g.translate(...new T.Vector3(...a).add(new T.Vector3(...b)).multiplyScalar(.5).toArray());return add(name,g,m,[0,0,0],[0,0,0],parent,{collision});}
 function pipe(name,points,radius,m=mat.alloy,{parent=hull,collision=true}={}){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),o=add(name,new T.TubeGeometry(curve,Math.max(12,points.length*6),radius,10,false),m,[0,0,0],[0,0,0],parent);if(collision){for(let i=0;i<points.length-1;i++){const a=new T.Vector3(...points[i]),b=new T.Vector3(...points[i+1]);const bb=new T.Box3().setFromPoints([a,b]).expandByScalar(radius);collisionBoxes.push({id:`${name}/run-${i}`,name:`${name}/run-${i}`,objectName:name,min:bb.min.toArray(),max:bb.max.toArray()});}}return o;}
 function plate(name,points,depth,p,m=mat.shell,{parent=hull,collision=false,bevel=.025,r=[0,0,0]}={}){const g=new T.ExtrudeGeometry(shape(points),{depth,steps:1,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel*.6,bevelSegments:2});g.translate(0,0,-depth/2);return add(name,g,m,p,r,parent,{collision});}
 function proxy(name,min,max,objectName){collisionBoxes.push({id:name,name,objectName,min,max});}
 function label(text,p,size,{r=[0,0,0],color='#344449',parent=detail,rotate=0,prominent=false}={}){if(typeof document==='undefined')return;const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle=color;ctx.textBaseline='middle';ctx.font=prominent?'900 162px Arial, sans-serif':'700 114px Arial, sans-serif';ctx.fillText(text,16,132,994);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;ownedTextures.add(t);const m=own(new T.MeshStandardMaterial({map:t,transparent:true,depthWrite:false,roughness:.8,metalness:0,polygonOffset:true,polygonOffsetFactor:-2}));const o=add(`surface stencil / ${text}`,new T.PlaneGeometry(...size),m,p,r,parent,{receiver:false,uv:false});o.rotation.z+=rotate;o.castShadow=false;return o;}
 function servicePort(id,p,parent=hull){const shell=box(id,[.31,.36,.09],p,mat.alloy,{parent,bevel:.022});box(`${id} recessed connector`,[.22,.25,.032],[p[0],p[1],p[2]+.058],mat.graphite,{parent,collision:false,bevel:.012});box(`${id} ceramic tongue`,[.10,.19,.022],[p[0]-.045,p[1]+.012,p[2]+.083],mat.shell,{parent,collision:false,bevel:.01});strip([.09,.027,.027],[p[0]+.054,p[1]-.068,p[2]+.086],mat.copper);for(const dx of [-.118,.118])for(const dy of [-.14,.14])bolt([p[0]+dx,p[1]+dy,p[2]+.055],[Math.PI/2,0,0],.012);landmarks.push({id,position:p.slice(),size:[.31,.36,.09],rotation:[0,0,0],meshUUID:shell.uuid});}

 // THE PRIMARY SILHOUETTE: crop the thick, chamfered entrance in the foreground.
 // These are structural jambs attached to the side deck, not a floating frame.
 for(const side of [-1,1]){
  const sideName=side<0?'PORT':'STARBOARD';
  const outline=[[-6.8,-.45],[-3.03,-.45],[-2.76,.03],[-2.76,.42],[-3.21,.72],[-3.46,2.85],[-2.86,3.43],[-2.86,4.75],[-6.8,4.75]].map(([x,y])=>[side<0?x:-x,y]);if(side>0)outline.reverse();
  plate(`${sideName} / entrance load-bearing cutaway`,outline,.88,[0,0,4.12],mat.shell,{bevel:.055});
  // Conservative slices stay inside the real sloping profile. An enclosing
  // doorway box would turn the actual entrance into an invisible wall.
  const profile=[[-.45,3.03],[.03,2.76],[.42,2.76],[.72,3.21],[2.85,3.46],[3.43,2.86],[4.75,2.86]];
  let slice=0;
  for(let k=0;k<profile.length-1;k++){
   const [y0,x0]=profile[k],[y1,x1]=profile[k+1],count=Math.max(1,Math.ceil((y1-y0)/.27));
   for(let j=0;j<count;j++){
    const lo=y0+(y1-y0)*j/count,hi=y0+(y1-y0)*(j+1)/count;
    const inner=Math.max(x0+(x1-x0)*j/count,x0+(x1-x0)*(j+1)/count);
    proxy(`${sideName} entrance / slice ${slice++}`,side<0?[-6.8,lo,3.65]:[inner,lo,3.65],side<0?[-inner,hi,4.59]:[6.8,hi,4.59],`${sideName} / entrance load-bearing cutaway`);
   }
  }
  box(`${sideName} / entrance exposed frame`,[.19,2.28,.97],[side*3.39,1.72,4.13],mat.graphite,{r:[0,0,side*.112],collision:false,bevel:.025});
  box(`${sideName} / entrance steel nose`,[.095,2.10,.995],[side*3.31,1.75,4.13],mat.alloy,{r:[0,0,side*.112],collision:false,bevel:.018});
  box(`${sideName} / entrance socket foot`,[1.45,.3,1.32],[side*3.7,-.04,4.14],mat.graphite,{bevel:.055});
  box(`${sideName} / entry hatch inset`,[.62,1.02,.045],[side*4.16,1.82,4.594],mat.graphite,{collision:false,bevel:.025});
  box(`${sideName} / entry hatch cover`,[.55,.92,.026],[side*4.16,1.84,4.627],mat.alloy,{collision:false,bevel:.018});
  strip([.35,.035,.022],[side*4.16,1.48,4.65],mat.copper);label(sideName==='PORT'?'07 / SERVICE':'BAY 07',[side*4.12,2.55,4.65],[.81,.2],{color:'#43575a'});
  for(const dy of [1.48,2.20])for(const dx of [-.23,.23])bolt([side*4.16+dx,dy,4.66],[Math.PI/2,0,0],.023);
 }
 box('entrance / overhead lintel continuous with jambs',[7.55,.54,.92],[0,3.79,4.12],mat.shell,{parent:roof,bevel:.055});
 box('entrance / lintel recessed underside',[5.70,.10,.74],[0,3.475,4.1],mat.graphite,{parent:roof,bevel:.018});
 box('entrance / task light',[3.45,.045,.16],[0,3.41,4.08],mat.signal,{parent:roof,collision:false,bevel:.015});

 // Continuous U-shaped service floor. The large central maintenance bay has
 // no mesh and receives no shadows; its side edges are actual deck thickness.
 for(const side of [-1,1]){
  const sideName=side<0?'port':'starboard';
  for(let i=0;i<7;i++){
   const z=4.02-i*1.93;
   box(`${sideName} / service deck slab ${i+1}`,[2.65,.27,1.90],[side*4.72,-.055,z],mat.deck,{parent:deck,bevel:.035});
   box(`${sideName} / deck edge exposed steel ${i+1}`,[.12,.27,1.90],[side*3.445,-.07,z],mat.alloy,{parent:deck,bevel:.016});
   strip([.09,.012,1.73],[side*3.58,.088,z],mat.caution);
   for(const zz of [-.60,.60])strip([2.13,.012,.014],[side*4.76,.089,z+zz],mat.graphite);
   // Large removable service covers are functional and all have the same scale.
   if(i===1||i===4){box(`${sideName} / deck access lid ${i}`,[1.22,.035,1.24],[side*4.75,.101,z],mat.alloy,{parent:deck,collision:false,bevel:.018});for(const zz of [-.43,.43])strip([.22,.016,.04],[side*4.75,.124,z+zz],mat.graphite);}
  }
  box(`${sideName} / deep longitudinal deck girder`,[.24,.49,14.42],[side*4.7,-.37,-1.82],mat.graphite,{parent:deck,bevel:.035});
  box(`${sideName} / outer deck curb`,[.28,.31,14.44],[side*6.0,.15,-1.83],mat.shell,{parent:deck,bevel:.025});
  // A low maintenance-bay lip leaves the full enemy flight/shot band open.
  box(`${sideName} / safety lip`,[.11,.13,14.36],[side*3.45,.175,-1.83],mat.graphite,{parent:deck,bevel:.018});
  for(const z of [3.9,-.1,-4.1,-8.0]){
   box(`${sideName} / transverse underfloor bracket ${z}`,[2.73,.24,.24],[side*4.73,-.37,z],mat.alloy,{parent:deck,bevel:.025});
   plate(`${sideName} / deck knee ${z}`,[[0,0],[.5,0],[0,-.5]],.18,[side*3.48,-.12,z],mat.alloy,{parent:deck,r:[0,side*Math.PI/2,0],bevel:.018});
  }
  label(side<0?'KEEP CLEAR / 07':'MAINTENANCE',[side*4.70,.111,.12],[1.48,.37],{r:[-Math.PI/2,0,side<0?Math.PI/2:-Math.PI/2],color:'#bec7bd'});
 }
 for(let i=0;i<5;i++)box(`rear inspection bridge / deck panel ${i+1}`,[2.18,.28,2.05],[-4.36+i*2.18,-.055,-9.45],mat.deck,{parent:deck,bevel:.03});
 box('rear bridge / full load-bearing spar',[11.14,.44,.32],[0,-.31,-8.48],mat.graphite,{parent:deck,bevel:.03});
 box('rear bridge / inner safety curb',[11.06,.13,.12],[0,.175,-8.48],mat.alloy,{parent:deck,bevel:.014});
 for(const x of [-5.3,-2.65,0,2.65,5.3]){
  box(`rear bridge / rail post ${x}`,[.07,1.03,.07],[x,.69,-10.32],mat.alloy,{parent:deck,bevel:.012});
  box(`rear bridge / rail foot ${x}`,[.22,.045,.19],[x,.109,-10.32],mat.graphite,{parent:deck,collision:false,bevel:.01});
 }
 box('rear bridge / continuous hand rail',[10.73,.065,.065],[0,1.24,-10.32],mat.alloy,{parent:deck,bevel:.012});
 box('rear bridge / mid rail',[10.73,.042,.042],[0,.73,-10.32],mat.graphite,{parent:deck,bevel:.008});

 // Side hull, columns and upper service canopies share one structural grid.
 // Broad open loading/service ports at y=.7..1.7 admit side incursions.
 for(const side of [-1,1]){
  const s=side<0?'port':'starboard';
  for(let i=0;i<4;i++){
   const z=3.95-i*4.44,pierX=i===1?6.92:6.02;
   box(`${s} / hull primary pier ${i}`,[.54,4.86,.47],[side*pierX,2.22,z],mat.shell,{bevel:.045});
   box(`${s} / pier recessed web ${i}`,[.075,3.18,.27],[side*(pierX-.315),2.11,z],mat.graphite,{collision:false,bevel:.018});
   box(`${s} / structural foot ${i}`,[.86,.32,.84],[side*pierX,.12,z],mat.alloy,{bevel:.035});
   box(`${s} / upper collar ${i}`,[.72,.25,.69],[side*pierX,3.66,z],mat.alloy,{bevel:.026});
   if(i===1){
    // Outboard pier creates an unobstructed loading port at the incursion
    // band, while solid corbels and a supported deck outrigger carry its load.
    box(`${s} / loading port roof corbel`,[1.58,.29,.49],[side*6.53,4.44,z],mat.shell,{parent:roof,bevel:.03});
    box(`${s} / loading port service header`,[1.56,.26,.44],[side*6.50,3.66,z],mat.alloy,{bevel:.026});
    box(`${s} / loading port brace saddle`,[.24,.34,.46],[side*5.85,3.50,z],mat.graphite,{bevel:.025});
    box(`${s} / outboard column deck bearing`,[1.78,.27,1.14],[side*6.55,-.055,z],mat.deck,{parent:deck,bevel:.03});
    box(`${s} / outboard column underfloor girder`,[1.90,.29,.36],[side*6.58,-.35,z],mat.alloy,{parent:deck,bevel:.025});
   }
   // A continuous side wall only above the enemy flight band.
   if(i<3){
    const mid=z-2.22;
    box(`${s} / upper hull shell bay ${i}`,[.30,1.71,3.96],[side*6.15,3.14,mid],mat.shell,{bevel:.035});
    box(`${s} / wall panel inset ${i}`,[.055,1.17,3.35],[side*5.969,3.16,mid],mat.alloy,{collision:false,bevel:.025});
    box(`${s} / wall panel ceramic overlay ${i}`,[.045,.92,2.62],[side*5.925,3.25,mid+.18],mat.shell,{collision:false,bevel:.02});
    strip([.035,.033,2.43],[side*5.89,2.9,mid+.18],mat.graphite);
    box(`${s} / side canopy bay ${i}`,[2.09,.17,4.31],[side*5.1,4.02,mid],mat.shell,{parent:roof,bevel:.035});
    box(`${s} / canopy lower stringer ${i}`,[.14,.22,4.35],[side*4.16,3.93,mid],mat.graphite,{parent:roof,bevel:.02});
    box(`${s} / overhead task light housing ${i}`,[.27,.08,1.65],[side*4.75,3.87,mid],mat.graphite,{parent:roof,collision:false,bevel:.018});
    box(`${s} / overhead task light lens ${i}`,[.18,.023,1.47],[side*4.75,3.817,mid],mat.signal,{parent:roof,collision:false,bevel:.008});
   }
  }
  // Utility feed runs terminate at the back wall and front entrance manifold.
  for(let j=0;j<2;j++){
   const y=2.20+j*.21,x=side*(5.72-j*.16);
   pipe(`${s} / ${j?'coolant return':'coolant supply'}`,[[x,y,4.0],[x,y,-8.7],[x,y,-10.45],[side*4.95,y,-10.85]],j?.052:.075,j?mat.copper:mat.alloy);
   for(const z of [2.8,-1.6,-6.0,-9.7]){
    box(`${s} / pipe bracket ${j}/${z}`,[.22,.12,.10],[x,y-.10,z],mat.graphite,{collision:false,bevel:.012});
    minor(new T.TorusGeometry(j?.063:.087,.012,5,16),mat.graphite,[x,y,z]);
   }
  }
  // Wall-mounted fan banks are recessed INTO complete housings, not floating.
  for(const [i,z]of [[0,1.25],[1,-7.25]]){
   box(`${s} / ventilation plenum ${i}`,[.53,.81,1.48],[side*5.73,2.92,z],mat.graphite,{bevel:.035});
   box(`${s} / ventilator frame ${i}`,[.10,.73,1.40],[side*5.425,2.92,z],mat.alloy,{collision:false,bevel:.018});
   for(let k=0;k<7;k++)strip([.14,.042,1.26],[side*5.35,2.64+k*.093,z],mat.shell,[0,0,side*.28]);
   strip([.09,.066,.22],[side*5.34,3.205,z+.47],mat.copper);
  }
 }

 // Two actual crane runway rails and crossing structural trusses make an
 // open roof. There is no sky dome, room-size roof plate, or screen overlay.
 for(const x of [-2.78,2.78]){
  box(`gantry / runway web ${x}`,[.13,.41,14.65],[x,4.23,-2.6],mat.graphite,{parent:roof,bevel:.018});
  box(`gantry / runway bottom flange ${x}`,[.38,.075,14.65],[x,4.00,-2.6],mat.alloy,{parent:roof,bevel:.014});
  box(`gantry / runway cap ${x}`,[.30,.065,14.65],[x,4.475,-2.6],mat.shell,{parent:roof,bevel:.012});
 }
 for(const [i,z]of [[0,3.95],[1,-.49],[2,-4.93],[3,-9.37]]){
  box(`roof / transverse load beam ${i}`,[12.53,.29,.30],[0,4.44,z],mat.shell,{parent:roof,bevel:.035});
  box(`roof / transverse exposed bottom chord ${i}`,[11.58,.09,.36],[0,4.245,z],mat.alloy,{parent:roof,bevel:.018});
  for(const side of [-1,1]){
   // Short diagonal knee braces visibly transfer roof load into hull columns.
   rod(`roof / knee brace ${i}/${side}`,[side*5.81,3.42,z],[side*4.48,4.28,z],.072,mat.alloy,{parent:roof});
   box(`roof / runway saddle ${i}/${side}`,[.64,.18,.60],[side*2.78,4.53,z],mat.graphite,{parent:roof,bevel:.025});
   for(const dx of [-.21,.21])bolt([side*2.78+dx,4.64,z],[0,0,0],.028);
  }
 }
 // Parked hoist carriage has an intelligible trolley, motor and lifting socket.
 const craneZ=-5.65;
 box('gantry / parked carriage beam',[5.97,.25,.59],[0,3.77,craneZ],mat.alloy,{parent:roof,bevel:.04});
 for(const x of [-2.78,2.78]){
  box(`gantry / carriage runner ${x}`,[.63,.39,.94],[x,3.93,craneZ],mat.graphite,{parent:roof,bevel:.045});
  for(const z of [-.29,.29])rod(`gantry / roller ${x}/${z}`,[x-.32,4.04,craneZ+z],[x+.32,4.04,craneZ+z],.13,mat.alloy,{parent:roof,collision:false});
 }
 box('gantry / hoist drive body',[1.04,.48,.80],[.72,3.51,craneZ],mat.shell,{parent:roof,bevel:.07});
 box('gantry / hoist drive ribbed motor',[.62,.27,.40],[.72,3.18,craneZ],mat.graphite,{parent:roof,bevel:.035});
 for(let i=0;i<5;i++)strip([.65,.033,.43],[.72,3.10+i*.046,craneZ],mat.alloy);
 rod('gantry / retracted lift cylinder',[.72,3.2,craneZ],[.72,2.82,craneZ],.058,mat.alloy,{parent:roof});
 box('gantry / secured lifting socket',[.22,.16,.23],[.72,2.78,craneZ],mat.copper,{parent:roof,bevel:.035});
 label('SWL 2.5t',[.65,3.55,craneZ+.413],[.63,.16],{parent:roof});

 // Far bulkhead: a huge actual observation opening and two actual side doors.
 // The window is the white LCD aperture. It contains NO glazing mesh.
 box('observation bulkhead / continuous sill',[15.10,.73,.62],[0,.14,-11.20],mat.shell,{parent:back,bevel:.045});
 box('observation bulkhead / upper header',[15.10,.66,.67],[0,5.20,-11.20],mat.shell,{parent:back,bevel:.045});
 box('observation window / sill exposed rebate',[9.44,.19,.86],[0,.635,-11.10],mat.graphite,{parent:back,bevel:.02});
 box('observation window / sill cap',[9.18,.065,.96],[0,.756,-11.11],mat.alloy,{parent:back,bevel:.016});
 box('observation window / head inner rebate',[9.44,.19,.86],[0,4.785,-11.10],mat.graphite,{parent:back,bevel:.02});
 for(const side of [-1,1]){
  const x=side*4.81;
  box(`observation window / full structural jamb ${side}`,[.51,4.10,.77],[x,2.74,-11.13],mat.shell,{parent:back,bevel:.035});
  box(`observation window / inner steel gasket ${side}`,[.10,4.10,.85],[side*4.50,2.74,-11.07],mat.graphite,{parent:back,bevel:.016});
  box(`far access / outer wall pier ${side}`,[.66,4.30,.65],[side*7.35,2.47,-11.20],mat.shell,{parent:back,bevel:.035});
  box(`far access / door lintel ${side}`,[2.10,.91,.66],[side*6.06,4.31,-11.20],mat.shell,{parent:back,bevel:.035});
  // The service door is open from y=.48 to 3.85, bounded only by real jambs.
  for(const dx of [-.91,.91])box(`far access / door jamb ${side}/${dx}`,[.14,3.42,.23],[side*6.06+dx,2.17,-10.82],mat.graphite,{parent:back,bevel:.018});
  box(`far access / door head track ${side}`,[1.96,.16,.23],[side*6.06,3.88,-10.82],mat.alloy,{parent:back,bevel:.018});
  box(`far access / door threshold ${side}`,[1.94,.055,.52],[side*6.06,.54,-10.83],mat.alloy,{parent:back,bevel:.016});
  // Short real corridor walls behind each doorway supply thickness and depth.
  box(`far access / return corridor side ${side}`,[.20,3.71,2.13],[side*7.05,2.30,-12.09],mat.alloy,{parent:back,bevel:.025});
  box(`far access / return corridor roof ${side}`,[1.87,.16,2.13],[side*6.06,4.06,-12.09],mat.graphite,{parent:back,bevel:.02});
  box(`far access / redacted sliding door leaf ${side}`,[.29,3.13,.14],[side*6.80,2.25,-10.74],mat.alloy,{parent:back,bevel:.025});
  box(`far access / door status emitter ${side}`,[.063,.38,.048],[side*5.19,2.17,-10.65],mat.signal,{parent:back,collision:false,bevel:.012});
  label(side<0?'E-02 / SERVICE':'E-03 / POWER',[side*6.04,4.25,-10.83],[1.65,.34],{parent:back});
 }
 label('MAINTENANCE 07',[0,5.23,-10.846],[5.26,.69],{parent:back,color:'#33494e',prominent:true});
 // Three identical physical interfaces are fixed to the same facing surface
 // across near/mid/far depth and can be used for projection/parallax QA.
 box('port / near deck utility socket pedestal',[.61,.58,.39],[-4.15,.389,2.34],mat.shell,{bevel:.035});
 box('port / near deck utility socket foot',[.78,.065,.54],[-4.15,.126,2.34],mat.graphite,{bevel:.018});
 servicePort('perspective landmark / near connector',[-4.15,.45,2.575]);
 servicePort('perspective landmark / middle connector',[-5.69,1.80,-1.55]);
 servicePort('perspective landmark / far connector',[-4.83,1.96,-10.72],back);

 // One bounded repair bench is docked to the starboard hull and stands
 // on the service deck. Its back spine carries the shelf into the upper hull.
 box('starboard / workbench rear load spine',[.17,2.36,1.16],[5.89,1.26,1.15],mat.shell,{bevel:.035});
 box('starboard / workbench upper hull anchor',[.32,.32,.97],[5.99,2.45,1.15],mat.alloy,{bevel:.025});
 box('starboard / workbench rear sole',[.47,.07,1.34],[5.89,.12,1.15],mat.graphite,{parent:deck,bevel:.018});
 box('starboard / workbench actual top',[1.65,.13,1.05],[5.14,.91,1.15],mat.alloy,{bevel:.035});
 box('starboard / workbench protective mat',[1.05,.018,.70],[4.95,.984,1.15],mat.rubber,{collision:false,bevel:.006});
 for(const z of [.77,1.53]){
  box(`starboard / workbench deck leg ${z}`,[.095,.72,.095],[4.46,.477,z],mat.graphite,{bevel:.014});
  box(`starboard / workbench leg shoe ${z}`,[.25,.05,.25],[4.46,.12,z],mat.alloy,{parent:deck,bevel:.014});
 }
 box('starboard / workbench front apron',[.10,.16,1.03],[4.35,.80,1.15],mat.shell,{bevel:.018});
 strip([.028,.08,.24],[4.284,.80,1.44],mat.copper);
 label('TOOLS / 07',[5.793,1.65,1.15],[.59,.14],{r:[0,-Math.PI/2,0]});

 // Equipment landing pads are connected to deck beams. CC0 service machines
 // are integrated by the parent world module using these reserved anchors.
 const propsPlacement=[
  {id:'port switchgear',role:'electrical cabinet',position:[-4.70,.147,-2.0],rotation:[0,.40,0],maxSize:[1.48,1.85,1.12],contactSurface:'port switchgear / anchored equipment pad',keepShotBandClear:'remaining central bay x=-3.25..3.25'},
  {id:'starboard generator',role:'maintenance generator',position:[4.76,.147,-5.80],rotation:[0,-.48,0],maxSize:[1.57,1.32,1.15],contactSurface:'starboard generator / anchored equipment pad',keepShotBandClear:'remaining central bay x=-3.25..3.25'},
  {id:'starboard tool box',role:'metal toolbox',position:[4.80,.995,1.28],rotation:[0,-.25,0],maxSize:[.45,.40,.34],contactSurface:'starboard / workbench protective mat',keepShotBandClear:'bounded workbench beside bay'}
 ];
 for(const p of propsPlacement.filter(p=>p.role!=='metal toolbox')){box(`${p.id} / anchored equipment pad`,[1.55,.06,1.31],[p.position[0],.114,p.position[2]],mat.graphite,{parent:deck,bevel:.025});for(const dx of [-.66,.66])for(const dz of [-.53,.53])bolt([p.position[0]+dx,.158,p.position[2]+dz],[0,0,0],.023);}
 // A single wall distribution panel explains both attached utility runs.
 box('port / power distribution enclosure',[.40,.95,.81],[-5.69,1.69,-2.0],mat.shell,{bevel:.045});
 for(const z of [-2.27,-1.73])box(`port / power enclosure suspension strap ${z}`,[.32,.50,.12],[-5.93,2.20,z],mat.alloy,{bevel:.018});
 box('port / power distribution enclosure reveal',[.05,.79,.67],[-5.46,1.69,-2.0],mat.graphite,{collision:false,bevel:.02});
 box('port / power distribution removable panel',[.036,.70,.58],[-5.413,1.72,-2.0],mat.alloy,{collision:false,bevel:.018});
 for(let i=0;i<3;i++)strip([.043,.057,.10],[-5.379,1.94-i*.13,-1.88],i===0?mat.signal:mat.graphite);
 pipe('port / cabinet power umbilical',[[-5.65,1.34,-2],[-5.65,.44,-2],[-5.08,.30,-2],[-4.90,.24,-2]],.052,mat.rubber);

 // Deliberate, causal edge exposure at selected high-contact steel edges.
 for(const side of [-1,1])for(const z of [3.96,-.48,-4.92,-9.36]){
  for(const k of [0,1,2])strip([.047,.014,.15+k*.04],[side*(3.44+k*.028),.248,z+.19+k*.12],mat.alloy,[0,k*.17,0]);
 }
 for(const [material,items]of batches){const g=mergeGeometries(items,false);for(const item of items)item.dispose();add(`attached detail batch / ${material.name||material.color.getHexString()}`,g,material,[0,0,0],[0,0,0],detail,{receiver:true,uv:false});}
 // A final, bounded finish pass differentiates the working side of the
 // hangar. It replaces MATERIALS on existing surfaces only; no geometry,
 // collision, aperture, transform or perspective landmark is changed.
 function zoneGraphic(){
  if(typeof document==='undefined')return null;
  const c=document.createElement('canvas');c.width=1536;c.height=512;
  const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);
  x.fillStyle='#e5e5d6';x.font='900 272px Arial, sans-serif';x.fillText('07',82,337);
  x.font='700 95px Arial, sans-serif';x.fillText('MAINTENANCE',535,180,930);
  x.font='600 45px Arial, sans-serif';x.fillText('TOOLS / SERVICE',542,275,800);
  x.fillStyle='#c39b59';x.fillRect(89,394,1364,17);x.fillRect(90,94,25,34);
  // Missing paint occurs on the lower handling edge, not as global grain.
  x.globalCompositeOperation='destination-out';
  for(const [px,py,w,h]of [[104,398,39,4],[356,404,58,3],[752,395,34,5],[1157,404,74,4]])x.fillRect(px,py,w,h);
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;ownedTextures.add(t);return t;
 }
 const maintenanceGraphic=zoneGraphic();
 function surfaceFinish(name,{color,size,plane=0,kind=0,painted=false,graphic=null,roughness}={}){
  const object=root.getObjectByName(name);if(!object?.isMesh)return;
  const source=object.material,m=own(source.clone());m.name=`Hangar finish / ${name}`;
  if(color)m.color.set(color);if(roughness!==undefined)m.roughness=roughness;
  const cache=`hangar-bounded-finish-v1/${plane}/${kind}/${painted}/${!!graphic}`;
  m.onBeforeCompile=(shader,renderer)=>{
   source.onBeforeCompile.call(source,shader,renderer);
   shader.uniforms.hangarFinishSize={value:new T.Vector3(...size)};
   if(graphic)shader.uniforms.hangarZoneGraphic={value:graphic};
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vHangarFinishP;\nvarying vec3 vHangarFinishN;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nvHangarFinishP=position;vHangarFinishN=normal;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 vHangarFinishP;varying vec3 vHangarFinishN;
    uniform vec3 hangarFinishSize;
    ${graphic?'uniform sampler2D hangarZoneGraphic;':''}`)
    .replace('#include <map_fragment>',`#include <map_fragment>
     vec3 hangarF=vHangarFinishP/hangarFinishSize+.5;
     vec2 hangarUV=${plane===0?'hangarF.zy':plane===1?'hangarF.xz':'hangarF.xy'};
     float hangarMargin=min(min(hangarUV.x,1.-hangarUV.x),min(hangarUV.y,1.-hangarUV.y));
     float hangarEdge=1.-smoothstep(.006,.027,hangarMargin);
     float hangarBreak=smoothstep(.37,.71,.50+.22*sin(hangarUV.x*47.+hangarUV.y*31.)+.11*sin(hangarUV.x*103.-hangarUV.y*61.));
     float hangarWear=hangarEdge*hangarBreak*.32;
     float hangarHandling=exp(-pow((hangarUV.x-.5)*7.,2.)-pow((abs(hangarUV.y-.5)-.34)*29.,2.));
     float hangarMacro=.5+.5*sin(hangarUV.x*4.6+hangarUV.y*.7);
     ${kind===0?'hangarHandling=exp(-pow((hangarUV.y-.13)*15.,2.))*.30;':kind===2?'hangarHandling=0.;hangarWear=exp(-pow((abs(hangarUV.x-.5)-.43)*42.,2.))*(.44+.10*sin(hangarUV.y*27.));':''}
     diffuseColor.rgb*=1.-hangarHandling*${painted?'.075':'.048'}-(1.-hangarMacro)*${painted?'.035':'.018'};
     diffuseColor.rgb=mix(diffuseColor.rgb,${painted?'vec3(.31,.36,.35)':'diffuseColor.rgb*1.16'},hangarWear*${painted?'.29':'.40'});
     ${graphic?`vec4 hangarInk=texture2D(hangarZoneGraphic,hangarUV);
     float hangarInkFace=step(.90,-vHangarFinishN.x);
     diffuseColor.rgb=mix(diffuseColor.rgb,hangarInk.rgb,hangarInk.a*hangarInkFace);`:''}`)
    .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
     roughnessFactor=clamp(roughnessFactor+hangarHandling*.11+(hangarMacro-.5)*.055-hangarWear*.20,.20,.94);`)
    .replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
     ${painted?'metalnessFactor=mix(metalnessFactor,.64,hangarWear*.34);':''}`);
  };
  m.customProgramCacheKey=()=>`${source.customProgramCacheKey()}/${cache}`;
  object.material=m;finishVariants.push({name,source,material:m,kind:kind===2?'rail contact edge':kind===1?'access and handling edge':'bounded painted panel',color:color||null,graphic:!!graphic});
 }
 for(let i=0;i<3;i++){
  surfaceFinish(`starboard / upper hull shell bay ${i}`,{color:'#647b84',size:[.30,1.71,3.96],painted:true,roughness:.62});
  surfaceFinish(`starboard / wall panel ceramic overlay ${i}`,{color:i===1?'#4e6874':'#6c8187',size:[.045,.92,2.62],painted:true,roughness:.59,graphic:i===1?maintenanceGraphic:null});
 }
 surfaceFinish('starboard / workbench rear load spine',{color:'#5a737b',size:[.17,2.36,1.16],painted:true,roughness:.66});
 surfaceFinish('starboard / workbench front apron',{color:'#ab8853',size:[.10,.16,1.03],painted:true,roughness:.64});
 for(const side of ['port','starboard']){
  for(const index of [1,4])surfaceFinish(`${side} / deck access lid ${index}`,{size:[1.22,.035,1.24],plane:1,kind:1});
  surfaceFinish(`${side==='port'?'PORT':'STARBOARD'} / entry hatch cover`,{size:[.55,.92,.026],plane:2,kind:1});
 }
 surfaceFinish('starboard / workbench actual top',{size:[1.65,.13,1.05],plane:1,kind:1});
 for(const x of [-2.78,2.78])surfaceFinish(`gantry / runway bottom flange ${x}`,{size:[.38,.075,14.65],plane:1,kind:2});
 // Depth is carried by the actual hull surfaces, not by a fog/sky layer.
 // One coherent palette pass keeps the entrance dark, middle work zones
 // cool/warm, and the distant observation bulkhead lighter and quieter.
 function recoat(name,color,{roughness,metalness}={}){
  const object=root.getObjectByName(name);if(!object?.isMesh)return;
  let row=finishVariants.find(row=>row.name===name);
  if(!row){
   const source=object.material,material=own(source.clone());
   material.name=`Hangar depth coat / ${name}`;
   material.onBeforeCompile=(shader,renderer)=>source.onBeforeCompile.call(source,shader,renderer);
   material.customProgramCacheKey=()=>`${source.customProgramCacheKey()}/hangar-depth-coat-v1`;
   object.material=material;row={name,source,material,kind:'depth and function coating',graphic:false};finishVariants.push(row);
  }
  row.material.color.set(color);row.color=color;
  if(roughness!==undefined)row.material.roughness=roughness;
  if(metalness!==undefined)row.material.metalness=metalness;
 }
 for(const side of ['PORT','STARBOARD']){
  recoat(`${side} / entrance load-bearing cutaway`,'#304955',{roughness:.60});
  recoat(`${side} / entrance socket foot`,'#263b48',{roughness:.69});
  recoat(`${side} / entrance exposed frame`,'#1e303b',{roughness:.64});
  recoat(`${side} / entrance steel nose`,'#b58a53',{roughness:.42,metalness:.78});
  recoat(`${side} / entry hatch cover`,'#597582',{roughness:.55});
 }
 recoat('entrance / overhead lintel continuous with jambs','#29424e',{roughness:.61});
 for(let i=0;i<3;i++){
  recoat(`port / upper hull shell bay ${i}`,['#66959f','#86aab0','#b4c6c9'][i],{roughness:.59});
  recoat(`port / wall panel ceramic overlay ${i}`,['#77aeb5','#90b8bd','#bdced0'][i],{roughness:.57});
  recoat(`port / side canopy bay ${i}`,['#71949e','#a0b8bf','#c5d0d3'][i],{roughness:.59});
  recoat(`starboard / upper hull shell bay ${i}`,['#687d87','#81949b','#afbec3'][i],{roughness:.62});
  recoat(`starboard / wall panel ceramic overlay ${i}`,['#b2824f','#ab7543','#a4b5bc'][i],{roughness:.60});
  recoat(`starboard / side canopy bay ${i}`,['#66828e','#96adb5','#c2cfd2'][i],{roughness:.59});
 }
 for(let i=0;i<4;i++){
  recoat(`port / hull primary pier ${i}`,['#527480','#799ca6','#a0b7be','#becdd1'][i],{roughness:.61});
  recoat(`starboard / hull primary pier ${i}`,['#4c6979','#748f9c','#a0b5bd','#becdd1'][i],{roughness:.61});
  recoat(`roof / transverse load beam ${i}`,['#4c6b7a','#7f9ca8','#a5b9c1','#c3cfd3'][i],{roughness:.60});
 }
 recoat('port / power distribution enclosure','#57939d',{roughness:.63});
 recoat('port / power distribution removable panel','#87b9bf',{roughness:.59,metalness:.14});
 recoat('starboard / workbench rear load spine','#ab7a45',{roughness:.65});
 recoat('starboard / workbench upper hull anchor','#8f734d',{roughness:.52,metalness:.36});
 recoat('starboard / workbench front apron','#c08e4e',{roughness:.61});
 for(const side of [-1,1]){
  recoat(`gantry / runway cap ${side*2.78}`,'#91a9b3',{roughness:.56});
  recoat(`observation window / full structural jamb ${side}`,'#c0ced3',{roughness:.63});
  recoat(`observation window / inner steel gasket ${side}`,'#849ba7',{roughness:.63});
  recoat(`far access / outer wall pier ${side}`,'#c2cfd3',{roughness:.63});
  recoat(`far access / door lintel ${side}`,'#c9d3d6',{roughness:.63});
  recoat(`far access / door head track ${side}`,'#a9bac1',{roughness:.58});
  for(const dx of [-.91,.91])recoat(`far access / door jamb ${side}/${dx}`,'#90a6b0',{roughness:.62});
 }
 recoat('observation bulkhead / continuous sill','#c4d0d4',{roughness:.64});
 recoat('observation bulkhead / upper header','#cbd5d8',{roughness:.64});
 recoat('observation window / sill exposed rebate','#90a6b0',{roughness:.64});
 recoat('observation window / head inner rebate','#90a6b0',{roughness:.64});
 recoat('observation window / sill cap','#a4b7bf',{roughness:.57});
 recoat('rear bridge / continuous hand rail','#a7b8c0',{roughness:.56});
 recoat('rear bridge / mid rail','#8a9fa9',{roughness:.65});
 recoat('rear bridge / full load-bearing spar','#7e929d',{roughness:.67});
 function syncFinishMaterials(){
  // The owner loads its shell scan asynchronously. These local coat variants
  // follow that shared physical micro-surface, without owning its textures.
  for(const {source,material}of finishVariants){
   for(const key of ['normalMap','roughnessMap','bumpMap','bumpScale','aoMap','aoMapIntensity'])if(material[key]!==source[key]){material[key]=source[key];material.needsUpdate=true;}
   if(material.normalScale&&source.normalScale)material.normalScale.copy(source.normalScale);
  }
 }
 syncFinishMaterials();
 root.updateMatrixWorld(true);
 function inspection(){return {art:'hangar-v1',source:'Original continuous architectural model; no previous scene imported',mode,centralBayEmpty:true,invisibleShadowReceivers:0,activeCollisionBoxes:collisionBoxes.length,collisionPolicy:'only visible major solids, separate aperture edges; attached screws/louvers belong to their housing',layers:[{id:'near',name:'thick entrance jambs and deck cutaway',depth:4.12},{id:'mid',name:'connected side hull, utility runs, service deck, crane',depth:-2.0},{id:'far',name:'inspection bridge, actual observation window, open access corridors',depth:-11.2}],landmarks:landmarks.map(x=>({...x})),receivers:receivers.map(x=>({...x})),propsPlacement:propsPlacement.map(x=>({...x})),openings:[{name:'central maintenance bay',min:[-3.32,.30,-8.35],max:[3.32,2.55,3.48],mesh:false},{name:'observation window',min:[-4.44,.80,-11.8],max:[4.44,4.66,-10.61],mesh:false},{name:'open roof lightwell between trusses',min:[-2.52,4.65,-4.5],max:[2.52,6.0,-1.0],mesh:false}],shadowReceiversAreVisible:true,surfaceFinishes:{geometryAdded:0,maintenanceZone:'warm ochre starboard maintenance panels against cool cyan port electrical panels',paint:'navy foreground / cool-warm middle work zones / pale cool-grey observation structure',depthPalette:{near:'navy and graphite blue with bounded copper edge',middle:'port cyan, starboard ochre and blue-grey',far:'pale cool-grey, lower contrast',fog:false},boundedWear:finishVariants.map(({name,kind,color,graphic})=>({name,kind,color,graphic})),graphics:'original surface ink on existing wall panel and existing rear header stencil'}};}
 function update(time){if(disposed)return;syncFinishMaterials();for(const o of moving)o.rotation.y=time*.2;}
 function setDisplayMode(value='transparent'){if(!['transparent','desktop'].includes(value))throw new RangeError(`Unknown output mode: ${value}`);mode=value;return {mode,collisionBoxes:collisionBoxes.length};}
 function dispose(){if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const m of ownedMaterials)m.dispose();for(const t of ownedTextures)t.dispose();root.clear();}
 return {root,collisionBoxes,get activeCollisionBoxes(){return collisionBoxes;},update,dispose,inspection,setDisplayMode};
}
