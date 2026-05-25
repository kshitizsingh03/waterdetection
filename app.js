/* High-Performance Browser-Side SCADA Core & ONNX Inference Controller */

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
  const visualizerDesc = document.getElementById('visualizer-desc');

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
      operatorDisplayName.textContent = operator.name;
      initONNX();
    } else {
      // Show login or register screen
      scadaDashboard.classList.add('hidden');
      authPortal.classList.remove('hidden');
      if (operator) {
        // Toggle to login screen
        showLoginForm();
      } else {
        // Toggle to signup screen
        showSignupForm();
      }
    }
  }

  function showLoginForm() {
    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    authTitle.textContent = "Terminal Authorization";
    authSubtitle.textContent = "Enter your operator credentials to authorize SCADA core terminal access";
  }

  function showSignupForm() {
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
    authTitle.textContent = "Operator Registration";
    authSubtitle.textContent = "Initialize a local secure operator account to manage the SCADA node";
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
      signupError.textContent = "Please enter operator name.";
      return;
    }
    if (password.length < 4) {
      signupError.textContent = "Password must be at least 4 characters.";
      return;
    }
    if (password !== confirm) {
      signupError.textContent = "Passwords do not match.";
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
      return;
    }
    
    localStorage.setItem('operatorSession', 'active');
    checkSession();
  });

  // Handle Logout
  btnLogout.addEventListener('click', () => {
    localStorage.removeItem('operatorSession');
    checkSession();
  });

  // --- ONNX Runtime & Inference System ---
  async function initONNX() {
    try {
      btnPredict.disabled = true;
      btnPredict.textContent = 'CONNECTING TO AUTOENCODER MODEL...';

      // 1. Fetch scaler parameters from public scaler.json
      const scalerRes = await fetch('./scaler.json');
      scaler = await scalerRes.json();

      // 2. Initialize ONNX runtime session from public model
      session = await ort.InferenceSession.create('./gru_ae_best.onnx');

      btnPredict.disabled = false;
      btnPredict.textContent = 'Run GRU Autoencoder Analysis';
      console.log('ONNX Model & SCADA Scaler connected successfully.');
    } catch (err) {
      console.error('Failed to load ONNX or Scaler:', err);
      inputFeedback.textContent = 'Failed to load model: ' + err.message + '. Please check that gru_ae_best.onnx is compiled in the public directory.';
    }
  }

  // --- Telemetry Input Loading ---
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
    valStatus.textContent = "STANDBY";
    valStatus.className = "stat-value";
    cardStatus.style.borderColor = "var(--border-color)";
    
    valMse.textContent = "0.000000";
    valMse.className = "stat-value text-cyan";
    
    // Normal state visuals
    activePipe.classList.remove('pipe-alert-leak');
    particlesContainer.setAttribute('opacity', '1');
    leakageSpray.classList.add('hidden');
    
    visStatusOverlay.className = "pipeline-alert-overlay";
    visStatusOverlay.innerHTML = `
      <span class="visualizer-status-badge status-normal">STANDBY</span>
      <p class="visualizer-status-description" id="visualizer-desc">Inference terminal initialized. Operator ready to run telemetry checks.</p>
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
      return;
    }

    const features = [];
    for (let p of parts) {
      const num = Number(p);
      if (isNaN(num)) {
        inputFeedback.textContent = `Error: Value "${p}" is not a valid SCADA reading.`;
        return;
      }
      features.push(num);
    }

    try {
      btnPredict.disabled = true;
      btnPredict.classList.add('scanning');
      btnPredict.textContent = 'SCANNING TELEMETRY TELEMETRY...';

      // Simulate a high-tech delay for scanning effect (600ms)
      await new Promise(r => setTimeout(r, 600));

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
        valStatus.textContent = "LEAK DETECTED";
        valStatus.className = "stat-value text-danger";
        cardStatus.style.borderColor = "rgba(239, 68, 68, 0.4)";
      } else {
        valStatus.textContent = "NOMINAL";
        valStatus.className = "stat-value text-success";
        cardStatus.style.borderColor = "rgba(16, 185, 129, 0.4)";
      }

      valMse.textContent = mse.toFixed(6);
      valLimit.textContent = threshold.toFixed(6);

      if (isNighttime) {
        valTime.textContent = "NIGHT TIME OPERATIONS";
        iconTime.textContent = "🌙";
        cardTime.style.borderColor = "rgba(168, 85, 247, 0.3)";
      } else {
        valTime.textContent = "DAY TIME OPERATIONS";
        iconTime.textContent = "☀️";
        cardTime.style.borderColor = "rgba(14, 165, 233, 0.3)";
      }

      // 7. Render Pipeline Animative Flow States
      if (isLeak) {
        // Red flashing pipeline
        activePipe.classList.add('pipe-alert-leak');
        particlesContainer.setAttribute('opacity', '0.25');
        // Show Dripping leakage droplets & rings
        leakageSpray.classList.remove('hidden');
        
        visStatusOverlay.innerHTML = `
          <span class="visualizer-status-badge status-leak">🚨 CRITICAL</span>
          <p class="visualizer-status-description" id="visualizer-desc">GRU Autoencoder detected leakage. Anomaly Reconstruction Loss: ${mse.toFixed(6)} (Limit: ${threshold.toFixed(6)}).</p>
        `;
      } else {
        // Healthy flowing blue pipeline
        activePipe.classList.remove('pipe-alert-leak');
        particlesContainer.setAttribute('opacity', '1');
        leakageSpray.classList.add('hidden');
        
        visStatusOverlay.innerHTML = `
          <span class="visualizer-status-badge status-normal">🟢 HEALTHY</span>
          <p class="visualizer-status-description" id="visualizer-desc">Pipeline health nominal. Telemetry loss well within permitted operating limits.</p>
        `;
      }

    } catch (err) {
      console.error(err);
      inputFeedback.textContent = 'Analysis evaluation failed: ' + err.message;
    } finally {
      btnPredict.disabled = false;
      btnPredict.classList.remove('scanning');
      btnPredict.textContent = 'Run GRU Autoencoder Analysis';
    }
  });

  // Initialize page session
  checkSession();
});
