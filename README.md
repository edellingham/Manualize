![Platform](https://img.shields.io/badge/Platform-Chrome%20Extension-blue?logo=googlechrome&logoColor=white)
![Manifest Version](https://img.shields.io/badge/Manifest-V3-brightgreen)
![Tech Stack](https://img.shields.io/badge/Tech-JS%20%7C%20HTML%20%7C%20CSS-orange)
![License](https://img.shields.io/badge/License-MIT-yellow)

<img width="300" height="150" alt="manualize_logo" src="https://github.com/user-attachments/assets/f3690c30-242b-4b68-962f-972a4e40ccce" />

Manualize is a free, offline-first, and privacy-focused Chrome Extension that serves as a direct alternative to Tango and Scribe. It allows you to automatically record step-by-step user guides directly from any webpage, captures element-specific screenshots, and exports them into beautiful HTML or PDF documents.

Unlike cloud-dependent SaaS alternatives, all capture data, images, and draft guides remain completely local within your browser's database.

---

## Core Features

### Automated Capture

- Hooks into webpage events to record clicks, text inputs, form selections, and page navigations in real time.
- Automatically generates descriptive text for each action (e.g., "Click on the Submit button").
- Captures clear screenshots of targeted elements.

### Guide Editor & Management

- Edit generated descriptions, reorder steps, or delete unnecessary steps.
- Add manual steps with custom text and screenshot uploads.
- Rename guides and monitor draft versions inside the extension.

### Premium Exports

- HTML Export: A single, fully standalone HTML file with styled steps, interactive images, and embedded base64 screenshots.
- PDF Export: High-fidelity PDF guides with custom layout support:
  - One step per page (large screenshots, perfect for presentations).
  - Compact mode (multiple steps per page to save space).

### Dashboard & Bulk Operations

- Access all saved guides in a local dashboard.
- View real-time IndexedDB storage usage indicators.
- Perform bulk actions including multi-select deletion and bulk backup exports.

### Privacy and Portability

- 100% offline database using browser IndexedDB.
- Backup guides as JSON files (`.manualize`) and restore them seamlessly on any device.

---

## Repository Structure

```
Manualize/
├── manifest.json              # Extension Manifest V3 configuration
├── LICENSE                    # MIT License
├── README.md                  # Project documentation
├── background/
│   └── service-worker.js      # Background service worker coordinating tabs & sidepanel
├── content/
│   ├── content.js             # Content script tracking page interactions & DOM elements
│   └── content.css            # Styles injected for screenshot highlights
└── sidepanel/
    ├── sidepanel.html         # Main Extension UI layout
    ├── sidepanel.css          # Extension styling and layout
    ├── sidepanel.js           # Controller for sidepanel UI, recording state, and editing
    ├── db.js                  # Local IndexedDB persistence wrapper
    ├── export-html.js         # Single-file HTML generator and builder
    ├── export-pdf.js          # PDF formatter utilizing jsPDF
    └── lib/
        └── jspdf.umd.min.js   # jsPDF library dependency for client-side PDF generation
```

---

## Installation

To load and use the extension locally during development:

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/Tyaaa-aa/Manualize.git
   ```
2. Open Google Chrome and navigate to the Extensions page at `chrome://extensions`. (Note: This works on all Chromium-based browsers, just replace the url with the appropriate one for your browser, e.g. `edge://extensions`, `brave://extensions`, `vivaldi://extensions`)
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the project root directory (`Manualize`) containing `manifest.json`.
   > [!NOTE]
   > Manualize is currently under active development. Work is underway to make the extension available directly on the Chrome Web Store. Until the official release, please follow the developer mode installation instructions above.

---

## How to Use

1. **Open the Extension**: Click the Manualize icon in your browser toolbar or pin it to open the side panel.
2. **Start a Guide**: Provide a title for your guide and click **Start Recording**.
3. **Record Steps**: Go to any browser tab and interact with target webpages as you normally would. Manualize will capture clicks, typing, and other interactive changes in the background.
4. **Refine your Guide**: Pause the recording or stop it. You can edit text descriptions, rearrange steps, delete duplicates, or add custom manual steps.
5. **Export & Share**:
   - Click **HTML** to download a standalone web file.
   - Click **PDF** and select your preferred layout options to download a print-ready document.
   - Export to **JSON** if you wish to back up your database raw file.

---

## Development

- **No Frameworks**: Built using pure HTML5, vanilla CSS3, and standard modern ES6+ JavaScript for fast execution and small build sizes.
- **Chrome APIs used**: `chrome.tabs`, `chrome.scripting`, `chrome.sidePanel`, `chrome.storage`, and `chrome.activeTab`.
- **Database**: Employs IndexedDB for scalable storing of base64 screenshot assets and guide metadata.

---

## License

This project is licensed under the MIT License. See the [LICENSE](https://github.com/Tyaaa-aa/Manualize?tab=MIT-1-ov-file#readme) file for details.
