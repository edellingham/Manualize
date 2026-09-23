/**
 * Manualize — Static Embed Export
 *
 * Generates a read-only, non-editable version of the guide (no contenteditable
 * fields, no edit banner, no embedded JSON/save-back script) wrapped in an
 * <iframe srcdoc="..."> snippet. The iframe isolates the guide's CSS from
 * whatever page it gets pasted into (KB article, help center, ticket reply) —
 * unlike a raw HTML fragment, it can't bleed styles either direction.
 */

/* exported buildEmbedSnippet */
function buildEmbedSnippet(guide, steps) {
  const title = escHtmlEmbed(guide.title || 'Manualize Guide');
  const dateStr = new Date(guide.createdAt || Date.now()).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const stepsHtml = steps
    .map((step, i) => {
      const num = i + 1;
      const stepTitle = step.title
        ? `<h2 class="step-title">${escHtmlEmbed(step.title)}</h2>`
        : '';
      const desc = step.description
        ? `<div class="step-desc">${escHtmlEmbed(step.description)}</div>`
        : '';
      const screenshot = step.screenshotDataUrl
        ? `<img class="step-img" src="${step.screenshotDataUrl}" alt="Step ${num} screenshot" loading="lazy">`
        : '';
      const caption = step.caption
        ? `<div class="step-caption">${escHtmlEmbed(step.caption)}</div>`
        : '';
      const url = step.pageUrl
        ? `<a class="step-url" href="${escHtmlEmbed(step.pageUrl)}" target="_blank" rel="noopener">${escHtmlEmbed(formatUrlEmbed(step.pageUrl))}</a>`
        : '';
      const navClass = step.isNavigation ? ' nav-step' : '';

      return `
    <section class="step${navClass}">
      <div class="step-num">${num}</div>
      <div class="step-body">
        ${stepTitle}
        ${desc}
        ${screenshot}
        ${caption}
        ${url}
      </div>
    </section>`;
    })
    .join('\n');

  const standaloneHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#f9f7ff;color:#1e1b4b;line-height:1.6;padding:24px 0 40px}
.container{max-width:780px;margin:0 auto;padding:0 20px}
.header{text-align:center;margin-bottom:36px;padding-bottom:24px;border-bottom:2px solid #e8e0f0}
.header h1{font-size:24px;font-weight:800;margin-bottom:6px;background:linear-gradient(135deg,#7c3aed,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.header .meta{color:#64748b;font-size:13px}
.step{display:flex;gap:16px;margin-bottom:20px;padding:20px;background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(124,58,237,.07);border:1px solid #e8e0f0}
.step.nav-step{border-left:4px solid #c084fc}
.step-num{flex-shrink:0;width:32px;height:32px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px}
.step-body{flex:1;min-width:0}
.step-title{font-size:15px;font-weight:700;margin-bottom:6px}
.step-desc{font-size:13.5px;color:#475569;margin-bottom:10px}
.step-img{max-width:100%;border-radius:8px;border:1px solid #e8e0f0;margin-bottom:8px;display:block}
.step-caption{font-size:12.5px;color:#8b5cf6;font-style:italic}
.step-url{display:inline-block;font-size:11px;color:#8b5cf6;margin-top:6px;text-decoration:none;word-break:break-all}
.step-url:hover{text-decoration:underline}
@media print{body{background:#fff;padding:0}.step{break-inside:avoid;box-shadow:none}}
@media (max-width:600px){.step{flex-direction:column;gap:10px}.step-num{width:28px;height:28px;font-size:12px}}
</style>
</head>
<body>
<div class="container">
  <header class="header">
    <h1>${title}</h1>
    <p class="meta">${steps.length} step${steps.length !== 1 ? 's' : ''} &middot; ${escHtmlEmbed(dateStr)}</p>
  </header>
  ${stepsHtml}
</div>
</body>
</html>`;

  // Iframe height guess: header + steps, generous enough that most guides
  // don't scroll internally; hosts can still override via style/attrs.
  const approxHeight = Math.min(4000, 320 + steps.length * 260);
  const escapedForAttr = standaloneHtml.replace(/"/g, '&quot;');
  const iframeSnippet = `<iframe title="${title}" srcdoc="${escapedForAttr}" style="width:100%;max-width:820px;height:${approxHeight}px;border:1px solid #e8e0f0;border-radius:12px;" loading="lazy"></iframe>`;

  return {
    standaloneHtml,
    iframeSnippet,
    filename: `${sanitizeFilenameEmbed(guide.title || 'guide')}-embed.html`,
  };
}

/* ── Helpers (kept local so this file has no dependency on export-html.js) ── */

function escHtmlEmbed(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function formatUrlEmbed(url) {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname;
  } catch (_e) {
    return url;
  }
}

function sanitizeFilenameEmbed(name) {
  return name.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'guide';
}
