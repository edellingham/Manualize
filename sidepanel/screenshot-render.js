/**
 * Manualize — Screenshot Cropping / Zoom / Annotation
 *
 * Given the full-viewport screenshot captured at record time (persisted on the
 * step as `fullScreenshotDataUrl`) plus the target element's rect, renders the
 * crop the user currently sees. Kept separate from the crop so zoom can be
 * changed after the fact without re-recording.
 */

/* exported ZOOM_LEVELS, renderStepScreenshot, compressFullScreenshot */

const ZOOM_LEVELS = {
  closeup: { label: 'Close-up', paddingFn: () => 90 },
  context: {
    label: 'Context',
    paddingFn: (vpWidth, vpHeight) => Math.max(160, Math.min(vpWidth, vpHeight) * 0.22),
  },
  full: { label: 'Full page', paddingFn: null }, // no crop — whole viewport
};
const DEFAULT_ZOOM = 'context';

/**
 * Re-encodes the raw captureVisibleTab PNG as JPEG to keep IndexedDB storage
 * sane. Dimensions are left untouched so crop math (which assumes the stored
 * frame matches viewport*dpr) stays valid.
 */
function compressFullScreenshot(pngDataUrl, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load screenshot for compression'));
    img.src = pngDataUrl;
  });
}

/**
 * Renders the crop for a given zoom level from the stored full-frame screenshot.
 * @param {object} opts
 * @param {string} opts.fullDataUrl - full-viewport screenshot data URL
 * @param {object} opts.elementRect - { x, y, width, height } in CSS px
 * @param {number} opts.dpr
 * @param {number} opts.vpWidth
 * @param {number} opts.vpHeight
 * @param {string} opts.zoom - one of ZOOM_LEVELS keys
 * @param {boolean} opts.isNav
 */
function renderStepScreenshot(opts) {
  const { fullDataUrl, elementRect, dpr = 1, vpWidth, vpHeight, isNav } = opts;
  const zoom = ZOOM_LEVELS[opts.zoom] ? opts.zoom : DEFAULT_ZOOM;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        if (isNav || !elementRect) {
          const maxW = 800;
          const scale = Math.min(1, maxW / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
          return;
        }

        const levelDef = ZOOM_LEVELS[zoom];
        let cropX, cropY, cropRight, cropBottom;

        if (zoom === 'full') {
          cropX = 0;
          cropY = 0;
          cropRight = vpWidth;
          cropBottom = vpHeight;
        } else {
          const padding = levelDef.paddingFn(vpWidth, vpHeight);
          cropX = Math.max(0, elementRect.x - padding);
          cropY = Math.max(0, elementRect.y - padding);
          cropRight = Math.min(vpWidth, elementRect.x + elementRect.width + padding);
          cropBottom = Math.min(vpHeight, elementRect.y + elementRect.height + padding);
        }

        const sx = cropX * dpr;
        const sy = cropY * dpr;
        const sw = (cropRight - cropX) * dpr;
        const sh = (cropBottom - cropY) * dpr;

        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

        const hlX = (elementRect.x - cropX) * dpr;
        const hlY = (elementRect.y - cropY) * dpr;
        const hlW = elementRect.width * dpr;
        const hlH = elementRect.height * dpr;

        drawTargetAnnotation(ctx, sw, sh, hlX, hlY, hlW, hlH, dpr, zoom);

        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Failed to load screenshot'));
    img.src = fullDataUrl;
  });
}

/**
 * Draws the target indicator. Close-up crops (where the target already fills
 * most of the frame) just get the classic outline. Context/full crops get a
 * dimmed spotlight + arrow so the target is findable at a glance.
 */
function drawTargetAnnotation(ctx, canvasW, canvasH, hlX, hlY, hlW, hlH, dpr, zoom) {
  const r = 5 * dpr;
  const targetArea = hlW * hlH;
  const canvasArea = canvasW * canvasH;
  const needsSpotlight = zoom !== 'closeup' && targetArea / canvasArea < 0.5;

  if (needsSpotlight) {
    const spotPad = 6 * dpr;
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.roundRect(hlX - spotPad, hlY - spotPad, hlW + spotPad * 2, hlH + spotPad * 2, r + spotPad);
    ctx.fill();
    ctx.restore();

    drawArrow(ctx, canvasW, canvasH, hlX, hlY, hlW, hlH, dpr);
  }

  ctx.strokeStyle = 'rgba(139, 92, 246, 0.25)';
  ctx.lineWidth = 5 * dpr;
  ctx.beginPath();
  ctx.roundRect(hlX - 3, hlY - 3, hlW + 6, hlH + 6, r);
  ctx.stroke();

  ctx.strokeStyle = '#8b5cf6';
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.roundRect(hlX - 1, hlY - 1, hlW + 2, hlH + 2, r);
  ctx.stroke();
}

/** Draws an arrow pointing at the target's top or bottom edge, from whichever side has room. */
function drawArrow(ctx, canvasW, canvasH, hlX, hlY, hlW, hlH, dpr) {
  const targetCenterX = hlX + hlW / 2;
  const targetCenterY = hlY + hlH / 2;
  const arrowLen = Math.max(36 * dpr, Math.min(canvasH, canvasW) * 0.12);

  const fromBelow = targetCenterY < canvasH * 0.55; // target in upper portion → arrow comes from below
  const tipY = fromBelow ? hlY + hlH + 4 * dpr : hlY - 4 * dpr;
  const tailY = fromBelow ? tipY + arrowLen : tipY - arrowLen;
  const tipX = Math.min(canvasW - 12 * dpr, Math.max(12 * dpr, targetCenterX));
  const tailX = Math.min(canvasW - 12 * dpr, Math.max(12 * dpr, tipX + (fromBelow ? arrowLen * 0.5 : -arrowLen * 0.5)));

  ctx.save();
  ctx.strokeStyle = '#f59e0b';
  ctx.fillStyle = '#f59e0b';
  ctx.lineWidth = 3 * dpr;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  const angle = Math.atan2(tipY - tailY, tipX - tailX);
  const headLen = 10 * dpr;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(
    tipX - headLen * Math.cos(angle - Math.PI / 6),
    tipY - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    tipX - headLen * Math.cos(angle + Math.PI / 6),
    tipY - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
