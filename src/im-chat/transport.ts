import { createChatTransport, ApiError } from './transport-core.mjs';
export { ApiError };
export type { TextTranscriptLine, TextImageAttachment, TextTurnEvent } from './types';

const query=new URLSearchParams(location.search);
export const chatMode=query.get('mode')==='live'?'live':'demo';
let storage: Storage|undefined;
try {storage=window.sessionStorage;}catch{}
const transport=createChatTransport({
  mode:chatMode,storage,
  socketFactory:()=>new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/im?robotId=${encodeURIComponent(query.get('robot')||'')}`),
});
window.addEventListener('pagehide',()=>transport.dispose(),{once:true});
export const getChatCapabilities=()=>transport.capabilities;
export const createPublicTextSession=transport.create;
export const getPublicTextSession=transport.detail;
export const sendPublicTextMessage=transport.send;
export const submitPublicTextCardAction=transport.action;
export const streamPublicTextSessionEvents=transport.subscribe;
export const closeTextSession=transport.close;
export async function getPublicTextServiceRobot(robotId: string) {
  if(chatMode==='live'){
    const response=await fetch('/api/settings');
    if(!response.ok)throw new ApiError('请先启动应用后端并配置 Voice PaaS');
    const config=await response.json();
    if(!config.voiceKeyConfigured)throw new ApiError('请先在连接配置页填写 Voice PaaS Key');
    const responseRobot=await fetch(`/api/partner/robots/${encodeURIComponent(robotId)}/presentation`);
    if(!responseRobot.ok)throw new ApiError('无法读取客服展示配置，请检查机器人绑定');
    const robot=await responseRobot.json();
    return {name:robot.name||query.get('name')?.slice(0,80)||'在线客服',presentation:robot.presentation};
  }
  return {name:query.get('name')?.slice(0,80)||'在线客服',presentation:null};
}
