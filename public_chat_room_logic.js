/**
 * @file public_chat_room_logic.js
 * @description Client-side logic for the public chat room page (public_chat_room.html).
 * Handles real-time public messaging, displaying online users, and user interactions within the room.
 */

import { currentUser, showCustomAlert, showCustomConfirm, db, auth, isAuthReady, socket } from './main.js';
import {
    doc, getDoc, collection, query, where, getDocs, addDoc, setDoc, updateDoc, onSnapshot, orderBy, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// --- DOM Elements ---
const logoutBtn = document.getElementById('logout-btn');
const roomNameDisplay = document.getElementById('room-name');
const roomSettingsBtn = document.getElementById('room-settings-btn');
const chatMessagesDisplay = document.getElementById('chat-messages-display');
const messageInput = document.getElementById('message-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const typingIndicator = document.getElementById('typing-indicator');

const usersListDiv = document.getElementById('users-list');

const emojiBtn = document.getElementById('emoji-btn');
const attachBtn = document.getElementById('attach-btn');
const voiceBtn = document.getElementById('voice-btn');

// --- Global State for Public Chat Room ---
let currentRoomId = 'public_chat_room'; // Default to public room
let publicChatMessagesUnsubscribe = null; // Stores the Firestore unsubscribe function for messages
let roomUsersUnsubscribe = null; // Stores the Firestore unsubscribe for room users

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
        console.log('User not authenticated in public_chat_room.html, redirecting to auth.html...');
        window.location.href = '/auth.html';
    }
}

/**
 * Renders a single user item in the online users list.
 * @param {Object} user - User object { userId, username, avatar, isOnline }
 * @returns {HTMLElement} - The created user item element.
 */
function createUserItem(user) {
    const userItem = document.createElement('div');
    userItem.className = `user-item ${user.isOnline ? 'online' : 'offline'}`;
    userItem.dataset.userId = user.userId;
    userItem.innerHTML = `
        <img src="${user.avatar}" alt="${user.username} Avatar">
        <div class="user-info">
            <span class="username">${user.username}</span>
            <span class="user-status">
                <span class="status-dot"></span> <span class="status-text">${user.isOnline ? 'متصل' : 'غير متصل'}</span>
            </span>
        </div>
        <div class="action-buttons">
            <button class="profile-btn" title="عرض الملف الشخصي"><i class="fas fa-user"></i></button>
            <button class="add-friend-btn" title="إضافة صديق"><i class="fas fa-user-plus"></i></button>
        </div>
    `;
    // Add event listeners for buttons
    userItem.querySelector('.profile-btn').addEventListener('click', () => viewUserProfile(user.userId));
    userItem.querySelector('.add-friend-btn').addEventListener('click', () => sendFriendRequest(user.userId, user.username, user.avatar));

    // Make the whole item clickable to start private chat
    userItem.addEventListener('click', (e) => {
        // Prevent button clicks from triggering private chat
        if (!e.target.closest('.action-buttons button')) {
            // Redirect to private chat page with partnerId
            window.location.href = `/private_chat.html?partnerId=${user.userId}`;
        }
    });

    return userItem;
}

/**
 * Renders the list of online users in the room.
 * @param {Array} users - Array of user objects.
 */
function renderUsersList(users) {
    usersListDiv.innerHTML = ''; // Clear existing list
    // Sort by online status first, then alphabetically by username
    users.sort((a, b) => {
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return a.username.localeCompare(b.username);
    });
    users.forEach(user => {
        // Don't display current user in the list
        if (user.userId !== currentUser.id) {
            usersListDiv.appendChild(createUserItem(user));
        }
    });
}

/**
 * Displays a single chat message.
 * @param {Object} message - Message object { senderId, senderUsername, senderAvatar, text, timestamp }.
 */
function displayMessage(message) {
    const messageItem = document.createElement('div');
    messageItem.className = `chat-message-item ${message.senderId === currentUser.id ? 'sent' : 'received'}`;

    const userAvatar = document.createElement('img');
    userAvatar.className = 'user-avatar';
    userAvatar.src = message.senderId === currentUser.id ? currentUser.avatar : message.senderAvatar || 'https://placehold.co/48x48/cccccc/333333?text=U';
    userAvatar.alt = `${message.senderUsername} Avatar`;

    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';
    messageBubble.textContent = message.text;

    const timestampSpan = document.createElement('div');
    timestampSpan.className = 'timestamp';
    const date = new Date(message.timestamp);
    timestampSpan.textContent = `${message.senderUsername} - ${date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`;

    messageBubble.appendChild(timestampSpan);
    messageItem.appendChild(userAvatar);
    messageItem.appendChild(messageBubble);
    chatMessagesDisplay.appendChild(messageItem);
}

/**
 * Sends a public chat message to the current room.
 */
async function sendPublicMessage() {
    const messageText = messageInput.value.trim();
    if (!messageText) {
        showCustomAlert('الرجاء كتابة رسالة.', 'warning');
        return;
    }

    try {
        const messagesRef = collection(db, 'public_rooms', currentRoomId, 'messages');
        await addDoc(messagesRef, {
            senderId: currentUser.id,
            senderUsername: currentUser.username,
            senderAvatar: currentUser.avatar,
            text: messageText,
            timestamp: Date.now()
        });
        messageInput.value = ''; // Clear input
        // Message will be displayed via the onSnapshot listener
    } catch (error) {
        console.error('Error sending public message:', error);
        showCustomAlert('فشل إرسال الرسالة العامة. يرجى المحاولة مرة أخرى.', 'error');
    }
}

