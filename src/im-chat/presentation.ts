export interface DemoPrompt { label: string; prompt: string; hot?: boolean; icon?: string }
export interface ImPresentation {
  greeting: string;
  entryDescription?: string;
  quickPrompts: DemoPrompt[];
  questionGroups: Record<string, DemoPrompt[][]>;
  followUpPrompts: DemoPrompt[];
  inputSuggestions: DemoPrompt[];
}
const q = (label: string, hot=false): DemoPrompt => ({label,prompt:label,hot});
const quickPrompts = [
  {label:'订单咨询',prompt:'如何查询订单？'},
  {label:'售后办理',prompt:'我想办理售后服务'},
  {label:'订单信息',prompt:'查看订单信息示例'},
  {label:'服务指南',prompt:'办理售后需要准备什么？'},
  {label:'人工服务',prompt:'转人工服务'},
];
const questionGroups = {
  订单服务: [[q('如何查询订单？',true),q('如何核实配送进度？'),q('如何修改订单信息？'),q('查看订单信息示例')],[q('如何联系订单客服？'),q('查不到订单怎么办？'),q('能否确认送达时间？')]],
  售后办理: [[q('我想办理售后服务',true),q('退换货流程是什么？'),q('办理售后需要准备什么？')],[q('售后服务有哪些类型？'),q('如何确认申请信息？'),q('我想了解退款流程')]],
  使用帮助: [[q('如何使用在线客服？',true),q('选择咨询类型'),q('查看服务内容')],[q('图片可以作为咨询材料吗？'),q('如何恢复已有会话？'),q('还有哪些服务？')]],
  服务评价: [[q('我想评价本次服务',true),q('转人工服务'),q('如何反馈使用体验？')],[q('结束人工服务'),q('服务评价可以打几星？'),q('如何继续咨询？')]],
};
const presentation: ImPresentation = {
  greeting:'您好，我是您的在线服务助手。产品咨询、订单和售后服务方面的问题都可以问我，请描述您遇到的情况。',
  entryDescription:'咨询产品与服务，查看处理指引，继续你的对话。',
  quickPrompts,
  questionGroups,
  followUpPrompts:quickPrompts,
  inputSuggestions:Object.values(questionGroups).flat(2),
};
export function getImPresentation(_robotId: string, custom?: Partial<ImPresentation> | null): ImPresentation {
  if (!custom) return presentation;
  const valid = (items: unknown): items is DemoPrompt[] => Array.isArray(items) && items.length > 0 && items.every(p => typeof p?.label === 'string' && typeof p?.prompt === 'string');
  const groups = Object.fromEntries(Object.entries(custom.questionGroups || {}).filter(([, batches]) => Array.isArray(batches) && batches.length > 0 && batches.every(valid)));
  const quick = valid(custom.quickPrompts) ? custom.quickPrompts : [];
  return {
    greeting: typeof custom.greeting === 'string' ? custom.greeting : '您好，请问有什么可以帮您？',
    entryDescription: typeof custom.entryDescription === 'string' ? custom.entryDescription : '欢迎咨询，开始你的对话。',
    quickPrompts: quick,
    questionGroups: groups,
    followUpPrompts: valid(custom.followUpPrompts) ? custom.followUpPrompts : quick,
    inputSuggestions: valid(custom.inputSuggestions) ? custom.inputSuggestions : Object.values(groups).flat(2),
  };
}
