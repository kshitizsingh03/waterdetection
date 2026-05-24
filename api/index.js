import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------------------------------------------------------------
// 1. SIMPLE PREDICT ENDPOINT
// --------------------------------------------------------------------------

app.post('/api/predict', async (req, res) => {
  try {
    const { features } = req.body;
    
    if (!features || !Array.isArray(features) || features.length !== 40) {
      return res.status(400).json({ error: 'Requires exactly 40 features.' });
    }

    const scriptPath = path.join(__dirname, '../gru_ae_infer.py');
    
    const pyData = await new Promise((resolve, reject) => {
      const pyProc = spawn('python', [scriptPath]);
      let out = '';
      let err = '';
      pyProc.stdout.on('data', d => out += d.toString());
      pyProc.stderr.on('data', d => err += d.toString());
      pyProc.on('close', code => {
        if (code !== 0) return reject(new Error('Python failed: ' + err));
        try { resolve(JSON.parse(out.trim())); } 
        catch (e) { reject(new Error('Invalid JSON from python: ' + out)); }
      });
      
      // Write the features array as JSON to python stdin
      pyProc.stdin.write(JSON.stringify({ features }));
      pyProc.stdin.end();
    });
    
    if (pyData && pyData.success) {
      res.json(pyData);
    } else {
      res.status(500).json({ error: pyData.error || 'Unknown error from model.' });
    }

  } catch (err) {
    res.status(500).json({ error: 'Evaluation failed: ' + err.message });
  }
});

// Serve static frontend files when running locally
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, '../')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
  });
  
  app.listen(PORT, () => {
    console.log(`Local full-stack Express server listening on http://localhost:${PORT}/`);
  });
}

export default app;
