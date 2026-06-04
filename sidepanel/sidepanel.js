/**
 * Manualize — Side Panel Main Logic (v2)
 *
 * Manages recording state, step rendering, inline editing,
 * drag-and-drop with ghost image, image upload/change,
 * dashboard view, save feedback, and guide management.
 */

/* ====== STATE ====== */
let currentGuide = null;
let steps = [];
let isRecording = false;
const db = new ManualizeDB();

/* ====== DOM REFS ====== */
const editorView = document.getElementById('editorView');
const dashboardView = document.getElementById('dashboardView');
const guideTitleInput = document.getElementById('guideTitle');
const recordBtn = document.getElementById('recordBtn');
const recordLabel = document.getElementById('recordLabel');
const stepCountEl = document.getElementById('stepCount');
const stepListEl = document.getElementById('stepList');
const emptyStateEl = document.getElementById('emptyState');
const exportHtmlBtn = document.getElementById('exportHtml');
const exportPdfBtn = document.getElementById('exportPdf');
const addManualStepBtn = document.getElementById('addManualStep');
const dashboardBtn = document.getElementById('dashboardBtn');
const brandName = document.getElementById('brandName');
const saveIndicatorEl = document.getElementById('saveIndicator');
const saveTextEl = document.getElementById('saveText');

const importFileInput = document.getElementById('importFileInput');
const importJsonBtn = document.getElementById('importJsonBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const dashImportBtn = document.getElementById('dashImportBtn');

// PDF modal refs
const pdfModal = document.getElementById('pdfModal');
const closePdfModalBtn = document.getElementById('closePdfModal');
const pdfExportConfirmBtn = document.getElementById('pdfExportConfirm');

// Dashboard refs
const backToEditorBtn = document.getElementById('backToEditorBtn');
const dashNewGuideBtn = document.getElementById('dashNewGuideBtn');
const dashNewGuideBtnBottom = document.getElementById('dashNewGuideBtnBottom');
const dashGuideListEl = document.getElementById('dashGuideList');
const dashBulkActions = document.getElementById('dashBulkActions');
const dashSelectAll = document.getElementById('dashSelectAll');
const dashBulkDeleteBtn = document.getElementById('dashBulkDeleteBtn');
const dashBulkExportBtn = document.getElementById('dashBulkExportBtn');
const storageBarFill = document.getElementById('storageBarFill');
const storageLabel = document.getElementById('storageLabel');

/* ====== INIT ====== */
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await db.open();

  const { manualizeRecording, manualizeGuideId } = await chrome.storage.local.get([
    'manualizeRecording',
    'manualizeGuideId',
  ]);

  if (manualizeRecording && manualizeGuideId) {
    currentGuide = await db.getGuide(manualizeGuideId);
    if (currentGuide) {
      isRecording = true;
      steps = await db.getSteps(currentGuide.id);
    } else {
      await chrome.storage.local.set({ manualizeRecording: false, manualizeGuideId: null });
      await createNewGuide();
    }
  } else {
    const allGuides = await db.listGuides();
    if (allGuides.length > 0) {
      currentGuide = allGuides[0];
      steps = await db.getSteps(currentGuide.id);
    } else {
      await createNewGuide();
    }
  }

  guideTitleInput.value = currentGuide.title;
  renderAllSteps();
  updateRecordingUI();
  updateEmptyState();
  setupEventListeners();
  connectPort();
}

/* ====== PORT — KEEPALIVE ====== */
let port = null;

function connectPort() {
  try {
    port = chrome.runtime.connect({ name: 'manualize-panel' });
    port.onDisconnect.addListener(() => {
      setTimeout(connectPort, 300);
    });
  } catch (_e) {
    setTimeout(connectPort, 1000);
  }
}

/* ====== MESSAGE HANDLING ====== */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'STEP_CAPTURED') {
    handleNewStep(message.data);
    sendResponse({ received: true });
  }
  return true;
});

