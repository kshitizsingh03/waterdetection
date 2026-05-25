/* Classic and Simple App Logic with Browser-side ONNX Inference */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('inference-form');
  const featuresInput = document.getElementById('features-input');
  const inputFeedback = document.getElementById('input-feedback');
  const btnPredict = document.getElementById('btn-predict');
  const btnLoadNormal = document.getElementById('btn-load-normal');
  const btnLoadLeak = document.getElementById('btn-load-leak');
  
  const resultsCard = document.getElementById('results-card');
  const resStatus = document.getElementById('res-status');
  const resMse = document.getElementById('res-mse');
  const resThreshold = document.getElementById('res-threshold');

  // Hardcoded realistic raw SCADA samples
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

  // Initialize model and scaler on page load
  async function init() {
    try {
      btnPredict.disabled = true;
      btnPredict.textContent = 'Loading Model...';

      // 1. Load Scaler parameters from scaler.json
      const scalerRes = await fetch('./scaler.json');
      scaler = await scalerRes.json();

      // 2. Load ONNX Runtime session from gru_ae_best.onnx
      session = await ort.InferenceSession.create('./gru_ae_best.onnx');

      btnPredict.disabled = false;
      btnPredict.textContent = 'Detect Leakage';
      console.log('ONNX model and scaler loaded successfully.');
    } catch (err) {
      console.error('Failed to initialize ONNX runtime or scaler:', err);
      inputFeedback.textContent = 'Error loading model: ' + err.message + '. Ensure the model is built.';
    }
  }

  // Run initialization
  init();

  // Load normal sample
  btnLoadNormal.addEventListener('click', () => {
    featuresInput.value = normalSample.join(", ");
    inputFeedback.textContent = '';
    resultsCard.classList.add('hidden');
  });

  // Load leak sample
  btnLoadLeak.addEventListener('click', () => {
    featuresInput.value = leakSample.join(", ");
    inputFeedback.textContent = '';
    resultsCard.classList.add('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    inputFeedback.textContent = '';
    resultsCard.classList.add('hidden');
    
    if (!session || !scaler) {
      inputFeedback.textContent = 'Model is still loading. Please wait...';
      return;
    }

    const rawVal = featuresInput.value.trim();
    if (!rawVal) {
      inputFeedback.textContent = 'Please enter data.';
      return;
    }

    // Parse the comma separated values
    const parts = rawVal.split(',').map(s => s.trim()).filter(s => s !== '');
    
    if (parts.length !== 40) {
      inputFeedback.textContent = `Error: Expected exactly 40 values. You provided ${parts.length}.`;
      return;
    }

    // Convert to numbers
    const features = [];
    for (let p of parts) {
      const num = Number(p);
      if (isNaN(num)) {
        inputFeedback.textContent = `Error: "${p}" is not a valid number.`;
        return;
      }
      features.push(num);
    }

    try {
      btnPredict.disabled = true;
      btnPredict.textContent = 'Running Model...';

      // 1. Normalization scaling: (x - mean) / scale
      const mean = scaler.mean;
      const scale = scaler.scale;
      const scaledFeatures = features.map((x, i) => (x - mean[i]) / scale[i]);

      // 2. Prepare ONNX Input Tensor: shape [1, 1, 40]
      const inputTensor = new ort.Tensor('float32', new Float32Array(scaledFeatures), [1, 1, 40]);
      
      // 3. Run Inference Session
      const feeds = { input: inputTensor };
      const outputMap = await session.run(feeds);
      
      const outputTensor = outputMap.output;
      const outputData = outputTensor.data; // Float32Array of length 40

      // 4. Calculate Reconstruction Error (MSE)
      let sumSqErr = 0;
      for (let i = 0; i < 40; i++) {
        sumSqErr += Math.pow(scaledFeatures[i] - outputData[i], 2);
      }
      const mse = sumSqErr / 40;

      // 5. Apply dynamic strictness threshold (Nighttime vs Day)
      const isNighttime = features[39] === 1;
      const threshold = isNighttime ? 0.0016 : 0.0048;
      const isLeak = mse > threshold;

      // 6. Display Results
      resStatus.textContent = isLeak ? "Leak Detected" : "Normal";
      if (isLeak) {
        resStatus.className = 'result-value status-leak';
      } else {
        resStatus.className = 'result-value status-normal';
      }

      resMse.textContent = mse.toFixed(6);
      resThreshold.textContent = threshold.toFixed(6);

      resultsCard.classList.remove('hidden');

    } catch (err) {
      inputFeedback.textContent = 'Evaluation failed: ' + err.message;
    } finally {
      btnPredict.disabled = false;
      btnPredict.textContent = 'Detect Leakage';
    }
  });
});
