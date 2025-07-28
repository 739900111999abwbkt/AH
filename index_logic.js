/**
 * @file index_logic.js
 * @description Client-side logic for the main lobby page (index.html).
 * Handles displaying current user profile, room selection, and navigation.
 */

import { currentUser, showCustomAlert, auth, db, isAuthReady } from './main.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// --- DOM Elements ---
const logoutBtn = document.getElementById('logout-btn');
const roomCards = document.querySelectorAll('.room-card'); // All room cards
const currentUserUsernameDisplay = document.getElementById('current-user-username');
const currentUserIdDisplay = document.getElementById('current-user-id');
const currentUserAvatarDisplay = document.getElementById('current-user-avatar');

// --- Utility Functions ---

/**
 * Displays current user profile information in the header.
 */
async function displayCurrentUserProfile() {
    // Ensure auth state is ready before trying to display user info
    await new Promise(resolve => {
        if (isAuthReady) {
            resolve();
        } else {
            const unsubscribe = auth.onAuthStateChanged(() => {
                unsubscribe();
                resolve();
            });
        }
    });

    if (currentUser.id) {
        currentUserUsernameDisplay.textContent = currentUser.username;
        currentUserIdDisplay.textContent = `ID: ${currentUser.id}`;
        currentUserAvatarDisplay.src = currentUser.avatar;
    } else {
        console.log('User not authenticated in index.html, redirecting to auth.html...');
        window.location.href = '/auth.html';
    }
}

/**
 * Handles room entry.
 * @param {string} roomId - The ID of the room to enter.
 */
function enterRoom(roomId) {
    // In a real application, you might check room availability or permissions here.
    // For now, we'll redirect to the public chat room if it's the public room.
    // For other rooms, we'll show an alert as they are placeholders.
    if (roomId === 'public_chat_room') {
        window.location.href = `/public_chat_room.html?roomId=${roomId}`;
    } else {
        showCustomAlert(`الغرفة "${roomId}" قيد الإنشاء حالياً. ترقبوا المزيد!`, 'info');
    }
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

// Add event listeners to all room cards
roomCards.forEach(card => {
    const roomId = card.dataset.roomId;
    const enterButton = card.querySelector('.enter-room-btn');
    
    // Only add click listener if the button is not disabled
    if (!enterButton.disabled) {
        enterButton.addEventListener('click', () => enterRoom(roomId));
        // Optionally, make the whole card clickable for enabled rooms
        card.addEventListener('click', (e) => {
            // Prevent button click from triggering card click twice
            if (!e.target.closest('.enter-room-btn')) {
                enterRoom(roomId);
            }
        });
    }
});


// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    await displayCurrentUserProfile(); // Ensure current user data is loaded
    // Any other initialization for the lobby page
});
