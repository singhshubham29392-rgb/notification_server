# Cubbit Push Notification Backend (Free Node.js Express Server)

यह एक मुफ़्त Node.js Express सर्वर है जो Firebase Admin SDK के माध्यम से Android और iOS डिवाइसेस पर **High Priority FCM Push Notifications** भेजता है।

यह सर्वर **चैट मैसेज, पोस्ट, वॉइस कॉल (Voice Call) और वीडियो कॉल (Video Call)** सभी के लिए नोटिफिकेशन डिलीवर करता है, **चाहे यूजर का ऐप पूरी तरह बंद (Completely Closed / Swiped away) ही क्यों न हो**।

---

## 🚀 Step 1: Firebase Service Account Key डाउनलोड करें

1. **[Firebase Console](https://console.firebase.google.com/)** पर जाएं।
2. अपने Cubbit प्रोजेक्ट को खोलें -> ⚙️ **Project Settings** पर क्लिक करें।
3. **Service accounts** टैब में जाएं।
4. **Generate new private key** बटन पर क्लिक करें। एक JSON फ़ाइल डाउनलोड होगी।
5. इस डाउनलोड की हुई फ़ाइल को नाम दें `serviceAccountKey.json` और इसे इस `notification_server/` फ़ोल्डर में रख दें।

---

## 🌐 Step 2: Render.com पर Free Hosting डिप्लॉयमेंट (Recommended)

1. **GitHub** पर जाएं और इस `notification_server/` कोड को अपने GitHub रेपॉजिटरी में पुश करें।
2. **[render.com](https://render.com/)** पर फ्री अकाउंट बनाएं।
3. **New +** -> **Web Service** चुनें।
4. अपना GitHub Repo कनेक्ट करें।
5. निम्नलिखित सेटिंग्स भरें:
   - **Name**: `cubbit-notification-server`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: `Free`
6. **Environment Variables** सेक्शन में नया Variable जोड़ें:
   - Key: `FIREBASE_SERVICE_ACCOUNT`
   - Value: (अपनी `serviceAccountKey.json` फ़ाइल का पूरा कंटेंट कॉपी करके यहाँ पेस्ट कर दें)
7. **Create Web Service** पर क्लिक करें! Render आपको एक URL देगा (जैसे: `https://cubbit-notification-server.onrender.com`)।

---

## ⚡ Step 3: Vercel पर Free Deployment (Alternative)

यदि आप Vercel पर डिप्लॉय करना चाहते हैं:
1. `notification_server` फ़ोल्डर में `vercel.json` बनाएं:
   ```json
   {
     "version": 2,
     "builds": [{ "src": "server.js", "use": "@vercel/node" }],
     "routes": [{ "src": "/(.*)", "dest": "server.js" }]
   }
   ```
2. **[vercel.com](https://vercel.com/)** पर जाएं और GitHub Repo इम्पोर्ट करें।
3. Environment Variable `FIREBASE_SERVICE_ACCOUNT` में `serviceAccountKey.json` का पूरा कंटेंट पेस्ट करें।
4. **Deploy** पर क्लिक करें।

---

## 📲 Step 4: Flutter App में Server URL जोड़ना

अपने Flutter ऐप की `chat_push_service.dart`, `community_push_service.dart`, और `call_push_service.dart` फ़ाइलों में डिफ़ॉल्ट URL बदलें या रन करते समय डार्ट-डिफ़ाइन पास करें:

```bash
flutter run --dart-define=CALL_SIGNALING_URL=https://your-app-name.onrender.com
```

---

## 📡 Endpoints Available

- `GET /` -> सर्वर हेल्थ स्टेटस और फायरबेस कनेक्शन स्टेटस।
- `POST /api/notify` -> चैट मैसेज, पोस्ट, वॉइस और वीडियो कॉल के हाई-प्रायोरिटी नोटिफिकेशन भेजता है।
- `POST /send-topic` -> पूरे टॉपिक (जैसे `all_users` या `community_name`) पर नोटिफिकेशन भेजता है।
