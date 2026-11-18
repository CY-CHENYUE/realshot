// 雪线行动 · radio chatter. One handler voice ("雪鸮", the command post) talks the player through the key beats:
// a spoken line, a subtitle with the speaker's name, and the fight ducked under it while she speaks.
// The files in /assets/voice are dry speech (one per line, named by key); the radio colour (band limit, drive,
// squelch, static bed, roger beep) is made here, so a re-recorded or re-synthesised voice just drops in.
// A line whose file is missing still shows its subtitle for a reading-length time.
export const SPEAKER={name:'雪鸮',tag:'指挥中心'};
// p: priority (3 interrupts whatever is on air), cd: seconds before the same line may repeat, once: once per run,
// ttl: how long it may wait in the queue before it is stale and dropped
export const LINES={
 // opening briefing (over the cinematic)
 brief1:{text:'雪线一号，这里是雪鸮。隘口的救援信标失去了信号。',p:3,ttl:30},
 brief2:{text:'冰壳步兵正从雪下成群钻出，无人机封锁了天空。',p:3,ttl:30},
 brief3:{text:'它们的母舰正在赶来。穿过山谷，点亮信标。你只有一个人。',p:3,ttl:30},
 // the run
 start:{text:'信标就在山谷尽头。行动开始。',p:2,ttl:8},
 'enc:pine-1':{text:'接敌！冰壳步兵从雪下钻出来了，自由开火。',p:2,once:true},
 'enc:drop-minigun':{text:'补给投下了，是转管机枪。拿到它。',p:1,once:true},
 'enc:pine-surge':{text:'大批步兵正在冲过来。顶住，别后退！',p:2,once:true},
 'enc:drop-rpg':{text:'火箭筒到了，专打扎堆的。',p:1,once:true},
 'enc:glacier-surge':{text:'进入冰川峡谷。重甲步兵带队，先打掉它们。',p:2,once:true},
 'enc:drop-palm':{text:'金色空投！里面是天掌，一定要拿到。',p:2,once:true},
 'enc:col-surge':{text:'风口垭口，截击机和步兵潮一起上来了。',p:2,once:true},
 'enc:drop-supply':{text:'弹药和医疗补给已投下，去补一下。',p:1,once:true},
 'enc:lake-surge':{text:'这是信标前最后一道拦截，冲过去！',p:2,once:true},
 overlookAhead:{text:'侧面有坡道能上山。占住制高点，用重武器压下去。',p:1,cd:70},
 overlook:{text:'制高点到手。居高临下，狠狠打。',p:1,cd:45},
 surge:{text:'它们全朝你涌过来了，用天锤清场！',p:2,cd:30},
 palm:{text:'天掌启动！从天上拍下去！',p:2,cd:20},
 missileReady:{text:'天锤就绪，标记目标就能发射。',p:1,cd:50},
 missileCall:{text:'天锤已发射，远离红色标记！',p:2,cd:12},
 avalancheDanger:{text:'雪崩！快离开雪道！',p:3,cd:15,ttl:3},
 avalanche:{text:'雪檐塌了。漂亮，把它们全埋了。',p:1,cd:25},
 logo:{text:'天上有个金色徽章，打下来有惊喜。',p:1,once:true},
 logoDown:{text:'隐藏目标击落。空中支援马上到，地毯式轰炸。',p:2,cd:20},
 vehicle:{text:'雪地车归你了，直接撞穿它们。',p:1,cd:80},
 praise:{text:'漂亮！一下清掉一大片。',p:0,cd:55,ttl:3},
 combo:{text:'这火力，整个指挥中心都在看你。',p:0,cd:120,ttl:4},
 lowhp:{text:'你的生命体征在下降，找掩体！',p:2,cd:35,ttl:4},
 down:{text:'雪线一号？雪线一号，回话！',p:3,cd:5},
 respawn:{text:'信号恢复了。从检查点继续，别停下。',p:2,cd:5},
 hold:{text:'信标已启动。直升机马上就到，守住它！',p:3,once:true},
 boss:{text:'母舰来了！瞄准机首的红色核心。',p:3,once:true},
 bossPhase2:{text:'它的一台引擎起火了，继续打！',p:2,once:true},
 bossPhase3:{text:'母舰快撑不住了，集中攻击核心！',p:2,once:true},
 bossDown:{text:'母舰击毁！它在坠落，离残骸远点！',p:3,once:true},
 win:{text:'信标已点亮。干得好，雪线一号，我们来接你回家。',p:3,once:true,ttl:12},
 // ending film
 out1:{text:'雪线一号，我们看到信标了。直升机马上到。',p:3,ttl:30},
 out2:{text:'母舰已经坠毁。你一个人，守住了整条雪线。',p:3,ttl:30},
};
const reading=text=>1.1+text.length*.21; // seconds a subtitle stays when there is no audio for it

