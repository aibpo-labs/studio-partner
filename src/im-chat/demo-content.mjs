// Public, fictional examples. These are UI fixtures, not service responses.
export function card(component, properties, actions=[], cardId) {
  return {component,componentVersion:'1.0',properties,actions,...(cardId?{cardId}:{})};
}
export const ratingCard = () => card('service-rating-card', {
  question:'您对本次服务满意吗？',subtitle:'交互示例 · 评价仅保存在当前浏览器',
  binary_label:'是否解决',positive_label:'是',negative_label:'否',rating_label:'评分',submit_label:'提交评价',
},[{id:'submit',label:'提交评价'}]);
export function demoReply(text, imageCount=0) {
  if(imageCount) return {text:`已收到 ${imageCount} 张图片。\n\n这是图片消息的前端展示示例，尚未调用图片识别或提交业务材料。你可以继续输入文字。`};
  if(/结束人工/.test(text)) return {endHandoff:true};
  if(/人工/.test(text)) return {cards:[card('status-card',{
    context:'human-handoff',state:'progress',icon:'headphones',title:'人工服务流程示例',subtitle:'没有接入真实客服',
    metric:{value:2,label:'位等待中',hint:'示例队列'},description:'体验排队、接入和结束服务的界面；不会创建真实客服请求。',
  },[{id:'cancel',label:'取消排队'},{id:'connect',label:'体验接入'}])]};
  if(/评价|评分/.test(text))return {cards:[ratingCard()]};
  if(/订单信息示例/.test(text))return {cards:[card('content-card',{variant:'key-value',icon:'file',title:'订单信息 · 示例',rows:[{label:'订单编号',value:'DEMO-ORDER-001'},{label:'商品',value:'配件示例 × 1'},{label:'数据来源',value:'本地演示数据'}]})]};
  if(/准备|服务内容/.test(text))return {cards:[card('content-card',{variant:'feature-list',icon:'file',title:'咨询前准备',subtitle:'服务指南',items:[{label:'订单',text:'准备订单编号和商品名称。'},{label:'问题',text:'描述具体问题以及出现时间。'},{label:'材料',text:'需要时提供问题照片，避免包含密码或验证码。'}]},[{id:'next',label:'选择服务类型',prompt:'选择咨询类型'}])]};
  if(/选择咨询|有哪些类型|哪些服务/.test(text))return {cards:[card('choice-card',{variant:'options',title:'您想了解哪类服务？',items:[{id:'order',label:'订单查询',description:'了解订单与配送信息',prompt:'如何查询订单？'},{id:'support',label:'售后服务',description:'退换货与维修指引',prompt:'我想办理售后服务'},{id:'help',label:'使用帮助',prompt:'办理售后需要准备什么？'}]})]};
  if(/售后|退换|退款/.test(text))return {cards:[card('sop-first-turn-card',{name:'售后服务办理',summary:'请选择服务类型，接下来确认申请信息。当前仅演示交互，不提交真实申请。',branches:[{id:'return',label:'退货咨询',description:'了解退货材料和核实流程'},{id:'exchange',label:'换货咨询',description:'确认商品和换货原因'},{id:'repair',label:'维修咨询',description:'确认问题并准备维修材料'}]},[{id:'select',label:'选择服务'}])]};
  if(/订单|配送|送达/.test(text))return {cards:[card('qa-card',{answer_label:'服务指南',question:text,answer:'请先准备订单编号，并通过商家的正式渠道查询订单和物流信息。\n\n在未取得真实查询结果前，不确认订单状态或承诺送达时间。当前页面不执行真实订单查询。',related_questions:[{id:'materials',label:'办理售后需要准备什么？',prompt:'办理售后需要准备什么？'},{id:'support',label:'我想办理售后服务',prompt:'我想办理售后服务'}]})]};
  return {text:'## 在线服务助手\n\n你可以从下方选择需要的服务：\n\n- **订单咨询**：查看问答与关联问题。\n- **售后办理**：体验流程选择和信息确认。\n- **服务评价**：体验满意度与星级评分。\n\n> 当前是交互示例，这条回复没有调用模型。'};
}
export function demoAction(source, actionId, payload={}) {
  if(source.component==='sop-first-turn-card'&&actionId==='select'){
    const selected=source.properties.branches.find(b=>b.id===payload.branchId);
    if(!selected)throw new Error('请选择有效的服务类型');
    return {cards:[card('sop-confirmation-card',{title:'确认咨询信息',description:'请核对以下内容。本地示例不会发起实际申请。',rows:[{label:'服务类型',value:selected.label},{label:'商品信息',value:'配件示例'},{label:'处理方式',value:'先核实，再提供办理指引'}],confirm_label:'确认信息',revise_label:'重新选择'},[{id:'revise',label:'重新选择',prompt:'我想办理售后服务'},{id:'confirm',label:'确认信息'}])]};
  }
  if(source.component==='sop-confirmation-card'&&actionId==='confirm')return {cards:[card('content-card',{variant:'entity',title:'信息已确认 · 示例',subtitle:'未向任何业务系统提交申请',icon:'check'},[{id:'rating',label:'评价服务',prompt:'我想评价本次服务'}])]};
  if(source.component==='service-rating-card'&&actionId==='submit'){
    if(typeof payload.positive!=='boolean'||!Number.isInteger(payload.rating)||payload.rating<1||payload.rating>5)throw new Error('请选择是否解决和 1–5 星评分');
    return {cards:[card(source.component,{...source.properties,submitted:true},[],source.cardId)]};
  }
  if(source.component==='status-card'&&['connect','cancel'].includes(actionId))return {cards:[card('status-card',{
    ...source.properties,state:actionId==='connect'?'active':'cancelled',title:actionId==='connect'?'已进入人工服务示例':'已取消示例排队',subtitle:actionId==='connect'?'演示客服 · 未连接真实人工座席':'可以继续咨询在线助手',
  },[],source.cardId)]};
  throw new Error('当前卡片不支持此操作');
}
export function componentExamples() {
  return [
    ...demoReply('如何查询订单？').cards,
    ...demoReply('我想办理售后服务').cards,
    ...demoAction(demoReply('我想办理售后服务').cards[0],'select',{branchId:'return'}).cards,
    ratingCard(),
    ...demoReply('选择咨询类型').cards,
    card('choice-card',{variant:'action-list',title:'更多服务',items:[{id:'a',label:'查看服务指南',prompt:'办理售后需要准备什么？'},{id:'b',label:'联系人工服务',prompt:'转人工服务'}]}),
    ...demoReply('办理售后需要准备什么？').cards,
    ...demoReply('查看订单信息示例').cards,
    card('content-card',{variant:'entity',icon:'file',title:'服务资料',subtitle:'查看准备材料与使用说明'},[{id:'read',label:'查看',prompt:'查看服务内容'}]),
    ...demoReply('转人工服务').cards,
    ...['active','completed','cancelled'].map(state=>card('status-card',{state,title:({active:'服务处理中',completed:'服务已完成',cancelled:'服务已取消'})[state],subtitle:'状态样例'})),
    card('future-card',{title:'未来组件'},[]),
  ];
}
