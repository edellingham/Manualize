/**
 * Manualize — Content Script
 * Intercepts user interactions and generates step data for the recorder.
 * Runs in an isolated world on every page.
 *
 * v2: Pre-captures screenshot on mousedown (before dropdowns close),
 *     improved debounce, more conservative navigation detection.
 */
(function () {
  'use strict';

  /* ====== STATE ====== */
  let isRecording = false;
  let lastCapturedElement = null;
  let lastCaptureTime = 0;
  const DEBOUNCE_MS = 600;
  let stepCounter = 0;

  /* ====== RECORDING STATE ====== */

  // Read initial state
  chrome.storage.local.get(
    ['manualizeRecording', 'manualizeRecordingStartTime'],
    (result) => {
      isRecording = result.manualizeRecording || false;

      // Detect page navigation during active recording
      // Require at least 1.5s gap to avoid false positives on SPA transitions
      if (
        isRecording &&
        result.manualizeRecordingStartTime &&
        performance.timeOrigin > result.manualizeRecordingStartTime + 1500
      ) {
        setTimeout(reportNavigation, 800);
      }
    }
  );

  // React to recording state changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.manualizeRecording) {
      isRecording = changes.manualizeRecording.newValue || false;
      if (!isRecording) stepCounter = 0;
    }
  });

  // Respond to pings from service-worker / side-panel
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ status: 'ready' });
    }
    if (message.type === 'STEP_NUMBER') {
      showStepNumber(message.number, message.rect);
    }
    return true;
  });

  /* ====== NAVIGATION STEP ====== */

  function reportNavigation() {
    if (!isRecording) return;
    chrome.runtime.sendMessage({
      type: 'STEP_RECORDED',
      data: {
        description: `Navigate to "${document.title || window.location.hostname}"`,
        selector: '',
        elementRect: {
          x: 0,
          y: 0,
          width: window.innerWidth,
          height: window.innerHeight,
        },
        pageUrl: window.location.href,
        pageTitle: document.title,
        timestamp: Date.now(),
        devicePixelRatio: window.devicePixelRatio,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        isNavigation: true,
      },
    });
  }

  /* ====== EVENT LISTENERS ====== */

  // Pre-capture screenshot on mousedown BEFORE UI changes (dropdowns closing, etc.)
  document.addEventListener(
    'mousedown',
    (e) => {
      if (!isRecording) return;
      const el = e.target;
      if (
        el.closest('.manualize-highlight') ||
        el.closest('.manualize-step-number')
      )
        return;

      // Tell service worker to capture the tab NOW, before the click completes
      try {
        chrome.runtime.sendMessage({ type: 'PRE_CAPTURE' });
      } catch (_e) {
        /* extension context might be invalidated */
      }
    },
    true
  );

  document.addEventListener('click', handleClick, true);
  document.addEventListener('change', handleChange, true);

  function handleClick(e) {
    if (!isRecording) return;
    const el = e.target;

    // Skip our own overlays
    if (
      el.closest('.manualize-highlight') ||
      el.closest('.manualize-step-number')
    )
      return;

    // Skip elements handled by the change listener
    if (el.tagName === 'SELECT' || el.tagName === 'OPTION') return;
    if (
      el.tagName === 'INPUT' &&
      (el.type === 'checkbox' || el.type === 'radio')
    )
      return;

    const interactive = getInteractiveElement(el);
    if (!shouldCapture(interactive)) return;

    captureStep(interactive, 'click');
  }

  function handleChange(e) {
    if (!isRecording) return;
    const el = e.target;
    if (
      el.tagName === 'SELECT' ||
      (el.tagName === 'INPUT' &&
        (el.type === 'checkbox' || el.type === 'radio'))
    ) {
      if (!shouldCapture(el)) return;
      captureStep(el, 'change');
    }
  }

  /* ====== DEBOUNCE ====== */

  function shouldCapture(element) {
    const now = Date.now();
    // Same element within debounce window → skip
    if (element === lastCapturedElement && now - lastCaptureTime < DEBOUNCE_MS)
      return false;
    // Any element within a tight window → skip (prevents double-fire)
    if (now - lastCaptureTime < 200) return false;
    lastCapturedElement = element;
    lastCaptureTime = now;
    return true;
  }

  /* ====== CAPTURE ====== */

  function captureStep(element, eventType) {
    const rect = element.getBoundingClientRect();
    const description = generateDescription(element, eventType);
    const selector = generateSelector(element);

    stepCounter++;

    // Show visual highlight on the page
    showHighlight(element);

    // Send step immediately — service worker already has the pre-captured screenshot
    chrome.runtime.sendMessage({
      type: 'STEP_RECORDED',
      data: {
        description,
        selector,
        elementRect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        pageUrl: window.location.href,
        pageTitle: document.title,
        timestamp: Date.now(),
        devicePixelRatio: window.devicePixelRatio,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        isNavigation: false,
      },
    });
  }

  /* ====== DESCRIPTION GENERATOR ====== */

  function generateDescription(element, eventType) {
    const tag = element.tagName.toLowerCase();
    const text = getVisibleText(element);
    const label = getElementLabel(element);
    const type = (element.type || '').toLowerCase();

    // Buttons
    if (tag === 'button' || (tag === 'input' && type === 'submit')) {
      return `Click the "${text || 'Submit'}" button`;
    }

    // Links
    if (tag === 'a') {
      return `Click the "${text || element.href || 'link'}" link`;
    }

    // Inputs
    if (tag === 'input') {
      const fieldName = label || element.placeholder || element.name || type;
      if (type === 'checkbox') {
        return element.checked
          ? `Check the "${fieldName}" checkbox`
          : `Uncheck the "${fieldName}" checkbox`;
      }
      if (type === 'radio') {
        return `Select the "${fieldName}" option`;
      }
      if (
        [
          'text',
          'email',
          'password',
          'search',
          'tel',
          'url',
          'number',
        ].includes(type)
      ) {
        return `Click the "${fieldName}" field`;
      }
      return `Interact with the "${fieldName}" input`;
    }

    // Select
    if (tag === 'select') {
      const selected = element.options[element.selectedIndex]?.text || '';
      const fieldName = label || element.name || 'dropdown';
      return `Select "${selected}" from the "${fieldName}" dropdown`;
    }

    // Textarea
    if (tag === 'textarea') {
      return `Click the "${label || element.placeholder || 'text area'}" field`;
    }

    // Images
    if (tag === 'img') {
      return `Click the "${element.alt || 'image'}" image`;
    }

    // Role-based
    const role = element.getAttribute('role');
    if (role === 'button') return `Click the "${text || 'button'}" button`;
    if (role === 'link') return `Click the "${text || 'link'}" link`;
    if (role === 'tab') return `Click the "${text || 'tab'}" tab`;
    if (role === 'menuitem') return `Click "${text || 'menu item'}"`;

    // Generic
    if (text) return `Click on "${text}"`;
    return `Click on <${tag}> element`;
  }

  /* ====== TEXT EXTRACTION ====== */

  function getVisibleText(el) {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return truncate(ariaLabel, 50);

    const title = el.getAttribute('title');
    if (title) return truncate(title, 50);

    const text = el.innerText || el.textContent || '';
    const trimmed = text.trim().replace(/\s+/g, ' ');
    return truncate(trimmed, 50);
  }

  function getElementLabel(el) {
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) return truncate(lbl.textContent.trim(), 40);
    }
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone
        .querySelectorAll('input, select, textarea')
        .forEach((c) => c.remove());
      const t = clone.textContent.trim();
      if (t) return truncate(t, 40);
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return truncate(aria, 40);
    return '';
  }

  function truncate(str, max) {
    if (!str) return '';
    return str.length <= max ? str : str.substring(0, max - 3) + '...';
  }

  /* ====== CSS SELECTOR GENERATOR ====== */

  function generateSelector(element) {
    if (element.id && !isAutoGeneratedId(element.id)) {
      return '#' + CSS.escape(element.id);
    }
    const testId = element.getAttribute('data-testid');
    if (testId) return `[data-testid="${testId}"]`;
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return `[aria-label="${CSS.escape(ariaLabel)}"]`;
    const tag = element.tagName.toLowerCase();
    for (const cls of element.classList) {
      try {
        if (
          document.querySelectorAll(`${tag}.${CSS.escape(cls)}`).length === 1
        ) {
          return `${tag}.${CSS.escape(cls)}`;
        }
      } catch (_e) {
        /* skip invalid selectors */
      }
    }
    return buildSelectorPath(element);
  }

  function isAutoGeneratedId(id) {
    return (
      /^[a-f0-9]{8,}$/i.test(id) ||
      /^:r[0-9a-z]+:$/i.test(id) ||
      /^(react|ember|ng-|rc-|headlessui)/.test(id) ||
      /^\d+$/.test(id)
    );
  }

  function buildSelectorPath(element) {
    const parts = [];
    let current = element;
    while (current && current !== document.body && parts.length < 4) {
      let sel = current.tagName.toLowerCase();
      if (current.id && !isAutoGeneratedId(current.id)) {
        parts.unshift('#' + CSS.escape(current.id));
        break;
      }
      if (current.classList.length > 0) {
        const stableClasses = Array.from(current.classList).filter(
          (c) => !/^[a-z]{1,3}[A-Z0-9]|_[a-f0-9]{4,}/.test(c)
        );
        if (stableClasses.length > 0) {
          sel +=
            '.' +
            stableClasses
              .slice(0, 2)
              .map((c) => CSS.escape(c))
              .join('.');
        }
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (s) => s.tagName === current.tagName
        );
        if (siblings.length > 1) {
          sel += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }
      parts.unshift(sel);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  /* ====== INTERACTIVE ELEMENT RESOLVER ====== */

  function getInteractiveElement(target) {
    const interactiveTags = new Set([
      'BUTTON',
      'A',
      'INPUT',
      'SELECT',
      'TEXTAREA',
      'LABEL',
      'SUMMARY',
    ]);
    let el = target;
    for (let i = 0; i < 5; i++) {
      if (!el || el === document.body) break;
      if (interactiveTags.has(el.tagName)) return el;
      const role = el.getAttribute('role');
      if (
        role === 'button' ||
        role === 'link' ||
        role === 'tab' ||
        role === 'menuitem'
      )
        return el;
      if (el.getAttribute('tabindex') !== null) return el;
      el = el.parentElement;
    }
    return target;
  }

  /* ====== VISUAL FEEDBACK ====== */

  function showHighlight(element) {
    const rect = element.getBoundingClientRect();
    const pad = 4;

    const highlight = document.createElement('div');
    highlight.className = 'manualize-highlight';
    highlight.style.left = rect.left - pad + 'px';
    highlight.style.top = rect.top - pad + 'px';
    highlight.style.width = rect.width + pad * 2 + 'px';
    highlight.style.height = rect.height + pad * 2 + 'px';
    document.documentElement.appendChild(highlight);

    highlight.addEventListener('animationend', () => highlight.remove());
    setTimeout(() => {
      if (highlight.parentNode) highlight.remove();
    }, 1200);
  }

  function showStepNumber(number, rect) {
    const badge = document.createElement('div');
    badge.className = 'manualize-step-number';
    badge.textContent = number;
    badge.style.left = rect.x - 8 + 'px';
    badge.style.top = rect.y - 26 + 'px';
    document.documentElement.appendChild(badge);

    setTimeout(() => {
      if (badge.parentNode) badge.remove();
    }, 2500);
  }

  /* ====== ANNOUNCE READINESS ====== */
  try {
    chrome.runtime.sendMessage({ type: 'CONTENT_READY' });
  } catch (_e) {
    /* extension context invalidated — ignore */
  }
})();