/**
 * Sends a friend request.
 * @param {string} targetUserId - The ID of the user to send a request to.
 * @param {string} targetUsername - The username of the user to send a request to.
 * @param {string} targetAvatar - The avatar of the user to send a request to.
 */
async function sendFriendRequest(targetUserId, targetUsername, targetAvatar) {
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
            const acceptPrompt = await showCustomConfirm(`لديك طلب صداقة معلق من ${targetUsername}. هل تريد قبوله الآن؟`, 'confirm');
            if (acceptPrompt) {
                const requestDoc = receivedRequestSnapshot.docs[0];
                await acceptFriendRequest(requestDoc.id, targetUserId, targetUsername, targetAvatar);
            }
            return;
        }

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
            receiverUsername: targetUsername,
            receiverAvatar: targetAvatar,
            timestamp: Date.now()
        });

        showCustomAlert(`تم إرسال طلب الصداقة إلى ${targetUsername}!`, 'success');
    } catch (error) {
        console.error('Error sending friend request:', error);
        showCustomAlert('فشل إرسال طلب الصداقة. يرجى المحاولة مرة أخرى.', 'error');
    }
}

/**
 * Views a user's profile (redirects to private chat with them for now).
 * @param {string} userId - The ID of the user to view profile.
 */
function viewUserProfile(userId) {
    // For now, clicking "view profile" will take you to a private chat with them.
    // In a more complex app, this would open a dedicated profile modal/page.
    window.location.href = `/private_chat.html?partnerId=${userId}`;
}


// --- Event Listeners ---
logoutBtn.addEventListener('click', async () => {
    try {
        // Update user's online status to false in Firestore
        if (currentUser.id) {
            const userDocRef = doc(db, 'users', currentUser.id);
            await updateDoc(userDocRef, {
                isOnline: false,
                lastActive: Date.now()
            });
            console.log('User status updated to offline.');
        }
        await signOut(auth);
        showCustomAlert('تم تسجيل الخروج بنجاح. يتم التوجيه...', 'success');
        // Redirection to auth.html is handled by onAuthStateChanged in main.js
    } catch (error) {
        console.error('Logout error:', error);
        showCustomAlert('فشل تسجيل الخروج. يرجى المحاولة مرة أخرى.', 'error');
    }
});

sendMessageBtn.addEventListener('click', sendPublicMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendPublicMessage();
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

roomSettingsBtn.addEventListener('click', () => showCustomAlert('إعدادات الغرفة قيد التطوير!', 'info'));
emojiBtn.addEventListener('click', () => showCustomAlert('وظيفة الرموز التعبيرية قيد التطوير!', 'info'));
attachBtn.addEventListener('click', () => showCustomAlert('وظيفة إرفاق الملفات قيد التطوير!', 'info'));
voiceBtn.addEventListener('click', () => showCustomAlert('وظيفة الرسائل الصوتية قيد التطوير!', 'info'));


// --- Firestore Listeners (for real-time updates) ---
async function setupFirestoreListeners() {
    await ensureAuthReady();
    if (!currentUser.id) return;

    // Get room ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('roomId');
    if (roomIdFromUrl) {
        currentRoomId = roomIdFromUrl;
        roomNameDisplay.textContent = `الغرفة: ${roomIdFromUrl.replace(/_/g, ' ')}`; // Display formatted room name
    } else {
        roomNameDisplay.textContent = 'الغرفة العامة (افتراضية)';
    }

    // Listen for public messages in the current room
    const messagesRef = collection(db, 'public_rooms', currentRoomId, 'messages');
    const messagesQuery = query(messagesRef, orderBy('timestamp', 'asc'), limit(50)); // Limit to last 50 messages

    publicChatMessagesUnsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const message = change.doc.data();
            if (change.type === 'added') {
                displayMessage(message);
            }
        });
        chatMessagesDisplay.scrollTop = chatMessagesDisplay.scrollHeight; // Auto-scroll
    }, (error) => {
        console.error('Error listening to public messages:', error);
        showCustomAlert('خطأ في تحميل رسائل الغرفة العامة.', 'error');
    });

    // Listen for online users in the room
    // This assumes users' online status is updated in the 'users' collection.
    // A more robust solution for "users in room" might involve a subcollection
    // within the room itself, but for simplicity, we'll monitor global online status.
    const usersRef = collection(db, 'users');
    roomUsersUnsubscribe = onSnapshot(usersRef, (snapshot) => {
        const users = [];
        snapshot.forEach(doc => {
            const userData = doc.data();
            // Filter users who are online and potentially in this room (conceptually)
            // For a real multi-room system, users would explicitly join/leave room subcollections.
            users.push(userData);
        });
        renderUsersList(users);
    }, (error) => {
        console.error('Error listening to room users:', error);
        showCustomAlert('خطأ في تحميل قائمة المستخدمين.', 'error');
    });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    await displayCurrentUserProfile(); // Ensure current user data is loaded
    await setupFirestoreListeners(); // Set up real-time listeners
});

// --- Clean up on page unload (important for Firestore listeners) ---
window.addEventListener('beforeunload', () => {
    if (publicChatMessagesUnsubscribe) {
        publicChatMessagesUnsubscribe();
        console.log('Firestore public chat messages listener unsubscribed.');
    }
    if (roomUsersUnsubscribe) {
        roomUsersUnsubscribe();
        console.log('Firestore room users listener unsubscribed.');
    }
});
