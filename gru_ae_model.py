import os
import random
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix, precision_score, recall_score, f1_score
try:
    from data_preprocess import load_and_preprocess_data
except ImportError:
    # Inference mode only, dataset preprocessor not needed
    pass

# Set manual seeds for deterministic results
seed = 42
torch.manual_seed(seed)
torch.cuda.manual_seed(seed)
torch.cuda.manual_seed_all(seed)
np.random.seed(seed)
random.seed(seed)
torch.backends.cudnn.deterministic = True
torch.backends.cudnn.benchmark = False

class GRUAutoencoder(nn.Module):
    def __init__(self, input_dim):
        super(GRUAutoencoder, self).__init__()
        self.seq_1 = nn.GRU(input_dim, 80, batch_first=True) # GRU layer 1
        self.dropout_1 = nn.Dropout(0.2)
        self.seq_2 = nn.GRU(80, 80, batch_first=True) # GRU layer 2
        self.dropout_2 = nn.Dropout(0.2)
        self.fc = nn.Linear(80, input_dim) # Output Projection layer

    def forward(self, x):
        x = x.contiguous()
        x, _ = self.seq_1(x)
        x = self.dropout_1(x)
        x, _ = self.seq_2(x)
        x = self.dropout_2(x)
        x = self.fc(x)
        return x

def train_evaluate_model(scada_file, leakages_file, epochs=100, patience=10):
    # 1. Load Data
    print("Loading and preprocessing data...")
    X, Y, Is_Nighttime = load_and_preprocess_data(scada_file, leakages_file, magnitude=-1, seq=True)

    # 2. Train-Test Split
    test_split_idx = 6330
    val_split_idx = int(test_split_idx * 0.8) # 80% train, 20% validation
    
    X_train = X[:val_split_idx]
    X_val = X[val_split_idx:test_split_idx]
    X_test = X
    Y_test = (Y > 5.0).astype(int)
    
    print(f"Total dataset samples: {len(X)}")
    print(f"Healthy Training samples: {len(X_train)}")
    print(f"Healthy Validation samples: {len(X_val)}")
    print(f"Testing samples (Mixed): {len(X_test)}")
    
    # 4. Prepare PyTorch Tensors
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"\nTraining the GRU Seq-to-Seq using {device}...")
    
    X_train_t = torch.tensor(X_train, dtype=torch.float32).unsqueeze(0).to(device)
    X_val_t = torch.tensor(X_val, dtype=torch.float32).unsqueeze(0).to(device)
    X_test_t = torch.tensor(X_test, dtype=torch.float32).unsqueeze(0).to(device)
    
    # 5. Initialize Model, Loss, Optimizer
    model = GRUAutoencoder(input_dim=X.shape[1]).to(device)
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    
    # 6. Training Loop
    for epoch in range(epochs):
        model.train()

        optimizer.zero_grad()
        outputs = model(X_train_t)
        loss = criterion(outputs, X_train_t)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()
        
        # Validation phase
        model.eval()
        with torch.no_grad():
            val_outputs = model(X_val_t)
            val_loss = criterion(val_outputs, X_val_t).item()
            
        print(f"Epoch {epoch+1}/{epochs} - Train Loss: {loss.item():.4f} - Val Loss: {val_loss:.4f}")
        
        # Early stopping check
        if epoch == 0 or val_loss < best_val_loss:
            best_val_loss = val_loss
            patience_counter = 0
            best_model_state = model.state_dict()
            best_epoch = epoch
        else:
            patience_counter += 1
            if patience_counter >= patience:
                print(f"Early stopping triggered after {epoch+1} epochs!")
                break
                
    # Load best model for testing
    print(f"\nLoading best model from epoch {best_epoch+1} with Val Loss: {best_val_loss:.4f}")
    model.load_state_dict(best_model_state)
    
    # 7. Predict and Evaluate
    print("Evaluating model on test data...")
    model.eval()
    with torch.no_grad():
        # Baseline threshold built from healthy validation reconstruction
        val_preds = model(X_val_t).cpu().numpy()[0]
        val_errors = np.mean(np.square(X_val - val_preds), axis=1)
        
        threshold_day = np.percentile(val_errors, 95)
        threshold_night = np.percentile(val_errors, 75) # More sensitive!
        
        print(f"Calculated Day Threshold (95th): {threshold_day:.4f}")
        print(f"Calculated Night Threshold (75th): {threshold_night:.4f}")
        
        # Test performance
        test_preds = [model(X_test_t[:, i:i+5000, :]).cpu().numpy()[0] for i in range(0, X_test_t.shape[1], 5000)]
        test_preds = np.concatenate(test_preds, axis=0)
        test_errors = np.mean(np.square(X_test - test_preds), axis=1)
        
        # Apply dynamically based on the hour (2 AM to 6 AM)
        Y_pred = np.zeros_like(test_errors)
        for i in range(len(test_errors)):
            if Is_Nighttime[i]:
                Y_pred[i] = (test_errors[i] > threshold_night)
            else:
                Y_pred[i] = (test_errors[i] > threshold_day)
                
        # 8. Export Model & Output Magnitudes
        os.makedirs('Checkpoints', exist_ok=True)
        torch.save(best_model_state, 'Checkpoints/gru_ae_best.pth')
        
        pd.DataFrame({
            'Actual_Leak_Magnitude': Y,
            'Reconstruction_Error': test_errors,
            'Predicted_Anomaly': Y_pred
        }).to_csv('Dataset/leak_analysis.csv', index=False)
        print("\n=> Saved 'Dataset/leak_analysis.csv'.")
    
    print("\n" + "="*30)
    print("--- GRU SEQ-TO-SEQ EVALUATION ---")
    print("="*30)
    print(f"Accuracy (GRU): {accuracy_score(Y_test, Y_pred) * 100:.2f}%\n")
    print(f"Precision: {precision_score(Y_test, Y_pred, zero_division=0):.4f}")
    print(f"Recall (Sensitivity to leaks): {recall_score(Y_test, Y_pred, zero_division=0):.4f}")
    print(f"F1-Score: {f1_score(Y_test, Y_pred, zero_division=0):.4f}\n")
    
    print("Classification Report (GRU):")
    print(classification_report(Y_test, Y_pred, zero_division=0))
    
    print("Confusion Matrix (GRU) [Normal=0, Leak=1]:")
    print(confusion_matrix(Y_test, Y_pred))

if __name__ == "__main__":
    scada_file = os.path.join('Dataset', '2018_SCADA.xlsx')
    leakages_file = os.path.join('Dataset', '2018_Leakages.csv')
    
    train_evaluate_model(scada_file, leakages_file, epochs=10000, patience=10000)
