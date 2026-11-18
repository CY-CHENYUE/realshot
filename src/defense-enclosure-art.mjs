import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ENCLOSURE} from './enclosure-profile.mjs';

// Authored in the enclosure's source millimetres: X across, Y into the box,
// Z up. The caller alone owns CAD-to-camera projection and world collision.
export function createEnclosureArt({materials={},depthCues=false}={}){
 const root=new T.Group();root.name='CAD / asymmetric side maintenance equipment';
 const localSolids=[],batches=new Map(),geometries=new Set(),ownedMaterials=new Set(),assemblies=[];
 let disposed=false,serial=0;
 const mat=(key,color,metalness,roughness)=>materials[key]??(()=>{const m=new T.MeshStandardMaterial({name:'EnclosureArt_'+key,color,metalness,roughness});ownedMaterials.add(m);return m;})();
 const m={ceiling:materials.ceiling??materials.shell??mat('ceiling','#bdc6c0',.04,.75),shell:mat('shell','#a8afa5',.1,.64),slate:mat('slate','#6c8185',.13,.59),alloy:mat('alloy','#718185',.91,.46),graphite:mat('graphite','#3f505b',.18,.58),rubber:mat('rubber','#182326',0,.87),copper:mat('copper','#97744b',.77,.43),caution:mat('caution','#b09b67',.06,.65),glass:mat('glass','#22434a',.45,.20),signal:mat('signal','#a2b6b0',.2,.32),deck:mat('deck','#77827c',.52,.72)};
 function metricUV(g){
  const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  if(!uv)return;
  for(let i=0;i<p.count;i++){
   const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
   if(nx>=ny&&nx>=nz)uv.setXY(i,p.getY(i)*.001,p.getZ(i)*.001);
   else if(ny>=nz)uv.setXY(i,p.getX(i)*.001,p.getZ(i)*.001);
   else uv.setXY(i,p.getX(i)*.001,p.getY(i)*.001);
  }
 }
 function add(id,g,material,{collision=true}={}){
  metricUV(g);g.computeBoundingBox();
  if(collision)localSolids.push({id,min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()});
  const key=material.uuid;if(!batches.has(key))batches.set(key,{material,parts:[]});
  // All batches use the same nonindexed attributes; each physical part keeps
  // its own finite proxy, never the bounding box of a disconnected assembly.
  const non=g.index?g.toNonIndexed():g;if(non!==g)g.dispose();batches.get(key).parts.push(non);return non;
 }
 function box(id,size,center,material,bevel=0){
  const g=bevel?new RoundedBoxGeometry(...size,1,Math.min(bevel,...size.map(v=>v*.22))):new T.BoxGeometry(...size);
  g.translate(...center);return add(id,g,material);
 }
 function rod(id,a,b,radius,material,segments=10){
  const start=new T.Vector3(...a),end=new T.Vector3(...b),d=end.clone().sub(start);
  const g=new T.CylinderGeometry(radius,radius,d.length(),segments,1,false);
  g.applyMatrix4(new T.Matrix4().compose(start.add(end).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()),new T.Vector3(1,1,1)));
  return add(id,g,material);
 }
 function cable(id,points,radius,material){
  const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),false,'centripetal'),steps=Math.max(8,Math.ceil(curve.getLength()/3));
  const g=new T.TubeGeometry(curve,steps,radius,6,false);add(id,g,material,{collision:false});
  const samples=curve.getPoints(steps);
  for(let i=0;i<samples.length-1;i++){const a=samples[i],b=samples[i+1];localSolids.push({id:`${id} / sleeve ${i}`,min:[Math.min(a.x,b.x)-radius,Math.min(a.y,b.y)-radius,Math.min(a.z,b.z)-radius],max:[Math.max(a.x,b.x)+radius,Math.max(a.y,b.y)+radius,Math.max(a.z,b.z)+radius]});}
 }
 function bolt(id,x,y,z,r=.58){rod(id,[x,y-.32,z],[x,y+.32,z],r,m.alloy,6);box(id+' slot',[r*.95,.12,.16],[x,y-.36,z],m.graphite);}
 function frontPanel(id,x,y,z,w,h){
  box(id+' gasket',[w+.8,.6,h+.8],[x,y+.35,z],m.rubber,.12);
  box(id+' folded skin',[w,.64,h],[x,y,z],m.shell,.22);
  for(const sx of[-1,1])for(const sz of[-1,1])bolt(id+` screw ${sx}/${sz}`,x+sx*(w/2-1),y-.53,z+sz*(h/2-1),.44);
 }
 function louvres(id,x,y,z,w,h,count){
  box(id+' recessed throat',[w+1,.75,h+1],[x,y+.2,z],m.graphite,.2);
  const spacing=h/count;
  for(let i=0;i<count;i++){
   const a=z-h/2+spacing*(i+.5),g=new T.BoxGeometry(w,.72,.68);
   g.rotateX(-.25);g.translate(x,y-.3,a);add(id+` pressed vane ${i}`,g,m.alloy);
  }
 }
 function digits(id,text,x,y,z,scale=1){
  const segments={0:[0,1,2,3,4,5],1:[1,2],2:[0,1,6,4,3],3:[0,1,2,3,6],4:[5,6,1,2],5:[0,5,6,2,3],6:[0,5,4,3,2,6],7:[0,1,2],8:[0,1,2,3,4,5,6],9:[0,1,2,3,5,6]};
  const lines=[[-.72,1.2,.72,1.2],[.82,1.07,.82,.12],[.82,-.12,.82,-1.07],[-.72,-1.2,.72,-1.2],[-.82,-1.07,-.82,-.12],[-.82,.12,-.82,1.07],[-.72,0,.72,0]];
  for(let d=0;d<text.length;d++)for(const s of segments[text[d]]??[]){const[a,b,c,e]=lines[s],cx=x+(d-(text.length-1)/2)*2.5*scale;
   box(id+` digit ${d}/${s}`,[Math.max(.18,Math.abs(c-a))*scale,.13,Math.max(.18,Math.abs(e-b))*scale],[cx+(a+c)*scale/2,y,z+(b+e)*scale/2],m.graphite);
  }
 }
 const ceilingPath=ENCLOSURE.cavity.paths.find(p=>p.name==='left-ceiling').points;
 function ceilingZ(y){
  for(let i=1;i<ceilingPath.length;i++){const a=ceilingPath[i-1],b=ceilingPath[i];if(a[1]<=y&&b[1]>=y)return T.MathUtils.lerp(a[2],b[2],(y-a[1])/(b[1]-a[1]));}
  throw new RangeError('Ceiling detail extends beyond measured CAD path');
 }
 function ceilingPanel(id,x0,x1,y0,y1,offset,thickness,material){
  const a=ceilingZ(y0)-offset,b=ceilingZ(y1)-offset;
  const positions=[x0,y0,a-thickness,x1,y0,a-thickness,x1,y1,b-thickness,x0,y1,b-thickness,x0,y0,a,x1,y0,a,x1,y1,b,x0,y1,b];
  const source=new T.BufferGeometry();source.setAttribute('position',new T.Float32BufferAttribute(positions,3));source.setIndex([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);
  const g=source.toNonIndexed();source.dispose();g.computeVertexNormals();g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));add(id,g,material);
 }
 // The room is authored as large quiet skins first, equipment second. These
 // are finite side walls, not a room-wide backdrop. Their inside faces sit
 // at the measured cavity sides and leave the central physical prop open.
 for(const side of[-1,1]){
  const label=side<0?'port':'starboard';
  for(const [i,y0,y1]of[[0,-75,-27],[1,-25,20],[2,22,65]]){
   box(`${label} wall / gasket backing ${i}`,[.65,y1-y0,117.5],[side*97.0,(y0+y1)/2,150.75],m.graphite);
   box(`${label} wall / formed skin ${i}`,[.52,y1-y0-1.0,116.0],[side*96.56,(y0+y1)/2,150.75],i===1?m.shell:m.slate,.12);
  }
  box(`${label} wall / continuous skirting`,[1.75,140,7.5],[side*96.1,-5,94.1],m.graphite,.3);
  box(`${label} wall / service waist rail`,[1.9,140,3.5],[side*95.6,-5,182.8],m.alloy,.3);
  box(`${label} wall / inset service trunk`,[.9,138,7.3],[side*95.7,-5,188.3],m.slate,.2);
  for(const y of[-73.9,-26,21,64.1]){
   box(`${label} wall / structural bay rib ${y}`,[1.8,2.1,117.5],[side*95.5,y,150.75],m.graphite,.28);
   box(`${label} wall / rib front cap ${y}`,[.55,2.3,113.0],[side*94.38,y,150.75],m.alloy,.12);
   rod(`${label} wall / upper corner bearing ${y}`,[side*95.4,y,208.1],[side*84.1,y,ceilingZ(y)-3.4],.72,m.alloy,8);
  }
  // A thicker near jamb has a real return along the side wall, rather than
  // another nested centre gate competing with the actual physical object.
  box(`${label} wall / near aperture return`,[2.1,2.7,125.7],[side*95.9,-73.7,155.2],m.shell,.48);
  box(`${label} wall / near jamb shoe`,[3.4,5.0,13.0],[side*95.5,-72,88.2],m.graphite,.4);
  for(const y of[-50,2,46])for(const z of[101,201]){
   rod(`${label} wall / captive wall bolt ${y}/${z}`,[side*96.15,y,z],[side*95.65,y,z],.52,m.alloy,6);
  }
 }
 // Three broad roof skins follow the actual sampled CAD ceiling slope. Their
 // lowest point remains above Z215; no panel crosses the protected Z85..210.
 for(const [i,a,b]of[[0,-75,-38],[1,-36,12],[2,14,64]]){
  ceilingPanel(`overhead / sealed service skin ${i}`,-85.2,85.2,a,b,.55,2.2,m.ceiling);
  for(const side of[-1,1])ceilingPanel(`overhead / edge bearer ${i}/${side}`,side<0?-86.6:82.0,side<0?-82.0:86.6,a,b,2.8,.75,m.alloy);
 }
 // One recessed access hatch and two restrained work strips, connected to
 // the side service trunks. They do not form floating luminous decorations.
 ceilingPanel('overhead / access hatch gasket',-53,4,-28,8,2.85,.75,m.graphite);
 ceilingPanel('overhead / removable access hatch',-51,2,-26,6,3.6,.75,m.shell);
 for(const x of[-50,1])ceilingPanel(`overhead / hatch retained edge ${x}`,x-.5,x+.5,-25,5,4.38,.3,m.alloy);
 for(const y of[-24,4])for(const x of[-47,-2]){
  rod(`overhead / hatch screw ${x}/${y}`,[x,y,ceilingZ(y)-4.35],[x,y,ceilingZ(y)-4.8],.55,m.graphite,6);
 }
 for(const x of[-63,61]){
  ceilingPanel(`overhead / worklight housing ${x}`,x-2.1,x+2.1,-67,52,2.85,1.1,m.graphite);
  ceilingPanel(`overhead / inset worklight lens ${x}`,x-.82,x+.82,-65,50,4.0,.22,m.signal);
 }
 cable('overhead / port cabinet supply',[[-94,-5,172],[-94,-5,199],[-90,-5,216],[-81,-5,ceilingZ(-5)-4.5],[-69,6,ceilingZ(6)-4.5]],.70,m.rubber);
 cable('overhead / starboard control supply',[[94,25,165],[94,25,199],[90,25,214],[80,25,ceilingZ(25)-4.5],[67,33,ceilingZ(33)-4.5]],.62,m.rubber);
 assemblies.push({id:'continuous-side-shell-and-roof',role:'Three quiet finite wall skins per side, supported bay ribs and waist/skirting connections, sampled sloping roof service band with one access hatch',sourceBounds:{x:[-97.4,97.4],y:[-75,65],z:[81.7,230.5]},ceilingSamplesMM:[-75,-38,-36,8,12,14,64].map(y=>({y,z:ceilingZ(y)})),centralSpanOnlyAboveZMM:215});
 // Continuous narrow side ledges sit on the CAD floor (~Z80.4), with a
 // folded outer rail and short supporting shoes. No central floor is added.
 for(const side of[-1,1]){
  const label=side<0?'port':'starboard',x=side*87.6;
  box(`${label} / narrow maintenance deck`,[18.8,132,2.8],[x,-1,81.9],m.deck,.42);
  box(`${label} / outer folded sill`,[1.1,132,4.7],[side*96.4,-1,84.6],m.alloy,.22);
  box(`${label} / inner deck fascia`,[.8,132,2.6],[side*78.6,-1,81.8],m.slate,.15);
  for(const y of[-61,-24,17,57]){
   box(`${label} / floor shoe ${y}`,[16.8,4.0,.6],[x,y,80.7],m.rubber,.12);
   box(`${label} / deck seam ${y}`,[17.2,.23,.20],[x,y,83.43],m.graphite);
  }
 }
 if(depthCues){
  // A visible side route is the depth reference. It joins the existing real
  // ledge but stops outside the central |X|<=55 mm physical-object volume.
  box('port depth / continuous inner service walkway',[20.4,132,2.8],[-68.4,-1,81.9],m.deck,.42);
  box('port depth / visible inner alloy edge',[.65,132,.58],[-58.45,-1,83.56],m.alloy,.12);
  for(const y of[-50,-7,36]){
   box(`port depth / transverse service seam ${y}`,[19.4,.38,.22],[-68.3,y,83.42],m.graphite);
   box(`port depth / near-edge safety marker ${y}`,[2.4,1.8,.12],[-60.8,y+1.5,83.51],m.caution);
  }
 }
 // PORT: floor-supported power distribution cabinet, stepped top service
 // cover, near coupling block, and a raised rear bus with continuous cables.
 box('port power / load-bearing back spine',[2.0,104,83],[-95.5,8,124.9],m.graphite,.30);
 box('port power / main formed cabinet',[15.4,45,76],[-87.0,-12.5,121.6],m.slate,.74);
 box('port power / recessed base plinth',[16.5,48,5.8],[-87.0,-12.5,86.4],m.graphite,.5);
 box('port power / plinth isolator',[15.8,46,.6],[-87,-12.5,83.5],m.rubber,.1);
 frontPanel('port power / removable distribution front',-87.0,-35.4,122.8,12.7,57.8);
 box('port power / top folded lid',[16.3,47.0,2.0],[-87.0,-12.5,160.3],m.alloy,.45);
 box('port power / upper raised switching enclosure',[12.8,23,11.2],[-87.0,-5.0,166.6],m.shell,.65);
 box('port power / insulated switch recess',[8.4,.6,5.0],[-87.0,-17.0,166.5],m.graphite,.25);
 for(const x of[-89.5,-87,-84.5])box(`port power / isolated breaker ${x}`,[1.2,.8,3.1],[x,-17.55,166.5],m.shell,.2);
 box('port power / instrument glass',[8.0,.42,9.5],[-87.0,-35.84,139.5],m.glass,.2);
 for(let i=0;i<3;i++)box(`port power / status scale ${i}`,[4.4-i,.20,.4],[-87.0,-36.12,137.4+i*2.0],m.signal);
 digits('port power / enclosure identity','07',-87,-35.82,149.0,1.4);
 louvres('port power / lower cooling intake',-87,-35.9,106.9,9.3,15.8,8);
 box('port power / latch hinge',[.95,1.05,23],[-92.85,-36.1,124],m.alloy,.2);
 box('port power / pull handle',[.85,1.7,8.3],[-81.4,-36.3,122.0],m.graphite,.25);
 box('port power / warning tab',[3.9,.25,1.6],[-87,-35.9,93.9],m.caution,.1);
 // Visible near-field supply manifold is connected to the cabinet lower bay.
 box('port power / coupling carrier',[15.0,15.5,11.6],[-87.1,-48.5,91.8],m.shell,.65);
 for(const x of[-91,-84]){
  rod('port power / supply socket '+x,[x,-57.2,92],[x,-59.5,92],2.1,m.alloy,12);
  rod('port power / dark plug '+x,[x,-59.7,92],[x,-61.2,92],1.55,m.rubber,10);
 }
 cable('port power / supply loom',[[-91,-60.8,92],[-93,-54,96],[-93,-43,98],[-92,-33,98]],.62,m.rubber);
 cable('port power / return loom',[[-84,-60.8,92],[-80,-51,95],[-80,-39,96],[-81,-32,99]],.52,m.rubber);
 box('port power / near coupling worktop',[18.6,25.5,1.9],[-87.3,-55.7,100.5],m.alloy,.4);
 box('port power / near worktop dark return',[.7,25.5,3.0],[-78.35,-55.7,99.7],m.graphite,.14);
 for(const y of[-65,-46])rod('port power / near worktop diagonal '+y,[-95,y,84],[-79.4,y,99.1],.75,m.slate,8);
 box('port power / rear cable bus',[7.0,22,53],[-92.0,44,112.0],m.graphite,.5);
 box('port power / rear bus alloy cover',[.72,20,48],[-88.1,44,112.0],m.alloy,.2);
 for(const z of[98,109,120,131]){
  rod('port power / bus outlet '+z,[-89.7,33,z],[-86.0,33,z],1.45,m.alloy,8);
  cable('port power / routed service '+z,[[-86,33,z],[-81.5,29,z],[-81.5,16,z+5],[-82,8,z+5]],.50,m.rubber);
 }
 assemblies.push({id:'port-distribution',role:'Supported main power cabinet, front intake and plug manifold, continuous rear service bus',sourceBounds:{x:[-97.0,-78.2],y:[-67,65],z:[80.4,172.4]}});
 // STARBOARD: taller rear thermal/control stack with real fin spacing and
 // two upright structural feet. Its front low bay remains open for CC0 art.
 for(const x of[81.4,94.2]){
  box('starboard thermal / load post '+x,[2.2,40,9.4],[x,31,88.1],m.alloy,.32);
  box('starboard thermal / post isolator '+x,[3.0,42,.8],[x,31,83.8],m.rubber,.12);
 }
 box('starboard thermal / lower formed housing',[15.8,38,51.0],[87.8,32,116.5],m.slate,.72);
 box('starboard thermal / upper control housing',[15.8,21.0,25],[87.8,26.0,153.5],m.shell,.72);
 box('starboard thermal / deep front fascia',[13.0,1.1,40],[87.8,12.25,116.5],m.graphite,.3);
 louvres('starboard thermal / front exchanger',87.8,11.45,116.5,10.8,34,12);
 // Side fins face the open cavity, rather than flat texture lines.
 box('starboard thermal / side exchanger throat',[.85,23,31],[79.5,33,119],m.graphite,.18);
 for(let i=0;i<9;i++)box(`starboard thermal / cast exchanger fin ${i}`,[1.35,21.5,1.0],[78.95,33,105+i*3.5],m.alloy,.15);
 frontPanel('starboard thermal / controller face',87.8,14.9,153.5,12.4,19.7);
 box('starboard thermal / control inset',[8.4,.55,9.8],[87.8,14.35,155.0],m.graphite,.2);
 box('starboard thermal / instrument lens',[6.8,.2,7.5],[87.8,13.95,155.5],m.glass,.12);
 for(let i=0;i<3;i++)box(`starboard thermal / instrument trace ${i}`,[4.5-i*.7,.12,.32],[87.8,13.75,153.2+i*1.75],m.signal);
 for(const x of[84.6,87.8,91.0])rod('starboard thermal / captive selector '+x,[x,14.1,147.4],[x,13.35,147.4],.65,m.graphite,10);
 box('starboard thermal / top removable cover',[16.8,23,1.8],[87.8,26.0,167.0],m.alloy,.44);
 box('starboard thermal / rear heat shield',[2.2,37,72],[95.2,32,128.3],m.graphite,.4);
 cable('starboard thermal / power trunk',[[92,12,94],[93,6,92],[93,-5,89],[94,-18,87]],.85,m.rubber);
 cable('starboard thermal / sensor conduit',[[81,12,139],[79.5,6,137],[79.5,-6,119],[81,-15,114]],.46,m.alloy);
 // Tool cradle and bolted stops are the real support for one photographic
 // CC0 toolbox. The root integrator loads and fits that asset, not this kit.
 box('starboard tools / inset cradle',[18.5,39,1.0],[87.8,-46,105.9],m.graphite,.2);
 box('starboard tools / folded worktop',[18.9,40,1.6],[87.8,-46,104.6],m.alloy,.35);
 for(const y of[-65.0,-26.9])box('starboard tools / end stop '+y,[17.0,1.0,2.3],[87.8,y,107.1],m.alloy,.22);
 for(const x of[79.3,96.3])box('starboard tools / cradle lateral locator '+x,[.6,35,1.2],[x,-46,106.6],m.rubber,.12);
 for(const x of[80.7,94.8])for(const y of[-62,-30]){
  box(`starboard tools / supported bench leg ${x}/${y}`,[1.7,2.6,20.4],[x,y,93.5],m.graphite,.22);
  box(`starboard tools / bench foot ${x}/${y}`,[3.0,4.0,.7],[x,y,83.65],m.rubber,.14);
 }
 box('starboard tools / continuous service shelf',[17.8,37,1.5],[88.0,-7.5,104.5],m.shell,.3);
 box('starboard tools / shelf return',[.8,38,3.0],[79.3,-7.5,103.7],m.graphite,.15);
 digits('starboard tools / location code','02',87.8,-66.0,105.5,.68);
 // A slender rear services mast makes the final depth landmark distinct.
 box('starboard rear / service mast',[5.0,8.0,92],[93,62,126.4],m.alloy,.45);
 box('starboard rear / mast joint shoe',[7.5,10.0,2.4],[93,62,84.7],m.graphite,.3);
 box('starboard rear / protected conduit',[1.8,5.8,75],[89.5,62,128],m.rubber,.3);
 cable('starboard rear / connected overhead loop',[[90,62,165],[83,59,174],[82,48,176],[86,37,168]],.65,m.rubber);
 assemblies.push({id:'starboard-controls',role:'Supported thermal exchanger and control head, open foreground tool cradle, rear service mast',sourceBounds:{x:[78.2,97.2],y:[-67,67],z:[80.4,177]}});
 const cadPropPlacements=[{id:'starboard / maintained CC0 toolbox',role:'Photographic metal toolbox in supported side workbench cradle',url:'assets/hangar/metal_toolbox.glb',centerCAD:[87.8,-46,117.4],heightMM:22,rotationCAD:[0,0,Math.PI/2],maximumSizeMM:[17.0,35.0,22.0],supportTopCAD:106.4,note:'Fit original GLB dimensions inside this bounded cradle. Preserve UV/maps; colour adjustment belongs to integrator. No invisible central prop collider.'}];
 for(const{material,parts}of batches.values()){
  const geometry=mergeGeometries(parts,false);for(const part of parts)part.dispose();geometries.add(geometry);
  const mesh=new T.Mesh(geometry,material);mesh.name=`CAD side equipment / ${material.name||serial++}`;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
 }
 root.updateMatrixWorld(true);
 function inspection(){let meshes=0,triangles=0;root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return {id:depthCues?'cad-enclosure-art-r15':'cad-enclosure-art-r14',depthCues,sourceUnits:'millimetres',meshes,triangles,finiteProxyCount:localSolids.length,centralReservation:{sourceXMM:[-55,55],sourceZMM:[85,210],unfilled:true},hiddenFloor:false,centralRearPanel:false,materialUVUnits:'metres from source millimetres / 1000; shared industrial PBR maps retained',assemblies:structuredClone(assemblies),cadPropPlacements:structuredClone(cadPropPlacements),source:'New local original equipment geometry; optional CC0 toolbox is loaded by caller with its separate provenance. No cloud generation or commercial-game asset.'};}
 function dispose(){if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const material of ownedMaterials)material.dispose();root.clear();localSolids.length=0;batches.clear();}
 return {root,localSolids,inspection,dispose};
}
