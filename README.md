# TokenResearch Image Gen

在 Codex、Claude Code 等客户端里，通过词元智研生成或编辑图片。可以传入本地参考图、指定比例、批量生成，并把结果保存到本机。需要 Node.js 18 或更高版本。

## 在 Codex 安装

```sh
codex plugin marketplace add wangyunjeff/tokenresearch-image-gen
codex plugin add tokenresearch-image-gen@tokenresearch-plugins
```

第一条命令从 GitHub 添加插件市场，第二条安装市场里的生图插件。在新对话里输入 `@` 选择 **TokenResearch Image Gen**。访问私有仓库需要有读取权限的 GitHub 账号。

| 其他客户端 | 安装入口 |
| --- | --- |
| Claude Code | 依次执行 `/plugin marketplace add wangyunjeff/tokenresearch-image-gen` 和 `/plugin install tokenresearch-image-gen@tokenresearch-plugins` |
| ZCode | 在插件设置中添加同一 GitHub 仓库，然后选择插件 |
| DeepSeek Harness | 在「添加插件」中输入 `github:wangyunjeff/tokenresearch-image-gen` |
| 支持 SKILL.md 的客户端 | 复制完整的 [tokenresearch-image-gen 技能目录](plugins/tokenresearch-image-gen/skills/tokenresearch-image-gen/) 到客户端的技能目录 |

## 配置自己的生图 Key

登录词元智研控制台，在「API 密钥」中为支持目标图像模型的分组创建 Key。把它填入本机启动客户端的环境变量 `TOKENRESEARCH_KEY`，重启客户端后生效。也可以在本机运行技能目录下的 `node scripts/generate.mjs --set-key` 并传入自己的 Key。保存位置为 `~/.tokenresearch/image-gen.json`，环境变量优先。教程提供密钥创建步骤和分组说明。[创建 API Key](https://www.ciyuanzhiyan.com/#/docs/keys) · [生图分组指南](https://www.ciyuanzhiyan.com/#/docs/image-faq)

默认模型为 `gpt-image-2`。可以先说「列出我的 Key 能用的生图模型」，再说「画一张 16:9 的雨夜城市海报」或「把这张参考图改成水彩画，保留原来的构图」。默认输出目录为 `~/Pictures/tokenresearch-image-gen`。可用模型和价格以当前分组为准。[词元智研模型广场](https://www.ciyuanzhiyan.com/#/models)

## 本机检查

在技能目录中运行以下命令。

```sh
node scripts/generate.mjs --get-config
node scripts/generate.mjs --list-models
node scripts/generate.mjs --model gpt-image-2 --prompt "白底蓝色圆形" --aspect 1:1 --dry-run
```

`--get-config` 显示脱敏配置。`--list-models` 用当前 Key 查询模型列表，`available: true` 表示该分组列出这个模型。`--dry-run` 仅预览请求参数。真实生成或改图会使用分组额度。任务中断后，先运行 `--job-status` 查看本机提交记录，避免重复提交。

## 网关与模型能力

插件向 `https://ciyuanzhiyan.com` 发送带 Bearer Key 的请求。查询分组使用 `GET /v1/models`，文生图和改图通常使用 `POST /v1/images/generations` 和 `POST /v1/images/edits`。使用聊天协议的图像模型由参数清单指定 `POST /v1/chat/completions`。

内置的[模型参数清单](plugins/tokenresearch-image-gen/skills/tokenresearch-image-gen/scripts/image-models.snapshot.json)用于生成请求和离线校验。内置条目仅表示客户端知道如何构造请求，当前账号是否开通以及实际支持的参数需要在目标分组中验证。如果站点发布相同格式的 JSON，可以把其 HTTPS 地址填入 `TOKENRESEARCH_CATALOG_URL`。插件会缓存成功获取的清单 24 小时；默认直接使用内置清单。

开发检查可运行 `npm run check` 和技能目录下的 `node scripts/generate.mjs --self-test`。完整参数见 `node scripts/generate.mjs --help`。
