/**
 * @file server.js
 * @description Main backend server for AirChat.
 * Handles serving static files, Socket.io real-time communication,
 * and Firebase Admin SDK integration for database operations and authentication.
 */

// --- Node.js Core Modules ---
const path = require('path'); // For resolving file paths

// --- Express.js for Web Server ---
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app); // Create HTTP server from Express app

// --- Socket.io for Real-time Communication ---
const { Server } = require('socket.io');
const io = new Server(server); // Attach Socket.io to the HTTP server

// --- Firebase Admin SDK ---
const admin = require('firebase-admin');

// IMPORTANT: Replace with your Firebase service account key.
// This key should be kept secure and never exposed publicly.
// For local development, you can place your serviceAccountKey.json file
// in the root of your project. In production, use environment variables.
// Example: const serviceAccount = require('./path/to/your/serviceAccountKey.json');
// For Canvas environment, this might be handled differently or not directly needed
// if Firebase is configured via frontend only for specific features.
// For a full backend, you MUST provide your service account key.
// If you don't have one, you'll need to generate it from your Firebase project settings.

// Placeholder for Firebase Admin SDK initialization.
// In a real scenario, you'd load your service account key here.
// For now, we'll initialize it minimally, assuming some operations might
// primarily happen client-side or that a service account will be provided.
// If you intend to do complex backend operations with Firebase,
// you MUST configure the service account.
try {
    // Check if Firebase Admin is already initialized to prevent errors
    if (!admin.apps.length) {
        // Replace with your actual Firebase project ID and service account credentials
        // This is a placeholder and WILL NOT WORK without your actual Firebase Admin SDK setup.
        // You would typically get this from a service account JSON file.
        // Example:
        // const serviceAccount = require('./path/to/your/serviceAccountKey.json');
        // admin.initializeApp({
        //     credential: admin.credential.cert(serviceAccount),
        //     databaseURL: "https://<YOUR_PROJECT_ID>.firebaseio.com" // Replace with your project's database URL
        // });
        console.warn('Firebase Admin SDK not fully configured. Some backend Firebase operations might not work.');
        console.warn('Please ensure your Firebase Admin SDK is initialized with proper credentials for production use.');
        // Minimal initialization for basic functionalities if no service account is provided,
        // but this is NOT secure or functional for most Firebase Admin features.
        // For Canvas, the __firebase_config is for client-side. Backend needs its own setup.
        admin.initializeApp(); // Attempt minimal init, will likely fail for actual admin ops without credentials
    }
    const dbAdmin = admin.firestore(); // Get Firestore instance for backend operations
    const authAdmin = admin.auth(); // Get Auth instance for backend operations
    console.log('Firebase Admin SDK initialized (or attempted).');
} catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    console.warn('Backend Firebase operations (like user management, secure data updates) will not function without proper Admin SDK setup.');
}


// --- Express Middleware ---
app.use(express.json()); // For parsing JSON request bodies

// --- Serve Static Files ---
// This tells Express to serve files from the 'public' directory.
// So, when a browser requests '/', it will look for public/index.html
// when it requests '/js/main.js', it will look for public/js/main.js, etc.
app.use(express.static(path.join(__dirname, 'public')));
console.log('Serving static files from:', path.join(__dirname, 'public'));

// --- Routes ---
// Serve the main HTML files directly
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/public_chat_room.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'public_chat_room.html'));
});

app.get('/private_chat.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'private_chat.html'));
});

app.get('/auth.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

// --- Socket.io Connection Handling ---
io.on('connection', (socket) => {
    console.log('A user connected via Socket.io:', socket.id);

    // Example: Handle a 'chat message' event
    socket.on('chat message', (msg) => {
        console.log('message: ' + msg);
        // Broadcast the message to all connected clients in the same room (if rooms are implemented)
        io.emit('chat message', msg); // For simplicity, broadcasting to all
    });

    // Example: Handle user disconnecting
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // In a real app, update user's online status in Firestore here
    });

    // You can add more Socket.io event handlers here for:
    // - User online/offline status updates
    // - Typing indicators
    // - Mic stage changes (if real-time updates are pushed from backend)
    // - Private message notifications (if backend handles message routing/storage)
});

// --- Start the Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access the app at: http://localhost:${PORT}`);
});

