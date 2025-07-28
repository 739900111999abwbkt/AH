/**
 * @file private_chat_logic.js
 * @description Client-side logic for the private chat page.
 * Handles friend list display, friend requests, private messaging,
 * mic stage interactions, and AI features.
 * Enhanced for Crystal Communication Oasis: Stellar Edition UI.
 */

import { currentUser, showCustomAlert, showCustomConfirm, db, auth, isAuthReady, socket } from './main.js';
import {
    doc, getDoc, collection, query, where, getDocs, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, orderBy, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { GoogleGenerativeAI } from 'https://esm.run/@google/generative-ai';

// --- DOM Elements ---
const searchFriendInput = document.getElementById('search-friend-input');
const friendsListDiv = document.getElementById('friends-list');
const friendRequestsListDiv = document.getElementById('friend-requests-list');
const chatPartnerAvatar = document.getElementById('chat-partner-avatar');
const chatPartnerUsername = document.getElementById('chat-partner-username');
const chatPartnerStatus = document.getElementById('chat-partner-status');
const chatMessagesDisplay = document.getElementById('chat-messages-display');
const messageInput = document.getElementById('message-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const typingIndicator = document.getElementById('typing-indicator');

const micCirclesContainer = document.getElementById('mic-circles-container');
const requestMicBtn = document.getElementById('request-mic-btn');
const leaveMicBtn = document.getElementById('leave-mic-btn');
const toggleMuteBtn = document.getElementById('toggle-mute-btn'); // New mute button

const smartReplyBtn = document.getElementById('smart-reply-btn');
const creativeMessageBtn = document.getElementById('creative-message-btn');
const summarizeChatBtn = document.getElementById('summarize-chat-btn');
const translateMessageBtn = document.getElementById('translate-message-btn');

const emojiBtn = document.getElementById('emoji-btn');
const attachBtn = document.getElementById('attach-btn');
const voiceBtn = document.getElementById('voice-btn');

// --- Global State for Private Chat ---
let selectedFriendId = null;
let privateChatMessagesUnsubscribe = null; // Stores the Firestore unsubscribe function
let friendsListUnsubscribe = null; // Stores the Firestore unsubscribe for friends
let friendRequestsUnsubscribe = null; // Stores the Firestore unsubscribe for friend requests
let micStageUnsubscribe = null; // Stores the Firestore unsubscribe for mic stage
let isMuted = false; // Local state for user's mic mute status

const API_KEY = ""; // Gemini API Key (leave empty, Canvas will inject)
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// --- Utility Functions ---

/**
 * Ensures Firebase auth is ready before proceeding.
 */
async function ensureAuthReady() {
    return new Promise(resolve => {
        if (isAuthReady) {
            resolve();
        } else {
            const unsubscribe = auth.onAuthStateChanged(() => {
                unsubscribe();
                resolve();
            });
        }
    });
}

/**
 * Displays current user profile information in the header.
 */
async function displayCurrentUserProfile() {
    await ensureAuthReady();

    if (currentUser.id) {
        document.getElementById('current-user-username').textContent = currentUser.username;
        document.getElementById('current-user-id').textContent = `ID: ${currentUser.id}`;
        document.getElementById('current-user-avatar').src = currentUser.avatar;
        document.getElementById('my-chat-avatar').src = currentUser.avatar; // For sent messages
    } else {
        console.log('User not authenticated, redirecting to auth.html...');
        window.location.href = '/auth.html';
    }
}

/**
 * Renders a single friend item in the list.
 * @param {Object} friend - Friend object { userId, username, avatar, isOnline }
 * @returns {HTMLElement} - The created friend item element.
 */
function createFriendItem(friend) {
    const friendItem = document.createElement('div');
    friendItem.className = `friend-item ${friend.isOnline ? 'online' : 'offline'} ${selectedFriendId === friend.userId ? 'active' : ''}`;
    friendItem.dataset.friendId = friend.userId;
    friendItem.innerHTML = `
        <img src="${friend.avatar}" alt="${friend.username} Avatar">
        <div class="friend-info">
            <span class="friend-name">${friend.username}</span>
            <span class="friend-status">
                <span class="status-dot"></span> <span class="status-text">${friend.isOnline ? 'متصل' : 'غير متصل'}</span>
            </span>
        </div>
        <div class="action-buttons">
            <button class="remove-btn" title="إزالة صديق"><i class="fas fa-user-minus"></i></button>
            <button class="block-btn" title="حظر مستخدم"><i class="fas fa-ban"></i></button>
        </div>
    `;
    friendItem.addEventListener('click', (e) => {
        // Prevent button clicks from triggering friend selection
        if (!e.target.closest('.action-buttons button')) {
            selectFriend(friend.userId);
        }
    });
    friendItem.querySelector('.remove-btn').addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent selecting friend when clicking button
        removeFriend(friend.userId, friend.username);
    });
    friendItem.querySelector('.block-btn').addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent selecting friend when clicking button
        blockUser(friend.userId, friend.username);
    });
    return friendItem;
}

