# VISA POC 文本客服展示模板

此模板只配置 H5 的欢迎语、快捷入口和推荐问题，不包含模型、人设、Skill 知识、Key、租户或机器人绑定。权益是否有效、适用条件等由你绑定的模型和最新业务资料回答；示例问题不代表权益承诺。

## 配置步骤

1. 按 [项目使用指南](../../docs/PARTNER_GUIDE.md) 启动项目、配置自己的服务凭证，并创建文本机器人。可以填写自己账户可用的已发布模型 ID。
2. 在机器人页面 URL 的 `#robot/<id>/config` 中找到本地机器人 ID。
3. 停止本地后端（运行 `npm start` 的终端按 Ctrl+C），备份 `.local/partner-robots.json`。
4. 打开该文件，找到 `id` 相同的机器人对象。将 [visa-poc.json](visa-poc.json) 的完整 JSON 对象放入该机器人的 `presentation` 字段。保留原有 `id`、`customId`、`model`、`type`、`name`、`channel` 等字段；不要用模板覆盖整个机器人或整个文件。
5. 保存合法 JSON，在项目根目录重新执行 `npm start`，刷新工作台/H5。仅修改此配置无需重新构建前端。
6. 点击“开始新对话”，检查欢迎语、快捷标签和“猜你想问”；切换分类、点击“换一批”检查其他批次。

结构示意（省略号仅用于说明，不能直接作为 JSON 保存）：

```text
[
  {
    "id": "你的本地机器人ID",
    ...原有字段,
    "presentation": { ...visa-poc.json 的全部内容 }
  }
]
```

当前没有可视化模板编辑入口。模板按本地机器人单独配置；绑定或更换模型 ID 不会自动导入模板。同一套内容可以复制给多个机器人。

## 字段说明

| 字段 | 作用 |
|---|---|
| `greeting` | 开始对话时显示的欢迎语 |
| `entryDescription` | “开始咨询”入口页说明 |
| `quickPrompts` | 顶部快捷标签；默认也用于底部追问入口 |
| `questionGroups` | 分类名 → 多批问题 → 每批的问题数组；“换一批”切换批次 |
| `followUpPrompts` | 可选，单独设置底部追问入口；省略时复用快捷标签 |
| `inputSuggestions` | 可选，输入联想；省略时使用分类内问题 |
| 问题项 `label` / `prompt` | 显示的文字 / 点击后实际发送的问题，两者都必填 |
| 问题项 `hot` | 可选，设为 `true` 显示“热”标记 |
| 快捷项 `icon` | 可选：`ticket`、`guide`、`travel`、`wifi`、`shopping`、`eligibility` |

## 交付与自定义

- 可在此示例基础上修改文案和问题，创建自己的展示模板。
- `.local/partner-robots.json` 属于本地运行数据，已被 Git 忽略；不要提交该文件、服务凭证或客户私有资料。
- GitHub 中发布的是本目录的独立示例。客户下载后需按上述步骤应用，不会自动覆盖已有机器人。
- 更多组件扩展方法见 [IM H5 开发指南](../../docs/IM_H5.md)。
