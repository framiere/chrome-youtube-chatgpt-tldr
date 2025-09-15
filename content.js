// Content script for YouTube transcript extraction

// Function to inject the extension button
function injectExtensionButton() {
  // Check if we're on a video page
  if (!window.location.pathname.includes('/watch')) return;

  // Check if button already exists
  if (document.querySelector('#yt-transcript-button')) return;

  // Find the like button container
  const likeButtonContainer = document.querySelector('ytd-segmented-like-dislike-button-renderer');
  const menuContainer = document.querySelector('#top-level-buttons-computed');
  const actionsContainer = document.querySelector('#actions');

  const targetContainer = likeButtonContainer || menuContainer || actionsContainer;

  if (!targetContainer) {
    // Try again in a second if container not found
    setTimeout(injectExtensionButton, 1000);
    return;
  }

  // Create the button
  const button = document.createElement('button');
  button.id = 'yt-transcript-button';
  button.className = 'yt-transcript-btn';
  button.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 11H7V13H9V11Z" fill="currentColor"/>
      <path d="M13 11H11V13H13V11Z" fill="currentColor"/>
      <path d="M17 11H15V13H17V11Z" fill="currentColor"/>
      <path d="M4 6C4 4.89543 4.89543 4 6 4H18C19.1046 4 20 4.89543 20 6V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V6Z" stroke="currentColor" stroke-width="2"/>
    </svg>
    <span class="yt-transcript-btn-text">To ChatGPT</span>
  `;
  button.title = 'Extract transcript and send to ChatGPT';

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    .yt-transcript-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      margin-right: 8px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 20px;
      cursor: pointer;
      font-family: Roboto, Arial, sans-serif;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }

    .yt-transcript-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .yt-transcript-btn:active {
      transform: translateY(0);
    }

    .yt-transcript-btn svg {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .yt-transcript-btn-text {
      white-space: nowrap;
    }

    .yt-transcript-btn.loading {
      pointer-events: none;
      opacity: 0.8;
    }

    .yt-transcript-btn.loading .yt-transcript-btn-text {
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* Responsive - hide text on small screens */
    @media (max-width: 768px) {
      .yt-transcript-btn-text {
        display: none;
      }
      .yt-transcript-btn {
        padding: 8px 12px;
      }
    }
  `;

  // Add style to page if not already added
  if (!document.querySelector('#yt-transcript-styles')) {
    style.id = 'yt-transcript-styles';
    document.head.appendChild(style);
  }

  // Insert button before the like button
  targetContainer.parentElement.insertBefore(button, targetContainer);

  // Add click handler
  button.addEventListener('click', handleButtonClick);
}

// Handle button click
async function handleButtonClick(e) {
  e.preventDefault();
  e.stopPropagation();

  const button = document.querySelector('#yt-transcript-button');
  if (!button) return;

  // Show loading state
  button.classList.add('loading');
  const originalText = button.querySelector('.yt-transcript-btn-text').textContent;
  button.querySelector('.yt-transcript-btn-text').textContent = 'Extracting...';

  try {
    // Extract transcript
    const transcript = await extractTranscript();

    if (transcript) {
      // Get saved prompt from storage or use default
      chrome.storage.local.get(['customPrompt'], function(result) {
        const customPrompt = result.customPrompt || 'Please summarize the following YouTube video transcript:';
        const fullText = `${customPrompt}\n\n${transcript}`;

        // Copy to clipboard
        navigator.clipboard.writeText(fullText).then(() => {
          // Store for ChatGPT content script
          chrome.storage.local.set({
            lastTranscript: transcript,
            lastPrompt: customPrompt,
            fullText: fullText,
            sourceVideoUrl: window.location.href,
            timestamp: new Date().toISOString()
          }, () => {
            // Show loading state in panel
            showPanelLoading();

            // Open ChatGPT in a small popup window
            openChatGPTPopup();

            // Show success feedback
            button.querySelector('.yt-transcript-btn-text').textContent = 'Processing...';
            setTimeout(() => {
              button.classList.remove('loading');
              button.querySelector('.yt-transcript-btn-text').textContent = originalText;
            }, 2000);
          });
        }).catch(err => {
          console.error('Failed to copy:', err);
          button.querySelector('.yt-transcript-btn-text').textContent = 'Error!';
          setTimeout(() => {
            button.classList.remove('loading');
            button.querySelector('.yt-transcript-btn-text').textContent = originalText;
          }, 2000);
        });
      });
    } else {
      throw new Error('No transcript found');
    }
  } catch (error) {
    console.error('Error:', error);
    button.querySelector('.yt-transcript-btn-text').textContent = 'Error!';
    setTimeout(() => {
      button.classList.remove('loading');
      button.querySelector('.yt-transcript-btn-text').textContent = originalText;
    }, 2000);
  }
}