/* ====== EVENT LISTENERS ====== */
function setupEventListeners() {
  recordBtn.addEventListener('click', toggleRecording);
  guideTitleInput.addEventListener('change', handleTitleSave);
  exportHtmlBtn.addEventListener('click', handleExportHtml);
  exportPdfBtn.addEventListener('click', showPdfModal);
  addManualStepBtn.addEventListener('click', () => insertManualStep(steps.length));
  dashboardBtn.addEventListener('click', showDashboard);
  brandName.addEventListener('click', showDashboard);

  // JSON Import/Export
  importJsonBtn.addEventListener('click', () => importFileInput.click());
  dashImportBtn.addEventListener('click', () => importFileInput.click());
  exportJsonBtn.addEventListener('click', () => {
    if (steps.length === 0) {
      showToast('No steps to export');
      return;
    }
    exportGuideJson(currentGuide, steps);
  });
  importFileInput.addEventListener('change', handleImportFileChange);

  // PDF modal
  closePdfModalBtn.addEventListener('click', () => { pdfModal.hidden = true; });
  pdfModal.addEventListener('click', (e) => { if (e.target === pdfModal) pdfModal.hidden = true; });
  pdfExportConfirmBtn.addEventListener('click', handleExportPdf);

  // Dashboard
  backToEditorBtn.addEventListener('click', showEditor);
  dashNewGuideBtn.addEventListener('click', handleNewGuideFromDash);
  dashNewGuideBtnBottom.addEventListener('click', handleNewGuideFromDash);
  dashSelectAll.addEventListener('change', handleDashSelectAll);
  dashBulkDeleteBtn.addEventListener('click', handleBulkDelete);
  dashBulkExportBtn.addEventListener('click', handleBulkExport);

  // Step List Auto Scroll on Drag
  stepListEl.addEventListener('dragover', (e) => {
    const listRect = stepListEl.getBoundingClientRect();
    const clientY = e.clientY;
    const topThreshold = listRect.top + 45;
    const bottomThreshold = listRect.bottom - 45;

    if (clientY < topThreshold) {
      if (!autoScrollInterval) {
        autoScrollInterval = setInterval(() => {
          stepListEl.scrollTop -= 8;
        }, 16);
      }
    } else if (clientY > bottomThreshold) {
      if (!autoScrollInterval) {
        autoScrollInterval = setInterval(() => {
          stepListEl.scrollTop += 8;
        }, 16);
      }
    } else {
      if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
      }
    }
  });
  stepListEl.addEventListener('dragleave', () => {
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
    }
  });
  stepListEl.addEventListener('drop', () => {
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
    }
  });
}

/* ═══════════════════════════════════════════════
   RECORDING
   ═══════════════════════════════════════════════ */

async function toggleRecording() {
  if (isRecording) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  if (!currentGuide) await createNewGuide();
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      data: { guideId: currentGuide.id },
    });
    if (response?.success) {
      isRecording = true;
      updateRecordingUI();
      showToast('Recording started');
    }
  } catch (err) {
    console.error('Failed to start recording:', err);
    showToast('Failed to start recording');
  }
}

async function stopRecording() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    if (response?.success) {
      isRecording = false;
      updateRecordingUI();
      showToast('Recording stopped');
    }
  } catch (err) {
    console.error('Failed to stop recording:', err);
  }
}

function updateRecordingUI() {
  if (isRecording) {
    recordBtn.classList.add('recording');
    recordLabel.textContent = 'Stop Recording';
    stepCountEl.textContent = `(${steps.length} step${steps.length !== 1 ? 's' : ''})`;
    stepCountEl.hidden = false;
  } else {
    recordBtn.classList.remove('recording');
    recordLabel.textContent = 'Start Recording';
    stepCountEl.hidden = true;
  }
}

/* ═══════════════════════════════════════════════
   STEP MANAGEMENT
   ═══════════════════════════════════════════════ */

async function handleNewStep(stepData) {
  let croppedScreenshot = null;
  if (stepData.screenshotDataUrl) {
    try {
      croppedScreenshot = await cropScreenshot(
        stepData.screenshotDataUrl,
        stepData.elementRect,
        stepData.devicePixelRatio || 1,
        stepData.viewportWidth,
        stepData.viewportHeight,
        stepData.isNavigation
      );
    } catch (e) {
      console.warn('Screenshot crop failed:', e);
      croppedScreenshot = stepData.screenshotDataUrl;
    }
  }

  const step = {
    id: crypto.randomUUID(),
    guideId: currentGuide.id,
    order: steps.length,
    description: stepData.description,
    title: '',
    caption: '',
    selector: stepData.selector,
    screenshotDataUrl: croppedScreenshot,
    pageUrl: stepData.pageUrl,
    pageTitle: stepData.pageTitle,
    elementRect: stepData.elementRect,
    timestamp: stepData.timestamp,
    isNavigation: stepData.isNavigation || false,
  };

  await db.saveStep(step);
  steps.push(step);

  currentGuide.stepCount = steps.length;
  currentGuide.updatedAt = Date.now();
  await db.updateGuide(currentGuide);

  appendStepCard(step, steps.length - 1);
  updateEmptyState();
  updateRecordingUI();
  scrollToBottom();
  showSaveIndicator();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'STEP_NUMBER',
        number: steps.length,
        rect: stepData.elementRect,
      }).catch(() => {});
    }
  } catch (_e) { /* ignore */ }
}

/* ═══════════════════════════════════════════════
   RENDERING
   ═══════════════════════════════════════════════ */

function renderAllSteps() {
  Array.from(stepListEl.children).forEach((child) => {
    if (child !== emptyStateEl) child.remove();
  });
  steps.forEach((step, i) => appendStepCard(step, i));
}

function appendStepCard(step, index) {
  if (index > 0) {
    const inserter = createInserter(index);
    stepListEl.insertBefore(inserter, emptyStateEl);
  }
  const card = buildStepCardDOM(step, index);
  stepListEl.insertBefore(card, emptyStateEl);
}

