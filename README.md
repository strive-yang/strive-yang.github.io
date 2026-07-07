# Yang Strive Personal Tech Lab

GitHub Pages static personal site for research notes, engineering tools, projects, and writing.

## Structure

- `index.html`: home dashboard and module directory
- `blog/`: writing and article index
- `tools/`: reusable tools and static apps
- `projects/`: project showcase
- `research/`: paper notes, algorithms, datasets, and experiment logs
- `about/`: profile and contact page
- `archives/`: chronological archive
- `css/`: global visual system
- `js/`: lightweight interactions and hero animation
- `assets/`: icons and shared assets

## Creating Blog Posts

All blog articles live under `blog/`, and every listing page reads metadata from `blog/posts.json`.

1. Create a new article folder:

   ```text
   blog/YYYY/MM/DD/your-slug/index.html
   ```

2. Use an existing article, such as `blog/2026/07/01/hello-world/index.html`, as the page template. Update the title, description, hero metadata, article body, and footer text.

3. Add the article metadata to `blog/posts.json`:

   ```json
   {
     "title": "Article Title",
     "date": "YYYY-MM-DD",
     "category": "Category",
     "summary": "One sentence summary.",
     "url": "/blog/YYYY/MM/DD/your-slug/"
   }
   ```

4. Keep the newest entries first or let the frontend sort by `date`. The Blog page, home page recent list, and Archive pages render from this file.

5. If the article is the first post in a new year or month, copy an existing archive page, such as `archives/2026/index.html` or `archives/2026/07/index.html`, and update only the page title, hero text, `data-post-year`, and `data-post-month` attributes.

## Local Preview

```bash
python -m http.server 8000
```

Then open `http://127.0.0.1:8000/`.
