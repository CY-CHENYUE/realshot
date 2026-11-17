import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {LINES,lineFor,createComms} from '../src/level-comms.mjs';
import {FILMS} from '../src/level-cine.mjs';

// the module reads performance.now(); the tests drive that clock by hand
let ms=0;Object.defineProperty(globalThis,'performance',{value:{now:()=>ms},configurable:true});
const advance=s=>{ms+=s*1000;};
// no audio context in node: every line is "subtitle only" and lasts its reading time
const fresh=()=>{ms=1e6;return createComms({});};
const onAir=c=>c.state().onAir?.key??null;

test('every line has a voice file and every film cue names a real line',()=>{
 for(const key of Object.keys(LINES))assert.ok(existsSync(fileURLToPath(new URL(`../assets/voice/${key.replace(':','-')}.mp3`,import.meta.url))),`voice file for ${key}`);
 for(const [name,film] of Object.entries(FILMS)){
  let last=-1;for(const [key,at] of film.lines){assert.ok(LINES[key],`${name}: ${key}`);assert.ok(at>last,`${name}: cues in film order`);last=at;}
  assert.ok(film.titleAt>last);
 }
});

test('game events map to the lines that describe them',()=>{
 assert.equal(lineFor({type:'encounter',encounter:'drop-palm'}),'enc:drop-palm');
 assert.equal(lineFor({type:'encounter',encounter:'no-such-encounter'}),null);
 assert.equal(lineFor({type:'spawn',enemyType:'boss'}),'boss');
 assert.equal(lineFor({type:'spawn',enemyType:'grunt'}),null);
 assert.equal(lineFor({type:'surge',reason:'palm'}),null,'the palm has its own line');
 assert.equal(lineFor({type:'surge',reason:'gold'}),'surge');
 assert.equal(lineFor({type:'avalanche',danger:true}),'avalancheDanger');
 assert.equal(lineFor({type:'avalanche'}),'avalanche');
 assert.equal(lineFor({type:'multiKill',count:11}),null);
 assert.equal(lineFor({type:'multiKill',count:12}),'praise');
 assert.equal(lineFor({type:'bossPhase',phase:1}),null);
 assert.equal(lineFor({type:'bossPhase',phase:3}),'bossPhase3');
 // low health: only a real hit that leaves the player alive at or under 30 %
 assert.equal(lineFor({type:'playerHit',damage:10,hp:30},{maxHP:100}),'lowhp');
 assert.equal(lineFor({type:'playerHit',damage:10,hp:31},{maxHP:100}),null);
 assert.equal(lineFor({type:'playerHit',damage:0,hp:10},{maxHP:100}),null);
 assert.equal(lineFor({type:'playerHit',damage:10,hp:0},{maxHP:100}),null);
});

test('a line goes on air when due and clears after its reading time',()=>{
 const c=fresh();assert.equal(c.say('start',{delay:1}),true);c.update();assert.equal(onAir(c),null);
 advance(1.1);c.update();assert.equal(onAir(c),'start');
 advance(20);c.update();assert.equal(onAir(c),null);
});

test('a priority-3 line cuts in; lower priorities wait their turn in priority order',()=>{
 const c=fresh();c.say('overlook');c.update();assert.equal(onAir(c),'overlook');
 c.say('praise');c.say('missileCall');c.update();assert.equal(onAir(c),'overlook','p0 and p2 do not interrupt p1');
 c.say('down');c.update();assert.equal(onAir(c),'down','p3 interrupts');
 advance(4.2);c.update();assert.equal(onAir(c),'missileCall','the p2 line is next');
});

test('once-per-run lines and cooldowns hold until reset',()=>{
 const c=fresh();assert.equal(c.say('boss'),true);assert.equal(c.say('boss'),false);
 c.update();advance(30);c.update();assert.equal(c.say('boss'),false,'once per run');
 assert.equal(c.say('missileCall'),true);c.update();advance(5);c.update();assert.equal(c.say('missileCall'),false,'inside its cooldown');
 advance(12);assert.equal(c.say('missileCall'),true);
 c.reset();assert.equal(c.say('boss'),true,'a new run may say it again');
});

test('a line that waited past its time-to-live is dropped, and the queue keeps the three most important',()=>{
 const c=fresh();c.say('boss');c.update();assert.equal(onAir(c),'boss');
 c.say('avalancheDanger');assert.deepEqual(c.state().queued,['avalancheDanger']);
 // p3 does not interrupt p3; its ttl is 3 s, the boss line reads for longer
 advance(3.2);c.update();assert.deepEqual(c.state().queued,[]);
 for(const k of ['praise','overlook','missileCall','lowhp'])c.say(k);
 assert.equal(c.state().queued.length,3);assert.ok(!c.state().queued.includes('praise'),'the p0 line is the one dropped');
});

test('a disabled radio says nothing',()=>{ms=2e6;const c=createComms({enabled:false});assert.equal(c.say('start'),false);c.update();assert.equal(onAir(c),null);});