function buildStepCardDOM(step, index) {
  const card = document.createElement('div');
  card.className = 'step-card' + (step.isNavigation ? ' navigation-step' : '');
  card.dataset.stepId = step.id;
  card.draggable = true;

  // ── Header row ──
  const header = document.createElement('div');
  header.className = 'step-card-header';

  const handleContainer = document.createElement('div');
  handleContainer.className = 'drag-handle-container';

  const handle = document.createElement('div');
  handle.className = 'drag-handle';
  handle.title = 'Drag to reorder';
  handle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
    <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
    <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
  </svg>`;

  const reorderArrows = document.createElement('div');
  reorderArrows.className = 'reorder-arrows';

  const upBtn = document.createElement('button');
  upBtn.className = 'arrow-btn up-arrow';
  upBtn.title = 'Move step up';
  upBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="18 15 12 9 6 15"/>
  </svg>`;
  upBtn.disabled = (index === 0);
  upBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    moveStepUpDown(step.id, -1);
  });

  const downBtn = document.createElement('button');
  downBtn.className = 'arrow-btn down-arrow';
  downBtn.title = 'Move step down';
  downBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>`;
  downBtn.disabled = (index === steps.length - 1);
  downBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    moveStepUpDown(step.id, 1);
  });

  reorderArrows.append(upBtn, downBtn);
  handleContainer.append(handle, reorderArrows);

  const badge = document.createElement('span');
  badge.className = 'step-number';
  badge.textContent = index + 1;

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-btn step-delete-btn';
  deleteBtn.title = 'Delete step';
  deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>`;
  deleteBtn.addEventListener('click', () => deleteStep(step.id));

  header.append(handleContainer, badge, deleteBtn);

  // ── Title input ──
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'step-title-input';
  titleInput.placeholder = 'Add a title…';
  titleInput.value = step.title || '';
  titleInput.addEventListener('change', async () => {
    step.title = titleInput.value.trim();
    await db.updateStep(step.id, { title: step.title });
    showSaveIndicator();
  });

  // ── Description (editable, placeholder via CSS :empty::before) ──
  const descEl = document.createElement('div');
  descEl.className = 'step-description';
  descEl.contentEditable = 'true';
  descEl.spellcheck = false;
  descEl.dataset.placeholder = 'Describe this step…';
  descEl.textContent = step.description || '';
  descEl.addEventListener('blur', async () => {
    const newDesc = descEl.textContent.trim();
    if (newDesc !== step.description) {
      step.description = newDesc;
      await db.updateStep(step.id, { description: step.description });
      showSaveIndicator();
    }
  });
  descEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); descEl.blur(); }
  });

  // ── Screenshot / Image area ──
  const imgFileInput = document.createElement('input');
  imgFileInput.type = 'file';
  imgFileInput.accept = 'image/*';
  imgFileInput.style.display = 'none';

  let imageArea;

  if (step.screenshotDataUrl) {
    imageArea = createImageWrapper(step, index, imgFileInput);
  } else {
    imageArea = createAddImageArea(imgFileInput);
  }

  imgFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await compressImage(file);
    step.screenshotDataUrl = compressed;
    await db.updateStep(step.id, { screenshotDataUrl: compressed });
    showSaveIndicator();
    // Replace the image area
    const newArea = createImageWrapper(step, index, imgFileInput);
    imageArea.replaceWith(newArea);
    imageArea = newArea;
  });

  // ── Caption ──
  const captionEl = document.createElement('textarea');
  captionEl.className = 'step-caption';
  captionEl.placeholder = 'Add a note…';
  captionEl.value = step.caption || '';
  captionEl.rows = 1;
  captionEl.addEventListener('input', autoResize);
  captionEl.addEventListener('change', async () => {
    step.caption = captionEl.value.trim();
    await db.updateStep(step.id, { caption: step.caption });
    showSaveIndicator();
  });
  requestAnimationFrame(() => autoResize.call(captionEl));

  // ── Page URL ──
  const urlEl = document.createElement('div');
  urlEl.className = 'step-page-url';
  if (step.pageUrl) {
    urlEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
    const urlText = document.createElement('span');
    try {
      urlText.textContent = new URL(step.pageUrl).hostname + new URL(step.pageUrl).pathname;
    } catch (_e) {
      urlText.textContent = step.pageUrl || '';
    }
    urlEl.appendChild(urlText);
  }

  // ── Assemble ──
  card.appendChild(header);
  card.appendChild(titleInput);
  card.appendChild(descEl);
  card.appendChild(imageArea);
  card.appendChild(imgFileInput);
  card.appendChild(captionEl);
  if (step.pageUrl) card.appendChild(urlEl);

  setupDragAndDrop(card);
  return card;
}