/**
 * Renders the list of friends.
 * @param {Array} friends - Array of friend objects.
 */
function renderFriendsList(friends) {
    friendsListDiv.innerHTML = ''; // Clear existing list
    // Sort by online status first, then alphabetically by username
    friends.sort((a, b) => {
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return a.username.localeCompare(b.username);
    });
    friends.forEach(friend => {
        friendsListDiv.appendChild(createFriendItem(friend));
    });
}

/**
 * Renders a single friend request item.
 * @param {Object} request - Request object { requestId, senderId, senderUsername, senderAvatar }
 * @returns {HTMLElement} - The created request item element.
 */
function createFriendRequestItem(request) {
    const requestItem = document.createElement('div');
    requestItem.className = 'request-item';
    requestItem.dataset.requestId = request.requestId;
    requestItem.innerHTML = `
        <img src="${request.senderAvatar}" alt="${request.senderUsername} Avatar">
        <div class="request-info">
            <span class="request-name">طلب من: ${request.senderUsername}</span>
        </div>
        <div class="request-actions">
            <button class="accept">قبول</button>
            <button class="reject">رفض</button>
        </div>
    `;
    requestItem.querySelector('.accept').addEventListener('click', () => acceptFriendRequest(request.requestId, request.senderId, request.senderUsername, request.senderAvatar));
    requestItem.querySelector('.reject').addEventListener('click', () => rejectFriendRequest(request.requestId));
    return requestItem;
}

/**
 * Renders the list of friend requests.
 * @param {Array} requests - Array of request objects.
 */
function renderFriendRequestsList(requests) {
    friendRequestsListDiv.innerHTML = '';
    if (requests.length === 0) {
        friendRequestsListDiv.innerHTML = '<p class="text-center text-gray-400 text-sm">لا توجد طلبات صداقة جديدة.</p>';
    } else {
        requests.forEach(request => {
            friendRequestsListDiv.appendChild(createFriendRequestItem(request));
        });
    }
}

/**
 * Selects a friend to chat with and loads their messages.
 * @param {string} friendId - The ID of the friend to select.
 */
async function selectFriend(friendId) {
    if (selectedFriendId === friendId) return; // Already selected

    // Remove 'active' class from previously selected friend
    if (selectedFriendId) {
        const prevSelected = document.querySelector(`.friend-item[data-friend-id="${selectedFriendId}"]`);
        if (prevSelected) prevSelected.classList.remove('active');
    }

    selectedFriendId = friendId;
    const newSelected = document.querySelector(`.friend-item[data-friend-id="${selectedFriendId}"]`);
    if (newSelected) newSelected.classList.add('active');

    chatMessagesDisplay.innerHTML = ''; // Clear previous messages
    chatMessagesDisplay.scrollTop = chatMessagesDisplay.scrollHeight; // Scroll to bottom

    // Load partner info
    try {
        const partnerDoc = await getDoc(doc(db, 'users', friendId));
        if (partnerDoc.exists()) {
            const partnerData = partnerDoc.data();
            chatPartnerAvatar.src = partnerData.avatar || 'https://placehold.co/70x70/cccccc/333333?text=P';
            chatPartnerUsername.textContent = partnerData.username || 'صديق مجهول';
            chatPartnerStatus.textContent = partnerData.isOnline ? 'متصل' : 'غير متصل';
            chatPartnerStatus.className = partnerData.isOnline ? 'text-green-400' : 'text-red-400';
            messageInput.disabled = false;
            sendMessageBtn.disabled = false;
        } else {
            console.warn('Chat partner not found in Firestore:', friendId);
            chatPartnerUsername.textContent = 'صديق غير موجود';
            chatPartnerStatus.textContent = 'غير متوفر';
            chatPartnerStatus.className = 'text-red-400';
            messageInput.disabled = true;
            sendMessageBtn.disabled = true;
            showCustomAlert('لم يتم العثور على معلومات الصديق.', 'error');
        }
    } catch (error) {
        console.error('Error loading chat partner info:', error);
        showCustomAlert('خطأ في تحميل معلومات الصديق.', 'error');
        messageInput.disabled = true;
        sendMessageBtn.disabled = true;
    }

    // Unsubscribe from previous chat listener if any
    if (privateChatMessagesUnsubscribe) {
        privateChatMessagesUnsubscribe();
    }

    // Set up new listener for private messages
    const chatCollectionId = [currentUser.id, selectedFriendId].sort().join('_'); // Consistent chat ID
    const messagesRef = collection(db, 'private_chats', chatCollectionId, 'messages');
    const messagesQuery = query(messagesRef, orderBy('timestamp', 'asc'), limit(50)); // Limit to last 50 messages

    privateChatMessagesUnsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const message = change.doc.data();
            if (change.type === 'added') {
                displayMessage(message);
            }
        });
        chatMessagesDisplay.scrollTop = chatMessagesDisplay.scrollHeight; // Auto-scroll
    }, (error) => {
        console.error('Error listening to private messages:', error);
        showCustomAlert('خطأ في تحميل رسائل الدردشة الخاصة.', 'error');
    });
}

