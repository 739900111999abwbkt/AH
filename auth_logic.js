/**
 * @file auth_logic.js
 * @description Client-side logic for the authentication page (auth.html).
 * Handles user login, registration, password reset, and social logins using Firebase Authentication.
 * Integrates with Firestore for user profile management.
 */

import { auth, db, showCustomAlert, showCustomConfirm } from './main.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    FacebookAuthProvider,
    signInWithPopup,
    updateProfile,
    signInAnonymously // Added for anonymous sign-in if needed
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// --- DOM Elements ---
const loginTab = document.getElementById('login-tab');
const registerTab = document.getElementById('register-tab');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const loginBtn = document.getElementById('login-btn');
const forgotPasswordLink = document.getElementById('forgot-password-link');

const registerUsernameInput = document.getElementById('register-username');
const registerEmailInput = document.getElementById('register-email');
const registerPasswordInput = document.getElementById('register-password');
const registerConfirmPasswordInput = document.getElementById('register-confirm-password');
const registerBtn = document.getElementById('register-btn');

const googleSignInBtn = document.querySelector('.social-button.google');
const facebookSignInBtn = document.querySelector('.social-button.facebook');
const appleSignInBtn = document.querySelector('.social-button.apple'); // Placeholder for Apple


// --- Form Toggle Logic ---
/**
 * Toggles between login and registration forms.
 * @param {string} formToShow - 'login' or 'register'.
 */
function toggleForms(formToShow) {
    if (formToShow === 'login') {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        loginTab.classList.add('active');
        registerTab.classList.remove('active');
    } else {
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
        registerTab.classList.add('active');
        loginTab.classList.remove('active');
    }
}

// --- Authentication Functions ---

/**
 * Handles user login with email and password.
 * @param {Event} e - The form submission event.
 */
async function handleLogin(e) {
    e.preventDefault();
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value.trim();

    if (!email || !password) {
        showCustomAlert('الرجاء إدخال البريد الإلكتروني وكلمة المرور.', 'warning');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.classList.add('loading');

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log('User logged in:', userCredential.user.uid);
        showCustomAlert('تم تسجيل الدخول بنجاح! يتم التوجيه...', 'success');
        // Redirection to index.html is handled by onAuthStateChanged in main.js
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'فشل تسجيل الدخول. يرجى التحقق من بيانات الاعتماد.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'صيغة البريد الإلكتروني غير صحيحة.';
        }
        showCustomAlert(errorMessage, 'error');
    } finally {
        loginBtn.disabled = false;
        loginBtn.classList.remove('loading');
    }
}

/**
 * Handles user registration with email and password.
 * @param {Event} e - The form submission event.
 */
async function handleRegister(e) {
    e.preventDefault();
    const username = registerUsernameInput.value.trim();
    const email = registerEmailInput.value.trim();
    const password = registerPasswordInput.value.trim();
    const confirmPassword = registerConfirmPasswordInput.value.trim();

    if (!username || !email || !password || !confirmPassword) {
        showCustomAlert('الرجاء تعبئة جميع الحقول.', 'warning');
        return;
    }
    if (password.length < 6) {
        showCustomAlert('يجب أن تكون كلمة المرور 6 أحرف على الأقل.', 'warning');
        return;
    }
    if (password !== confirmPassword) {
        showCustomAlert('كلمتا المرور غير متطابقتين.', 'error');
        return;
    }

    registerBtn.disabled = true;
    registerBtn.classList.add('loading');

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Update user profile with username
        await updateProfile(user, {
            displayName: username,
            photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${username}&backgroundColor=random&radius=50` // Generate avatar
        });

        // Save user profile to Firestore
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
            userId: user.uid,
            username: username,
            email: email,
            avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${username}&backgroundColor=random&radius=50`,
            bio: 'مستخدم جديد في AirChat.',
            interests: [],
            giftsReceived: 0,
            xp: 0,
            vipLevel: 0,
            role: 'member', // Default role
            createdAt: Date.now(),
            lastActive: Date.now(),
            isOnline: true // Set online status on registration
        });

        console.log('User registered and profile created:', user.uid);
        showCustomAlert('تم التسجيل بنجاح! يتم التوجيه...', 'success');
        // Redirection to index.html is handled by onAuthStateChanged in main.js
    } catch (error) {
        console.error('Registration error:', error);
        let errorMessage = 'فشل التسجيل. يرجى المحاولة مرة أخرى.';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'هذا البريد الإلكتروني مستخدم بالفعل.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'صيغة البريد الإلكتروني غير صحيحة.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'كلمة المرور ضعيفة جداً. اختر كلمة مرور أقوى.';
        }
        showCustomAlert(errorMessage, 'error');
    } finally {
        registerBtn.disabled = false;
        registerBtn.classList.remove('loading');
    }
}

