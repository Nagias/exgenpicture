// Background service worker
// API keys auto-loaded from config.js (protected by .gitignore)

import { API_KEYS } from './config.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELS = ['gemini-3-flash-preview', 'gemini-2.5-flash'];
let currentKeyIndex = 0;

// User-provided API keys (loaded from storage)
let userKeys = []; // [{provider: 'gemini'|'openai'|'claude', key: 'xxx'}]

// Load user keys on startup
async function loadUserKeys() {
  try {
    const stored = await chrome.storage.local.get(['ipg_user_keys']);
    userKeys = stored.ipg_user_keys || [];
    const totalBuiltIn = API_KEYS.length;
    const totalUser = userKeys.length;
    console.log(`[IPG] Keys loaded: ${totalBuiltIn} built-in + ${totalUser} user (${userKeys.map(k => k.provider).join(', ') || 'none'})`);
  } catch (e) {
    console.warn('[IPG] Failed to load user keys:', e.message);
  }
}
loadUserKeys();

// ═══════════════════════════════════════════════════
// ANALYSIS PROMPT — Compact version (~60% shorter)
// ═══════════════════════════════════════════════════
const ANALYSIS_PROMPT = `You are a forensic visual analyst. Describe what you LITERALLY see. No softening, no moralizing, no "safe" interpretations. Output ONE JSON object, no markdown.

{
  "metadata": {
    "aspect_ratio": "9:16 | 2:3 | 3:2 | 1:1 | 16:9 | 4:5",
    "orientation": "vertical | horizontal | square",
    "image_category": "portrait_person | full_body_person | group_people | landscape | cityscape | still_life | food | animal | anime_illustration | product | other",
    "style_category": "photorealistic | AI_generated_filtered | beauty_filtered | anime_2d | semi_realistic_3d | film_photography | studio_photography | cinematic | illustration | painting",
    "camera_distance": "extreme_close_up | close_up | medium_shot | cowboy_shot | full_body | wide_shot",
    "camera_angle": "eye_level | low_angle | high_angle | bird_eye | dutch_tilt",
    "depth_of_field": "deep_focus | medium_DOF | shallow_DOF | extreme_bokeh"
  },
  "subject": "Age, ethnicity, skin tone (ivory/porcelain/warm beige/tan/deep), face shape, eyes (size+shape+color), nose, lips (color+shape), expression, gaze direction, mouth state.",
  "hair": "Exact color (jet-black, dark brown, chestnut, ash blonde, etc.), length, texture (sleek straight, soft waves, tight curls, tousled flyaway), style (loose/bun/ponytail with POSITION on head), all accessories with positions.",
  "makeup": "Foundation level, eye makeup specifics, lip color+finish, blush, overall vibe (no-makeup natural / soft glam / bold).",
  "outfit": "Top-to-bottom. Fabric (cotton/silk/knit/leather), color (be specific: cream vs white vs ivory), fit, visible details (buttons, lace, seams, textures).",
  "pose": "Body + head position. Each hand position described NATURALLY (not finger-by-finger) UNLESS making a clear gesture (peace, L, heart, point, thumbs up).",
  "lighting": "Source, direction, quality (soft/hard), color temperature (warm/neutral/cool).",
  "colors": {
    "palette_description": "Natural sentence, no hex here.",
    "dominant_hex": ["#xxxxxx", "#xxxxxx"],
    "accent_hex": ["#xxxxxx", "#xxxxxx"],
    "grading": "warm | cool | neutral | desaturated | vivid | pastel | cinematic | muted"
  },
  "background": "Environment, blur level, visible objects.",
  "mood": "Actual vibe: playful, flirtatious, cheeky, sultry, innocent, serene, dramatic, melancholic. Be honest.",
  "style_reference": "Specific aesthetic — Xiaohongshu filter, Douyin beauty, Kodak Portra film, Fujifilm X100, Wong Kar-wai cinematic, NovelAI anime, etc.",
  "distinctive_features": "List 5-7 UNIQUE details that make THIS specific image recognizable. Things that if removed, it wouldn't look like this image anymore. Examples: 'waist-length hair with blunt ends', 'Chinese text 高三一班 embroidered in blue on left chest', 'small cloud logo on right chest pocket', 'specific background foliage blur pattern', 'soft cool-toned daylight with no harsh shadows', 'porcelain skin with visible fine cheek blush', 'wispy curtain bangs parted in middle reaching eyebrows'. Be SPECIFIC and VISUAL, not generic.",
  "hair_length_precise": "Exact length using body reference: chin-length | shoulder-length | collarbone-length | chest-length | waist-length | hip-length | thigh-length",
  "lighting_direction": "Precise direction and character: front-soft | side-diffused | backlit-rim | 3/4-from-left | overhead-natural | golden-hour-warm | overcast-cool | studio-flat",
  "objects_and_text": [
    {
      "type": "text | logo | decoration | prop | sticker | watermark",
      "content": "The exact text content (for text/watermark) or description of the object (for logo/decoration/prop/sticker)",
      "position": "top-left | top-center | top-right | center-left | center | center-right | bottom-left | bottom-center | bottom-right | on-clothing-chest | on-clothing-sleeve | in-hand | on-wall | on-ground",
      "size": "small | medium | large | full-width",
      "color": "Color of text or object, e.g. white, gold, red #hex",
      "font_style": "(for text only) serif | sans-serif | handwritten | decorative | bold | italic",
      "notes": "Any extra detail: 'embroidered', 'printed', 'neon sign', 'floating sticker', 'held by subject'"
    }
  ]
}

CRITICAL RULES (Flash commonly fails these):

1. HANDS: Only describe individual fingers when making a clear GESTURE (peace/V-sign=index+middle up, L=index+thumb 90°, heart, point, thumbs up). For hands resting naturally on face/chin/cheek, write "hand rests against [place] with fingers relaxed and loosely curled" — do NOT list fingers. Listing fingers of a natural pose causes AI to draw distorted hands.

2. CAMERA ANGLE: Ceiling/sky visible at top + subject looking up = LOW_ANGLE. Floor at bottom + looking down = HIGH_ANGLE. If neither, eye_level.

3. MOUTH: If lips parted with teeth visible, say so. If tongue tip visible, say "tongue slightly visible". Don't sanitize to "closed smile" if mouth is open.

4. MOOD: Playful + direct gaze + tongue-out = "playful cheeky flirtatious". Don't default to "innocent/demure" for playful images.

5. HAIR: Say "bun/updo" ONLY if clearly tied up. Loose hair with flyaways = "tousled loose hair". Specify bun POSITION (high on top, low at nape, side).

6. SKIN TONE: Be specific (ivory/porcelain/warm beige/olive/tan/deep bronze) — critical for AI regeneration.

7. COLORS: Specify cream vs white vs ivory, navy vs black, burgundy vs red. "Black" and "white" alone lose info.

8. DISTINCTIVE DETAILS: You MUST fill distinctive_features with 5-7 specific visual anchors. Generic descriptions ("black hair", "white shirt") are FORBIDDEN in this field. Focus on things like: exact hair length vs body, specific text/logos/embroidery with colors, unique background elements, unusual lighting direction, distinctive accessories, color specifics (ivory vs pure white), texture specifics (silk straight vs wavy).

9. OBJECTS & TEXT: List ALL visible text (signs, embroidery, printed text, watermarks), logos, decorations (flowers, bubbles, hearts, sparkles), props (cups, bags, phones), and stickers. Write the EXACT text content character-by-character. If no objects/text visible, output an empty array []. This field is critical — users will EDIT it to customize what text and decorations appear in the generated image.

Output the JSON only.`;

