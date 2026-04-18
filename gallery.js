const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const countEl = document.getElementById('count');

loadGallery();

document.getElementById('clearAll').addEventListener('click', async () => {
  if (!confirm('Xóa toàn bộ ảnh đã phân tích?')) return;
  const stored = await chrome.storage.local.get(['ipg_user_keys']);
  const backup = stored.ipg_user_keys;
  await chrome.storage.local.clear();
  if (backup) await chrome.storage.local.set({ ipg_user_keys: backup });
  try { chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }); } catch(e) {}
  loadGallery();
});

async function loadGallery() {
  const items = await chrome.storage.local.get(null);
  const allKeys = Object.keys(items);
  const cacheKeys = allKeys.filter(k => k.startsWith('ipg_cache_'));
  console.log('[Gallery] Total keys:', allKeys.length, '| Cache keys:', cacheKeys.length, cacheKeys);

  const entries = Object.entries(items)
    .filter(([k]) => k.startsWith('ipg_cache_'))
    .map(([key, val]) => ({
      key,
      imageUrl: val.imageUrl || '',
      sourceUrl: val.sourceUrl || '',
      timestamp: val.timestamp || 0,
      result: val.result || val
    }))
    .sort((a, b) => b.timestamp - a.timestamp);

  grid.innerHTML = '';
  countEl.textContent = `(${entries.length})`;

  if (entries.length === 0) {
    grid.style.display = 'none';
    empty.style.display = '';
    return;
  }

  grid.style.display = '';
  empty.style.display = 'none';

  entries.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'gallery-card';

    const timeStr = entry.timestamp
      ? new Date(entry.timestamp).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '';

    let domain = '';
    try { domain = entry.sourceUrl ? new URL(entry.sourceUrl).hostname.replace('www.','') : ''; } catch(e) {}

    card.innerHTML = `
      <img class="card-image" src="${entry.imageUrl}" alt="" onerror="this.style.background='#ddd';this.style.height='80px';" />
      <div class="card-body">
        <div class="card-meta">
          <span class="card-domain">${domain}</span>
          <span class="card-time">${timeStr}</span>
        </div>
        <div class="card-actions">
          <button class="card-btn" data-action="json">📋 JSON</button>
          <button class="card-btn" data-action="en">🇬🇧 EN</button>
          <button class="card-btn" data-action="vi">🇻🇳 VI</button>
          <button class="card-btn delete" data-action="delete">✕</button>
        </div>
      </div>
    `;

    card.querySelector('[data-action="json"]').addEventListener('click', async () => {
      const json = JSON.stringify(entry.result.analysis || entry.result, null, 2);
      await navigator.clipboard.writeText(json);
      showToast('JSON copied!');
    });

    card.querySelector('[data-action="en"]').addEventListener('click', async () => {
      await navigator.clipboard.writeText(entry.result.prompts?.en || '');
      showToast('EN Prompt copied!');
    });

    card.querySelector('[data-action="vi"]').addEventListener('click', async () => {
      await navigator.clipboard.writeText(entry.result.prompts?.vi || '');
      showToast('VI Prompt copied!');
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      await chrome.storage.local.remove([entry.key]);
      loadGallery();
    });

    grid.appendChild(card);
  });
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 300); }, 1500);
}
