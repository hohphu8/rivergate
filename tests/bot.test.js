import test from 'node:test';
import assert from 'node:assert/strict';
import { BotClient } from '../src/bot-client.js';
import { search } from '../src/search.js';
import { initialState,play,legalMoves } from '../src/engine.js';
test('search produces legal moves without mutating state, with bounded depth',()=>{
  const state=play(initialState(),{from:54,to:45}),before=structuredClone(state),progress=[];
  const result=search(state,{budgetMs:150,maxDepth:2,onProgress:p=>progress.push(p)});
  assert(legalMoves(state.board,state.turn).some(m=>m.from===result.move.from&&m.to===result.move.to));
  assert.deepEqual(state,before);assert(result.depth<=2);assert(result.nodes>=0);
});
test('client terminates obsolete worker, rejects stale/wrong-key results and cleans up',()=>{
  const workers=[],timers=new Map();let seq=0,results=0,errors=0;
  const client=new BotClient({makeWorker:()=>{const w={terminate(){this.stopped=true;},postMessage(data){this.request=data;}};workers.push(w);return w;},setTimer:fn=>{timers.set(++seq,fn);return seq;},clearTimer:id=>timers.delete(id)});
  const callbacks={onResult:()=>results++,onError:()=>errors++};
  client.start(initialState(),callbacks);const first=workers[0],late=first.onmessage;
  client.start(initialState(),callbacks);assert(first.stopped);assert.equal(timers.size,1);
  late({data:{...first.request,type:'result'}});assert.equal(results,0);
  const second=workers[1];second.onmessage({data:{...second.request,key:'wrong',type:'result'}});assert.equal(results,0);
  second.onmessage({data:{...second.request,type:'result'}});assert.equal(results,1);assert(second.stopped);assert.equal(timers.size,0);
  client.start(initialState(),callbacks);const third=workers[2];client.dispose();assert(third.stopped);assert.equal(timers.size,0);
  client.start(initialState(),callbacks);assert.equal(workers.length,3);assert.equal(errors,0);
});
test('worker crash, timeout and construction failures recover exactly once',()=>{
  let worker,timeout,errors=0;
  const client=new BotClient({makeWorker:()=>worker={postMessage(){},terminate(){}},setTimer:fn=>(timeout=fn,1),clearTimer:()=>{}});
  const opts={onResult:()=>assert.fail(),onError:()=>errors++};
  client.start(initialState(),opts);const crash=worker.onerror;crash({});crash({});assert.equal(errors,1);
  client.start(initialState(),opts);timeout();assert.equal(errors,2);
  client.makeWorker=()=>{throw Error('denied');};client.start(initialState(),opts);assert.equal(errors,3);
});