function createImageWrapper(step, index, fileInput) {
  const wrapper = document.createElement('div');
  wrapper.className = 'step-image-wrapper';

  const img = document.createElement('img');
  img.className = 'step-screenshot';
  img.src = step.screenshotDataUrl;
  img.alt = `Screenshot for step ${index + 1}`;
  img.loading = 'lazy';

  const changeBtn = document.createElement('button');
  changeBtn.className = 'change-image-btn';
  changeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Change`;
  changeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  wrapper.append(img, changeBtn);
  return wrapper;
}

function createAddImageArea(fileInput) {
  const area = document.createElement('div');
  area.className = 'add-image-area';
  area.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Add image`;
  area.addEventListener('click', () => fileInput.click());
  return area;
}

function createInserter(index) {
  const inserter = document.createElement('div');
  inserter.className = 'step-inserter';
  const btn = document.createElement('button');
  btn.className = 'insert-btn';
  btn.innerHTML = '+';
  btn.title = 'Insert step here';
  btn.addEventListener('click', () => insertManualStep(index));
  inserter.appendChild(btn);
  return inserter;
}

function updateEmptyState() {
  emptyStateEl.style.display = steps.length === 0 ? 'flex' : 'none';
}

function updateStepNumbers() {
  const cards = stepListEl.querySelectorAll('.step-card');
  cards.forEach((card, i) => {
    const badge = card.querySelector('.step-number');
    if (badge) badge.textContent = i + 1;
  });
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    stepListEl.scrollTop = stepListEl.scrollHeight;
  });
}

/* ═══════════════════════════════════════════════
   IMAGE COMPRESSION
   ═══════════════════════════════════════════════ */

function compressImage(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL('image/jpeg', quality));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

/* ═══════════════════════════════════════════════
   DELETE STEP
   ═══════════════════════════════════════════════ */

async function deleteStep(stepId) {
  const idx = steps.findIndex((s) => s.id === stepId);
  if (idx === -1) return;

  steps.splice(idx, 1);
  steps.forEach((s, i) => (s.order = i));

  await db.deleteStep(stepId);
  await db.reorderSteps(currentGuide.id, steps.map((s) => s.id));
  currentGuide.stepCount = steps.length;
  await db.updateGuide(currentGuide);

  renderAllSteps();
  updateEmptyState();
  updateRecordingUI();
  showSaveIndicator();
  showToast('Step deleted');
}

/* ═══════════════════════════════════════════════
   INSERT MANUAL STEP
   ═══════════════════════════════════════════════ */

async function insertManualStep(atIndex) {
  const step = {
    id: crypto.randomUUID(),
    guideId: currentGuide.id,
    order: atIndex,
    description: '', // Empty — placeholder shown via CSS :empty::before
    title: '',
    caption: '',
    selector: '',
    screenshotDataUrl: null,
    pageUrl: '',
    pageTitle: '',
    elementRect: null,
    timestamp: Date.now(),
    isNavigation: false,
  };

  steps.splice(atIndex, 0, step);
  steps.forEach((s, i) => (s.order = i));

  await db.saveStep(step);
  await db.reorderSteps(currentGuide.id, steps.map((s) => s.id));
  currentGuide.stepCount = steps.length;
  await db.updateGuide(currentGuide);

  renderAllSteps();
  updateEmptyState();
  updateRecordingUI();
  showSaveIndicator();

  const newCard = stepListEl.querySelector(`[data-step-id="${step.id}"]`);
  if (newCard) {
    newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const desc = newCard.querySelector('.step-description');
    if (desc) {
      setTimeout(() => desc.focus(), 100);
    }
  }

  showToast('Step added');
}

/* ═══════════════════════════════════════════════
   DRAG & DROP (with ghost image)
   ═══════════════════════════════════════════════ */

let draggedStepId = null;
let dragGhost = null;
let autoScrollInterval = null;

function setupDragAndDrop(card) {
  card.addEventListener('dragstart', (e) => {
    draggedStepId = card.dataset.stepId;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedStepId);

    // Create ghost image — clone the card
    dragGhost = card.cloneNode(true);
    dragGhost.style.position = 'fixed';
    dragGhost.style.top = '-9999px';
    dragGhost.style.left = '-9999px';
    dragGhost.style.width = card.offsetWidth + 'px';
    dragGhost.style.opacity = '0.85';
    dragGhost.style.transform = 'rotate(1.5deg) scale(0.95)';
    dragGhost.style.boxShadow = '0 12px 32px rgba(124,58,237,.25)';
    dragGhost.style.borderColor = '#c084fc';
    dragGhost.style.pointerEvents = 'none';
    dragGhost.style.zIndex = '9999';
    document.body.appendChild(dragGhost);
    e.dataTransfer.setDragImage(dragGhost, e.offsetX, e.offsetY);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    clearDragIndicators();
    draggedStepId = null;
    if (dragGhost) {
      dragGhost.remove();
      dragGhost = null;
    }
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
    }
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (card.dataset.stepId === draggedStepId) return;

    clearDragIndicators();
    const rect = card.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      card.classList.add('drag-over-top');
    } else {
      card.classList.add('drag-over-bottom');
    }
  });

  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over-top', 'drag-over-bottom');
  });

  card.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
    }
    if (!draggedStepId) return;
    const targetId = card.dataset.stepId;
    if (draggedStepId === targetId) return;

    const fromIdx = steps.findIndex((s) => s.id === draggedStepId);
    let toIdx = steps.findIndex((s) => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const isAbove = card.classList.contains('drag-over-top');
    clearDragIndicators();

    const [moved] = steps.splice(fromIdx, 1);
    toIdx = steps.findIndex((s) => s.id === targetId);
    if (toIdx === -1) toIdx = steps.length;
    const insertAt = isAbove ? toIdx : toIdx + 1;
    steps.splice(insertAt, 0, moved);
    steps.forEach((s, i) => (s.order = i));

    await db.reorderSteps(currentGuide.id, steps.map((s) => s.id));

    reorderDOM();
    showSaveIndicator();
    showToast('Step reordered');
  });
}

