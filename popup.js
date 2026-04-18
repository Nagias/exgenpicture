document.addEventListener('DOMContentLoaded', async () => {
  const clearCacheBtn = document.getElementById('clearCache');
  const totalEl = document.getElementById('totalAnalyzed');
  const cacheEl = document.getElementById('cacheSize');
  const galleryCountEl = document.getElementById('galleryCount');
  const openGalleryBtn = document.getElementById('openGallery');

  // API Settings elements
  const providerSelect = document.getElementById('apiProvider');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const savedKeysList = document.getElementById('savedKeysList');
  const customFields = document.getElementById('customFields');
  const customBaseUrl = document.getElementById('customBaseUrl');
  const customModel = document.getElementById('customModel');

  // Toggle custom fields visibility
  providerSelect.addEventListener('change', () => {
    customFields.style.display = providerSelect.value === 'custom' ? '' : 'none';
  });

  await updateStats();
  await loadSavedKeys();

  // ─── Open Gallery in centered window ────────────────
  openGalleryBtn.addEventListener('click', () => {
    const w = 900, h = 650;
    const left = Math.round((screen.width - w) / 2);
    const top = Math.round((screen.height - h) / 2);
    chrome.windows.create({
      url: chrome.runtime.getURL('gallery.html'),
      type: 'popup',
      width: w,
      height: h,
      left: left,
      top: top
    });
  });

  // ─── API Key Management ─────────────────────────────
  saveApiKeyBtn.addEventListener('click', async () => {
    const provider = providerSelect.value;
    const key = apiKeyInput.value.trim();
    if (!key) {
      showPopupToast('Please enter an API key');
      return;
    }

    // Validate custom provider fields
    if (provider === 'custom') {
      const baseUrl = customBaseUrl.value.trim();
      const model = customModel.value.trim();
      if (!baseUrl || !model) {
        showPopupToast('Please fill Base URL and Model name');
        return;
      }
    }

    const stored = await chrome.storage.local.get(['ipg_user_keys']);
    const userKeys = stored.ipg_user_keys || [];

    const exists = userKeys.some(k => k.key === key && k.provider === provider);
    if (exists) {
      showPopupToast('This key already exists');
      return;
    }

    const entry = { provider, key, addedAt: Date.now() };
    if (provider === 'custom') {
      entry.baseUrl = customBaseUrl.value.trim();
      entry.model = customModel.value.trim();
    }

    userKeys.push(entry);
    await chrome.storage.local.set({ ipg_user_keys: userKeys });

    try { chrome.runtime.sendMessage({ type: 'RELOAD_KEYS' }); } catch (e) { }

    apiKeyInput.value = '';
    if (provider === 'custom') {
      customBaseUrl.value = '';
      customModel.value = '';
    }
    showPopupToast(`${provider === 'custom' ? 'Custom provider' : provider.toUpperCase()} key saved!`);
    await loadSavedKeys();
  });

  async function loadSavedKeys() {
    const stored = await chrome.storage.local.get(['ipg_user_keys']);
    const userKeys = stored.ipg_user_keys || [];

    savedKeysList.innerHTML = '';
    if (userKeys.length === 0) return;

    userKeys.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'saved-key-item';

      const masked = item.key.length > 10
        ? item.key.substring(0, 4) + '••••••••' + item.key.slice(-4)
        : '••••••••';

      const label = item.provider === 'custom'
        ? `custom: ${item.model || 'unknown'}`
        : item.provider;

      el.innerHTML = `
        <span class="key-provider ${item.provider}">${label}</span>
        <span class="key-value">${masked}</span>
        <button class="key-delete" data-index="${index}" title="Remove">✕</button>
      `;

      el.querySelector('.key-delete').addEventListener('click', async () => {
        userKeys.splice(index, 1);
        await chrome.storage.local.set({ ipg_user_keys: userKeys });
        try { chrome.runtime.sendMessage({ type: 'RELOAD_KEYS' }); } catch (e) { }
        showPopupToast('Key removed');
        await loadSavedKeys();
      });

      savedKeysList.appendChild(el);
    });
  }

  // ─── Cache Management ───────────────────────────────
  clearCacheBtn.addEventListener('click', async () => {
    const stored = await chrome.storage.local.get(['ipg_user_keys']);
    const userKeys = stored.ipg_user_keys;

    await chrome.storage.local.clear();

    if (userKeys) {
      await chrome.storage.local.set({ ipg_user_keys: userKeys });
    }

    try { chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }); } catch (e) { }
    await updateStats();
    showPopupToast('Cache cleared!');
  });

  async function updateStats() {
    const items = await chrome.storage.local.get(null);
    const cacheKeys = Object.keys(items).filter(k => k.startsWith('ipg_cache_'));
    const count = cacheKeys.length;
    cacheEl.textContent = count;
    totalEl.textContent = items.totalAnalyzed || count;
    galleryCountEl.textContent = count;
  }

  function showPopupToast(message) {
    const existing = document.querySelector('.popup-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'popup-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 1500);
  }
});