// Function to create side panel
function createSidePanel() {
  // Check if panel already exists
  if (document.querySelector('#yt-tldr-panel')) return;

  // Create panel container
  const panel = document.createElement('div');
  panel.id = 'yt-tldr-panel';
  panel.className = 'yt-tldr-panel';
  panel.innerHTML = `
    <div class="yt-tldr-header">
      <h3>ChatGPT Summary</h3>
      <button class="yt-tldr-close" title="Close panel">×</button>
    </div>
    <div class="yt-tldr-content">
      <div class="yt-tldr-placeholder">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7V12C2 16.5 4.23 20.68 7.62 23.15L12 24L16.38 23.15C19.77 20.68 22 16.5 22 12V7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12 12C13.66 12 15 10.66 15 9C15 7.34 13.66 6 12 6C10.34 6 9 7.34 9 9C9 10.66 10.34 12 12 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12 12V18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p>Click "To ChatGPT" to generate a summary</p>
      </div>
    </div>
  `;

  // Add panel styles
  const panelStyles = document.createElement('style');
  panelStyles.id = 'yt-tldr-panel-styles';
  panelStyles.textContent = `
    .yt-tldr-panel {
      position: fixed;
      right: 0;
      top: 56px;
      width: 400px;
      height: calc(100vh - 56px);
      background: white;
      box-shadow: -2px 0 10px rgba(0,0,0,0.1);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.3s ease;
    }

    .yt-tldr-panel.open {
      transform: translateX(0);
    }

    .yt-tldr-header {
      padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }

    .yt-tldr-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 500;
    }

    .yt-tldr-close {
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background 0.2s;
    }

    .yt-tldr-close:hover {
      background: rgba(255,255,255,0.2);
    }

    .yt-tldr-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      background: #f9f9f9;
      font-size: inherit;
    }

    .yt-tldr-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #999;
      text-align: center;
    }

    .yt-tldr-placeholder svg {
      opacity: 0.3;
      margin-bottom: 16px;
    }

    .yt-tldr-summary, .yt-tldr-streaming {
      background: white;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    .yt-tldr-summary h4, .yt-tldr-streaming h4 {
      margin: 0 0 12px 0;
      color: #333;
      font-size: 16px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .yt-tldr-summary p, .yt-tldr-streaming p {
      margin: 10px 0;
      line-height: 1.7;
      color: #333;
      font-size: 14px;
    }

    .yt-tldr-summary ul, .yt-tldr-summary ol {
      margin: 10px 0;
      padding-left: 24px;
    }

    .yt-tldr-summary li {
      margin: 6px 0;
      line-height: 1.7;
      color: #333;
      font-size: 14px;
    }

    .yt-tldr-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
    }

    .yt-tldr-spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin-bottom: 16px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .yt-tldr-toggle {
      position: fixed;
      right: 20px;
      top: 80px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 50%;
      width: 48px;
      height: 48px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      z-index: 9998;
      display: none;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
    }

    .yt-tldr-toggle.show {
      display: flex;
    }

    .yt-tldr-toggle:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
    }

    /* Adjust YouTube player width when panel is open */
    body.yt-tldr-panel-open #columns.ytd-watch-flexy {
      max-width: calc(100% - 400px);
    }

    /* Mobile responsive */
    @media (max-width: 768px) {
      .yt-tldr-panel {
        width: 100%;
      }

      body.yt-tldr-panel-open #columns.ytd-watch-flexy {
        max-width: 100%;
      }
    }
  `;

  // Add styles if not already added
  if (!document.querySelector('#yt-tldr-panel-styles')) {
    document.head.appendChild(panelStyles);
  }

  // Add panel to body
  document.body.appendChild(panel);

  // Create toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'yt-tldr-toggle';
  toggleBtn.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 6H20M4 12H20M4 18H11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  toggleBtn.title = 'Show ChatGPT Summary';
  document.body.appendChild(toggleBtn);

  // Add close button handler
  panel.querySelector('.yt-tldr-close').addEventListener('click', () => {
    panel.classList.remove('open');
    document.body.classList.remove('yt-tldr-panel-open');
    toggleBtn.classList.add('show');
  });

  // Add toggle button handler
  toggleBtn.addEventListener('click', () => {
    panel.classList.add('open');
    document.body.classList.add('yt-tldr-panel-open');
    toggleBtn.classList.remove('show');
  });
}

