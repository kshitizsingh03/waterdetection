/* High-Performance Cyber-SCADA Core & ONNX Inference Controller */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const authPortal = document.getElementById('auth-portal');
  const scadaDashboard = document.getElementById('scada-dashboard');
  
  const signupForm = document.getElementById('signup-form');
  const loginForm = document.getElementById('login-form');
  const toLogin = document.getElementById('to-login');
  const toSignup = document.getElementById('to-signup');
  const authTitle = document.getElementById('auth-title');
  const authSubtitle = document.getElementById('auth-subtitle');
  
  const signupError = document.getElementById('signup-error');
  const loginError = document.getElementById('login-error');
  
  const operatorDisplayName = document.getElementById('operator-display-name');
  const btnLogout = document.getElementById('btn-logout');
  
  // Stats
  const valStatus = document.getElementById('val-status');
  const valMse = document.getElementById('val-mse');
  const valLimit = document.getElementById('val-limit');
  const valTime = document.getElementById('val-time');
  
  const cardStatus = document.getElementById('card-status');
  const cardTime = document.getElementById('card-time');
  const iconTime = document.getElementById('icon-time');
  
  // Telemetry Input
  const featuresInput = document.getElementById('features-input');
  const inputFeedback = document.getElementById('input-feedback');
  const btnPredict = document.getElementById('btn-predict');
  const btnLoadNormal = document.getElementById('btn-load-normal');
  const btnLoadLeak = document.getElementById('btn-load-leak');
  
  // Pipeline Visuals
  const activePipe = document.getElementById('active-pipe');
  const particlesContainer = document.getElementById('particles-container');
  const leakageSpray = document.getElementById('leakage-spray');
  
  const visStatusOverlay = document.getElementById('visualizer-status-overlay');
  
  // High-Tech Gauge & Console Log elements
  const gaugeBar = document.getElementById('gauge-bar');
  const gaugeRatio = document.getElementById('gauge-ratio');
  const consoleLogs = document.getElementById('console-logs');
  const btnClearConsole = document.getElementById('btn-clear-console');

  // --- Preconfigured telemetry data ---
  const normalSample = [
    28.2048, 33.2571, 36.6379, 36.9094, 50.2350, 53.6492, 52.2349, 54.9353, 39.0802, 52.1226, 
    52.4001, 42.1744, 56.1168, 46.2020, 30.5379, 45.1940, 36.3382, 43.1140, 47.2216, 51.4645, 
    53.2960, 54.4930, 47.1892, 54.3641, 55.6785, 45.1813, 47.1365, 46.9764, 45.8256, 46.7394, 
    43.6523, 48.8652, 48.2186, 95.0308, 106.0651, 24.2192, 3.1175, 16185.6068, 10.5806, 0.0000
  ];

  const leakSample = [
    28.2180, 33.2738, 36.5991, 36.7745, 50.1904, 56.1850, 52.1111, 54.9527, 39.0826, 51.9724, 
    52.4366, 42.1768, 52.6095, 46.3621, 30.7372, 45.2836, 36.3503, 43.0745, 47.2667, 51.5266, 
    53.2188, 54.4949, 47.1217, 54.3754, 55.7635, 48.8999, 47.1957, 47.0048, 45.8587, 46.7243, 
    43.6686, 48.8513, 48.2179, 102.8894, 95.3147, 28.6024, 3.1119, 17388.9246, 11.5635, 1.0000
  ];

  let scaler = null;
  let session = null;

  // --- High-Tech Logger ---
  function writeLog(message, type = 'info') {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    
    let typeBadge = '[INFO]';
    if (type === 'success') typeBadge = '[OK]';
    if (type === 'warning') typeBadge = '[WARN]';
    if (type === 'error') typeBadge = '[FAIL]';

    const logLine = document.createElement('div');
    logLine.className = 'console-line';
    logLine.innerHTML = `
      <span class="log-time">[${timeStr}]</span> 
      <span class="log-${type}">${typeBadge}</span> ${message}
    `;
    
    consoleLogs.appendChild(logLine);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
  }

  // Clear Event Log
  btnClearConsole.addEventListener('click', () => {
    consoleLogs.innerHTML = '';
    writeLog("System Event Log cleared by operator.");
  });

  // --- Auth Flow & Operator Account Persistence ---
  function getOperator() {
    const operatorStr = localStorage.getItem('operatorAccount');
    return operatorStr ? JSON.parse(operatorStr) : null;
  }

  function checkSession() {
    const activeSession = localStorage.getItem('operatorSession');
    const operator = getOperator();
    
    if (activeSession && operator) {
      // User is logged in
      authPortal.classList.add('hidden');
      scadaDashboard.classList.remove('hidden');
      operatorDisplayName.textContent = operator.name.toUpperCase();
      writeLog(`Operator ${operator.name.toUpperCase()} authenticated. SCADA terminal session active.`, 'success');
      initONNX();
    } else {
      // Show login or register screen
      scadaDashboard.classList.add('hidden');
      authPortal.classList.remove('hidden');
      if (operator) {
        showLoginForm();
      } else {
        showSignupForm();
      }
    }
  }

  function showLoginForm() {
    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    authTitle.textContent = "Operator Authorization";
    authSubtitle.textContent = "Authenticate operator passkey credentials to access SCADA core terminal";
  }

  function showSignupForm() {
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
    authTitle.textContent = "Operator Registration";
    authSubtitle.textContent = "Register local operator passkey files to initialize the SCADA telemetry grid node";
  }

  toLogin.addEventListener('click', (e) => {
    e.preventDefault();
    showLoginForm();
  });

  toSignup.addEventListener('click', (e) => {
    e.preventDefault();
    showSignupForm();
  });

  // Handle registration
  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    signupError.textContent = '';
    
    const name = document.getElementById('signup-name').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;
    
    if (!name) {
      signupError.textContent = "Operator Username cannot be blank.";
      return;
    }
    if (password.length < 4) {
      signupError.textContent = "Passkey must be at least 4 characters.";
      return;
    }
    if (password !== confirm) {
      signupError.textContent = "Passkey credentials do not match.";
      return;
    }
    
    // Save account locally
    const operator = { name, password };
    localStorage.setItem('operatorAccount', JSON.stringify(operator));
    localStorage.setItem('operatorSession', 'active');
    
    checkSession();
  });

  // Handle Login
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginError.textContent = '';
    
    const name = document.getElementById('login-name').value.trim();
    const password = document.getElementById('login-password').value;
    
    const operator = getOperator();
    if (!operator || operator.name !== name || operator.password !== password) {
      loginError.textContent = "Invalid operator credentials.";
      writeLog(`Unauthorized access attempt denied for operator ID "${name.toUpperCase()}".`, 'error');
      return;
    }
    
    localStorage.setItem('operatorSession', 'active');
    checkSession();
  });

  // Handle Logout
  btnLogout.addEventListener('click', () => {
    const operator = getOperator();
    writeLog(`Operator ${operator ? operator.name.toUpperCase() : 'USER'} securely logged out. Session locked.`, 'warning');
    localStorage.removeItem('operatorSession');
    checkSession();
  });

  // --- ONNX Runtime & Inference System ---
  async function initONNX() {
    try {
      btnPredict.disabled = true;
      btnPredict.textContent = 'CONNECTING TO AUTOENCODER NEURAL MODEL...';
      writeLog("Connecting to neural networks core...", 'info');

      // 1. Fetch scaler parameters from public scaler.json
      const scalerRes = await fetch('./scaler.json');
      scaler = await scalerRes.json();
      writeLog("Standard Scaler coefficients loaded successfully [scaler.json].", 'success');

      // 2. Initialize ONNX runtime session from public model
      session = await ort.InferenceSession.create('./gru_ae_best.onnx');
      writeLog("ONNX Runtime engine online. GRU Autoencoder loaded successfully [gru_ae_best.onnx].", 'success');

      btnPredict.disabled = false;
      btnPredict.textContent = '⚡ Run GRU Neural Network pass';
      writeLog("Core SCADA Telemetry terminal ready for input.", 'success');
    } catch (err) {
      console.error('Failed to load ONNX or Scaler:', err);
      inputFeedback.textContent = 'Failed to load model: ' + err.message + '. Please check that gru_ae_best.onnx is compiled in the public directory.';
      writeLog("Core ML system load failure: " + err.message, 'error');
    }
  }

  // --- Telemetry Input Loading ---
  btnLoadNormal.addEventListener('click', () => {
    featuresInput.value = normalSample.join(", ");
    inputFeedback.textContent = '';
    writeLog("Nominal SCADA Telemetry dataset snapshot loaded into RX Terminal.", 'info');
    resetUI();
  });

  btnLoadLeak.addEventListener('click', () => {
    featuresInput.value = leakSample.join(", ");
    inputFeedback.textContent = '';
    writeLog("Anomaly SCADA Telemetry dataset snapshot loaded into RX Terminal.", 'warning');
    resetUI();
  });

  function resetUI() {
    valStatus.textContent = "STANDBY";
    valStatus.className = "stat-value";
    cardStatus.style.borderColor = "var(--border-color)";
    
    valMse.textContent = "0.000000";
    valMse.className = "stat-value text-cyan";
    
    // Normal state visuals
    activePipe.classList.remove('pipe-alert-leak');
    particlesContainer.setAttribute('opacity', '1');
    leakageSpray.classList.add('hidden');
    
    gaugeBar.style.width = "0%";
    gaugeBar.className = "gauge-bar-inner";
    gaugeRatio.textContent = "0.0%";
    
    visStatusOverlay.className = "pipeline-alert-overlay";
    visStatusOverlay.innerHTML = `
      <span class="visualizer-status-badge status-normal">SYSTEM INITIALIZED</span>
      <p class="visualizer-status-description">Inference gateway ready. Awaiting telemetry snapshot pass...</p>
    `;
  }

  // --- Run Telemetry Inference ---
  btnPredict.addEventListener('click', async () => {
    inputFeedback.textContent = '';
    
    if (!session || !scaler) {
      inputFeedback.textContent = 'Autoencoder model is still initializing. Please wait...';
      return;
    }

    const rawVal = featuresInput.value.trim();
    if (!rawVal) {
      inputFeedback.textContent = 'Please enter or load SCADA telemetry data.';
      return;
    }

    // Parse and validate 40 SCADA columns
    const parts = rawVal.split(',').map(s => s.trim()).filter(s => s !== '');
    if (parts.length !== 40) {
      inputFeedback.textContent = `Error: Expected exactly 40 SCADA channels. You provided ${parts.length}.`;
      writeLog(`Telemetry packet rejection: Expected 40 telemetry channels, got ${parts.length}.`, 'error');
      return;
    }

    const features = [];
    for (let p of parts) {
      const num = Number(p);
      if (isNaN(num)) {
        inputFeedback.textContent = `Error: Value "${p}" is not a valid SCADA reading.`;
        writeLog(`Telemetry packet rejection: Invalid float literal "${p}".`, 'error');
        return;
      }
      features.push(num);
    }

    try {
      btnPredict.disabled = true;
      btnPredict.classList.add('scanning');
      btnPredict.textContent = 'RUNNING GRU AUTOENCODER EVALUATION...';
      writeLog("Running feedforward pass through the GRU Autoencoder network...", 'info');

      // Simulate a high-tech scan delay for scanline effects (700ms)
      await new Promise(r => setTimeout(r, 700));

      // 1. Telemetry Scaling: (x - mean) / scale
      const mean = scaler.mean;
      const scale = scaler.scale;
      const scaledFeatures = features.map((x, i) => (x - mean[i]) / scale[i]);

      // 2. Prepare ONNX Input Tensor: shape [1, 1, 40]
      const inputTensor = new ort.Tensor('float32', new Float32Array(scaledFeatures), [1, 1, 40]);
      
      // 3. Evaluate using ONNX session
      const feeds = { input: inputTensor };
      const outputMap = await session.run(feeds);
      
      const outputTensor = outputMap.output;
      const outputData = outputTensor.data; // Reconstructed SCADA array of length 40

      // 4. Calculate Reconstruction Error (MSE)
      let sumSqErr = 0;
      for (let i = 0; i < 40; i++) {
        sumSqErr += Math.pow(scaledFeatures[i] - outputData[i], 2);
      }
      const mse = sumSqErr / 40;

      // 5. Dynamic Strictness Context depending on Nighttime flag (index 39)
      const isNighttime = features[39] === 1;
      const threshold = isNighttime ? 0.0016 : 0.0048;
      const isLeak = mse > threshold;

      // 6. Update Dashboard Widgets
      if (isLeak) {
        valStatus.textContent = "LEAK ALARM";
        valStatus.className = "stat-value text-danger";
        cardStatus.style.borderColor = "rgba(255, 0, 85, 0.4)";
        writeLog(`CRITICAL ANOMALY ALERT! Telemetry MSE ${mse.toFixed(6)} exceeds threshold ${threshold.toFixed(6)} [Segment V1-V2].`, 'error');
      } else {
        valStatus.textContent = "SECURE";
        valStatus.className = "stat-value text-success";
        cardStatus.style.borderColor = "rgba(57, 255, 20, 0.4)";
        writeLog(`Telemetry health nominal. MSE ${mse.toFixed(6)} well within operating limits (Limit: ${threshold.toFixed(6)}).`, 'success');
      }

      valMse.textContent = mse.toFixed(6);
      valLimit.textContent = threshold.toFixed(6);

      if (isNighttime) {
        valTime.textContent = "NIGHT CONTEXT";
        iconTime.textContent = "🌙";
        cardTime.style.borderColor = "rgba(147, 51, 234, 0.4)";
        writeLog("Operations switched to LUNAR SOLAR nighttime telemetry constraints.", 'info');
      } else {
        valTime.textContent = "DAY CONTEXT";
        iconTime.textContent = "☀️";
        cardTime.style.borderColor = "rgba(6, 182, 212, 0.4)";
        writeLog("Operations switched to SOLAR daytime telemetry constraints.", 'info');
      }

      // Update Telemetry Progress Gauge Ratio
      const ratio = Math.min((mse / threshold) * 100, 100);
      gaugeRatio.textContent = ratio.toFixed(1) + "%";
      gaugeBar.style.width = ratio + "%";
      
      if (isLeak) {
        gaugeBar.className = "gauge-bar-inner gauge-bar-leak";
      } else {
        gaugeBar.className = "gauge-bar-inner";
      }

      // 7. Render Pipeline Animative Flow States
      if (isLeak) {
        activePipe.classList.add('pipe-alert-leak');
        particlesContainer.setAttribute('opacity', '0.2');
        leakageSpray.classList.remove('hidden');
        
        visStatusOverlay.innerHTML = `
          <span class="visualizer-status-badge status-leak">🚨 CRITICAL</span>
          <p class="visualizer-status-description">Leak detected in pipeline segment. Anomaly ratio at ${ratio.toFixed(1)}% of threshold capacity.</p>
        `;
      } else {
        activePipe.classList.remove('pipe-alert-leak');
        particlesContainer.setAttribute('opacity', '1');
        leakageSpray.classList.add('hidden');
        
        visStatusOverlay.innerHTML = `
          <span class="visualizer-status-badge status-normal">🟢 HEALTHY</span>
          <p class="visualizer-status-description">Flow nominal. Pipeline integrity verified at ${ratio.toFixed(1)}% telemetry loss threshold.</p>
        `;
      }

    } catch (err) {
      console.error(err);
      inputFeedback.textContent = 'Analysis evaluation failed: ' + err.message;
      writeLog("Telemetry scan failure: " + err.message, 'error');
    } finally {
      btnPredict.disabled = false;
      btnPredict.classList.remove('scanning');
      btnPredict.textContent = '⚡ Run GRU Neural Network pass';
    }
  });

  // Initialize page session
  checkSession();
});
