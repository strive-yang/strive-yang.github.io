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
- 首页最新内容、Blog 列表和 Archive 页面都从 `blog/posts.json` 渲染。
- 新增文章时，需要同时更新文章目录和 `blog/posts.json`。

## 编辑注意事项

- 保持改动适合静态站点：除非用户明确要求，不要引入包管理器、构建系统或运行时依赖。
- 保留工作区中已有的用户修改。
- 使用适配 GitHub Pages 的站点路径，例如 `/blog/` 和 `/assets/favicon.svg`。
