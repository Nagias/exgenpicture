// Content Script: Image overlay icon + mini popup with 3 options
// Uses Shadow DOM to isolate styles from host page

(function () {
  'use strict';

  const MIN_IMAGE_SIZE = 150; // Minimum image dimension to show overlay
  const ICON_SIZE = 36;
  const DEBOUNCE_MS = 150;

  // Check if an element is a real content image (not an icon/avatar/thumbnail)
  function isRealImage(img) {
    const rect = img.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Too small — definitely an icon or thumbnail
    if (w < MIN_IMAGE_SIZE || h < MIN_IMAGE_SIZE) return false;

    // Check natural dimensions if available (real img elements)
    if (img.naturalWidth && img.naturalHeight) {
      if (img.naturalWidth < 80 || img.naturalHeight < 80) return false;
    }

    // Check for icon/avatar patterns in class, id, role, alt
    const hints = [
      img.className || '',
      img.id || '',
      img.alt || '',
      img.getAttribute('role') || '',
      img.closest?.('[class]')?.className || ''
    ].join(' ').toLowerCase();

    const iconPatterns = /\b(icon|logo|avatar|emoji|badge|favicon|sprite|thumb(?:nail)?|btn|button|arrow|caret|chevron|loading|spinner|placeholder)\b/;
    if (iconPatterns.test(hints)) return false;

    // Check src for common icon paths
    const src = (img.src || '').toLowerCase();
    if (/\/(icon|logo|emoji|avatar|badge|favicon)s?\//i.test(src)) return false;
    if (/\.(svg|ico)$/i.test(src)) return false;

    // Very square AND very small = likely icon (real photos can be square but bigger)
    const ratio = w / h;
    if (ratio > 0.9 && ratio < 1.1 && w < 200) return false;

    return true;
  }

  // Track state
  let currentOverlay = null;
  let currentPopup = null;
  let activeImageUrl = null;
  let isAnalyzing = false;

  // ─── Shadow DOM Container ──────────────────────────────────
  const hostEl = document.createElement('div');
  hostEl.id = 'img-prompt-gen-host';
  hostEl.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  document.body.appendChild(hostEl);
  const shadow = hostEl.attachShadow({ mode: 'closed' });

  // ─── Inject Styles into Shadow DOM ─────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .ipg-overlay-icon {
      position: fixed;
      width: ${ICON_SIZE}px;
      height: ${ICON_SIZE}px;
      border-radius: 12px;
      background: linear-gradient(135deg, #0054d6, #004abd);
      border: none;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      opacity: 0;
      transform: scale(0.7);
      transition: opacity 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
      box-shadow: 0 8px 32px rgba(50, 50, 50, 0.06);
      z-index: 2147483647;
      backdrop-filter: blur(8px);
    }
    .ipg-overlay-icon.visible {
      opacity: 1;
      transform: scale(1);
    }
    .ipg-overlay-icon:hover {
      transform: scale(1.1);
      box-shadow: 0 12px 40px rgba(0, 84, 214, 0.25);
    }
    .ipg-overlay-icon.analyzing {
      animation: ipg-spin 1s linear infinite;
    }
    .ipg-overlay-icon svg {
      width: 20px;
      height: 20px;
      fill: white;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
    }

    @keyframes ipg-spin {
      from { transform: rotate(0deg) scale(1); }
      to { transform: rotate(360deg) scale(1); }
    }

    .ipg-popup {
      position: fixed;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      background: rgba(252, 249, 248, 0.95);
      backdrop-filter: blur(12px) saturate(1.8);
      border: 1px solid rgba(50, 50, 50, 0.08);
      border-radius: 16px;
      box-shadow: 0 12px 48px rgba(50, 50, 50, 0.1);
      z-index: 2147483647;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(10px) scale(0.95);
      transition: opacity 0.25s ease, transform 0.25s ease;
      width: 520px;
      font-family: 'Be Vietnam Pro', system-ui, -apple-system, sans-serif;
    }
    .ipg-popup.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .ipg-popup-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ipg-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ipg-popup-title {
      color: #323232;
      font-weight: 600;
      font-size: 1rem;
    }
    .ipg-clear-cache {
      border: none;
      background: none;
      color: #999;
      font-size: 0.7rem;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Be Vietnam Pro', system-ui, sans-serif;
    }
    .ipg-clear-cache:hover {
      background: rgba(0,0,0,0.05);
      color: #e53935;
    }
    .ipg-tab-bar {
      display: flex;
      gap: 4px;
      margin-bottom: -12px;
      z-index: 1;
    }
    .ipg-tab {
      padding: 8px 16px;
      border: none;
      background: rgba(50,50,50,0.05);
      border-radius: 6px 6px 0 0;
      font-size: 0.8rem;
      font-weight: 600;
      color: #757575;
      cursor: pointer;
      font-family: 'Be Vietnam Pro', system-ui, sans-serif;
    }
    .ipg-tab.active {
      background: #fcf9f8;
      color: #0054d6;
      border-top: 1px solid rgba(50,50,50,0.1);
      border-left: 1px solid rgba(50,50,50,0.1);
      border-right: 1px solid rgba(50,50,50,0.1);
      padding-bottom: 7px;
    }
    .ipg-popup-content {
      background: #fcf9f8;
      border-radius: 8px;
      padding: 16px;
      font-family: monospace;
      font-size: 0.85rem;
      line-height: 1.5;
      color: #323232;
      white-space: pre-wrap;
      max-height: 420px;
      overflow-y: auto;
      outline: none;
      border: 1px solid rgba(50,50,50,0.1);
    }
    .ipg-popup-content::-webkit-scrollbar {
      width: 6px;
    }
    .ipg-popup-content::-webkit-scrollbar-thumb {
      background: #ccc;
      border-radius: 3px;
    }
    .ipg-action-container {
      position: relative;
    }
    .ipg-copy-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px;
      border: none;
      border-radius: 8px;
      background: #0054d6;
      color: white;
      font-family: 'Be Vietnam Pro', system-ui, sans-serif;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    .ipg-copy-btn:hover {
      background: #004abd;
    }
    .ipg-dropdown {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 0;
      width: 100%;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.15);
      border: 1px solid rgba(50,50,50,0.08);
      display: none;
      flex-direction: column;
      overflow: hidden;
    }
    .ipg-dropdown.visible {
      display: flex;
    }
    .ipg-ai-option {
      padding: 10px 16px;
      background: none;
      border: none;
      border-bottom: 1px solid rgba(50,50,50,0.05);
      text-align: left;
      font-family: 'Be Vietnam Pro', system-ui, sans-serif;
      font-size: 0.875rem;
      color: #323232;
      cursor: pointer;
      transition: background 0.15s;
    }
    .ipg-ai-option:hover {
      background: #f3efed;
    }
    .ipg-ai-option:last-child {
      border-bottom: none;
    }
    .ipg-toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      padding: 10px 22px;
      background: rgba(252, 249, 248, 0.95);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(50, 50, 50, 0.08);
      border-radius: 12px;
      color: #323232;
      font-family: 'Be Vietnam Pro', system-ui, sans-serif;
      font-size: 0.875rem;
      font-weight: 500;
      z-index: 2147483647;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease, transform 0.3s ease;
      box-shadow: 0 8px 32px rgba(50, 50, 50, 0.06);
    }
    .ipg-toast.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    .ipg-loading {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 18px;
      color: #323232;
      font-family: 'Be Vietnam Pro', system-ui, sans-serif;
      font-size: 0.875rem;
    }
    .ipg-loading-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(0, 84, 214, 0.2);
      border-top-color: #0054d6;
      border-radius: 50%;
      animation: ipg-spin 0.8s linear infinite;
    }
    .ipg-error {
      padding: 10px 16px;
      color: #d32f2f;
      font-family: 'Be Vietnam Pro', system-ui, sans-serif;
      font-size: 0.875rem;
      max-width: 260px;
    }

    /* ─── Cache Gallery ─── */
    .ipg-gallery-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: auto;
    }
    .ipg-gallery-overlay.visible {
      opacity: 1;
    }
    .ipg-gallery-container {
      width: 80%;
      max-width: 900px;
      max-height: 85vh;
      background: #fcf9f8;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 24px 64px rgba(0,0,0,0.3);
      transform: scale(0.95);
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      overflow: hidden;
    }
    .ipg-gallery-overlay.visible .ipg-gallery-container {
      transform: scale(1);
    }
    .ipg-gallery-header {
      padding: 20px 24px;
      border-bottom: 1px solid rgba(50,50,50,0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: 'Be Vietnam Pro', system-ui, sans-serif;
    }
    .ipg-gallery-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #323232;
    }
    .ipg-gallery-close {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1.5rem;
      line-height: 1;
      color: #757575;
      padding: 4px;
    }
    .ipg-gallery-close:hover {
      color: #e53935;
    }
    .ipg-gallery-body {
      padding: 24px;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 20px;
    }
    .ipg-gallery-item {
      background: #fff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.06);
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      border: 1px solid rgba(50,50,50,0.05);
      display: flex;
      flex-direction: column;
    }
    .ipg-gallery-item:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 24px rgba(0,0,0,0.12);
    }
    .ipg-gallery-img {
      width: 100%;
      height: 180px;
      object-fit: cover;
      background: #eee;
    }
    .ipg-gallery-info {
      padding: 12px;
      font-family: 'Be Vietnam Pro', system-ui, sans-serif;
      font-size: 0.75rem;
      color: #757575;
      text-align: center;
      border-top: 1px solid rgba(50,50,50,0.05);
    }
    .ipg-gallery-empty {
      grid-column: 1 / -1;
      text-align: center;
      padding: 60px 20px;
      color: #999;
      font-family: 'Be Vietnam Pro', system-ui, sans-serif;
    }
  `;
  shadow.appendChild(styleEl);

  // ─── SVG Icons (Phosphor) ──────────────────────────────────────────────
  const ICON_SPARKLE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M241.69,112.56,183.08,88.32a32,32,0,0,1-19.4-19.4L139.44,14.31a16,16,0,0,0-22.88,0L92.32,68.92a32,32,0,0,1-19.4,19.4L14.31,112.56a16,16,0,0,0,0,22.88l58.61,24.24a32,32,0,0,1,19.4,19.4l24.24,58.61a16,16,0,0,0,22.88,0l24.24-58.61a32,32,0,0,1,19.4-19.4l58.61-24.24A16,16,0,0,0,241.69,112.56Z"></path></svg>`;
  const ICON_COPY = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M216,40H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V48A8,8,0,0,0,216,40Zm-56,168H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V56H208Z"/></svg>`;
  const ICON_CARET_DOWN = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>`;
  const ICON_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z"/></svg>`;
  const ICON_WARNING = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,104v40a8,8,0,0,0,16,0V104a8,8,0,0,0-16,0Zm20,80a12,12,0,1,1-12-12A12,12,0,0,1,140,184Z"/></svg>`;
  const ICON_ERROR = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm37.66,130.34a8,8,0,0,1-11.32,11.32L128,139.31l-26.34,26.35a8,8,0,0,1-11.32-11.32L116.69,128,90.34,101.66a8,8,0,0,1,11.32-11.32L128,116.69l26.34-26.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>`;

  // ─── Overlay Icon ──────────────────────────────────────────
  function createOverlayIcon() {
    const icon = document.createElement('div');
    icon.className = 'ipg-overlay-icon';
    icon.innerHTML = ICON_SPARKLE;
    shadow.appendChild(icon);
    return icon;
  }

  function positionOverlay(icon, imgRect) {
    icon.style.top = `${imgRect.top + 8}px`;
    icon.style.left = `${imgRect.right - ICON_SIZE - 8}px`;
  }

  // ─── Get Best Image URL ────────────────────────────────────
  function getBestImageUrl(img) {
    // Try srcset for highest resolution
    if (img.srcset) {
      const sources = img.srcset.split(',').map(s => {
        const parts = s.trim().split(/\s+/);
        const w = parseInt(parts[1]) || 0;
        return { url: parts[0], width: w };
      });
      sources.sort((a, b) => b.width - a.width);
      if (sources.length > 0 && sources[0].url) {
        return sources[0].url;
      }
    }

    // Try data-src (lazy loading)
    if (img.dataset.src) return img.dataset.src;

    // Pinterest specific
    if (img.dataset.pinmedia) return img.dataset.pinmedia;

    // Fallback to src
    return img.src;
  }

  // ─── Show Toast ────────────────────────────────────────────
  function showToast(message, iconSvg = ICON_CHECK) {
    // Remove existing toast
    const existing = shadow.querySelector('.ipg-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'ipg-toast';
    toast.innerHTML = `<span class="icon" style="display:flex;align-items:center;">${iconSvg}</span>${message}`;
    shadow.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ─── Copy to Clipboard ────────────────────────────────────
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    }
  }

  // ─── Download JSON ─────────────────────────────────────────
  function downloadJson(data) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `image-prompt-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ─── Show Main Popup ──────────────────────────────────────
  function showPopup(iconEl, data) {
    clearPopup(true);

    const popup = document.createElement('div');
    popup.className = 'ipg-popup';

    // Header
    const header = document.createElement('div');
    header.className = 'ipg-popup-header';
    
    const titleRow = document.createElement('div');
    titleRow.className = 'ipg-title-row';
    
    const title = document.createElement('div');
    title.className = 'ipg-popup-title';
    title.textContent = 'Analysis Details';
    
    const clearBtn = document.createElement('button');
    clearBtn.className = 'ipg-clear-cache';
    clearBtn.textContent = '🗑️ Clear Cache';
    clearBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        if (chrome.runtime?.id) {
          chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
        }
      } catch (ex) { /* ignore */ }
      showToast('Cache cleared! Re-analyze to get fresh results.');
    });
    
    titleRow.appendChild(title);
    titleRow.appendChild(clearBtn);
    
    const tabBar = document.createElement('div');
    tabBar.className = 'ipg-tab-bar';
    
    const tabs = [
      { id: 'json', label: 'JSON', content: JSON.stringify(data.analysis || data, null, 2) },
      { id: 'en', label: 'Prompt EN', content: data.prompts?.en || '' },
      { id: 'vi', label: 'Prompt VI', content: data.prompts?.vi || '' },
      { id: 'cn', label: 'Prompt CN', content: data.prompts?.cn || '' }
    ];

    header.appendChild(titleRow);
    header.appendChild(tabBar);

    // Content Area (Editable)
    const contentArea = document.createElement('div');
    contentArea.className = 'ipg-popup-content';
    contentArea.contentEditable = 'true';
    contentArea.spellcheck = false;

    let currentTabId = 'json';
    
    tabs.forEach(tab => {
      const tabBtn = document.createElement('button');
      tabBtn.className = `ipg-tab ${tab.id === currentTabId ? 'active' : ''}`;
      tabBtn.textContent = tab.label;
      tabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // save current text back to the array in case user edited it
        const prevTab = tabs.find(t => t.id === currentTabId);
        if (prevTab) prevTab.content = contentArea.textContent;
        
        // switch tab
        Array.from(tabBar.children).forEach(btn => btn.classList.remove('active'));
        tabBtn.classList.add('active');
        currentTabId = tab.id;
        contentArea.textContent = tab.content;
        
        // Use monospace for JSON, sans-serif for text prompts
        contentArea.style.fontFamily = tab.id === 'json' ? 'monospace' : "'Be Vietnam Pro', system-ui, sans-serif";
      });
      tabBar.appendChild(tabBtn);
    });

    // Initial content
    contentArea.textContent = tabs[0].content;
    contentArea.style.fontFamily = 'monospace';

    // Action Container
    const actionContainer = document.createElement('div');
    actionContainer.className = 'ipg-action-container';

    // Copy Button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'ipg-copy-btn';
    copyBtn.innerHTML = `<span style="display:flex;">${ICON_COPY}</span> Copy & Paste to <span style="display:flex;">${ICON_CARET_DOWN}</span>`;

    // Dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'ipg-dropdown';

    const platforms = [
      { name: 'Google Flow', url: 'https://labs.google/fx/vi/tools/flow' },
      { name: 'Google Gemini', url: 'https://gemini.google.com/app' },
      { name: 'ChatGPT', url: 'https://chatgpt.com/' },
      { name: 'Grok', url: 'https://grok.com/' }
    ];

    platforms.forEach(platform => {
      const option = document.createElement('button');
      option.className = 'ipg-ai-option';
      option.textContent = platform.name;
      option.addEventListener('click', async (e) => {
        e.stopPropagation();
        const editedText = contentArea.textContent;
        const success = await copyToClipboard(editedText);
        
        // Save to storage for auto-paste (with context check)
        try {
          if (chrome.runtime?.id) {
            chrome.storage.local.set({ ipg_autopaste: editedText });
          }
        } catch (ex) {
          console.warn('[IPG] Could not save auto-paste data:', ex.message);
        }
        
        if (success) {
          showToast(`Copied! Pasting into ${platform.name}...`);
          window.open(platform.url, '_blank');
          clearPopup();
        }
      });
      dropdown.appendChild(option);
    });

    // Toggle dropdown
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('visible');
    });

    // Close dropdown on outside click
    popup.addEventListener('click', () => {
      dropdown.classList.remove('visible');
    });
    contentArea.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('visible');
    });

    actionContainer.appendChild(copyBtn);
    actionContainer.appendChild(dropdown);

    popup.appendChild(header);
    popup.appendChild(contentArea);
    popup.appendChild(actionContainer);
    shadow.appendChild(popup);

    // Position popup below the icon
    const iconRect = iconEl.getBoundingClientRect();
    const popupWidth = 520;
    let left = iconRect.left - popupWidth + ICON_SIZE;
    if (left < 8) left = 8;
    if (left + popupWidth > window.innerWidth - 8) left = window.innerWidth - popupWidth - 8;

    popup.style.top = `${iconRect.bottom + 8}px`;
    popup.style.left = `${left}px`;

    requestAnimationFrame(() => {
      popup.classList.add('visible');
    });

    currentPopup = popup;
  }

  // ─── Show Loading in Popup Area ────────────────────────────
  function showLoading(iconEl) {
    clearPopup(true); // force-clear any existing popup

    const popup = document.createElement('div');
    popup.className = 'ipg-popup ipg-loading-popup';

    const loading = document.createElement('div');
    loading.className = 'ipg-loading';
    loading.innerHTML = `<div class="ipg-loading-spinner"></div><span class="ipg-loading-text">🔍 Analyzing image...</span>`;
    popup.appendChild(loading);

    // Progress hint
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:0.7rem; color:#999; padding:0 18px 10px; font-family:Be Vietnam Pro,system-ui,sans-serif;';
    hint.textContent = 'Please wait, this may take 10-30 seconds';
    popup.appendChild(hint);

    shadow.appendChild(popup);

    const iconRect = iconEl.getBoundingClientRect();
    popup.style.top = `${iconRect.bottom + 8}px`;
    popup.style.left = `${iconRect.left - 140 + ICON_SIZE / 2}px`;

    requestAnimationFrame(() => popup.classList.add('visible'));
    currentPopup = popup;
  }

  // ─── Show Error in Popup Area ─────────────────────────────
  function showError(iconEl, message) {
    clearPopup(true); // force-clear loading

    const popup = document.createElement('div');
    popup.className = 'ipg-popup';

    const error = document.createElement('div');
    error.className = 'ipg-error';
    error.innerHTML = message === 'NO_API_KEY'
      ? `<span style="display:flex;align-items:center;gap:6px;">${ICON_WARNING} Chưa có API key. Click icon extension trên toolbar để nhập key.</span>`
      : `<span style="display:flex;align-items:center;gap:6px;">${ICON_ERROR} ${message}</span>`;
    popup.appendChild(error);
    shadow.appendChild(popup);

    const iconRect = iconEl.getBoundingClientRect();
    popup.style.top = `${iconRect.bottom + 8}px`;
    popup.style.left = `${iconRect.left - 100}px`;

    requestAnimationFrame(() => popup.classList.add('visible'));
    currentPopup = popup;

    setTimeout(() => clearPopup(), 5000);
  }

  // ─── Cache Gallery Overlay ─────────────────────────────────
  function showCacheGallery() {
    clearPopup(); // close main popup

    const overlay = document.createElement('div');
    overlay.className = 'ipg-gallery-overlay';

    const container = document.createElement('div');
    container.className = 'ipg-gallery-container';

    const header = document.createElement('div');
    header.className = 'ipg-gallery-header';
    header.innerHTML = `
      <div class="ipg-gallery-title">📦 Cache Gallery</div>
      <button class="ipg-gallery-close">×</button>
    `;

    const body = document.createElement('div');
    body.className = 'ipg-gallery-body';

    // Loading state
    body.innerHTML = `<div class="ipg-gallery-empty">Loading cache...</div>`;

    container.appendChild(header);
    container.appendChild(body);
    overlay.appendChild(container);
    shadow.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('visible'));

    // Event listeners for close
    const closeBtn = header.querySelector('.ipg-gallery-close');
    closeBtn.addEventListener('click', () => {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 300);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 300);
      }
    });

    // Fetch cache list
    try {
      chrome.runtime.sendMessage({ type: 'GET_CACHE_LIST' }, (response) => {
        if (!response || !response.success || response.data.length === 0) {
          body.innerHTML = `<div class="ipg-gallery-empty">Gallery is empty. Analyze some images first!</div>`;
          return;
        }

        body.innerHTML = ''; // clear loading

        response.data.forEach(item => {
          const div = document.createElement('div');
          div.className = 'ipg-gallery-item';
          
          const dateStr = new Date(item.timestamp).toLocaleString();
          div.innerHTML = `
            <img class="ipg-gallery-img" src="${item.imageUrl}" loading="lazy" alt="Cached image">
            <div class="ipg-gallery-info">${dateStr}</div>
          `;

          div.addEventListener('click', () => {
            // Close gallery
            overlay.classList.remove('visible');
            setTimeout(() => overlay.remove(), 300);

            // Fetch full item and show popup
            chrome.runtime.sendMessage({ type: 'GET_CACHE_ITEM', cacheKey: item.key }, (itemResp) => {
              if (itemResp && itemResp.success) {
                // we need an icon element to position the popup. Let's create a temporary one
                let iconEl = shadow.querySelector('.ipg-overlay-icon');
                if (!iconEl) {
                   iconEl = createOverlayIcon();
                   iconEl.style.top = '100px';
                   iconEl.style.left = '100px';
                   iconEl.style.opacity = '0';
                   iconEl.style.pointerEvents = 'none';
                }
                showPopup(iconEl, itemResp.data);
              }
            });
          });

          body.appendChild(div);
        });
      });
    } catch (err) {
      body.innerHTML = `<div class="ipg-gallery-empty">Error loading cache.</div>`;
    }
  }

  // clearPopup: removes popup (used by buttons, showLoading, showPopup, outside click)
  function clearPopup(force = false) {
    if (currentPopup) {
      // Don't remove loading popup during analysis unless forced
      if (!force && isAnalyzing && currentPopup.classList.contains('ipg-loading-popup')) {
        return;
      }
      currentPopup.remove();
      currentPopup = null;
    }
  }

  function removeOverlay() {
    if (currentOverlay) {
      currentOverlay.classList.remove('visible');
      setTimeout(() => {
        currentOverlay?.remove();
        currentOverlay = null;
      }, 200);
    }
  }

  // ─── Main: Handle Image Hover ─────────────────────────────
  let hoverTimeout = null;

  function handleImageEnter(img) {
    if (!isRealImage(img)) return;
    const rect = img.getBoundingClientRect();

    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      // Don't recreate if same image already has overlay
      const imgUrl = getBestImageUrl(img);
      if (activeImageUrl === imgUrl && currentOverlay) {
        positionOverlay(currentOverlay, rect);
        return;
      }

      removeOverlay();
      clearPopup();
      activeImageUrl = imgUrl;

      const iconEl = createOverlayIcon();
      positionOverlay(iconEl, rect);
      currentOverlay = iconEl;

      requestAnimationFrame(() => iconEl.classList.add('visible'));

      // Click handler
      iconEl.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (isAnalyzing) return;
        isAnalyzing = true;
        iconEl.classList.add('analyzing');
        showLoading(iconEl);

        try {
          // Check if extension context is still valid
          if (!chrome.runtime?.id) {
            throw new Error('Extension updated. Please refresh the page.');
          }
          
          // Resize image before sending — use high res for accurate analysis
          const imageData = await resizeImageToBase64(imgUrl, 1024, 0.85);
          
          const response = await chrome.runtime.sendMessage({
            type: 'ANALYZE_IMAGE',
            imageUrl: imgUrl,
            sourceUrl: window.location.href,
            imageData: imageData
          });

          if (response.success) {
            iconEl.classList.remove('analyzing');
            showPopup(iconEl, response.data);
          } else {
            iconEl.classList.remove('analyzing');
            showError(iconEl, response.error);
          }
        } catch (err) {
          iconEl.classList.remove('analyzing');
          const msg = (err.message || '').includes('Extension context invalidated')
            ? 'Extension updated. Please refresh the page (F5).'
            : err.message || 'Unknown error';
          showError(iconEl, msg);
        } finally {
          isAnalyzing = false;
        }
      });
    }, DEBOUNCE_MS);
  }

  // ─── Resize Image to Base64 ───────────────────────────────
  function resizeImageToBase64(imageUrl, maxSize, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          let w = img.naturalWidth;
          let h = img.naturalHeight;
          
          // Scale down to maxSize
          if (w > maxSize || h > maxSize) {
            if (w > h) {
              h = Math.round(h * maxSize / w);
              w = maxSize;
            } else {
              w = Math.round(w * maxSize / h);
              h = maxSize;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64 = dataUrl.split(',')[1];
          
          resolve({
            base64: base64,
            mimeType: 'image/jpeg'
          });
        } catch (err) {
          // CORS error - fall back to no resize
          resolve(null);
        }
      };
      img.onerror = () => resolve(null); // fall back to no resize
      img.src = imageUrl;
    });
  }

  function handleImageLeave(e) {
    const related = e.relatedTarget;
    if (related && (
      hostEl.contains(related) ||
      related === hostEl ||
      shadow.contains(related)
    )) return;

    clearTimeout(hoverTimeout);

    // Only remove overlay icon, NEVER touch popup
    setTimeout(() => {
      const hoveredShadow = shadow.querySelector(':hover');
      if (!hoveredShadow) {
        removeOverlay();
      }
    }, 300);
  }

  // ─── Attach Listeners to Images ───────────────────────────
  function attachToImage(img) {
    if (img.dataset.ipgAttached) return;
    img.dataset.ipgAttached = 'true';

    img.addEventListener('mouseenter', () => handleImageEnter(img));
    img.addEventListener('mouseleave', handleImageLeave);
  }

  function scanImages() {
    document.querySelectorAll('img').forEach(attachToImage);

    // Also check for background images in common containers
    document.querySelectorAll('[style*="background-image"]').forEach(el => {
      if (el.dataset.ipgAttached) return;
      const style = el.style.backgroundImage;
      const match = style.match(/url\(["']?(.+?)["']?\)/);
      if (match && match[1]) {
        el.dataset.ipgBgUrl = match[1];
        el.dataset.ipgAttached = 'true';
        el.addEventListener('mouseenter', () => {
          const rect = el.getBoundingClientRect();
          if (rect.width < MIN_IMAGE_SIZE || rect.height < MIN_IMAGE_SIZE) return;
          // Simulate img behavior
          const fakeImg = { 
            getBoundingClientRect: () => rect,
            src: match[1],
            srcset: '',
            dataset: {}
          };
          handleImageEnter(fakeImg);
        });
        el.addEventListener('mouseleave', handleImageLeave);
      }
    });
  }

  // ─── Observe DOM Changes (Lazy Loading) ───────────────────
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            if (node.tagName === 'IMG' || node.querySelector?.('img')) {
              shouldScan = true;
              break;
            }
          }
        }
      }
      if (shouldScan) break;
    }
    if (shouldScan) {
      requestAnimationFrame(scanImages);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // ─── Close Popup on Outside Click ─────────────────────────
  document.addEventListener('click', (e) => {
    if (!hostEl.contains(e.target)) {
      clearPopup();
    }
  });

  // ─── Close on Scroll ──────────────────────────────────────
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      removeOverlay();
      // popup stays visible - only outside click closes it
    }, 100);
  }, { passive: true });

  // ─── Initial Scan ─────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanImages);
  } else {
    scanImages();
  }

})();
