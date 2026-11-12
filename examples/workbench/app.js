// Customer workbench. Robot configuration and call history use the local API.
const {renderDesignMarkdown,redactDesignText}=DesignFormat;
const paths = {
  bot: 'M12 3v3M8 3h4M5 8h14v12H5zM2 12v4m20-4v4M9 12v2m6-2v2M9 17h6',
  voice: 'M12 3v18M8 6v12M4 9v6m12-9v12m4-9v6',
  chat: 'M21 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 19 0Z',
  gear: 'm12 3 2 3 4-1 1 4 3 2-3 2-1 4-4-1-2 3-2-3-4 1-1-4-3-2 3-2 1-4 4 1Z M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  arrow: 'm9 5 7 7-7 7', back: 'm14 5-7 7 7 7',
  spark: 'm12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z',
  file: 'M14 3H5v18h14V8l-5-5Zm0 0v6h5M8 13h8m-8 4h6',
  folder: 'M3 7h7l2 2h9v11H3ZM3 7V4h7l2 3h8v2',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
  plus: 'M12 4v16M4 12h16', search: 'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  check: 'm5 12 4 4L19 6', send: 'm4 12 8-8 8 8M12 4v17',
  code: 'm8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  mic: 'M9 3h6v10a3 3 0 0 1-6 0ZM5 11v2a7 7 0 0 0 14 0v-2M12 20v2',
  phone: 'M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4c-10 3-21-8-16-16Z',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  refresh: 'M20 8a9 9 0 1 0 0 8M20 3v6h-6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  image: 'M3 3h18v18H3ZM3 17l6-7 5 5 3-3 4 5M16 7h.01',
  clip: 'm8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  close: 'm6 6 12 12M6 18 18 6',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.bot}"/></svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID();
const now = () => new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
const state = {filter:'all',workspace:false,calls:[],callsNextCursor:'',callsLoading:false,detailLoading:false,loading:false,catalog:null,settings:null,settingsLoading:false};
let robots = [];
const app = document.getElementById('app'), dialog = document.getElementById('dialog');
let toastTimer;
let loadedRouteKey='';
function toast(message) { const e=document.getElementById('toast'); e.textContent=message; e.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>e.hidden=true,4000); }
function route() { const p=location.hash.slice(1).split('/'); return {view:p[0]||'robot',id:p[1]||'voice',tab:p[2]||'config',sessionId:p[3]}; }
function currentRobot() { return robots.find(r=>r.id===route().id)||robots[0]; }
function go(hash) { if(location.hash===`#${hash}`) render(); else location.hash=hash; }
async function api(path,options={}) { const r=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers}});const j=await r.json();if(!r.ok)throw new Error(j.error||`请求失败 ${r.status}`);return j; }
function refreshRobots() { state.loading=true;state.loadError='';render();return Promise.all([api('/api/partner/robots'),api('/api/partner/catalog')]).then(([rows,catalog])=>{robots=rows;state.catalog=catalog;state.loading=false;render();}).catch(e=>{state.loading=false;state.loadError=e.message;render();}); }
function button(text,action,cls='',i='') { return `<button type="button" class="btn ${cls}" data-action="${action}">${i?icon(i):''}${text}</button>`; }
function badge(text,cls='') { return `<span class="badge ${cls}">${esc(text)}</span>`; }
function markDraft(r) { r.draft=true; r.unsaved=true; r.validated=false; }
function shell(body,r) {
  const loc=route();
  return `<aside class="sidebar"><a class="brand" href="#robots"><b class="brand-mark">S</b>Studio <span>Partner</span></a><div class="nav-label">工作空间</div><nav><a class="nav-link ${loc.view!=='settings'?'active':''}" href="#robots">${icon('bot')}数字员工</a><a class="nav-link ${loc.view==='settings'?'active':''}" href="#settings">${icon('gear')}连接配置</a></nav><div class="robot-shortcuts"><div class="nav-label">最近使用</div>${robots.map(x=>`<button class="robot-shortcut ${loc.view==='robot'&&x.id===r?.id?'current':''}" data-go="robot/${x.id}/overview">${icon(x.icon)}${esc(x.name)}</button>`).join('')}</div><div class="sidebar-bottom"><strong>Studio Partner</strong><span>文本与语音 · 同一套工作台</span><span>连接你的对话服务</span></div></aside><main class="main"><div class="content">${body}</div></main>`;
}
function header(r,tab) {
  return `<div class="crumb"><a href="#robots">数字员工</a>${icon('arrow')}<b>${esc(r.name)}</b></div><div class="robot-header"><div><div class="title-row"><h1>${esc(r.name)}</h1>${badge(r.published?'已发布 · v'+r.published:'尚未发布',r.published?'green':'orange')}${badge(r.type)}</div><div class="subline"><span class="mono">${esc(r.id)}</span><span>${esc(r.desc)}</span></div></div><div class="actions">${tab==='design'?'':button('Design','design','','spark')}${button('试用机器人','try','primary',r.icon)}</div></div><nav class="tabs" aria-label="机器人详情">${[['overview','总览','grid'],['config','机器人配置','file'],['sessions','对话管理','chat'],['design','Design','spark']].map(([k,n,i])=>`<button class="tab ${tab===k?'active':''}" data-go="robot/${r.id}/${k}">${icon(i)}${n}</button>`).join('')}</nav>`;
}
function list() {
  return `<div class="section-title"><div><h1>数字员工 <span class="muted">${robots.length}</span></h1><p>配置文本与语音机器人，查看真实通话，使用 Design 生成配置文件。</p></div>${button('创建机器人','create','primary','plus')}</div><div class="toolbar"><div class="filters">${[['all','全部'],['im','文本机器人'],['voice','语音机器人']].map(([v,n])=>`<button class="filter ${state.filter===v?'active':''}" data-filter="${v}">${n}</button>`).join('')}</div><label class="search">${icon('search')}<input id="robot-search" aria-label="搜索机器人" placeholder="搜索机器人名称"/></label></div><div class="robot-list">${robots.filter(r=>state.filter==='all'||r.type.toLowerCase().includes(state.filter==='im'?'文本':'语音')).map(r=>`<article class="card robot-tile" data-name="${esc(r.name)}"><div class="robot-tile-top"><div class="robot-tile-avatar ${r.icon==='chat'?'text':''}">${icon(r.icon)}</div><div><h2>${esc(r.name)}</h2>${badge(r.type)} ${badge(r.published?'已发布 · v'+r.published:'尚未发布',r.published?'green':'orange')}</div></div><p>${esc(r.desc||'')}</p><div class="robot-tile-info"><span>${esc(r.model)} · ${(r.skills||[]).length} 个业务 Skill</span><span>${r.draft?'有未发布修改':'配置已同步'}</span></div><div class="robot-tile-actions"><button class="btn" data-go="robot/${r.id}/overview">管理机器人 ${icon('arrow')}</button><button class="btn" data-go="robot/${r.id}/design">${icon('spark')}Design</button></div></article>`).join('')||`<div class="empty-state"><h2>${state.loading?'正在读取数字员工…':state.loadError?'连接服务失败':'还没有数字员工'}</h2><p>${state.loading?'':esc(state.loadError||'创建文本或语音机器人后，会显示在这里。')}</p>${state.loading?'':state.loadError?'<a class="btn primary" href="#settings">检查连接配置</a>':button('创建机器人','create','primary','plus')}</div>`}</div>`;
}
function preview(r) {
  if(r.icon==='chat')return `<aside><div class="card preview-card"><div class="preview-head"><h3>${icon('chat')}文本客服 H5</h3>${badge(r.published?'真实对话':'请先发布配置',r.published?'green':'orange')}</div><iframe class="im-h5-frame" title="文本客服 H5 试用" src="/im-h5.html?mode=live&embedded=1&robot=${encodeURIComponent(r.id)}&name=${encodeURIComponent(r.name)}"></iframe><a class="im-preview-link" href="/im-h5.html?mode=live&robot=${encodeURIComponent(r.id)}&name=${encodeURIComponent(r.name)}" target="_blank" rel="noopener">独立打开客服 H5 ↗</a></div></aside>`;
  return `<aside><div class="card preview-card"><div class="preview-head"><h3>${icon(r.icon)}机器人试用</h3><div class="preview-mode"><span class="selected">${r.published?'已发布 v'+r.published:'未发布'}</span></div></div><div class="preview-inner" id="preview-chat"><div class="assistant-line"><span class="tiny-avatar">${icon(r.icon)}</span><div class="bubble">${esc(r.greeting ?? '你好，我可以为你提供帮助。')}</div></div><div><div class="voice-orb">${icon('voice')}</div><div class="voice-label">${r.published?'使用当前已发布配置':'请先发布配置后开始通话'}</div><div class="preview-controls">${button('开始通话','voice-demo','primary','mic')}</div><audio id="voice-preview-audio" autoplay></audio></div></div><div class="preview-bottom">Voice PaaS · 按实际使用计费</div></div><div class="note-card"><strong>使用已发布版本</strong>${r.readOnly?'此机器人固定使用所绑定版本，不会自动切换。':'保存并发布后，新的对话将使用最新版本。'}</div></aside>`;
}
function skillRows(r) {
  return r.skills.length?r.skills.map(s=>`<div class="skill-row" data-skill-row="${esc(s.id)}"><div class="skill-icon">${icon('file')}</div><div class="skill-name"><strong>${esc(s.name)}</strong><small>${esc(s.id)} · ${esc(s.version)}</small></div>${badge(s.preload?'预加载':'按需加载',s.preload?'purple':'gray')}<div class="skill-actions"><button class="btn tiny" data-edit-skill="${esc(s.id)}" aria-label="编辑 ${esc(s.name)}">编辑</button><button class="btn tiny danger-text" data-delete-skill="${esc(s.id)}" aria-label="删除 ${esc(s.name)}">删除</button></div></div>`).join(''):`<div class="empty-state compact">${icon('file')}<strong>还没有业务 Skill</strong><p>创建业务规范，为机器人补充处理流程。</p></div>`;
}
function options(items,current) {
  const values=items.map(x=>typeof x==='string'?{id:x,name:x}:x);
  if(current&&!values.some(x=>x.id===current))values.push({id:current,name:`${current}（当前值，服务目录未列出）`});
  return values.map(x=>`<option value="${esc(x.id)}" ${x.id===current?'selected':''}>${esc(x.name||x.id)}</option>`).join('');
}
function languageField(r,kind) {
  const languages=state.catalog?.components?.find(c=>c.kind===kind&&c.id===(r.config?.[kind]||`latentx-${kind}`))?.languages||[];
  return `<label class="field">${kind==='asr'?'识别语言':'播报语言'}<select data-field="${kind}_language">${options([{id:'',name:'组件默认'},...languages],r.config?.[`${kind}_language`]||'')}</select><small>仅使用当前服务目录开放的语言。</small></label>`;
}
function knowledgeRows(r) {
  return (r.knowledge_refs||[]).map((k,i)=>`<div class="skill-row"><div class="skill-icon">${icon('file')}</div><div class="skill-name"><strong>${esc(k.id)}</strong><small>版本 ${esc(k.version)}</small></div><button class="btn tiny danger-text" data-remove-knowledge="${i}">移除</button></div>`).join('')||'<div class="empty-state compact"><strong>尚未挂载知识</strong><p>与流程 Skill 分开管理，发布后由服务搜索已挂载的知识。</p></div>';
}
function modelOptions() {
  return `<datalist id="published-model-options">${(state.publishedModels||[]).map(m=>`<option value="${esc(m.model)}">${esc(m.name)} · v${esc(m.version)}</option>`).join('')}</datalist>`;
}
async function loadModelOptions() {
  try {
    state.publishedModels=await api('/api/partner/published-models');
    const list=document.getElementById('published-model-options');
    if(list)list.outerHTML=modelOptions();
  } catch { /* Manual entry remains available; saving validates the ID. */ }
}
function config(r) {
  const c=r.config||{};
  if(r.readOnly) return `<div class="section-title"><div><h2>机器人配置</h2><p>固定使用已发布版本，共享模型配置只读。</p></div>${badge(r.versionUnavailable?'版本不可用':'已绑定 · v'+r.published,r.versionUnavailable?'orange':'green')}</div><div class="config-grid"><div class="form-area"><section class="card"><div class="card-head">${icon('bot')}<h3>已发布模型</h3></div><div class="card-body"><form id="model-binding-form" data-robot-id="${esc(r.id)}"><label class="field">模型 ID<input name="modelId" aria-label="模型 ID" list="published-model-options" value="${esc(r.model)}" required maxlength="150" autocomplete="off"/><small>可直接填写或从可用的已发布模型中选择，保存后用于新的对话。</small></label>${modelOptions()}<button class="btn primary" type="submit">保存模型 ID</button><p class="form-error" role="alert" id="model-binding-error" hidden></p></form><p>基础模型：${esc(c.llm||'—')} · ${esc(r.type)}</p><details><summary>查看人设与业务规则</summary><pre class="json">${esc(r.instructions)}</pre></details></div></section><section class="card"><div class="card-head">${icon('file')}<h3>流程 Skill</h3>${badge(r.skills.length+' 个')}</div><div class="card-body">${r.skills.map(s=>`<div class="skill-row"><div class="skill-name"><strong>${esc(s.name||s.id)}</strong><small>${esc(s.id)} · ${esc(s.version)}</small></div>${badge(s.preload?'预加载':'按需读取')}</div>`).join('')||'<p>未配置流程 Skill</p>'}</div></section><section class="card"><div class="card-head">${icon('file')}<h3>知识资源</h3>${badge(r.knowledge_refs.length+' 个')}</div><div class="card-body">${r.knowledge_refs.map(k=>`<div class="skill-row"><div class="skill-name"><strong>${esc(k.id)}</strong><small>${esc(k.version)}</small></div></div>`).join('')||'<p>未挂载知识</p>'}</div></section>${r.icon==='voice'?`<section class="card"><div class="card-head">${icon('voice')}<h3>网页通话设置</h3></div><div class="card-body"><p>开场白：${esc(r.greeting||'不播放')}</p><p>无回应提醒：${r.idle_timeout_ms/1000} 秒</p><p>音色及识别、播报语言继承所绑定版本。</p></div></section>`:''}</div>${preview(r)}</div>`;
  const components=kind=>(state.catalog?.components||[]).filter(x=>x.kind===kind);
  return `<div class="section-title"><div><h2>机器人配置</h2><p>管理人设、流程 Skill、知识与语音参数。</p></div><div class="actions">${r.unsaved?badge('有未保存修改','orange'):badge(r.published?'已发布 · v'+r.published:'尚未发布',r.published?'green':'gray')}${button('查看 JSON','json','tiny','code')}</div></div>
  <div class="config-grid"><div class="form-area">
    <section class="card"><div class="card-head">${icon('bot')}<h3>基本配置</h3></div><div class="card-body"><div class="field-grid"><label class="field">机器人名称<input data-field="name" value="${esc(r.name)}"/></label><label class="field">基础模型<select data-field="llm">${options(components('llm'),c.llm||'latentx-mini')}</select></label></div><label class="field">人设与业务规则<textarea data-field="instructions">${esc(r.instructions)}</textarea><small>描述机器人职责、处理流程与回答边界。</small></label></div></section>
    <section class="card" id="skills-card"><div class="card-head">${icon('file')}<h3>流程 Skill</h3>${badge((r.skills||[]).length+' 个')}${button('创建 Skill','create-skill','tiny','plus')}</div><div class="card-body">${skillRows(r)}</div></section>
    <section class="card" id="knowledge-card"><div class="card-head">${icon('file')}<h3>知识资源</h3>${button('挂载知识','attach-knowledge','tiny','plus')}${button('创建知识','create-knowledge','tiny')}</div><div class="card-body">${knowledgeRows(r)}</div></section>
    ${r.icon==='voice'?`<section class="card"><div class="card-head">${icon('voice')}<h3>语音设置</h3></div><div class="card-body"><div class="field-grid"><label class="field">语音识别<select data-field="asr">${options(components('asr'),c.asr||'latentx-asr')}</select></label><label class="field">语音合成<select data-field="tts">${options(components('tts'),c.tts||'latentx-tts')}</select></label>${languageField(r,'asr')}${languageField(r,'tts')}<label class="field">音色<select data-field="voice">${options(state.catalog?.voices||[],c.voice||'female-default')}</select></label><label class="field">断句停顿（毫秒）<input type="number" min="200" max="2000" step="100" data-field="silence_duration_ms" value="${c.silence_duration_ms||300}"/><small>判定用户说完；与无回应提醒分别配置。</small></label></div></div></section>
    <section class="card"><div class="card-head">${icon('phone')}<h3>网页通话设置</h3></div><div class="card-body"><label class="field">开场白<textarea class="short-text" data-field="greeting" maxlength="2000">${esc(r.greeting)}</textarea><small>留空不播开场白。保存后用于下一通网页通话。</small></label><label class="field">无回应提醒（毫秒）<input type="number" min="3000" max="60000" step="1000" data-field="idle_timeout_ms" value="${r.idle_timeout_ms||10000}"/></label></div></section>`:''}
    <section class="card"><div class="card-head">${icon('code')}<h3>工具</h3></div><div class="card-body"><div class="empty-inline"><span>${(c.tools||[]).length?'已配置 '+c.tools.length+' 个 Function':'当前未配置外部工具'}</span>${button('查看工具','tools','tiny')}</div><p class="muted">内置知识搜索与 Skill 读取由服务执行；外部工具执行暂未接入。</p></div></section>
    <div class="config-footer"><small id="save-state">${r.unsaved?'有未保存修改':'先保存草稿，再校验和发布'}</small><div class="actions">${button('保存草稿','save')}${button('校验','validate')}${button('发布配置','publish','primary')}</div></div>
  </div>${preview(r)}</div>`;
}
async function saveDraft(r) {
  const input={...r.config,name:r.name,instructions:r.instructions,skills:r.skills,knowledge_refs:r.knowledge_refs||[],revision:r.revision,
    channel:{greeting:r.greeting,idle_timeout_ms:Number(r.idle_timeout_ms||10000)}};
  const saved=await api(`/api/partner/robots/${r.id}`,{method:'PUT',body:JSON.stringify(input)});
  Object.assign(r,saved,{unsaved:false});render();return r;
}
function knowledgeForm() {
  modal('创建知识资源',`<form id="knowledge-form"><div class="field-grid"><label class="field">知识标识<input name="id" required pattern="[A-Za-z0-9_.-]{1,64}" placeholder="例如：support-faq"/></label><label class="field">版本<input name="version" required value="v1" pattern="[A-Za-z0-9_.-]{1,64}"/></label></div><label class="field">知识名称<input name="name" required/></label><label class="field">用途说明<input name="description" required/></label><label class="field">知识正文<textarea name="markdown" required maxlength="80000" placeholder="填写常见问题、产品信息或业务资料，支持 Markdown。"></textarea></label><p class="muted">创建不可变资源版本，并挂载到当前机器人草稿。修改内容时请使用新版本号。</p><p id="knowledge-error" role="alert" class="form-error" hidden></p><button class="btn primary">创建并挂载</button></form>`);
}

