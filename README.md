# Studio Partner

供合作伙伴构建客服应用的参考工程。产品包含文本机器人、语音机器人、机器人配置、对话管理、Design 和连接配置。机器人配置与运行能力对接 LatenTX Voice PaaS；Design 对接 Design Agent，并使用 LatenTX Agent Skill 设计配置文件。

不包含账号、租户、计费、营销或外呼任务管理。Design 专注于多轮对话、文件与图片、工作区文件，不自动修改或发布机器人配置。

## 使用与开发文档

- [合作伙伴适配与使用指南](docs/PARTNER_GUIDE.md)：环境准备、服务配置、机器人发布、IM/语音试用、Design、二次开发和故障排查。
- [应用架构与接口](docs/ARCHITECTURE.md)：模块、存储、应用接口与扩展边界。
- [IM H5 开发指南](docs/IM_H5.md)：卡片、主题、演示与真实通道。

## 本地运行

需要 Node.js 22.9 或更高版本。主入口是 Studio 风格的机器人工作台：

```bash
npm ci
npm run sync-sdk
npm run build
npm start
```

打开 `http://127.0.0.1:18227/#robots`。可选的 `http://127.0.0.1:18228/#robots` 是同一工作台的本地代理入口，需要 `npm start` 和 `npm run preview:workbench` 同时运行。

- 机器人列表和配置：通过 Voice PaaS 读取、创建、编辑、校验、发布机器人；Skill 支持表单创建、编辑和移除。也可填写或选择已发布模型 ID，直接绑定现有模型。
- 文本机器人：嵌入完整 H5，也可独立打开。包含欢迎入口、分组问题、输入联想、Markdown、图片与消息卡片；演示模式不调用模型，真实模式连接 Voice PaaS。
- 对话管理：展示服务端返回的语音与文本会话记录、消息转写和可用录音。数据范围取决于 PaaS 当前账户与接口返回。
- Design：对接已发布的 Design Agent，支持多轮对话、新建会话、选择/拖放文件、粘贴图片、附件预览、工作区文件下载及需要确认的操作。
- 连接配置：配置 Voice PaaS 地址/Key、Design Agent 地址/凭证/Agent ID/Release ID。凭证只保存在服务端，不回传浏览器。

Design 附件接受 PNG、JPEG、GIF、WebP、PDF、TXT、Markdown、JSON、CSV、DOCX、XLSX；每个文件最多 10 MB，每条消息最多 10 个附件。实际图片理解能力取决于所绑定的 Design Agent。

## IM H5

- 组件演示：`http://127.0.0.1:18227/im-h5.html?mode=demo`，也可从文本机器人的试用区打开。
- 真实文本：访问 `http://127.0.0.1:18227/im-h5.html?mode=live`，或进入应用的文本机器人试用区。
- 两种模式使用同一套 H5 组件。`demo` 展示卡片、图片与人工服务流程，不调用模型或提交业务；`live` 通过应用后端的 Voice PaaS 通道进行文本流式对话。
- 真实通道当前不接收图片或卡片业务操作，也未接入人工座席，相关入口明确禁用。图片识别、卡片 Action 和人工服务需要合作伙伴在适配层接入实际能力，不能用演示结果冒充完成。
- H5 图片示例支持 JPEG、PNG、WebP，每次最多 3 张、每张 5 MB。图片保留在当前页面内存；刷新后仅保留占位说明。
- 会话编号可在对话顶部展开复制。同一标签页可凭编号恢复本地文字和卡片历史；真实连接结束或页面刷新后，需新建会话才能继续模型上下文。

组件与接口扩展说明见 [IM H5 开发指南](docs/IM_H5.md)。

打开 `http://127.0.0.1:18227/#settings`，配置自己的服务：

| 服务 | 必填 | 可选 |
| --- | --- | --- |
| Voice PaaS | 服务地址、API Key、默认模型 ID | 可使用平台返回的自定义模型 ID |
| Design Agent | 平台基址、认证 Key / Token、Design Agent ID | Release ID；留空时读取已发布版本 |

也可以复制 `.env.example` 为 `.env`。配置页保存到 `.local/settings.json`，优先于环境变量。已有 Key 不回显；Key 输入留空时保留原值。更换服务地址时应同时填写新服务的凭证。

Design Agent 由使用者在自己的服务中准备并发布，配置 LatenTX Agent Skill 后即可在本应用中使用。`design-agent/instructions.md` 是可选的行为补充。应用不会替用户创建或发布 Design Agent。

接口示例仅监听本机回环地址。长期 Key 留在后端；语音前端通过官方 SDK 使用临时凭证。对外部署需由合作伙伴根据自己的产品补充访问控制与 HTTPS。

## 开发结构

| 目录 / 文件 | 用途 |
| --- | --- |
| `examples/workbench/` | Studio 风格主工作台 |
| `im-h5.html`、`src/im-chat/` | 独立 H5、完整卡片组件、主题内容、示例与真实文本适配 |
| `server/index.mjs` | 同源 API、WebSocket 和 SDK 静态文件入口 |
| `server/im.mjs` | 文本 Realtime 消息适配 |
| `server/design.mjs` | Design Agent 对话、操作确认和文件工作区 |
| `server/design-client.mjs` | Design Agent 连接与版本选择 |
| `server/settings.mjs` | 配置验证、私有持久化、密钥隐藏 |
| `skills/` | 供开发助手参考的接入 Skill |
| `docs/ARCHITECTURE.md` | 模块边界与后续接入方式 |

修改工作台前端后刷新页面即可；修改 H5 前端后执行 `npm run build`；修改后端后重启服务。运行 `npm test` 执行本地契约检查，不产生云端用量。

H5 的本地历史使用当前标签页的 sessionStorage，最多保存每个会话最近 200 条消息和 400 条更新；存储不可用时仅保留内存数据，不代表云端历史管理。语音和文本会话记录通过 Voice PaaS 查询，按服务账户展示，尚未按机器人隔离。Design 的消息和服务端会话关联保存在 `.local/`，输出预览支持 1 MiB 以内的 JSON、Markdown、文本文件。需要用户确认的操作会在界面中明确提示；生成文件不等于配置已应用或发布。

## 对外导出

```bash
npm run export:partner
```

命令将允许交付的源文件复制到 `.local/exports/studio-partner/`，该目录可由合作伙伴初始化为自己的仓库。导出不包含 `.git`、`.env`、`.local`、依赖、构建产物或运行数据；交付时使用源码导出，连接信息由接收方自行配置。

公开协议入口：

- LatenTX 文档：<https://api.latenth.com/docs/quickstart.html>
- LatenTX Agent Skill：<https://api.latenth.com/skills/latentx/SKILL.md>

实际资源字段与权限以所接入的平台版本为准。