/**
 * Displays a single chat message.
 * @param {Object} message - Message object { senderId, text, timestamp, read }.
 */
function displayMessage(message) {
    const messageItem = document.createElement('div');
    messageItem.className = `chat-message-item ${message.senderId === currentUser.id ? 'sent' : 'received'}`;

    const userAvatar = document.createElement('img');
    userAvatar.className = 'user-avatar';
    userAvatar.src = message.senderId === currentUser.id ? currentUser.avatar : chatPartnerAvatar.src; // Use current user's avatar for sent, partner's for received
    userAvatar.alt = `${message.senderId === currentUser.id ? currentUser.username : chatPartnerUsername.textContent} Avatar`;

    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';
    messageBubble.textContent = message.text;

    const timestampSpan = document.createElement('div');
    timestampSpan.className = 'timestamp';
    const date = new Date(message.timestamp);
    timestampSpan.textContent = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    // Add read receipt icon (simulated for now)
    const readReceiptIcon = document.createElement('i');
    readReceiptIcon.className = `fas ${message.read ? 'fa-check-double read' : 'fa-check'}`; // fa-check for sent, fa-check-double for delivered, colored for read
    readReceiptIcon.classList.add('read-receipt-icon');
    timestampSpan.appendChild(readReceiptIcon);

    messageBubble.appendChild(timestampSpan);
    messageItem.appendChild(userAvatar);
    messageItem.appendChild(messageBubble);
    chatMessagesDisplay.appendChild(messageItem);
}

/**
 * Sends a private chat message.
 */
async function sendPrivateMessage() {
    const messageText = messageInput.value.trim();
    if (!messageText || !selectedFriendId) {
        showCustomAlert('الرجاء كتابة رسالة واختيار صديق.', 'warning');
        return;
    }

    try {
        const chatCollectionId = [currentUser.id, selectedFriendId].sort().join('_');
        const messagesRef = collection(db, 'private_chats', chatCollectionId, 'messages');
        await addDoc(messagesRef, {
            senderId: currentUser.id,
            receiverId: selectedFriendId,
            text: messageText,
            timestamp: Date.now(),
            read: false // Initial state: not read
        });
        messageInput.value = ''; // Clear input
        // Message will be displayed via the onSnapshot listener
    } catch (error) {
        console.error('Error sending private message:', error);
        showCustomAlert('فشل إرسال الرسالة. يرجى المحاولة مرة أخرى.', 'error');
    }
}

/**
 * Sends a friend request.
 * @param {string} targetUserId - The ID of the user to send a request to.
 */
async function sendFriendRequest(targetUserId) {
    if (targetUserId === currentUser.id) {
        showCustomAlert('لا يمكنك إرسال طلب صداقة لنفسك.', 'warning');
        return;
    }

    try {
        // Check if already friends
        const friendsRef = collection(db, 'users', currentUser.id, 'friends');
        const friendQuery = query(friendsRef, where('userId', '==', targetUserId));
        const friendSnapshot = await getDocs(friendQuery);
        if (!friendSnapshot.empty) {
            showCustomAlert('أنتم أصدقاء بالفعل!', 'info');
            return;
        }

        // Check if request already sent
        const sentRequestsRef = collection(db, 'users', currentUser.id, 'sent_friend_requests');
        const sentRequestQuery = query(sentRequestsRef, where('receiverId', '==', targetUserId));
        const sentRequestSnapshot = await getDocs(sentRequestQuery);
        if (!sentRequestSnapshot.empty) {
            showCustomAlert('تم إرسال طلب الصداقة بالفعل.', 'info');
            return;
        }

        // Check if request already received from them
        const receivedRequestsRef = collection(db, 'users', currentUser.id, 'received_friend_requests');
        const receivedRequestQuery = query(receivedRequestsRef, where('senderId', '==', targetUserId));
        const receivedRequestSnapshot = await getDocs(receivedRequestQuery);
        if (!receivedRequestSnapshot.empty) {
            const acceptPrompt = await showCustomConfirm(`لديك طلب صداقة معلق من ${targetUserData.username}. هل تريد قبوله الآن؟`, 'confirm');
            if (acceptPrompt) {
                const requestDoc = receivedRequestSnapshot.docs[0];
                await acceptFriendRequest(requestDoc.id, targetUserId, targetUserData.username, targetUserData.avatar);
            }
            return;
        }

        // Get target user's info to store in request
        const targetUserDoc = await getDoc(doc(db, 'users', targetUserId));
        if (!targetUserDoc.exists()) {
            showCustomAlert('المستخدم غير موجود.', 'error');
            return;
        }
        const targetUserData = targetUserDoc.data();

        // Add request to receiver's received_friend_requests
        const newRequestRef = doc(collection(db, 'users', targetUserId, 'received_friend_requests'));
        await setDoc(newRequestRef, {
            requestId: newRequestRef.id,
            senderId: currentUser.id,
            senderUsername: currentUser.username,
            senderAvatar: currentUser.avatar,
            timestamp: Date.now()
        });

        // Add record to sender's sent_friend_requests
        await setDoc(doc(db, 'users', currentUser.id, 'sent_friend_requests', newRequestRef.id), {
            requestId: newRequestRef.id,
            receiverId: targetUserId,
            receiverUsername: targetUserData.username,
            receiverAvatar: targetUserData.avatar,
            timestamp: Date.now()
        });

        showCustomAlert('تم إرسال طلب الصداقة بنجاح!', 'success');
    } catch (error) {
        console.error('Error sending friend request:', error);
        showCustomAlert('فشل إرسال طلب الصداقة. يرجى المحاولة مرة أخرى.', 'error');
    }
}

