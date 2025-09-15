# YouTube to ChatGPT Chrome Extension

This Chrome extension extracts transcripts from YouTube videos and sends them to ChatGPT with a custom prompt.

## Features

- Extract transcripts from YouTube videos with one click
- Customize the prompt that accompanies the transcript
- Automatically copies the full text (prompt + transcript) to clipboard
- Opens ChatGPT in a new tab for easy pasting

## Installation

1. Open `create_icons.html` in a browser and save each canvas as PNG:
   - Right-click the 16x16 canvas → Save as `icon16.png`
   - Right-click the 48x48 canvas → Save as `icon48.png`
   - Right-click the 128x128 canvas → Save as `icon128.png`

2. Open Chrome and go to `chrome://extensions/`

3. Enable "Developer mode" in the top right

4. Click "Load unpacked" and select this directory

5. The extension icon will appear in your Chrome toolbar

## Usage

1. Navigate to any YouTube video

2. Click the extension icon in your toolbar

3. (Optional) Customize the prompt in the text area

4. Click "Extract & Send to ChatGPT"

5. The extension will:
   - Extract the video transcript
   - Copy your prompt + transcript to clipboard
   - Open ChatGPT in a new tab

6. Paste the copied text into ChatGPT's input field

## Requirements

- The YouTube video must have captions/transcripts available
- Chrome browser with developer mode enabled

## Files

- `manifest.json` - Extension configuration
- `content.js` - Script that extracts transcripts from YouTube
- `popup.html` - Extension popup UI
- `popup.js` - Popup functionality
- `background.js` - Background service worker
- `create_icons.html` - Icon generator (open in browser to create icons)