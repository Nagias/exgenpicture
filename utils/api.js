// Gemini Vision API integration
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-2.0-flash';

import { ANALYSIS_SYSTEM_PROMPT, ANALYSIS_USER_PROMPT } from './prompts.js';

/**
 * Analyze an image using Gemini Vision API
 * @param {string} imageBase64 - Base64 encoded image data (without data: prefix)
 * @param {string} mimeType - Image MIME type (e.g., 'image/jpeg')
 * @param {string} apiKey - Gemini API key
 * @returns {Promise<Object>} Analysis result with prompts
 */
export async function analyzeImage(imageBase64, mimeType, apiKey) {
  const url = `${GEMINI_API_BASE}/${MODEL}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: ANALYSIS_SYSTEM_PROMPT + "\n\n" + ANALYSIS_USER_PROMPT
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBase64
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 4096,
      responseMimeType: "application/json"
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Gemini API error (${response.status}): ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();

  // Extract the text content from Gemini response
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('No content in Gemini response');
  }

  // Parse the JSON response
  let parsed;
  try {
    // Clean up potential markdown code fences
    let cleanJson = textContent.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    parsed = JSON.parse(cleanJson);
  } catch (e) {
    throw new Error(`Failed to parse Gemini response as JSON: ${e.message}`);
  }

  return parsed;
}

/**
 * Fetch an image from URL and convert to base64
 * @param {string} imageUrl - URL of the image
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
export async function fetchImageAsBase64(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const blob = await response.blob();
  const mimeType = blob.type || 'image/jpeg';

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Remove the data:*/*;base64, prefix
      const base64 = reader.result.split(',')[1];
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
