/* Classic and Simple App Logic */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('inference-form');
  const featuresInput = document.getElementById('features-input');
  const inputFeedback = document.getElementById('input-feedback');
  const btnPredict = document.getElementById('btn-predict');
  const btnLoadSample = document.getElementById('btn-load-sample');
  
  const resultsCard = document.getElementById('results-card');
  const resStatus = document.getElementById('res-status');
  const resMse = document.getElementById('res-mse');
  const resThreshold = document.getElementById('res-threshold');

  const API_BASE = window.location.origin;

  // Load sample healthy data
  btnLoadSample.addEventListener('click', () => {
    // A synthetic random array of 39 numbers + 1 flag for nighttime
    const sample = Array.from({ length: 39 }, () => (Math.random() * 2 - 1).toFixed(3));
    sample.push("1"); // Is_Nighttime = 1
    featuresInput.value = sample.join(", ");
    inputFeedback.textContent = '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    inputFeedback.textContent = '';
    resultsCard.classList.add('hidden');
    
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

    // Call Backend
    try {
      btnPredict.disabled = true;
      btnPredict.textContent = 'Running Model...';

      const response = await fetch(`${API_BASE}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Server error occurred.');
      }

      // Display Results
      resStatus.textContent = data.status;
      if (data.is_leak) {
        resStatus.className = 'result-value status-leak';
      } else {
        resStatus.className = 'result-value status-normal';
      }

      resMse.textContent = data.mse.toFixed(5);
      resThreshold.textContent = data.threshold.toFixed(5);

      resultsCard.classList.remove('hidden');

    } catch (err) {
      inputFeedback.textContent = err.message;
    } finally {
      btnPredict.disabled = false;
      btnPredict.textContent = 'Detect Leakage';
    }
  });
});
