/**
 * Manualize — PDF Export
 *
 * Uses bundled jspdf (window.jspdf) to generate a structured PDF.
 * Supports two layouts: "one-per-page" and "compact".
 */

/* exported exportToPdf */
async function exportToPdf(guide, steps, layout = 'one-per-page') {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('PDF library not loaded. Please try exporting as HTML instead.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');

  const PAGE_W = 210;
  const PAGE_H = 297;
  const M = 20;
  const CW = PAGE_W - 2 * M;

  const purple = [124, 58, 237];
  const purpleLight = [168, 85, 247];
  const textDark = [30, 27, 75];
  const textMuted = [100, 116, 139];

  const title = guide.title || 'Manualize Guide';
  const dateStr = new Date(guide.createdAt || Date.now()).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  /* ── Cover Page ── */
  doc.setFillColor(...purple);
  doc.rect(0, 0, PAGE_W, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...textDark);
  const titleLines = doc.splitTextToSize(title, CW);
  doc.text(titleLines, PAGE_W / 2, 80, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...textMuted);
  doc.text(`${steps.length} step${steps.length !== 1 ? 's' : ''}`, PAGE_W / 2, 95, { align: 'center' });
  doc.text(dateStr, PAGE_W / 2, 103, { align: 'center' });

  if (layout === 'one-per-page') {
    await renderOnePerPage(doc, steps, { PAGE_W, PAGE_H, M, CW, purple, purpleLight, textDark, textMuted });
  } else {
    await renderCompact(doc, steps, { PAGE_W, PAGE_H, M, CW, purple, purpleLight, textDark, textMuted });
  }

  /* ── Save ── */
  const filename = sanitizePdfFilename(guide.title || 'guide');
  doc.save(`${filename}.pdf`);
}

/* ══════ ONE STEP PER PAGE ══════ */