// which line (if any) a game event calls for; `ctx` carries what the event alone does not say
export function lineFor(e,ctx={}){
 switch(e.type){
  case 'encounter':return LINES['enc:'+e.encounter]?'enc:'+e.encounter:null;
  case 'overlookAhead':return 'overlookAhead';
  case 'overlook':return e.state==='enter'?'overlook':null;
  case 'surge':return e.reason==='palm'?null:'surge';
  case 'palmStart':return 'palm';
  case 'missileReady':return 'missileReady';
  case 'missileCall':return 'missileCall';
  case 'avalanche':return e.danger?'avalancheDanger':'avalanche';
  case 'spawn':return e.enemyType==='boss'?'boss':e.enemyType==='logo'?'logo':null;
  case 'logoDown':return 'logoDown';
  case 'vehicleEnter':return 'vehicle';
  case 'multiKill':return e.count>=12?'praise':null;
  case 'combo':return e.tier>=3?'combo':null;
  case 'playerHit':return e.damage>0&&e.hp>0&&e.hp<=(ctx.maxHP??100)*.3?'lowhp':null;
  case 'down':return 'down';
  case 'respawn':return 'respawn';
  case 'hold':return 'hold';
  case 'bossPhase':return e.phase===2?'bossPhase2':e.phase===3?'bossPhase3':null;
  case 'bossDown':return 'bossDown';
  case 'win':return 'win';
  default:return null;
 }
}

