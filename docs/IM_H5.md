# IM H5 组件与接入指南

H5 是可独立使用的 React 前端，通过 `im-h5.html` 进入。工作台中的 iframe 只是嵌入入口，与独立页面使用相同的组件和交互，不维护另一套缩减版聊天框。

## 已包含的界面

- 开始新对话、使用会话编号恢复本地历史。
- 欢迎语、五个快捷入口、分组常见问题、换一批、底部追问词和输入联想。
- 多轮消息、流式回复、Markdown 列表/表格/代码、生成中和错误状态。
- 图片选择、拍照入口、剪贴板图片、发送前预览/移除，以及消息中的图片查看。
- 七类版本化卡片及未知组件/版本的降级展示。
- 流程分支选择、信息确认与修改、排队状态、接入/结束服务、满意度与星级评价。
- 手机布局、安全区域、桌面手机宽度展示与工作台内嵌。

图片、卡片和人工服务的完整交互目前由演示适配器提供。照片入口可用；拍照是否调用相机取决于设备和浏览器。桌面文件选择不等于完成了真机拍照验证。

## 目录

| 文件 | 职责 |
| --- | --- |
| `src/im-chat/ChatPage.tsx` | 会话状态、消息时间线、发送框、图片和服务状态 |
| `src/im-chat/welcome-panels.tsx` | 欢迎区、分组问题和快捷入口 |
| `src/im-chat/presentation.ts` | 通用欢迎语、问题、入口文案；可由伙伴替换 |
| `src/im-chat/cards.tsx` | 七类卡片的实际 React renderer |
| `src/im-chat/card-contracts.ts` | 版本、类型、字段、动作与组件注册 |
| `src/im-chat/card-model.ts` | 事件到卡片模型的校验与转换 |
| `src/im-chat/use-im-event-stream.ts` | 事件订阅、顺序去重和恢复入口 |
| `src/im-chat/transport.ts` | 浏览器连接入口与能力声明 |
| `src/im-chat/transport-core.mjs` | 会话、事件和真实 WebSocket 适配 |
| `src/im-chat/demo-content.mjs` | 无客户数据的可交互样例 |
| `src/im-chat/main.tsx` | H5 入口与组件示例目录 |
| `src/im-chat/h5.css` | 独立样式构建与响应式布局 |

H5 单独加载 Tailwind 样式，避免影响工作台。修改 H5 后执行 `npm run build`，刷新即可。工作台预览服务会读取构建产物中的 H5 HTML、JS 和 CSS。

## 卡片契约

这些是应用内部的 UI 展示契约，不是对 Voice PaaS 现有协议的声明。

| 组件 | 内容与交互 |
| --- | --- |
| `qa-card@1.0` | 问题、答案、关联问题；关联问题作为新文本发送 |
| `sop-first-turn-card@1.0` | 流程说明与分支；`select` 携带 `branchId` |
| `sop-confirmation-card@1.0` | 信息摘要、返回修改与确认；`revise` / `confirm` |
| `service-rating-card@1.0` | 是否解决与 1–5 星；`submit` 携带 `positive`、`rating` |
| `choice-card@1.0` | `options` 或 `action-list`；选项转换为文本提问 |
| `content-card@1.0` | `feature-list`、`entity`、`key-value` |
| `status-card@1.0` | `progress`、`active`、`cancelled`、`completed` |

卡片包含 `cardId`、`component`、`componentVersion`、`properties`、`actions`。相同 `cardId` 更新原卡片，新增卡片使用新 ID。字段定义以 `card-contracts.ts` 为准。

动作带 `prompt` 时发送普通消息；否则调用适配器的 Action 方法。实际后端应验证允许的动作及 payload，并处理幂等键。前端等待确认事件更新已提交状态，不将按钮点击直接视为业务成功。

## 演示与真实模式

| 能力 | `mode=demo` | `mode=live` |
| --- | --- | --- |
| 文字 | 本地固定示例 | 应用 `/api/im` WebSocket → Voice PaaS |
| 卡片 / Action | 本地样例、载荷校验与幂等 | 尚未接入，拒绝调用 |
| 图片 | 本地 Blob 展示，不识别 | 尚未接入，入口禁用 |
| 人工服务 | 排队、接入、结束和评价的模拟流程 | 未配置，入口禁用 |
| 历史 | 当前标签页的本地历史 | 当前标签页的本地历史；不会恢复已关闭的云端上下文 |

未传 `mode` 时默认使用演示。真实连接失败时不会静默切回演示。真实模式使用连接配置中的模型与后端 Key，前端不持有长期凭证，也不通过名称或示例 Robot ID 猜测云端机器人归属。

## 如何扩展

1. 真实模式优先读取 `.local/partner-robots.json` 对应机器人条目的 `presentation`，通过 `GET /api/partner/robots/{id}/presentation` 返回展示内容。可设置 `greeting`、`entryDescription`、`quickPrompts`、`questionGroups`、`followUpPrompts` 和 `inputSuggestions`。问题项使用 `{label,prompt,hot?}`；`questionGroups` 是“分类名 → 批次数组 → 问题数组”。省略底部追问词时复用快捷入口，省略输入联想时使用分类问题。快捷入口可选 `icon`：`ticket`、`guide`、`travel`、`wifi`、`shopping`、`eligibility`。修改绑定文件后重启后端并刷新 H5；业务专属文案保存在本地配置，不写进公共组件。未配置时使用 `presentation.ts` 的通用样例；不需要修改消息渲染器。
2. 对接文件服务后开启 `images` 能力。上传完成后把经过授权的图片引用传给实际服务，不把本地 Blob 地址当云端文件地址。
3. 将实际业务结果转换为 UI 卡片事件；把操作交给后端验证和执行。不要从任意模型文本中直接执行指令或发布配置。
4. 对接人工系统后开启 `handoff` 能力，以真实系统事件驱动队列和接入状态。
5. 如需新增卡片，在契约中注册新 `component@version`、添加 renderer 和演示数据，再验证未知版本回退及移动端布局。
6. 需要跨设备历史时，由伙伴应用持久化消息、卡片和事件游标；不要将 sessionStorage 作为正式历史数据库。

基础验收应覆盖文本多轮、失败恢复、重复动作、卡片原位更新、消息顺序、图片限制、历史恢复和移动端输入。`npm test` 包含传输适配和卡片流程测试，使用本地模拟 Socket，不产生模型用量。
