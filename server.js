// पूरा कोड जो पहले दिया गया था, उसे यहाँ पेस्ट करें।
// (The full server.js code provided in the previous answer goes here.)
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AdmZip = require('adm-zip');
const basicAuth = require('express-basic-auth');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Render.com परसिस्टेंट डिस्क के लिए पाथ सेट करना
// यह लाइन Render पर डिप्लॉयमेंट के लिए बहुत ज़रूरी है।
// यह लाइन किसी भी प्लेटफॉर्म पर काम करेगी जहाँ DATA_DIR एनवायरनमेंट वेरिएबल सेट हो
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TOOLS_DIR = path.join(DATA_DIR, 'tools');
const DATA_FILE_PATH = path.join(DATA_DIR, 'tools-data.json');

// यह सुनिश्चित करना कि ज़रूरी फोल्डर मौजूद हैं
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TOOLS_DIR)) fs.mkdirSync(TOOLS_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE_PATH)) {
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify({ categories: ["General"], tools: [] }, null, 2));
}

// Multer (फाइल अपलोड के लिए) कॉन्फ़िगरेशन
const upload = multer({ storage: multer.memoryStorage() });

// एडमिन पैनल के लिए सुरक्षा
const adminAuth = basicAuth({
    users: { [process.env.ADMIN_USER]: process.env.ADMIN_PASSWORD },
    challenge: true,
    realm: 'Admin Area',
});

// मिडलवेयर
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(TOOLS_DIR)); // यह लाइन टूल्स को (`/tool-folder/`) सर्व करने देती है

// --- API एंडपॉइंट्स ---

// [PUBLIC] होमपेज के लिए डेटा देता है
app.get('/api/data', (req, res) => {
    res.sendFile(DATA_FILE_PATH);
});

// [PROTECTED] एडमिन पेज दिखाता है
app.get('/admin', adminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// [PROTECTED] नया टूल जोड़ता है
app.post('/admin/add-tool', adminAuth, upload.single('toolFile'), (req, res) => {
    // यहाँ पर टूल जोड़ने का पूरा लॉजिक है...
    // (The full add tool logic from the previous answer)
    const { toolName, category, description, order } = req.body;
    const file = req.file;

    if (!toolName || !category || !file) {
        return res.status(400).send('Missing required fields.');
    }
    const folderName = toolName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const toolPath = path.join(TOOLS_DIR, folderName);

    try {
        if (fs.existsSync(toolPath)) {
            return res.status(400).send('A tool with this name already exists.');
        }
        fs.mkdirSync(toolPath, { recursive: true });

        if (file.mimetype === 'application/zip' || path.extname(file.originalname).toLowerCase() === '.zip') {
            const zip = new AdmZip(file.buffer);
            zip.extractAllTo(toolPath, true);
        } else if (file.mimetype === 'text/html') {
            fs.writeFileSync(path.join(toolPath, 'index.html'), file.buffer);
        } else {
            fs.rmSync(toolPath, { recursive: true, force: true });
            return res.status(400).send('Invalid file type. Please upload a .zip or .html file.');
        }

        const data = JSON.parse(fs.readFileSync(DATA_FILE_PATH, 'utf8'));
        const newTool = {
            id: Date.now(),
            name: toolName,
            folderName: folderName,
            description: description || '',
            category: category,
            order: parseInt(order) || data.tools.length + 1
        };

        data.tools.push(newTool);
        fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2));
        res.redirect('/admin?success=true');
    } catch (error) {
        console.error("Error adding tool:", error);
        if (fs.existsSync(toolPath)) fs.rmSync(toolPath, { recursive: true, force: true });
        res.status(500).send('An error occurred while adding the tool.');
    }
});

// [PROTECTED] टूल्स को अपडेट (ऑर्डर/डिलीट) करता है
app.post('/admin/update-tools', adminAuth, (req, res) => {
    // यहाँ पर टूल अपडेट करने का पूरा लॉजिक है...
    // (The full update tools logic from the previous answer)
     const updatedTools = req.body.tools;
    if (!updatedTools) return res.status(400).send('Invalid data.');

    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE_PATH, 'utf8'));
        const oldToolFolders = new Set(data.tools.map(t => t.folderName));
        const newToolFolders = new Set(updatedTools.map(t => t.folderName));

        const foldersToDelete = [...oldToolFolders].filter(folder => !newToolFolders.has(folder));
        
        foldersToDelete.forEach(folder => {
            const folderPath = path.join(TOOLS_DIR, folder);
            if (fs.existsSync(folderPath)) {
                fs.rm(folderPath, { recursive: true, force: true }, (err) => {
                    if (err) console.error(`Failed to delete folder: ${folderPath}`, err);
                    else console.log(`Deleted tool folder: ${folderPath}`);
                });
            }
        });

        data.tools = updatedTools;
        fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2));
        res.json({ success: true, message: 'Tools updated successfully.' });

    } catch (error) {
        console.error("Error updating tools:", error);
        res.status(500).json({ success: false, message: 'Failed to update tools.' });
    }
});


// सर्वर शुरू करना
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Data is being stored in: ${path.resolve(DATA_DIR)}`);
});