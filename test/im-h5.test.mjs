import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatTransport } from '../src/im-chat/transport-core.mjs';

function memoryStorage(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),data};}
function observe(api,robot,id){const controller=new AbortController(),events=[];api.subscribe(robot,id,e=>events.push(e),{signal:controller.signal});return {events,close:()=>controller.abort()};}
async function ended(events,after=0){const start=Date.now();while(!events.slice(after).some(e=>e.type==='AGENT_END')){if(Date.now()-start>1500)throw new Error('Missing terminal event');await new Promise(r=>setTimeout(r,5));}}
class Socket {
  readyState=1;sent=[];
  send(raw){this.sent.push(JSON.parse(raw));}
  event(e){this.onmessage?.({data:JSON.stringify(e)});}
  close(){this.readyState=3;this.onclose?.();}
}

test('H5 live adapter waits for ready, streams two turns through one socket, and keeps history distinct',async()=>{
  let socket,count=0;
  const api=createChatTransport({mode:'live',socketFactory:()=>{count++;return socket=new Socket();}});
  const {sessionId:id}=await api.create('im'),o=observe(api,'im',id);
  try{
    const sending=api.send('im',id,'你好');
    assert.equal(socket.sent.length,0);
    socket.event({type:'ready'});await sending;
    assert.deepEqual(socket.sent,[{text:'你好'}]);
    socket.event({type:'delta',delta:'你好，'});socket.event({type:'delta',delta:'请问需要什么帮助？'});socket.event({type:'done',status:'completed'});
    await api.send('im',id,'继续');socket.event({type:'delta',delta:'请继续描述。'});socket.event({type:'done',status:'completed'});
    const detail=await api.detail('im',id);
    assert.equal(count,1);assert.equal(detail.messages.length,4);
    assert.equal(detail.messages[1].text,'你好，请问需要什么帮助？');
    assert.equal(o.events.filter(e=>e.type==='AGENT_END').length,2);
    await assert.rejects(api.detail('other',id),/未找到/);
    socket.close();await assert.rejects(api.send('im',id,'不能隐式重连'),/已结束/);
  }finally{o.close();api.dispose();}
});

test('H5 live adapter does not silently simulate unsupported images, card actions or cloud context restoration',async()=>{
  const storage=memoryStorage();let connects=0;
  const api=createChatTransport({mode:'live',storage,socketFactory:()=>{connects++;return new Socket();}});
  const {sessionId:id}=await api.create('im');
  await assert.rejects(api.send('im',id,'图片',[{type:'image/png',size:1}]),/仅支持文本/);
  await assert.rejects(api.action('im',id,{}),/未接入/);assert.equal(connects,0);
  const restored=createChatTransport({mode:'live',storage});
  assert.equal((await restored.detail('im',id)).messages.length,0);
  await assert.rejects(restored.send('im',id,'续聊'),/已结束/);
  api.dispose();restored.dispose();
});

test('H5 demo preserves card flow, validates action payloads, deduplicates submissions and replays history',async()=>{
  const storage=memoryStorage(),api=createChatTransport({storage,delay:0});
  const {sessionId:id}=await api.create('im'),o=observe(api,'im',id);
  try{
    await api.send('im',id,'我想办理售后服务');await ended(o.events);
    const branch=o.events.find(e=>e.type==='IM_CARD').metadata;
    await assert.rejects(api.action('im',id,{cardId:branch.cardId,actionId:'select',idempotencyKey:'bad',payload:{branchId:'invalid'}}),/有效/);
    const input={cardId:branch.cardId,actionId:'select',idempotencyKey:'select-once',payload:{branchId:'return'}};
    const before=o.events.length,accepted=await api.action('im',id,input);
    assert.deepEqual(await api.action('im',id,input),accepted);await ended(o.events,before);
    assert.equal(o.events.filter(e=>e.type==='IM_ACTION').length,1);
    const confirmation=o.events.filter(e=>e.type==='IM_CARD').at(-1).metadata;
    assert.equal(confirmation.component,'sop-confirmation-card');
    const next=o.events.length;await api.action('im',id,{cardId:confirmation.cardId,actionId:'confirm',idempotencyKey:'confirm-once'});await ended(o.events,next);
    assert.equal(o.events.filter(e=>e.type==='IM_CARD').at(-1).metadata.properties.variant,'entity');
    await assert.rejects(api.action('im',id,{...input,idempotencyKey:'different'}),/已经提交/);
    const restored=createChatTransport({storage,delay:0}),restoredEvents=observe(restored,'im',id);
    assert.equal(restoredEvents.events.filter(e=>e.type==='IM_CARD').length,3);
    restoredEvents.close();restored.dispose();
  }finally{o.close();api.dispose();}
});

test('H5 demo image data stays local and is not mistaken for durable server attachments',async()=>{
  const storage=memoryStorage(),api=createChatTransport({storage,delay:0}),{sessionId:id}=await api.create('im'),o=observe(api,'im',id);
  try{
    const file=new File(['sample'],'sample.png',{type:'image/png'});
    await api.send('im',id,'参考图片',[file]);await ended(o.events);
    assert.match((await api.detail('im',id)).messages[0].attachments[0].url,/^blob:/);
    assert.ok([...storage.data.values()].every(x=>!x.includes('blob:')));
    assert.match((await api.detail('im',id)).messages[1].text,/尚未调用图片识别/);
  }finally{o.close();api.dispose();}
});

test('closing during the websocket handshake cancels the pending send',async()=>{
  const api=createChatTransport({mode:'live',socketFactory:()=>new Socket()}),{sessionId:id}=await api.create('im');
  const pending=api.send('im',id,'等待连接');api.close('im',id);
  await assert.rejects(pending,/会话已结束/);api.dispose();
});
