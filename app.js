/* ==========================================================================
   SMART WATER LEAKAGE & THEFT DETECTION SYSTEM - CLIENT PORTAL LOGIC
   Connects to Express REST APIs with MongoDB Atlas & Adaptive Thresholds
   ========================================================================== */

// --------------------------------------------------------------------------
// 1. STATE MANAGEMENT & PORTAL ROUTER
// --------------------------------------------------------------------------
const STATE = {
  currentScenario: 'healthy',
  theme: 'dark',
  currentTime: new Date(),
  isDatabaseConnected: false,
  sensorHistory: {
    pressure: [],
    flow: [],
    tank: [],
    demand: [],
    mse: [],
    threshold: [],
    timestamps: []
  },
  tableLogs: [],
  tablePage: 1,
  tablePageSize: 5,
  chartInstance: null,
  activeRangeHours: 6,
  syncIntervalId: null
};

// Base API URI (works for both local port 3000 or production live URLs)
const API_BASE = window.location.origin;

// --------------------------------------------------------------------------
// 2. BACKEND REST CLIENT (API FETCHERS)
// --------------------------------------------------------------------------

/**
 * Sync server-side status configurations (clock, scenarios, db status)
 */
async function fetchServerStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/status`);
    const data = await response.json();
    
    STATE.currentScenario = data.currentScenario;
    STATE.currentTime = new Date(data.currentTime);
    STATE.isDatabaseConnected = data.isDatabaseConnected;
    
    // Update live indicators on header
    updateHeaderWidgets(data);
  } catch (err) {
    console.error('Failed to sync server status:', err);
  }
}

/**
 * Fetch SCADA timeline history from the server API
 */
async function fetchTelemetryData() {
  try {
    const response = await fetch(`${API_BASE}/api/telemetry`);
    const data = await response.json();
    
    STATE.sensorHistory = data;
    
    // Update chart datasets & sparklines
    updateChartColorsAndData();
    drawSparklines();
  } catch (err) {
    console.error('Failed to fetch telemetry data:', err);
  }
}

/**
 * Push scenario changes to backend Express server
 */
async function setServerScenario(newScenario) {
  try {
    const response = await fetch(`${API_BASE}/api/scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: newScenario })
    });
    const data = await response.json();
    
    if (data.success) {
      STATE.currentScenario = newScenario;
      
      // Update simulator button UI states
      document.querySelectorAll('.scenario-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-scenario') === newScenario) {
          btn.classList.add('active');
        }
      });

      // Reload dataset queue and rebuild charts immediately
      await fetchTelemetryData();
      await fetchLogsHistory();
      updateDashboardUI();
    }
  } catch (err) {
    console.error('Failed to set server scenario:', err);
  }
}

/**
 * Fetch leak logs history from MongoDB Atlas Cloud / Local Memory Fallback
 */
async function fetchLogsHistory() {
  try {
    const searchVal = document.getElementById('search-input').value;
    const riskFilter = document.getElementById('filter-risk').value;
    
    const params = new URLSearchParams({
      search: searchVal,
      risk: riskFilter
    });
    
    const response = await fetch(`${API_BASE}/api/logs?${params}`);
    const data = await response.json();
    
    STATE.tableLogs = data;
    
    // Refresh table and paginated rows
    renderTableLogs();
  } catch (err) {
    console.error('Failed to fetch logs history:', err);
  }
}

// --------------------------------------------------------------------------
// 3. UTILITY FORMATTERS
// --------------------------------------------------------------------------

function formatTimeOnly(date) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// --------------------------------------------------------------------------
// 4. CHART.JS GRAPH ENGINE
// --------------------------------------------------------------------------

