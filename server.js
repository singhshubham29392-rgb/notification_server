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
let firebaseInitError = null;

function formatPrivateKey(key) {
  if (!key || typeof key !== 'string') return null;
  let k = key.trim();

  // Remove surrounding quotes if present
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }

  // Handle double backslashes \\n or single backslash \n
  k = k.replace(/\\n/g, '\n');

  // Ensure newlines exist around headers
  if (!k.includes('\n')) {
    k = k
      .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
      .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
  }

  if (!k.includes('-----BEGIN PRIVATE KEY-----') || !k.includes('-----END PRIVATE KEY-----')) {
    return null;
  }

  return k;
}

function initFirebase() {
  if (firebaseInitialized) return;

  try {
    // 1. Check individual environment variables
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      const pKey = formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY);
      if (pKey) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID.trim(),
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim(),
            privateKey: pKey,
          }),
        });
        firebaseInitialized = true;
        firebaseInitError = null;
        console.log('✅ Firebase Admin initialized via individual env vars.');
        return;
      }
    }

    // 2. Check local serviceAccountKey.json file
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
      try {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        const pKey = formatPrivateKey(serviceAccount.private_key);
        if (pKey) {
          serviceAccount.private_key = pKey;
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
          firebaseInitialized = true;
          firebaseInitError = null;
          console.log('✅ Firebase Admin initialized via local serviceAccountKey.json.');
          return;
        }
      } catch (eLocal) {
        console.warn('Local serviceAccountKey.json read failed:', eLocal.message);
      }
    }

    // 3. Check FIREBASE_SERVICE_ACCOUNT environment variable
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      let rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT.trim();

      if (!rawEnv.startsWith('{') && !rawEnv.startsWith('"')) {
        try {
          const decoded = Buffer.from(rawEnv, 'base64').toString('utf8').trim();
          if (decoded.startsWith('{')) {
            rawEnv = decoded;
          }
        } catch (_) {}
      }

      let serviceAccount;
      try {
        serviceAccount = JSON.parse(rawEnv);
      } catch (e1) {
        let sanitized = rawEnv.replace(/\r?\n/g, '\\n');
        if (!sanitized.endsWith('}')) {
          sanitized += '}';
        }
        serviceAccount = JSON.parse(sanitized);
      }

      const pKey = formatPrivateKey(serviceAccount.private_key);
      if (pKey) {
        serviceAccount.private_key = pKey;
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        firebaseInitialized = true;
        firebaseInitError = null;
        console.log('✅ Firebase Admin initialized via FIREBASE_SERVICE_ACCOUNT env var.');
        return;
      }
    }

    firebaseInitError = 'FIREBASE_SERVICE_ACCOUNT or FIREBASE_PRIVATE_KEY environment variables missing/invalid.';
    console.warn('⚠️ WARNING: Firebase Admin credentials not found! Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.');
  } catch (err) {
    firebaseInitError = err.message || String(err);
    console.error('❌ Failed to initialize Firebase Admin SDK:', err.message);
  }
}
    }

    firebaseInitError = 'FIREBASE_SERVICE_ACCOUNT environment variable is not set in Render dashboard.';
    console.warn('⚠️ WARNING: Firebase Admin credentials not found! Set FIREBASE_SERVICE_ACCOUNT env var.');
  } catch (err) {
    firebaseInitError = err.message || String(err);
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
  if (!firebaseInitialized) {
    initFirebase();
  }
  res.status(200).json({
    status: 'ok',
    message: 'Cubbit Push Notification Backend is active',
    firebaseStatus: firebaseInitialized ? 'Connected' : 'Not Connected',
    firebaseError: firebaseInitialized ? null : firebaseInitError,
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
