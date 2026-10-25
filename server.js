const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ── 1. Initialize Firebase Admin SDK ──────────────────────────────────────────
let firebaseInitialized = false;

function initFirebase() {
  if (firebaseInitialized) return;

  try {
    // Check if SERVICE_ACCOUNT_JSON environment variable exists (for Render / Vercel)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      console.log('Firebase Admin initialized via FIREBASE_SERVICE_ACCOUNT env var.');
      return;
    }

    // Check individual environment variables
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
      firebaseInitialized = true;
      console.log('Firebase Admin initialized via individual env vars.');
      return;
    }

    // Check local serviceAccountKey.json file
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      console.log('Firebase Admin initialized via local serviceAccountKey.json.');
      return;
    }

    console.warn('⚠️ WARNING: Firebase Admin credentials not found! Set FIREBASE_SERVICE_ACCOUNT env var or add serviceAccountKey.json.');
  } catch (err) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', err.message);
  }
}

initFirebase();

// Helper function: Convert all data object values to Strings for FCM compatibility
function stringifyDataObject(data) {
  if (!data || typeof data !== 'object') return {};
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined) {
      result[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
  }
  return result;
}

// ── 2. API Routes ──────────────────────────────────────────────────────────────

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Cubbit Push Notification Backend is active',
    firebaseStatus: firebaseInitialized ? 'Connected' : 'Not Connected',
    timestamp: new Date().toISOString(),
  });
});

// Primary Notification Endpoint used by Cubbit Flutter App
app.post('/api/notify', async (req, res) => {
  if (!firebaseInitialized) {
    initFirebase();
    if (!firebaseInitialized) {
      return res.status(500).json({ error: 'Firebase Admin SDK is not configured.' });
    }
  }

  const { tokens, data = {}, notificationTitle, notificationBody } = req.body;

  let tokenList = [];
  if (Array.isArray(tokens)) {
    tokenList = tokens.filter((t) => typeof t === 'string' && t.trim().length > 0);
  } else if (typeof tokens === 'string' && tokens.trim().length > 0) {
    tokenList = [tokens.trim()];
  }

  if (tokenList.length === 0) {
    return res.status(400).json({ error: 'No valid FCM tokens provided.' });
  }

  const title = notificationTitle || data.title || data.senderName || 'Cubbit Notification';
  const body = notificationBody || data.body || 'You have a new update in Cubbit.';
  const stringifiedData = stringifyDataObject(data);

  const isCall = data.type === 'call_invite';

  // Construct high-priority FCM Message payload for background/closed app delivery
  const message = {
    tokens: tokenList,
    notification: {
      title: title,
      body: body,
    },
    data: stringifiedData,
    android: {
      priority: 'high',
      ttl: isCall ? 60 * 1000 : 86400 * 1000, // Calls time out quickly if missed
      notification: {
        channelId: 'high_importance_channel',
        priority: 'max',
        sound: 'default',
        defaultSound: true,
        defaultVibrateTimings: true,
        visibility: 'public',
      },
    },
    apns: {
      payload: {
        aps: {
          alert: {
            title: title,
            body: body,
          },
          sound: 'default',
          contentAvailable: true,
        },
      },
      headers: {
        'apns-priority': '10',
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`[Push Sent] Total: ${tokenList.length}, Success: ${response.successCount}, Failure: ${response.failureCount}`);

    return res.status(200).json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      totalCount: tokenList.length,
    });
  } catch (err) {
    console.error('Error sending FCM notification:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Topic Notification Endpoint (e.g., for all users or community channels)
app.post('/send-topic', async (req, res) => {
  if (!firebaseInitialized) {
    return res.status(500).json({ error: 'Firebase Admin SDK is not configured.' });
  }

  const { topic, title, body, data = {} } = req.body;
  if (!topic) {
    return res.status(400).json({ error: 'Missing topic' });
  }

  const message = {
    topic: topic,
    notification: {
      title: title || 'Cubbit',
      body: body || 'New update',
    },
    data: stringifyDataObject(data),
    android: {
      priority: 'high',
      notification: {
        channelId: 'high_importance_channel',
        sound: 'default',
      },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    return res.status(200).json({ success: true, messageId: response });
  } catch (err) {
    console.error('Error sending topic notification:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── 3. Start Server ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Cubbit Push Notification Server running on port ${PORT}`);
});