function clearDragIndicators() {
  stepListEl.querySelectorAll('.step-card').forEach((c) => {
    c.classList.remove('drag-over-top', 'drag-over-bottom');
  });
}

/* ═══════════════════════════════════════════════
   SCREENSHOT CROPPING
   ═══════════════════════════════════════════════ */

function cropScreenshot(fullDataUrl, elementRect, dpr, vpWidth, vpHeight, isNav) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        if (isNav) {
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

        const padding = 70;
        const cropX = Math.max(0, elementRect.x - padding);
        const cropY = Math.max(0, elementRect.y - padding);
        const cropRight = Math.min(vpWidth, elementRect.x + elementRect.width + padding);
        const cropBottom = Math.min(vpHeight, elementRect.y + elementRect.height + padding);

        const sx = cropX * dpr;
        const sy = cropY * dpr;
        const sw = (cropRight - cropX) * dpr;
        const sh = (cropBottom - cropY) * dpr;

        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

        // Highlight border
        const hlX = (elementRect.x - cropX) * dpr;
        const hlY = (elementRect.y - cropY) * dpr;
        const hlW = elementRect.width * dpr;
        const hlH = elementRect.height * dpr;
        const r = 5 * dpr;

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

        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Failed to load screenshot'));
    img.src = fullDataUrl;
  });
}

/* ═══════════════════════════════════════════════
   GUIDE MANAGEMENT
   ═══════════════════════════════════════════════ */

async function createNewGuide() {
  currentGuide = await db.createGuide('Untitled Guide');
  steps = [];
}

async function handleTitleSave() {
  if (!currentGuide) return;
  const newTitle = guideTitleInput.value.trim() || 'Untitled Guide';
  guideTitleInput.value = newTitle;
  currentGuide.title = newTitle;
  await db.updateGuide(currentGuide);
  showSaveIndicator();
}

async function loadGuide(guideId) {
  if (isRecording) await stopRecording();
  currentGuide = await db.getGuide(guideId);
  if (!currentGuide) return;
  steps = await db.getSteps(currentGuide.id);
  guideTitleInput.value = currentGuide.title;
  renderAllSteps();
  updateEmptyState();
  updateRecordingUI();
}

/* ═══════════════════════════════════════════════
   DASHBOARD VIEW
   ═══════════════════════════════════════════════ */

let selectedGuideIds = new Set();

function showDashboard() {
  editorView.hidden = true;
  dashboardView.hidden = false;
  selectedGuideIds.clear();
  dashSelectAll.checked = false;
  renderDashboard();
}

function showEditor() {
  dashboardView.hidden = true;
  editorView.hidden = false;
}