function buildReconstructionChart() {
  const ctx = document.getElementById('reconstruction-chart').getContext('2d');
  
  const textSecondary = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();
  const gridColor = getComputedStyle(document.body).getPropertyValue('--chart-grid-color').trim();
  const accentColor = getComputedStyle(document.body).getPropertyValue('--accent-color').trim();
  const dangerColor = getComputedStyle(document.body).getPropertyValue('--danger-color').trim();

  // Create clean gradient fills
  const gradientFill = ctx.createLinearGradient(0, 0, 0, 300);
  gradientFill.addColorStop(0, 'rgba(6, 182, 212, 0.25)');
  gradientFill.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

  const chartConfig = {
    type: 'line',
    data: {
      labels: STATE.sensorHistory.timestamps,
      datasets: [
        {
          label: 'Autoencoder Reconstruction Error (MSE)',
          data: STATE.sensorHistory.mse,
          borderColor: accentColor,
          borderWidth: 2,
          pointBackgroundColor: [],
          pointBorderColor: [],
          pointRadius: [],
          pointHoverRadius: 6,
          fill: true,
          backgroundColor: gradientFill,
          tension: 0.35
        },
        {
          label: 'Adaptive Percentile Threshold',
          data: STATE.sensorHistory.threshold,
          borderColor: dangerColor,
          borderWidth: 1.8,
          borderDash: [5, 4],
          pointRadius: 0,
          fill: false,
          stepped: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
        easing: 'easeOutQuart'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleFont: { family: 'Outfit', size: 12, weight: 'bold' },
          bodyFont: { family: 'Inter', size: 11 },
          titleColor: '#F8FAFC',
          bodyColor: '#E2E8F0',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: textSecondary,
            font: { family: 'Inter', size: 9 },
            maxRotation: 0,
            autoSkip: true,
            autoSkipPadding: 20
          }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textSecondary,
            font: { family: 'Inter', size: 9 },
            callback: value => value.toFixed(3)
          },
          min: 0.0,
          max: 0.11
        }
      }
    }
  };

  if (STATE.chartInstance) {
    STATE.chartInstance.destroy();
  }

  STATE.chartInstance = new Chart(ctx, chartConfig);
}

function updateChartColorsAndData() {
  if (!STATE.chartInstance) return;

  const datasetMSE = STATE.chartInstance.data.datasets[0];
  const datasetThreshold = STATE.chartInstance.data.datasets[1];
  
  const textSecondary = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();
  const gridColor = getComputedStyle(document.body).getPropertyValue('--chart-grid-color').trim();
  const accentColor = getComputedStyle(document.body).getPropertyValue('--accent-color').trim();
  const dangerColor = getComputedStyle(document.body).getPropertyValue('--danger-color').trim();

  const ctx = document.getElementById('reconstruction-chart').getContext('2d');
  const gradientFill = ctx.createLinearGradient(0, 0, 0, 300);
  gradientFill.addColorStop(0, accentColor.includes('hsl(189') || accentColor.includes('#06B') ? 'rgba(6, 182, 212, 0.25)' : 'rgba(8, 145, 178, 0.25)');
  gradientFill.addColorStop(1, 'rgba(6, 182, 212, 0.0)');
  
  // Set labels and data
  STATE.chartInstance.data.labels = STATE.sensorHistory.timestamps;
  datasetMSE.data = STATE.sensorHistory.mse;
  datasetMSE.borderColor = accentColor;
  datasetMSE.backgroundColor = gradientFill;
  datasetThreshold.data = STATE.sensorHistory.threshold;
  datasetThreshold.borderColor = dangerColor;

  STATE.chartInstance.options.scales.x.ticks.color = textSecondary;
  STATE.chartInstance.options.scales.y.ticks.color = textSecondary;
  STATE.chartInstance.options.scales.y.grid.color = gridColor;

  // Recalculate anomalous point styles
  datasetMSE.pointBackgroundColor = [];
  datasetMSE.pointBorderColor = [];
  datasetMSE.pointRadius = [];
  
  const dataLength = STATE.sensorHistory.mse.length;
  for (let i = 0; i < dataLength; i++) {
    const mseVal = STATE.sensorHistory.mse[i];
    const thres = STATE.sensorHistory.threshold[i];
    
    if (mseVal > thres) {
      const isLeak = STATE.currentScenario === 'leak';
      const ptColor = isLeak ? dangerColor : '#F59E0B';
      datasetMSE.pointBackgroundColor.push(ptColor);
      datasetMSE.pointBorderColor.push(ptColor);
      datasetMSE.pointRadius.push(4);
    } else {
      datasetMSE.pointBackgroundColor.push('transparent');
      datasetMSE.pointBorderColor.push('transparent');
      datasetMSE.pointRadius.push(0);
    }
  }

  STATE.chartInstance.update('none');
}

