import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "_site");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(join(root, "site"), outDir, { recursive: true });

const assetsDir = join(root, "assets");
if (existsSync(assetsDir)) {
  mkdirSync(join(outDir, "assets"), { recursive: true });
  cpSync(assetsDir, join(outDir, "assets"), { recursive: true });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      const nextHref = href.endsWith(".md")
        ? `../${basename(href, ".md")}/`
        : href;
      return `<a href="${escapeHtml(nextHref)}">${label}</a>`;
    });
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listType = null;
  let inCode = false;
  let codeLanguage = "";
  let codeLines = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  }

  function startList(type) {
    if (listType === type) return;
    flushParagraph();
    flushList();
    listType = type;
    html.push(`<${type}>`);
  }

  for (const line of lines) {
    const codeFence = line.match(/^```(\w+)?\s*$/);
    if (codeFence) {
      if (inCode) {
        html.push(`<pre><code${codeLanguage ? ` class="language-${codeLanguage}"` : ""}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        inCode = false;
        codeLanguage = "";
        codeLines = [];
      } else {
        flushParagraph();
        flushList();
        inCode = true;
        codeLanguage = codeFence[1] || "";
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = renderInlineMarkdown(heading[2]);
      html.push(`<h${level}>${text}</h${level}>`);
      continue;
    }

    const unorderedItem = line.match(/^- (.+)$/);
    if (unorderedItem) {
      startList("ul");
      html.push(`<li>${renderInlineMarkdown(unorderedItem[1])}</li>`);
      continue;
    }

    const orderedItem = line.match(/^\d+\. (.+)$/);
    if (orderedItem) {
      startList("ol");
      html.push(`<li>${renderInlineMarkdown(orderedItem[1])}</li>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return html.join("\n");
}

function getDocSummary(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const title = lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "") || "Untitled";
  const summary = lines.find((line) => line.trim() && !line.startsWith("#") && !line.startsWith("```")) || "";
  return { title, summary };
}

function pageShell({ title, description, body, pathPrefix }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} - Localghost Docs</title>
    <meta name="description" content="${escapeHtml(description || "Localghost documentation")}">
    <meta name="theme-color" content="#6d3ff2">
    <style>
      :root {
        color-scheme: light;
        --ink: #101624;
        --muted: #5e6476;
        --line: #e2e6f3;
        --paper: #ffffff;
        --soft: #f7f8fd;
        --violet: #6d3ff2;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
        background: var(--paper);
        line-height: 1.65;
      }
      a { color: var(--violet); text-decoration-thickness: 1px; text-underline-offset: 3px; }
      code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
      code { background: var(--soft); border: 1px solid var(--line); border-radius: 5px; padding: 0.08rem 0.25rem; }
      pre {
        overflow-x: auto;
        padding: 18px;
        border-radius: 8px;
        background: #101624;
        color: #f7f8fd;
      }
      pre code { background: transparent; border: 0; color: inherit; padding: 0; }
      .top {
        border-bottom: 1px solid var(--line);
        background: rgba(255,255,255,0.92);
        position: sticky;
        top: 0;
      }
      .top-inner, main {
        width: min(960px, calc(100% - 40px));
        margin: 0 auto;
      }
      .top-inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 15px 0;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        color: var(--ink);
        font-weight: 800;
        text-decoration: none;
      }
      .brand img { width: 32px; height: 32px; border-radius: 8px; }
      .links {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        font-size: 0.94rem;
      }
      main { padding: 44px 0 72px; }
      .doc-list {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        margin-top: 24px;
      }
      .doc-card {
        display: block;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 8px;
        color: inherit;
        text-decoration: none;
      }
      .doc-card strong { display: block; margin-bottom: 4px; }
      .doc-card span { color: var(--muted); font-size: 0.94rem; }
      h1 { font-size: clamp(2.2rem, 7vw, 4.2rem); line-height: 1.02; margin: 0 0 16px; }
      h2 { margin-top: 2.1rem; border-top: 1px solid var(--line); padding-top: 1.3rem; }
      h3 { margin-top: 1.7rem; }
      p, li { color: var(--muted); }
      li + li { margin-top: 0.35rem; }
      footer {
        border-top: 1px solid var(--line);
        color: var(--muted);
        padding: 24px 0;
      }
      footer div {
        width: min(960px, calc(100% - 40px));
        margin: 0 auto;
      }
    </style>
  </head>
  <body>
    <nav class="top">
      <div class="top-inner">
        <a class="brand" href="${pathPrefix}/">
          <img src="${pathPrefix}/assets/localghost-app-icon.png" alt="">
          <span>Localghost</span>
        </a>
        <div class="links" aria-label="Docs links">
          <a href="${pathPrefix}/docs/">Docs</a>
          <a href="https://github.com/hamedb89/localghost">GitHub</a>
          <a href="https://www.npmjs.com/package/@hamedb89/localghost">npm</a>
        </div>
      </div>
    </nav>
    <main>
${body}
    </main>
    <footer><div>Localghost docs are generated from <code>docs/*.md</code> during the GitHub Pages build.</div></footer>
  </body>
</html>`;
}

function renderDocs() {
  const docsDir = join(root, "docs");
  if (!existsSync(docsDir)) return;

  const docs = readdirSync(docsDir)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort()
    .map((fileName) => {
      const markdown = readFileSync(join(docsDir, fileName), "utf8");
      return {
        fileName,
        slug: basename(fileName, ".md"),
        markdown,
        ...getDocSummary(markdown)
      };
    });

  const docsOutDir = join(outDir, "docs");
  mkdirSync(docsOutDir, { recursive: true });

  for (const doc of docs) {
    const docOutDir = join(docsOutDir, doc.slug);
    mkdirSync(docOutDir, { recursive: true });
    writeFileSync(
      join(docOutDir, "index.html"),
      pageShell({
        title: doc.title,
        description: doc.summary,
        body: renderMarkdown(doc.markdown),
        pathPrefix: "../.."
      }),
      "utf8"
    );
  }

  const cards = docs
    .map((doc) => `        <a class="doc-card" href="./${doc.slug}/"><strong>${escapeHtml(doc.title)}</strong><span>${escapeHtml(doc.summary)}</span></a>`)
    .join("\n");
  writeFileSync(
    join(docsOutDir, "index.html"),
    pageShell({
      title: "Documentation",
      description: "Localghost guides, CLI reference, release notes, and project docs.",
      body: `      <h1>Localghost Docs</h1>
      <p>Rendered from the markdown files in this repo. Start with the user flows when adopting Localghost in an app, then use the CLI reference for exact commands.</p>
      <div class="doc-list">
${cards}
      </div>`,
      pathPrefix: ".."
    }),
    "utf8"
  );
}

renderDocs();
writeFileSync(join(outDir, ".nojekyll"), "", "utf8");
console.log(`Built ${outDir}`);
