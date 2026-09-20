# Agent 说明

本仓库是 `strive-yang.github.io` 的 GitHub Pages 个人网站。

## 项目背景

- 本站是静态 HTML/CSS/JavaScript 项目。
- 本站通过 GitHub Pages 部署到 `github.io` 域名。
- 除非明确新增了工具链，否则应将本仓库视为已发布站点源码，而不是框架应用。
- 不要默认假设需要构建步骤。普通静态文件应可通过 `python -m http.server 8000` 直接预览。

## 部署

- 部署由 `.github/workflows/pages.yml` 中的 GitHub Actions 负责。
- 仓库设置中的 GitHub Pages source 应配置为 `GitHub Actions`。
- 工作流会先上传名为 `github-pages` 的 Pages artifact，然后使用 `actions/deploy-pages` 部署。
- 如果部署提示找不到名为 `github-pages` 的 artifact，应先检查 artifact 上传步骤，再修改站点代码。
- Node 的 `punycode` 废弃警告不是 Pages 部署失败的直接原因。

## 内容结构

- Blog 文章放在 `blog/YYYY/MM/DD/slug/index.html`。
- Blog 元数据放在 `blog/posts.json`。
- Blog 列表和 Archive 页面从 `blog/posts.json` 渲染。
- 新增文章时，需要同时更新文章目录和 `blog/posts.json`。

## 网站更新记录

- 首页“最新内容”是整个网站的更新日志，从根目录下的 `updates.json` 渲染，不只展示 Blog 文章。
- 每次新增或显著更新用户可见的页面、工具、项目、研究成果或站点功能时，必须同时在 `updates.json` 顶部新增一条记录，说明日期、类型、标题、摘要和目标 URL。
- `updates.json` 中每条记录必须包含 `title`、`date`、`type`、`summary` 和 `url` 字段；日期使用 `YYYY-MM-DD`，URL 使用适配 GitHub Pages 的站点绝对路径。
- 更新记录按日期倒序排列；同一天有多条记录时，最新完成的记录放在前面。
- 新增 Blog 文章仍需更新 `blog/posts.json`；如果该文章也是一次需要在首页告知的站点发布，再同时添加到 `updates.json`。
- 不要为纯内部重构、格式化或用户不可见的维护工作添加首页更新；只记录访问者能够感知或使用的变化。

## 编辑注意事项

- 保持改动适合静态站点：除非用户明确要求，不要引入包管理器、构建系统或运行时依赖。
- 保留工作区中已有的用户修改。
- 使用适配 GitHub Pages 的站点路径，例如 `/blog/` 和 `/assets/favicon.svg`。
