import { card, demoReply, demoAction, ratingCard } from './demo-content.mjs';

export class ApiError extends Error {
  constructor(message,code='400'){super(message);this.code=code;}
}
export function createChatTransport({mode='demo',socketFactory,storage,delay=180}={}) {
  const sessions=new Map();
  const prefix=`studio-partner:h5:${mode}:`;
  const capabilities={images:mode==='demo',handoff:mode==='demo',actions:mode==='demo'};
  const timestamp=()=>new Date().toISOString();
  function persist(s) {
    if(!storage)return;
    const messages=s.messages.slice(-200).map(m=>({...m,attachments:[],text:m.text+(m.attachments?.length?'\n[图片仅在发送页面保留]':'')}));
    const value={id:s.id,robotId:s.robotId,messages,events:s.events.slice(-400),sequence:s.sequence,createdAt:s.createdAt};
    try {storage.setItem(prefix+s.id,JSON.stringify(value));} catch { /* In-memory conversation remains usable. */ }
  }
  function make(value) {return {...value,busy:false,closed:false,ready:false,socket:null,stream:'',subscribers:new Set(),timers:new Set(),actions:new Map()};}
  function get(robotId,id) {
    if(!sessions.has(id)&&storage){
      let v;try {v=JSON.parse(storage.getItem(prefix+id)||'null');}catch{}
      if(v?.id===id&&v.robotId===robotId&&Array.isArray(v.messages)&&Array.isArray(v.events))sessions.set(id,make({...v,restored:true}));
    }
    const s=sessions.get(id);
    if(!s||s.robotId!==robotId)throw new ApiError('未找到当前机器人的会话，请开始新对话','404');
    return s;
  }
  function emit(s,turnId,type,extra={}) {
    const sequence=++s.sequence;
    const e={eventId:String(sequence),sequence,sessionId:s.id,turnId,type,createdAt:timestamp(),...extra};
    s.events.push(e);if(s.events.length>500)s.events.shift();
    persist(s);
    for(const listener of s.subscribers)listener(e,e.eventId);
    return e;
  }
  function schedule(s,fn,ms=delay){const timer=setTimeout(()=>{s.timers.delete(timer);if(!s.closed)fn();},ms);s.timers.add(timer);}
  function previousCard(s,id){return [...s.events].reverse().find(e=>e.type==='IM_CARD'&&e.metadata?.cardId===id);}
  function deliverCard(s,turn,spec) {
    const existing=spec.cardId?previousCard(s,spec.cardId):null;
    const cardId=spec.cardId||crypto.randomUUID(),turnId=existing?.turnId||turn;
    if(!existing&&!s.messages.some(m=>m.role==='assistant'&&m.turnId===turnId))s.messages.push({role:'assistant',turnId,text:'请查看服务卡片。',createdAt:timestamp()});
    emit(s,turnId,'IM_CARD',{status:'AWAITING_USER_ACTION',metadata:{...spec,cardId}});
  }
  function finish(s,turn) {s.busy=false;emit(s,turn,'AGENT_END',{status:'COMPLETED'});}
  function deliver(s,turn,result) {
    if(result.endHandoff){
      const prev=[...s.events].reverse().find(e=>e.type==='IM_CARD'&&e.metadata?.properties?.context==='human-handoff');
      if(prev)deliverCard(s,turn,card('status-card',{context:'human-handoff',state:'completed',title:'人工服务示例已结束',subtitle:'没有产生实际人工服务请求'},[],prev.metadata.cardId));
      deliverCard(s,turn,ratingCard());finish(s,turn);return;
    }
    if(result.cards){for(const spec of result.cards)deliverCard(s,turn,spec);finish(s,turn);return;}
    const text=result.text||'',chunks=text.match(/[\s\S]{1,14}/g)||[''];let i=0;
    function next(){
      emit(s,turn,'RESPONSE_DELTA',{content:chunks[i++]});
      if(i<chunks.length)schedule(s,next,12);
      else {s.messages.push({role:'assistant',turnId:turn,text,createdAt:timestamp()});emit(s,turn,'RESPONSE',{content:text});finish(s,turn);}
    }
    next();
  }
  async function create(robotId) {
    const id='chat-'+crypto.randomUUID();
    const s=make({id,robotId,messages:[],events:[],sequence:0,createdAt:timestamp()});sessions.set(id,s);persist(s);return {sessionId:id};
  }
  async function detail(robotId,id) {const s=get(robotId,id);return {session:{sessionId:id,status:s.closed?'ENDED':'ACTIVE'},messages:[...s.messages]};}
  async function subscribe(robotId,id,onEvent,{signal,lastEventId='',onOpen}={}) {
    const s=get(robotId,id);if(signal?.aborted)return;
    onOpen?.();s.subscribers.add(onEvent);
    for(const e of s.events)if(e.sequence>Number(lastEventId||0))onEvent(e,e.eventId);
    await new Promise(resolve=>signal?.addEventListener('abort',()=>{s.subscribers.delete(onEvent);resolve();},{once:true}));
  }
  function connect(s) {
    if(s.ready&&s.socket?.readyState===1)return Promise.resolve();
    if(s.closed||s.restored)throw new ApiError('连接已结束；历史可查看，请开始新对话后继续');
    if(!socketFactory)throw new ApiError('未配置文本服务连接');
    return new Promise((resolve,reject)=>{
      let settled=false;
      const fail=(message)=>{
        if(!settled){settled=true;reject(new ApiError(message));}
        clearTimeout(timeout);s.cancelConnect=null;s.closed=true;s.ready=false;
        if(s.busy){s.busy=false;emit(s,s.activeTurn||'','ERROR',{content:message});}
      };
      const socket=socketFactory();s.socket=socket;
      const timeout=setTimeout(()=>{fail('连接超时，请开始新对话重试');socket.close();},20000);
      s.cancelConnect=()=>{clearTimeout(timeout);if(!settled){settled=true;reject(new ApiError('会话已结束'));}};
      socket.onmessage=({data})=>{
        if(s.closed)return;let e;try{e=JSON.parse(data);}catch{return fail('服务返回了无效消息');}
        if(e.type==='ready'){clearTimeout(timeout);s.cancelConnect=null;s.ready=true;settled=true;resolve();}
        if(e.type==='delta'&&s.busy){s.stream+=e.delta;emit(s,s.activeTurn,'RESPONSE_DELTA',{content:e.delta});}
        if(e.type==='done'&&s.busy){
          if(s.stream)s.messages.push({role:'assistant',turnId:s.activeTurn,text:s.stream,createdAt:timestamp()});
          if(e.status==='completed'){emit(s,s.activeTurn,'RESPONSE',{content:s.stream});finish(s,s.activeTurn);}
          else {s.busy=false;emit(s,s.activeTurn,'ERROR',{content:e.status==='cancelled'?'本次回复已停止':'本次回复未完成'});}
          s.stream='';
        }
        if(e.type==='error'){fail(e.message||'文本服务暂时不可用');socket.close();}
      };
      socket.onerror=()=>{fail('无法连接 Voice PaaS，请检查连接配置');socket.close();};
      socket.onclose=()=>{if(!s.closed)fail('连接已结束，请开始新对话继续');};
    });
  }
  async function send(robotId,id,text,images=[]) {
    const s=get(robotId,id),value=text.trim();
    if(s.busy)throw new ApiError('已有回复正在生成','409');
    if(s.closed||(mode==='live'&&s.restored))throw new ApiError('此连接已结束，请开始新对话');
    if(!value&&!images.length)throw new ApiError('请输入消息');
    if(value.length>4000)throw new ApiError('单条消息请控制在 4000 字以内');
    if(images.length&&!capabilities.images)throw new ApiError('当前 Voice PaaS 通道仅支持文本，图片尚未接入');
    if(images.length>3||images.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>5*1024*1024))throw new ApiError('最多 3 张图片，支持 JPEG、PNG、WebP，单张不超过 5 MB');
    const turn=crypto.randomUUID();s.busy=true;s.activeTurn=turn;s.stream='';
    try {
      if(mode==='live')await connect(s);
      const attachments=images.map(f=>({type:'image',url:URL.createObjectURL(f),mimeType:f.type,sizeBytes:f.size}));
      s.messages.push({role:'user',text:value,turnId:turn,attachments,createdAt:timestamp()});
      emit(s,turn,'AGENT_START');
      if(mode==='live')s.socket.send(JSON.stringify({text:value}));
      else schedule(s,()=>deliver(s,turn,demoReply(value,images.length)));
      return {turnId:turn};
    } catch(e){s.busy=false;throw e;}
  }
  async function action(robotId,id,input) {
    if(!capabilities.actions)throw new ApiError('当前服务未接入卡片业务操作');
    const s=get(robotId,id);
    if(s.actions.has(input.idempotencyKey))return s.actions.get(input.idempotencyKey);
    if(s.busy)throw new ApiError('已有回复正在生成','409');
    if(s.closed)throw new ApiError('当前会话已结束');
    const source=previousCard(s,input.cardId)?.metadata;
    if(!source?.actions?.some(a=>a.id===input.actionId))throw new ApiError('无效的卡片操作');
    if(s.events.some(e=>e.type==='IM_ACTION'&&e.metadata?.cardId===input.cardId))throw new ApiError('此操作已经提交');
    const result=demoAction(source,input.actionId,input.payload);
    const turn=crypto.randomUUID(),accepted={turnId:turn};s.busy=true;
    s.actions.set(input.idempotencyKey,accepted);
    emit(s,turn,'AGENT_START');emit(s,turn,'IM_ACTION',{metadata:{cardId:input.cardId,actionId:input.actionId}});
    schedule(s,()=>deliver(s,turn,result));return accepted;
  }
  function close(robotId,id) {
    if(!id)return;const s=get(robotId,id);s.closed=true;s.busy=false;
    for(const timer of s.timers)clearTimeout(timer);s.timers.clear();s.cancelConnect?.();s.cancelConnect=null;s.socket?.close();persist(s);
  }
  function dispose(){for(const s of sessions.values()){close(s.robotId,s.id);for(const m of s.messages)for(const f of m.attachments||[])if(f.url.startsWith('blob:'))URL.revokeObjectURL(f.url);}}
  return {mode,capabilities,create,detail,subscribe,send,action,close,dispose};
}
