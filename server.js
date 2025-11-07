const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const admin = require('firebase-admin'); // <-- NEW
const cloudinary = require('cloudinary').v2; // <-- NEW
const fs = require('fs'); // <-- NEW

const app = express();

// --- 1. INITIALIZE SERVICES ---

// Base64-decode the service account key from the environment variable
// This is the secure way to do it on Render
const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
let serviceAccount;

if (serviceAccountBase64) {
  // We are on Render (Production)
  const decodedKey = Buffer.from(serviceAccountBase64, 'base64').toString('ascii');
  serviceAccount = JSON.parse(decodedKey);
} else {
  // We are on Termux (Development)
  // Check if the key file exists before trying to require it
  if (fs.existsSync('./serviceAccountKey.json')) {
    serviceAccount = require('./serviceAccountKey.json');
  } else {
    console.warn("WARNING: serviceAccountKey.json not found. Firebase Admin SDK not initialized for local dev.");
  }
}

// Initialize Firebase Admin only if we have a service account
if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// Initialize Cloudinary (using Render's environment variables)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Initialize Firestore Database (only if admin was initialized)
const db = admin.firestore ? admin.firestore() : null;

// Configure Multer to use memory storage (no disk)
const upload = multer({ 
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  }
});

// --- 2. MIDDLEWARE ---
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
// We no longer need a static '/uploads' folder, as files are in the cloud

// --- 3. API ROUTES (REBUILT FOR FIRESTORE & CLOUDINARY) ---

// GET route (reads from Firestore)
app.get('/api/study-material/:topic', async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized." });
  
  try {
    const topic = req.params.topic;
    const docRef = db.collection('materials').doc(topic);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: "Topic not found" });
    }
    
    res.json(doc.data());
  } catch (error) {
    console.error("Error fetching doc:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST route (uploads to Cloudinary, then updates Firestore)
app.post('/api/upload', upload.single('pdfFile'), (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not initialized." });
  
  const topic = req.body.topic;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: 'No file uploaded.' });
  }

  // Upload the file buffer from memory to Cloudinary
  cloudinary.uploader.upload_stream({
    resource_type: 'raw', // Treat it as a raw file, not an image
    public_id: `${topic}-${Date.now()}`,
     format: 'pdf' 
  }, async (error, result) => {
    if (error) {
      console.error("Cloudinary upload error:", error);
      return res.status(500).json({ message: "File upload failed" });
    }

    // File uploaded successfully, 'result.secure_url' is the public URL
    const pdfUrl = result.secure_url;
    
    try {
      // Now, save this URL to our Firestore database
      const docRef = db.collection('materials').doc(topic);
      await docRef.set({
        pdfUrl: pdfUrl,
        fileName: file.originalname // Store original name
      }, { merge: true }); // 'merge: true' updates the doc

      res.json({
        message: 'File uploaded successfully!',
        pdfUrl: pdfUrl
      });
      
    } catch (dbError) {
      console.error("Firestore update error:", dbError);
      return res.status(500).json({ message: "Database update failed" });
    }
  }).end(file.buffer); // Send the file buffer to Cloudinary
});

// --- 4. CATCH-ALL & START SERVER ---

app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Use Render's port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Gyankunj Backend running at http://localhost:${PORT}`);
});

0
0
0
