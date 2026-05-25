import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files from the project root and public folder
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// Simple file-based database
const DB_FILE = path.join(__dirname, 'database.json');

// Initialize database if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ scans: [] }, null, 2));
}

// API Endpoint to save scan data
app.post('/api/save-scan', (req, res) => {
  try {
    const scanData = req.body;
    
    // Validate request
    if (!scanData || !scanData.mse || !scanData.status) {
      return res.status(400).json({ error: 'Invalid scan data format' });
    }

    // Add timestamp if not provided
    const record = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...scanData
    };

    // Read current database
    const dbData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    
    // Add new record to the beginning
    dbData.scans.unshift(record);

    // Keep only last 100 scans to prevent infinite growth
    if (dbData.scans.length > 100) {
      dbData.scans.length = 100;
    }

    // Save back to file
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2));

    console.log(`Scan saved successfully: [${record.status}] MSE: ${record.mse}`);
    
    return res.status(200).json({ message: 'Scan saved successfully', id: record.id });
  } catch (error) {
    console.error('Error saving scan data:', error);
    return res.status(500).json({ error: 'Internal server error while saving data' });
  }
});

// API Endpoint to get history
app.get('/api/history', (req, res) => {
  try {
    const dbData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return res.status(200).json(dbData.scans);
  } catch (error) {
    console.error('Error reading scan data:', error);
    return res.status(500).json({ error: 'Internal server error while reading data' });
  }
});

app.listen(PORT, () => {
  console.log(`Local full-stack Express server listening on http://localhost:${PORT}/`);
});