async function renderDashboard() {
  const guides = await db.listGuides();
  dashGuideListEl.innerHTML = '';

  // Storage summary
  const totalBytes = await db.estimateTotalSize();
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
  storageLabel.textContent = `${totalMB} MB used`;
  // Assume ~100MB soft limit for extension storage
  const percent = Math.min(100, (totalBytes / (100 * 1024 * 1024)) * 100);
  storageBarFill.style.width = percent + '%';

  // Show/hide bulk actions
  dashBulkActions.hidden = guides.length === 0;
  dashSelectAll.checked = (guides.length > 0 && selectedGuideIds.size === guides.length);
  updateBulkDeleteBtn();

  if (guides.length === 0) {
    dashGuideListEl.innerHTML = `
      <div class="guides-empty">
        <svg width="48" height="48" viewBox="0 0 56 56" fill="none">
          <rect x="4" y="4" width="48" height="48" rx="12" fill="#f3e8ff" stroke="#d8b4fe" stroke-width="1.5"/>
          <path d="M20 22h16M20 28h12M20 34h8" stroke="#a78bfa" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span>No guides yet. Create one to get started!</span>
      </div>`;
    return;
  }

  for (const guide of guides) {
    const sizeBytes = await db.estimateGuideSize(guide.id);
    const sizeStr = formatSize(sizeBytes);
    const dateStr = new Date(guide.updatedAt).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });

    const card = document.createElement('div');
    card.className = 'dash-guide-card' + (currentGuide && guide.id === currentGuide.id ? ' active' : '');
    card.dataset.guideId = guide.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'dash-guide-checkbox';
    checkbox.dataset.guideId = guide.id;
    checkbox.checked = selectedGuideIds.has(guide.id);
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        selectedGuideIds.add(guide.id);
      } else {
        selectedGuideIds.delete(guide.id);
      }
      updateBulkDeleteBtn();
    });

    const info = document.createElement('div');
    info.className = 'dash-guide-info';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'dash-guide-title-input';
    titleInput.value = guide.title;
    titleInput.addEventListener('click', (e) => e.stopPropagation());
    titleInput.addEventListener('change', async () => {
      guide.title = titleInput.value.trim() || 'Untitled Guide';
      titleInput.value = guide.title;
      await db.updateGuide(guide);
      if (currentGuide && guide.id === currentGuide.id) {
        currentGuide.title = guide.title;
        guideTitleInput.value = guide.title;
      }
      showSaveIndicator();
    });

    const meta = document.createElement('div');
    meta.className = 'dash-guide-meta';
    meta.innerHTML = `<span>${guide.stepCount || 0} steps</span><span>·</span><span>${dateStr}</span><span>·</span><span class="size">${sizeStr}</span>`;

    info.append(titleInput, meta);

    const actions = document.createElement('div');
    actions.className = 'dash-guide-actions';

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.title = 'Delete guide';
    delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>`;
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteSingleGuide(guide.id);
    });

    actions.appendChild(delBtn);
    card.append(info, actions);

    // Click card to open guide
    card.addEventListener('click', async () => {
      await loadGuide(guide.id);
      showEditor();
    });

    const row = document.createElement('div');
    row.className = 'dash-guide-row';
    row.append(checkbox, card);

    dashGuideListEl.appendChild(row);
  }
}

async function deleteSingleGuide(guideId) {
  const guides = await db.listGuides();
  await db.deleteGuide(guideId);

  if (currentGuide && guideId === currentGuide.id) {
    const remaining = await db.listGuides();
    if (remaining.length > 0) {
      await loadGuide(remaining[0].id);
    } else {
      await createNewGuide();
      guideTitleInput.value = currentGuide.title;
      steps = [];
      renderAllSteps();
      updateEmptyState();
    }
  }

  selectedGuideIds.delete(guideId);
  renderDashboard();
  showToast('Guide deleted');
}

async function handleNewGuideFromDash() {
  if (isRecording) await stopRecording();
  await createNewGuide();
  guideTitleInput.value = currentGuide.title;
  steps = [];
  renderAllSteps();
  updateEmptyState();
  updateRecordingUI();
  showEditor();
  guideTitleInput.focus();
  guideTitleInput.select();
  showToast('New guide created');
}

function handleDashSelectAll() {
  const checkboxes = dashGuideListEl.querySelectorAll('.dash-guide-checkbox');
  if (dashSelectAll.checked) {
    checkboxes.forEach((cb) => {
      cb.checked = true;
      selectedGuideIds.add(cb.dataset.guideId);
    });
  } else {
    checkboxes.forEach((cb) => { cb.checked = false; });
    selectedGuideIds.clear();
  }
  updateBulkDeleteBtn();
}

async function handleBulkDelete() {
  try {
    console.log('handleBulkDelete started. selectedGuideIds:', Array.from(selectedGuideIds));
    if (selectedGuideIds.size === 0) {
      console.warn('No guides selected for deletion');
      return;
    }
    const count = selectedGuideIds.size;
    const confirmed = await confirmCustom(
      'Delete Guides',
      `Are you sure you want to delete ${count} selected guide${count !== 1 ? 's' : ''}? This cannot be undone.`,
      'Delete'
    );
    if (!confirmed) {
      console.log('Bulk delete cancelled by user');
      return;
    }

    console.log('Beginning deletion loop...');
    for (const id of selectedGuideIds) {
      console.log('Deleting guide ID:', id);
      await db.deleteGuide(id);
    }

    console.log('All selected guides deleted successfully. Updating state...');
    
    // If current guide was deleted
    if (currentGuide && selectedGuideIds.has(currentGuide.id)) {
      console.log('Current guide was deleted. Loading alternative guide...');
      const remaining = await db.listGuides();
      if (remaining.length > 0) {
        await loadGuide(remaining[0].id);
      } else {
        await createNewGuide();
        guideTitleInput.value = currentGuide.title;
        steps = [];
        renderAllSteps();
        updateEmptyState();
      }
    }

    selectedGuideIds.clear();
    dashSelectAll.checked = false;
    renderDashboard();
    showToast(`${count} guide${count !== 1 ? 's' : ''} deleted`);
  } catch (err) {
    console.error('Bulk delete failed with error:', err);
    alert('Bulk delete failed: ' + err.message);
  }
}

async function handleBulkExport() {
  try {
    console.log('handleBulkExport started. selectedGuideIds:', Array.from(selectedGuideIds));
    if (selectedGuideIds.size === 0) {
      console.warn('No guides selected for export');
      return;
    }
    const count = selectedGuideIds.size;
    const backupData = [];

    for (const id of selectedGuideIds) {
      const guide = await db.getGuide(id);
      if (guide) {
        const guideSteps = await db.getSteps(id);
        backupData.push({
          version: "1.0",
          generator: "Manualize",
          guide: {
            id: guide.id,
            title: guide.title,
            createdAt: guide.createdAt || Date.now(),
            updatedAt: guide.updatedAt || Date.now(),
            stepCount: guideSteps.length
          },
          steps: guideSteps.map(s => ({
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
        });
      }
    }

    const json = JSON.stringify(backupData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manualize-bulk-backup-${Date.now()}.manualize`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 100);

    showToast(`Exported ${backupData.length} guides!`);
  } catch (err) {
    console.error('Bulk export failed:', err);
    alert('Bulk export failed: ' + err.message);
  }
}