function actualTable(r,short=false) {
  const calls=state.calls;
  if(!calls.length)return `<div class="empty-state"><h2>${state.callsLoading?'正在读取对话…':'暂无可显示的历史对话'}</h2><p>当前筛选条件下没有会话记录。</p></div>`;
  const rows=calls.slice(0,short?3:100).map(c=>{const start=new Date(c.start_at),duration=(c.answer_at||c.start_at)&&c.end_at?Math.max(0,Math.round((Date.parse(c.end_at)-Date.parse(c.answer_at||c.start_at))/1000)):0;const ended=!!c.end_at||['ended','completed','failed','cancelled'].includes(c.status);const id=c.call_id||c.session_id;return `<tr data-session-row><td>${esc(Number.isNaN(start.getTime())?'—':start.toLocaleString('zh-CN'))}</td><td><span class="table-topic">${esc(c.direction|| (c.origin==='realtime'?'Realtime 会话':'通话'))}</span><small class="mono">${esc(id)}</small></td><td>${badge(ended?'已结束':'进行中',ended?'green':'orange')}</td><td>${Math.floor(duration/60)}:${String(duration%60).padStart(2,'0')}</td><td>${esc(c.origin==='realtime'?'Voice PaaS Realtime':'Voice PaaS')}</td><td><button class="text-button" data-go="robot/${r.id}/sessions/${encodeURIComponent(id)}">查看对话 ${icon('arrow')}</button></td></tr>`;}).join('');
  return `<div class="table-wrap"><table><thead><tr><th>开始时间</th><th>会话编号</th><th>状态</th><th>通话时长</th><th>来源</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function actualSessions(r) {return `<div class="section-title"><div><h2>${r.icon==='voice'?'对话记录':'会话记录'}</h2><p>显示 Voice PaaS 返回的历史会话；文本和语音均可在这里查看转写与状态。</p></div>${button('刷新','refresh','','refresh')}</div><div class="toolbar"><div class="filters"><span class="filter">${state.calls.length} 条账户记录</span>${state.callsNextCursor?button('加载更多','load-more','','arrow'):''}</div><label class="search">${icon('search')}<input id="session-search" placeholder="搜索会话编号" aria-label="搜索会话"/></label></div>${actualTable(r)}<div class="table-footer">记录由 Voice PaaS 按连接账户返回；机器人绑定信息由本地工作区维护。</div>`;}
function actualOverview(r) {return `<section class="card entry-card"><span class="robot-tile-avatar ${r.icon==='chat'?'text':''}">${icon(r.icon)}</span><div><h3>${r.icon==='voice'?'网页语音入口':'文本客服入口'}</h3><p>使用当前已发布配置开始真实对话。</p></div>${button('打开试用','try','primary',r.icon)}</section><div class="stat-row"><div class="stat"><small>服务账户近期${r.icon==='voice'?'通话':'会话'}</small><strong>${state.calls.length}</strong><span>条记录，未按机器人区分</span></div><div class="stat"><small>业务 Skill</small><strong>${(r.skills||[]).length}</strong><span>个</span></div><div class="stat"><small>当前版本</small><strong>${r.published?'v'+r.published:'—'}</strong><span>${r.published?'已发布':'未发布'}</span></div></div><div class="section-title"><h2>账户近期会话</h2><button class="text-button" data-go="robot/${r.id}/sessions">全部记录 ${icon('arrow')}</button></div>${actualTable(r,true)}`;}
function actualConversation(r,id) {
  const c=state.callDetail;
  if(!c||c.call_id!==decodeURIComponent(id))return `<div class="empty-state"><h2>${state.detailLoading?'正在读取通话详情…':'无法读取这条通话'}</h2><p>${state.detailError?esc(state.detailError):''}</p><button class="btn" data-go="robot/${r.id}/sessions">返回通话记录</button></div>`;
  const lines=Array.isArray(c.transcript)?c.transcript:[];
  const start=new Date(c.start_at),end=c.end_at?new Date(c.end_at):null;
  const duration=c.answer_at&&c.end_at?Math.max(0,Math.round((Date.parse(c.end_at)-Date.parse(c.answer_at))/1000)):0;
  const usage=c.usage||c.response_usage||{};
  return `<div class="crumb"><a href="#robots">数字员工</a>${icon('arrow')}<a href="#robot/${r.id}/sessions">${esc(r.name)}</a>${icon('arrow')}<b>会话详情</b></div><div class="section-title detail-heading"><div><div class="title-row"><h1>${c.origin==='realtime'?'会话详情':'语音会话详情'}</h1>${badge(end||c.status==='ended'?'已结束':'进行中',end||c.status==='ended'?'green':'orange')}</div><p>${esc(Number.isNaN(start.getTime())?'—':start.toLocaleString('zh-CN'))}</p></div><button class="btn" data-go="robot/${r.id}/sessions">${icon('back')}返回列表</button></div><div class="conversation-grid"><section class="card transcript-card"><div class="card-head">${icon('chat')}<h3>对话内容</h3>${badge(lines.length+' 条消息')}</div><div class="transcript-toolbar"><span>${c.origin==='realtime'?'文本 / 语音转写':'语音转写'}</span><label class="search">${icon('search')}<input id="transcript-search" placeholder="查找消息" aria-label="查找消息"/></label></div><div class="chat-transcript" id="chat-transcript">${lines.map((m,i)=>`<div class="chat-message ${m.role==='user'?'user':'assistant'}" data-message-text="${esc(m.content||'')}"><span class="chat-avatar ${m.role==='user'?'user':'assistant'}">${icon(m.role==='user'?'user':r.icon)}</span><div class="chat-message-body"><div class="message-meta"><strong>${m.role==='user'?'用户':esc(r.name)}</strong><span>第 ${i+1} 条</span></div><div class="message-bubble">${esc(m.content||'')}</div></div></div>`).join('')||'<p class="empty-state">服务未返回转写内容。</p>'}</div></section><aside class="session-aside"><section class="card"><div class="card-head">${icon('file')}<h3>会话信息</h3></div><dl class="metadata"><div><dt>机器人归属</dt><dd>由当前工作区绑定模型维护</dd></div><div><dt>会话 ID</dt><dd class="mono">${esc(c.call_id||c.session_id)}</dd></div><div><dt>接入方式</dt><dd>${esc(c.origin||'realtime')}</dd></div><div><dt>开始时间</dt><dd>${esc(Number.isNaN(start.getTime())?'—':start.toLocaleString('zh-CN'))}</dd></div><div><dt>结束时间</dt><dd>${end?esc(end.toLocaleString('zh-CN')):'—'}</dd></div><div><dt>通话时长</dt><dd>${Math.floor(duration/60)}:${String(duration%60).padStart(2,'0')}</dd></div>${usage.total_tokens!==undefined?`<div><dt>用量</dt><dd>${esc(JSON.stringify(usage))}</dd></div>`:''}</dl></section><section class="card"><div class="card-head">${icon('phone')}<h3>录音</h3></div>${c.recording?.url?`<audio controls preload="none" src="${esc(c.recording.url)}"></audio><small>临时播放地址有效期：${esc(c.recording.expires_at||'')}</small>`:`<div class="empty-state compact"><strong>${esc(c.recording?.state==='none'?'未启用录音':'暂无录音')}</strong></div>`}</section></aside></div>`;
}
// The local UI keeps separate conversations while the backend owns each Agent session.
const designByRobot = new Map();
function createDesignSession(remote={}) {
  return {id:remote.id||uid(),remoteId:remote.remoteId||'',title:'新的对话',prompt:'',pending:[],files:[],messages:remote.messages||[],busy:!!remote.busy,status:remote.status||'Design 就绪',interaction:remote.interaction||null,error:remote.error||'',snapshotId:remote.snapshotId||'',stream:null};
}
function designStore(r) { if(!designByRobot.has(r.id)){const s=createDesignSession();designByRobot.set(r.id,{sessions:[s],current:s.id,loading:false});}return designByRobot.get(r.id); }
function designSession(r) { const d=designStore(r);return d.sessions.find(s=>s.id===d.current)||d.sessions[0]; }
function normalizeDesign(s) {
  for(const m of s.messages||[]) { if(!m.time)m.time=now(); if(!Array.isArray(m.files))m.files=[]; }
  s.files=(s.files||[]).map(f=>({...f,id:f.id||`remote-${f.path}`,name:f.name||f.path,kind:f.kind||'output',type:f.type||'text/plain',size:Number(f.size)||0,remote:true}));
  return s;
}
function applyDesignRemote(s,remote) {
  const previous=s.pending||[];
  Object.assign(s,normalizeDesign({...remote,id:s.id,remoteId:remote.remoteId||s.remoteId,pending:previous,stream:s.stream||null}));
  if(!s.title||s.title==='新的对话'){const first=s.messages?.find(m=>m.role==='user'&&m.text);if(first)s.title=redactDesignText(first.text).slice(0,22);}
  return s;
}
function bindDesignSession(r,s,remote) {
  if(!remote.id||!remote.remoteId)throw new Error('Design Agent 未返回有效会话');
  const d=designStore(r),previousId=s.id;
  s.id=remote.id;
  if(d.current===previousId)d.current=s.id;
  applyDesignRemote(s,remote);
  localStorage.setItem(`studio-partner-design:${r.id}`,s.id);
}
function designStream(r,s) {
  if(!s.remoteId||s.stream)return;
  const es=new EventSource(`/api/design/sessions/${encodeURIComponent(s.id)}/events`);
  s.stream=es;
  es.onmessage=e=>{try{applyDesignRemote(s,JSON.parse(e.data));render();}catch{} };
  es.onerror=()=>{if(s.busy){s.error='Design 事件连接中断，正在尝试恢复';render();}};
}
async function ensureDesignSession(r) {
  const d=designStore(r),s=designSession(r);
  if(s.remoteId){designStream(r,s);return s;}
  if(d.loading)return s;
  d.loading=true;render();
  try { const remote=await api('/api/design/sessions',{method:'POST',body:'{}'});bindDesignSession(r,s,remote);designStream(r,s); }
  catch(e){s.error=e.message;s.status='连接失败';}
  finally {d.loading=false;render();}
  return s;
}
async function restoreDesignSession(r) {
  const d=designStore(r),s=designSession(r),saved=localStorage.getItem(`studio-partner-design:${r.id}`);
  if(s.remoteId||!saved)return ensureDesignSession(r);
  d.loading=true;render();
  try {const remote=await api(`/api/design/sessions/${encodeURIComponent(saved)}`);bindDesignSession(r,s,remote);designStream(r,s);}catch{localStorage.removeItem(`studio-partner-design:${r.id}`);d.loading=false;await ensureDesignSession(r);}finally{d.loading=false;render();}
  return s;
}
function newDesignSession(r) {
  const d=designStore(r),s=createDesignSession();d.sessions.push(s);d.current=s.id;ensureDesignSession(r);return s;
}
function fileSize(n) { return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`; }
function fileThumbnail(f) { return f.type?.startsWith('image/')&&f.url?`<img src="${f.url}" alt="${esc(f.name)}"/>`:icon(f.type?.startsWith('image/')?'image':'file'); }
function attachment(f,removable=false) { return `<div class="attachment"><button type="button" class="attachment-open" data-preview-file="${f.id}">${fileThumbnail(f)}<span>${esc(f.name)}<small>${fileSize(f.size)}</small></span></button>${removable?`<button type="button" class="icon-button" data-remove-attachment="${f.id}" aria-label="移除附件 ${esc(f.name)}">${icon('close')}</button>`:''}</div>`; }
function workspace(s) {
  return `<aside class="workspace card" aria-label="Design 工作区"><div class="design-head">${icon('folder')}<strong>工作区</strong><button class="icon-button workspace-close" data-action="toggle-workspace" aria-label="收起工作区">${icon('close')}</button></div><div class="workspace-toolbar"><span>${s.files.length} 个文件</span>${button('上传','upload','tiny','upload')}</div><div class="workspace-files">${['input','output'].map(kind=>`<h4>${kind==='input'?'上传文件':'生成文件'}</h4>${s.files.filter(f=>f.kind===kind).map(f=>`<div class="workspace-file"><button class="file-main" data-preview-file="${f.id}">${fileThumbnail(f)}<span><strong>${esc(f.name)}</strong><small>${fileSize(f.size)}</small></span></button><div class="workspace-file-actions"><button class="text-button" data-attach-file="${f.id}" aria-label="引用 ${esc(f.name)}">引用</button>${f.remote?`<a class="icon-button" href="/api/design/sessions/${encodeURIComponent(s.id)}/file?path=${encodeURIComponent(f.path)}&download=1" download="${esc(f.name)}" aria-label="下载 ${esc(f.name)}">${icon('download')}</a>`:`<a class="icon-button" href="${f.url}" download="${esc(f.name)}" aria-label="下载 ${esc(f.name)}">${icon('download')}</a>`}</div></div>`).join('')||`<p class="workspace-empty">${kind==='input'?'上传文件后会出现在这里。':'Design Agent 生成的文件会展示在这里。'}</p>`}`).join('')}</div><div class="workspace-footer">文件上传到当前 Design 工作区。图片读取能力取决于当前 Agent。</div></aside>`;
}
function design(r) {
  const d=designStore(r),s=designSession(r);
  const status=s.error||s.status||(d.loading?'正在连接 Design Agent':'Design 就绪');
  return `<div class="design-layout ${state.workspace?'with-workspace':''}" id="design-dropzone"><section class="card design-chat"><div class="design-head"><span class="tiny-avatar">${icon('spark')}</span><strong>Design</strong><small class="design-status" role="status">${s.busy&&!s.interaction?'<span class="design-spinner" aria-hidden="true"></span>':''}${esc(status)}</small><div class="design-head-actions"><select id="design-session-select" aria-label="Design 历史对话">${d.sessions.map(x=>`<option value="${x.id}" ${x.id===s.id?'selected':''}>${esc(redactDesignText(x.title))}</option>`).join('')}</select>${button('新对话','new-design','tiny','plus')}<button class="btn tiny ${state.workspace?'selected':''}" data-action="toggle-workspace" aria-expanded="${state.workspace}">${icon('folder')}工作区</button></div></div><div class="design-messages" id="design-messages" role="log" aria-label="Design 消息" aria-live="polite"><div class="design-day">今天</div>${s.messages.map(m=>`<div class="design-message ${m.role}"><span class="tiny-avatar ${m.role==='user'?'user-avatar':''}">${icon(m.role==='user'?'user':'spark')}</span><div class="design-message-body"><div class="message-meta"><strong>${m.role==='user'?'你':'Design'}</strong><span>${m.time||''}</span></div>${m.text?`<div class="design-message-text ${m.role==='assistant'?'design-markdown':''}">${m.role==='assistant'?renderDesignMarkdown(m.text):esc(redactDesignText(m.text))}</div>`:(m.role==='assistant'&&s.busy?'<div class="design-message-text thinking"><span class="design-dots" aria-hidden="true"><i></i><i></i><i></i></span>Design 正在处理…</div>':'')}${m.files?.length?`<div class="attachments">${m.files.map(f=>attachment(f)).join('')}</div>`:''}</div></div>`).join('')}</div>${s.interaction?`<div class="design-approval"><strong>需要确认后继续</strong><span>${esc(s.interaction.detail?.reason||'Design Agent 请求执行一项操作。')}</span><div>${button('允许本次','design-accept','primary','check')}${button('拒绝','design-decline')}</div></div>`:''}<form class="design-compose" id="design-form"><div class="attachments pending-attachments">${s.pending.map(f=>attachment(f,true)).join('')}</div><textarea name="prompt" id="design-prompt" aria-label="Design 消息输入" placeholder="描述你的想法，或粘贴图片…" rows="2" ${s.busy?'disabled':''}>${esc(s.prompt)}</textarea><div class="composer-toolbar"><div class="composer-tools">${button('添加附件','upload','tiny','clip')}<small>支持文件、图片与拖入</small></div>${s.busy?button('停止','design-stop','tiny'): '<button class="btn primary tiny" aria-label="发送 Design 消息">'+icon('send')+'发送</button>'}</div></form><div class="compose-hint">Enter 发送 · Shift + Enter 换行 · Design Agent 会生成可下载的配置文件</div><input id="design-files" type="file" multiple accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.json,.csv,.docx,.xlsx" hidden/><div class="drop-overlay">${icon('upload')}拖放文件到这里</div></section>${state.workspace?workspace(s):''}</div>`;
}
async function addFiles(fileList) {
  const r=currentRobot(),s=designSession(r),errors=[];
  for(const f of fileList) {
    if(!/\.(png|jpe?g|gif|webp|pdf|txt|md|json|csv|docx|xlsx)$/i.test(f.name)){errors.push(`${f.name}：暂不支持此格式`);continue;}
    if(f.size>10*1024*1024){errors.push(`${f.name}：超过 10 MB`);continue;}
    if(s.pending.length>=10){errors.push('每条消息最多添加 10 个附件');break;}
    if(s.files.length>=50){errors.push('工作区最多保存 50 个文件');break;}
    const imageExt=f.name.split('.').pop().toLowerCase();
    const type=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'}[imageExt])||f.type||'application/octet-stream';
    const item={id:uid(),name:f.name,kind:'input',type,size:f.size,blob:f,url:URL.createObjectURL(f)};
    s.files.push(item);s.pending.push(item);
  }
  render();
  if(errors.length)toast(errors.join('；'));else if(fileList.length)toast('附件已添加，发送消息时会上传到 Design 工作区');
  document.getElementById('design-prompt')?.focus();
}
async function previewFile(id) {
  const s=designSession(currentRobot()),f=s.files.find(f=>f.id===id)||s.messages.flatMap(m=>m.files).find(f=>f.id===id);
  if(!f)return toast('文件已不可用');
  let body;
  if(f.remote){const r=await fetch(`/api/design/sessions/${encodeURIComponent(s.id)}/file?path=${encodeURIComponent(f.path)}`);if(!r.ok)throw new Error('文件读取失败');if(f.type?.startsWith('image/')){f.url=URL.createObjectURL(new Blob([await r.arrayBuffer()],{type:f.type}));body=`<img class="file-preview-image" src="${f.url}" alt="${esc(f.name)}"/>`;}else if(/\.(txt|md|json|csv)$/i.test(f.name)&&f.size<=1024*1024)body=`<pre class="file-preview-text">${esc(await r.text())}</pre>`;else body=`<div class="empty-state compact">${icon('file')}<strong>此文件可下载查看</strong><p>在线预览支持 1 MB 以内的文本文件。</p></div>`;}
  else if(f.type.startsWith('image/'))body=`<img class="file-preview-image" src="${f.url}" alt="${esc(f.name)}"/>`;
  else if(/\.(txt|md|json|csv)$/i.test(f.name)&&f.size<=1024*1024)body=`<pre class="file-preview-text">${esc(f.text??await f.blob.text())}</pre>`;
  else body=`<div class="empty-state compact">${icon('file')}<strong>此文件可下载查看</strong><p>在线预览支持图片和 1 MB 以内的文本文件。</p></div>`;
  const href=f.remote?`/api/design/sessions/${encodeURIComponent(s.id)}/file?path=${encodeURIComponent(f.path)}&download=1`:f.url;
  modal(f.name,`<p class="muted">${fileSize(f.size)}</p>${body}`,`<a class="btn primary" href="${href}" download="${esc(f.name)}">${icon('download')}下载文件</a>`);
}
function settings() {
  const s=state.settings||{};
  return `<h1>连接配置</h1><p class="settings-desc">配置服务地址与访问凭证，连接信息仅保存在本机后端。</p>${state.settingsLoading?'<div class="empty-state">正在读取连接配置…</div>':''}<form id="settings-form" class="settings-grid"><section class="card settings-card"><h2>${icon('voice')}Voice PaaS</h2><label class="field">服务地址<input name="voiceBase" value="${esc(s.voiceBase||'')}" required/></label><label class="field">API Key<input name="voiceKey" type="password" placeholder="${s.voiceKeyConfigured?'已配置 · 留空保留':'填写 Voice PaaS API Key'}" autocomplete="new-password"/><small>仅保存在后端；已有 Key 不会回显。</small></label><label class="field">默认模型<input name="model" value="${esc(s.model||'latentx-realtime-2.5-mini')}" required/></label><button type="button" class="btn tiny" data-action="check-voice">检查 Voice PaaS 连接</button></section><section class="card settings-card"><h2>${icon('spark')}Design Agent</h2><label class="field">服务地址<input name="designBase" value="${esc(s.designBase||'')}" placeholder="https://agent.example.com/api"/></label><label class="field">访问凭证<input name="designToken" type="password" placeholder="${s.designKeyConfigured?'已配置 · 留空保留':'填写 Design Agent Key / Token'}" autocomplete="new-password"/><small>仅保存在后端；已有凭证不会回显。</small></label><div class="field-grid"><label class="field">Agent ID<input name="agentId" value="${esc(s.agentId||'')}"/></label><label class="field">版本 ID（可选）<input name="releaseId" value="${esc(s.releaseId||'')}" placeholder="默认使用已发布版本"/></label></div><button type="button" class="btn tiny" data-action="check-design">检查 Design Agent 连接</button></section><div class="settings-footer"><span id="settings-status">${state.settingsLoading?'正在读取配置…':'连接信息已安全保存于本机后端'}</span><button class="btn primary">保存配置</button></div></form>`;
}
function modal(title,body,foot='') {
  if(dialog.open)dialog.close();
  dialog.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button class="close" aria-label="关闭弹窗" data-close>×</button></div><div class="dialog-body">${body}</div>${foot?`<div class="dialog-foot">${foot}</div>`:''}`;
  dialog.setAttribute('aria-labelledby','dialog-title');dialog.showModal();
}
async function skillForm(r,id) {
  const reference=r.skills.find(s=>s.id===id);
  if(reference?.referenceOnly){try{const full=await api(`/api/partner/skills/${encodeURIComponent(reference.id)}/versions/${encodeURIComponent(reference.version)}`);Object.assign(reference,{markdown:full.markdown,content:full.markdown,resources:full.resources,required_tools:full.required_tools,referenceOnly:false});}catch(e){toast(e.message);return;}}
  const s=r.skills.find(s=>s.id===id),v=s||{id:'',name:'',description:'',content:'',preload:false};
  modal(s?'编辑业务 Skill':'创建业务 Skill',`<form id="skill-form" data-edit-id="${esc(id||'')}"><div class="field-grid"><label class="field">Skill 名称<input name="name" required maxlength="80" value="${esc(v.name)}" placeholder="例如：订单查询流程"/></label><label class="field">Skill 标识<input name="id" required pattern="[a-z](?:[a-z0-9]|-){1,63}" maxlength="64" ${s?'readonly':''} value="${esc(v.id)}" placeholder="例如：order-support"/><small>2–64 位小写字母、数字或连字符，以字母开头。</small></label></div><label class="field">用途说明<input name="description" required maxlength="300" value="${esc(v.description)}" placeholder="什么情况下使用此 Skill"/></label><label class="field">Skill 内容<textarea name="content" required maxlength="20000" placeholder="编写处理步骤、业务规则和回复要求，支持 Markdown。">${esc(v.content)}</textarea></label><label class="check-field"><input type="checkbox" name="preload" ${v.preload?'checked':''}/>在会话开始时预加载</label><p class="muted">${s?'保存为新版本引用，已发布历史版本保持不变。':'创建后加入当前机器人的配置草稿。'}保存机器人草稿后提交服务；历史发布版本保持不变。</p><p id="skill-error" class="form-error" role="alert" hidden></p><div class="form-actions">${button('取消','close')}<button class="btn primary">${s?'保存 Skill':'创建 Skill'}</button></div></form>`);
}
function jsonConfig(r) { return {llm:r.model,instructions:r.instructions,temperature:0.2,max_tokens:512,skills:r.skills.map(s=>({id:s.id,version:String(s.version),preload:s.preload})),mcp_refs:[],tools:[]}; }
function render() {
  const loc=route(),r=currentRobot();
  const body=loc.view==='robots'?list():loc.view==='settings'?settings():!r?list():loc.tab==='sessions'&&loc.sessionId?actualConversation(r,loc.sessionId):header(r,loc.tab)+({overview:actualOverview,config,sessions:actualSessions,design}[loc.tab]||config)(r);
  app.innerHTML=shell(body,r);
  const log=document.getElementById('design-messages');if(log)log.scrollTop=log.scrollHeight;
  const key=loc.view==='robot'&&r?`${loc.id}/${loc.tab}/${loc.sessionId||''}`:'';
  if(key&&key!==loadedRouteKey){loadedRouteKey=key;if(loc.tab==='sessions'||loc.tab==='overview'){state.callsLoading=true;api('/api/partner/conversations?limit=100').then(page=>{state.calls=Array.isArray(page)?page:(page.items||[]);state.callsNextCursor=Array.isArray(page)?'':(page.next_cursor||'');state.callsLoading=false;render();}).catch(()=>{state.callsLoading=false;render();});}if(loc.tab==='sessions'&&loc.sessionId){state.detailLoading=true;state.callDetail=null;api(`/api/partner/conversations/${encodeURIComponent(loc.sessionId)}`).then(c=>{state.callDetail=c;state.detailLoading=false;render();}).catch(x=>{state.detailLoading=false;state.detailError=x.message;render();});}if(loc.tab==='config'&&r.readOnly)loadModelOptions();if(loc.tab==='design'&&r)restoreDesignSession(r);}
  if(loc.view==='settings'&&loadedRouteKey!=='settings'){loadedRouteKey='settings';state.settingsLoading=true;api('/api/settings').then(s=>{state.settings=s;state.settingsLoading=false;render();}).catch(x=>{state.settingsLoading=false;toast(x.message);render();});}
}
document.addEventListener('click',async e=>{
  if(e.target.closest('[data-close]')){dialog.close();return;}
  const nav=e.target.closest('[data-go]');if(nav){go(nav.dataset.go);return;}
  const filter=e.target.closest('[data-filter]');if(filter){state.filter=filter.dataset.filter;render();return;}
  const r=currentRobot();
  const removeKnowledge=e.target.closest('[data-remove-knowledge]');
  if(removeKnowledge){r.knowledge_refs.splice(Number(removeKnowledge.dataset.removeKnowledge),1);markDraft(r);render();toast('已从草稿移除知识，请保存配置');return;}
  const attachKnowledge=e.target.closest('[data-knowledge-index]');
  if(attachKnowledge){const value=state.knowledge[Number(attachKnowledge.dataset.knowledgeIndex)];r.knowledge_refs||=[];if(!r.knowledge_refs.some(k=>k.id===value.id&&k.version===value.version))r.knowledge_refs.push({id:value.id,version:value.version});markDraft(r);dialog.close();render();return;}
  const edit=e.target.closest('[data-edit-skill]');if(edit){skillForm(r,edit.dataset.editSkill);return;}
  const del=e.target.closest('[data-delete-skill]');
  if(del){const s=r.skills.find(s=>s.id===del.dataset.deleteSkill);modal('删除业务 Skill',`<p>从「${esc(r.name)}」的配置草稿中移除「${esc(s.name)}」？</p><p class="muted">已发布的 Skill 历史版本不受影响。</p>`,button('取消','close')+`<button class="btn danger" data-confirm-skill-delete="${esc(s.id)}">确认删除</button>`);return;}
  const confirm=e.target.closest('[data-confirm-skill-delete]');if(confirm){r.skills=r.skills.filter(s=>s.id!==confirm.dataset.confirmSkillDelete);markDraft(r);dialog.close();render();toast('已从当前机器人草稿中移除 Skill，请保存配置');return;}
  const file=e.target.closest('[data-preview-file]');if(file){await previewFile(file.dataset.previewFile);return;}
  const remove=e.target.closest('[data-remove-attachment]');if(remove){const s=designSession(r);s.pending=s.pending.filter(f=>f.id!==remove.dataset.removeAttachment);render();return;}
  const attach=e.target.closest('[data-attach-file]');if(attach){const s=designSession(r),f=s.files.find(f=>f.id===attach.dataset.attachFile);if(s.pending.length>=10)return toast('每条消息最多 10 个附件');if(f&&!s.pending.some(x=>x.id===f.id))s.pending.push(f);render();return;}
  const deleteFile=e.target.closest('[data-delete-file]');
  if(deleteFile){modal('删除工作区文件',`<p>从当前工作区移除此文件？</p><p class="muted">已发送消息中的附件仍保留。</p>`,button('取消','close')+`<button class="btn danger" data-confirm-file-delete="${deleteFile.dataset.deleteFile}">删除文件</button>`);return;}
  const deleteFileConfirm=e.target.closest('[data-confirm-file-delete]');
  if(deleteFileConfirm){const s=designSession(r),id=deleteFileConfirm.dataset.confirmFileDelete,f=s.files.find(f=>f.id===id);s.files=s.files.filter(f=>f.id!==id);s.pending=s.pending.filter(f=>f.id!==id);if(f&&!s.messages.some(m=>m.files.some(x=>x.id===id)))URL.revokeObjectURL(f.url);dialog.close();render();return;}
  const a=e.target.closest('[data-action]')?.dataset.action;if(!a)return;
  if(a==='close')dialog.close();
  if(a==='design')go(`robot/${r.id}/design`);
  if(a==='try'){go(`robot/${r.id}/config`);setTimeout(()=>document.querySelector('.preview-card')?.scrollIntoView({block:'nearest',behavior:'smooth'}),0);}
  if(a==='voice-demo'){const btn=e.target.closest('button');try{if(btn.dataset.active==='true'){window.partnerVoice?.stop();window.partnerVoice=null;btn.dataset.active='false';btn.textContent='开始通话';(document.querySelector('.voice-label')||{}).textContent='通话已结束';return;}if(!r.published)throw new Error('请先校验并发布机器人配置');btn.disabled=true;const {VoiceWebSession}=await import('/sdk/latentx-voice.js');const audio=document.getElementById('voice-preview-audio');const call=new VoiceWebSession({model:r.model,credentialEndpoint:'/api/voice/credential',callConfig:{robotId:r.id},audioElement:audio,onStatus:s=>{(document.querySelector('.voice-label')||{}).textContent=({connecting:'正在连接…',ringing:'等待接通…',active:'正在聆听',ended:'通话已结束'})[s]||s;if(s==='active'){btn.dataset.active='true';btn.textContent='结束通话';btn.disabled=false;}},onError:x=>{toast(x.message);btn.disabled=false;btn.dataset.active='false';},onEnded:()=>{btn.dataset.active='false';btn.textContent='开始通话';btn.disabled=false;}});window.partnerVoice=call;await call.start();}catch(x){toast(x.message||'语音连接失败');btn.disabled=false;}}
  if(a==='json'){const visible={...(r.config||{})};delete visible.mcp_refs;modal('机器人配置',`<pre class="json">${esc(JSON.stringify(visible,null,2))}</pre>`,button('关闭','close'));}
  if(a==='save'){try{await saveDraft(r);toast('配置草稿已保存到 Voice PaaS');}catch(x){toast(x.message);}}
  if(a==='validate'||a==='publish'){try{
    if(r.unsaved)throw new Error('请先保存草稿，再校验或发布');
    await api(`/api/partner/robots/${r.id}/validate`,{method:'POST',body:JSON.stringify({revision:r.revision})});
    r.validated=true;
    if(a==='publish'){await api(`/api/partner/robots/${r.id}/publish`,{method:'POST',body:JSON.stringify({revision:r.revision})});await refreshRobots();toast('配置已发布，新的对话将使用此版本');}
    else toast('Voice PaaS 校验通过');
  }catch(x){toast(x.message);}}
  if(a==='create-knowledge')knowledgeForm();
  if(a==='attach-knowledge'){try{state.knowledge=await api('/api/partner/knowledge');modal('挂载知识资源',state.knowledge.map((k,i)=>`<div class="skill-row"><div class="skill-name"><strong>${esc(k.id)}</strong><small>${esc(k.version)}</small></div><button class="btn" data-knowledge-index="${i}">挂载</button></div>`).join('')||'<p>暂无知识资源，请先创建知识。</p>',button('关闭','close'));}catch(x){toast(x.message);}}
  if(a==='create-skill')skillForm(r);
  if(a==='tools')modal('工具配置',`<p>当前已配置 ${esc((r.config?.tools||[]).length)} 个工具。</p><pre class="json">${esc(JSON.stringify(r.config?.tools||[],null,2))}</pre><p class="muted">工具定义由当前机器人配置提供。</p>`,button('关闭','close'));
  if(a==='refresh'){state.callsLoading=true;render();api('/api/partner/conversations?limit=100').then(page=>{state.calls=Array.isArray(page)?page:(page.items||[]);state.callsNextCursor=Array.isArray(page)?'':(page.next_cursor||'');state.callsLoading=false;render();}).catch(x=>{state.callsLoading=false;toast(x.message);render();});}
  if(a==='load-more'&&state.callsNextCursor){state.callsLoading=true;render();api(`/api/partner/conversations?limit=100&cursor=${encodeURIComponent(state.callsNextCursor)}`).then(page=>{const rows=Array.isArray(page)?page:(page.items||[]);state.calls.push(...rows);state.callsNextCursor=Array.isArray(page)?'':(page.next_cursor||'');state.callsLoading=false;render();}).catch(x=>{state.callsLoading=false;toast(x.message);render();});}
  if(a==='create'){loadModelOptions();modal('创建机器人',`<form id="create-form"><label class="field">类型<select name="type"><option value="voice">语音机器人</option><option value="im">文本机器人</option></select></label><label class="field">名称<input name="name" required placeholder="例如：汽车售后客服"/></label><label class="field">Voice PaaS 模型 ID（可选）<input name="modelId" list="published-model-options" placeholder="填写完整的已发布模型 ID" maxlength="150"/><small>填写已发布模型 ID 可直接绑定；留空则创建新的配置草稿。</small></label>${modelOptions()}<p class="muted">机器人配置和对话均通过 Voice PaaS 提供。</p><button class="btn primary">创建机器人</button></form>`);}
  if(a==='toggle-workspace'){state.workspace=!state.workspace;render();}
  if(a==='upload')document.getElementById('design-files').click();
  if(a==='new-design'){newDesignSession(r);render();document.getElementById('design-prompt')?.focus();}
  if(a==='design-stop'){const s=designSession(r);if(s.remoteId)api(`/api/design/sessions/${encodeURIComponent(s.id)}/cancel`,{method:'POST'}).catch(x=>toast(x.message));}
  if(a==='design-accept'||a==='design-decline'){const s=designSession(r);if(s.remoteId)api(`/api/design/sessions/${encodeURIComponent(s.id)}/interaction`,{method:'POST',body:JSON.stringify({decision:a==='design-accept'?'accept':'decline'})}).catch(x=>toast(x.message));}
  if(a==='check-voice'||a==='check-design'){try{const result=await api('/api/check',{method:'POST',body:JSON.stringify({service:a==='check-voice'?'voice':'design'})});toast(result.message);}catch(x){toast(x.message);}}
});
document.addEventListener('input',e=>{
  if(e.target.id==='robot-search')document.querySelectorAll('.robot-tile').forEach(x=>x.hidden=!x.dataset.name.includes(e.target.value));
  if(e.target.id==='session-search')document.querySelectorAll('[data-session-row]').forEach(x=>x.hidden=!x.textContent.toLowerCase().includes(e.target.value.toLowerCase()));
  if(e.target.id==='transcript-search'){let count=0;document.querySelectorAll('[data-message-text]').forEach(x=>{x.hidden=!x.dataset.messageText.toLowerCase().includes(e.target.value.trim().toLowerCase());if(!x.hidden)count++;});const empty=document.getElementById('transcript-empty');if(empty)empty.hidden=count>0;}
  if(e.target.id==='design-prompt')designSession(currentRobot()).prompt=e.target.value;
  if(e.target.dataset.field){const r=currentRobot(),key=e.target.dataset.field,value=e.target.type==='number'?Number(e.target.value):e.target.value;
    if(['name','instructions','greeting','idle_timeout_ms'].includes(key))r[key]=value;else r.config[key]=value;
    markDraft(r);document.getElementById('save-state').textContent='有未保存修改';}
});
document.addEventListener('change',e=>{
  if(['asr','tts'].includes(e.target.dataset.field)){const r=currentRobot();r.config[e.target.dataset.field]=e.target.value;r.config[`${e.target.dataset.field}_language`]='';markDraft(r);render();}
  if(e.target.id==='design-files')addFiles(Array.from(e.target.files));
  if(e.target.id==='design-session-select'){designStore(currentRobot()).current=e.target.value;const s=designSession(currentRobot());if(s.remoteId)designStream(currentRobot(),s);else ensureDesignSession(currentRobot());render();}
});
document.addEventListener('paste',e=>{
  if(e.target.id!=='design-prompt')return;
  const files=Array.from(e.clipboardData?.files||[]).filter(f=>f.type.startsWith('image/'));
  if(files.length){e.preventDefault();const text=e.clipboardData.getData('text/plain');if(text){e.target.setRangeText(text,e.target.selectionStart,e.target.selectionEnd,'end');designSession(currentRobot()).prompt=e.target.value;}addFiles(files);}
});
document.addEventListener('keydown',e=>{if(e.target.id==='design-prompt'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();document.getElementById('design-form').requestSubmit();}});
let dragDepth=0;
document.addEventListener('dragenter',e=>{if(route().tab==='design'&&e.dataTransfer?.types.includes('Files')){e.preventDefault();dragDepth++;document.getElementById('design-dropzone')?.classList.add('drag-over');}});
document.addEventListener('dragover',e=>{if(route().tab==='design'&&e.dataTransfer?.types.includes('Files'))e.preventDefault();});
document.addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)document.getElementById('design-dropzone')?.classList.remove('drag-over');});
document.addEventListener('drop',e=>{if(route().tab==='design'&&e.dataTransfer?.files.length){e.preventDefault();dragDepth=0;addFiles(Array.from(e.dataTransfer.files));}});
document.addEventListener('submit',async e=>{
  e.preventDefault();const r=currentRobot(),formId=e.target.getAttribute('id');
  if(formId==='skill-form'){
    const f=new FormData(e.target),oldId=e.target.dataset.editId;
    const value={id:String(f.get('id')).trim(),name:String(f.get('name')).trim(),description:String(f.get('description')).trim(),content:String(f.get('content')).trim(),preload:f.has('preload')};
    let error='';
    if(!value.name||!value.description||!value.content)error='请填写名称、用途说明和 Skill 内容。';
    else if(!/^[a-z][a-z0-9-]{1,63}$/.test(value.id))error='请填写有效的 Skill 标识。';
    else if(r.skills.some(s=>s.id===value.id&&s.id!==oldId))error='这个 Skill 标识已存在，请换一个标识。';
    if(error){const el=document.getElementById('skill-error');el.textContent=error;el.hidden=false;return;}
    const existing=r.skills.find(s=>s.id===oldId);value.version=existing?`v${Date.now()}`:'v1';
    if(existing){value.resources=existing.resources;value.required_tools=existing.required_tools;}
    if(existing)r.skills=r.skills.map(s=>s.id===oldId?value:s);else r.skills.push(value);
    markDraft(r);dialog.close();render();toast('Skill 已加入当前机器人草稿，请保存配置');
  }
  if(formId==='knowledge-form'){
    const f=new FormData(e.target),input=Object.fromEntries(f.entries());
    const content=input.markdown;
    input.markdown=/^---\r?\n/.test(content)?content:`---\nname: ${JSON.stringify(input.name)}\ndescription: ${JSON.stringify(input.description)}\n---\n${content}`;
    const btn=e.target.querySelector('button[type=submit],button.primary');btn.disabled=true;
    api('/api/partner/knowledge',{method:'POST',body:JSON.stringify(input)}).then(value=>{r.knowledge_refs||=[];if(!r.knowledge_refs.some(k=>k.id===value.id&&k.version===value.version))r.knowledge_refs.push({id:value.id,version:value.version});markDraft(r);dialog.close();render();toast('知识已创建并挂载，请保存和发布机器人配置');}).catch(x=>{btn.disabled=false;const error=document.getElementById('knowledge-error');error.textContent=x.message;error.hidden=false;});
  }
  if(formId==='design-form'){
    const s=designSession(r),text=s.prompt.trim();if(!text&&!s.pending.length)return;
    const files=[...s.pending];
    (async()=>{try{
      await ensureDesignSession(r);
      if(!s.remoteId)throw new Error(s.error||'Design Agent 连接失败');
      s.busy=true;s.error='';s.status='正在上传附件';render();
      let prompt=text;
      for(const f of files){
        if(!f.remote||!f.path){
          const uploaded=await fetch(`/api/design/sessions/${encodeURIComponent(s.id)}/files?name=${encodeURIComponent(f.name)}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-File-Type':f.type||'application/octet-stream'},body:f.blob});
          const result=await uploaded.json();if(!uploaded.ok)throw new Error(result.error||'附件上传失败');
          Object.assign(f,result,{remote:true,kind:'input',url:f.url,blob:f.blob});
          const existing=s.files.findIndex(x=>x.id===f.id);if(existing>=0)s.files[existing]=f;else s.files.push(f);
        }
        prompt+=`\n\n[附件：${f.name}；工作区路径：${f.path}。请读取并参考该文件。${f.type?.startsWith('image/')?'如果当前 Agent 无法查看图片内容，请明确说明并询问文字补充。':''}]`;
      }
      if(!prompt.trim())return;
      s.prompt='';s.pending=[];s.messages.push({role:'user',text:text||`请参考附件：${files.map(f=>f.name).join('、')}`,files:files.map(f=>({id:f.id,name:f.name,type:f.type,size:f.size,url:f.url})),time:now()});
      if(s.title==='新的对话')s.title=redactDesignText(text||files[0]?.name||'Design 对话').slice(0,22);
      s.messages.push({role:'assistant',text:'',files:[],time:now()});s.busy=true;s.error='';s.status='Design 启动中';render();
      const remote=await api(`/api/design/sessions/${encodeURIComponent(s.id)}/run`,{method:'POST',body:JSON.stringify({text:prompt})});applyDesignRemote(s,remote);designStream(r,s);render();document.getElementById('design-prompt')?.focus();
    }catch(x){s.error=x.message;s.busy=false;s.status='运行失败';render();toast(x.message);}})();
  }
  if(formId==='settings-form'){const f=new FormData(e.target),input=Object.fromEntries(f.entries());(async()=>{try{const saved=await api('/api/settings',{method:'PUT',body:JSON.stringify(input)});state.settings=saved;e.target.querySelectorAll('input[type=password]').forEach(x=>x.value='');render();toast('连接配置已安全保存');refreshRobots();}catch(x){toast(x.message);}})();}
  if(formId==='model-binding-form'){
    const form=e.target,robotId=form.dataset.robotId,btn=form.querySelector('button[type="submit"]');
    const error=form.querySelector('[role="alert"]');
    if(window.partnerVoice){error.textContent='请先结束当前通话，再切换模型';error.hidden=false;return;}
    btn.disabled=true;error.hidden=true;
    try {
      const saved=await api(`/api/partner/robots/${encodeURIComponent(robotId)}/binding`,{method:'PUT',body:JSON.stringify({modelId:new FormData(form).get('modelId')})});
      const target=robots.find(x=>x.id===robotId);if(target)Object.assign(target,saved);
      if(currentRobot()?.id===robotId)render();
      toast('模型 ID 已保存，新对话将使用此模型');
    } catch(x){error.textContent=x.message;error.hidden=false;} finally{btn.disabled=false;}
  }
  if(formId==='create-form'){const d=new FormData(e.target);api('/api/partner/robots',{method:'POST',body:JSON.stringify({type:d.get('type'),name:d.get('name'),modelId:d.get('modelId')})}).then(robot=>{dialog.close();robots.push(robot);go(`robot/${robot.id}/config`);toast(robot.readOnly?'已绑定 Voice PaaS 已发布模型':'机器人配置草稿已创建');}).catch(x=>toast(x.message));}
  if(formId==='test-form'){toast('请使用完整文本客服 H5 进行对话');}
});
window.addEventListener('pagehide',()=>{window.partnerVoice?.stop();});
window.addEventListener('hashchange',()=>{window.partnerVoice?.stop();window.partnerVoice=null;if(dialog.open)dialog.close();dragDepth=0;loadedRouteKey='';render();window.scrollTo(0,0);});
render();
refreshRobots();
