import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ChatPage from './ChatPage';
import { chatMode } from './transport';
import { ImCardRenderer } from './cards';
import { imCardFromEvent, type ImCardAction, type ImCardModel } from './card-model';
import { componentExamples } from './demo-content.mjs';
import './h5.css';

function Gallery() {
  const [cards,setCards]=useState<ImCardModel[]>(()=>componentExamples().map((metadata,index)=>imCardFromEvent({eventId:String(index),sequence:index,sessionId:'gallery',turnId:`example-${index}`,createdAt:'',type:'IM_CARD',metadata:{...metadata,cardId:`example-${index}`}})!));
  const [notice,setNotice]=useState('');
  function act(card: ImCardModel, action: ImCardAction) {
    setNotice(`已触发「${action.label}」示例交互，没有提交业务请求。`);
    if(action.id==='submit')setCards(items=>items.map(x=>x.cardId===card.cardId?{...x,properties:{...x.properties,submitted:true},actionAccepted:true}:x));
    else if(action.id==='confirm')setCards(items=>items.map(x=>x.cardId===card.cardId?{...x,actionAccepted:true}:x));
  }
  return <main className="gallery"><div className="gallery-heading"><h1>客服消息组件</h1><p>同一套组件用于 H5 页面；内容与操作均为本地示例。</p></div><div role="status" className="gallery-notice">{notice||'包含问答、流程、确认、选择、内容、状态和服务评价。'}</div><div className="gallery-grid">{cards.map(card=><article key={card.cardId}><h2>{card.component} · {card.componentVersion}{card.properties.variant?` · ${card.properties.variant}`:''}</h2><ImCardRenderer card={card} disabled={card.actionAccepted} onAction={action=>act(card,action)}/></article>)}</div></main>;
}
function App() {
  const [gallery,setGallery]=useState(new URLSearchParams(location.search).has('components'));
  const robotId=new URLSearchParams(location.search).get('robot')||'im';
  return <div className="im-h5-app"><div className="h5-mode-bar"><span>{chatMode==='demo'?'交互示例 · 不调用模型或真实业务':'Voice PaaS · 文本对话'}</span>{chatMode==='demo'?<button onClick={()=>setGallery(x=>!x)}>{gallery?'返回对话':'组件示例'}</button>:<span className="h5-capability-note">图片、卡片及人工服务待接入</span>}</div>{gallery?<Gallery/>:<ChatPage robotId={robotId}/>}</div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
