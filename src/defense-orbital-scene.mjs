import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Original orbital relay architecture. There are no dependencies on the
// earlier station layouts, no background photograph and no invisible floor.
// Empty apertures are actual empty space. Every shadow receiver below is an
// intentionally visible, bounded piece of the ship or its service equipment.
const TAU=Math.PI*2,Y=new T.Vector3(0,1,0);
const bevelBox=(w,h,d,r=.025)=>new RoundedBoxGeometry(w,h,d,3,Math.min(r,w/3,h/3,d/3));

export function createOrbitalScene({materials={}}={}){
 const root=new T.Group();root.name='ORBITAL / open phase-relay defense';
 const near=new T.Group(),service=new T.Group(),relay=new T.Group(),hardware=new T.Group();
 near.name='forward cutaway hull';service.name='starboard service nacelle';relay.name='broken elliptical relay';hardware.name='functional small hardware';root.add(near,service,relay,hardware);
 const ownedMaterials=new Set(),ownedTextures=new Set(),collisionBoxes=[],landmarks=[],receivers=[],smallParts=new Map(),motion=[];let displayMode='transparent',disposed=false;
 const make=(color,metalness,roughness,extra={})=>{const m=new T.MeshStandardMaterial({color,metalness,roughness,...extra});ownedMaterials.add(m);return m;};
 const use=(key,fallback)=>materials[key]||fallback();
 const mat={
  shell:use('shell',()=>make('#e4e8e3',.17,.49)),
  alloy:use('alloy',()=>make('#a1b1b1',.79,.34)),
  graphite:use('graphite',()=>make('#364d51',.35,.72)),
  copper:use('copper',()=>make('#c3ad85',.75,.37)),
  signal:use('signal',()=>make('#a5dbd6',.22,.30,{emissive:'#81c5c2',emissiveIntensity:.34})),
  opticalWhite:use('opticalWhite',()=>{const m=new T.MeshBasicMaterial({color:'#ffffff',toneMapped:false});ownedMaterials.add(m);return m;})
 };
 const scratch=new T.Object3D(),V=new T.Vector3(),N=new T.Vector3();
 function meterUV(g,matrix=new T.Matrix4()){
  const pos=g.attributes.position,norm=g.attributes.normal;if(!pos||!norm)return;const uv=new Float32Array(pos.count*2),nm=new T.Matrix3().getNormalMatrix(matrix);
  for(let i=0;i<pos.count;i++){V.fromBufferAttribute(pos,i).applyMatrix4(matrix);N.fromBufferAttribute(norm,i).applyNormalMatrix(nm);const x=Math.abs(N.x),y=Math.abs(N.y),z=Math.abs(N.z);if(y>=x&&y>=z){uv[2*i]=V.x;uv[2*i+1]=V.z;}else if(x>=z){uv[2*i]=V.z;uv[2*i+1]=V.y;}else{uv[2*i]=V.x;uv[2*i+1]=V.y;}}
  g.setAttribute('uv',new T.BufferAttribute(uv,2));
 }
 function add(name,g,m,p=[0,0,0],rotation=[0,0,0],parent=near){
  const o=new T.Mesh(g,m);o.name=name;o.position.set(...p);o.rotation.set(...rotation);o.castShadow=!m?.isMeshBasicMaterial;o.receiveShadow=!m?.isMeshBasicMaterial;parent.add(o);o.updateWorldMatrix(true,false);if(!(Array.isArray(m)?m:[m]).some(material=>material?.isMeshBasicMaterial&&material.map))meterUV(g,o.matrixWorld);return o;
 }
 function record(id,box,objectName=id){const row={id,name:id,min:box.min.toArray(),max:box.max.toArray(),objectName};collisionBoxes.push(row);return row;}
 function boxOf(o){o.updateWorldMatrix(true,true);return new T.Box3().setFromObject(o);}
 function solid(name,g,m,p=[0,0,0],r=[0,0,0],parent=near){const o=add(name,g,m,p,r,parent);record(name,boxOf(o),o.name);return o;}
 function box(name,size,p,m=mat.shell,{r=[0,0,0],parent=near,collision=true,bevel=.025}={}){return collision?solid(name,bevelBox(...size,bevel),m,p,r,parent):add(name,bevelBox(...size,bevel),m,p,r,parent);}
 function minor(g,m,p=[0,0,0],r=[0,0,0]){
  scratch.position.set(...p);scratch.rotation.set(...r);scratch.scale.set(1,1,1);scratch.updateMatrix();g.applyMatrix4(scratch.matrix);g.computeBoundingBox();record(`small hardware/${collisionBoxes.length}`,g.boundingBox,'small machined hardware batch');meterUV(g);if(g.index){const old=g;g=g.toNonIndexed();old.dispose();}if(!smallParts.has(m))smallParts.set(m,[]);smallParts.get(m).push(g);
 }
 function fastener(p,r=[Math.PI/2,0,0],scale=1){minor(new T.CylinderGeometry(.022*scale,.022*scale,.012*scale,6),mat.alloy,p,r);minor(new T.CylinderGeometry(.010*scale,.010*scale,.014*scale,6),mat.graphite,p,r);}
 function cylinderBetween(name,a,b,radius,m=mat.alloy,{parent=service,collision=true}={}){
  const from=new T.Vector3(...a),to=new T.Vector3(...b),v=to.clone().sub(from),g=new T.CylinderGeometry(radius,radius,v.length(),24);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(Y,v.clone().normalize()));g.translate(...from.add(to).multiplyScalar(.5).toArray());return collision?solid(name,g,m,[0,0,0],[0,0,0],parent):add(name,g,m,[0,0,0],[0,0,0],parent);
 }
 function tube(name,points,radius,m=mat.graphite,parent=service,{collision=true}={}){
  const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),o=add(name,new T.TubeGeometry(curve,Math.max(16,points.length*9),radius,8,false),m,[0,0,0],[0,0,0],parent);
  if(collision)for(let i=0;i<points.length*4;i++){const a=curve.getPoint(i/(points.length*4)),b=curve.getPoint((i+1)/(points.length*4)),bb=new T.Box3().setFromPoints([a,b]).expandByScalar(radius);record(`${name}/${i}`,bb,o.name);}return o;
 }
 function shapeMesh(name,shape,depth,p,{rotation=[0,0,0],parent=near,front=mat.shell,side=mat.alloy,bevel=.035,collision=true,moving=false}={}){
  const g=new T.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel*.65,bevelSegments:3,curveSegments:48});g.translate(0,0,-depth/2);const mesh=add(name,g,[front,side],p,rotation,parent);
  if(collision){
   // Slice every change in the authored outline, then keep disjoint filled
   // spans separate. Holes and the open sky beneath a cantilever are never
   // replaced by the enclosing box of the complete assembly.
   const outlines=[shape.getPoints(48),...shape.holes.map(h=>h.getPoints(48))],heights=[...new Set(outlines.flat().map(v=>v.y))].sort((a,b)=>a-b);
   const intervals=y=>{const xs=[];for(const line of outlines)for(let i=0;i<line.length;i++){const a=line[i],b=line[(i+1)%line.length];if((a.y<=y&&b.y>y)||(b.y<=y&&a.y>y))xs.push(a.x+(y-a.y)/(b.y-a.y)*(b.x-a.x));}xs.sort((a,b)=>a-b);const result=[];for(let i=0;i+1<xs.length;i+=2)if(xs[i+1]-xs[i]>1e-7)result.push([xs[i],xs[i+1]]);return result;};
   mesh.updateWorldMatrix(true,false);let serial=0;
   for(let row=0;row+1<heights.length;row++){const h=heights[row+1]-heights[row];if(h<1e-7)continue;const n=Math.max(1,Math.ceil(h/.025));for(let j=0;j<n;j++){const low=heights[row]+h*j/n,high=heights[row]+h*(j+1)/n,eps=Math.min(.00001,h/n*.001),samples=[intervals(low+eps),intervals((low+high)/2),intervals(high-eps)],count=Math.max(...samples.map(s=>s.length));for(let k=0;k<count;k++){const spans=samples.map(s=>s[k]).filter(Boolean);if(!spans.length)continue;const x0=Math.min(...spans.map(s=>s[0]))-bevel,x1=Math.max(...spans.map(s=>s[1]))+bevel,local=new T.Box3(new T.Vector3(x0,low-bevel,-depth/2-bevel*.65),new T.Vector3(x1,high+bevel,depth/2+bevel*.65)),row=record(`${name}/${serial++}`,local.clone().applyMatrix4(mesh.matrixWorld),mesh.name);if(moving)motion.push({type:'collider',object:mesh,local,row});}}}
  }
  return mesh;
 }
 function torusCollision(mesh,major,minor){
  mesh.updateWorldMatrix(true,false);for(let i=0;i<40;i++){const points=[];for(let j=0;j<=2;j++){const a=(i+j/2)/40*TAU;for(const r of [major-minor,major+minor])for(const z of [-minor,minor])points.push(new T.Vector3(Math.cos(a)*r,Math.sin(a)*r,z).applyMatrix4(mesh.matrixWorld));}record(`${mesh.name}/${i}`,new T.Box3().setFromPoints(points),mesh.name);}
 }
 function polygon(points){const s=new T.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;}
 function caption(text,p,size,parent=service){
  if(typeof document==='undefined')return null;const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;const c=canvas.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,768,192);c.fillStyle='#4c6468';c.font='600 74px sans-serif';c.textBaseline='middle';c.fillText(text,18,100,730);const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;ownedTextures.add(map);const m=new T.MeshBasicMaterial({map,toneMapped:false});ownedMaterials.add(m);const o=add(`identifier ${text}`,new T.PlaneGeometry(...size),m,p,[0,0,0],parent);o.castShadow=false;return o;
 }
 function serviceConnector(id,p,parent){
  const o=box(id,[.24,.28,.060],p,mat.alloy,{parent,bevel:.025});box(`${id} ceramic insert`,[.16,.18,.018],[p[0],p[1]+.013,p[2]+.040],mat.shell,{parent,collision:false,bevel:.018});box(`${id} latch`,[.105,.027,.025],[p[0],p[1]-.087,p[2]+.055],mat.graphite,{parent,collision:false,bevel:.006});for(const dx of [-.084,.084])for(const dy of [-.105,.105])fastener([p[0]+dx,p[1]+dy,p[2]+.035],[Math.PI/2,0,0],.42);const b=boxOf(o);landmarks.push({id,position:p.slice(),size:[.24,.28,.060],bounds:{min:b.min.toArray(),max:b.max.toArray()},meshUUID:o.uuid});return o;
 }

 // The near hull has one bold, continuously swept silhouette. Its leaning
 // cutaway section crops at the left edge, then cantilevers over the viewer.
 const hull=new T.Shape();hull.moveTo(-3.16,-.20);hull.lineTo(-2.63,-.20);hull.lineTo(-2.63,1.40);hull.bezierCurveTo(-2.63,2.30,-2.46,2.83,-1.94,3.22);hull.lineTo(-.40,4.17);hull.lineTo(.24,4.20);hull.lineTo(.24,4.56);hull.lineTo(-.55,4.56);hull.lineTo(-2.29,3.58);hull.bezierCurveTo(-2.99,3.10,-3.16,2.47,-3.16,1.45);hull.closePath();
 shapeMesh('forward swept hull rib',hull,.66,[0,0,4.20],{bevel:.045});
 // Segmented ceramic cladding follows the same load-bearing curve; the
 // two narrow gasket runs describe thickness without tracing a full frame.
 tube('hull inner seal',[[-2.635,.24,4.545],[-2.635,1.48,4.545],[-2.45,2.66,4.545],[-1.85,3.23,4.545],[-.31,4.205,4.545]],.015,mat.graphite,near);
 tube('hull outer recessed seam',[[-3.10,.20,4.541],[-3.08,1.52,4.541],[-2.90,2.77,4.541],[-2.26,3.46,4.541],[-.53,4.48,4.541]],.009,mat.copper,near);
 box('hull structural splice',[.55,.20,.13],[-2.89,1.27,4.54],mat.alloy,{parent:near,bevel:.035});
 for(const dx of [-.18,.18])for(const dy of [-.055,.055])fastener([-2.89+dx,1.27+dy,4.616],[Math.PI/2,0,0],.6);
 serviceConnector('standard service plug / forward',[-2.76,1.77,4.582],near);
 // A visible, sharply clipped side deck supports the hull. It is the only
 // near receiver: shadows cannot appear across the otherwise empty white.
 const deckShape=polygon([[-3.36,2.15],[-2.82,1.62],[-2.27,2.12],[-2.27,4.66],[-3.03,5.20],[-3.50,4.79]]);
 const deck=shapeMesh('forward port service deck',deckShape,.14,[0,.17,0],{rotation:[Math.PI/2,0,0],front:mat.shell,side:mat.alloy,bevel:.025});
 receivers.push({id:deck.name,meshUUID:deck.uuid,bounds:boxOf(deck)});
 box('deck upper maintenance pad',[.54,.035,.80],[-2.83,.275,3.95],mat.graphite,{parent:near,bevel:.035});
 for(let i=0;i<4;i++)box(`deck inset grip ${i}`,[.36,.008,.026],[-2.83,.298,3.70+i*.16],mat.alloy,{parent:near,collision:false,bevel:.005});
 // A low, broad docking nose cuts into the foreground, rather than another
 // repeated column. Its service socket faces the core and explains its use.
 const nose=polygon([[-3.25,.28],[-2.84,.28],[-2.44,.65],[-2.44,.93],[-2.82,1.02],[-3.25,.82]]);
 shapeMesh('forward equipment docking nose',nose,.52,[0,-.024,3.20],{bevel:.045});
 box('dock interface face',[.30,.32,.07],[-2.46,.76,3.20],mat.alloy,{r:[0,Math.PI/2,0],parent:near,bevel:.035});
 for(let i=0;i<3;i++)minor(bevelBox(.028,.095,.038,.007),mat.graphite,[-2.41,.76,3.10+i*.10]);
 tube('dock power return',[[-2.87,.45,3.47],[-2.97,.35,3.62],[-2.98,.33,4.0],[-2.90,.39,4.34]],.029,mat.graphite,near,{collision:true});
 caption('PORT / 07',[-2.87,1.01,3.478],[.49,.12],near);

 // The right service nacelle is a genuinely hollow, asymmetric capsule,
 // with its payload and piping visible through the large maintenance cut.
 const podX=5.25,podZ=1.55;
 const pod=new T.Shape();pod.moveTo(-.60,.08);pod.lineTo(.54,.08);pod.quadraticCurveTo(.86,.10,.86,.43);pod.lineTo(.86,1.93);pod.bezierCurveTo(.86,2.34,.69,2.55,.36,2.68);pod.lineTo(-.52,2.44);pod.bezierCurveTo(-.89,2.34,-.94,2.14,-.94,1.91);pod.lineTo(-.94,.36);pod.quadraticCurveTo(-.94,.08,-.60,.08);
 const window=new T.Path();window.moveTo(-.60,.79);window.quadraticCurveTo(-.65,.67,-.49,.67);window.lineTo(.41,.67);window.quadraticCurveTo(.57,.67,.57,.84);window.lineTo(.57,1.88);window.quadraticCurveTo(.57,2.04,.40,2.04);window.lineTo(-.48,1.92);window.quadraticCurveTo(-.65,1.88,-.65,1.70);window.closePath();pod.holes.push(window);
 shapeMesh('starboard hollow service nacelle',pod,.82,[podX,0,podZ],{parent:service,bevel:.055});
 // An inner seal tracks the real aperture; there is no dark panel filling it.
 tube('nacelle aperture seal',[[podX-.59,.85,podZ+.435],[podX-.59,1.69,podZ+.435],[podX-.42,1.87,podZ+.435],[podX+.39,1.98,podZ+.435],[podX+.52,1.84,podZ+.435],[podX+.52,.83,podZ+.435],[podX+.35,.72,podZ+.435],[podX-.42,.72,podZ+.435],[podX-.59,.85,podZ+.435]],.013,mat.graphite,service);
 serviceConnector('standard service plug / nacelle',[podX-.78,1.44,podZ+.454],service);
 // The tilted roof has real cladding and a restrained navigation strip.
 box('nacelle roof insert',[.62,.055,.50],[podX-.03,2.53,podZ],mat.alloy,{r:[0,0,.25],parent:service,bevel:.025});
 box('nacelle roof signal',[.36,.018,.038],[podX-.03,2.574,podZ+.17],mat.signal,{r:[0,0,.25],parent:service,collision:false,bevel:.006});
 const tray=box('nacelle inner equipment tray',[1.02,.07,.69],[podX-.04,.71,podZ],mat.alloy,{parent:service,bevel:.035});receivers.push({id:tray.name,meshUUID:tray.uuid,bounds:boxOf(tray)});
 // A machined compressor assembly: a spun pressure body, separate collars,
 // its central seam, bolted cradle, inlet/outlet and a protected fan.
 const compressorProfile=[new T.Vector2(0,-.30),new T.Vector2(.13,-.30),new T.Vector2(.19,-.24),new T.Vector2(.215,-.16),new T.Vector2(.215,.20),new T.Vector2(.18,.27),new T.Vector2(.12,.31),new T.Vector2(0,.31)];
 solid('nacelle compressor vessel',new T.LatheGeometry(compressorProfile,32),mat.shell,[podX-.12,1.08,podZ+.02],[0,0,0],service);
 for(const dx of [-.075,.075])box(`compressor cradle foot ${dx}`,[.075,.055,.18],[podX-.12+dx,.763,podZ+.02],mat.alloy,{parent:service,bevel:.012});
 for(const y of [.86,1.23]){
  const ring=add(`compressor split clamp ${y}`,new T.TorusGeometry(.219,.022,7,40),mat.alloy,[podX-.12,y,podZ+.02],[Math.PI/2,0,0],service);
  torusCollision(ring,.219,.022);box(`compressor clamp ear ${y}`,[.11,.075,.075],[podX-.12,y,podZ+.252],mat.copper,{parent:service,bevel:.010});fastener([podX-.12,y,podZ+.296],[Math.PI/2,0,0],.65);
 }
 cylinderBetween('compressor inlet',[podX-.12,1.37,podZ+.02],[podX-.12,1.63,podZ+.02],.048,mat.alloy);
 tube('compressor high pressure elbow',[[podX-.12,1.62,podZ+.02],[podX-.12,1.78,podZ+.02],[podX+.12,1.85,podZ+.02],[podX+.41,1.85,podZ+.02]],.044,mat.copper,service,{collision:true});
 tube('compressor flexible return',[[podX-.12,.87,podZ+.25],[podX-.31,.82,podZ+.30],[podX-.42,.94,podZ+.31],[podX-.43,1.62,podZ+.29],[podX-.38,1.77,podZ+.24]],.025,mat.graphite,service,{collision:true});
 for(const y of [1.03,1.45]){box(`return hose saddle ${y}`,[.12,.045,.11],[podX-.43,y,podZ+.24],mat.alloy,{parent:service,bevel:.009});fastener([podX-.43,y,podZ+.304],[Math.PI/2,0,0],.45);}
 // Fan is mounted horizontally in the capsule, facing into the open bay.
 solid('nacelle fan motor',new T.CylinderGeometry(.11,.11,.14,24),mat.graphite,[podX+.37,1.20,podZ+.12],[Math.PI/2,0,0],service);
 const fanShroud=add('nacelle fan containment rim',new T.TorusGeometry(.24,.042,9,40),mat.alloy,[podX+.37,1.20,podZ+.20],[0,0,0],service);
 // Ring AABBs follow sectors, leaving its central grille hole actually open.
 for(let i=0;i<18;i++){const a=i/18*TAU,b=(i+1)/18*TAU,pts=[a,(a+b)/2,b].flatMap(t=>[new T.Vector3(podX+.37+Math.cos(t)*.282,1.20+Math.sin(t)*.282,podZ+.15),new T.Vector3(podX+.37+Math.cos(t)*.198,1.20+Math.sin(t)*.198,podZ+.25)]);record(`fan rim/${i}`,new T.Box3().setFromPoints(pts),fanShroud.name);}
 const fan=new T.Group();fan.name='nacelle enclosed fan rotor';fan.position.set(podX+.37,1.20,podZ+.215);service.add(fan);
 for(let i=0;i<5;i++){const a=i/5*TAU,s=polygon([[.04,-.025],[.19,-.065],[.22,-.025],[.12,.045],[.04,.025]]);shapeMesh(`fan blade ${i}`,s,.012,[0,0,.006],{rotation:[0,0,a],parent:fan,front:mat.graphite,side:mat.graphite,bevel:.001,moving:true});}
 const cap=add('fan spindle cap',new T.CylinderGeometry(.052,.052,.045,20),mat.copper,[0,0,.025],[Math.PI/2,0,0],fan);record(cap.name,boxOf(cap),cap.name);
 for(const y of [-.12,0,.12])cylinderBetween(`fan safety bar ${y}`,[podX+.37-Math.sqrt(.20**2-y*y),1.20+y,podZ+.268],[podX+.37+Math.sqrt(.20**2-y*y),1.20+y,podZ+.268],.008,mat.alloy);
 motion.push({type:'fan',object:fan});
 // The capsule cantilevers from its own swept dorsal spar. The inner end is
 // a real service rail above the shooting band, not another full portal.
 const spar=new T.Shape();spar.moveTo(3.20,2.68);spar.lineTo(3.55,2.60);spar.quadraticCurveTo(4.22,2.53,4.76,2.17);spar.lineTo(4.97,2.36);spar.quadraticCurveTo(4.30,2.96,3.59,3.02);spar.lineTo(3.20,2.98);spar.closePath();shapeMesh('nacelle curved dorsal spar',spar,.37,[0,0,podZ-.08],{parent:service,bevel:.035});
 box('dorsal rail end coupling',[.26,.33,.45],[3.22,2.82,podZ-.08],mat.alloy,{parent:service,bevel:.045});
 tube('dorsal spar power harness',[[3.24,2.95,podZ+.13],[3.72,2.97,podZ+.13],[4.37,2.72,podZ+.13],[4.82,2.45,podZ+.13]],.018,mat.graphite,service);
 caption('COOLANT / C-07',[podX+.02,.38,podZ+.446],[.70,.15]);
 box('nacelle status recess',[.42,.13,.035],[podX+.02,.54,podZ+.455],mat.graphite,{parent:service,bevel:.025});
 for(let i=0;i<3;i++)box(`nacelle status cell ${i}`,[.065,.026,.014],[podX-.10+i*.10,.54,podZ+.482],mat.signal,{parent:service,collision:false,bevel:.006});

 // A thick, broken ellipse stands behind every spawn. Its engineering
 // section is continuous around the curve, and each collision sector follows
 // that section. The whole ellipse's bounding rectangle is never solid.
 const rx=5.35,ry=3.25,cy=2.45,ringZ=-8.05;
 function pointAt(a,offset=0,z=ringZ){const normal=new T.Vector3(ry*Math.cos(a),rx*Math.sin(a),0).normalize();return new T.Vector3(rx*Math.cos(a),cy+ry*Math.sin(a),z).addScaledVector(normal,offset);}
 function ringArc(name,a0,a1){
  const section=[[-.17,-.31],[.17,-.31],[.22,-.26],[.22,.26],[.17,.31],[-.17,.31],[-.22,.26],[-.22,-.26]],n=Math.max(2,Math.ceil((a1-a0)/.045)),pos=[],uv=[],indices=[],groups=[];let distance=0,last=null;
  for(let i=0;i<=n;i++){const a=a0+(a1-a0)*i/n,c=pointAt(a),normal=new T.Vector3(ry*Math.cos(a),rx*Math.sin(a),0).normalize();if(last)distance+=c.distanceTo(last);last=c;for(let j=0;j<section.length;j++){const[r,z]=section[j],p=c.clone().addScaledVector(normal,r);p.z+=z;pos.push(p.x,p.y,p.z);uv.push(distance,j*.13);}}
  for(let i=0;i<n;i++)for(let j=0;j<8;j++){const k=(j+1)%8,a=i*8+j,b=i*8+k,c=(i+1)*8+k,d=(i+1)*8+j,start=indices.length;indices.push(a,d,b,b,d,c);groups.push({start,count:6,materialIndex:[1,3,5,6,7].includes(j)?1:0});}
  // Independent end-cap vertices keep the machined edge normals crisp.
  for(const edge of [0,n]){const center=pointAt(edge===0?a0:a1),base=pos.length/3;pos.push(center.x,center.y,center.z);uv.push(0,0);for(let j=0;j<8;j++){const index=edge*8+j;pos.push(pos[index*3],pos[index*3+1],pos[index*3+2]);uv.push(section[j][0],section[j][1]);}const start=indices.length;for(let j=0;j<8;j++)indices.push(base,base+1+(edge===0?j:(j+1)%8),base+1+(edge===0?(j+1)%8:j));groups.push({start,count:24,materialIndex:1});}
  const ordered=[],counts=[];for(const materialIndex of [0,1]){const start=ordered.length;for(const row of groups)if(row.materialIndex===materialIndex)for(let i=row.start;i<row.start+row.count;i++)ordered.push(indices[i]);counts.push(ordered.length-start);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ordered);g.computeVertexNormals();g.addGroup(0,counts[0],0);g.addGroup(counts[0],counts[1],1);const mesh=add(name,g,[mat.shell,mat.alloy],[0,0,0],[0,0,0],relay);
  // add() generates world metre UVs for the supplied material family.
  for(let i=0;i<n;i++){const pts=[];for(let k=i*8;k<=(i+1)*8+7;k++)pts.push(new T.Vector3(pos[k*3],pos[k*3+1],pos[k*3+2]));record(`${name}/${i}`,new T.Box3().setFromPoints(pts).expandByScalar(.012),mesh.name);}
  const copperPoints=[];for(let i=0;i<=48;i++){const a=a0+(a1-a0)*i/48;copperPoints.push(pointAt(a,-.09,ringZ+.325).toArray());}tube(`${name} inset bus`,copperPoints,.011,mat.copper,relay);
  for(const[a,label]of[[a0,'start'],[a1,'end']]){
   const p=pointAt(a),normal=new T.Vector3(ry*Math.cos(a),rx*Math.sin(a),0).normalize(),tangent=new T.Vector3(-rx*Math.sin(a),ry*Math.cos(a),0).normalize();
   // End connector is bolted to the actual section, making the missing
   // sectors look intentionally modular rather than unfinished modelling.
   const cap=new T.Group();cap.name=`${name} / ${label} coupling`;cap.position.copy(p).addScaledVector(tangent,label==='start'?-.025:.025);cap.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),tangent);relay.add(cap);
   const o=add(`${name} ${label} terminal`,bevelBox(.32,.09,.49,.025),mat.graphite,[0,0,0],[0,0,0],cap);record(o.name,boxOf(o),o.name);
   for(const x of [-.105,.105])for(const z of [-.18,.18])add('relay end bolt',new T.CylinderGeometry(.022,.022,.025,6),mat.alloy,[x,label==='start'?-.055:.055,z],[0,0,0],cap);
   const pin=add('relay exposed contact',bevelBox(.11,.025,.19,.012),mat.copper,[0,label==='start'?-.06:.06,0],[0,0,0],cap);pin.castShadow=false;
  }
  return mesh;
 }
 ringArc('upper relay crescent',Math.PI*.10,Math.PI*.96);
 ringArc('port detached relay segment',Math.PI*1.075,Math.PI*1.285);
 ringArc('starboard detached relay segment',Math.PI*1.70,Math.PI*1.875);
 serviceConnector('standard service plug / relay',[-4.60,4.02,ringZ+.37],relay);
 // A sensor gimbal belongs on the broken ring. A curved hood and a lens
 // assembly give the distant silhouette a particular, legible purpose.
 const sensorP=pointAt(Math.PI*.33,.25,ringZ+.07);
 solid('relay sensor gimbal mount',new T.CylinderGeometry(.10,.10,.31,20),mat.alloy,sensorP.toArray(),[0,0,Math.PI/2],relay);
 const sensor=solid('relay directional sensor',new T.CylinderGeometry(.16,.22,.33,28),mat.shell,[sensorP.x,sensorP.y+.08,sensorP.z+.20],[Math.PI/2,0,0],relay);
 add('sensor smoked optical face',new T.CircleGeometry(.133,28),mat.graphite,[sensorP.x,sensorP.y+.08,sensorP.z+.377],[0,0,0],relay);
 add('sensor narrow aperture',new T.TorusGeometry(.10,.009,6,32),mat.signal,[sensorP.x,sensorP.y+.08,sensorP.z+.382],[0,0,0],relay);

 // A few directional registration marks are engraved into visible solids,
 // never laid across an imaginary floor or animated as a flat overlay.
 for(let i=0;i<3;i++)minor(bevelBox(.065,.012,.20,.004),mat.copper,[-2.45,.283,4.0+i*.25],[0,0,0]);
 for(const[m,parts]of smallParts){const g=mergeGeometries(parts,false);for(const p of parts)p.dispose();add('small machined hardware batch',g,m,[0,0,0],[0,0,0],hardware);}smallParts.clear();
 function update(time=0){if(disposed)return;for(const row of motion)if(row.type==='fan')row.object.rotation.z=-time*.76;root.updateWorldMatrix(true,true);for(const row of motion)if(row.type==='collider'){const b=row.local.clone().applyMatrix4(row.object.matrixWorld);row.row.min.splice(0,3,...b.min.toArray());row.row.max.splice(0,3,...b.max.toArray());}}
 function setDisplayMode(mode='transparent'){if(!['transparent','desktop'].includes(mode))throw new RangeError(`Unknown orbital display mode: ${mode}`);displayMode=mode;return {mode,collisionBoxes};}
 function inspection(){
  root.updateWorldMatrix(true,true);let meshes=0,triangles=0;root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
  return {name:root.name,source:'Original new orbital relay geometry; no reused station layout',displayMode,meshes,triangles,collisionBoxes:collisionBoxes.length,landmarks:landmarks.map(row=>({...row,bounds:{min:row.bounds.min.slice(),max:row.bounds.max.slice()}})),receivers:receivers.map(row=>({id:row.id,meshUUID:row.meshUUID,bounds:{min:row.bounds.min.toArray(),max:row.bounds.max.toArray()}})),apertures:{maintenanceWindow:true,relayCenter:true,relayBreaks:true,invisibleFloorReceiver:false},materialKeys:Object.keys(mat),bounds:boxOf(root).min.toArray().concat(boxOf(root).max.toArray())};
 }
 function dispose(){if(disposed)return;disposed=true;const geometries=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});for(const g of geometries)g.dispose();for(const m of ownedMaterials)m.dispose();for(const t of ownedTextures)t.dispose();root.clear();}
 return {root,collisionBoxes,update,dispose,inspection,setDisplayMode,get activeCollisionBoxes(){return collisionBoxes;},get displayMode(){return displayMode;}};
}
