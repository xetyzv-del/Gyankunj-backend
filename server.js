// server.js

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const admin = require('firebase-admin');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Make sure .env is loaded

const app = express();

// ---- INITIALIZE SERVICES ----

// Base64-decode the service account key from the environment variable
const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
let serviceAccount = null;

if (serviceAccountBase64) {
  const decodedKey = Buffer.from(serviceAccountBase64, 'base64').toString('utf8');
  serviceAccount = JSON.parse(decodedKey);
} else if (fs.existsSync('./serviceAccountKey.json')) {
  serviceAccount = require('./serviceAccountKey.json');
} else {
  console.warn('WARNING: serviceAccountKey.json not found. Firebase Admin will not initialize.');
}

// Initialize Firebase Admin only if we have a service account
if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// Initialize Cloudinary (using environment variables)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Initialize Firestore Database (only if Admin was initialized)
let db = null;
let FieldValue = null;
if (admin.apps.length) {
  db = admin.firestore();
  FieldValue = admin.firestore.FieldValue;
}

// Configure Multer to use memory storage (no disk)
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    // Accept only PDF files
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  }
});

// ---- MIDDLEWARE ----

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- ROUTES (example) ----

// Example upload route
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  try {
    // Upload file buffer to Cloudinary
    const result = await cloudinary.uploader.upload_stream(
      { resource_type: 'raw', folder: 'uploads' },
      (error, result) => {
        if (error) return res.status(500).json({ error: error.message });
        res.json({ url: result.secure_url });
      }
    );
    result.end(req.file.buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- START SERVER ----

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