// --------------------------------------------------------------------------
// 5. TELEMETRY SPARKLINES & BADGES UPDATE
// --------------------------------------------------------------------------

function drawSparklines() {
  const points = 10;
  const buildPath = (dataList) => {
    if (!dataList || dataList.length < points) return '';
    const slice = dataList.slice(-points);
    const min = Math.min(...slice);
    const max = Math.max(...slice);
    const range = (max - min) === 0 ? 1 : (max - min);
    
    let path = `M 0 ${30 - ((slice[0] - min) / range) * 26 - 2}`;
    for (let i = 1; i < points; i++) {
      const x = i * 11;
      const y = 30 - ((slice[i] - min) / range) * 26 - 2;
      path += ` L ${x} ${y}`;
    }
    return path;
  };

  document.getElementById('sparkline-pressure').setAttribute('d', buildPath(STATE.sensorHistory.pressure));
  document.getElementById('sparkline-flow').setAttribute('d', buildPath(STATE.sensorHistory.flow));
  document.getElementById('sparkline-tank').setAttribute('d', buildPath(STATE.sensorHistory.tank));
  document.getElementById('sparkline-demand').setAttribute('d', buildPath(STATE.sensorHistory.demand));
}

// --------------------------------------------------------------------------
// 6. UI UPDATES & DOM SYNC
// --------------------------------------------------------------------------

function updateHeaderWidgets(data) {
  // Update Live System Status Pill
  const statusPill = document.getElementById('system-status-pill');
  const statusText = document.getElementById('system-status-text');
  const chartPulse = document.getElementById('chart-pulse');
  
  statusPill.className = 'status-pill';
  chartPulse.className = 'pulse-indicator';

  if (data.hasBreached) {
    if (data.currentScenario === 'leak') {
      statusPill.classList.add('status-leak');
      statusText.textContent = 'Leak Alert';
      chartPulse.classList.add('pulse-leak');
    } else {
      statusPill.classList.add('status-warning');
      statusText.textContent = 'Bypass Theft';
      chartPulse.classList.add('pulse-warning');
    }
  } else {
    statusPill.classList.add('status-healthy');
    statusText.textContent = 'Healthy';
    chartPulse.classList.add('pulse-normal');
  }

  // Update Database Connection status badge
  const dbPill = document.getElementById('db-status-pill');
  const dbText = document.getElementById('db-status-text');
  
  dbPill.className = 'status-pill';
  if (data.isDatabaseConnected) {
    dbPill.classList.add('status-healthy');
    dbText.textContent = 'Cloud Synced';
  } else {
    dbPill.classList.add('status-warning');
    dbText.textContent = 'Local Fallback';
  }
}

