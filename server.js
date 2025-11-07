const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs'); // We need this
const app = express();
const port = 3000;

// --- RENDER-AWARE FILE PATHS ---
// Check if we are running on Render (process.env.RENDER is set by Render)
const isProduction = process.env.RENDER === 'true';

// If on Render, save data to the persistent disk at '/data'. 
// Otherwise, save it locally.
const DB_PATH = isProduction ? '/data/db.json' : path.join(__dirname, 'db.json');
const UPLOAD_PATH = isProduction ? '/data/uploads' : path.join(__dirname, 'public/uploads');

// --- Ensure directories exist ---
// Make sure our upload folder exists, wherever it is
if (!fs.existsSync(UPLOAD_PATH)) {
    fs.mkdirSync(UPLOAD_PATH, { recursive: true });
}

// --- Load/Save Database Functions (Modified) ---
function loadDatabase() {
    try {
        // Make sure the database file exists before trying to read it
        if (!fs.existsSync(DB_PATH)) {
            // If it doesn't exist (like on first deploy), create it with defaults
            console.log("No db.json found. Creating one with defaults.");
            const defaultData = {
                "ancient-history": { title: "Ancient History", description: "Default notes.", pdfUrl: null },
                "modern-history": { title: "Modern History", description: "Default notes.", pdfUrl: null }
            };
            saveDatabase(defaultData);
            return defaultData;
        } else {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error("Error reading database file:", err);
        return {}; // Return empty object on error
    }
}

function saveDatabase(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error("Error saving database file:", err);
    }
}

// --- Middleware ---
app.use(cors());
// Serve the main app (index.html, etc.) from 'public'
app.use(express.static(path.join(__dirname, 'public')));
// --- NEW: Also serve uploaded files from our persistent disk ---
// This tells Express: If a URL starts with /uploads, 
// look for the file in the UPLOAD_PATH folder.
app.use('/uploads', express.static(UPLOAD_PATH));

// --- Load data into memory ---
let studyMaterialData = loadDatabase();

// --- Multer Configuration (Modified) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_PATH); // Use our new render-aware path
    },
    filename: (req, file, cb) => {
        // Use a clean timestamp for the filename
        const uniqueName = req.body.topic + '-' + Date.now() + '.pdf';
        cb(null, uniqueName);
    }
});

const pdfFileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('Only PDF files are allowed!'), false); 
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: pdfFileFilter
});

// --- API ROUTES (Same as before) ---
app.get('/api/study-material/:topic', (req, res) => {
    const topic = req.params.topic;
    const data = studyMaterialData[topic]; 
    if (data) {
        res.json(data);
    } else {
        res.status(404).json({ error: "Topic not found" });
    }
});

app.post('/api/upload', (req, res) => {
    const uploadMiddleware = upload.single('pdfFile');
    
    uploadMiddleware(req, res, (err) => {
        if (err) {
            return res.status(400).json({ message: err.message });
        }
        const topic = req.body.topic;
        const file = req.file;
        if (!file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }
        if (studyMaterialData[topic]) {
            // Update path to be a URL, not a folder path
            studyMaterialData[topic].pdfUrl = `uploads/${file.filename}`;
            saveDatabase(studyMaterialData); 
            console.log(`Updated ${topic} with PDF: ${file.filename}`);
            res.json({
                message: 'File uploaded successfully!',
                pdfUrl: `uploads/${file.filename}`
            });
        } else {
            res.status(404).json({ message: 'Topic not found for upload.' });
        }
    });
});

// --- Catch-all route for your HTML app ---
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start Server (Modified) ---
// Render provides its own port. We must use it.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Gyankunj Backend running at http://localhost:${PORT}`);
    console.log(`Database path: ${DB_PATH}`);
    console.log(`Upload path: ${UPLOAD_PATH}`);
});