export function createComms({sound,root,base='assets/voice/',enabled=true}={}){
 const now=()=>performance.now()/1000,buffers={},missing=[],log=[];
 let queue=[],cur=null,last={},said=new Set(),chain=null,loaded=false;
 if(root){root.innerHTML='<i class="sig" aria-hidden="true"><u></u><u></u><u></u><u></u></i><b></b><span></span>';root.querySelector('b').textContent=SPEAKER.name;}
 const textEl=root?.querySelector('span');

 // source -> band limit -> presence -> drive -> levelling -> master (past the fight's own compressor, so gunfire cannot pump her)
 function build(){
  const c=sound?.context;if(chain||!c||!sound.master)return chain;
  const input=c.createGain(),hp=c.createBiquadFilter(),lp=c.createBiquadFilter(),pk=c.createBiquadFilter(),drive=c.createWaveShaper(),comp=c.createDynamicsCompressor(),out=c.createGain();
  hp.type='highpass';hp.frequency.value=360;hp.Q.value=.8;lp.type='lowpass';lp.frequency.value=3300;lp.Q.value=.8;pk.type='peaking';pk.frequency.value=1750;pk.Q.value=1;pk.gain.value=5;
  const curve=new Float32Array(1024);for(let i=0;i<1024;i++){const x=i/511.5-1;curve[i]=Math.tanh(2.4*x)/Math.tanh(2.4);}drive.curve=curve;drive.oversample='2x';
  comp.threshold.value=-26;comp.knee.value=6;comp.ratio.value=9;comp.attack.value=.003;comp.release.value=.14;out.gain.value=1.25;
  input.connect(hp).connect(lp).connect(pk).connect(drive).connect(comp).connect(out).connect(sound.master);
  const n=c.sampleRate,nb=c.createBuffer(1,n,n),d=nb.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
  const bed=c.createBufferSource(),bf=c.createBiquadFilter(),bg=c.createGain();bed.buffer=nb;bed.loop=true;bf.type='bandpass';bf.frequency.value=2100;bf.Q.value=.5;bg.gain.value=0;bed.connect(bf).connect(bg).connect(out);bed.start();
  chain={c,input,out,bg,nb};return chain;
 }
 function burst(at,dur,gain){const {c,nb,out}=chain,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=nb;f.type='bandpass';f.frequency.value=2600;f.Q.value=.7;g.gain.setValueAtTime(gain,at);g.gain.exponentialRampToValueAtTime(.0001,at+dur);s.connect(f).connect(g).connect(out);s.start(at,Math.random()*.5);s.stop(at+dur+.02);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();};}
 function beep(at){const {c,out}=chain,o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=1180;g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(.05,at+.008);g.gain.setValueAtTime(.05,at+.07);g.gain.exponentialRampToValueAtTime(.0001,at+.1);o.connect(g).connect(out);o.start(at);o.stop(at+.12);o.onended=()=>{o.disconnect();g.disconnect();};}
 function duck(on){const c=sound?.context;if(!c||!sound.input)return;sound.input.gain.cancelScheduledValues(c.currentTime);sound.input.gain.setTargetAtTime(on?.5:1,c.currentTime,on?.07:.3);}

 async function load(){
  const c=sound?.context;if(!c||!enabled)return {loaded:0,missing:Object.keys(LINES)};
  await Promise.all(Object.keys(LINES).map(async key=>{try{const r=await fetch(base+encodeURIComponent(key.replace(':','-'))+'.mp3');if(!r.ok)throw new Error(String(r.status));buffers[key]=await c.decodeAudioData(await r.arrayBuffer());}catch{missing.push(key);}}));
  loaded=true;return {loaded:Object.keys(buffers).length,missing:[...missing]};
 }
 function stopCurrent(clean=true){
  if(!cur)return;try{cur.src?.stop();}catch{}
  if(chain){const t=chain.c.currentTime;chain.bg.gain.setTargetAtTime(0,t,.03);if(clean&&cur.src)beep(t+.02);}
  duck(false);root?.classList.remove('on');cur=null;
 }
 function begin(item){
  const buf=buffers[item.key],audible=!!buf&&enabled&&sound?.enabled&&sound.context?.state==='running'&&!!build();let src=null;
  const dur=buf?buf.duration:reading(item.line.text);
  if(audible){const {c,input,bg}=chain,t=c.currentTime;burst(t,.06,.13);src=c.createBufferSource();src.buffer=buf;src.connect(input);src.start(t+.07);src.onended=()=>src.disconnect();bg.gain.setTargetAtTime(.011,t,.02);duck(true);}
  if(textEl){textEl.textContent=item.line.text;root.classList.add('on');root.dataset.p=item.line.p??1;}
  cur={key:item.key,p:item.line.p??1,src,end:now()+dur+(audible?.25:0),audible};log.push({key:item.key,at:now(),audible});if(log.length>60)log.shift();
 }
 return {
  load,
  // ask for a line; returns whether it was queued
  say(key,{delay=0}={}){
   const line=LINES[key];if(!line||!enabled)return false;const t=now();
   if(line.once&&said.has(key))return false;if(t-(last[key]??-1e9)<(line.cd??6))return false;
   if(queue.some(q=>q.key===key)||cur?.key===key)return false;
   last[key]=t;said.add(key);queue.push({key,line,at:t+delay,expires:t+delay+(line.ttl??7)});queue.sort((a,b)=>(b.line.p??1)-(a.line.p??1)||a.at-b.at);
   if(queue.length>3)queue=queue.slice(0,3);return true;
  },
  update(){
   const t=now();if(cur&&t>=cur.end)stopCurrent();
   queue=queue.filter(q=>q.expires>t);
   const due=queue.find(q=>q.at<=t);if(!due)return;
   if(cur){if((due.line.p??1)>=3&&cur.p<3)stopCurrent(false);else return;}
   queue.splice(queue.indexOf(due),1);begin(due);
  },
  // drop what is waiting; `all` also cuts the line on air
  flush(all=true){queue=[];if(all)stopCurrent(false);},
  // a new run: everything may be said again
  reset(){queue=[];stopCurrent(false);last={};said=new Set();},
  state:()=>({enabled,loaded,voices:Object.keys(buffers).length,missing:[...missing],onAir:cur?{key:cur.key,audible:cur.audible,left:cur.end-now()}:null,queued:queue.map(q=>q.key),log:log.slice(-12)}),
 };
}
