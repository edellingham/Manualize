/**
 * Manualize — Color Utilities
 *
 * Shared hex color math for per-guide branding: the screenshot annotation
 * canvas and the HTML/embed export templates both derive tints/shades from
 * a single brand color hex.
 */

/* exported DEFAULT_BRAND_COLOR, hexToRgba, shadeColor */

const DEFAULT_BRAND_COLOR = '#7c3aed';

function hexToRgb(hex) {
  let h = (hex || DEFAULT_BRAND_COLOR).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16) || 0;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function hexToRgba(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** percent > 0 lightens toward white, percent < 0 darkens toward black. */
function shadeColor(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const target = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const mix = (channel) => Math.round((target - channel) * p) + channel;
  const toHex = (v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}