function updateDashboardUI() {
  if (STATE.sensorHistory.mse.length === 0) return;

  const latestPressure = STATE.sensorHistory.pressure[STATE.sensorHistory.pressure.length - 1];
  const latestFlow = STATE.sensorHistory.flow[STATE.sensorHistory.flow.length - 1];
  const latestTank = STATE.sensorHistory.tank[STATE.sensorHistory.tank.length - 1];
  const latestDemand = STATE.sensorHistory.demand[STATE.sensorHistory.demand.length - 1];
  const latestMSE = STATE.sensorHistory.mse[STATE.sensorHistory.mse.length - 1];
  const latestThreshold = STATE.sensorHistory.threshold[STATE.sensorHistory.threshold.length - 1];
  
  const hasBreached = latestMSE > latestThreshold;
  const isNight = isNightHours(STATE.currentTime);

  // 1. KPI 1: Network Health % Ring
  let healthPercent = 98.4;
  if (STATE.currentScenario === 'leak') healthPercent = 64.2;
  else if (STATE.currentScenario === 'theft') healthPercent = 83.5;
  
  document.getElementById('kpi-health-value').textContent = `${healthPercent.toFixed(1)}%`;
  
  const healthRing = document.getElementById('kpi-health-ring');
  const healthPctText = document.getElementById('ring-pct-text');
  healthPctText.textContent = `${Math.round(healthPercent)}%`;
  
  const offset = 150.79 - (healthPercent / 100) * 150.79;
  healthRing.style.strokeDashoffset = offset;
  
  const dangerColor = getComputedStyle(document.body).getPropertyValue('--danger-color').trim();
  const warningColor = getComputedStyle(document.body).getPropertyValue('--warning-color').trim();
  const accentColor = getComputedStyle(document.body).getPropertyValue('--accent-color').trim();
  
  if (healthPercent < 70) healthRing.style.stroke = dangerColor;
  else if (healthPercent < 90) healthRing.style.stroke = warningColor;
  else healthRing.style.stroke = accentColor;

  const healthTrend = document.getElementById('kpi-health-trend');
  if (healthPercent < 70) {
    healthTrend.className = 'kpi-trend';
    healthTrend.style.backgroundColor = 'var(--danger-color-light)';
    healthTrend.style.color = 'var(--danger-color)';
    healthTrend.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg> Critical`;
  } else if (healthPercent < 90) {
    healthTrend.className = 'kpi-trend';
    healthTrend.style.backgroundColor = 'var(--warning-color-light)';
    healthTrend.style.color = 'var(--warning-color)';
    healthTrend.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg> Anomaly`;
  } else {
    healthTrend.className = 'kpi-trend trend-up';
    healthTrend.style.backgroundColor = 'var(--success-color-light)';
    healthTrend.style.color = 'var(--success-color)';
    healthTrend.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg> Optimal`;
  }

  // 2. KPI 2: Anomalies count
  document.getElementById('kpi-anomalies-value').textContent = STATE.tableLogs.length;

  // 3. KPI 3: Reconstruction Error
  document.getElementById('kpi-mse-value').textContent = latestMSE.toFixed(4);
  const mseDelta = document.getElementById('kpi-mse-delta');
  const mseStatus = document.getElementById('kpi-mse-status');
  if (hasBreached) {
    mseDelta.className = 'kpi-trend';
    mseDelta.style.backgroundColor = 'var(--danger-color-light)';
    mseDelta.style.color = 'var(--danger-color)';
    mseStatus.textContent = 'Breach Limit';
  } else {
    mseDelta.className = 'kpi-trend trend-stable';
    mseDelta.style.backgroundColor = 'var(--success-color-light)';
    mseDelta.style.color = 'var(--success-color)';
    mseStatus.textContent = 'Below Limit';
  }

  // 4. KPI 4: Threshold mode
  const modeText = isNight ? 'Night (75%)' : 'Day (95%)';
  document.getElementById('kpi-threshold-value').textContent = modeText;
  document.getElementById('kpi-threshold-hours').textContent = isNight ? '02:00 AM – 06:00 AM' : '06:01 AM – 01:59 AM';

  // 5. Telemetry Cards numerics
  document.getElementById('sensor-val-pressure').textContent = latestPressure.toFixed(2);
  document.getElementById('sensor-val-flow').textContent = latestFlow.toFixed(1);
  document.getElementById('sensor-val-tank').textContent = latestTank.toFixed(2);
  document.getElementById('sensor-val-demand').textContent = latestDemand.toFixed(1);

  // Status highlights
  const cardPres = document.getElementById('sensor-card-pressure');
  const cardFlow = document.getElementById('sensor-card-flow');
  const cardTank = document.getElementById('sensor-card-tank');
  const cardDema = document.getElementById('sensor-card-demand');
  
  const statusPres = document.getElementById('sensor-status-pressure');
  const statusFlow = document.getElementById('sensor-status-flow');
  const statusTank = document.getElementById('sensor-status-tank');
  const statusDema = document.getElementById('sensor-status-demand');

  cardPres.className = 'sensor-card glass-card';
  cardFlow.className = 'sensor-card glass-card';
  cardTank.className = 'sensor-card glass-card';
  cardDema.className = 'sensor-card glass-card';
  
  statusPres.className = 'status-badge badge-success'; statusPres.textContent = 'Normal';
  statusFlow.className = 'status-badge badge-success'; statusFlow.textContent = 'Normal';
  statusTank.className = 'status-badge badge-success'; statusTank.textContent = 'Normal';
  statusDema.className = 'status-badge badge-success'; statusDema.textContent = 'Normal';

  if (hasBreached) {
    if (STATE.currentScenario === 'leak') {
      cardPres.classList.add('border-leak-pulse');
      cardFlow.classList.add('border-leak-pulse');
      statusPres.className = 'status-badge badge-danger'; statusPres.textContent = 'Leak Alert';
      statusFlow.className = 'status-badge badge-danger'; statusFlow.textContent = 'High Burst';
    } 
    else if (STATE.currentScenario === 'theft') {
      cardDema.classList.add('border-theft-pulse');
      cardFlow.classList.add('border-theft-pulse');
      statusDema.className = 'status-badge badge-warning'; statusDema.textContent = 'Unauth Draw';
      statusFlow.className = 'status-badge badge-warning'; statusFlow.textContent = 'Low Night Drop';
    }
  }

  // 6. Confidence Gauge
  let confidenceVal = 92.4;
  let gaugeStatus = 'Optimal Reconstruct';
  let gaugeSubtitle = 'Autoencoder MSE is tightly coupled with the baseline signature.';
  
  if (hasBreached) {
    if (STATE.currentScenario === 'leak') {
      confidenceVal = 44.5;
      gaugeStatus = 'Severe Reconstruction Fail';
      gaugeSubtitle = 'SCADA pattern diverged completely from trained baseline parameters.';
    } else {
      confidenceVal = 71.2;
      gaugeStatus = 'Anomalous Phase Shift';
      gaugeSubtitle = 'Elevated residual errors detected. High probability of theft bypass.';
    }
  }

  document.getElementById('gauge-pct').textContent = `${confidenceVal.toFixed(1)}%`;
  document.getElementById('gauge-title-status').textContent = gaugeStatus;
  document.getElementById('gauge-subtitle-desc').textContent = gaugeSubtitle;
  
  const gaugeFill = document.getElementById('gauge-fill');
  const gaugeOffset = 125.6 - (confidenceVal / 100) * 125.6;
  gaugeFill.style.strokeDashoffset = gaugeOffset;
  
  if (confidenceVal < 60) gaugeFill.style.stroke = dangerColor;
  else if (confidenceVal < 85) gaugeFill.style.stroke = warningColor;
  else gaugeFill.style.stroke = accentColor;

  // 7. Heatmap lines glowing
  const pipeResJunc = document.getElementById('pipe-res-junc');
  const pipeJuncP1 = document.getElementById('pipe-junc-p1');
  const pipeJuncP2 = document.getElementById('pipe-junc-p2');
  const pipeP1Tank = document.getElementById('pipe-p1-tank');
  const pipeP2P3 = document.getElementById('pipe-p2-p3');
  const pipeTankP3 = document.getElementById('pipe-tank-p3');

  const nodeP1 = document.getElementById('node-p1');
  const nodeP2 = document.getElementById('node-p2');
  const nodeP3 = document.getElementById('node-p3');

  pipeResJunc.style.stroke = accentColor; pipeResJunc.setAttribute('stroke-width', '3');
  pipeJuncP1.style.stroke = accentColor; pipeJuncP1.setAttribute('stroke-width', '3');
  pipeJuncP2.style.stroke = accentColor; pipeJuncP2.setAttribute('stroke-width', '3');
  pipeP1Tank.style.stroke = accentColor; pipeP1Tank.setAttribute('stroke-width', '3');
  pipeP2P3.style.stroke = accentColor; pipeP2P3.setAttribute('stroke-width', '3');
  pipeTankP3.style.stroke = accentColor; pipeTankP3.setAttribute('stroke-width', '3');

  nodeP1.setAttribute('fill', accentColor); nodeP1.setAttribute('r', '6');
  nodeP2.setAttribute('fill', accentColor); nodeP2.setAttribute('r', '6');
  nodeP3.setAttribute('fill', accentColor); nodeP3.setAttribute('r', '6');

  if (hasBreached) {
    if (STATE.currentScenario === 'leak') {
      pipeJuncP2.style.stroke = dangerColor; pipeJuncP2.setAttribute('stroke-width', '5');
      pipeP2P3.style.stroke = dangerColor; pipeP2P3.setAttribute('stroke-width', '5');
      nodeP2.setAttribute('fill', dangerColor); nodeP2.setAttribute('r', '9');
    } 
    else if (STATE.currentScenario === 'theft') {
      pipeTankP3.style.stroke = warningColor; pipeTankP3.setAttribute('stroke-width', '4');
      pipeP2P3.style.stroke = warningColor; pipeP2P3.setAttribute('stroke-width', '4');
      nodeP3.setAttribute('fill', warningColor); nodeP3.setAttribute('r', '8');
    }
  }
}

// --------------------------------------------------------------------------
// 7. AUDIT TABLE RENDERING
// --------------------------------------------------------------------------

function renderTableLogs() {
  const tbody = document.getElementById('table-body');
  const filtered = STATE.tableLogs;

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / STATE.tablePageSize) || 1;
  
  if (STATE.tablePage > totalPages) {
    STATE.tablePage = totalPages;
  }

  const startIdx = (STATE.tablePage - 1) * STATE.tablePageSize;
  const endIdx = Math.min(startIdx + STATE.tablePageSize, totalItems);
  const paginatedItems = filtered.slice(startIdx, endIdx);

  tbody.innerHTML = '';

  if (paginatedItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 24px; color: var(--text-tertiary);">
          No anomalous event logs matching selected criteria.
        </td>
      </tr>
    `;
    document.getElementById('pagination-info').textContent = 'Showing 0 to 0 of 0 entries';
    document.getElementById('btn-prev').disabled = true;
    document.getElementById('btn-next').disabled = true;
    return;
  }

  paginatedItems.forEach(item => {
    const row = document.createElement('tr');
    
    let riskBadgeClass = 'badge-success';
    if (item.risk === 'High') riskBadgeClass = 'badge-danger';
    else if (item.risk === 'Medium') riskBadgeClass = 'badge-warning';

    let statusPillClass = 'badge-success';
    if (item.risk === 'High') statusPillClass = 'badge-danger';
    else if (item.risk === 'Medium') statusPillClass = 'badge-warning';

    row.innerHTML = `
      <td>${item.timestamp}</td>
      <td><strong>${item.sensorId}</strong></td>
      <td><code>${Number(item.mse).toFixed(4)}</code></td>
      <td><code>${Number(item.threshold).toFixed(3)}</code></td>
      <td><span class="status-badge ${riskBadgeClass}">${item.risk} Risk</span></td>
      <td><span class="status-badge ${statusPillClass}">${item.status}</span></td>
    `;
    tbody.appendChild(row);
  });

  document.getElementById('pagination-info').textContent = `Showing ${startIdx + 1} to ${endIdx} of ${totalItems} entries`;
  
  document.getElementById('btn-prev').disabled = STATE.tablePage === 1;
  document.getElementById('btn-next').disabled = STATE.tablePage === totalPages;
}

