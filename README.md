# ✦ Image Prompt Generator

> A Chrome Extension that analyzes any image and generates detailed AI prompts to recreate it. Hover → Click → Copy → Paste into Gemini, ChatGPT, or Midjourney.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ Features

- 🔍 **One-Click Analysis** — Hover over any image, click the ✦ icon, get a detailed prompt
- 🌐 **Multi-Language** — Prompts in English, Vietnamese, and Chinese
- 📋 **JSON Export** — Full structured analysis with metadata, colors, poses, lighting
- 🔑 **Multi-Provider API** — Use your own Gemini, OpenAI (GPT-4o), or Claude API keys
- 📦 **Image Library** — Browse and manage all previously analyzed images
- 📎 **Auto-Paste** — Copies directly to image generation area on Gemini, ChatGPT, Grok, and Google Flow
- 🎯 **Smart Detection** — Only triggers on real content images, ignores icons and thumbnails
- 🔄 **Key Rotation** — Automatically rotates through multiple API keys when quota is exhausted

## 📸 How It Works

1. **Hover** over any image on any website
2. **Click** the ✦ icon that appears
3. **Wait** for AI analysis (10-30 seconds)
4. **Choose** output format: `JSON` | `EN` | `VI` | `CN`
5. **Copy & Paste** into your favorite AI image generator!

## 🚀 Installation

### From Source (Developer Mode)

1. **Clone** the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/image-prompt-generator.git
   cd image-prompt-generator
   ```

2. **Configure API keys:**
   ```bash
   cp config.example.js config.js
   ```
   Edit `config.js` and add your [Gemini API key(s)](https://aistudio.google.com/apikey):
   ```js
   export const API_KEYS = [
     'YOUR_GEMINI_API_KEY_HERE',
   ];
   ```

3. **Load in Chrome:**
   - Go to `chrome://extensions/`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked**
   - Select the project folder

4. ✅ Done! The ✦ icon will appear when you hover over images.

## 🔑 API Key Setup

### Built-in Keys (config.js)
Add Gemini API keys to `config.js` for built-in rotation. The system automatically cycles through keys when one hits its quota.

### User API Keys (In-Extension)
Click the extension icon → **API Keys** section → add keys for:

| Provider | Where to get key |
|----------|-----------------|
| **Google Gemini** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **OpenAI (GPT-4o)** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Anthropic Claude** | [console.anthropic.com](https://console.anthropic.com/) |

> User keys are tried first. If they fail, the system falls back to built-in Gemini keys.

## 📁 Project Structure

```
├── manifest.json          # Extension manifest (MV3)
├── config.example.js      # API key template (copy to config.js)
├── config.js              # Your API keys (gitignored)
├── background.js          # Service worker: API calls, analysis, prompt building
├── content.js             # Content script: image detection, overlay UI, popups
├── content.css            # Content script styles
├── autopaste.js           # Auto-paste to Gemini/ChatGPT/Grok/Flow
├── popup.html / .css / .js  # Extension popup UI
├── gallery.html / .js     # Image Library page
├── DESIGN.md              # Design system documentation
├── icons/                 # Extension icons (16/48/128px)
└── LICENSE                # MIT License
```

## 🧠 Analysis Schema

The AI generates a comprehensive JSON analysis including:

```json
{
  "metadata": { "aspect_ratio", "camera_distance", "camera_angle", "depth_of_field", ... },
  "subject": "Detailed description of the person/object",
  "hair": "Color, length, texture, style, accessories",
  "makeup": "Foundation, eye makeup, lip color, overall vibe",
  "outfit": "Top-to-bottom with fabric, color, fit, details",
  "pose": "Body + hand position (natural description)",
  "lighting": "Source, direction, quality, color temperature",
  "colors": { "palette_description", "dominant_hex", "accent_hex", "grading" },
  "background": "Environment, blur level, visible objects",
  "mood": "Actual emotional vibe",
  "style_reference": "Specific aesthetic reference",
  "distinctive_features": "5-7 unique visual anchors",
  "objects_and_text": [
    { "type", "content", "position", "size", "color", "font_style", "notes" }
  ]
}
```

## 🎨 Prompt Generation

From the JSON analysis, the extension builds:
- **EN Prompt** — Dense visual narrative optimized for AI image generation
- **VI Prompt** — Natural Vietnamese translation
- **CN Prompt** — Natural Simplified Chinese translation
- **Negative Prompt** — Auto-generated based on image category
- **Technical Parameters** — Midjourney flags, Flux/SDXL settings, model recommendations

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## ⚠️ Important Notes

- **API Keys**: Never commit `config.js` — it contains your private API keys
- **Rate Limits**: Free Gemini API has quota limits. Add multiple keys for rotation.
- **Image Access**: Some images may fail to load due to CORS restrictions
- **Permissions**: The extension needs `<all_urls>` to access images on any site

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

**Made with ✦ for the AI art community**
