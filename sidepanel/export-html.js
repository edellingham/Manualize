/**
 * Manualize — HTML Export
 *
 * Generates an interactive, self-contained HTML file with embedded base64 screenshots.
 * Allows inline editing in-browser and saving back the updated HTML or JSON data.
 */

/* exported exportToHtml */
function exportToHtml(guide, steps) {
  const title = escHtml(guide.title || 'Manualize Guide');
  const dateStr = new Date(guide.createdAt || Date.now()).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const stepsHtml = steps
    .map((step, i) => {
      const num = i + 1;
      const stepTitle = `<h2 class="step-title" contenteditable="true" data-field="title" data-index="${i}" data-placeholder="Add a step title…">${escHtml(step.title || '')}</h2>`;
      const desc = `<div class="step-desc" contenteditable="true" data-field="description" data-index="${i}" data-placeholder="Describe this step…">${escHtml(step.description || '')}</div>`;
      const screenshot = step.screenshotDataUrl
        ? `<img class="step-img" src="${step.screenshotDataUrl}" alt="Step ${num} screenshot" loading="lazy">`
        : '';
      const caption = `<div class="step-caption" contenteditable="true" data-field="caption" data-index="${i}" data-placeholder="Add a note…">${escHtml(step.caption || '')}</div>`;
      const url = step.pageUrl
        ? `<a class="step-url" href="${escHtml(step.pageUrl)}" target="_blank" rel="noopener">${escHtml(formatUrl(step.pageUrl))}</a>`
        : '';
      const navClass = step.isNavigation ? ' nav-step' : '';

      return `
    <section class="step${navClass}" data-step-id="${escHtml(step.id)}">
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

  // Prepare embedded guide data
  const guideData = {
    version: "1.0",
    generator: "Manualize",
    guide: {
      id: guide.id,
      title: guide.title || 'Untitled Guide',
      createdAt: guide.createdAt || Date.now(),
      updatedAt: Date.now(),
      stepCount: steps.length
    },
    steps: steps.map(s => ({
      id: s.id,
      guideId: s.guideId,
      order: s.order,
      description: s.description || '',
      title: s.title || '',
      caption: s.caption || '',
      selector: s.selector || '',
      screenshotDataUrl: s.screenshotDataUrl || null,
      pageUrl: s.pageUrl || '',
      pageTitle: s.pageTitle || '',
      elementRect: s.elementRect || null,
      isNavigation: !!s.isNavigation
    }))
  };

  const embeddedJson = JSON.stringify(guideData, null, 2).replace(/<\/script>/g, '<\\/script>');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#f9f7ff;color:#1e1b4b;line-height:1.6;padding:0 0 60px}
.container{max-width:780px;margin:0 auto;padding:0 20px}
.header{text-align:center;margin-bottom:48px;padding-bottom:28px;border-bottom:2px solid #e8e0f0}
.header h1{font-size:28px;font-weight:800;margin-bottom:6px;background:linear-gradient(135deg,#7c3aed,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;outline:none}
.header .meta{color:#64748b;font-size:13px}
.step{display:flex;gap:16px;margin-bottom:24px;padding:20px;background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(124,58,237,.07);border:1px solid #e8e0f0}
.step.nav-step{border-left:4px solid #c084fc}
.step-num{flex-shrink:0;width:32px;height:32px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px}
.step-body{flex:1;min-width:0}
.step-title{font-size:15px;font-weight:700;margin-bottom:6px;outline:none;min-height:22px}
.step-title:empty::before{content:attr(data-placeholder);color:#cbd5e1;font-weight:600}
.step-desc{font-size:13.5px;color:#475569;margin-bottom:10px;outline:none;min-height:20px}
.step-desc:empty::before{content:attr(data-placeholder);color:#94a3b8;font-style:italic}
.step-img{max-width:100%;border-radius:8px;border:1px solid #e8e0f0;margin-bottom:8px;display:block}
.step-caption{font-size:12.5px;color:#8b5cf6;font-style:italic;outline:none;min-height:18px}
.step-caption:empty::before{content:attr(data-placeholder);color:#c084fc;font-style:italic;opacity:0.6}
.step-url{display:inline-block;font-size:11px;color:#8b5cf6;margin-top:6px;text-decoration:none;word-break:break-all}
.step-url:hover{text-decoration:underline}

/* Edit Banner */
.edit-banner {
  position: sticky;
  top: 0; left: 0; right: 0;
  background: rgba(30, 27, 75, 0.9);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1.5px solid rgba(139, 92, 246, 0.4);
  color: #fff;
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 1000;
  margin-bottom: 32px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}
.banner-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.banner-title {
  font-weight: 800;
  font-size: 11px;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: #c084fc;
}
.banner-desc {
  font-size: 11px;
  color: #cbd5e1;
}
.banner-buttons {
  display: flex;
  gap: 10px;
}
.banner-btn {
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-html {
  background: linear-gradient(135deg, #7c3aed, #a855f7);
  color: #fff;
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
}
.btn-html:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(124, 58, 237, 0.45);
}
.btn-json {
  background: rgba(255, 255, 255, 0.12);
  color: #f1f5f9;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.btn-json:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

@media print{
  body{background:#fff;padding:0}
  .step{break-inside:avoid;box-shadow:none}
  .edit-banner{display:none !important}
  [contenteditable="true"]{outline:none}
}
@media (max-width:600px){
  body{padding-bottom:40px}
  .step{flex-direction:column;gap:10px}
  .step-num{width:28px;height:28px;font-size:12px}
  .edit-banner{flex-direction:column;gap:12px;text-align:center;padding:12px}
}
</style>
</head>
<body>
<div class="edit-banner">
  <div class="banner-info">
    <span class="banner-title">Manualize Edit Mode</span>
    <span class="banner-desc">Click any text block to edit. Changes are saved directly in your exported files.</span>
  </div>
  <div class="banner-buttons">
    <button onclick="downloadHtmlBackup()" class="banner-btn btn-html">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
      Save Edited HTML
    </button>
    <button onclick="downloadJsonBackup()" class="banner-btn btn-json">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      Save Backup (.manualize)
    </button>
  </div>
</div>

<div class="container">
  <header class="header">
    <h1 contenteditable="true" data-field="guide-title" data-index="-1" title="Click to rename guide">${title}</h1>
    <p class="meta" id="guideMetaText">${steps.length} step${steps.length !== 1 ? 's' : ''} &middot; ${escHtml(dateStr)}</p>
  </header>
  ${stepsHtml}
</div>

<!-- Embedded Structured Data for Bidirectional Database Sync -->
<script id="manualize-data" type="application/json">
${embeddedJson}
</script>

<script>
(function() {
  const dataScript = document.getElementById('manualize-data');
  let guideData = {};
  try {
    guideData = JSON.parse(dataScript.textContent);
  } catch (e) {
    console.error('Failed to parse guide data', e);
  }

  // Monitor edits on contenteditable fields
  document.querySelectorAll('[contenteditable="true"]').forEach(el => {
    el.addEventListener('blur', () => {
      const field = el.dataset.field;
      const index = parseInt(el.dataset.index, 10);
      const val = el.innerText.trim();

      if (field === 'guide-title') {
        guideData.guide.title = val || 'Untitled Guide';
        el.innerText = guideData.guide.title;
      } else if (index >= 0 && index < guideData.steps.length) {
        guideData.steps[index][field] = val;
      }

      // Update script tag content
      dataScript.textContent = JSON.stringify(guideData, null, 2);
    });
  });

  window.downloadHtmlBackup = function() {
    // Force final sync of script content
    dataScript.textContent = JSON.stringify(guideData, null, 2);
    
    // Serialize current page content to preserve updates
    const fullHtml = '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;
    const filename = sanitizeName(guideData.guide.title || 'guide') + '.html';
    triggerDownload(fullHtml, filename, 'text/html');
  };

  window.downloadJsonBackup = function() {
    dataScript.textContent = JSON.stringify(guideData, null, 2);
    const jsonStr = JSON.stringify(guideData, null, 2);
    const filename = sanitizeName(guideData.guide.title || 'guide') + '.manualize';
    triggerDownload(jsonStr, filename, 'application/json');
  };

  function sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'guide';
  }

  function triggerDownload(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 100);
  }
})();
</script>
</body>
</html>`;

  downloadBlob(html, `${sanitizeFilename(guide.title || 'guide')}.html`, 'text/html');
}

/* ── Helpers ── */

function escHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function formatUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname;
  } catch (_e) {
    return url;
  }
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'guide';
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  requestAnimationFrame(() => {
    a.remove();
    URL.revokeObjectURL(url);
  });
}
