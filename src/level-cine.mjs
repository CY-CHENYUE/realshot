// 雪线行动 · the pre-rendered films: the opening briefing and the ending. A clip plays full screen with the handler's
// voice-over (level-comms lines fired at fixed film times), a title card comes up over the last shot, and any key or
// click skips it. Each clip is optional: when its file is missing the level simply carries on without it.
// cue times are film seconds. intro: she starts over black; cuts at 4.55 (a trooper breaks out), 7.5 (the army), 10.4 (the mothership), 13.0 (the soldier)
// outro: cuts at 4.1 (the beam's pulse drops the army) and 6.7 (the soldier and the helicopter); her second line waits for the last shot
export const FILMS={
 intro:{src:'/assets/cine/intro.mp4',lines:[['brief1',.3],['brief2',5.6],['brief3',10.7]],titleAt:16.6,tail:2.6,volume:.5,eyebrow:'OPERATION SNOWLINE · 群峰救援线',title:'雪线行动'},
 outro:{src:'/assets/cine/outro.mp4',lines:[['out1',.5],['out2',6.9]],titleAt:9.9,tail:2.4,volume:.5,eyebrow:'MISSION COMPLETE',title:'信标已点亮'},
};
const MANIFEST='/assets/cine/films.json';
export function createCine({root,comms,sound}){
 const video=root.querySelector('video'),eyebrow=root.querySelector('.cine-title p'),title=root.querySelector('.cine-title h2'),ok={};let run=null;
 async function probe(){
  // assets/cine/films.json lists the clips that are installed, so a missing one is not asked for (and logs no 404)
  let have=[];try{const r=await fetch(MANIFEST,{cache:'no-cache'});if(r.ok)have=await r.json();}catch{}
  for(const name of Object.keys(FILMS))ok[name]=Array.isArray(have)&&have.includes(name);
  if(ok.intro){video.preload='auto';video.src=FILMS.intro.src;}return {...ok};
 }
 function finish(skipped){
  if(!run)return;const {done}=run;run=null;try{video.pause();}catch{}comms?.flush(true);
  root.classList.add('out');root.classList.remove('title');setTimeout(()=>{if(run)return;root.hidden=true;root.classList.remove('out','on');},650);done?.(skipped);
 }
 return {
  probe,ready:name=>!!ok[name],get playing(){return !!run;},
  play(name,done){
   const spec=FILMS[name];if(!spec||!ok[name]||run)return false;run={name,spec,done,fired:0,began:performance.now(),endedAt:null};
   eyebrow.textContent=spec.eyebrow;title.textContent=spec.title;
   root.hidden=false;root.classList.remove('out','title');void root.offsetWidth;root.classList.add('on');
   if(!video.src.endsWith(spec.src))video.src=spec.src;video.currentTime=0;video.muted=!sound?.enabled;video.volume=Math.max(0,Math.min(1,(sound?.volume??.7)*spec.volume));
   video.play().catch(()=>finish(true));return true;
  },
  skip(){if(run&&performance.now()-run.began>600)finish(true);},
  update(){
   if(!run)return;const {spec}=run,t=video.ended?video.duration:video.currentTime;
   while(run.fired<spec.lines.length&&t>=spec.lines[run.fired][1])comms?.say(spec.lines[run.fired++][0]);
   if(t>=spec.titleAt)root.classList.add('title');
   if(video.ended){run.endedAt??=performance.now();if(performance.now()-run.endedAt>spec.tail*1000)finish(false);}
   else if(video.error)finish(true);
  },
  state:()=>({ready:{...ok},playing:run?.name??null,time:video.currentTime,duration:video.duration||0,fired:run?.fired??0}),
 };
}
