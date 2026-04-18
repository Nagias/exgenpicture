// Auto-paste script for AI platforms
// Injected into gemini.google.com, chatgpt.com, grok.com, labs.google

(() => {
  // Check if there is pending prompt text to paste
  chrome.storage.local.get(['ipg_autopaste'], (result) => {
    const textToPaste = result.ipg_autopaste;
    if (!textToPaste) return;

    console.log('[IPG] Found auto-paste text, attempting to paste...');
    
    // Clear storage to prevent re-pasting on reload
    chrome.storage.local.remove(['ipg_autopaste']);

    const host = window.location.hostname;
    const fullUrl = window.location.href;

    // Attempt to paste with retries (platforms often render inputs asynchronously)
    let attempts = 0;
    const maxAttempts = 20;
    const tryInterval = setInterval(() => {
      attempts++;
      
      let inputEl = null;

      // ─── Google Flow (labs.google/fx/tools/flow) ─────────────
      if (host.includes('labs.google')) {
        // Flow uses a textarea for prompt input
        inputEl = document.querySelector('textarea[placeholder*="prompt"]') ||
                  document.querySelector('textarea[placeholder*="Prompt"]') ||
                  document.querySelector('textarea[aria-label*="prompt"]') ||
                  document.querySelector('.prompt-input textarea') ||
                  document.querySelector('textarea');
      }
      // ─── Google Gemini — target image generation mode ────────
      else if (host.includes('gemini.google.com')) {
        // Try to find image generation canvas/input first
        // Gemini's image gen uses the same rich-textarea but with canvas mode
        inputEl = document.querySelector('rich-textarea div[contenteditable="true"]') ||
                  document.querySelector('.ql-editor[contenteditable="true"]') ||
                  document.querySelector('.text-input-field') ||
                  document.querySelector('[contenteditable="true"]');
      }
      // ─── ChatGPT — target image generation (DALL-E) ──────────
      else if (host.includes('chatgpt.com')) {
        // ChatGPT uses the same input for text and image generation
        inputEl = document.querySelector('#prompt-textarea') ||
                  document.querySelector('div[contenteditable="true"][id="prompt-textarea"]') ||
                  document.querySelector('[contenteditable="true"]');
      }
      // ─── Grok — target image generation (Aurora) ─────────────
      else if (host.includes('grok.com')) {
        inputEl = document.querySelector('textarea') || 
                  document.querySelector('[contenteditable="true"]:not([readonly])');
      }
      // ─── Fallback ────────────────────────────────────────────
      else {
        const textareas = Array.from(document.querySelectorAll('textarea'));
        inputEl = textareas.find(t => t.offsetHeight > 20 && !t.readOnly) || 
                  document.querySelector('[contenteditable="true"]');
      }

      if (inputEl) {
        clearInterval(tryInterval);
        console.log('[IPG] Input found on', host, '— pasting...');
        
        // Handle contenteditable vs textarea
        if (inputEl.isContentEditable) {
          inputEl.focus();
          
          // Clear existing content first
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(inputEl);
          selection.removeAllRanges();
          selection.addRange(range);
          
          // Insert text
          document.execCommand('insertText', false, textToPaste);
          
          // Fallback if execCommand fails
          if (inputEl.textContent.trim() === '') {
            inputEl.textContent = textToPaste;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } else {
          // Textarea / Input
          inputEl.focus();
          inputEl.value = textToPaste;
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          inputEl.dispatchEvent(new Event('change', { bubbles: true }));
          // React-specific: trigger native setter
          const nativeSet = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
          )?.set;
          if (nativeSet) {
            nativeSet.call(inputEl, textToPaste);
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }

        // Visual feedback — brief highlight
        const originalBg = inputEl.style.backgroundColor;
        inputEl.style.transition = 'background-color 0.3s';
        inputEl.style.backgroundColor = 'rgba(0, 84, 214, 0.1)';
        setTimeout(() => {
          inputEl.style.backgroundColor = originalBg;
        }, 1000);

        console.log('[IPG] ✅ Auto-paste complete!');

      } else if (attempts >= maxAttempts) {
        clearInterval(tryInterval);
        console.error('[IPG] Could not find input field after', maxAttempts, 'attempts.');
      }
    }, 1000); // Check every 1 second
  });
})();
