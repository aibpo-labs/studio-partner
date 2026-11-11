---
name: latentx-partner-im
description: 在合作伙伴应用中接入或扩展 LatenTX 文本 IM，复用 studio-partner 的 Realtime WS 适配与聊天界面。
---

项目根目录是此文件的 `../..`。先读 `server/im.mjs` 与 `src/im-chat/ChatPage.tsx` 的 IM 组件，再按用户应用结构移植，保持文本、语音、Design 的最小功能边界。

- 浏览器连接客户自己的后端；后端带 Bearer API Key 连接 `/v1/realtime?model=...`，不要将长期 Key 放入前端。
- 等待 session.created，发送 text-only session.update，收到 session.updated 后才发送用户消息和 response.create。同一 WS 承载多轮上下文。
- 消费文本 delta 和 response.done；done 的 cancelled / failed 不应显示为成功。停止应发送 response.cancel；关闭页面释放上游连接。
- 已发布模型的 session.update 仅声明文本输出，不覆盖 instructions/tools，不发送 tool_choice:none，保留 Skill 与知识库的内置读取能力。外部 Function/MCP 尚未适配，启动前明确拒绝；扩展卡片或业务行为前核对官方契约。
- 核验首轮回复和次轮上下文；自动测试优先使用已有 Socket stub。只有用户授权时才用真实 Key 做少量计费调用。

协议入口：https://api.latenth.com/docs/realtime-api.html 。连接配置复用 `server/settings.mjs`；运行方式见根目录 README。
