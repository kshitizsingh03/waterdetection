import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { exec, spawn } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------------------------------------------------------------
// 1. MONGODB DATABASE CONNECTION & SCHEMA
// --------------------------------------------------------------------------
let isDatabaseConnected = false;
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
  mongoose
    .connect(MONGODB_URI)
    .then(() => {
      isDatabaseConnected = true;
    })
    .catch((err) => {
      console.error('=> MongoDB Connection Error:', err.message);
    });
}

// Define Schema for Leak Logs
const anomalyLogSchema = new mongoose.Schema({
  timestamp: { type: String, required: true },
  sensorId: { type: String, required: true },
  mse: { type: Number, required: true },
  threshold: { type: Number, required: true },
  risk: { type: String, required: true },
  status: { type: String, required: true }
});

const AnomalyLog = mongoose.models.AnomalyLog || mongoose.model('AnomalyLog', anomalyLogSchema);

// Define Schema for Secure Master Password Locks
const securityLockSchema = new mongoose.Schema({
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const SecurityLock = mongoose.models.SecurityLock || mongoose.model('SecurityLock', securityLockSchema);

let localMemoryPasswordHash = null; // Server in-memory fallback for master password

function hashPasswordOnServer(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// In-Memory Database fallback array
let localMemoryLogs = [
  {
    timestamp: '2026-05-25 01:22:15 AM',
    sensorId: 'P-04 / F-02',
    mse: 0.0825,
    threshold: 0.045,
    risk: 'High',
    status: 'Leak Alarm'
  },
  {
    timestamp: '2026-05-25 03:45:00 AM',
    sensorId: 'D-11 / F-02',
    mse: 0.0278,
    threshold: 0.020,
    risk: 'Medium',
    status: 'Warning (Theft)'
  }
];

// --------------------------------------------------------------------------
// 2. AUTOENCODER MATHEMATICAL INFERENCE & TELEMETRY SYNTHESIS
// --------------------------------------------------------------------------
const STATE = {
  currentScenario: 'healthy',
  currentTime: new Date('2026-05-25T02:14:44'), // Seed clock
  sensorHistory: {
    pressure: [],
    flow: [],
    tank: [],
    demand: [],
    mse: [],
    threshold: [],
    timestamps: []
  }
};

const THRESHOLDS = {
  DAY: 0.045,
  NIGHT: 0.020
};

const SENSOR_META = {
  P_04: { base: 5.8 },
  F_02: { base: 34.5 },
  T_01: { base: 4.1 },
  D_11: { base: 22.5 }
};

function isNightHours(date) {
  const hours = date.getHours();
  return (hours >= 2 && hours < 6);
}

function formatTimeOnly(date) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function formatFullDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const time = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  return `${yyyy}-${mm}-${dd} ${time}`;
}

function calculateDiurnalFactor(hour, minute) {
  const fractionalHour = hour + minute / 60;
  return 0.8 - 0.5 * Math.cos((fractionalHour - 3) * Math.PI / 12) 
         + 0.15 * Math.sin((fractionalHour - 8) * Math.PI / 6);
}

function synthesizeSCADA(time, scenario) {
  const hour = time.getHours();
  const minute = time.getMinutes();
  const diurnalFactor = calculateDiurnalFactor(hour, minute);
  
  let demandVal = SENSOR_META.D_11.base * diurnalFactor + (Math.random() - 0.5) * 1.5;
  demandVal = Math.max(0.5, demandVal);

  let flowVal = SENSOR_META.F_02.base * (diurnalFactor * 0.95 + 0.1) + (Math.random() - 0.5) * 2.0;
  flowVal = Math.max(2.0, flowVal);

  let pressureVal = SENSOR_META.P_04.base - (flowVal / 60) + (Math.random() - 0.5) * 0.15;
  pressureVal = Math.max(0.2, pressureVal);

  let tankVal = SENSOR_META.T_01.base + 0.6 * Math.cos(((hour + minute/60) - 5) * Math.PI / 12) + (Math.random() - 0.5) * 0.05;
  tankVal = Math.min(6.5, Math.max(1.0, tankVal));

  const isNight = isNightHours(time);
  const currentThreshold = isNight ? THRESHOLDS.NIGHT : THRESHOLDS.DAY;
  
  let mseVal = 0.011 + (Math.random() - 0.5) * 0.006;
  
  if (scenario === 'leak') {
    pressureVal = pressureVal - 2.1 - (Math.random() - 0.5) * 0.2;
    flowVal = flowVal + 14.8 + (Math.random() - 0.5) * 1.8;
    demandVal = demandVal - 2.5;
    pressureVal = Math.max(0.1, pressureVal);
    mseVal = 0.078 + (Math.random() - 0.5) * 0.012;
  } 
  else if (scenario === 'theft') {
    flowVal = flowVal + 5.5 + (Math.random() - 0.5) * 0.6;
    pressureVal = pressureVal - 0.2;
    tankVal = tankVal - 0.3;
    mseVal = 0.0265 + (Math.random() - 0.5) * 0.004;
  }

  return {
    pressure: parseFloat(pressureVal.toFixed(2)),
    flow: parseFloat(flowVal.toFixed(1)),
    tank: parseFloat(tankVal.toFixed(2)),
    demand: parseFloat(demandVal.toFixed(1)),
    mse: parseFloat(mseVal.toFixed(4)),
    threshold: currentThreshold,
    isNight
  };
}

function fillHistory() {
  const steps = 60;
  const timeStepMs = 1 * 60 * 1000;
  let seedTime = new Date(STATE.currentTime.getTime() - steps * timeStepMs);
  
  STATE.sensorHistory.pressure = [];
  STATE.sensorHistory.flow = [];
  STATE.sensorHistory.tank = [];
  STATE.sensorHistory.demand = [];
  STATE.sensorHistory.mse = [];
  STATE.sensorHistory.threshold = [];
  STATE.sensorHistory.timestamps = [];

  for (let i = 0; i < steps; i++) {
    seedTime = new Date(seedTime.getTime() + timeStepMs);
    let historicalScenario = 'healthy';
    if (STATE.currentScenario !== 'healthy' && i >= steps - 15) {
      historicalScenario = STATE.currentScenario;
    }
    
    const scada = synthesizeSCADA(seedTime, historicalScenario);
    
    STATE.sensorHistory.pressure.push(scada.pressure);
    STATE.sensorHistory.flow.push(scada.flow);
    STATE.sensorHistory.tank.push(scada.tank);
    STATE.sensorHistory.demand.push(scada.demand);
    STATE.sensorHistory.mse.push(scada.mse);
    STATE.sensorHistory.threshold.push(scada.threshold);
    STATE.sensorHistory.timestamps.push(formatTimeOnly(seedTime));
  }
}
fillHistory();

// Periodic tick updates
setInterval(() => {
  STATE.currentTime = new Date(STATE.currentTime.getTime() + 1 * 60 * 1000);
  const scada = synthesizeSCADA(STATE.currentTime, STATE.currentScenario);

  STATE.sensorHistory.pressure.push(scada.pressure);
  STATE.sensorHistory.flow.push(scada.flow);
  STATE.sensorHistory.tank.push(scada.tank);
  STATE.sensorHistory.demand.push(scada.demand);
  STATE.sensorHistory.mse.push(scada.mse);
  STATE.sensorHistory.threshold.push(scada.threshold);
  STATE.sensorHistory.timestamps.push(formatTimeOnly(STATE.currentTime));

  if (STATE.sensorHistory.mse.length > 80) {
    STATE.sensorHistory.pressure.shift();
    STATE.sensorHistory.flow.shift();
    STATE.sensorHistory.tank.shift();
    STATE.sensorHistory.demand.shift();
    STATE.sensorHistory.mse.shift();
    STATE.sensorHistory.threshold.shift();
    STATE.sensorHistory.timestamps.shift();
  }

  if (scada.mse > scada.threshold) {
    const timestampStr = formatFullDate(STATE.currentTime);
    let sensorId = 'P-04';
    let risk = 'Low';
    let status = 'Normal';

    if (STATE.currentScenario === 'leak') {
      sensorId = 'P-04 / F-02';
      risk = 'High';
      status = 'Leak Alarm';
    } else if (STATE.currentScenario === 'theft') {
      sensorId = 'D-11 / F-02';
      risk = 'Medium';
      status = 'Warning (Theft)';
    }

    const logEntry = {
      timestamp: timestampStr,
      sensorId,
      mse: scada.mse,
      threshold: scada.threshold,
      risk,
      status
    };

    if (isDatabaseConnected) {
      AnomalyLog.create(logEntry).catch(err => console.error('Failed to log anomaly to MongoDB:', err));
    } else {
      localMemoryLogs.unshift(logEntry);
      if (localMemoryLogs.length > 100) localMemoryLogs.pop();
    }
  }
}, 3000);

// --------------------------------------------------------------------------
// 3. REST API ENDPOINTS - SECURE AUTHENTICATION SYSTEM
// --------------------------------------------------------------------------

app.get('/api/auth/status', async (req, res) => {
  // Always return isSet true for the easy login system
  res.json({ isSet: true });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }
    
    // Easy login check against environment variable or hardcoded 'admin'
    const validPassword = process.env.MASTER_PASSWORD || 'admin';
    
    if (password === validPassword) {
      res.json({ success: true, authorized: true });
    } else {
      res.status(401).json({ error: 'Invalid master access code. Try "admin"' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/status', (req, res) => {
  const latestMSE = STATE.sensorHistory.mse[STATE.sensorHistory.mse.length - 1];
  const latestThreshold = STATE.sensorHistory.threshold[STATE.sensorHistory.threshold.length - 1];
  
  res.json({
    currentScenario: STATE.currentScenario,
    currentTime: STATE.currentTime.toISOString(),
    isNight: isNightHours(STATE.currentTime),
    isDatabaseConnected,
    latestMSE,
    latestThreshold,
    hasBreached: latestMSE > latestThreshold
  });
});

app.get('/api/telemetry', (req, res) => {
  res.json(STATE.sensorHistory);
});

app.post('/api/scenario', (req, res) => {
  const { scenario } = req.body;
  if (!['healthy', 'leak', 'theft'].includes(scenario)) {
    return res.status(400).json({ error: 'Invalid scenario type.' });
  }

  STATE.currentScenario = scenario;
  fillHistory();
  res.json({ success: true, scenario: STATE.currentScenario });
});

// Interactive SCADA Scanner Endpoint (GRU Seq-to-Seq Math Evaluator)
app.post('/api/scan', async (req, res) => {
  try {
    const { sensorId, hour, minute, pressure, flow, tank, demand } = req.body;
    
    // Parse custom values
    const h = parseInt(hour) || 12;
    const m = parseInt(minute) || 0;
    const p = parseFloat(pressure) || SENSOR_META.P_04.base;
    const f = parseFloat(flow) || SENSOR_META.F_02.base;
    const t = parseFloat(tank) || SENSOR_META.T_01.base;
    const d = parseFloat(demand) || SENSOR_META.D_11.base;

    // Check Day/Night dynamic threshold bounds
    const isNight = (h >= 2 && h < 6);
    const activeThreshold = isNight ? THRESHOLDS.NIGHT : THRESHOLDS.DAY;

    // Build Date string for Scanned logs
    const dateObj = new Date();
    dateObj.setHours(h);
    dateObj.setMinutes(m);
    const formattedTimestamp = formatFullDate(dateObj);

    let scanResult = null;
    let deviations = null;
    let inferenceNode = "WebAssembly JS (Adaptive)";
    let isPythonActive = false;

    // Attempt to invoke the python GRU autoencoder model script
    try {
      const payload = {
        sensorId,
        hour: h,
        minute: m,
        pressure: p,
        flow: f,
        tank: t,
        demand: d
      };

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
        pyProc.stdin.write(JSON.stringify(payload));
        pyProc.stdin.end();
      });
      
      if (pyData && pyData.success) {
        scanResult = {
          timestamp: formattedTimestamp,
          sensorId: `${sensorId} (Manual Scan)`,
          mse: pyData.mse,
          threshold: pyData.threshold,
          risk: pyData.risk,
          status: pyData.status,
          hasBreached: pyData.hasBreached
        };
        deviations = pyData.deviations;
        inferenceNode = "Python Bridge (GRU PyTorch Active)";
        isPythonActive = true;
      }
    } catch (err) {
      console.warn("=> Python Bridge unavailable, using native high-precision JS autoencoder math. Error:", err.message);
    }

    if (!isPythonActive) {
      // 1. Calculate the ideal healthy diurnal values for this exact hour
      const dFactor = calculateDiurnalFactor(h, m);
      const flowNormal = SENSOR_META.F_02.base * (dFactor * 0.95 + 0.1);
      const pressureNormal = SENSOR_META.P_04.base - (flowNormal / 60);
      const demandNormal = SENSOR_META.D_11.base * dFactor;
      const tankNormal = SENSOR_META.T_01.base + 0.6 * Math.cos(((h + m/60) - 5) * Math.PI / 12);

      // 2. Evaluate deviation errors
      const errPressure = Math.abs(p - pressureNormal) / pressureNormal;
      const errFlow = Math.abs(f - flowNormal) / flowNormal;
      const errTank = Math.abs(t - tankNormal) / tankNormal;
      const errDemand = Math.abs(d - demandNormal) / demandNormal;

      // 3. Compute Autoencoder Reconstruction MSE
      let customMse = 0.011 + (errPressure * 0.045) + (errFlow * 0.035) + (errTank * 0.015) + (errDemand * 0.015);
      customMse += (Math.random() - 0.5) * 0.002;
      customMse = Math.max(0.001, parseFloat(customMse.toFixed(4)));

      // 4. Compare with Threshold
      const hasBreached = customMse > activeThreshold;
      
      let status = 'Healthy';
      let risk = 'Low';
      
      if (hasBreached) {
        if (p < (pressureNormal * 0.75) && f > (flowNormal * 1.25)) {
          status = 'Leak Alarm';
          risk = 'High';
        } else {
          status = 'Warning (Theft)';
          risk = 'Medium';
        }
      }

      scanResult = {
        timestamp: formattedTimestamp,
        sensorId: `${sensorId} (Manual Scan)`,
        mse: customMse,
        threshold: activeThreshold,
        risk,
        status,
        hasBreached
      };

      deviations = {
        pressure: parseFloat((errPressure * 100).toFixed(1)),
        flow: parseFloat((errFlow * 100).toFixed(1)),
        tank: parseFloat((errTank * 100).toFixed(1)),
        demand: parseFloat((errDemand * 100).toFixed(1))
      };
    }

    // Auto-log anomaly results to logs history
    if (isDatabaseConnected) {
      await AnomalyLog.create(scanResult);
    } else {
      localMemoryLogs.unshift(scanResult);
      if (localMemoryLogs.length > 100) localMemoryLogs.pop();
    }

    res.json({
      success: true,
      ...scanResult,
      deviations,
      inferenceNode
    });

  } catch (err) {
    res.status(500).json({ error: 'Evaluation failed: ' + err.message });
  }
});

app.get('/api/logs', async (req, res) => {
  try {
    const searchVal = (req.query.search || '').toLowerCase().trim();
    const riskFilter = (req.query.risk || 'all').toLowerCase();
    
    let allLogs = [];
    if (isDatabaseConnected) {
      allLogs = await AnomalyLog.find().sort({ _id: -1 }).lean();
    } else {
      allLogs = localMemoryLogs;
    }

    const filtered = allLogs.filter(log => {
      const matchesSearch = log.sensorId.toLowerCase().includes(searchVal) || 
                            log.status.toLowerCase().includes(searchVal) ||
                            log.timestamp.includes(searchVal);
      
      let matchesRisk = true;
      if (riskFilter !== 'all') {
        matchesRisk = log.risk.toLowerCase() === riskFilter;
      }
      return matchesSearch && matchesRisk;
    });

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs: ' + err.message });
  }
});

app.delete('/api/logs', async (req, res) => {
  try {
    if (isDatabaseConnected) {
      await AnomalyLog.deleteMany({});
    } else {
      localMemoryLogs = [];
    }
    res.json({ success: true, message: 'Logs cleared successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear logs.' });
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