/**
 * Accepts a friend request.
 * @param {string} requestId - The ID of the request to accept.
 * @param {string} senderId - The ID of the user who sent the request.
 * @param {string} senderUsername - The username of the sender.
 * @param {string} senderAvatar - The avatar of the sender.
 */
async function acceptFriendRequest(requestId, senderId, senderUsername, senderAvatar) {
    try {
        // Add sender to current user's friends list
        await setDoc(doc(db, 'users', currentUser.id, 'friends', senderId), {
            userId: senderId,
            username: senderUsername,
            avatar: senderAvatar,
            addedAt: Date.now()
        });

        // Add current user to sender's friends list
        await setDoc(doc(db, 'users', senderId, 'friends', currentUser.id), {
            userId: currentUser.id,
            username: currentUser.username,
            avatar: currentUser.avatar,
            addedAt: Date.now()
        });

        // Delete request from current user's received_friend_requests
        await deleteDoc(doc(db, 'users', currentUser.id, 'received_friend_requests', requestId));

        // Delete request from sender's sent_friend_requests (optional, but good for cleanup)
        // This part would ideally be handled by a server-side function for atomicity.
        // For client-side, we'd need to know the sender's requestId for this specific sent request.
        // For now, we'll rely on the sender's listener to update their UI.

        showCustomAlert(`تم قبول طلب الصداقة من ${senderUsername}!`, 'success');
    } catch (error) {
        console.error('Error accepting friend request:', error);
        showCustomAlert('فشل قبول طلب الصداقة. يرجى المحاولة مرة أخرى.', 'error');
    }
}

/**
 * Rejects a friend request.
 * @param {string} requestId - The ID of the request to reject.
 */
async function rejectFriendRequest(requestId) {
    try {
        // Delete request from current user's received_friend_requests
        await deleteDoc(doc(db, 'users', currentUser.id, 'received_friend_requests', requestId));
        showCustomAlert('تم رفض طلب الصداقة.', 'info');
    } catch (error) {
        console.error('Error rejecting friend request:', error);
        showCustomAlert('فشل رفض طلب الصداقة. يرجى المحاولة مرة أخرى.', 'error');
    }
}

/**
 * Removes a friend.
 * @param {string} friendId - The ID of the friend to remove.
 * @param {string} friendUsername - The username of the friend to remove.
 */
async function removeFriend(friendId, friendUsername) {
    const confirmRemove = await showCustomConfirm(`هل أنت متأكد أنك تريد إزالة ${friendUsername} من قائمة أصدقائك؟`, 'confirm');
    if (!confirmRemove) return;

    try {
        // Remove from current user's friends list
        await deleteDoc(doc(db, 'users', currentUser.id, 'friends', friendId));

        // Remove current user from friend's friends list
        await deleteDoc(doc(db, 'users', friendId, 'friends', currentUser.id));

        showCustomAlert(`${friendUsername} تمت إزالته من قائمة أصدقائك.`, 'success');
        if (selectedFriendId === friendId) {
            selectedFriendId = null; // Clear selected friend if it was the one removed
            chatPartnerUsername.textContent = 'اختر صديقًا للدردشة';
            chatPartnerStatus.textContent = 'غير متصل';
            chatPartnerAvatar.src = 'https://placehold.co/70x70/cccccc/333333?text=P';
            chatMessagesDisplay.innerHTML = '';
            messageInput.disabled = true;
            sendMessageBtn.disabled = true;
            if (privateChatMessagesUnsubscribe) privateChatMessagesUnsubscribe();
        }
    } catch (error) {
        console.error('Error removing friend:', error);
        showCustomAlert('فشل إزالة الصديق. يرجى المحاولة مرة أخرى.', 'error');
    }
}

/**
 * Blocks a user.
 * @param {string} userIdToBlock - The ID of the user to block.
 * @param {string} usernameToBlock - The username of the user to block.
 */