/**
 * Handles password reset request.
 */
async function handleForgotPassword() {
    const email = await showCustomConfirm('الرجاء إدخال بريدك الإلكتروني لإعادة تعيين كلمة المرور:', 'input');
    if (!email) return;

    try {
        await sendPasswordResetEmail(auth, email);
        showCustomAlert('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.', 'info');
    } catch (error) {
        console.error('Password reset error:', error);
        let errorMessage = 'فشل إرسال رابط إعادة تعيين كلمة المرور.';
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'لا يوجد مستخدم مسجل بهذا البريد الإلكتروني.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'صيغة البريد الإلكتروني غير صحيحة.';
        }
        showCustomAlert(errorMessage, 'error');
    }
}

/**
 * Handles social login (Google, Facebook, etc.).
 * @param {string} providerName - 'google' or 'facebook'.
 */
async function handleSocialLogin(providerName) {
    let provider;
    if (providerName === 'google') {
        provider = new GoogleAuthProvider();
    } else if (providerName === 'facebook') {
        provider = new FacebookAuthProvider();
    } else {
        showCustomAlert('مزود تسجيل الدخول غير مدعوم حالياً.', 'warning');
        return;
    }

    const socialButton = document.querySelector(`.social-button.${providerName}`);
    socialButton.disabled = true; // Disable button during login
    // Note: No loading spinner on social buttons directly, as popup handles it.

    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Check if user profile exists in Firestore, create if not
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            await setDoc(userDocRef, {
                userId: user.uid,
                username: user.displayName || user.email.split('@')[0],
                email: user.email,
                avatar: user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName || user.email}&backgroundColor=random&radius=50`,
                bio: 'مستخدم جديد في AirChat.',
                interests: [],
                giftsReceived: 0,
                xp: 0,
                vipLevel: 0,
                role: 'member',
                createdAt: Date.now(),
                lastActive: Date.now(),
                isOnline: true
            });
            console.log('New social user profile created:', user.uid);
        } else {
            // Update existing user's online status
            await updateDoc(userDocRef, {
                isOnline: true,
                lastActive: Date.now()
            });
            console.log('Existing social user logged in:', user.uid);
        }

        showCustomAlert('تم تسجيل الدخول بنجاح عبر ' + providerName + '! يتم التوجيه...', 'success');
        // Redirection to index.html is handled by onAuthStateChanged in main.js
    } catch (error) {
        console.error('Social login error:', error);
        let errorMessage = 'فشل تسجيل الدخول عبر ' + providerName + '.';
        if (error.code === 'auth/account-exists-with-different-credential') {
            errorMessage = 'يوجد حساب بالفعل بهذا البريد الإلكتروني باستخدام طريقة تسجيل دخول أخرى.';
        } else if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = 'تم إغلاق نافذة تسجيل الدخول.';
        }
        showCustomAlert(errorMessage, 'error');
    } finally {
        socialButton.disabled = false;
    }
}


// --- Event Listeners ---
loginTab.addEventListener('click', () => toggleForms('login'));
registerTab.addEventListener('click', () => toggleForms('register'));
loginForm.addEventListener('submit', handleLogin);
registerForm.addEventListener('submit', handleRegister);
forgotPasswordLink.addEventListener('click', handleForgotPassword);
googleSignInBtn.addEventListener('click', () => handleSocialLogin('google'));
facebookSignInBtn.addEventListener('click', () => handleSocialLogin('facebook'));
appleSignInBtn.addEventListener('click', () => showCustomAlert('تسجيل الدخول عبر Apple قيد التطوير!', 'info'));


// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is already logged in (main.js onAuthStateChanged handles redirection)
    // If we are on auth.html and onAuthStateChanged detects a logged-in user, it redirects.
    // If no user is logged in, it stays on auth.html.
    console.log('Auth page loaded. Waiting for Firebase Auth state...');
});
