// Popup script for the Chrome extension

document.addEventListener('DOMContentLoaded', function() {
  const extractBtn = document.getElementById('extractBtn');
  const statusDiv = document.getElementById('status');
  const customPromptTextarea = document.getElementById('customPrompt');

  // Load saved prompt from storage
  chrome.storage.local.get(['customPrompt'], function(result) {
    if (result.customPrompt) {
      customPromptTextarea.value = result.customPrompt;
    }
  });

  // Save prompt when it changes
  customPromptTextarea.addEventListener('input', function() {
    chrome.storage.local.set({ customPrompt: customPromptTextarea.value });
  });

  // Function to inject into ChatGPT page
  function pasteToChat(text) {
    // Wait for the input field to be available
    function tryPaste(attempts = 0) {
      const inputField = document.querySelector('#prompt-textarea');

      if (!inputField && attempts < 20) {
        // Try again in 500ms
        setTimeout(() => tryPaste(attempts + 1), 500);
        return;
      }

      if (inputField) {
        // Focus the field
        inputField.focus();
        inputField.click();

        // Wait a bit for focus to register
        setTimeout(() => {
          // Method 1: Try using document.execCommand
          const dataTransfer = new DataTransfer();
          dataTransfer.setData('text/plain', text);

          const pasteEvent = new ClipboardEvent('paste', {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true
          });

          inputField.dispatchEvent(pasteEvent);

          // Method 2: If that doesn't work, try setting innerHTML
          setTimeout(() => {
            if (inputField.textContent.trim() === '' || inputField.querySelector('.placeholder')) {
              // Clear placeholder
              inputField.innerHTML = '';

              // Split text into paragraphs
              const lines = text.split('\n');
              lines.forEach((line, index) => {
                const p = document.createElement('p');
                if (line.trim() === '') {
                  p.innerHTML = '<br>';
                } else {
                  p.textContent = line;
                }
                inputField.appendChild(p);
              });

              // Trigger input event
              const inputEvent = new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText'
              });
              inputField.dispatchEvent(inputEvent);

              // Move cursor to end
              const selection = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(inputField);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }, 100);
        }, 100);

        return true;
      }
      return false;
    }

    tryPaste();
  }

  extractBtn.addEventListener('click', async function() {
    try {
      // Disable button and show loading status
      extractBtn.disabled = true;
      extractBtn.textContent = 'Extracting...';
      showStatus('Extracting transcript...', 'info');

      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Check if we're on a YouTube page
      if (!tab.url || !tab.url.includes('youtube.com/watch')) {
        throw new Error('Please navigate to a YouTube video page first.');
      }

      // Send message to content script to extract transcript
      chrome.tabs.sendMessage(tab.id, { action: 'extractTranscript' }, async function(response) {
        if (chrome.runtime.lastError) {
          // Content script might not be injected yet, try to inject it
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });

          // Try again
          chrome.tabs.sendMessage(tab.id, { action: 'extractTranscript' }, handleTranscriptResponse);
        } else {
          handleTranscriptResponse(response);
        }
      });

    } catch (error) {
      showStatus(error.message, 'error');
      extractBtn.disabled = false;
      extractBtn.textContent = 'Extract & Send to ChatGPT';
    }
  });

  function handleTranscriptResponse(response) {
    if (response && response.success) {
      const transcript = response.transcript;
      const customPrompt = customPromptTextarea.value || 'Please summarize the following YouTube video transcript:';

      // Copy transcript to clipboard
      const fullText = `${customPrompt}\n\n${transcript}`;

      // First, copy to clipboard
      navigator.clipboard.writeText(fullText).then(() => {
        showStatus('Transcript copied! Opening ChatGPT...', 'success');

        // Store the transcript data
        chrome.storage.local.set({
          lastTranscript: transcript,
          lastPrompt: customPrompt,
          fullText: fullText,
          timestamp: new Date().toISOString()
        });

        // Open ChatGPT in a new tab
        // The chatgpt-inject.js content script will automatically run and paste the content
        chrome.tabs.create({
          url: 'https://chatgpt.com/',
          active: true
        }, function(newTab) {
          // Show final success message
          setTimeout(() => {
            showStatus('✅ Transcript copied! If not auto-pasted, press Ctrl+V (or Cmd+V on Mac) in ChatGPT.', 'success');
            extractBtn.disabled = false;
            extractBtn.textContent = 'Extract & Send to ChatGPT';
          }, 1000);
        });

      }).catch(err => {
        showStatus('Failed to copy transcript: ' + err.message, 'error');
        extractBtn.disabled = false;
        extractBtn.textContent = 'Extract & Send to ChatGPT';
      });

    } else {
      showStatus(response?.error || 'Failed to extract transcript. Make sure the video has captions available.', 'error');
      extractBtn.disabled = false;
      extractBtn.textContent = 'Extract & Send to ChatGPT';
    }
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;

    if (type === 'error') {
      setTimeout(() => {
        statusDiv.className = 'status';
      }, 5000);
    }
  }
});