function updateBulkDeleteBtn() {
  const disabledState = selectedGuideIds.size === 0;
  dashBulkDeleteBtn.disabled = disabledState;
  if (dashBulkExportBtn) {
    dashBulkExportBtn.disabled = disabledState;
  }
}

/* ═══════════════════════════════════════════════
   EXPORT
   ═══════════════════════════════════════════════ */

async function handleExportHtml() {
  if (steps.length === 0) {
    showToast('No steps to export');
    return;
  }
  await handleTitleSave();
  exportToHtml(currentGuide, steps);
  showToast('HTML exported!');
}

function showPdfModal() {
  if (steps.length === 0) {
    showToast('No steps to export');
    return;
  }
  pdfModal.hidden = false;
}

async function handleExportPdf() {
  pdfModal.hidden = true;
  await handleTitleSave();
  const layout = document.querySelector('input[name="pdfLayout"]:checked')?.value || 'one-per-page';
  exportToPdf(currentGuide, steps, layout);
  showToast('PDF exported!');
}

/* ═══════════════════════════════════════════════
   SAVE INDICATOR
   ═══════════════════════════════════════════════ */

let saveTimeout = null;

function showSaveIndicator() {
  saveTextEl.textContent = 'Saved';
  saveIndicatorEl.classList.add('visible');
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveIndicatorEl.classList.remove('visible');
  }, 2000);
}

/* ═══════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════ */

let toastTimeout = null;

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  clearTimeout(toastTimeout);

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2200);
}

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */

function autoResize() {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/* ═══════════════════════════════════════════════
   REORDERING & IMPORT/EXPORT (v3 ADDITIONS)
   ═══════════════════════════════════════════════ */

function reorderDOM() {
  const cardEls = Array.from(stepListEl.querySelectorAll('.step-card'));
  const cardMap = new Map(cardEls.map((el) => [el.dataset.stepId, el]));

  stepListEl.querySelectorAll('.step-inserter').forEach((el) => el.remove());

  steps.forEach((step, i) => {
    const card = cardMap.get(step.id);
    if (card) {
      if (i > 0) {
        const inserter = createInserter(i);
        stepListEl.insertBefore(inserter, emptyStateEl);
      }
      const badge = card.querySelector('.step-number');
      if (badge) badge.textContent = i + 1;

      // Update arrow buttons
      const upBtn = card.querySelector('.up-arrow');
      const downBtn = card.querySelector('.down-arrow');
      if (upBtn) {
        upBtn.disabled = (i === 0);
      }
      if (downBtn) {
        downBtn.disabled = (i === steps.length - 1);
      }

      stepListEl.insertBefore(card, emptyStateEl);
    }
  });
}

async function moveStepUpDown(stepId, direction) {
  const fromIdx = steps.findIndex((s) => s.id === stepId);
  if (fromIdx === -1) return;
  const toIdx = fromIdx + direction;
  if (toIdx < 0 || toIdx >= steps.length) return;

  const [moved] = steps.splice(fromIdx, 1);
  steps.splice(toIdx, 0, moved);
  steps.forEach((s, i) => (s.order = i));

  await db.reorderSteps(currentGuide.id, steps.map((s) => s.id));

  reorderDOM();
  showSaveIndicator();
  showToast(`Step moved ${direction === -1 ? 'up' : 'down'}`);
}

function exportGuideJson(guide, steps) {
  const data = {
    version: "1.0",
    generator: "Manualize",
    guide: {
      id: guide.id,
      title: guide.title,
      createdAt: guide.createdAt || Date.now(),
      updatedAt: guide.updatedAt || Date.now(),
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
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(guide.title || 'guide')}.manualize`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 100);
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'guide';
}

async function handleImportFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;

  const filename = file.name.toLowerCase();
  if (filename.endsWith('.html') || filename.endsWith('.htm')) {
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const scriptEl = doc.getElementById('manualize-data');
      if (!scriptEl) {
        throw new Error('This HTML file does not contain Manualize guide data.');
      }
      const data = JSON.parse(scriptEl.textContent);
      await importGuideJson(data);
    } catch (err) {
      console.error('HTML parse for import failed:', err);
      alert('Failed to parse guide from HTML: ' + err.message);
    }
  } else {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importGuideJson(data);
    } catch (err) {
      console.error('JSON parse for import failed:', err);
      alert('Failed to parse backup file: ' + err.message);
    }
  }
  importFileInput.value = '';
}

async function importGuideJson(data) {
  try {
    if (Array.isArray(data)) {
      let count = 0;
      for (const item of data) {
        await importSingleGuideJson(item, true);
        count++;
      }
      renderDashboard();
      showToast(`Imported ${count} guides successfully!`);
    } else {
      await importSingleGuideJson(data, false);
    }
  } catch (err) {
    console.error('Import failed:', err);
    alert('Import failed: ' + err.message);
  }
}

async function importSingleGuideJson(data, isBulk = false) {
  if (!data || !data.guide || !Array.isArray(data.steps)) {
    throw new Error('Invalid guide format.');
  }

  const fileGuideId = data.guide.id;
  let targetGuideId = fileGuideId;
  let isOverwrite = false;

  if (fileGuideId) {
    const existingGuide = await db.getGuide(fileGuideId);
    if (existingGuide) {
      isOverwrite = await confirmCustom(
        'Guide Exists',
        `A guide titled "${existingGuide.title}" already exists in your database. Do you want to overwrite and sync it with the changes from the file? (Click Cancel to import it as a new copy)`,
        'Overwrite'
      );
    }
  }

  if (isOverwrite) {
    const guide = {
      id: fileGuideId,
      title: data.guide.title || 'Imported Guide',
      createdAt: data.guide.createdAt || Date.now(),
      updatedAt: Date.now(),
      stepCount: data.steps.length
    };
    await db.updateGuide(guide);
    await db._deleteGuideSteps(fileGuideId);

    for (const stepData of data.steps) {
      const step = {
        id: stepData.id || crypto.randomUUID(),
        guideId: fileGuideId,
        order: stepData.order,
        description: stepData.description || '',
        title: stepData.title || '',
        caption: stepData.caption || '',
        selector: stepData.selector || '',
        screenshotDataUrl: stepData.screenshotDataUrl || null,
        pageUrl: stepData.pageUrl || '',
        pageTitle: stepData.pageTitle || '',
        elementRect: stepData.elementRect || null,
        timestamp: Date.now() + stepData.order,
        isNavigation: !!stepData.isNavigation
      };
      await db.saveStep(step);
    }

    if (!isBulk) {
      await loadGuide(fileGuideId);
      showEditor();
      showToast('Guide synchronized/updated!');
    }
  } else {
    targetGuideId = crypto.randomUUID();
    const guide = {
      id: targetGuideId,
      title: (data.guide.title || 'Imported Guide') + ' (Copy)',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stepCount: data.steps.length
    };
    await db.updateGuide(guide);

    for (const stepData of data.steps) {
      const step = {
        id: crypto.randomUUID(),
        guideId: targetGuideId,
        order: stepData.order,
        description: stepData.description || '',
        title: stepData.title || '',
        caption: stepData.caption || '',
        selector: stepData.selector || '',
        screenshotDataUrl: stepData.screenshotDataUrl || null,
        pageUrl: stepData.pageUrl || '',
        pageTitle: stepData.pageTitle || '',
        elementRect: stepData.elementRect || null,
        timestamp: Date.now() + stepData.order,
        isNavigation: !!stepData.isNavigation
      };
      await db.saveStep(step);
    }

    if (!isBulk) {
      await loadGuide(targetGuideId);
      showEditor();
      showToast('Imported as new copy!');
    }
  }
}

function confirmCustom(title, message, confirmText = 'OK') {
  return new Promise((resolve) => {
    const confirmModal = document.getElementById('confirmModal');
    const confirmTitle = document.getElementById('confirmTitle');
    const confirmMessage = document.getElementById('confirmMessage');
    const confirmOkBtn = document.getElementById('confirmOkBtn');
    const confirmCancelBtn = document.getElementById('confirmCancelBtn');
    const closeConfirmModalBtn = document.getElementById('closeConfirmModal');

    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOkBtn.textContent = confirmText;

    // Clone buttons to purge old event listeners
    const newOk = confirmOkBtn.cloneNode(true);
    confirmOkBtn.replaceWith(newOk);
    const newCancel = confirmCancelBtn.cloneNode(true);
    confirmCancelBtn.replaceWith(newCancel);
    const newClose = closeConfirmModalBtn.cloneNode(true);
    closeConfirmModalBtn.replaceWith(newClose);

    confirmModal.hidden = false;

    const cleanup = (value) => {
      confirmModal.hidden = true;
      resolve(value);
    };

    newOk.addEventListener('click', () => cleanup(true));
    newCancel.addEventListener('click', () => cleanup(false));
    newClose.addEventListener('click', () => cleanup(false));
    confirmModal.onclick = (e) => {
      if (e.target === confirmModal) cleanup(false);
    };
  });
}