function downloadLogsCSV() {
  if (STATE.tableLogs.length === 0) {
    alert('No anomaly records available to export.');
    return;
  }

  let csvContent = 'data:text/csv;charset=utf-8,';
  csvContent += 'Timestamp,Sensor ID,Reconstruction MSE,Threshold Limit,Risk Level,Status\r\n';

  STATE.tableLogs.forEach(row => {
    const line = `"${row.timestamp}","${row.sensorId}",${row.mse},${row.threshold},"${row.risk}","${row.status}"`;
    csvContent += line + '\r\n';
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `SmartWater_Cloud_Anomalies_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --------------------------------------------------------------------------
// 8. CRON LOOPS & SCENARIO ROTATIONS
// --------------------------------------------------------------------------

/**
 * Single tick execution. Fetches telemetry and server updates
 */
async function handlePeriodicSync() {
  await fetchServerStatus();
  await fetchTelemetryData();
  await fetchLogsHistory();
  updateDashboardUI();
}

function handleThemeToggle() {
  const body = document.body;
  const isDark = body.classList.contains('dark-theme');
  
  if (isDark) {
    body.classList.remove('dark-theme');
    body.classList.add('light-theme');
    STATE.theme = 'light';
    document.querySelector('.moon-icon').classList.add('hidden');
    document.querySelector('.sun-icon').classList.remove('hidden');
  } else {
    body.classList.remove('light-theme');
    body.classList.add('dark-theme');
    STATE.theme = 'dark';
    document.querySelector('.sun-icon').classList.add('hidden');
    document.querySelector('.moon-icon').classList.remove('hidden');
  }

  updateChartColorsAndData();
  updateDashboardUI();
}

function isNightHours(date) {
  const hours = date.getHours();
  return (hours >= 2 && hours < 6);
}

// --------------------------------------------------------------------------
// 9. EVENT BINDING & APP INITIALIZATION
// --------------------------------------------------------------------------

async function bootstrapApp() {
  // 1. Initial sync with server
  await fetchServerStatus();
  await fetchTelemetryData();
  await fetchLogsHistory();

  // 2. Build live chart instance
  buildReconstructionChart();
  updateDashboardUI();

  // 3. Setup periodic sync interval (every 3 seconds)
  STATE.syncIntervalId = setInterval(handlePeriodicSync, 3000);
  
  // Local second clock
  setInterval(() => {
    const clockElement = document.getElementById('live-clock');
    if (clockElement) {
      clockElement.textContent = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    }
  }, 1000);

  // 4. Bind DOM User Events
  document.getElementById('btn-scenario-healthy').addEventListener('click', () => setServerScenario('healthy'));
  document.getElementById('btn-scenario-leak').addEventListener('click', () => setServerScenario('leak'));
  document.getElementById('btn-scenario-theft').addEventListener('click', () => setServerScenario('theft'));

  document.getElementById('theme-toggle-btn').addEventListener('click', handleThemeToggle);
  document.getElementById('export-csv-btn').addEventListener('click', downloadLogsCSV);

  // Filters
  document.getElementById('search-input').addEventListener('input', () => {
    STATE.tablePage = 1;
    fetchLogsHistory();
  });
  document.getElementById('filter-risk').addEventListener('change', () => {
    STATE.tablePage = 1;
    fetchLogsHistory();
  });

  // Table pagination
  document.getElementById('btn-prev').addEventListener('click', () => {
    if (STATE.tablePage > 1) {
      STATE.tablePage--;
      renderTableLogs();
    }
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    STATE.tablePage++;
    renderTableLogs();
  });

  // Time range button adjusting
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      
      const hours = parseInt(e.currentTarget.getAttribute('data-hours'));
      STATE.activeRangeHours = hours;
      
      if (hours === 1) {
        STATE.chartInstance.options.scales.x.ticks.autoSkipPadding = 40;
      } else if (hours === 6) {
        STATE.chartInstance.options.scales.x.ticks.autoSkipPadding = 20;
      } else {
        STATE.chartInstance.options.scales.x.ticks.autoSkipPadding = 10;
      }
      STATE.chartInstance.update();
    });
  });
}

// Initialise
bootstrapApp();