// ═══════════════════════════════════════════════════
// TRANSLATION PROMPT
// ═══════════════════════════════════════════════════
const TRANSLATION_PROMPT = `Translate the English image-generation prompt below into natural Vietnamese and Simplified Chinese. Preserve the "Negative prompt:" section. Output ONLY this JSON:

{
  "vi": "Natural Vietnamese, not word-by-word, preserve details and negative prompt section.",
  "cn": "自然简体中文,不逐字翻译,保留细节和 negative prompt 部分。"
}

ENGLISH PROMPT:
`;

// ═══════════════════════════════════════════════════
// Message Listener
// ═══════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[IPG] Message received:', message.type);

  if (message.type === 'ANALYZE_IMAGE') {
    handleAnalyzeImage(message.imageUrl, message.sourceUrl, message.imageData)
      .then(result => {
        console.log('[IPG] ✅ Analysis complete');
        sendResponse({ success: true, data: result });
      })
      .catch(error => {
        console.error('[IPG] ❌ Analysis failed:', error.message);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'CLEAR_CACHE') {
    cache.clear();
    // Preserve user keys
    chrome.storage.local.get(['ipg_user_keys'], (result) => {
      const userKeysBackup = result.ipg_user_keys;
      chrome.storage.local.clear(() => {
        if (userKeysBackup) chrome.storage.local.set({ ipg_user_keys: userKeysBackup });
        console.log('[IPG] 🗑️ All caches cleared (keys preserved)');
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.type === 'RELOAD_KEYS') {
    loadUserKeys().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'GET_CACHE_LIST') {
    chrome.storage.local.get(null).then(items => {
      const cacheList = Object.entries(items)
        .filter(([k]) => k.startsWith('ipg_cache_'))
        .map(([key, val]) => ({
          key,
          imageUrl: val.imageUrl,
          timestamp: val.timestamp,
          sourceUrl: val.sourceUrl
        }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      sendResponse({ success: true, data: cacheList });
    });
    return true;
  }

  if (message.type === 'GET_CACHE_ITEM') {
    chrome.storage.local.get([message.cacheKey]).then(stored => {
      const entry = stored[message.cacheKey];
      sendResponse({ success: true, data: entry?.result || entry });
    });
    return true;
  }
});

// ═══════════════════════════════════════════════════
// Cache
// ═══════════════════════════════════════════════════
const cache = new Map();

function hashUrl(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ═══════════════════════════════════════════════════
// Gemini API Caller (key/model rotation with 429 handling)
// ═══════════════════════════════════════════════════
async function callGemini(requestBody, apiKey = null) {
  // If specific key provided, use it directly
  if (apiKey) {
    const modelName = MODELS[0];
    const apiUrl = `${GEMINI_API_BASE}/${modelName}:generateContent?key=${apiKey}`;
    console.log(`[IPG] 🔑 Using user Gemini key + ${modelName}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
    const data = await resp.json();
    if (data.promptFeedback?.blockReason) throw new Error(`Blocked: ${data.promptFeedback.blockReason}`);
    return data;
  }
  
  // Built-in key rotation
  let lastResponse;
  let lastStatus;
  const totalKeys = API_KEYS.length;
  const totalModels = MODELS.length;
  const totalCombos = totalKeys * totalModels;

  for (let m = 0; m < totalModels; m++) {
    const modelName = MODELS[m];
    const failedKeys = new Set();
    console.log(`[IPG] 📋 Trying model: ${modelName} (${m + 1}/${totalModels})`);

    for (let k = 0; k < totalKeys; k++) {
      const keyIdx = (currentKeyIndex + k) % totalKeys;
      if (failedKeys.has(keyIdx)) continue;

      const key = API_KEYS[keyIdx];
      const apiUrl = `${GEMINI_API_BASE}/${modelName}:generateContent?key=${key}`;
      console.log(`[IPG] 🔑 Key ${keyIdx + 1}/${totalKeys} + ${modelName}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        lastResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        lastStatus = lastResponse.status;

        if (lastStatus === 429) { failedKeys.add(keyIdx); continue; }
        if (lastStatus === 503) break;

        if (lastResponse.ok) {
          const responseData = await lastResponse.json();
          if (responseData.promptFeedback?.blockReason) break;
          currentKeyIndex = keyIdx;
          console.log(`[IPG] ✅ Success with Key ${keyIdx + 1} + ${modelName}`);
          return responseData;
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        continue;
      }
    }
  }

  throw new Error(
    lastStatus === 429
      ? `All ${totalKeys} API key(s) quota exhausted.`
      : `Gemini API error (${lastStatus || 'no response'})`
  );
}

// ═══════════════════════════════════════════════════
// OpenAI API Caller (GPT-4o with vision)
// ═══════════════════════════════════════════════════
async function callOpenAI(promptText, base64Image, mimeType, apiKey) {
  console.log('[IPG] 🟢 Using OpenAI GPT-4o');
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: promptText },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
        ]
      }],
      max_tokens: 2048,
      temperature: 0.3,
      response_format: { type: 'json_object' }
    }),
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`OpenAI ${response.status}: ${err.substring(0, 100)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty OpenAI response');

  // Convert to Gemini-like format for consistent downstream handling
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

// ═══════════════════════════════════════════════════
// Claude API Caller (Sonnet with vision)
// ═══════════════════════════════════════════════════
async function callClaude(promptText, base64Image, mimeType, apiKey) {
  console.log('[IPG] 🟠 Using Claude Sonnet');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
          { type: 'text', text: promptText }
        ]
      }]
    }),
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Claude ${response.status}: ${err.substring(0, 100)}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Empty Claude response');

  // Convert to Gemini-like format
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

// ═══════════════════════════════════════════════════
// Custom OpenAI-Compatible Provider (9router, LiteLLM, OpenRouter, etc.)
// ═══════════════════════════════════════════════════
async function callCustomOpenAI(promptText, base64Image, mimeType, apiKey, baseUrl, model) {
  console.log(`[IPG] 🟣 Using Custom Provider: ${model} @ ${baseUrl}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // longer timeout for proxies

  // Build message content — with or without image
  const content = [];
  if (base64Image) {
    content.push({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } });
  }
  content.push({ type: 'text', text: promptText });

  // Normalize base URL (ensure no trailing slash)
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content }],
      max_tokens: 4096,
      temperature: 0.3
    }),
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Custom(${model}) ${response.status}: ${err.substring(0, 100)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty custom provider response');

  // Convert to Gemini-like format
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

// ═══════════════════════════════════════════════════
// Unified API Caller — tries user keys first, then built-in
// ═══════════════════════════════════════════════════
async function callAPI(geminiRequestBody) {
  // Extract prompt text and image from Gemini-format request
  const parts = geminiRequestBody.contents[0].parts;
  const promptText = parts.find(p => p.text)?.text || '';
  const imageData = parts.find(p => p.inline_data);
  const base64 = imageData?.inline_data?.data;
  const mimeType = imageData?.inline_data?.mime_type || 'image/jpeg';

  // Try user-provided keys first
  for (const userKey of userKeys) {
    try {
      console.log(`[IPG] 🔄 Trying user ${userKey.provider} key...`);
      
      if (userKey.provider === 'gemini') {
        return await callGemini(geminiRequestBody, userKey.key);
      } else if (userKey.provider === 'openai') {
        return await callOpenAI(promptText, base64, mimeType, userKey.key);
      } else if (userKey.provider === 'claude') {
        return await callClaude(promptText, base64, mimeType, userKey.key);
      } else if (userKey.provider === 'custom') {
        return await callCustomOpenAI(promptText, base64, mimeType, userKey.key, userKey.baseUrl, userKey.model);
      }
    } catch (err) {
      console.warn(`[IPG] ⚠️ User ${userKey.provider} key failed: ${err.message}`);
      continue; // Try next user key
    }
  }

  // Fallback to built-in Gemini keys
  console.log('[IPG] 📋 Falling back to built-in Gemini keys...');
  return await callGemini(geminiRequestBody);
}

// ═══════════════════════════════════════════════════
// Robust JSON Parser — handles common AI malformations
// ═══════════════════════════════════════════════════
function parseJSON(text) {
  let clean = text.trim();

  // Strip markdown fences
  clean = clean.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
  clean = clean.trim();

  // Quick try
  try { return JSON.parse(clean); } catch (e) { /* continue */ }

  console.warn('[IPG] JSON parse failed, running recovery...');

  // Extract JSON block (first { to last })
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }

  // Fix trailing commas before } or ]
  clean = clean.replace(/,(\s*[\]}])/g, '$1');

  // Try again
  try { return JSON.parse(clean); } catch (e2) { /* continue */ }

  // Balance unclosed braces/brackets
  const openB = (clean.match(/{/g) || []).length;
  const closeB = (clean.match(/}/g) || []).length;
  for (let i = 0; i < openB - closeB; i++) clean += '}';

  const openSq = (clean.match(/\[/g) || []).length;
  const closeSq = (clean.match(/]/g) || []).length;
  for (let i = 0; i < openSq - closeSq; i++) clean += ']';

  // Check for unclosed string
  const quotes = (clean.match(/(?<!\\)"/g) || []).length;
  if (quotes % 2 !== 0) clean += '"';

  try { return JSON.parse(clean); } catch (e3) {
    console.warn('[IPG] Recovery also failed, trying without objects_and_text...');
    // Last resort: strip objects_and_text array which often causes issues
    const stripped = clean.replace(/"objects_and_text"\s*:\s*\[[\s\S]*?\]/, '"objects_and_text": []');
    try { return JSON.parse(stripped); } catch (e4) {
      throw new Error('JSON parse failed after all recovery attempts');
    }
  }
}

// ═══════════════════════════════════════════════════
// Build Prompt EN — Optimized for Gemini Image Gen
// Uses dense visual narrative, not keyword lists
// ═══════════════════════════════════════════════════
function buildPromptEN(a) {
  const m = a.metadata || {};
  const colors = a.colors || {};

  // ═════ OPENING: Cinematic framing statement ═════
  const orientation = m.orientation || 'vertical';
  const aspect = m.aspect_ratio || '9:16';
  const distance = (m.camera_distance || 'medium_shot').replace(/_/g, ' ');
  const angle = (m.camera_angle || 'eye_level').replace(/_/g, ' ');
  const dof = (m.depth_of_field || 'shallow_DOF').replace(/_/g, ' ').replace('DOF', 'depth of field');

  const opening = `A ${orientation} ${aspect} portrait photograph, ${distance} captured at ${angle}, with ${dof}.`;

  // ═════ SUBJECT: Rich narrative description ═════
  const subjectNarrative = a.subject || '';
  const hairNarrative = a.hair
    ? `Her hair is ${a.hair}${a.hair_length_precise ? `, ${a.hair_length_precise} in length` : ''}.`
    : '';
  const makeupNarrative = a.makeup ? `Makeup: ${a.makeup}.` : '';

  // ═════ OUTFIT narrative ═════
  const outfitNarrative = a.outfit
    ? `She is wearing ${a.outfit.toLowerCase().replace(/^she (is )?wearing /i, '').replace(/^wearing /i, '')}.`
    : '';

  // ═════ POSE narrative ═════
  const poseNarrative = a.pose ? `${a.pose}` : '';

  // ═════ LIGHTING — critical for Gemini ═════
  const lightingNarrative = a.lighting_direction
    ? `Lighting is ${a.lighting_direction.replace(/-/g, ' ')}: ${a.lighting || ''}`
    : (a.lighting ? `Lighting: ${a.lighting}` : '');

  // ═════ BACKGROUND narrative ═════
  const bgNarrative = a.background ? `Background: ${a.background}` : '';

  // ═════ COLOR narrative ═════
  const colorNarrative = colors.palette_description
    ? `Color palette features ${colors.palette_description.toLowerCase().replace(/^the /i, '')} The overall color grading is ${colors.grading || 'neutral'}.`
    : '';

  // ═════ MOOD ═════
  const moodNarrative = a.mood ? `Mood: ${a.mood}.` : '';

  // ═════ OBJECTS & TEXT ═════
  let objectsNarrative = '';
  if (a.objects_and_text && a.objects_and_text.length > 0) {
    const descriptions = a.objects_and_text.map(obj => {
      let desc = '';
      if (obj.type === 'text' || obj.type === 'watermark') {
        desc = `${obj.type === 'watermark' ? 'Watermark' : 'Text'} "${obj.content}" in ${obj.color || 'white'} ${obj.font_style || ''} at ${obj.position || 'center'}`;
      } else {
        desc = `${obj.content || obj.type} at ${obj.position || 'center'}`;
      }
      if (obj.size) desc += ` (${obj.size})`;
      if (obj.notes) desc += `, ${obj.notes}`;
      return desc;
    });
    objectsNarrative = `Visible elements: ${descriptions.join('. ')}.`;
  }

  // ═════ DISTINCTIVE FEATURES — the most important block ═════
  const distinctive = a.distinctive_features
    ? `\n\nKey distinctive details that define this specific image: ${a.distinctive_features}`
    : '';

  // ═════ STYLE REFERENCE + QUALITY ═════
  const style = a.style_reference || 'natural portrait photography';
  const qualityAnchors = getQualityAnchors(m.style_category);

  // ═════ NEGATIVE PROMPT ═════
  const negativeBlock = `\n\nNegative prompt: ${buildNegativePrompt(a)}`;

  // ═════ Assemble ═════
  const mainBlock = [
    opening,
    subjectNarrative,
    hairNarrative,
    makeupNarrative,
    outfitNarrative,
    poseNarrative,
    objectsNarrative,
    lightingNarrative + '.',
    bgNarrative + '.',
    colorNarrative,
    moodNarrative
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').replace(/\.\s*\./g, '.');

  const styleBlock = `\n\nStyle: ${style}. ${qualityAnchors}`;

  return mainBlock + distinctive + styleBlock + negativeBlock;
}

// ═══════════════════════════════════════════════════
// Quality Anchors — now more photographic and specific
// ═══════════════════════════════════════════════════
function getQualityAnchors(styleCategory) {
  const REALISM_CORE = 'Render with natural human skin showing visible pores, micro texture, and subtle subsurface scattering. Hair shows individual strand detail with natural flyaway wisps, not smoothed clumps. Eyes have genuine catchlight reflections. Fabric displays realistic weave texture, natural wrinkles, and authentic material behavior. No plastic smoothness, no doll-like stiffness.';

  const anchors = {
    photorealistic: `${REALISM_CORE} Shot on a full-frame DSLR with an 85mm f/1.4 portrait lens, professional photography, sharp focus on eyes, natural color science.`,

    beauty_filtered: `Soft beauty portrait aesthetic, subtle skin retouching but ${REALISM_CORE} Shot on iPhone 15 Pro in portrait mode with natural HDR, social media selfie quality, approachable real-person feel.`,

    AI_generated_filtered: `Polished Xiaohongshu/Douyin portrait aesthetic with gentle filter, yet ${REALISM_CORE} The image should feel like a real person who happens to use a beauty filter, NOT a CGI doll or AI avatar. Subtle polish, not over-processed.`,

    anime_2d: 'Detailed anime illustration, clean cel shading, crisp linework, vibrant yet harmonious colors, professional anime artist quality, trending on Pixiv.',

    semi_realistic_3d: `Semi-realistic 3D portrait render with ${REALISM_CORE} Unreal Engine 5 cinematic quality, Octane render lighting.`,

    film_photography: 'Shot on Kodak Portra 400 35mm film, authentic grain structure, soft highlight rolloff, slight color shift in shadows toward cyan, analog color science, gentle vignette at corners.',

    studio_photography: `Professional studio portrait with softbox key light and rim light, ${REALISM_CORE} Magazine editorial quality.`,

    cinematic: 'Cinematic still frame, shot on ARRI Alexa with anamorphic lens, dramatic key lighting with motivated direction, subtle film grain overlay, teal-and-orange or muted color grade.',

    illustration: 'Detailed digital illustration, confident linework, rich layered colors, professional concept art quality.',

    painting: 'Fine oil painting, visible confident brushstrokes, rich pigment layers, gallery-quality classical portrait.'
  };

  return anchors[styleCategory] || anchors.photorealistic;
}

// ═══════════════════════════════════════════════════
// Build Negative Prompt
// ═══════════════════════════════════════════════════
function buildNegativePrompt(a) {
  const m = a.metadata || {};

  // Universal quality issues
  const universal = 'blurry, low resolution, low quality, jpeg artifacts, oversaturated, grainy noise, watermark, text, signature, logo, bad composition, cropped awkwardly';

  // People-specific (anatomy issues)
  const people = 'deformed hands, extra fingers, fused fingers, missing fingers, extra limbs, distorted face, asymmetric eyes, crossed eyes, bad anatomy, disfigured, mutation';

  // Anti-AI-look (push for realism)
  const antiAILook = 'plastic skin, waxy skin, over-smoothed skin, doll-like appearance, stiff pose, mannequin look, uncanny valley, airbrushed';

  const byStyle = {
    photorealistic: 'cartoon, anime, illustration, 3d render, painting, sketch, stylized',
    beauty_filtered: 'harsh realism, heavy shadows, unflattering lighting',
    anime_2d: 'realistic, photograph, photorealistic, 3d render, western cartoon',
    AI_generated_filtered: 'over-processed, heavy filter artifacts, melted face features',
    semi_realistic_3d: 'flat 2d, sketch, rough painting',
    film_photography: 'digital look, over-sharpened, HDR, plastic colors',
    cinematic: 'flat lighting, amateur snapshot, smartphone look',
    illustration: 'realistic photograph, 3d render',
    painting: 'photograph, 3d render, digital perfection'
  };

  const parts = [universal];
  const cat = m.image_category || '';
  if (cat.includes('person') || cat.includes('people')) {
    parts.push(people);
    parts.push(antiAILook); // CRITICAL — pushes AI gen away from doll/plastic look
  }
  if (byStyle[m.style_category]) {
    parts.push(byStyle[m.style_category]);
  }

  return parts.join(', ');
}

// ═══════════════════════════════════════════════════
// Build Technical Params
// ═══════════════════════════════════════════════════
function buildTechnical(a) {
  const m = a.metadata || {};
  const aspect = m.aspect_ratio || '1:1';

  const checkpointMap = {
    photorealistic: 'Flux.1-dev',
    beauty_filtered: 'Flux.1-dev (with RealSkin LoRA)',
    anime_2d: 'AnimagineXL 4.0',
    AI_generated_filtered: 'Flux.1-dev',
    semi_realistic_3d: 'Flux.1-dev',
    film_photography: 'Flux.1-dev (with film LoRA)',
    cinematic: 'Flux.1-dev',
    illustration: 'AnimagineXL 4.0',
    painting: 'SDXL (painterly LoRA)'
  };

  const modelsMap = {
    photorealistic: ['Flux.1-dev', 'Midjourney v6.1 --style raw', 'Gemini 2.5 Flash Image'],
    beauty_filtered: ['Flux.1-dev', 'Gemini 2.5 Flash Image', 'Midjourney v6.1'],
    anime_2d: ['AnimagineXL 4.0', 'NovelAI v3', 'Pony Diffusion V6 XL'],
    AI_generated_filtered: ['Flux.1-dev', 'Gemini 2.5 Flash Image', 'Midjourney v6.1'],
    semi_realistic_3d: ['Flux.1-dev', 'SDXL', 'Midjourney v6.1'],
    film_photography: ['Flux.1-dev', 'Midjourney v6.1 --style raw'],
    cinematic: ['Flux.1-dev', 'Midjourney v6.1'],
    illustration: ['AnimagineXL 4.0', 'SDXL', 'NovelAI v3'],
    painting: ['SDXL', 'Midjourney v6.1 --style 4a']
  };

  return {
    midjourney: `--ar ${aspect} --style raw --s 250 --v 6.1`,
    flux_sdxl: {
      cfg_scale: 3.5,
      steps: 28,
      sampler: 'DPM++ 2M Karras',
      recommended_checkpoint: checkpointMap[m.style_category] || 'Flux.1-dev'
    },
    suggested_models: modelsMap[m.style_category] || ['Flux.1-dev', 'Midjourney v6.1', 'Gemini 2.5 Flash Image']
  };
}

// ═══════════════════════════════════════════════════
// Translate EN → VI + CN
// ═══════════════════════════════════════════════════
async function translatePrompt(promptEN) {
  const body = {
    contents: [{
      parts: [{ text: TRANSLATION_PROMPT + promptEN }]
    }],
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2048
    }
  };

  try {
    // Always use Gemini for translation (text-only, no image needed)
    const response = await callGemini(body);
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('[IPG] 🌐 Translation raw:', text ? text.substring(0, 200) : 'EMPTY');
    
    if (!text) return { vi: '', cn: '' };
    
    const parsed = parseJSON(text);
    console.log('[IPG] 🌐 Translation parsed keys:', Object.keys(parsed));
    console.log('[IPG] 🌐 VI length:', (parsed.vi || '').length, 'CN length:', (parsed.cn || '').length);
    
    return parsed;
  } catch (e) {
    console.warn('[IPG] ❌ Translation failed:', e.message);
    return { vi: '(Translation failed)', cn: '(翻译失败)' };
  }
}

// ═══════════════════════════════════════════════════
// Main Handler
// ═══════════════════════════════════════════════════
async function handleAnalyzeImage(imageUrl, sourceUrl, imageData) {
  console.log('[IPG] 1/7 Starting:', imageUrl.substring(0, 60));

  if (cache.has(imageUrl)) {
    console.log('[IPG] Cache hit (memory)');
    const entry = cache.get(imageUrl);
    return entry.result || entry;
  }

  const cacheKey = `ipg_cache_v8_${hashUrl(imageUrl)}`;
  const stored = await chrome.storage.local.get([cacheKey]);
  if (stored[cacheKey]) {
    console.log('[IPG] Cache hit (storage)');
    cache.set(imageUrl, stored[cacheKey]);
    return stored[cacheKey].result || stored[cacheKey];
  }

  // Prepare image
  let base64, mimeType;
  if (imageData) {
    base64 = imageData.base64;
    mimeType = imageData.mimeType;
    console.log('[IPG] 2/7 Using pre-resized image');
  } else {
    console.log('[IPG] 2/7 Fetching image...');
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) throw new Error(`Image fetch failed: ${imgResponse.status}`);
    const blob = await imgResponse.blob();
    mimeType = blob.type || 'image/jpeg';
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    base64 = btoa(binary);
  }

  // PASS 1: Analyze image
  console.log('[IPG] 3/7 Analyzing image...');
  const analysisBody = {
    contents: [{
      parts: [
        { text: ANALYSIS_PROMPT },
        { inline_data: { mime_type: mimeType, data: base64 } }
      ]
    }],
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096
    }
  };

  const analysisResponse = await callAPI(analysisBody);
  const analysisText = analysisResponse.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!analysisText) throw new Error('Empty analysis response');
  const analysis = parseJSON(analysisText);
  console.log('[IPG] 4/7 Analysis parsed');

  // PASS 2 + 3: Build prompts locally AND translate in parallel
  console.log('[IPG] 5/7 Building prompts + translating...');
  const promptEN = buildPromptEN(analysis);
  const technical = buildTechnical(analysis);
  const translationPromise = translatePrompt(promptEN);

  // Wait for translation (runs in parallel with prompt build)
  const translations = await translationPromise;

  const result = {
    analysis: analysis,
    prompts: {
      en: promptEN,
      vi: translations.vi || '',
      cn: translations.cn || ''
    },
    technical: technical
  };

  const cacheEntry = {
    result: result,
    imageUrl: imageUrl,
    sourceUrl: sourceUrl,
    timestamp: Date.now()
  };

  cache.set(imageUrl, cacheEntry);
  await chrome.storage.local.set({ [cacheKey]: cacheEntry });
  console.log('[IPG] 7/7 Done & cached');

  return result;
}