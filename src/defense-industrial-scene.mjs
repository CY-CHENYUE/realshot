import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const Y=new T.Vector3(0,1,0),V=new T.Vector3(),N=new T.Vector3();
const shape=points=>{const s=new T.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;};
const bevelBox=(s,r=.02)=>new RoundedBoxGeometry(...s,2,Math.min(r,...s.map(v=>v*.18)));
export function createIndustrialScene({materials={}}={}){
 const root=new T.Group();root.name='RELAY 07 / industrial launch service gallery';
 const geometry=new Set(),ownMaterials=new Set(),textures=new Set(),batches=new Map(),collisionBoxes=[],landmarks=[],receivers=[];
 let mode='transparent',disposed=false;
 const physical=(key,color,metalness,roughness)=>materials[key]||(()=>{const m=new T.MeshPhysicalMaterial({name:'Industrial_'+key,color,metalness,roughness});ownMaterials.add(m);return m;})();
 const m={shell:physical('shell','#a8afa5',.1,.64),slate:physical('slate','#4b6264',.13,.59),alloy:physical('alloy','#718185',.91,.46),graphite:physical('graphite','#26343b',.52,.58),rubber:physical('rubber','#182326',0,.87),caution:physical('caution','#b97935',.06,.65),copper:physical('copper','#97744b',.77,.43),deck:physical('deck','#77827c',.52,.72),signal:physical('signal','#a2b6b0',.2,.32),glass:physical('glass','#22434a',.45,.2)};
 const temp=new T.Object3D();
 function uvMeters(g,matrix){const p=g.attributes.position,n=g.attributes.normal;if(!p||!n)return;const uv=new Float32Array(p.count*2),nm=new T.Matrix3().getNormalMatrix(matrix);for(let i=0;i<p.count;i++){V.fromBufferAttribute(p,i).applyMatrix4(matrix);N.fromBufferAttribute(n,i).applyNormalMatrix(nm);const a=[Math.abs(N.x),Math.abs(N.y),Math.abs(N.z)];if(a[1]>=a[0]&&a[1]>=a[2]){uv[i*2]=V.x;uv[i*2+1]=V.z;}else if(a[0]>=a[2]){uv[i*2]=V.z;uv[i*2+1]=V.y;}else{uv[i*2]=V.x;uv[i*2+1]=V.y;}}g.setAttribute('uv',new T.BufferAttribute(uv,2));}
 function mesh(name,g,mat,p=[0,0,0],r=[0,0,0],{solid=true,receive=true,cast=true,uv=true}={}){const o=new T.Mesh(g,mat);o.name=name;o.position.fromArray(p);o.rotation.fromArray(r);o.castShadow=cast;o.receiveShadow=receive;root.add(o);o.updateMatrixWorld(true);if(uv)uvMeters(g,o.matrixWorld);geometry.add(g);if(receive)receivers.push(name);if(solid){const b=new T.Box3().setFromObject(o);collisionBoxes.push({id:name,name,objectName:name,min:b.min.toArray(),max:b.max.toArray()});}return o;}
 function box(name,s,p,mat=m.shell,options={}){return mesh(name,bevelBox(s,options.radius??.025),mat,p,options.r??[0,0,0],options);}
 function detail(g,mat,p,r=[0,0,0]){temp.position.fromArray(p);temp.rotation.fromArray(r);temp.scale.set(1,1,1);temp.updateMatrix();g.applyMatrix4(temp.matrix);uvMeters(g,new T.Matrix4());if(g.index){const original=g;g=g.toNonIndexed();original.dispose();}if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(g);}
 function trim(s,p,mat=m.alloy,r){detail(bevelBox(s,.009),mat,p,r);}
 function bolt(p,r=[Math.PI/2,0,0],size=.022){detail(new T.CylinderGeometry(size,size,.018,6),m.alloy,p,r);detail(new T.CylinderGeometry(size*.38,size*.38,.020,6),m.graphite,p,r);}
 function rod(name,a,b,r,mat=m.alloy,{solid=true}={}){const pa=new T.Vector3(...a),pb=new T.Vector3(...b),delta=pb.clone().sub(pa),g=new T.CylinderGeometry(r,r,delta.length(),12);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(Y,delta.normalize()));g.translate(...pa.add(pb).multiplyScalar(.5).toArray());return mesh(name,g,mat,[0,0,0],[0,0,0],{solid});}
 function pipe(name,points,r,mat=m.alloy){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));const g=new T.TubeGeometry(curve,Math.max(16,points.length*7),r,10,false);const o=mesh(name,g,mat,[0,0,0],[0,0,0],{solid:false});for(let i=0;i<points.length-1;i++){const b=new T.Box3().setFromPoints([new T.Vector3(...points[i]),new T.Vector3(...points[i+1])]).expandByScalar(r);collisionBoxes.push({id:name+'/'+i,name:name+'/'+i,objectName:name,min:b.min.toArray(),max:b.max.toArray()});}return o;}
 function plate(name,points,thickness,p,mat=m.shell,{r=[0,0,0],solid=false,radius=.025}={}){const g=new T.ExtrudeGeometry(shape(points),{depth:thickness,steps:1,bevelEnabled:true,bevelSize:radius,bevelThickness:radius*.6,bevelSegments:2});g.translate(0,0,-thickness/2);return mesh(name,g,mat,p,r,{solid});}
 function stencil(text,p,size,{color='#d6dacd',r=[0,0,0],font='700 144px Arial'}={}){if(typeof document==='undefined')return;const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');ctx.clearRect(0,0,1024,256);ctx.fillStyle=color;ctx.font=font;ctx.textBaseline='middle';ctx.fillText(text,12,128,1000);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;textures.add(t);const material=new T.MeshStandardMaterial({map:t,transparent:true,depthWrite:false,roughness:.76,polygonOffset:true,polygonOffsetFactor:-2});ownMaterials.add(material);return mesh('surface stencil / '+text,new T.PlaneGeometry(...size),material,p,r,{solid:false,receive:false,cast:false,uv:false});}
 function panel(name,s,p,mat=m.shell,{edge=m.graphite}={}){const o=box(name,s,p,mat,{radius:.035});box(name+' / recessed gasket',[s[0]+.045,s[1]+.045,.024],[p[0],p[1],p[2]-.5*s[2]-.018],edge,{solid:false,radius:.013});for(const x of [-1,1])for(const y of [-1,1])bolt([p[0]+x*(s[0]/2-.07),p[1]+y*(s[1]/2-.07),p[2]+s[2]/2+.012]);return o;}

 // A single cropped foreground shear wall. Its broken chamfered silhouette
 // never forms a full-screen portal and never bridges the attack corridor.
 const nearOutline=[[-5.45,-.62],[-3.38,-.62],[-3.32,.35],[-3.49,.78],[-3.49,2.04],[-3.02,2.63],[-3.02,3.22],[-3.58,3.86],[-5.45,3.86]];
 plate('port entry / thick shear bulkhead',nearOutline,.66,[0,0,4.14],m.graphite,{radius:.045});
 // Conservative positive-volume slices, inside the visible sloped outline.
 for(const [y0,y1,x]of [[-.60,.35,-3.40],[.35,.80,-3.50],[.80,2.03,-3.52],[2.03,2.64,-3.52],[2.64,3.22,-3.06],[3.22,3.84,-3.63]])collisionBoxes.push({id:'port entry / volume '+y0,name:'port entry / volume '+y0,objectName:'port entry / thick shear bulkhead',min:[-5.40,y0,3.82],max:[x,y1,4.46]});
 plate('port entry / painted cheek',[[-4.95,.22],[-3.72,.22],[-3.72,2.05],[-3.22,2.68],[-3.22,3.04],[-3.75,3.53],[-4.95,3.53]],.035,[0,0,4.498],m.slate,{radius:.025});
 trim([.075,1.25,.055],[-3.61,1.29,4.535],m.alloy);trim([.43,.08,.075],[-3.37,2.62,4.54],m.caution,[0,0,-.90]);
 panel('port entry / access plate',[.72,.82,.06],[-4.10,1.35,4.57],m.shell);
 stencil('07 / AUX',[-4.08,2.40,4.58],[.83,.2]);
 for(let i=0;i<4;i++)trim([.42,.028,.032],[-4.10,.51+i*.087,4.535],m.rubber);
 box('port entry / lower bearing',[2.13,.28,1.02],[-4.38,-.48,4.08],m.alloy,{radius:.045});

 // One long left gallery, a short right work spur, and a separate rear bridge.
 // Central white space has no plane, receiver or collision surrogate.
 for(let i=0;i<6;i++){
  const z=3.53-i*2.35;
  box('port gallery / deck cassette '+i,[2.87,.26,2.30],[-4.98,-.14,z],m.deck,{radius:.022});
  box('port gallery / inner steel edge '+i,[.11,.29,2.30],[-3.53,-.14,z],m.alloy,{radius:.013});
  trim([.075,.012,2.10],[-3.66,.003,z],m.caution);
  if(i===0||i===3){box('port gallery / removable cover '+i,[1.34,.026,1.35],[-4.99,.013,z],m.graphite,{solid:false,radius:.012});for(const x of [-.5,.5])trim([.12,.025,.04],[-4.99+x,.038,z],m.alloy);}
 }
 box('port gallery / longitudinal I-beam web',[.18,.43,14.34],[-4.95,-.46,-2.34],m.graphite,{radius:.015});
 box('port gallery / I-beam bottom flange',[.45,.065,14.34],[-4.95,-.70,-2.34],m.alloy,{radius:.01});
 for(const z of [3.50,-1.20,-5.90,-9.38]){rod('port gallery / supported knee '+z,[-6.32,-.05,z],[-4.20,-.63,z],.075,m.alloy);box('port gallery / deck hanger '+z,[.34,.51,.38],[-6.36,-.15,z],m.graphite,{radius:.02});}
 for(let i=0;i<3;i++)box('starboard work spur / slab '+i,[2.85,.26,1.72],[5.08,-.14,3.62-i*1.76],m.deck,{radius:.025});
 box('starboard work spur / load beam',[.27,.43,5.28],[5.16,-.46,1.87],m.graphite);
 box('starboard work spur / outer hull',[.34,.37,5.31],[6.65,-.04,1.85],m.shell);
 // An outboard keel joins the short work spur, power tower and pressure lock.
 // It gives every separate deck a legible load path without closing the bay.
 box('starboard hull / continuous outboard carrier',[.34,.54,15.78],[6.72,-.39,-3.25],m.graphite,{radius:.022});
 box('starboard hull / carrier lower flange',[.61,.07,15.82],[6.72,-.69,-3.25],m.alloy,{radius:.01});
 for(const z of [.1,3.6])rod('starboard work spur / bracket '+z,[6.65,-.1,z],[4.1,-.65,z],.07,m.alloy);
 // Rear bridge starts beyond all spawn locations.
 for(let i=0;i<5;i++)box('rear pressure lock / bridge slab '+i,[2.10,.25,2.12],[-4.2+i*2.10,-.14,-10.20],m.deck);
 box('rear pressure lock / bridge edge',[10.56,.15,.13],[0,-.07,-9.10],m.alloy,{radius:.016});

 // Port service hull: a coherent panel rail and two complete utility cabinets,
 // all above the enemy flight band; two widely spaced piers carry the canopy.
 for(const [i,z]of [[0,3.65],[1,-7.95]]){
  box('port hull / primary pier '+i,[.46,4.68,.62],[-6.52,1.97,z],m.graphite,{radius:.035});
  box('port hull / pier shoe '+i,[.79,.30,.91],[-6.52,-.29,z],m.alloy);
  box('port hull / pier cap '+i,[.74,.25,.88],[-6.52,4.12,z],m.alloy);
 }
 box('port hull / high utility spine',[.43,1.52,11.70],[-6.55,3.32,-2.18],m.slate,{radius:.038});
 box('port hull / service canopy',[2.80,.14,11.72],[-5.35,4.10,-2.18],m.shell,{radius:.02});
 box('port hull / canopy edge beam',[.14,.25,11.76],[-3.94,3.98,-2.18],m.graphite,{radius:.015});
 for(const z of [2.55,-2.0,-6.55]){
  box('port hull / panel gasket '+z,[.06,1.13,2.95],[-6.30,3.31,z],m.graphite,{solid:false,radius:.012});
  box('port hull / formed enamel panel '+z,[.055,1.02,2.82],[-6.259,3.33,z],m.shell,{solid:false,radius:.022});
  trim([.06,.045,2.43],[-6.208,2.95,z],m.alloy);
 }
 pipe('port utilities / supply',[[-6.45,2.32,3.62],[-6.12,2.32,3.38],[-6.12,2.32,-9.85],[-5.42,2.32,-10.44]],.075,m.alloy);
 pipe('port utilities / return',[[-6.45,2.57,3.62],[-5.96,2.57,3.24],[-5.96,2.57,-9.65],[-5.42,2.57,-10.44]],.043,m.copper);
 for(const y of [2.32,2.57])box('port utilities / pressure-drive union '+y,[.25,.20,.12],[-5.42,y,-10.40],m.rubber,{solid:false,radius:.014});
 for(const z of [2.8,-.2,-3.2,-6.2]){box('port utilities / bolted saddle '+z,[.36,.10,.13],[-6.07,2.18,z],m.graphite,{solid:false,radius:.01});bolt([-6.18,2.16,z],[0,0,Math.PI/2],.023);}
 for(const [i,z]of [[0,1.80],[1,-5.05]]){
  box('port utilities / cabinet carcass '+i,[.59,.84,1.55],[-5.99,3.12,z],m.graphite);
  box('port utilities / cabinet front rim '+i,[.08,.75,1.45],[-5.66,3.12,z],m.alloy,{solid:false});
  for(let j=0;j<8;j++)trim([.09,.038,1.28],[-5.59,2.85+j*.075,z],m.shell,[0,0,-.24]);
  trim([.10,.03,.21],[-5.59,3.37,z+.45],m.caution);
 }

 // The offset launch service tower is the medium-distance landmark, not a
 // mirrored wall. Its narrow side remains outside rear attack corridors.
 box('starboard service tower / grounded machinery deck',[2.50,.32,3.45],[5.23,-.18,-5.00],m.deck,{radius:.032});
 box('starboard service tower / vertical core',[1.69,4.80,1.54],[5.40,2.06,-5.15],m.graphite,{radius:.05});
 box('starboard service tower / heel',[2.13,.30,1.95],[5.40,-.29,-5.15],m.alloy,{radius:.04});
 box('starboard service tower / overhead cap',[2.11,.25,1.91],[5.40,4.57,-5.15],m.alloy);
 plate('starboard service tower / chamfered bone shield',[[-.90,-1.50],[.90,-1.50],[.90,1.21],[.58,1.56],[-.62,1.56],[-.90,1.18]],.14,[5.38,2.28,-4.29],m.shell,{solid:true,radius:.025});
 panel('starboard service tower / recessed orange service cover',[1.31,.73,.055],[5.38,3.05,-4.18],m.caution);
 stencil('07',[5.39,3.045,-4.137],[1.09,.67],{font:'900 210px Arial',color:'#d9dbcc'});
 stencil('PHASE POWER',[5.36,2.52,-4.13],[1.18,.14],{color:'#334247'});
 panel('starboard service tower / lower inspection panel',[1.40,.99,.05],[5.38,1.59,-4.17],m.slate);
 for(let i=0;i<6;i++)trim([1.12,.055,.06],[5.38,1.28+i*.12,-4.108],m.graphite);
 box('starboard service tower / gasketed instrument recess',[.54,.38,.06],[5.33,3.86,-4.175],m.graphite,{solid:false,radius:.023});
 box('starboard service tower / instrument glass',[.42,.26,.025],[5.33,3.86,-4.131],m.glass,{solid:false,radius:.016});
 for(let i=0;i<3;i++)trim([.058,.016,.012],[5.20+i*.13,3.85,-4.109],m.signal);
 // Side exchanger and actual insulated connections.
 box('starboard service tower / exchanger side case',[.57,2.24,1.27],[6.46,2.40,-5.13],m.slate);
 for(let i=0;i<9;i++)trim([.59,.064,1.10],[6.46,1.53+i*.205,-5.13],m.alloy);
 pipe('starboard service tower / coolant loop',[[6.45,3.68,-5.0],[6.45,4.05,-5.0],[5.57,4.05,-5.0],[5.57,3.65,-5.0]],.069,m.alloy);
 for(const x of [5.56,6.45]){box('starboard service tower / insulated socket '+x,[.20,.25,.24],[x,3.68,-5],m.rubber);trim([.23,.055,.27],[x,3.76,-5],m.alloy);}
 // The back connection is visible and supported rather than loose machinery.
 pipe('starboard tower / rear power route',[[5.30,3.30,-5.95],[5.30,3.30,-9.92],[4.78,3.30,-10.74]],.073,m.copper);
 for(const z of [-6.6,-8.6])box('starboard tower / power route clamp '+z,[.21,.15,.18],[5.30,3.19,z],m.graphite,{solid:false,radius:.012});

 // Pressure-door sleeves are nested at different real depths. The doorway
 // remains genuinely empty; there is no white wall in the centre.
 for(const [index,z,w,h,mat]of [[0,-10.84,9.25,4.4,m.graphite],[1,-11.18,8.74,4.03,m.alloy],[2,-11.53,8.42,3.78,m.shell]]){
  const post=.25+.04*(2-index);
  for(const side of [-1,1])box(`pressure door ${index} / jamb ${side}`,[post,h,.46],[side*w*.5,h*.5-.26,z],mat,{radius:.027});
  box(`pressure door ${index} / header`,[w+post,.25,.46],[0,h-.26,z],mat,{radius:.027});
  box(`pressure door ${index} / sill`,[w+post,.17,.46],[0,-.29,z],mat,{radius:.022});
 }
 stencil('RELAY / 07',[0,3.62,-10.595],[2.13,.23],{color:'#b7c2b6'});
 for(const side of [-1,1]){
  box('pressure door / outer machinery pier '+side,[.67,4.46,.95],[side*5.42,1.91,-10.89],m.slate,{radius:.035});
  box('pressure door / positive-drive cover '+side,[.38,2.89,.08],[side*5.42,2.07,-10.359],m.shell,{radius:.025});
  for(let i=0;i<5;i++)trim([.39,.053,.10],[side*5.42,.91+i*.40,-10.29],m.graphite);
  box('pressure door / drive shoe '+side,[1.11,.28,1.14],[side*5.42,-.32,-10.89],m.alloy);
 }
 // One overhead bridge and one side runway — not a repeated beam ceiling.
 box('launch rail / starboard runway',[.19,.39,11.73],[4.12,4.29,-4.43],m.graphite);
 box('launch rail / exposed runway flange',[.45,.065,11.77],[4.12,4.08,-4.43],m.alloy);
 box('launch rail / aft supported bridge',[10.76,.24,.44],[-.42,4.06,-7.90],m.alloy);
 for(const [side,x]of [[-1,-6.50],[1,6.72]]){
  box('launch rail / front supporting pier '+side,[.37,4.56,.44],[x,1.90,1.18],m.graphite);
  box('launch rail / front shoe '+side,[.72,.27,.72],[x,-.25,1.18],m.alloy);
  rod('launch rail / outboard corbel '+side,[x,3.26,1.18],[side<0?-4.02:4.13,4.06,1.18],.069,m.alloy);
 }
 box('launch rail / trolley housing',[.74,.40,.84],[4.12,3.80,-7.89],m.graphite);
 box('launch rail / trolley service face',[.56,.22,.045],[4.12,3.80,-7.438],m.caution,{solid:false,radius:.016});
 rod('launch rail / retracted lifting socket',[4.12,3.60,-7.89],[4.12,3.24,-7.89],.045,m.alloy);
 box('launch rail / empty lifting clamp',[.21,.12,.22],[4.12,3.20,-7.89],m.graphite);

 // A restrained near work station on the real right-hand spur, with a
 // recessed work surface, rather than an unrelated green scanned prop.
 box('work spur / cabinet carcass',[1.64,.81,.72],[5.22,.38,2.56],m.slate);
 box('work spur / steel work surface',[1.91,.085,.94],[5.22,.845,2.56],m.alloy);
 panel('work spur / drawer upper',[1.43,.20,.035],[5.22,.59,2.944],m.shell);
 panel('work spur / drawer lower',[1.43,.20,.035],[5.22,.30,2.944],m.shell);
 for(const y of [.59,.30])trim([.39,.035,.045],[5.22,y,2.984],m.graphite);
 stencil('TOOLS / 07',[5.22,.10,2.97],[.80,.12],{color:'#c1c8bc'});
 box('work spur / stored service cartridge',[.63,.29,.43],[5.52,1.03,2.59],m.graphite);
 trim([.42,.045,.45],[5.52,1.18,2.59],m.caution);trim([.39,.035,.05],[5.52,1.02,2.82],m.alloy);
 // Small actual task lights are attached beneath real surfaces.
 box('port canopy / task-light housing',[.17,.065,2.34],[-4.90,3.987,-.40],m.graphite,{solid:false});
 box('port canopy / warm diffuser',[.105,.025,2.16],[-4.90,3.94,-.40],m.signal,{solid:false});
 box('service tower / task-light housing',[1.24,.08,.18],[5.38,4.22,-4.14],m.graphite,{solid:false});
 box('service tower / warm diffuser',[1.10,.025,.11],[5.38,4.16,-4.14],m.signal,{solid:false});

 // Batch only decorative fittings. Primary surfaces retain distinct names
 // and bounded collision volumes for reproducible optical/ray inspection.
 for(const [material,gs]of batches){const merged=mergeGeometries(gs,false);for(const g of gs)g.dispose();mesh('attached fasteners / '+material.name,merged,material,[0,0,0],[0,0,0],{solid:false});}
 landmarks.push({id:'foreground service shear wall',position:[-3.7,1.6,4.14],purpose:'near cropped thickness reference'},{id:'phase service tower 07',position:[5.38,2.3,-4.2],purpose:'offset medium-distance work-zone landmark'},{id:'pressure lock',position:[0,1.7,-11.1],purpose:'far nested-frame depth reference'});
 root.updateMatrixWorld(true);
 function inspection(){let meshes=0,triangles=0;root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return {art:'industrial-r10',mode,meshes,triangles,collisionBoxes:collisionBoxes.length,activeCollisionBoxes:collisionBoxes.length,receiverCount:receivers.length,landmarks,propsPlacement:[],whiteOpenings:[{id:'central suspension bay',min:[-3.30,-.8,-8.8],max:[3.30,3.9,5]},{id:'pressure lock aperture',center:[0,1.5,-11.2],size:[7.9,3.1]},{id:'open roof',description:'no roof plate or sky dome'}],composition:'cropped port shear wall / single long gallery / offset starboard service tower / nested pressure lock',manufacturing:'graphite load structure, slate and bone coatings, machined flanges, bounded safety orange, rubber gaskets; one equipment system',hiddenFloor:false};}
 function setDisplayMode(value='transparent'){if(!['transparent','desktop'].includes(value))throw new RangeError('Unknown output mode '+value);mode=value;return {mode,collisionBoxes:collisionBoxes.length};}
 function dispose(){if(disposed)return;disposed=true;for(const g of geometry)g.dispose();for(const mat of ownMaterials)mat.dispose();for(const t of textures)t.dispose();root.clear();}
 return {root,collisionBoxes,get activeCollisionBoxes(){return collisionBoxes;},inspection,update(){},setDisplayMode,dispose};
}