async function blockUser(userIdToBlock, usernameToBlock) {
    const confirmBlock = await showCustomConfirm(`هل أنت متأكد أنك تريد حظر ${usernameToBlock}؟ لن تتمكنوا من التواصل بعد الآن.`, 'confirm');
    if (!confirmBlock) return;

    try {
        // Add to current user's blocked list
        await setDoc(doc(db, 'users', currentUser.id, 'blocked_users', userIdToBlock), {
            userId: userIdToBlock,
            username: usernameToBlock,
            blockedAt: Date.now()
        });

        // Also remove from friends list if they were friends
        await deleteDoc(doc(db, 'users', currentUser.id, 'friends', userIdToBlock)).catch(e => console.log('Not in friends list to remove.'));
        await deleteDoc(doc(db, 'users', userIdToBlock, 'friends', currentUser.id)).catch(e => console.log('Not in their friends list to remove.'));

        showCustomAlert(`${usernameToBlock} تم حظره بنجاح.`, 'success');
        if (selectedFriendId === userIdToBlock) {
            selectedFriendId = null; // Clear selected friend if it was the one blocked
            chatPartnerUsername.textContent = 'اختر صديقًا للدردشة';
            chatPartnerStatus.textContent = 'غير متصل';
            chatPartnerAvatar.src = 'https://placehold.co/70x70/cccccc/333333?text=P';
            chatMessagesDisplay.innerHTML = '';
            messageInput.disabled = true;
            sendMessageBtn.disabled = true;
            if (privateChatMessagesUnsubscribe) privateChatMessagesUnsubscribe();
        }
    } catch (error) {
        console.error('Error blocking user:', error);
        showCustomAlert('فشل حظر المستخدم. يرجى المحاولة مرة أخرى.', 'error');
    }
}

/**
 * Handles mic request/leave/mute actions.
 * @param {string} action - 'request', 'leave', or 'toggleMute'.
 */
async function handleMicAction(action) {
    if (!currentUser.id) {
        showCustomAlert('يجب أن تكون مسجلاً لاستخدام المايك.', 'error');
        return;
    }

    try {
        const micStageRef = doc(db, 'mic_stage', 'current_stage');
        const micStageSnap = await getDoc(micStageRef);
        let micStageData = micStageSnap.exists() ? micStageSnap.data() : { mics: [null, null, null, null] };

        const currentMicIndex = micStageData.mics.findIndex(mic => mic && mic.userId === currentUser.id);

        if (action === 'request') {
            if (currentMicIndex !== -1) {
                showCustomAlert('أنت بالفعل على المايك!', 'info');
                return;
            }
            if (!currentUser.canMicAscent) {
                showCustomAlert('ليس لديك إذن للصعود إلى المايك حالياً.', 'warning');
                return;
            }

            const emptyMicIndex = micStageData.mics.findIndex(mic => !mic || !mic.userId);
            if (emptyMicIndex !== -1) {
                micStageData.mics[emptyMicIndex] = {
                    userId: currentUser.id,
                    username: currentUser.username,
                    avatar: currentUser.avatar,
                    isMuted: false, // Default to unmuted when joining
                    isSpeaking: false, // Initial speaking status
                    timestamp: Date.now()
                };
                await setDoc(micStageRef, micStageData, { merge: true });
                isMuted = false; // Update local state
                toggleMuteBtn.innerHTML = '<i class="fas fa-volume-mute"></i> كتم صوتي';
                showCustomAlert('صعدت إلى المايك بنجاح!', 'success');
            } else {
                showCustomAlert('لا توجد أماكن فارغة على المايك حالياً.', 'info');
            }
        } else if (action === 'leave') {
            if (currentMicIndex === -1) {
                showCustomAlert('أنت لست على المايك.', 'warning');
                return;
            }
            micStageData.mics[currentMicIndex] = null; // Clear the mic spot
            await setDoc(micStageRef, micStageData, { merge: true });
            isMuted = false; // Reset local state
            toggleMuteBtn.innerHTML = '<i class="fas fa-volume-mute"></i> كتم صوتي';
            showCustomAlert('غادرت المايك بنجاح.', 'info');
        } else if (action === 'toggleMute') {
            if (currentMicIndex === -1) {
                showCustomAlert('يجب أن تكون على المايك لكتم صوتك.', 'warning');
                return;
            }
            const newMuteStatus = !micStageData.mics[currentMicIndex].isMuted;
            micStageData.mics[currentMicIndex].isMuted = newMuteStatus;
            await setDoc(micStageRef, micStageData, { merge: true });
            isMuted = newMuteStatus; // Update local state
            toggleMuteBtn.innerHTML = newMuteStatus ? '<i class="fas fa-volume-up"></i> إلغاء كتم صوتي' : '<i class="fas fa-volume-mute"></i> كتم صوتي';
            showCustomAlert(newMuteStatus ? 'تم كتم صوتك.' : 'تم إلغاء كتم صوتك.', 'info');
        }
    } catch (error) {
        console.error('Error handling mic action:', error);
        showCustomAlert('فشل إجراء المايك. يرجى المحاولة مرة أخرى.', 'error');
    }
}