// Function to update panel with summary
function updatePanelWithSummary(summary, chatGptUrl) {
  const panel = document.querySelector('#yt-tldr-panel');
  if (!panel) {
    createSidePanel();
  }

  const content = document.querySelector('.yt-tldr-content');
  if (content) {
    content.innerHTML = `
      <div class="yt-tldr-summary">
        <h4>Video Summary</h4>
        <div class="yt-tldr-text">${formatSummary(summary)}</div>
        ${chatGptUrl ? `
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
            <a href="${chatGptUrl}" target="_blank" style="
              display: inline-flex;
              align-items: center;
              gap: 8px;
              padding: 12px 20px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-decoration: none;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 600;
              transition: transform 0.2s, box-shadow 0.2s;
              cursor: pointer;
            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 5px 15px rgba(102, 126, 234, 0.3)'" onmouseout="this.style.transform=''; this.style.boxShadow=''">
              💬 Continue on ChatGPT
            </a>
          </div>
        ` : ''}
      </div>
    `;

    // Show panel
    panel.classList.add('open');
    document.body.classList.add('yt-tldr-panel-open');
    document.querySelector('.yt-tldr-toggle')?.classList.remove('show');
  }
}

// Function to format summary text with proper markdown support
function formatSummary(text) {
  if (!text) return '';

  // Check if we received HTML content (from ChatGPT's formatted output)
  if (text.includes('<p') || text.includes('<h') || text.includes('<ul') || text.includes('<strong')) {
    console.log('Detected HTML content from ChatGPT');

    // Clean up ChatGPT's HTML
    let formatted = text;

    // Remove data attributes
    formatted = formatted.replace(/\sdata-[^=]+="[^"]*"/g, '');

    // Remove any class attributes we don't need
    formatted = formatted.replace(/\sclass="[^"]*"/g, '');

    // Ensure proper styling classes are added to elements
    formatted = formatted.replace(/<h3/g, '<h3 class="yt-tldr-h3"');
    formatted = formatted.replace(/<h4/g, '<h4 class="yt-tldr-h4"');
    formatted = formatted.replace(/<ul/g, '<ul class="yt-tldr-list"');
    formatted = formatted.replace(/<ol/g, '<ol class="yt-tldr-list"');

    return formatted;
  }

  // Otherwise, parse as markdown
  console.log('Parsing as markdown text');

  // First, handle code blocks to preserve them
  const codeBlocks = [];
  let formatted = text.replace(/```([\s\S]*?)```/g, (match, code) => {
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // Handle inline code
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers - more specific matching
  formatted = formatted.replace(/^#{3}\s+(.+)$/gm, '<h5>$1</h5>');
  formatted = formatted.replace(/^#{2}\s+(.+)$/gm, '<h4>$1</h4>');
  formatted = formatted.replace(/^#{1}\s+(.+)$/gm, '<h3>$1</h3>');

  // Bold text - handle multi-word bold
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic text - be careful not to match list items
  formatted = formatted.replace(/(?<!\n)\*([^*\n]+?)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/(?<!\n)_([^_\n]+?)_/g, '<em>$1</em>');

  // Links
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Process lists more carefully
  const lines = formatted.split('\n');
  let result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check for bullet list
    if (line.match(/^[-*•]\s+(.+)$/)) {
      let listItems = [];
      while (i < lines.length && lines[i].match(/^[-*•]\s+(.+)$/)) {
        const content = lines[i].replace(/^[-*•]\s+(.+)$/, '$1');
        listItems.push(`<li>${content}</li>`);
        i++;
      }
      result.push('<ul>' + listItems.join('') + '</ul>');
    }
    // Check for numbered list
    else if (line.match(/^\d+\.\s+(.+)$/)) {
      let listItems = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+(.+)$/)) {
        const content = lines[i].replace(/^\d+\.\s+(.+)$/, '$1');
        listItems.push(`<li>${content}</li>`);
        i++;
      }
      result.push('<ol>' + listItems.join('') + '</ol>');
    }
    else {
      result.push(line);
      i++;
    }
  }

  formatted = result.join('\n');

  // Restore code blocks
  codeBlocks.forEach((block, index) => {
    formatted = formatted.replace(`__CODE_BLOCK_${index}__`, block);
  });

  // Handle paragraphs - group consecutive non-HTML lines
  const finalLines = formatted.split('\n');
  let finalResult = [];
  let paragraphLines = [];

  for (const line of finalLines) {
    const trimmedLine = line.trim();

    // Check if this is already an HTML element
    if (trimmedLine.startsWith('<h') ||
        trimmedLine.startsWith('<ul') ||
        trimmedLine.startsWith('<ol') ||
        trimmedLine.startsWith('<pre') ||
        trimmedLine === '') {

      // Flush any accumulated paragraph lines
      if (paragraphLines.length > 0) {
        finalResult.push('<p>' + paragraphLines.join('<br>') + '</p>');
        paragraphLines = [];
      }

      // Add the HTML element or empty line
      if (trimmedLine !== '') {
        finalResult.push(trimmedLine);
      }
    } else {
      // Accumulate paragraph lines
      if (trimmedLine) {
        paragraphLines.push(trimmedLine);
      }
    }
  }

  // Flush any remaining paragraph lines
  if (paragraphLines.length > 0) {
    finalResult.push('<p>' + paragraphLines.join('<br>') + '</p>');
  }

  formatted = finalResult.join('\n');

  // Add styling for code blocks
  if (!document.querySelector('#markdown-styles')) {
    const style = document.createElement('style');
    style.id = 'markdown-styles';
    style.textContent = `
      .yt-tldr-text pre {
        background: #f6f8fa;
        border-radius: 6px;
        padding: 12px;
        overflow-x: auto;
        margin: 8px 0;
      }
      .yt-tldr-text code {
        background: #f3f4f6;
        padding: 2px 4px;
        border-radius: 3px;
        font-family: 'Courier New', monospace;
        font-size: 0.9em;
      }
      .yt-tldr-text pre code {
        background: none;
        padding: 0;
      }
      .yt-tldr-text h3, .yt-tldr-text h4, .yt-tldr-text h5 {
        margin: 16px 0 8px 0;
        font-weight: 600;
        color: #1a1a1a;
      }
      .yt-tldr-text {
        font-size: 14px;
        font-family: Roboto, Arial, sans-serif;
      }
      .yt-tldr-text h3, .yt-tldr-h3 {
        font-size: 18px;
        border-bottom: 1px solid #e5e5e5;
        padding-bottom: 4px;
      }
      .yt-tldr-text h4, .yt-tldr-h4 {
        font-size: 16px;
        color: #333;
      }
      .yt-tldr-text h5 {
        font-size: 15px;
        color: #555;
      }
      .yt-tldr-text ul, .yt-tldr-text ol, .yt-tldr-list {
        margin: 8px 0;
        padding-left: 24px;
        list-style-position: outside;
      }
      .yt-tldr-text ul {
        list-style-type: disc;
      }
      .yt-tldr-text ul ul {
        list-style-type: circle;
        margin: 4px 0;
      }
      .yt-tldr-text ol {
        list-style-type: decimal;
      }
      .yt-tldr-text li {
        margin: 8px 0;
        line-height: 1.7;
        font-size: 14px;
      }
      .yt-tldr-text li p {
        margin: 2px 0;
        display: inline;
        font-size: 14px;
      }
      .yt-tldr-text > p {
        margin: 12px 0;
        line-height: 1.7;
        font-size: 14px;
      }
      .yt-tldr-text p {
        font-size: 14px;
      }
      .yt-tldr-text hr {
        border: none;
        border-top: 2px solid #e5e7eb;
        margin: 20px 0;
      }
      .yt-tldr-text a {
        color: #667eea;
        text-decoration: none;
      }
      .yt-tldr-text a:hover {
        text-decoration: underline;
      }
      .yt-tldr-text strong {
        font-weight: 600;
      }
      .yt-tldr-text em {
        font-style: italic;
      }
    `;
    document.head.appendChild(style);
  }

  return formatted;
}

// Function to show loading state in panel
function showPanelLoading() {
  let panel = document.querySelector('#yt-tldr-panel');
  if (!panel) {
    createSidePanel();
    panel = document.querySelector('#yt-tldr-panel');
  }

  const content = document.querySelector('.yt-tldr-content');
  if (content) {
    content.innerHTML = `
      <div class="yt-tldr-loading">
        <div class="yt-tldr-spinner"></div>
        <p>Processing with ChatGPT...</p>
        <p style="font-size: 12px; color: #999; margin-top: 10px;">
          ChatGPT is running in the background
        </p>
      </div>
    `;

    // Show panel
    panel.classList.add('open');
    document.body.classList.add('yt-tldr-panel-open');
    document.querySelector('.yt-tldr-toggle')?.classList.remove('show');
  }
}

// Function to open ChatGPT in a minimized popup window
let chatGPTWindow = null;

function openChatGPTPopup() {
  // Open ChatGPT in a minimal window
  const width = 1;
  const height = 1;
  const left = 0;
  const top = window.screen.height - 1;

  // Open ChatGPT in a minimal popup window
  chatGPTWindow = window.open(
    'https://chatgpt.com/',
    'ChatGPTPopup',
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,location=no,status=no,minimizable=yes`
  );

  // Immediately minimize and return focus to YouTube
  if (chatGPTWindow) {
    // Try to minimize the window
    chatGPTWindow.minimize && chatGPTWindow.minimize();
    chatGPTWindow.blur();

    // Keep focus on YouTube
    setTimeout(() => {
      window.focus();
    }, 100);
  }
}

// Initialize when page loads
function initialize() {
  // Inject button on initial load
  injectExtensionButton();

  // Create side panel
  createSidePanel();

  // Watch for navigation changes (YouTube is a SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(() => {
        injectExtensionButton();
        createSidePanel();
      }, 1000);
    }
  }).observe(document, { subtree: true, childList: true });
}

// Function to extract transcript from YouTube
async function extractTranscript() {
  try {
    // First try to get transcript from the YouTube's own transcript button
    const transcriptButton = document.querySelector('button[aria-label*="transcript" i], button[aria-label*="Transcript" i]');

    if (transcriptButton) {
      // Click to open transcript
      transcriptButton.click();

      // Wait for transcript to load
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Find transcript segments
      const transcriptSegments = document.querySelectorAll('ytd-transcript-segment-renderer');

      if (transcriptSegments.length > 0) {
        let transcript = '';
        transcriptSegments.forEach(segment => {
          const text = segment.querySelector('.segment-text')?.textContent?.trim();
          if (text) {
            transcript += text + ' ';
          }
        });
        return transcript.trim();
      }
    }

    // Fallback: Try to get captions from video player
    const video = document.querySelector('video');
    if (video) {
      // Get video ID from URL
      const urlParams = new URLSearchParams(window.location.search);
      const videoId = urlParams.get('v');

      if (videoId) {
        // Try to fetch transcript using YouTube's internal API
        const response = await fetchYouTubeTranscript(videoId);
        if (response) {
          return response;
        }
      }
    }

    throw new Error('Could not extract transcript. Make sure the video has captions/transcript available.');

  } catch (error) {
    console.error('Error extracting transcript:', error);
    throw error;
  }
}

// Function to fetch transcript using YouTube's internal API
async function fetchYouTubeTranscript(videoId) {
  try {
    // Get the page data
    const scripts = document.querySelectorAll('script');
    let ytInitialPlayerResponse = null;

    for (let script of scripts) {
      if (script.textContent.includes('ytInitialPlayerResponse')) {
        const match = script.textContent.match(/var ytInitialPlayerResponse = ({.+?});/);
        if (match) {
          ytInitialPlayerResponse = JSON.parse(match[1]);
          break;
        }
      }
    }

    if (ytInitialPlayerResponse && ytInitialPlayerResponse.captions) {
      const captionTracks = ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer?.captionTracks;

      if (captionTracks && captionTracks.length > 0) {
        // Get the first available caption track (usually auto-generated or manual)
        const captionUrl = captionTracks[0].baseUrl;

        // Fetch the caption data
        const response = await fetch(captionUrl);
        const text = await response.text();

        // Parse XML response
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, 'text/xml');
        const textNodes = xmlDoc.querySelectorAll('text');

        let transcript = '';
        textNodes.forEach(node => {
          const cleanText = node.textContent
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/<[^>]*>/g, '') // Remove any HTML tags
            .trim();

          if (cleanText) {
            transcript += cleanText + ' ';
          }
        });

        return transcript.trim();
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching YouTube transcript:', error);
    return null;
  }
}

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('YouTube received message:', request.action, 'isStreaming:', request.isStreaming);

  if (request.action === 'extractTranscript') {
    extractTranscript()
      .then(transcript => {
        sendResponse({ success: true, transcript: transcript });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Will respond asynchronously
  } else if (request.action === 'updateSummary') {
    console.log('Updating with final summary');
    // Update the panel with the final ChatGPT response
    updatePanelWithSummary(request.summary, request.chatGptUrl);
    sendResponse({ success: true });
  } else if (request.action === 'streamingSummary') {
    console.log('Streaming update received, isComplete:', request.isComplete);
    console.log('Summary length:', request.summary ? request.summary.length : 0);
    console.log('ChatGPT URL:', request.chatGptUrl);
    // Update panel with real-time streaming response
    updatePanelWithStreamingResponse(request.summary, request.isComplete, request.chatGptUrl);
    sendResponse({ success: true });
  }
});

// Function to update panel with streaming response in real-time
function updatePanelWithStreamingResponse(text, isComplete, chatGptUrl) {
  let panel = document.querySelector('#yt-tldr-panel');
  if (!panel) {
    createSidePanel();
    panel = document.querySelector('#yt-tldr-panel');
  }

  const content = document.querySelector('.yt-tldr-content');
  if (content) {
    // Clear loading state if present
    const loadingDiv = content.querySelector('.yt-tldr-loading');
    if (loadingDiv) {
      content.innerHTML = '';
    }

    // Create or update the streaming content
    let streamingDiv = content.querySelector('.yt-tldr-streaming');

    if (!streamingDiv) {
      streamingDiv = document.createElement('div');
      streamingDiv.className = 'yt-tldr-streaming';
      content.appendChild(streamingDiv);
    }

    // Update content
    streamingDiv.innerHTML = `
      <h4 style="margin: 0 0 12px 0; color: #333; font-size: 16px; font-weight: 600;">
        ${isComplete ? '✅ Video Summary' : '⏳ ChatGPT is typing...'}
      </h4>
      <div class="yt-tldr-text" style="max-height: calc(100vh - ${chatGptUrl && isComplete ? '250px' : '200px'}); overflow-y: auto;">
        ${formatSummary(text)}
      </div>
      ${!isComplete ? '<div class="typing-indicator" style="margin-top: 10px;"><span></span><span></span><span></span></div>' : ''}
      ${isComplete && chatGptUrl ? `
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
          <a href="${chatGptUrl}" target="_blank" style="
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            transition: transform 0.2s, box-shadow 0.2s;
            cursor: pointer;
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 5px 15px rgba(102, 126, 234, 0.3)'" onmouseout="this.style.transform=''; this.style.boxShadow=''">
            💬 Continue on ChatGPT
          </a>
        </div>
      ` : ''}
    `;

    // Add typing indicator styles if not already added
    if (!document.querySelector('#typing-indicator-styles')) {
      const style = document.createElement('style');
      style.id = 'typing-indicator-styles';
      style.textContent = `
        .typing-indicator {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .typing-indicator span {
          width: 8px;
          height: 8px;
          background: #667eea;
          border-radius: 50%;
          animation: typing 1.4s infinite;
        }
        .typing-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }
        .typing-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }
        @keyframes typing {
          0%, 60%, 100% {
            opacity: 0.3;
            transform: translateY(0);
          }
          30% {
            opacity: 1;
            transform: translateY(-10px);
          }
        }
      `;
      document.head.appendChild(style);
    }

    // Show panel if not already open
    if (!panel.classList.contains('open')) {
      panel.classList.add('open');
      document.body.classList.add('yt-tldr-panel-open');
      document.querySelector('.yt-tldr-toggle')?.classList.remove('show');
    }
  }
}

// Initialize the extension when content script loads
initialize();