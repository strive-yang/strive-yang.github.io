# B 版：飞书产品界面与科技感

- 生成方式：内置 `image_gen.imagegen`，单次生成；未使用 CLI/API。
- 生成日期：2026-10-21。
- 类型：新图生成；官方飞书图只作品牌参考，不是编辑旧图。
- 参考来源：https://www.feishu.cn/news/iPad
- 原始 CDN：https://sf3-scmcdn-cn.feishucdn.com/obj/tos-cn-v-826391/64f8aff445b54e42a604acc4f78d7c49
- 参考本地文件：`feishu-official-reference.png`（实际 JPEG 内容）。生成前已通过 view_image 检查。
- 原始输出：`C:\Users\admin\.codex\generated_images\01a15dda-21b1-79a1-a7ba-8309f57de0f8\exec-76336a69-9850-480a-ab19-6926210a7b9d.png`
- 项目输出：`option-b.webp`，1536 × 1024，WebP quality 94。只压缩格式，未再编辑图像。
- 设计说明：以 Wiki 目录和证据型资料卡为主，蓝青光路串起来源、Agent 与 MCP；墨绿侧栏承接网站配色，突出飞书官方双色图标与字样。
- 视觉核验：Logo 清楚、资料卡层次明确、SOURCE → AGENT → MCP 流程可辨；有 CONCEPT VISUAL 概念标记，没有虚构 KPI。模型在问题标题增加了一句准确的项目说明，未影响事实含义。

## 最终完整提示词

```text
Use case: ui-mockup
Asset type: 3:2 landscape, 1536x1024 website project showcase image, candidate B.
Primary request: Design a premium, technologically sophisticated product visualization for the open-source project "feishu-worker", showing articles becoming evidence-backed knowledge cards inside Feishu Wiki through an existing Agent and official Feishu MCP.
Input image 1: BRAND REFERENCE ONLY. Preserve the recognizable Feishu folded paper-plane logo silhouette and its cyan/green left wing and vivid blue right wing. Include the familiar 飞书 wordmark accurately. This is a new composition, not an edit of the reference.
Scene/backdrop: near-white porcelain studio background with an extremely fine engineering grid and subtle pale cyan edge light. No natural objects.
Subject: The central and largest object is a beautifully designed white floating Feishu Wiki window, front-facing with a gentle perspective tilt. A narrow dark forest-green Wiki sidebar contains a neat knowledge tree with folder and document glyphs, one active child page highlighted. The document panel has a clear technical knowledge-card design: large question title, elegantly arranged sections with a miniature line diagram, exact short English section labels CONTEXT, METHOD, EVIDENCE, APPLICATION. Include a crisp small evidence strip with tiny document/link source icons and a provenance line. Use intentional thin gray typographic rules for body content, not long pseudo-text.
A smaller source article pane sits to the left with an article thumbnail, title strokes and the exact label SOURCE. Between source and Wiki, one thin glowing blue/cyan data pathway passes through two tiny precision nodes labelled AGENT and MCP, with a subtle return loop from the Wiki to MCP to imply read-back verification. Do not use a brain, robot, magic cube, or giant glowing orb.
The Feishu official logo and wordmark appear prominently on a white floating brand tile above the Wiki window, beautifully integrated, large enough to be unmistakable at thumbnail size. The project name "feishu-worker" appears once in precise dark green sans-serif typography near the top left. Include the tiny footer "CONCEPT VISUAL" so the designed interface is not presented as an actual screenshot.
Style/medium: high-end digital product design art direction, hyper-crisp UI detail, physically plausible layers of thin glass and anodized dark green metal, restrained 3D depth, expensive enterprise software campaign aesthetic. This should feel like a 2026 engineering tool, with authentic Feishu software cues and clear information architecture.
Composition/framing: generous margins, central safe area, all logo and key panels fully visible. Large clear focal object occupying most of the image, strong hierarchy, no excessive empty area. Large text must be accurate, tiny linework can represent content. The entire arrangement feels precise and light, not a dense dashboard.
Lighting/mood: clean luminous soft studio light with controlled blue/cyan edge glow, exceptionally sharp, confident and rigorous.
Color palette: off-white background, dark forest green #173c35, Feishu electric blue #3370ff and bright cyan-green #38dcc0. Blue and cyan provide unmistakable technology accents.
Text (verbatim): "feishu-worker", "飞书", "Wiki", "SOURCE", "AGENT", "MCP", "CONTEXT", "METHOD", "EVIDENCE", "APPLICATION", "CONCEPT VISUAL". No other long text.
Constraints: Depict a workflow using an existing Agent plus official Feishu MCP, not a standalone AI platform. No invented KPI or numerical accomplishment. Feishu logo must match the reference. Keep SaaS design elegant and credible.
Avoid: beige paper craft, paper sculptures, filing cabinets, plants, desks, decorative books, generic abstract blobs, holographic people, generic AI brain, purple gradients, sci-fi clutter, unreadable long text, fake performance charts, watermark.
```
