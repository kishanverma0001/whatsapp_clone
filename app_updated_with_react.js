// Peer connection and data channel variables
let pc = null;
let dc = null;
let isOfferer = false;
let messages = new Map(); // Store message metadata
let pinnedMessages = new Set();
let starredMessages = new Set();
let replyToMessageId = null;

const config = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// DOM Elements
const createOfferBtn = document.getElementById('createOfferBtn');
const acceptOfferBtn = document.getElementById('acceptOfferBtn');
const localSDPTextarea = document.getElementById('localSDP');
const remoteSDPTextarea = document.getElementById('remoteSDP');
const infoDiv = document.getElementById('info');
const chatPanel = document.getElementById('chatPanel');
const messagesDiv = document.getElementById('messages');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const fileInput = document.getElementById('fileInput');
const emojiBtn = document.getElementById('emojiBtn');
const darkModeToggle = document.getElementById('darkModeToggle');
const copySDPBtn = document.getElementById('copySDPBtn');
const pasteSDPBtn = document.getElementById('pasteSDPBtn');
const typingIndicator = document.getElementById('typingIndicator');
const changeNameBtn = document.getElementById('changeNameBtn');
const pinnedBanner = document.getElementById('pinnedBanner');
const pinnedText = document.getElementById('pinnedText');
const unpinBtn = document.getElementById('unpinBtn');
const userNameDisplay = document.querySelector('.contact-info span');

let typingTimeout = null;
let userName = localStorage.getItem('wa_user_name') || '';
let peerName = 'Peer';

// Initialize the app
function init() {
  promptForName();
  setupEventListeners();M
  loadDarkModePreference();
}

