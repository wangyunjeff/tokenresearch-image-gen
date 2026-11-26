---
name: tokenresearch-image-gen
description: 使用 TokenResearch（词元智研）网关进行文生图、参考图编辑、多图合成、批量出图，或查询已提交任务的本机记录。
---

# TokenResearch Image Gen

使用本文件旁的 Node.js CLI。将下文的 <CLI> 换成本技能目录下 scripts/generate.mjs 的绝对路径。需要 Node.js 18+。

## 选择分组和模型

1. 先运行 `node "<CLI>" --get-config` 检查脱敏配置。缺少 Key 时，引导用户在词元智研控制台选择目标生图分组，将自己的 Key 填入本机环境变量 TOKENRESEARCH_KEY，或在本机使用 --set-key。设置环境变量后重新启动客户端。只查看脱敏结果，避免在对话或日志中收集密钥。[创建密钥](https://www.ciyuanzhiyan.com/#/docs/keys) · [生图分组](https://www.ciyuanzhiyan.com/#/docs/image-faq)
2. 首次使用、切换 Key 或用户询问模型时运行 `node "<CLI>" --list-models`。使用该 Key 所列的目标模型。内置参数清单描述客户端可以构造的请求，可用性和计费以目标分组为准。如果指定模型缺失，告诉用户查询结果，让用户选择分组或模型。[模型广场](https://www.ciyuanzhiyan.com/#/models)
3. 用户指定模型时传 --model。没有指定时使用保存的默认模型，出厂值是 gpt-image-2。只有用户要求修改长期默认模型时才用 --set-model。

## 生成或编辑

```sh
node "<CLI>" --model gpt-image-2 --prompt "白底蓝色圆形" --aspect 1:1 --dry-run
node "<CLI>" --model gpt-image-2 --prompt "一张雨夜城市海报" --aspect 16:9
node "<CLI>" --edit --image "source.png" --prompt "保留构图，改为水彩画"
```

按用户需求传入比例、分辨率、质量、背景或输出格式，以目标模型的参数清单为准。多张参考图按顺序重复 --image。批量提示词使用 --batch 或 --batch-inline，完整参数见 --help。向用户报告脚本实际打印的保存路径。在聊天客户端支持时展示本机生成的图片。

## 长任务与结果恢复

单次生成可能持续数分钟，运行时应保留并轮询同一进程。每次正式提交会先输出任务记录。客户端中断或出现 [NO-AUTO-RETRY] 时，先运行 `node "<CLI>" --job-status` 或指定任务号，汇报已有结果和状态未知的请求。先前请求可能已经计费，只有用户明确要求重新生成时才提交新的付费请求。下载失败但保留了结果清单时，用 --retry-download 重下已有图片。

默认图片保存在 ~/Pictures/tokenresearch-image-gen。沙箱内可能改存到工作目录的 tokenresearch-images。--self-test 验证本地请求构造、结果处理和任务恢复。--dry-run 预览请求，适合在正式提交前核对接口和参数。
