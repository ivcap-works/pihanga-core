# @pihanga2/core — Documentation

This directory contains the [MkDocs Material](https://squidfunk.github.io/mkdocs-material/)
documentation site for `@pihanga2/core`.

No Python installation is required — everything runs via Docker using a thin custom image
built on top of [`squidfunk/mkdocs-material`](https://hub.docker.com/r/squidfunk/mkdocs-material).

---

## Table of Contents

- [Quick Start](#quick-start)
  - [Serve locally (live reload)](#serve-locally-live-reload)
  - [Build the static site](#build-the-static-site)
  - [Deploy to GitHub Pages](#deploy-to-github-pages)
- [Directory Structure](#directory-structure)
- [Maintenance](#maintenance)
- [Docs Setup](#docs-setup)

---

## Quick Start

### Serve locally (live reload)

```bash
# From the project root — recommended
make docs-serve

# Or manually (from the project root):
# The whole repo is mounted at /project so that pymdownx.snippets can reach
# files relative to the project root.
docker run --rm -p 8000:8000 \
  -v "${PWD}:/project" -w /project/docs \
  pihanga-core-docs:local serve --dev-addr=0.0.0.0:8000
```

Open [http://localhost:8000](http://localhost:8000) — pages reload automatically on save.

> **Note:** Run `make docs-image` once (or after changing `docs/requirements.txt`)
> to build the `pihanga-core-docs:local` image before using it directly.

### Build the static site

```bash
# From the project root
make docs-build

# Or manually (from the project root):
docker run --rm \
  -v "${PWD}:/project" -w /project/docs \
  pihanga-core-docs:local build --strict
```

Output is written to `docs/site/`.

### Deploy to GitHub Pages

```bash
# From the project root
make docs-deploy

# Or manually (from the project root):
docker run --rm \
  -v "${PWD}:/project" -w /project/docs \
  -v "${HOME}/.ssh:/root/.ssh" \
  pihanga-core-docs:local gh-deploy --force
```

---

## Directory Structure

```
docs/
├── Dockerfile          # Custom Docker image (adds extra pip packages)
├── mkdocs.yml          # MkDocs configuration
├── requirements.txt    # Python deps (installed into the Docker image)
├── README.md           # This file
└── docs/               # Markdown source pages
    ├── index.md
    ├── getting-started/
    │   ├── installation.md
    │   └── quick-start.md
    ├── guides/
    │   ├── overview.md
    │   ├── cards.md
    │   ├── redux.md
    │   ├── routing.md
    │   ├── rest-api.md
    │   └── rest-usage.md   ← full REST reference (self-contained)
    ├── api/
    │   ├── overview.md
    │   ├── register.md
    │   ├── start.md
    │   └── types.md
    ├── reference/
    │   └── glossary.md
    ├── css/
    │   └── extra.css       ← styles the llmstxt-md "Copy Markdown" button
    ├── js/
    │   └── mermaid-init.js ← Mermaid diagram initialiser
    └── community/
        └── contributing.md
```

---

## Maintenance

This section describes how to keep the documentation in sync with the library as it evolves.

### When the library changes

| Library change | Docs to review / update |
|---|---|
| New public export added to `src/index.ts` | Add to `docs/docs/api/overview.md`; create or extend an API or guide page |
| Existing export renamed or removed | Update all occurrences in `docs/docs/api/` and `docs/docs/guides/`; bump semver |
| Method signature changed (parameters, return type) | Update the matching section in `docs/docs/api/<page>.md` and any code snippets in guides |
| New routing behaviour | Update `docs/docs/guides/routing.md` |
| REST helper changed | Update `docs/docs/guides/rest-api.md` and `docs/docs/guides/rest-usage.md` |
| New TypeScript type exported | Add to `docs/docs/api/types.md` |
| `start()` options changed | Update `docs/docs/api/start.md` and `docs/docs/getting-started/quick-start.md` |
| Package name or entry-point changed | Update `docs/docs/getting-started/installation.md` and `docs/docs/index.md` |

### Reviewing docs for correctness

1. **Build and serve locally:**
   ```bash
   make docs-serve   # opens http://localhost:8000
   ```

2. **Cross-check the API reference** — open `docs/docs/api/` alongside `src/index.ts`
   and verify every exported symbol is documented.

3. **Check internal links** — MkDocs warns about broken relative links during build;
   treat all warnings as errors:
   ```bash
   make docs-build   # inspect output for warnings
   ```

4. **Update version references** — after a version bump, search for hardcoded versions:
   ```bash
   grep -r "version" docs/docs/
   ```

### Adding a new documentation page

1. Create the Markdown file in the appropriate subdirectory under `docs/docs/`.
2. Register it under the `nav:` key in `docs/mkdocs.yml`.
3. Link to it from the relevant overview page.

### Removing or deprecating content

- **Removal:** delete the Markdown file, remove the `nav:` entry, and `grep` for cross-links.
- **Deprecation:** add a `!!! warning "Deprecated"` admonition at the top of the page.

---

## Docs Setup

- [Docker image and custom build](#docker-image-and-custom-build)
- [MkDocs configuration](#mkdocs-configuration)
- [Theme](#theme)
- [Styling and custom CSS](#styling-and-custom-css)
- [Mermaid diagram support](#mermaid-diagram-support)
- [LLM-friendly output (llmstxt-md plugin)](#llm-friendly-output-llmstxt-md-plugin)
- [Markdown extensions](#markdown-extensions)
- [GitHub Actions CI/CD](#github-actions-cicd)
- [Replicating this setup elsewhere](#replicating-this-setup-elsewhere)

This section documents how the documentation site is built and configured.
It is aimed at anyone who wants to mirror this setup for a different project.

### Docker image and custom build

The base image is [`squidfunk/mkdocs-material`](https://hub.docker.com/r/squidfunk/mkdocs-material).
Because the site uses additional Python packages (extra MkDocs plugins), a thin custom
`Dockerfile` is provided that extends the base image:

```dockerfile
# docs/Dockerfile
FROM squidfunk/mkdocs-material
COPY requirements.txt /tmp/docs-requirements.txt
RUN pip install --no-cache-dir -r /tmp/docs-requirements.txt
```

The additional Python dependencies are listed in `docs/requirements.txt`:

```
mkdocs>=1.5.0
mkdocs-material>=9.5.0
pymdown-extensions>=10.0
mkdocs-llmstxt-md>=0.1.0
```

Build the custom image once, then use it in place of the plain `squidfunk/mkdocs-material` image:

```bash
# Build (from the project root)
make docs-image

# Serve with live reload (from the project root)
# The whole repo is mounted at /project so snippets can reach root-level files.
docker run --rm -p 8000:8000 \
  -v "${PWD}:/project" -w /project/docs \
  pihanga-core-docs:local serve --dev-addr=0.0.0.0:8000

# Build static site (from the project root)
docker run --rm \
  -v "${PWD}:/project" -w /project/docs \
  pihanga-core-docs:local build --strict
```

> **Tip:** The `make docs-*` targets in the project root `Makefile` wrap these
> commands so you don't have to type them by hand.

### MkDocs configuration

All site configuration lives in `docs/mkdocs.yml`. Key top-level fields:

| Field | Value / notes |
|---|---|
| `site_name` | Human-readable title shown in the browser tab and nav header |
| `site_url` | Canonical URL of the deployed site (used for SEO and `sitemap.xml`) |
| `repo_url` | GitHub repository link; MkDocs adds an edit icon automatically |
| `edit_uri` | Path appended to `repo_url` to form per-page "Edit" links |
| `docs_dir` | Source Markdown directory (`docs/` relative to `mkdocs.yml`) |
| `site_dir` | Output directory for `mkdocs build` (`site/`) |

### Theme

The site uses the **Material for MkDocs** theme:

```yaml
theme:
  name: material
  palette:
    - scheme: default
      primary: indigo
      accent: indigo
  features:
    - navigation.tabs
    - navigation.sections
    - navigation.top
    - search.highlight
    - content.code.copy
```

Consult the [Material for MkDocs documentation](https://squidfunk.github.io/mkdocs-material/)
for the full list of available `features`, `palette` schemes, and other options.

### Styling and custom CSS

A small CSS override file at `docs/docs/css/extra.css` is loaded via:

```yaml
extra_css:
  - css/extra.css
```

Currently it styles the "Copy Markdown" button injected by the `llmstxt-md` plugin to
match the site's primary colour palette:

```css
#llms-copy-button button {
  background: var(--md-primary-fg-color) !important;
  color: var(--md-primary-bg-color) !important;
  border-radius: 4px !important;
  box-shadow: var(--md-shadow-z2) !important;
  transition: background 0.2s ease, box-shadow 0.2s ease;
}
```

Add further overrides to this file as needed; they are automatically merged by MkDocs.

### Mermaid diagram support

Diagrams are written as fenced ` ```mermaid ``` ` code blocks in Markdown.
Two pieces are required:

**1. `pymdownx.superfences` with a custom Mermaid fence** (in `mkdocs.yml`):

```yaml
markdown_extensions:
  - pymdownx.superfences:
      custom_fences:
        - name: mermaid
          class: mermaid
          format: !!python/name:pymdownx.superfences.fence_code_format
```

**2. Mermaid JS and a small initialisation script** (in `mkdocs.yml`):

```yaml
extra_javascript:
  - https://unpkg.com/mermaid@10/dist/mermaid.min.js
  - js/mermaid-init.js
```

`docs/docs/js/mermaid-init.js` waits for `DOMContentLoaded`, then finds every
`<code class="language-mermaid">` element rendered by the superfences extension,
replaces it with a `<div class="mermaid">`, and calls `mermaid.run()`:

```js
document.addEventListener("DOMContentLoaded", function () {
  mermaid.initialize({ startOnLoad: false, theme: "default" });
  document.querySelectorAll("code.language-mermaid").forEach(function (el) {
    const div = document.createElement("div");
    div.className = "mermaid";
    div.textContent = el.textContent;
    el.parentElement.replaceWith(div);
  });
  mermaid.run({ querySelector: ".mermaid" });
});
```

### LLM-friendly output (llmstxt-md plugin)

The [`mkdocs-llmstxt-md`](https://github.com/ivcap-works/mkdocs-llmstxt-md) plugin
generates `/llms.txt` and `/llms-full.txt` alongside the normal HTML build.
These machine-readable files allow AI tools to index the docs efficiently without
having to crawl individual HTML pages.

Configuration in `mkdocs.yml`:

```yaml
plugins:
  - search
  - llmstxt-md:
      enable_markdown_urls: true
      enable_llms_txt: true
      enable_llms_full: true
      markdown_description: |
        @pihanga2/core is the runtime engine of the Pihanga declarative,
        card-based UI framework for React. It provides card registration,
        Redux store bootstrap, hash/history routing, and typed REST-API helpers.
      sections:
        Getting Started:
          - getting-started/installation.md
          - getting-started/quick-start.md
        Guides:
          - guides/cards.md
          - guides/redux.md
          - guides/routing.md
          - guides/rest-api.md
        API Reference:
          - api/overview.md
          - api/register.md
          - api/start.md
          - api/types.md
```

After every build the following files are generated in `docs/site/`:

| File | Purpose |
|---|---|
| `llms.txt` | Short index of all pages with URLs — for AI context windows |
| `llms-full.txt` | Full Markdown content of every page — for deep indexing |

The `extra.css` tweak described above styles the "Copy Markdown" button this plugin
adds to each page so it matches the site's indigo primary colour.

### Markdown extensions

The following `pymdownx` and standard MkDocs extensions are enabled:

| Extension | Purpose |
|---|---|
| `admonition` | `!!! note`, `!!! warning`, `!!! tip` callout boxes |
| `attr_list` | Add HTML attributes / CSS classes to Markdown elements |
| `def_list` | Definition lists |
| `footnotes` | Footnote references |
| `md_in_html` | Markdown content inside raw HTML blocks |
| `tables` | GitHub-flavoured Markdown tables |
| `toc` (with `permalink: true`) | Auto-generated heading anchors with ¶ links |
| `pymdownx.highlight` | Syntax highlighting with anchor line numbers |
| `pymdownx.inlinehilite` | Inline code syntax highlighting |
| `pymdownx.snippets` | Embed external file content via `--8<--` |
| `pymdownx.superfences` | Fenced code blocks + Mermaid diagrams |
| `pymdownx.tabbed` | Tabbed content blocks |

`pymdownx.snippets` is configured with `base_path: [".."]` so that snippets can
reference files one level above `docs/` (i.e. the project root).
The `docs/docs/guides/rest-usage.md` page contains the full REST reference as
self-contained Markdown (no snippet transclusion needed).

### GitHub Actions CI/CD

The documentation is built and deployed automatically by `.github/workflows/docs.yml`.
There are two jobs:

| Job | Trigger | What it does |
|---|---|---|
| **Build** | every push / PR to `main` | Builds the Docker image from `docs/Dockerfile`, runs `mkdocs build --strict` inside it, and uploads the generated `docs/site/` as a workflow artifact |
| **Deploy** | push to `main` only | Downloads the artifact and pushes the contents to the `gh-pages` branch via `peaceiris/actions-gh-pages` |

#### Why Docker in CI?

The workflow builds and runs the **same `docs/Dockerfile`** used locally. This is
intentional: it ensures that every plugin installed via `docs/requirements.txt`
(including `mkdocs-llmstxt-md`) is available in exactly the same environment as when
you run `make docs-build` on your machine. An earlier version of the workflow used a
bare `pip install -r docs/requirements.txt` with a plain Python runner, which produced
a different theme and silently skipped plugins that depend on the Material base image —
using Docker eliminates that class of divergence.

#### Key workflow steps

```yaml
# 1. Build the custom image (squidfunk/mkdocs-material + requirements.txt)
- name: Build docs Docker image
  run: docker build -t pihanga-core-docs docs/

# 2. Run mkdocs build inside the image.
#    The whole repo is mounted at /project with workdir set to /project/docs,
#    mirroring the Makefile's DOCS_DOCKER pattern so that pymdownx.snippets
#    base_path: [".."] resolves to the project root.
- name: Build documentation
  run: |
    docker run --rm \
      -v "${{ github.workspace }}:/project" \
      -w /project/docs \
      pihanga-core-docs build --strict
```

`--strict` promotes all MkDocs warnings (broken links, unresolved snippets, etc.)
to errors, so the build fails fast rather than producing a silently broken site.

#### Updating the workflow

The workflow file lives at `.github/workflows/docs.yml`. Common changes:

- **Pin the `squidfunk/mkdocs-material` image version** — add a `FROM` tag in
  `docs/Dockerfile` (e.g. `FROM squidfunk/mkdocs-material:9.5.49`) to prevent
  unexpected upstream changes from breaking CI.
- **Add a new plugin** — add it to `docs/requirements.txt`; it will be picked up
  automatically the next time the Docker image is built in CI.

---

### Replicating this setup elsewhere

To copy this documentation setup to a new project:

1. **Copy the skeleton:**
   ```
   docs/Dockerfile
   docs/mkdocs.yml
   docs/requirements.txt
   docs/docs/css/extra.css
   docs/docs/js/mermaid-init.js
   ```

2. **Edit `mkdocs.yml`:** update `site_name`, `site_url`, `repo_url`, `site_author`,
   `copyright`, and the `nav:` tree to match your project structure.

3. **Update `requirements.txt`** if you need different plugin versions or additional plugins.

4. **Build the Docker image** from the project root:
   ```bash
   make docs-image
   ```

5. **Add `make` targets** so contributors can run `make docs-serve`, `make docs-build`,
   and `make docs-deploy` without memorising long Docker commands.

6. **Add `.github/workflows/docs.yml`** following the pattern in this repository.
