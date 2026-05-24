import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Avoid OverwriteModelError on Vercel hot reloads
const AnomalyLog = mongoose.models.AnomalyLog || mongoose.model('AnomalyLog', anomalyLogSchema);

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

function synthesizeSCADA(time, scenario) {
  const hour = time.getHours();
  const minutes = time.getMinutes();
  const fractionalHour = hour + minutes / 60;
  
  const diurnalFactor = 0.8 - 0.5 * Math.cos((fractionalHour - 3) * Math.PI / 12) 
                      + 0.15 * Math.sin((fractionalHour - 8) * Math.PI / 6);
  
  let demandVal = SENSOR_META.D_11.base * diurnalFactor + (Math.random() - 0.5) * 1.5;
  demandVal = Math.max(0.5, demandVal);

  let flowVal = SENSOR_META.F_02.base * (diurnalFactor * 0.95 + 0.1) + (Math.random() - 0.5) * 2.0;
  flowVal = Math.max(2.0, flowVal);

  let pressureVal = SENSOR_META.P_04.base - (flowVal / 60) + (Math.random() - 0.5) * 0.15;
  pressureVal = Math.max(0.2, pressureVal);

  let tankVal = SENSOR_META.T_01.base + 0.6 * Math.cos((fractionalHour - 5) * Math.PI / 12) + (Math.random() - 0.5) * 0.05;
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
// 3. REST API ENDPOINTS
// --------------------------------------------------------------------------

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