/**
 * Renders the mic circles on the stage.
 * @param {Array} mics - Array of mic objects.
 */
function renderMicCircles(mics) {
    micCirclesContainer.innerHTML = ''; // Clear existing
    const micCount = 4; // Assuming 4 mic spots
    for (let i = 0; i < micCount; i++) {
        const micData = mics[i];
        const micCircle = document.createElement('div');
        let micIconClass = 'fa-microphone';
        let micUsername = 'فارغ';
        let circleClasses = 'empty';

        if (micData && micData.userId) {
            micUsername = micData.username;
            circleClasses = 'on-stage';
            if (micData.userId === currentUser.id) {
                circleClasses += ' active'; // Current user's mic
                micIconClass = isMuted ? 'fa-microphone-slash' : 'fa-microphone'; // Reflect local mute state
            } else if (micData.isMuted) {
                micIconClass = 'fa-microphone-slash'; // Other user is muted
            } else {
                micIconClass = 'fa-microphone'; // Other user is unmuted
            }
            // Simulate speaking animation for active user (if not muted)
            if (micData.userId === currentUser.id && !isMuted && Math.random() > 0.7) { // Random simulation
                 // For a real app, this would be based on actual audio input
                circleClasses += ' speaking';
            }
        }

        micCircle.className = `mic-circle ${circleClasses}`;
        micCircle.dataset.micId = `mic${i + 1}`;
        micCircle.innerHTML = `
            <i class="fas ${micIconClass} mic-icon"></i>
            <span class="mic-username">${micUsername}</span>
        `;
        micCirclesContainer.appendChild(micCircle);
    }

    // Update mic control buttons state
    const onMic = mics.some(mic => mic && mic.userId === currentUser.id);
    requestMicBtn.disabled = onMic || !currentUser.canMicAscent;
    requestMicBtn.classList.toggle('disabled', onMic || !currentUser.canMicAscent);
    leaveMicBtn.disabled = !onMic;
    leaveMicBtn.classList.toggle('disabled', !onMic);
    toggleMuteBtn.disabled = !onMic;
    toggleMuteBtn.classList.toggle('disabled', !onMic);
}

/**
 * Calls Gemini API for smart replies.
 */
async function getSmartReplies(buttonElement) {
    buttonElement.classList.add('loading');
    buttonElement.disabled = true;

    try {
        const lastMessages = Array.from(chatMessagesDisplay.children)
            .slice(-5) // Get last 5 messages
            .map(msgDiv => {
                const isSent = msgDiv.classList.contains('sent');
                const text = msgDiv.querySelector('.message-bubble').firstChild.textContent.trim();
                return `${isSent ? 'أنا' : chatPartnerUsername.textContent}: ${text}`;
            }).join('\n');

        if (!lastMessages) {
            showCustomAlert('لا توجد رسائل سابقة لإنشاء ردود ذكية.', 'info');
            return;
        }

        const prompt = `بناءً على محادثة الدردشة التالية، اقترح 3 ردود قصيرة وذكية باللغة العربية. اجعل الردود متنوعة ومناسبة للسياق.
        المحادثة:
        ${lastMessages}
        الردود المقترحة:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        const replies = text.split('\n').filter(line => line.trim() !== '').map(line => line.replace(/^\d+\.\s*/, '').trim());

        if (replies.length > 0) {
            const selectedReply = await showCustomConfirm('اختر رداً ذكياً:', 'input', replies.join('\n'));
            if (selectedReply) {
                messageInput.value = selectedReply;
            }
        } else {
            showCustomAlert('لم يتمكن الذكاء الاصطناعي من إنشاء ردود ذكية.', 'info');
        }

    } catch (error) {
        console.error('Error generating smart replies:', error);
        showCustomAlert('فشل إنشاء الردود الذكية. يرجى المحاولة مرة أخرى.', 'error');
    } finally {
        buttonElement.classList.remove('loading');
        buttonElement.disabled = false;
    }
}

/**
 * Calls Gemini API for a creative message with mood selection.
 */
async function getCreativeMessage(buttonElement) {
    buttonElement.classList.add('loading');
    buttonElement.disabled = true;

    try {
        const promptText = await showCustomConfirm('اكتب موضوع الرسالة الإبداعية (مثال: رسالة تهنئة، دعابة، سؤال فلسفي):', 'input');
        if (!promptText) {
            buttonElement.classList.remove('loading');
            buttonElement.disabled = false;
            return;
        }

        const mood = await showCustomConfirm('اختر مزاج الرسالة (مثال: مرح، رسمي، شعري، غامض، عاطفي):', 'input');
        // If mood is empty, default to neutral/general creative
        const moodText = mood ? `بمزاج ${mood}` : '';

        const prompt = `اكتب رسالة إبداعية ومبتكرة باللغة العربية حول الموضوع التالي: "${promptText}" ${moodText}. اجعلها جذابة ومناسبة للدردشة.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        messageInput.value = text.trim();
        showCustomAlert('تم إنشاء رسالة إبداعية!', 'success');

    } catch (error) {
        console.error('Error generating creative message:', error);
        showCustomAlert('فشل إنشاء الرسالة الإبداعية. يرجى المحاولة مرة أخرى.', 'error');
    } finally {
        buttonElement.classList.remove('loading');
        buttonElement.disabled = false;
    }
}

