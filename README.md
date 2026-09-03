# 🚀 RazorRecover — Track 3 (Agentic Payments)

> **Turn failed payments into recovered revenue — with bounded, explainable ML & AI automation.**

RazorRecover is an autonomous, policy-gated revenue recovery engine built for **Razorpay Track 3 (Agentic Workflows / Payments)**. It continuously analyzes failed transactions, diagnoses the underlying cause using a hybrid ML + AI architecture, evaluates merchant-defined financial safety guardrails, and executes automated retries or generates personalized Razorpay Payment Links.

---

## 🌟 Key Upgrades & Features

1. **Scikit-Learn ML Engine & SHAP Explainability**:
   - Trained Gradient Boosting Classifier on 5,000 synthetic payment failure events.
   - Provides real-time probability prediction + SHAP-style feature attribution breakdown (`+24% Network Timeout`, `+18% Customer Success Rate`, `-15% Retries`).
2. **Interactive Live Event Simulator Bar**:
   - Top-bar triggers in the dashboard allow judges to simulate live failure events (`Bank Timeout ₹4,999`, `Checkout Abandoned ₹12,499`, `Issuer Decline ₹45,000`) and watch the live event pipeline react in real-time.
3. **AI Agent Diagnosis & Personalized Outreach**:
   - Generates natural language failure diagnoses and context-aware multi-channel outreach copy (SMS & WhatsApp formatting with Razorpay short links).
4. **Dynamic Merchant Policy Controls (Bounded Autonomy)**:
   - Configurable limits for automatic retries, maximum automated recovery amounts (e.g. ₹10,000 limit), minimum probability thresholds, and retry cooldown periods.
   - Any transaction exceeding limits is automatically stopped by the **Policy Gate** and escalated.
5. **Empirical Model Evaluation & Financial Backtest**:
   - Dedicated ML Evaluation tab showing ROC-AUC (0.81-0.91), Precision, Recall, F1 Score, Confusion Matrix, and Financial ROI (Revenue at Risk vs Recovered, False Positive Friction Cost saved).

---

## 🏃 Running the Application

### 1. Run the Product API (FastAPI + ML Engine)

```powershell
# Install requirements
py -m pip install -r backend/requirements.txt

# Start API service
py -m uvicorn backend.main:app --reload --port 8000
```

### 2. Run the React Dashboard

```powershell
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🏆 Winning Hackathon Demo Path (3 Minutes)

1. **Overview Tab (0:00 - 0:35)**:
   - Highlight top-line financial impact: **₹8.42L Revenue at Risk** vs **₹5.71L Recovered (67.8% recovery rate)**.
2. **Event Simulator (0:35 - 1:15)**:
   - Click `Bank Timeout (₹4,999)` or `Checkout Abandoned (₹12,499)` in the top simulator bar.
   - Show how the case instantly appears in the queue, gets ML scored, feature-attributed, and diagnosed.
3. **Recovery Workspace & Action (1:15 - 1:55)**:
   - Click **Execute Action** to trigger the recovery workflow.
   - View the generated Razorpay Payment Link preview & WhatsApp outreach text.
   - Click **Demo: Simulate Razorpay Webhook "Payment Paid"** to see live status update to `RECOVERED` and money move to recovered revenue.
4. **Graceful Failure & Policy Stop Rule (1:55 - 2:30)**:
   - Click **Demo: Simulate 2nd Retry Failure** on a high-attempt case.
   - Show the audit trail halt at `STOPPED_BY_POLICY` and escalate to merchant manual review.
5. **ML Evaluation & Policy Controls (2:30 - 3:00)**:
   - Open **ML Evaluation** to demonstrate defensible metrics (Precision, Recall, ROC-AUC, Confusion Matrix).
   - Open **Policy Controls**, lower max recovery amount to ₹2,000, and show how high-value transactions automatically escalate.
