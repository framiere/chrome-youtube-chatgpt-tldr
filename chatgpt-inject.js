// Content script for ChatGPT auto-paste functionality
console.log('ChatGPT content script loaded!');

// Get the text from storage and paste it
chrome.storage.local.get(['fullText', 'sourceVideoUrl'], function(result) {
  console.log('Storage retrieved:', {
    hasFullText: !!result.fullText,
    hasSourceUrl: !!result.sourceVideoUrl,
    textLength: result.fullText ? result.fullText.length : 0
  });

  if (result.fullText) {
    console.log('Attempting to paste transcript...');
    attemptPaste(result.fullText);

    // Start monitoring for ChatGPT response
    if (result.sourceVideoUrl) {
      console.log('Will start monitoring in 3 seconds...');
      setTimeout(() => {
        console.log('Starting response monitoring now');
        startMonitoringResponse(result.sourceVideoUrl);
      }, 3000);
    }
  } else {
    console.log('No fullText found in storage');
  }
});

function attemptPaste(text, attempts = 0) {
  const maxAttempts = 30; // Try for up to 15 seconds (30 * 500ms)

  // Look for the prompt textarea
  const inputField = document.querySelector('#prompt-textarea');

  if (!inputField) {
    if (attempts < maxAttempts) {
      // Try again in 500ms
      setTimeout(() => attemptPaste(text, attempts + 1), 500);
    }
    return;
  }

  // Focus and click the field
  inputField.focus();
  inputField.click();

  // Clear any existing content
  inputField.innerHTML = '';

  // Method 1: Simulate typing
  setTimeout(() => {
    // Create a paste event
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', text);

    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true
    });

    const result = inputField.dispatchEvent(pasteEvent);

    // If paste event didn't work, try direct manipulation
    if (!result || inputField.textContent.trim() === '') {
      // Split the text into lines
      const lines = text.split('\n');

      // Clear and add content
      inputField.innerHTML = '';

      lines.forEach(line => {
        const p = document.createElement('p');
        if (line.trim() === '') {
          p.innerHTML = '<br>';
        } else {
          p.textContent = line;
        }
        inputField.appendChild(p);
      });

      // Dispatch input event
      inputField.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertParagraph'
      }));

      // Move cursor to end
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(inputField);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // Clear the stored text after successful paste
    chrome.storage.local.remove(['fullText']);

    // Wait a bit then click the submit button
    setTimeout(() => {
      clickSubmitButton();
    }, 500);
  }, 200);
}

function clickSubmitButton() {
  // Try different selectors for the submit button
  const selectors = [
    'button[data-testid="composer-submit-button"]',
    'button[data-testid="send-button"]',
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
    'button.composer-submit-button',
    'button[type="submit"]'
  ];

  let submitButton = null;
  for (const selector of selectors) {
    submitButton = document.querySelector(selector);
    if (submitButton && !submitButton.disabled) {
      break;
    }
  }

  if (submitButton && !submitButton.disabled) {
    // Click the submit button
    submitButton.click();
    console.log('Submit button clicked');
  } else {
    // If button not found or disabled, try again in a moment
    setTimeout(() => {
      for (const selector of selectors) {
        submitButton = document.querySelector(selector);
        if (submitButton && !submitButton.disabled) {
          submitButton.click();
          console.log('Submit button clicked (retry)');
          break;
        }
      }
    }, 1000);
  }
}

