// Background script for the Chrome extension

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('YouTube to ChatGPT extension installed');

  // Set default storage values
  chrome.storage.local.set({
    customPrompt: 'Please summarize the following YouTube video transcript:',
    lastTranscript: '',
    lastPrompt: '',
    timestamp: null
  });
});

// Handle messages between content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action);

  if (request.action === 'logError') {
    console.error('Extension error:', request.error);
  } else if (request.action === 'relayToYouTube') {
    console.log('Relaying to YouTube, streaming:', request.isStreaming);
    // Relay ChatGPT response to YouTube tab
    relayToYouTubeTab(request, sendResponse);
    return true; // Will respond asynchronously
  }
});

// Function to relay message to YouTube tab
async function relayToYouTubeTab(data, sendResponse) {
  try {
    const { summary, sourceUrl, isComplete, isStreaming } = data;

    // Find the YouTube tab with the matching URL
    const tabs = await chrome.tabs.query({ url: '*://www.youtube.com/*' });

    if (!tabs || tabs.length === 0) {
      console.log('No YouTube tabs found');
      sendResponse({ success: false, error: 'No YouTube tab found' });
      return;
    }

    // Find the best matching tab
    let targetTab = null;
    for (const tab of tabs) {
      try {
        // Extract video ID from both URLs for better matching
        const getVideoId = (url) => {
          if (!url) return null;
          const match = url.match(/[?&]v=([^&]+)/);
          return match ? match[1] : null;
        };

        const sourceVideoId = getVideoId(sourceUrl);
        const tabVideoId = getVideoId(tab.url);

        if (sourceVideoId && tabVideoId && sourceVideoId === tabVideoId) {
          targetTab = tab;
          break;
        } else if (sourceUrl && tab.url && tab.url === sourceUrl) {
          targetTab = tab;
          break;
        }
      } catch (e) {
        console.log('Error comparing URLs:', e);
      }
    }

    // If no exact match, use the first YouTube tab
    if (!targetTab) {
      targetTab = tabs[0];
    }

    // Ensure we have a valid tab
    if (!targetTab || !targetTab.id) {
      console.error('No valid target tab found');
      sendResponse({ success: false, error: 'No valid target tab' });
      return;
    }

    console.log(`Attempting to send message to tab ${targetTab.id} (${targetTab.url})`);

    // Function to send message with Promise
    const sendMessageToTab = (tabId, message) => {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });
    };

    // Try to send the message
    try {
      const message = {
        action: isStreaming ? 'streamingSummary' : 'updateSummary',
        summary: summary || '',
        isComplete: isComplete || false,
        isStreaming: isStreaming || false,
        chatGptUrl: data.chatGptUrl || ''
      };

      await sendMessageToTab(targetTab.id, message);
      console.log(`Message sent successfully to tab ${targetTab.id}`);
      sendResponse({ success: true });

    } catch (sendError) {
      console.log('Failed to send message:', sendError.message);

      // If sending fails, try to inject content script first
      try {
        console.log('Attempting to inject content script...');
        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          files: ['content.js']
        });

        // Wait a bit for the script to initialize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Try sending again
        const message = {
          action: isStreaming ? 'streamingSummary' : 'updateSummary',
          summary: summary || '',
          isComplete: isComplete || false,
          isStreaming: isStreaming || false,
          chatGptUrl: data.chatGptUrl || ''
        };

        await sendMessageToTab(targetTab.id, message);
        console.log('Message sent after injecting content script');
        sendResponse({ success: true });

      } catch (retryError) {
        console.error('Failed even after injection:', retryError);
        // Still respond to avoid hanging
        sendResponse({ success: false, error: retryError.message || 'Failed to send message' });
      }
    }

  } catch (error) {
    console.error('Error in relayToYouTubeTab:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Optional: Add context menu item for right-click functionality
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.contextMenus) {
    chrome.contextMenus.create({
      id: "extractTranscript",
      title: "Extract YouTube Transcript",
      contexts: ["page", "video"],
      documentUrlPatterns: ["*://www.youtube.com/watch*"]
    });
  }
});

// Handle context menu clicks
if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "extractTranscript") {
      // Open the popup or trigger the extraction directly
      chrome.action.openPopup();
    }
  });
}