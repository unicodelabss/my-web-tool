const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AdmZip = require('adm-zip');
const basicAuth = require('express-basic-auth');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// This path works for local, Render, and Railway
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TOOLS_DIR = path.join(DATA_DIR, 'tools');
const DATA_FILE_PATH = path.join(DATA_DIR, 'tools-data.json');

// Ensure necessary directories and files exist on startup
function initializeData() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(TOOLS_DIR)) fs.mkdirSync(TOOLS_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE_PATH)) {
        const initialData = {
            categories: ["General", "PDF Tools", "Image Utilities"],
            tools: []
        };
        fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(initialData, null, 2));
    }
}
initializeData();

// Middleware
const upload = multer({ storage: multer.memoryStorage() });
const adminAuth = basicAuth({
    users: { [process.env.ADMIN_USER]: process.env.ADMIN_PASSWORD },
    challenge: true,
    realm: 'Admin Area',
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(TOOLS_DIR));

// === PUBLIC API ===
app.get('/api/data', (req, res) => {
    fs.readFile(DATA_FILE_PATH, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading data file:", err);
            return res.status(500).json({ error: 'Failed to read data' });
        }
        res.json(JSON.parse(data));
    });
});

// === PROTECTED ADMIN ROUTES ===
app.get('/admin', adminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// Add a new tool
app.post('/admin/add-tool', adminAuth, upload.single('toolFile'), (req, res) => {
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
            order: parseInt(order) || (data.tools.length > 0 ? Math.max(...data.tools.map(t => t.order)) + 1 : 1)
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

// Update tools (reorder/delete)
app.post('/admin/update-tools', adminAuth, (req, res) => {
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

// Update categories
app.post('/admin/update-categories', adminAuth, (req, res) => {
    const { categories } = req.body;
    if (!categories || !Array.isArray(categories)) {
        return res.status(400).json({ success: false, message: 'Invalid data format.' });
    }
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE_PATH, 'utf8'));
        data.categories = categories;
        fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2));
        res.json({ success: true, message: 'Categories updated successfully.' });
    } catch (error) {
        console.error("Error updating categories:", error);
        res.status(500).json({ success: false, message: 'Failed to update categories.' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Data is being stored in: ${path.resolve(DATA_DIR)}`);
});