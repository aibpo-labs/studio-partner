---
name: latentx-partner-voice
description: 在合作伙伴应用中接入 LatenTX 网页语音机器人，复用官方 VoiceWebSession SDK、临时凭证和 studio-partner 语音界面。
---

项目根目录是此文件的 `../..`。读 `examples/workbench/app.js` 的语音交互、`server/index.mjs` 的 `/api/voice/credential`、`scripts/sync-sdk.mjs`。

- 用服务器 API Key 调用 `/voice/v1/webrtc/credentials`；只返回短期会话字段，主 Key 不进浏览器。由后端限定模型、提示词和工具权限，不透传任意调用参数。
- `npm run sync-sdk` 下载带校验值的官方 SDK 和许可证，不能手改压缩产物。前端使用 `VoiceWebSession`，不自行拼 SIP。
- 在用户点击后启动，处理麦克风拒绝、播放被拦截、连接失败；静音使用 SDK mute，结束及卸载调用 stop。不得把 SIP 接通等同于实际双向音频通过。
- 最小交付只含声音和状态；不要声称支持实时字幕、外呼或客户端工具回调。
- 验证使用真实浏览器音频收发，记录 RTP 收发和云端会话转写证据。自动化可用 SDK inputStream 或测试专用音频源，不自动批准浏览器权限；明确区分合成测试输入与人工麦克风测试。
- 真实调用按量计费，用户授权后短通验证，完成立即挂断。

官方契约：https://api.latenth.com/docs/phone-integration.html 。根目录 README 说明本地运行与限制。