async function renderOnePerPage(doc, steps, c) {
  for (let i = 0; i < steps.length; i++) {
    doc.addPage();
    const step = steps[i];
    let y = c.M;

    doc.setFillColor(...c.purple);
    doc.rect(0, 0, c.PAGE_W, 2, 'F');

    // Step number
    doc.setFillColor(...(step.isNavigation ? c.purpleLight : c.purple));
    doc.circle(c.M + 6, y + 6, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(String(i + 1), c.M + 6, y + 7.2, { align: 'center' });

    // Title or description
    doc.setTextColor(...c.textDark);
    const mainText = step.title || step.description || `Step ${i + 1}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    const mainLines = doc.splitTextToSize(mainText, c.CW - 20);
    doc.text(mainLines, c.M + 16, y + 5);
    y += mainLines.length * 6 + 6;

    if (step.title && step.description) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(...c.textMuted);
      const descLines = doc.splitTextToSize(step.description, c.CW - 16);
      doc.text(descLines, c.M + 16, y);
      y += descLines.length * 5 + 4;
    }

    if (step.caption) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(148, 163, 184);
      const capLines = doc.splitTextToSize(step.caption, c.CW - 16);
      doc.text(capLines, c.M + 16, y);
      y += capLines.length * 4.5 + 6;
    }

    y += 4;

    // Screenshot
    if (step.screenshotDataUrl) {
      try {
        const imgProps = doc.getImageProperties(step.screenshotDataUrl);
        const imgAspect = imgProps.height / imgProps.width;
        let imgW = c.CW - 8;
        let imgH = imgW * imgAspect;
        const maxH = c.PAGE_H - y - c.M - 18;

        if (imgH > maxH) {
          imgH = maxH;
          imgW = imgH / imgAspect;
        }

        doc.setDrawColor(232, 224, 240);
        doc.setLineWidth(0.3);
        doc.roundedRect(c.M + 4 - 0.5, y - 0.5, imgW + 1, imgH + 1, 2, 2, 'S');
        doc.addImage(step.screenshotDataUrl, 'PNG', c.M + 4, y, imgW, imgH);
        y += imgH + 6;
      } catch (e) {
        console.warn('PDF: could not embed image for step', i + 1, e);
      }
    }

    // URL (clickable)
    if (step.pageUrl) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(192, 132, 252);
      let urlStr = step.pageUrl;
      try { urlStr = new URL(step.pageUrl).hostname + new URL(step.pageUrl).pathname; } catch (_e) {}
      const urlY = Math.min(y, c.PAGE_H - c.M - 10);
      doc.textWithLink(urlStr, c.M + 4, urlY, { url: step.pageUrl });
    }

    // Page footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(180, 180, 180);
    doc.text(`Step ${i + 1} of ${steps.length}`, c.PAGE_W / 2, c.PAGE_H - 10, { align: 'center' });
  }
}

/* ══════ COMPACT LAYOUT ══════ */

async function renderCompact(doc, steps, c) {
  let y = c.M;
  let pageStarted = false;

  function ensurePage(neededHeight) {
    if (!pageStarted || y + neededHeight > c.PAGE_H - c.M - 10) {
      doc.addPage();
      doc.setFillColor(...c.purple);
      doc.rect(0, 0, c.PAGE_W, 2, 'F');
      y = c.M + 4;
      pageStarted = true;
      return true;
    }
    return false;
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Estimate needed height: text (~20mm) + image (up to 60mm) + margin
    const textHeight = 20;
    let imgHeight = 0;
    let imgW = 0, imgH = 0;

    if (step.screenshotDataUrl) {
      try {
        const imgProps = doc.getImageProperties(step.screenshotDataUrl);
        const imgAspect = imgProps.height / imgProps.width;
        imgW = c.CW - 16;
        imgH = imgW * imgAspect;
        // Cap image height in compact mode
        if (imgH > 60) {
          imgH = 60;
          imgW = imgH / imgAspect;
        }
        imgHeight = imgH + 4;
      } catch (_e) {}
    }

    const totalNeeded = textHeight + imgHeight + 8;
    ensurePage(totalNeeded);

    // Separator line between steps (except first on page)
    if (y > c.M + 10) {
      doc.setDrawColor(232, 224, 240);
      doc.setLineWidth(0.3);
      doc.line(c.M, y - 2, c.PAGE_W - c.M, y - 2);
      y += 2;
    }

    // Step number badge
    doc.setFillColor(...(step.isNavigation ? c.purpleLight : c.purple));
    doc.circle(c.M + 4, y + 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(String(i + 1), c.M + 4, y + 5, { align: 'center' });

    // Text content
    const mainText = step.title || step.description || `Step ${i + 1}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...c.textDark);
    const mainLines = doc.splitTextToSize(mainText, c.CW - 16);
    doc.text(mainLines, c.M + 12, y + 3.5);
    y += mainLines.length * 5 + 2;

    if (step.title && step.description) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...c.textMuted);
      const descLines = doc.splitTextToSize(step.description, c.CW - 12);
      const showLines = descLines.slice(0, 2); // Max 2 lines in compact
      doc.text(showLines, c.M + 12, y);
      y += showLines.length * 4 + 2;
    }

    if (step.caption) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      const capText = doc.splitTextToSize(step.caption, c.CW - 12).slice(0, 1)[0];
      doc.text(capText, c.M + 12, y);
      y += 5;
    }

    // Screenshot (compact size)
    if (step.screenshotDataUrl && imgW > 0 && imgH > 0) {
      try {
        // Check if image fits on this page
        if (y + imgH > c.PAGE_H - c.M - 10) {
          ensurePage(imgH + 10);
        }
        doc.addImage(step.screenshotDataUrl, 'PNG', c.M + 8, y, imgW, imgH);
        y += imgH + 2;
      } catch (e) {
        console.warn('PDF compact: could not embed image for step', i + 1);
      }
    }

    // URL
    if (step.pageUrl) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(192, 132, 252);
      let urlStr = step.pageUrl;
      try { urlStr = new URL(step.pageUrl).hostname + new URL(step.pageUrl).pathname; } catch (_e) {}
      doc.textWithLink(urlStr, c.M + 12, y, { url: step.pageUrl });
      y += 4;
    }

    y += 6;
  }
}

function sanitizePdfFilename(name) {
  return name.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'guide';
}
