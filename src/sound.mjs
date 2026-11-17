// Sample credits and edits: assets/audio/NOTICE.md. No background music.
const FILES={shot:'shot',bolt:'bolt',hit0:'hit-0',hit1:'hit-1',case0:'case-0',case1:'case-1',break:'break',wall:'wall',wallBody:'wall-body'};
const MAX_VOICES=48,MAX_QUEUED=64;
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function wallImpactProfile(distance){
 const d=clamp(finite(distance,6),.5,45);
 return {distance:d,gain:1/(1+Math.max(0,d-2)*.065),cutoff:clamp(12500/(1+d*.075),2500,11500),reflectionDelay:.065+d*.0015};
}
export class GameSound{
 constructor(){this._enabled=true;this.context=null;this.buffers={};this.voices=new Set();this.queue=[];this.time=0;this.serial=0;this.volume=.7;this.counts={};}
 get enabled(){return this._enabled;}
 set enabled(value){this._enabled=Boolean(value);if(!this._enabled){this.stopVoices();this.queue=[];}}
 async prepare(){
  this.context??=new AudioContext({latencyHint:'interactive'});const c=this.context;
  this.input=c.createGain();const compressor=c.createDynamicsCompressor();compressor.threshold.value=-12;compressor.knee.value=8;compressor.ratio.value=4;compressor.attack.value=.002;compressor.release.value=.12;
  this.master=c.createGain();this.master.gain.value=this.volume;this.input.connect(compressor).connect(this.master);this.master.connect(c.destination);
  this.monitor=c.createMediaStreamDestination();this.master.connect(this.monitor);this.analyser=c.createAnalyser();this.analyser.fftSize=512;this.master.connect(this.analyser);
  await Promise.all(Object.entries(FILES).map(async([key,file])=>{const r=await fetch(`/assets/audio/${file}.wav`);if(!r.ok)throw new Error(`音效未能读取：${file}`);this.buffers[key]=await c.decodeAudioData(await r.arrayBuffer());}));
 }
 setVolume(value){this.volume=Math.max(0,Math.min(1,Number(value)||0));if(this.master)this.master.gain.setTargetAtTime(this.volume,this.context.currentTime,.025);}
 unlock(){if(this.enabled&&this.context)void this.context.resume().catch(()=>{});}
 voice(key,gain=1,rate=1,pan=0,delay=0,profile=null){
  if(!this.enabled||!this.context||!this.buffers[key])return;
  const c=this.context,source=c.createBufferSource(),level=c.createGain(),panner=c.createStereoPanner();source.buffer=this.buffers[key];source.playbackRate.value=rate;level.gain.value=gain;panner.pan.value=pan;
  const filter=profile?.cutoff?c.createBiquadFilter():null;
  if(filter){filter.type='lowpass';filter.frequency.value=profile.cutoff;filter.Q.value=.55;source.connect(filter).connect(level);}else source.connect(level);
  level.connect(panner).connect(this.input);source.start(c.currentTime+delay);this.voices.add(source);source.onended=()=>{this.voices.delete(source);source.disconnect();filter?.disconnect();level.disconnect();panner.disconnect();};
  if(this.voices.size>MAX_VOICES){const oldest=this.voices.values().next().value;try{oldest.stop();}catch{}this.voices.delete(oldest);}
 }
 thump(gain=.12,pan=0){
  if(!this.enabled||!this.context)return;const c=this.context,t=c.currentTime,o=c.createOscillator(),g=c.createGain(),p=c.createStereoPanner();o.type='sine';o.frequency.setValueAtTime(94,t);o.frequency.exponentialRampToValueAtTime(38,t+.095);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+.12);p.pan.value=pan;o.connect(g).connect(p).connect(this.input);o.start(t);o.stop(t+.13);this.voices.add(o);o.onended=()=>{this.voices.delete(o);o.disconnect();g.disconnect();p.disconnect();};
  if(this.voices.size>MAX_VOICES){const oldest=this.voices.values().next().value;try{oldest.stop();}catch{}this.voices.delete(oldest);}
 }
 later(delay,key,gain,rate=1,pan=0,profile=null){this.queue.push({at:this.time+Math.max(0,delay),key,gain,rate,pan,profile});if(this.queue.length>MAX_QUEUED)this.queue.splice(0,this.queue.length-MAX_QUEUED);}
 targetImpact(kind,options){
  // Projectile arrival already happened in the simulation. Distance changes
  // the mix, not the time of the primary contact; only secondary clatter and
  // a restrained fixed-hangar reflection are scheduled on the game clock.
  const distance=clamp(finite(options.distance,6),.5,45),pan=clamp((finite(options.x,.5)-.5)*1.3,-.65,.65);
  const gain=1/(1+Math.max(0,distance-2)*.095),cutoff=clamp(11500/(1+distance*.075),2600,11000),n=++this.serial;
  const profile={cutoff},jitter=1+Math.sin(n*2.399)*.045,voice=(key,level,rate=1)=>this.voice(key,level*gain,rate*jitter,pan,0,profile);
  this.lastTarget={kind,distance,gain,cutoff,pan};
  if(kind==='metalHit'){
   voice(n%2?'hit0':'hit1',options.heavy?.60:.48,1.20);voice('case0',.14,1.34);
   this.later(.045,'case1',.10*gain,1.2,pan,profile);
  }else if(kind==='armorBreak'){
   voice('hit1',.60,.94);voice('break',.31,.83);this.thump(.055*gain,pan);
   this.later(.068,'case1',.24*gain,.78,clamp(pan-.06,-.7,.7),profile);
   this.later(.143,'hit0',.12*gain,1.08,clamp(pan+.05,-.7,.7),profile);
  }else{
   voice('wallBody',.56,.72);voice('hit1',.47,.73);voice('break',.34,.68);this.thump(.13*gain,pan);
   this.later(.088,'hit0',.25*gain,.72,clamp(pan-.09,-.7,.7),profile);
   this.later(.192,'case1',.18*gain,.75,clamp(pan+.08,-.7,.7),profile);
   this.later(.315,'case0',.11*gain,.91,pan,profile);
   this.later(.052+distance*.002,'wallBody',.085*gain,.82,pan*.65,{cutoff:Math.min(2800,cutoff)});
  }
 }
 play(kind,options={}){
  if(!this.enabled)return;this.counts[kind]=(this.counts[kind]||0)+1;
  const pan=Math.max(-.45,Math.min(.45,((options.x??.5)-.5)*.6));
  if(['metalHit','armorBreak','enemyDestroy'].includes(kind)){
   this.targetImpact(kind,options);
  }else if(kind==='shot'){
   const n=++this.serial,rate=1+Math.sin(n*2.399)*.025;this.voice('shot',.88,rate,.07);this.voice('bolt',.22,1.45,.13,.018);this.thump(.10);
   this.later(.19+(n%3)*.035,n%2?'case0':'case1',.17,1.1,.28);
  }else if(kind==='reload'){
   const scale=(options.duration||2.1)/2.1;this.voice('bolt',.42,.9,.08);this.later(.25*scale,'case1',.30,.86,.12);this.later(1.18*scale,'hit0',.35,.9,.02);this.later(1.72*scale,'bolt',.65,1.15,.06);
  }else if(kind==='wallHit'){
   if(Number.isFinite(options.distance)){
    const profile=wallImpactProfile(options.distance);this.lastWall={...profile,pan};
    // Arrival already occurred in world simulation. Attenuate/filter the
    // contact now; only its small reflection is delayed on the game clock.
    this.voice('wall',.62*profile.gain,.96,pan,0,profile);this.voice('wallBody',.30*profile.gain,.92,pan,0,profile);this.thump(.055*profile.gain,pan);
    this.later(profile.reflectionDelay,'wallBody',.10*profile.gain,.84,pan*.65,{cutoff:Math.min(2300,profile.cutoff)});
   }else{this.voice('wall',options.heavy?.83:.62,.96+Math.sin(this.serial)*.035,pan);this.voice('wallBody',options.heavy?.58:.36,.92,pan);this.thump(options.heavy?.15:.09);}
  }else if(kind==='shield'||kind==='armor'){
   this.voice(kind==='armor'?'hit1':'hit0',kind==='armor'?.62:.72,1+Math.sin(this.serial)*.035,pan);this.thump(.06);
  }else if(kind==='critical'){
   this.voice('hit1',.88,.93,pan);this.voice('break',.28,1.35,pan,.018);this.thump(.13);
  }else if(kind==='shieldBreak'||kind==='clear'){
   this.voice('hit0',.9,.8,pan);this.voice('break',kind==='clear'?.8:.55,.94,pan,.015);this.thump(.20);this.later(.075,'hit1',.35,.7,pan);
  }
 }
 update(dt){this.time+=Math.max(0,finite(dt,0));const due=this.queue.filter(v=>v.at<=this.time);this.queue=this.queue.filter(v=>v.at>this.time);for(const v of due)this.voice(v.key,v.gain,v.rate,v.pan,0,v.profile);}
 stopVoices(){for(const v of this.voices)try{v.stop();}catch{}this.voices.clear();}
 clear(){this.stopVoices();this.queue=[];this.lastTarget=null;this.lastWall=null;}
 snapshot(){
  const a=new Float32Array(512);this.analyser?.getFloatTimeDomainData(a);let peak=0,energy=0;for(const v of a){peak=Math.max(peak,Math.abs(v));energy+=v*v;}
  return {enabled:this.enabled,volume:this.volume,state:this.context?.state,loaded:Object.keys(this.buffers).length,voices:this.voices.size,queued:this.queue.length,counts:{...this.counts},peak,rms:Math.sqrt(energy/a.length),lastTarget:this.lastTarget?{...this.lastTarget}:null,lastWall:this.lastWall?{...this.lastWall}:null,budget:{voices:MAX_VOICES,queued:MAX_QUEUED}};
 }
 get recordingStream(){return this.monitor?.stream;}
}