/**
 * Calls Gemini API to summarize chat.
 */
async function summarizeChat(buttonElement) {
    buttonElement.classList.add('loading');
    buttonElement.disabled = true;

    try {
        const allMessages = Array.from(chatMessagesDisplay.children)
            .map(msgDiv => {
                const isSent = msgDiv.classList.contains('sent');
                const text = msgDiv.querySelector('.message-bubble').firstChild.textContent.trim();
                return `${isSent ? 'أنا' : chatPartnerUsername.textContent}: ${text}`;
            }).join('\n');

        if (allMessages.length < 50) { // Require a minimum length for summarization
            showCustomAlert('الدردشة قصيرة جداً للتلخيص.', 'info');
            return;
        }

        const prompt = `لخص محادثة الدردشة التالية باللغة العربية في فقرة قصيرة ومفيدة:
        ${allMessages}
        الملخص:`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        showCustomAlert(`ملخص الدردشة: ${text.trim()}`, 'info', 8000);

    } catch (error) {
        console.error('Error summarizing chat:', error);
        showCustomAlert('فشل تلخيص الدردشة. يرجى المحاولة مرة أخرى.', 'error');
    } finally {
        buttonElement.classList.remove('loading');
        buttonElement.disabled = false;
    }
}

/**
 * Calls Gemini API to translate a message.
 */
async function translateMessage(buttonElement) {
    buttonElement.classList.add('loading');
    buttonElement.disabled = true;

    try {
        const messageToTranslate = await showCustomConfirm('أدخل الرسالة التي تريد ترجمتها:', 'input');
        if (!messageToTranslate) {
            buttonElement.classList.remove('loading');
            buttonElement.disabled = false;
            return;
        }

        const targetLanguage = await showCustomConfirm('إلى أي لغة تريد الترجمة؟ (مثال: الإنجليزية، الفرنسية):', 'input');
        if (!targetLanguage) {
            buttonElement.classList.remove('loading');
            buttonElement.disabled = false;
            return;
        }

        const prompt = `ترجم النص التالي إلى اللغة ${targetLanguage}: "${messageToTranslate}"`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        showCustomAlert(`الترجمة: ${text.trim()}`, 'info', 5000);

    } catch (error) {
        console.error('Error translating message:', error);
        showCustomAlert('فشل الترجمة. يرجى المحاولة مرة أخرى.', 'error');
    } finally {
        buttonElement.classList.remove('loading');
        buttonElement.disabled = false;
    }
}


// --- Event Listeners ---
sendMessageBtn.addEventListener('click', sendPrivateMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendPrivateMessage();
    }
});

// Simulate typing indicator (needs backend for real implementation)
let typingTimeout;
messageInput.addEventListener('input', () => {
    // In a real app, emit 'typing' event to server
    typingIndicator.classList.add('show');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        typingIndicator.classList.remove('show');
        // In a real app, emit 'stopped typing' event to server
    }, 2000); // Hide after 2 seconds of no input
});

searchFriendInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const userIdToSearch = searchFriendInput.value.trim();
        if (userIdToSearch) {
            try {
                const userDoc = await getDoc(doc(db, 'users', userIdToSearch));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const confirmSend = await showCustomConfirm(`هل تريد إرسال طلب صداقة إلى ${userData.username} (${userData.userId})؟`, 'confirm');
                    if (confirmSend) {
                        await sendFriendRequest(userData.userId);
                    }
                } else {
                    showCustomAlert('لم يتم العثور على مستخدم بهذا المعرف.', 'info');
                }
            } catch (error) {
                console.error('Error searching user:', error);
                showCustomAlert('حدث خطأ أثناء البحث عن المستخدم.', 'error');
            }
        } else {
            showCustomAlert('الرجاء إدخال معرف المستخدم للبحث.', 'warning');
        }
    }
});

requestMicBtn.addEventListener('click', () => handleMicAction('request'));
leaveMicBtn.addEventListener('click', () => handleMicAction('leave'));
toggleMuteBtn.addEventListener('click', () => handleMicAction('toggleMute')); // New event listener

smartReplyBtn.addEventListener('click', () => getSmartReplies(smartReplyBtn));
creativeMessageBtn.addEventListener('click', () => getCreativeMessage(creativeMessageBtn));
summarizeChatBtn.addEventListener('click', () => summarizeChat(summarizeChatBtn));
translateMessageBtn.addEventListener('click', () => translateMessage(translateMessageBtn));