// Function to monitor ChatGPT response with real-time streaming
function startMonitoringResponse(sourceVideoUrl) {
  let lastResponseText = '';
  let checkInterval;
  let isComplete = false;
  let attemptCount = 0;

  const checkForResponse = () => {
    attemptCount++;
    console.log(`Attempt ${attemptCount}: Checking for ChatGPT response...`);

    // Try multiple selectors for ChatGPT responses
    const selectors = [
      '[data-message-author-role="assistant"]',
      '.group:has([data-message-author-role="assistant"])',
      '.markdown.prose',
      '.message-content .markdown',
      '.agent-turn .markdown',
      'div[class*="message"]:has(.markdown)',
      '.text-base .markdown'
    ];

    let responseElements = null;
    for (const selector of selectors) {
      responseElements = document.querySelectorAll(selector);
      if (responseElements.length > 0) {
        console.log(`Found response with selector: ${selector}`);
        break;
      }
    }

    if (!responseElements || responseElements.length === 0) {
      console.log('No response elements found yet');
      return;
    }

    console.log(`Found ${responseElements.length} response elements`);

    // Get the last (most recent) response
    const lastResponse = responseElements[responseElements.length - 1];

    // Try to get the formatted HTML content, not just text
    let responseContent = '';

    // Try multiple ways to get the formatted content
    const markdownSelectors = [
      '.markdown.prose',
      '.markdown',
      '.prose',
      '[class*="markdown"]'
    ];

    let markdownDiv = null;
    for (const selector of markdownSelectors) {
      markdownDiv = lastResponse.querySelector(selector);
      if (markdownDiv) {
        console.log(`Found markdown content with selector: ${selector}`);
        break;
      }
    }

    // If the response element itself is the markdown container
    if (!markdownDiv && lastResponse.classList.contains('markdown')) {
      markdownDiv = lastResponse;
      console.log('Response element itself is markdown container');
    }

    if (markdownDiv) {
      // Get the inner HTML to preserve all formatting
      responseContent = markdownDiv.innerHTML;
      console.log('Extracted HTML content, length:', responseContent.length);
      console.log('HTML preview:', responseContent.substring(0, 200));
    } else {
      // Fallback to text content
      responseContent = lastResponse.textContent || lastResponse.innerText || '';
      console.log('Using text content as fallback');
    }

    const responseText = responseContent;

    // Send updates in real-time as ChatGPT types
    if (responseText && responseText.length > 10) {
      // Only process if there's meaningful text
      if (responseText !== lastResponseText) {
        console.log(`New text detected! Length: ${responseText.length} chars`);
        console.log(`First 100 chars: ${responseText.substring(0, 100)}...`);

        lastResponseText = responseText;

        // Check various indicators for streaming status
        const streamingIndicators = [
          '.result-streaming',
          '.typing-indicator',
          '[class*="streaming"]',
          '.cursor-blink',
          '.animate-pulse'
        ];

        let isGenerating = false;
        for (const indicator of streamingIndicators) {
          if (document.querySelector(indicator) || lastResponse.querySelector(indicator)) {
            isGenerating = true;
            console.log(`Still generating - found indicator: ${indicator}`);
            break;
          }
        }

        // Also check if text is still growing
        if (!isGenerating) {
          // Wait a bit and check if text changed
          setTimeout(() => {
            const currentText = lastResponse.textContent || lastResponse.innerText || '';
            if (currentText.length > responseText.length) {
              isGenerating = true;
              console.log('Text is still growing, marking as generating');
            }
          }, 200);
        }

        console.log(`Sending update - Is generating: ${isGenerating}`);

        // Send real-time update to YouTube tab
        sendResponseToYouTube(responseText, sourceVideoUrl, !isGenerating);

        if (!isGenerating && !isComplete) {
          // Response is complete
          isComplete = true;
          console.log('Response complete! Closing window in 3 seconds');

          // Close the ChatGPT popup window after completion
          setTimeout(() => {
            console.log('Closing ChatGPT window');
            window.close();
          }, 3000);

          // Stop monitoring
          if (checkInterval) {
            clearInterval(checkInterval);
          }
        }
      } else {
        console.log('Text unchanged');
      }
    } else if (responseText) {
      console.log(`Response too short: ${responseText.length} chars`);
    }
  };

  // Start checking after a delay to let ChatGPT load
  setTimeout(() => {
    console.log('Starting to monitor ChatGPT responses...');
    checkForResponse(); // Initial check

    // Check more frequently for real-time updates (every 500ms)
    checkInterval = setInterval(checkForResponse, 500);
  }, 2000);

  // Stop monitoring after 3 minutes
  setTimeout(() => {
    if (checkInterval) {
      clearInterval(checkInterval);
      console.log('Stopping monitor after 3 minutes');
    }
    // Close window if still open
    if (!isComplete) {
      console.log('Timeout reached, closing window');
      window.close();
    }
  }, 180000);
}

// Function to send response back to YouTube tab
function sendResponseToYouTube(responseText, sourceVideoUrl, isComplete = false) {
  // Get the current ChatGPT conversation URL
  let chatGptUrl = window.location.href;

  // Wait for the URL to update to include conversation ID if it hasn't yet
  if (!chatGptUrl.includes('/c/') && !isComplete) {
    // URL might not have updated yet for new conversations
    chatGptUrl = window.location.href;
  }

  console.log('ChatGPT conversation URL:', chatGptUrl);

  // Send message to background script to relay to YouTube tab
  chrome.runtime.sendMessage({
    action: 'relayToYouTube',
    summary: responseText,
    sourceUrl: sourceVideoUrl,
    chatGptUrl: chatGptUrl,
    isComplete: isComplete,
    isStreaming: !isComplete
  }, (response) => {
    if (response && response.success) {
      console.log('Summary sent to YouTube tab', isComplete ? '(complete)' : '(streaming)');
    }
  });
}