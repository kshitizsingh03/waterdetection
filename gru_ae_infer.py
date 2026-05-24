import os
import torch
import numpy as np
from sklearn.preprocessing import StandardScaler
from gru_ae_model import GRUAutoencoder


class WaterLeakageDetector:
    """
    Backend class for real-time water leakage detection using a pre-trained GRU Autoencoder model.
    """

    def __init__(self, checkpoint_dir='Checkpoints'):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        # 1. Dynamic error thresholds
        self.day_threshold = 95
        self.night_threshold = 75
        
        # 2. Load the trained GRU Autoencoder
        model_path = os.path.join(checkpoint_dir, 'gru_ae_best.pth')
        if not os.path.exists(model_path):
             raise FileNotFoundError(f"Model checkpoint not found at {model_path}. Run gru_ae_model.py first.")
             
        self.model = GRUAutoencoder(input_dim=40).to(self.device)
        self.model.load_state_dict(torch.load(model_path, map_location=self.device))
        self.model.eval()

    def predict(self, feature_vector):
        """
        Predicts anomaly (leak) status for a single real-time snapshot / timestep.
        
        Args:
            feature_vector (list or numpy array): An array of exactly 40 numbers.
                Requires the last element (index 39) to be the `Is_Nighttime` flag (1 or 0).
                
        Returns:
            is_leak (bool): True if the system detects an anomaly.
            reconstruction_error (float): The actual MSE value of the network.
            threshold_used (float): The specific threshold margin applied (Day vs Night).
        """
        
        features = np.array(feature_vector, dtype=np.float32)
        is_nighttime = int(features[-1]) # Extract Nighttime flag (assumed to be the last feature)
        features = StandardScaler().fit_transform(features.reshape(1, -1))  # Scale features
        
        if features.shape[-1] != 40:
            raise ValueError(f"Model expects exactly 40 features. Received {features.shape[-1]}.")
            
        # Reshape data to (Batch=1, Sequence=1, Features=40) for GRU compatibility
        x_tensor = torch.tensor(features).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            reconstructed = self.model(x_tensor)
            
        # Calculate reconstruction mean squared error
        error = np.mean(np.square(x_tensor.cpu().numpy() - reconstructed.cpu().numpy()))
        
        # Determine strictness context
        threshold = self.night_threshold if is_nighttime else self.day_threshold
        
        # Flag leak if reconstruction error crosses bounds
        is_leak = bool(error > threshold)
        
        return is_leak, error, threshold

import sys
import json

if __name__ == "__main__":
    try:
        # Suppress PyTorch warnings/prints if any
        import warnings
        warnings.filterwarnings("ignore")
        
        # Read JSON from stdin
        input_str = sys.stdin.read().strip()
        if not input_str:
            print(json.dumps({"success": False, "error": "No input provided"}))
            sys.exit(1)
            
        data = json.loads(input_str)
        features = data.get("features")
        
        if not features or len(features) != 40:
            print(json.dumps({"success": False, "error": f"Requires array of 40 features, got {len(features) if features else 0}"}))
            sys.exit(1)
            
        # Get absolute path to Checkpoints based on this script's location
        script_dir = os.path.dirname(os.path.abspath(__file__))
        ckpt_dir = os.path.join(script_dir, 'Checkpoints')
        
        detector = WaterLeakageDetector(ckpt_dir)
        is_leak, mse, thresh = detector.predict(features)
        
        # Output strictly JSON
        result = {
            "success": True,
            "status": "Leak Detected" if is_leak else "Normal",
            "mse": float(mse),
            "threshold": float(thresh),
            "is_leak": is_leak
        }
        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

