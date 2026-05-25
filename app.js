/* Classic Dashboard Controller & ONNX Inference */

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
  
  // Theme Toggle
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const iconSun = document.getElementById('icon-sun');
  const iconMoon = document.getElementById('icon-moon');
  let isNightMode = true;
  
  // Stats
  const valStatus = document.getElementById('val-status');
  const valMse = document.getElementById('val-mse');
  const valLimit = document.getElementById('val-limit');
  const cardStatus = document.getElementById('card-status');
  
  // Telemetry Input
  const featuresInput = document.getElementById('features-input');
  const inputFeedback = document.getElementById('input-feedback');
  const btnPredict = document.getElementById('btn-predict');
  const btnLoadNormal = document.getElementById('btn-load-normal');
  const btnLoadLeak = document.getElementById('btn-load-leak');
  
  // Pipeline Visuals
  const waterFlow = document.getElementById('water-flow');
  const scannerBeam = document.getElementById('scanner-beam');
  const leakParticles = document.getElementById('leak-particles');
  const visStatusOverlay = document.getElementById('visualizer-status-overlay');
  
  // High-Tech Gauge & Console Log elements
  const gaugeBar = document.getElementById('gauge-bar');
  const gaugeRatio = document.getElementById('gauge-ratio');
  const consoleLogs = document.getElementById('console-logs');
  const btnClearConsole = document.getElementById('btn-clear-console');

  // --- Audio Alarm System ---
  let audioCtx = null;
  let alarmInterval = null;

  function triggerAlarm() {
    if (alarmInterval) clearInterval(alarmInterval);
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    if (audioCtx.state === 'suspended') audioCtx.resume();

    let beeps = 0;
    const maxBeeps = 6; // 6 seconds

    alarmInterval = setInterval(() => {
      if (beeps >= maxBeeps) {
        clearInterval(alarmInterval);
        return;
      }
      
      // SCADA double-beep pattern
      playBeep(880, 0.15, 0);       
      playBeep(880, 0.15, 0.2);     

      beeps++;
    }, 1000);
  }

  function playBeep(frequency, duration, delay) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'square';
    osc.frequency.value = frequency;
    
    const startTime = audioCtx.currentTime + delay;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.05, startTime + 0.02);
    gain.gain.setValueAtTime(0.05, startTime + duration - 0.02);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

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

  // --- Theme Toggle Logic ---
  btnThemeToggle.addEventListener('click', () => {
    isNightMode = !isNightMode;
    if (isNightMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
      iconSun.classList.add('hidden');
      iconMoon.classList.remove('hidden');
      writeLog("Switched to Night Mode (Dark Theme). Threshold will adapt to 0.0016.", 'info');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      iconMoon.classList.add('hidden');
      iconSun.classList.remove('hidden');
      writeLog("Switched to Day Mode (Light Theme). Threshold will adapt to 0.0048.", 'info');
    }
  });

  // --- System Logger ---
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

  btnClearConsole.addEventListener('click', () => {
    consoleLogs.innerHTML = '';
    writeLog("Event Log cleared by operator.");
  });

  // --- Auth Flow ---
  function getOperator() {
    const operatorStr = localStorage.getItem('operatorAccount');
    return operatorStr ? JSON.parse(operatorStr) : null;
  }

  function checkSession() {
    const activeSession = localStorage.getItem('operatorSession');
    const operator = getOperator();
    
    if (activeSession && operator) {
      authPortal.classList.add('hidden');
      scadaDashboard.classList.remove('hidden');
      operatorDisplayName.textContent = operator.name.toUpperCase();
      writeLog(`Operator ${operator.name.toUpperCase()} authenticated.`, 'success');
      initONNX();
    } else {
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
    authTitle.textContent = "Operator Sign In";
    authSubtitle.textContent = "Login to access the pipeline dashboard";
  }

  function showSignupForm() {
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
    authTitle.textContent = "Operator Registration";
    authSubtitle.textContent = "Create an account to access the dashboard";
  }

  toLogin.addEventListener('click', (e) => {
    e.preventDefault();
    showLoginForm();
  });

  toSignup.addEventListener('click', (e) => {
    e.preventDefault();
    showSignupForm();
  });

  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    signupError.textContent = '';
    
    const name = document.getElementById('signup-name').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;
    
    if (!name) return signupError.textContent = "Username cannot be blank.";
    if (password.length < 4) return signupError.textContent = "Password must be at least 4 characters.";
    if (password !== confirm) return signupError.textContent = "Passwords do not match.";
    
    localStorage.setItem('operatorAccount', JSON.stringify({ name, password }));
    localStorage.setItem('operatorSession', 'active');
    checkSession();
  });

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginError.textContent = '';
    
    const name = document.getElementById('login-name').value.trim();
    const password = document.getElementById('login-password').value;
    const operator = getOperator();
    
    if (!operator || operator.name !== name || operator.password !== password) {
      loginError.textContent = "Invalid credentials.";
      return;
    }
    
    localStorage.setItem('operatorSession', 'active');
    checkSession();
  });

  btnLogout.addEventListener('click', () => {
    writeLog(`Operator logged out.`, 'warning');
    localStorage.removeItem('operatorSession');
    checkSession();
  });

  // --- ONNX Runtime ---
  async function initONNX() {
    try {
      btnPredict.disabled = true;
      btnPredict.textContent = 'Initializing Model...';
      writeLog("Connecting to autoencoder model...", 'info');

      const scalerRes = await fetch('./scaler.json');
      scaler = await scalerRes.json();

      session = await ort.InferenceSession.create('./gru_ae_best.onnx');
      writeLog("ONNX Engine loaded successfully.", 'success');

      btnPredict.disabled = false;
      btnPredict.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg> Analyze Telemetry';
    } catch (err) {
      console.error(err);
      writeLog("Model load failure: " + err.message, 'error');
    }
  }

  // --- Data Loading ---
  btnLoadNormal.addEventListener('click', () => {
    featuresInput.value = normalSample.join(", ");
    inputFeedback.textContent = '';
    resetUI();
  });

  btnLoadLeak.addEventListener('click', () => {
    featuresInput.value = leakSample.join(", ");
    inputFeedback.textContent = '';
    resetUI();
  });

  function resetUI() {
    valStatus.textContent = "SECURE";
    valStatus.className = "stat-value";
    
    valMse.textContent = "0.000000";
    valMse.className = "stat-value text-primary";
    
    waterFlow.classList.remove('leak');
    scannerBeam.classList.remove('scanning');
    leakParticles.classList.add('hidden');
    
    gaugeBar.style.width = "0%";
    gaugeBar.className = "gauge-bar-inner";
    gaugeRatio.textContent = "0.0%";
    
    visStatusOverlay.innerHTML = `
      <span class="visualizer-status-badge status-normal">SYSTEM READY</span>
      <p class="visualizer-status-description">Awaiting telemetry data to begin analysis...</p>
    `;
  }

  // --- Prediction & Save to Backend ---
  btnPredict.addEventListener('click', async () => {
    inputFeedback.textContent = '';
    
    if (!session || !scaler) {
      inputFeedback.textContent = 'Model is still initializing...';
      return;
    }

    const rawVal = featuresInput.value.trim();
    if (!rawVal) {
      inputFeedback.textContent = 'Please enter telemetry data.';
      return;
    }

    const parts = rawVal.split(',').map(s => s.trim()).filter(s => s !== '');
    if (parts.length !== 40) {
      inputFeedback.textContent = `Expected 40 channels. Got ${parts.length}.`;
      return;
    }

    const features = [];
    for (let p of parts) {
      const num = Number(p);
      if (isNaN(num)) return inputFeedback.textContent = `Invalid reading: "${p}".`;
      features.push(num);
    }

    // Force day/night mode context based on the UI Toggle
    features[39] = isNightMode ? 1.0 : 0.0;

    try {
      btnPredict.disabled = true;
      btnPredict.textContent = 'Scanning...';
      scannerBeam.classList.add('scanning');
      waterFlow.classList.remove('leak');
      leakParticles.classList.add('hidden');
      writeLog("Analyzing telemetry packet...", 'info');

      // UI Scan Animation Delay
      await new Promise(r => setTimeout(r, 1500));

      const mean = scaler.mean;
      const scale = scaler.scale;
      const scaledFeatures = features.map((x, i) => (x - mean[i]) / scale[i]);

      const inputTensor = new ort.Tensor('float32', new Float32Array(scaledFeatures), [1, 1, 40]);
      const outputMap = await session.run({ input: inputTensor });
      const outputData = outputMap.output.data;

      let sumSqErr = 0;
      for (let i = 0; i < 40; i++) sumSqErr += Math.pow(scaledFeatures[i] - outputData[i], 2);
      const mse = sumSqErr / 40;

      const threshold = isNightMode ? 0.0016 : 0.0048;
      const isLeak = mse > threshold;

      if (isLeak) {
        valStatus.textContent = "LEAK ALARM";
        valStatus.className = "stat-value text-danger";
        writeLog(`Anomaly Detected! MSE: ${mse.toFixed(6)} > ${threshold.toFixed(6)}`, 'error');
        
        // Trigger 6-second audible SCADA alarm
        triggerAlarm();
      } else {
        valStatus.textContent = "SECURE";
        valStatus.className = "stat-value text-success";
        writeLog(`Telemetry nominal. MSE: ${mse.toFixed(6)} <= ${threshold.toFixed(6)}`, 'success');
      }

      valMse.textContent = mse.toFixed(6);
      valLimit.textContent = threshold.toFixed(6);

      const ratio = Math.min((mse / threshold) * 100, 100);
      gaugeRatio.textContent = ratio.toFixed(1) + "%";
      gaugeBar.style.width = ratio + "%";
      
      scannerBeam.classList.remove('scanning');

      if (isLeak) {
        gaugeBar.className = "gauge-bar-inner gauge-bar-leak";
        waterFlow.classList.add('leak');
        leakParticles.classList.remove('hidden');
        visStatusOverlay.innerHTML = `
          <span class="visualizer-status-badge status-leak">CRITICAL LEAK DETECTED</span>
          <p class="visualizer-status-description">Loss ratio reached ${ratio.toFixed(1)}% of maximum safe threshold.</p>
        `;
      } else {
        gaugeBar.className = "gauge-bar-inner";
        waterFlow.classList.remove('leak');
        leakParticles.classList.add('hidden');
        visStatusOverlay.innerHTML = `
          <span class="visualizer-status-badge status-normal">HEALTHY</span>
          <p class="visualizer-status-description">Flow stable at ${ratio.toFixed(1)}% of threshold.</p>
        `;
      }

      // 8. Save Data to Backend
      try {
        const payload = {
          mse: mse,
          status: isLeak ? 'LEAK' : 'SECURE',
          mode: isNightMode ? 'NIGHT' : 'DAY',
          features: features
        };

        const res = await fetch('/api/save-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          writeLog("Data successfully saved to backend database.", 'success');
        } else {
          writeLog("Backend failed to save data.", 'warning');
        }
      } catch (dbErr) {
        writeLog("Could not reach backend to save data. " + dbErr.message, 'warning');
      }

    } catch (err) {
      console.error(err);
      writeLog("Scan failure: " + err.message, 'error');
    } finally {
      btnPredict.disabled = false;
      btnPredict.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg> Analyze Telemetry';
      scannerBeam.classList.remove('scanning');
    }
  });

  checkSession();
});