// Mock event listeners for new buttons
emojiBtn.addEventListener('click', () => showCustomAlert('وظيفة الرموز التعبيرية قيد التطوير!', 'info'));
attachBtn.addEventListener('click', () => showCustomAlert('وظيفة إرفاق الملفات قيد التطوير!', 'info'));
voiceBtn.addEventListener('click', () => showCustomAlert('وظيفة الرسائل الصوتية قيد التطوير!', 'info'));


// --- Firestore Listeners (for real-time updates) ---
async function setupFirestoreListeners() {
    await ensureAuthReady();
    if (!currentUser.id) return;

    // Listen for changes in current user's friends list
    const friendsRef = collection(db, 'users', currentUser.id, 'friends');
    friendsListUnsubscribe = onSnapshot(friendsRef, async (snapshot) => {
        const friends = [];
        for (const docChange of snapshot.docChanges()) {
            if (docChange.type === 'added' || docChange.type === 'modified') {
                const friendData = docChange.doc.data();
                // Fetch full friend profile to get isOnline status
                const friendProfileSnap = await getDoc(doc(db, 'users', friendData.userId));
                if (friendProfileSnap.exists()) {
                    const profileData = friendProfileSnap.data();
                    friends.push({
                        userId: profileData.userId,
                        username: profileData.username,
                        avatar: profileData.avatar,
                        isOnline: profileData.isOnline || false // Default to false if not present
                    });
                }
            } else if (docChange.type === 'removed') {
                // If a friend is removed, ensure they are deselected if currently chatting
                if (selectedFriendId === docChange.doc.id) {
                    selectedFriendId = null;
                    chatPartnerUsername.textContent = 'اختر صديقًا للدردشة';
                    chatPartnerStatus.textContent = 'غير متصل';
                    chatPartnerAvatar.src = 'https://placehold.co/70x70/cccccc/333333?text=P';
                    chatMessagesDisplay.innerHTML = '';
                    messageInput.disabled = true;
                    sendMessageBtn.disabled = true;
                    if (privateChatMessagesUnsubscribe) privateChatMessagesUnsubscribe();
                }
            }
        }
        renderFriendsList(friends);
    }, (error) => {
        console.error('Error listening to friends list:', error);
        showCustomAlert('خطأ في تحميل قائمة الأصدقاء.', 'error');
    });

    // Listen for changes in current user's friend requests
    const receivedRequestsRef = collection(db, 'users', currentUser.id, 'received_friend_requests');
    friendRequestsUnsubscribe = onSnapshot(receivedRequestsRef, (snapshot) => {
        const requests = [];
        snapshot.forEach(doc => {
            requests.push(doc.data());
        });
        renderFriendRequestsList(requests);
    }, (error) => {
        console.error('Error listening to friend requests:', error);
        showCustomAlert('خطأ في تحميل طلبات الصداقة.', 'error');
    });

    // Listen for changes on the mic stage
    const micStageRef = doc(db, 'mic_stage', 'current_stage');
    micStageUnsubscribe = onSnapshot(micStageRef, (docSnap) => {
        if (docSnap.exists()) {
            const micStageData = docSnap.data();
            // Ensure mics array is initialized and has 4 spots
            const mics = micStageData.mics || [null, null, null, null];
            while (mics.length < 4) mics.push(null); // Ensure 4 spots
            renderMicCircles(mics);
        } else {
            // Initialize mic stage if it doesn't exist
            setDoc(micStageRef, { mics: [null, null, null, null] });
            renderMicCircles([null, null, null, null]);
        }
    }, (error) => {
        console.error('Error listening to mic stage:', error);
        showCustomAlert('خطأ في تحميل حالة المايكات.', 'error');
    });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    await displayCurrentUserProfile(); // Ensure current user data is loaded
    await setupFirestoreListeners(); // Set up real-time listeners

    // Check for partnerId in URL (if redirected from public chat user profile)
    const urlParams = new URLSearchParams(window.location.search);
    const partnerIdFromUrl = urlParams.get('partnerId');
    if (partnerIdFromUrl) {
        // Find this user in friends list or fetch their profile to select them
        const friendDoc = await getDoc(doc(db, 'users', partnerIdFromUrl));
        if (friendDoc.exists()) {
            const friendData = friendDoc.data();
            selectFriend(friendData.userId);
        } else {
            showCustomAlert('لم يتم العثور على الصديق المحدد.', 'error');
        }
    }
});

// --- Clean up on page unload (important for Firestore listeners) ---
window.addEventListener('beforeunload', () => {
    if (privateChatMessagesUnsubscribe) {
        privateChatMessagesUnsubscribe();
        console.log('Firestore private chat messages listener unsubscribed.');
    }
    if (friendsListUnsubscribe) {
        friendsListUnsubscribe();
        console.log('Firestore friends list listener unsubscribed.');
    }
    if (friendRequestsUnsubscribe) {
        friendRequestsUnsubscribe();
        console.log('Firestore friend requests listener unsubscribed.');
    }
    if (micStageUnsubscribe) {
        micStageUnsubscribe();
        console.log('Firestore mic stage listener unsubscribed.');
    }
});