// Generate unique message ID
function generateMessageId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Append message to chat
function appendMessage(text, fromMe, isMedia = false, mediaType = '', src = '', messageId, status = 'delivered', replyTo = null, reaction = '') {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${fromMe ? 'sent' : 'received'}${pinnedMessages.has(messageId) ? ' pinned' : ''}${starredMessages.has(messageId) ? ' starred' : ''}`;
  msgDiv.dataset.messageId = messageId;

  if (replyTo && messages.has(replyTo)) {
    const replyContext = document.createElement('div');
    replyContext.className = 'reply-context';
    replyContext.textContent = messages.get(replyTo).text || 'Media';
    msgDiv.appendChild(replyContext);
  }

  if (isMedia) {
    let mediaEl;
    if (mediaType.startsWith('image/')) {
      mediaEl = document.createElement('img');
      mediaEl.src = src;
      mediaEl.alt = text || 'Shared image';
    } else if (mediaType.startsWith('video/')) {
      mediaEl = document.createElement('video');
      mediaEl.src = src;
      mediaEl.controls = true;
      mediaEl.autoplay = false;
      mediaEl.title = text || 'Shared video';
    } else if (mediaType.startsWith('audio/')) {
      mediaEl = document.createElement('audio');
      mediaEl.src = src;
      mediaEl.controls = true;
      mediaEl.title = text || 'Shared audio';
    }
    if (mediaEl) {
      msgDiv.appendChild(mediaEl);
    } else {
      msgDiv.textContent = text;
    }
  } else {
    msgDiv.textContent = text;
  }

  const timeDiv = document.createElement('div');
  timeDiv.className = 'timestamp';
  timeDiv.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  msgDiv.appendChild(timeDiv);

  if (fromMe) {
    const statusDiv = document.createElement('div');
    statusDiv.className = `status ${status}`;
    msgDiv.appendChild(statusDiv);
  }

  if (reaction) {
    const reactionDiv = document.createElement('div');
    reactionDiv.className = 'reaction';
    reactionDiv.textContent = reaction;
    msgDiv.appendChild(reactionDiv);
  }

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'message-actions';
  actionsDiv.innerHTML = `
    <button class="reply-btn" title="Reply"><i class="fas fa-reply"></i></button>
    <button class="react-btn" title="React"><i class="fas fa-smile"></i></button>
    <button class="star-btn" title="${starredMessages.has(messageId) ? 'Unstar' : 'Star'}"><i class="fas fa-star"></i></button>
    <button class="pin-btn" title="${pinnedMessages.has(messageId) ? 'Unpin' : 'Pin'}"><i class="fas fa-thumbtack"></i></button>
    <button class="copy-btn" title="Copy"><i class="fas fa-copy"></i></button>
    ${fromMe ? '<button class="edit-btn" title="Edit"><i class="fas fa-edit"></i></button>' : ''}
    <button class="delete-me-btn" title="Delete for Me"><i class="fas fa-trash"></i></button>
    ${fromMe ? '<button class="delete-everyone-btn" title="Delete for Everyone"><i class="fas fa-user-slash"></i></button>' : ''}
  `;
  msgDiv.appendChild(actionsDiv);

  messagesDiv.appendChild(msgDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  messages.set(messageId, { text, fromMe, isMedia, mediaType, src, status, replyTo, reaction });
  return msgDiv;
}

// Update message status
function updateMessageStatus(messageId, status) {
  if (messages.has(messageId)) {
    messages.get(messageId).status = status;
    const msgDiv = messagesDiv.querySelector(`[data-message-id="${messageId}"]`);
    if (msgDiv) {
      const statusDiv = msgDiv.querySelector('.status');
      if (statusDiv) {
        statusDiv.className = `status ${status}`;
      }
    }
  }
}

// Edit message
function editMessage(messageId, newText) {
  if (messages.has(messageId) && !messages.get(messageId).isMedia) {
    messages.get(messageId).text = newText;
    const msgDiv = messagesDiv.querySelector(`[data-message-id="${messageId}"]`);
    if (msgDiv) {
      const textNode = msgDiv.childNodes[0].nodeType === 3 ? msgDiv.childNodes[0] : msgDiv.querySelector('.reply-context + *');
      if (textNode) textNode.textContent = newText;
    }
  }
}

// Add reaction
function addReaction(messageId, reaction) {
  if (messages.has(messageId)) {
    messages.get(messageId).reaction = reaction;
    const msgDiv = messagesDiv.querySelector(`[data-message-id="${messageId}"]`);
    if (msgDiv) {
      let reactionDiv = msgDiv.querySelector('.reaction');
      if (!reactionDiv) {
        reactionDiv = document.createElement('div');
        reactionDiv.className = 'reaction';
        msgDiv.insertBefore(reactionDiv, msgDiv.querySelector('.message-actions'));
      }
      reactionDiv.textContent = reaction;
    }
  }
}

// Display info status
function setInfo(text, isError = false) {
  infoDiv.textContent = text;
  infoDiv.style.color = isError ? '#D32F2F' : 'var(--primary-color)';
}

// Create peer connection
function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(config);

    pc.onicecandidate = e => {
      if (e.candidate === null) {
        localSDPTextarea.value = JSON.stringify(pc.localDescription);
        setInfo('ICE gathering complete. Copy your SDP and share with peer.');
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setInfo('Peer connected! Chat enabled.');
        chatPanel.hidden = false;
        createOfferBtn.disabled = true;
        acceptOfferBtn.disabled = true;
        remoteSDPTextarea.disabled = true;
        localSDPTextarea.disabled = true;
      } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        setInfo('Peer disconnected or connection closed. Refresh to reconnect.', true);
        chatPanel.hidden = true;
        createOfferBtn.disabled = false;
        acceptOfferBtn.disabled = false;
        remoteSDPTextarea.disabled = false;
        localSDPTextarea.disabled = false;
        sendBtn.disabled = true;
        messageInput.disabled = true;
        fileInput.disabled = true;
      }
    };

    if (!isOfferer) {
      pc.ondatachannel = e => {
        dc = e.channel;
        setupDataChannel();
      };
    }
  } catch (err) {
    setInfo('Error creating peer connection: ' + err.message, true);
  }
}

// Setup data channel
function setupDataChannel() {
  dc.onopen = () => {
    setInfo('Data channel open. You can chat now!');
    sendBtn.disabled = false;
    messageInput.disabled = false;
    fileInput.disabled = false;
    messageInput.focus();
    dc.send(JSON.stringify({ type: 'intro', userName }));
  };

  dc.onclose = () => {
    setInfo('Data channel closed.', true);
    sendBtn.disabled = true;
    messageInput.disabled = true;
    fileInput.disabled = true;
  };

  dc.onerror = err => {
    console.error('Data channel error:', err);
    setInfo('Data channel error occurred.', true);
  };

  dc.onmessage = async e => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'intro' && data.userName) {
        peerName = data.userName;
        const chatPeerName = document.getElementById('chatPeerName');
        if (chatPeerName) chatPeerName.textContent = peerName;
        return;
      }
      
      const messageId = data.messageId || generateMessageId();
      
      if (data.type === 'media') {
        appendMessage(data.name, false, true, data.mediaType, data.data, messageId, 'seen', data.replyTo, data.reaction);
        dc.send(JSON.stringify({ type: 'ack', messageId, status: 'seen' }));
      } else if (data.type === 'text') {
        appendMessage(data.text, false, false, '', '', messageId, 'seen', data.replyTo, data.reaction);
        dc.send(JSON.stringify({ type: 'ack', messageId, status: 'seen' }));
      } else if (data.type === 'ack') {
        updateMessageStatus(data.messageId, data.status);
        if (data.status === 'seen' && Math.random() < 0.5) {
          dc.send(JSON.stringify({ type: 'ack', messageId: data.messageId, status: 'read' }));
          updateMessageStatus(data.messageId, 'read');
        }
      } else if (data.type === 'edit') {
        editMessage(data.messageId, data.text);
      } else if (data.type === 'react') {
        addReaction(data.messageId, data.reaction);
      } else if (data.type === 'typing') {
        handleTypingIndicator(data.typing);
      } else if (data.type === 'delete') {
        deleteMessage(data.messageId);
      }
    } catch (err) {
      appendMessage(e.data, false);
    }
  };
}

function handleTypingIndicator(isTyping) {
  if (isTyping) {
    typingIndicator.textContent = `${peerName} is typing...`;
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => typingIndicator.textContent = '', 2000);
  } else {
    typingIndicator.textContent = '';
  }
}

function deleteMessage(messageId) {
  messages.delete(messageId);
  const toDelete = messagesDiv.querySelector(`[data-message-id="${messageId}"]`);
  if (toDelete) toDelete.remove();
}

// Handle Create Offer
async function handleCreateOffer() {
  try {
    isOfferer = true;
    createPeerConnection();
    dc = pc.createDataChannel('chat');
    setupDataChannel();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    setInfo('Offer created. Waiting for remote SDP...');
    localSDPTextarea.value = JSON.stringify(pc.localDescription);
  } catch (err) {
    setInfo('Error creating offer: ' + err.message, true);
  }
}

// Handle Accept Remote SDP
async function handleAcceptOffer() {
  if (!remoteSDPTextarea.value) {
    setInfo('Paste remote SDP before accepting!', true);
    return;
  }
  try {
    const remoteDesc = JSON.parse(remoteSDPTextarea.value);
    if (!pc) createPeerConnection();
    await pc.setRemoteDescription(remoteDesc);
    if (remoteDesc.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      setInfo('Answer created. Share Local SDP with your peer.');
      localSDPTextarea.value = JSON.stringify(pc.localDescription);
    } else {
      setInfo('Remote SDP set. If you are offerer, share your SDP now.');
    }
  } catch (err) {
    setInfo('Error accepting SDP: ' + err.message, true);
  }
}

// Helper to read file as base64
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Problem reading file'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// Handle message sending
function handleSendMessage(e) {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (message && dc && dc.readyState === 'open') {
    const messageId = generateMessageId();
    const data = JSON.stringify({ 
      type: 'text', 
      text: message, 
      messageId, 
      replyTo: replyToMessageId 
    });
    try {
      dc.send(data);
      appendMessage(message, true, false, '', '', messageId, 'delivered', replyToMessageId);
      messageInput.value = '';
      replyToMessageId = null;
      messageInput.placeholder = 'Type a message';
      sendBtn.disabled = true;
    } catch (err) {
      setInfo('Error sending message: ' + err.message, true);
    }
  }
}

// Handle file sending
async function handleFileSend(e) {
  if (!dc || dc.readyState !== 'open') {
    setInfo('Data channel not open. Cannot send files.', true);
    fileInput.value = '';
    return;
  }
  
  const files = e.target.files;
  for (const file of files) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
      alert('Only images, videos, and audio files are allowed.');
      continue;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds 10MB limit.');
      continue;
    }
    try {
      const base64Data = await readFileAsBase64(file);
      const messageId = generateMessageId();
      const data = { 
        type: 'media', 
        name: file.name, 
        mediaType: file.type, 
        data: base64Data, 
        messageId,
        replyTo: replyToMessageId
      };
      dc.send(JSON.stringify(data));
      appendMessage(file.name, true, true, file.type, base64Data, messageId, 'delivered', replyToMessageId);
      replyToMessageId = null;
      messageInput.placeholder = 'Type a message';
    } catch (err) {
      alert('Failed to send file: ' + err.message);
    }
  }
  fileInput.value = '';
}

// Handle message actions
function handleMessageActions(e) {
  const btn = e.target.closest('.message-actions button');
  if (!btn) return;
  
  const msgDiv = btn.closest('.message');
  const messageId = msgDiv.dataset.messageId;
  const message = messages.get(messageId);

  try {
    if (btn.classList.contains('reply-btn')) {
      replyToMessageId = messageId;
      messageInput.placeholder = `Replying to: ${message.text || 'Media'}`;
      messageInput.focus();
    } else if (btn.classList.contains('react-btn')) {
      showReactionPicker(btn, messageId);
    } else if (btn.classList.contains('star-btn')) {
      toggleStarMessage(btn, messageId, msgDiv);
    } else if (btn.classList.contains('pin-btn')) {
      togglePinMessage(btn, messageId, msgDiv);
    } else if (btn.classList.contains('copy-btn')) {
      navigator.clipboard.writeText(message.text || message.name || '')
        .then(() => setInfo('Message copied to clipboard.'))
        .catch(() => setInfo('Failed to copy message.', true));
    } else if (btn.classList.contains('delete-me-btn')) {
      deleteMessage(messageId);
    } else if (btn.classList.contains('delete-everyone-btn') && message.fromMe && dc && dc.readyState === 'open') {
      dc.send(JSON.stringify({ type: 'delete', messageId }));
      deleteMessage(messageId);
    } else if (btn.classList.contains('edit-btn') && message.fromMe) {
      const newText = prompt('Edit message:', message.text);
      if (newText && dc && dc.readyState === 'open') {
        dc.send(JSON.stringify({ type: 'edit', messageId, text: newText }));
        editMessage(messageId, newText);
      }
    }
  } catch (err) {
    console.error('Error handling message action:', err);
  }
}

function showReactionPicker(btn, messageId) {
  const picker = document.createElement('div');
  picker.style.position = 'absolute';
  picker.style.background = '#fff';
  picker.style.border = '1px solid #ccc';
  picker.style.borderRadius = '8px';
  picker.style.padding = '5px';
  picker.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
  picker.style.zIndex = '1000';
  picker.style.display = 'flex';
  picker.style.gap = '5px';

  const emojis = ["👍", "❤️", "😂", "😮", "🙏", "👏"];
  emojis.forEach(emoji => {
    const btn = document.createElement('button');
    btn.textContent = emoji;
    btn.style.fontSize = '1.2rem';
    btn.style.border = 'none';
    btn.style.background = 'none';
    btn.style.cursor = 'pointer';
    btn.onclick = () => {
      dc.send(JSON.stringify({ type: 'react', messageId, reaction: emoji }));
      addReaction(messageId, emoji);
      document.body.removeChild(picker);
    };
    picker.appendChild(btn);
  });

  const plusBtn = document.createElement('button');
  plusBtn.textContent = "+";
  plusBtn.title = "Custom emoji";
  plusBtn.style.fontSize = '1.2rem';
  plusBtn.style.border = 'none';
  plusBtn.style.background = 'none';
  plusBtn.style.cursor = 'pointer';
  plusBtn.onclick = () => {
    const custom = prompt('Enter emoji or UTF-8 character:');
    if (custom) {
      dc.send(JSON.stringify({ type: 'react', messageId, reaction: custom }));
      addReaction(messageId, custom);
    }
    document.body.removeChild(picker);
  };
  picker.appendChild(plusBtn);

  document.body.appendChild(picker);
  const rect = btn.getBoundingClientRect();
  picker.style.top = `${rect.bottom + window.scrollY}px`;
  picker.style.left = `${rect.left + window.scrollX}px`;

  const removePicker = e => {
    if (!picker.contains(e.target)) {
      picker.remove();
      document.removeEventListener('click', removePicker);
    }
  };
  setTimeout(() => document.addEventListener('click', removePicker), 100);
}

function toggleStarMessage(btn, messageId, msgDiv) {
  if (starredMessages.has(messageId)) {
    starredMessages.delete(messageId);
    msgDiv.classList.remove('starred');
    btn.querySelector('i').classList.replace('fas', 'far');
    btn.title = 'Star';
  } else {
    starredMessages.add(messageId);
    msgDiv.classList.add('starred');
    btn.querySelector('i').classList.replace('far', 'fas');
    btn.title = 'Unstar';
  }
}

function togglePinMessage(btn, messageId, msgDiv) {
  if (pinnedMessages.has(messageId)) {
    pinnedMessages.delete(messageId);
    msgDiv.classList.remove('pinned');
    btn.title = 'Pin';
    pinnedBanner.style.display = 'none';
  } else {
    // Clear previous pin
    pinnedMessages.clear();
    document.querySelectorAll('.message.pinned').forEach(el => {
      el.classList.remove('pinned');
      const pinBtn = el.querySelector('.pin-btn');
      if (pinBtn) pinBtn.title = 'Pin';
    });
    
    // Set new pin
    pinnedMessages.add(messageId);
    msgDiv.classList.add('pinned');
    btn.title = 'Unpin';
    
    // Update pinned banner
    const message = messages.get(messageId);
    pinnedText.textContent = message.text || message.name || 'Pinned content';
    pinnedBanner.style.display = 'block';
  }
}

// Emoji picker
const emojiList = [
  "😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","😘","🥰",
  "😗","😙","😚","🙂","🤗","🤩","🤔","🤨","😐","😑","😶","🙄","😏","😣","😥",
  "😮","🤐","😯","😪","😫","🥱","😴","😌","😛","😜","😝","🤤","😒","😓","😔",
  "😕","🙃","🤑","😲","☹️","🙁","😖","😞","😟","😤","😢","😭","😦","😧","😨",
  "😩","🤯","😬","😰","😱","🥵","🥶","😳","🤪","😵","😡","😠","🤬","😷","🤒",
  "🤕","🤢","🤮","🥴","😇","🥳"
];

let emojiPicker = null;

function showEmojiPicker() {
  if (emojiPicker) {
    emojiPicker.style.display = 'block';
    return;
  }

  emojiPicker = document.createElement('div');
  emojiPicker.id = 'emojiPicker';
  emojiPicker.style.position = 'absolute';
  emojiPicker.style.bottom = '60px';
  emojiPicker.style.left = '40px';
  emojiPicker.style.background = '#fff';
  emojiPicker.style.border = '1px solid #ccc';
  emojiPicker.style.borderRadius = '8px';
  emojiPicker.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
  emojiPicker.style.padding = '8px';
  emojiPicker.style.zIndex = '1000';
  emojiPicker.style.display = 'flex';
  emojiPicker.style.flexWrap = 'wrap';
  emojiPicker.style.maxWidth = '320px';
  emojiPicker.style.maxHeight = '180px';
  emojiPicker.style.overflowY = 'auto';

  emojiList.forEach(emoji => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = emoji;
    btn.style.fontSize = '1.3rem';
    btn.style.margin = '2px';
    btn.style.background = 'none';
    btn.style.border = 'none';
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', () => {
      messageInput.value += emoji;
      messageInput.focus();
      sendBtn.disabled = messageInput.value.trim().length === 0;
      emojiPicker.style.display = 'none';
    });
    emojiPicker.appendChild(btn);
  });

  document.body.appendChild(emojiPicker);

  document.addEventListener('mousedown', function hidePicker(e) {
    if (emojiPicker && !emojiPicker.contains(e.target) && e.target !== emojiBtn) {
      emojiPicker.style.display = 'none';
    }
  });
}

// User name functions
function promptForName() {
  userName = prompt('Enter your name:', userName || '');
  if (!userName) userName = 'You';
  localStorage.setItem('wa_user_name', userName);
  if (userNameDisplay) userNameDisplay.textContent = userName;
}

function changeUserName() {
  const newName = prompt('Enter your new name:', userName);
  if (newName && newName.trim()) {
    userName = newName.trim();
    localStorage.setItem('wa_user_name', userName);
    if (userNameDisplay) userNameDisplay.textContent = userName;
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify({ type: 'intro', userName }));
    }
  }
}

// Dark mode functions
function loadDarkModePreference() {
  if (localStorage.getItem('wa_dark_mode') === 'true') {
    document.body.classList.add('dark-mode');
    if (darkModeToggle) darkModeToggle.querySelector('i').classList.replace('fa-moon', 'fa-sun');
  }
}

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('wa_dark_mode', isDark);
  if (darkModeToggle) {
    darkModeToggle.querySelector('i').classList.toggle('fa-moon', !isDark);
    darkModeToggle.querySelector('i').classList.toggle('fa-sun', isDark);
  }
}

// Setup event listeners
function setupEventListeners() {
  createOfferBtn.addEventListener('click', handleCreateOffer);
  acceptOfferBtn.addEventListener('click', handleAcceptOffer);
  chatForm.addEventListener('submit', handleSendMessage);
  fileInput.addEventListener('change', handleFileSend);
  messagesDiv.addEventListener('click', handleMessageActions);
  
  messageInput.addEventListener('input', () => {
    sendBtn.disabled = messageInput.value.trim().length === 0;
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify({ type: 'typing', typing: messageInput.value.length > 0 }));
    }
  });

  messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!sendBtn.disabled) {
        sendBtn.click();
      }
    }
  });

  if (copySDPBtn) {
    copySDPBtn.addEventListener('click', () => {
      if (localSDPTextarea.value) {
        navigator.clipboard.writeText(localSDPTextarea.value)
          .then(() => setInfo('SDP copied!'))
          .catch(() => setInfo('Failed to copy SDP.', true));
      }
    });
  }

  if (pasteSDPBtn) {
    pasteSDPBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          remoteSDPTextarea.value = text;
          setInfo('SDP pasted from clipboard.');
        }
      } catch {
        setInfo('Failed to paste SDP.', true);
      }
    });
  }

  if (emojiBtn) {
    emojiBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showEmojiPicker();
    });
  }

  if (darkModeToggle) {
    darkModeToggle.addEventListener('click', toggleDarkMode);
  }

  if (changeNameBtn) {
    changeNameBtn.addEventListener('click', changeUserName);
  }

  if (unpinBtn) {
    unpinBtn.addEventListener('click', () => {
      pinnedMessages.clear();
      document.querySelectorAll('.message.pinned').forEach(el => el.classList.remove('pinned'));
      pinnedBanner.style.display = 'none';
    });
  }
}

// Initialize the application
init();