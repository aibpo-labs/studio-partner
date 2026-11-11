# Studio Partner 应用架构

本说明只介绍合作伙伴应用的模块和服务契约。安装、使用和限制见 [合作伙伴指南](PARTNER_GUIDE.md)。

## 模块边界

```text
浏览器工作台 / IM H5
  └─ 合作伙伴应用后端
       ├─ Voice PaaS：模型配置、版本、IM、语音、通话数据
       ├─ Design Agent：多轮对话、输入文件、配置文件输出
       └─ 应用存储：连接配置、机器人绑定、Design 会话关联
```

| 模块 | 当前实现 |
| --- | --- |
| 主工作台 | `examples/workbench/`，原生 JavaScript 和 CSS，机器人列表、表单、对话管理、Design、连接配置 |
| IM H5 | `src/im-chat/`，React 组件及独立样式；`im-h5.html` 经 Vite 构建后由后端提供 |
| 应用入口 | `server/index.mjs`，同源 HTTP、WebSocket、静态文件和临时语音凭证 |
| 机器人适配 | `server/partner.mjs`，Voice PaaS 草稿、校验、发布、目录、通话列表与详情 |
| IM 适配 | `server/im.mjs`，服务端认证，转发 Realtime 文本与结束事件 |
| Design 适配 | `server/design-client.mjs` 处理服务访问；`server/design.mjs` 管理会话、事件和文件 |
| 设置 | `server/settings.mjs`，环境变量、私有覆盖配置及可公开字段投影 |

浏览器调用应用自己的接口；长期 Key 留在应用后端。业务机器人和 Design Agent 使用不同的服务凭证。公开协议中的模型、ASR、TTS、Skill、WebRTC、WebSocket 等名称是集成所需的术语。

## 数据和状态

机器人绑定保存本地 ID、类型和云端配置 ID。表单先在页面编辑，保存、校验和发布要求页面 revision 与云端一致，过期编辑返回冲突。开始对话时重新读取最新启用版本；若绑定明确的 `model`，则固定该版本并只读展示，禁用时不回退。

Skill 使用 `markdown` 或 `id/version` 引用；独立知识版本通过 `knowledge_refs` 挂载。移除 Skill 不等于删除历史资源版本。应用保存时保留未知云端配置字段。IM 不覆盖已发布模型的提示词或关闭内置读取工具；外部 Function/MCP 暂未适配。语音开场白和静默提醒属于本地 channel 配置，临时凭证请求继承其余模型字段。

IM 在一个 WebSocket 中保持多轮上下文；H5 展示历史在当前标签页存储。服务端没有独立的 IM 历史数据库。语音和 Realtime 文本历史均通过上游会话接口读取，当前为服务账户范围，不能认为按机器人隔离。详情页展示消息、会话信息与录音，不展示协议事件面板。

Design 将本地会话映射到服务端 Session 和 Run。运行时消费 SSE，按 sequence 去重，并用 Last-Event-ID 续接。附件先上传，再将工作区路径加入用户消息。完成后读取输出快照。重启后端只恢复已持久化会话，不自动续跑被中断的任务。文件上传和下载已接入，图片理解取决于 Agent 能力；尚无通用工作区删除或重命名接口。

Design 只产生文件，不自动更新机器人配置。若扩展导入功能，应先校验结构、展示待应用内容，再保存草稿和显式发布。

## 应用接口

以下路径是本项目后端接口，不替代上游服务的公开文档。HTTP 请求使用 JSON，上传文件使用二进制；写请求需带与应用地址一致的 Origin。

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/settings`、`PUT /api/settings` | 读取配置状态、保存连接信息；GET 不返回长期 Key |
| `POST /api/check` | `{ "service": "voice" }` 或 `{ "service": "design" }` 检查连接 |
| `GET /api/partner/published-models` | 当前账户可绑定的启用发布版本，仅返回 model/name/version |
| `PUT /api/partner/robots/{id}/binding` | `{ "modelId": "完整发布模型 ID" }` 更新固定版本机器人的本地绑定 |
| `GET /api/partner/catalog` | 可用资源目录 |
| `GET /api/partner/knowledge`、`POST /api/partner/knowledge` | 列出知识资源；以 id/version/markdown/resources 创建知识版本 |
| `GET /api/partner/skills/{id}/versions/{version}` | 读取已有 Skill 资源版本 |
| `GET /api/partner/robots`、`POST /api/partner/robots` | 读取绑定机器人、创建机器人 |
| `PUT /api/partner/robots/{id}`、`DELETE /api/partner/robots/{id}` | 保存草稿、删除云端配置及本地绑定；删除尚无页面入口 |
| `POST /api/partner/robots/{id}/validate`、`.../publish` | 校验和发布当前服务端草稿 |
| `GET /api/partner/conversations`、`.../{callId}` | 账户范围语音及文本会话列表、详情；列表返回 items/next_cursor，支持 origin/cursor/limit |
| `GET /api/partner/conversations/{callId}/events` | 可选的开发诊断接口，保留 capture_state/items/next_cursor；用户详情页不请求或展示事件 |
| `POST /api/voice/credential` | 用 `robotId` 申请已发布机器人的临时语音凭证 |
| `WS /api/im?robotId={id}` | 发送 `{ "text": "你好" }`；接收 ready/delta/done/error，停止发送 `{ "type": "cancel" }` |
| `POST /api/design/sessions`、`GET /api/design/sessions/{id}` | 创建、读取 Design 会话 |
| `POST /api/design/sessions/{id}/run` | `{ "text": "需求内容" }` 开始一轮 |
| `GET /api/design/sessions/{id}/events` | SSE 会话状态与消息更新 |
| `POST /api/design/sessions/{id}/cancel`、`.../interaction` | 停止；确认体为 `{ "decision": "accept" }` 或 `decline` |
| `PUT /api/design/sessions/{id}/files?name={filename}` | 二进制附件上传，`X-File-Type` 提供文件类型 |
| `GET /api/design/sessions/{id}/file?path={path}` | 按文件清单预览，添加 `download=1` 下载 |

上游服务路径集中在 `server/` 适配器，必须使用服务方支持的真实接口。配置 JSON 中未开放表单编辑的协议字段应保持兼容；不应仅为改名而修改上游字段或事件名称。

## 扩展方式

品牌和表单改工作台；欢迎语改 `presentation.ts`；新增卡片在 `card-contracts.ts` 注册版本并在 `cards.tsx` 渲染，再在适配器中接入实际业务事件。卡片、图片和人工服务的 demo 能力不会自动开放给 live 模式。

需要跨设备历史、多个客户或多实例部署时，应替换本地文件存储，按用户和业务资源做服务端授权与查询。现有代码用于单工作区起步；部署适配和验收顺序见 [合作伙伴指南](PARTNER_GUIDE.md)。
