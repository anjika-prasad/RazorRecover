# RazorRecover Engine

[![Architecture: ML + Agentic](https://img.shields.io/badge/Architecture-ML%20%2B%20Agentic-6ee7bd?style=for-the-badge)](#system-architecture)
[![Python: 3.11+](https://img.shields.io/badge/Python-3.11%2B-blue?style=for-the-badge&logo=python)](#tech-stack)
[![FastAPI: 0.115+](https://img.shields.io/badge/FastAPI-0.115%2B-009688?style=for-the-badge&logo=fastapi)](#backend-api)
[![ML: Scikit--Learn](https://img.shields.io/badge/ML-Scikit--Learn-F7931E?style=for-the-badge&logo=scikit-learn)](#machine-learning-pipeline)
[![Razorpay: Test Mode API](https://img.shields.io/badge/Razorpay-Test%20Mode%20API-0C2340?style=for-the-badge&logo=razorpay)](#razorpay-integration)

**RazorRecover** is an enterprise-grade, policy-gated revenue recovery engine designed to analyze failed payment telemetry, predict recovery probabilities using machine learning, and execute autonomous, explainable recovery actions within merchant-defined safety boundaries.

---

## 📐 System Architecture

```text
                               RAZORPAY / WEBHOOK TELEMETRY
                                     (Payment Events)
                                            │
                                            ▼
                                   ┌─────────────────┐
                                   │  FASTAPI INGEST │
                                   └────────┬────────┘
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               ▼                            ▼                            ▼
   ┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
   │ ML Inference Engine  │     │ AI Diagnosis Agent   │     │ Policy Gate Engine   │
   │ (Gradient Boosting)  │     │ - Cause Analysis     │     │ - Merchant Boundaries│
   │ - Prob Scoring       │     │ - Multi-Channel Copy │     │ - Retry Caps         │
   │ - SHAP Attributions  │     └──────────┬───────────┘     │ - Opt-Out Guardrails │
   └──────────┬───────────┘                │                 └──────────┬───────────┘
              │                            │                            │
              └────────────────────────────┼────────────────────────────┘
                                           │
                                           ▼
                                ┌─────────────────────┐
                                │ DECISION & EXECUTE  │
                                └──────────┬──────────┘
                                           │
                      ┌────────────────────┴────────────────────┐
                      ▼                                         ▼
             Automated Retry Path                    Razorpay Payment Link Path
            (Rail Cooldown Retry)                    (Razorpay Test-Mode API)
                      │                                         │
                      └────────────────────┬────────────────────┘
                                           ▼
                                ┌─────────────────────┐
                                │ SQLITE AUDIT LEDGER │
                                └──────────┬──────────┘
                                           │
                                           ▼
                                ┌─────────────────────┐
                                │ REACT DASHBOARD UI  │
                                └─────────────────────┘
```

---

## ⚡ Key Capabilities

### 1. Machine Learning & Feature Engineering Engine
- **Predictive Scoring**: Uses an optimized `GradientBoostingClassifier` trained on 5,000 payment event telemetry records.
- **SHAP-Style Explainability**: Provides exact feature attributions for every score (e.g., `+28% Gateway Timeout`, `+22% Customer Success Rate`, `-18% Prior Retries`).
- **Empirical Model Performance**:
  - **F1 Score**: `93.4%`
  - **ROC-AUC**: `0.968`
  - **Precision**: `91.6%`
  - **Recall**: `95.2%`
  - **Optimal Decision Threshold**: `0.50` (Calibrated via cross-validation grid search)

### 2. Policy Gate & Bounded Autonomy Guardrails
- **Merchant Controls**: Enforces hard monetary caps (default `₹10,000`), maximum automated retry limits (default `2 attempts`), and minimum probability confidence thresholds (`70%`).
- **Automated Safety Interventions**: Transactions exceeding merchant boundaries or failing recovery thresholds are automatically halted (`STOPPED_BY_POLICY`) and escalated to merchant teams.
- **Consent Compliance**: Respects customer opt-out preferences and suppresses automated outreach when consent is revoked.

### 3. AI Diagnosis & Multi-Channel Outreach Agent
- **Natural Language Diagnosis**: Translates raw gateway error codes and transaction context into merchant-understandable root cause explanations.
- **Dynamic Outreach Generation**: Generates localized, context-aware WhatsApp and SMS copy complete with direct Razorpay payment links.

### 4. Immutable Audit Trail & Webhook Ingestion
- **Persistent State Ledger**: Records every event transition (`PAYMENT_FAILED`, `RISK_SCORED`, `CAUSE_DIAGNOSED`, `POLICY_EVALUATED`, `ACTION_EXECUTED`, `WEBHOOK_PAYMENT_PAID`) in an SQLite database ledger.
- **Razorpay Integration**: Native support for Razorpay Test Mode Payment Links (`payment_link.create`) and webhook status simulation (`payment_link.paid`, `payment_retry.failed`).

---

## 🛠️ Tech Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend** | React 18, Vite, Vanilla CSS Modules, Modern Typography (Manrope, DM Mono) |
| **Backend API** | Python 3.11+, FastAPI, Uvicorn, Pydantic v2 |
| **Machine Learning** | Scikit-Learn (Gradient Boosting), NumPy |
| **Database Ledger** | SQLite3 (Persistent JSON state & audit log) |
| **Payments Integration** | Razorpay Python SDK (Test Mode API) |

---

## ⚙️ Environment Configuration

Copy `backend/.env.example` to `backend/.env` to configure environment credentials:

```env
# Server Configuration
RAZORRECOVER_DB=backend/razorrecover.db
CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173

# Razorpay Test Mode Credentials (Optional: Safe local fallback mode active without keys)
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
```

---

## 🚀 Getting Started

### Prerequisites
- Python 3.11 or higher
- Node.js 18 or higher

### 1. Install & Launch Backend Service

```powershell
# Install Python dependencies
py -m pip install -r backend/requirements.txt

# Launch FastAPI application
py -m uvicorn backend.main:app --reload --port 8000
```

The API will be available at `http://127.0.0.1:8000` (OpenAPI Swagger docs at `http://127.0.0.1:8000/docs`).

### 2. Install & Launch Frontend Dashboard

```powershell
# Install Node dependencies
npm install

# Start Vite dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 📡 API Reference Specifications

### Core Endpoints

#### `GET /health`
Returns system status, ML model load state, and Razorpay test mode connectivity.

#### `GET /payments`
Returns all tracked payment recovery cases from the ledger.

#### `POST /payments`
Creates a new payment failure case, calculates ML probability score, generates SHAP feature attributions, runs AI diagnosis, and evaluates policy guardrails.

#### `POST /payments/{id}/action`
Executes an approved recovery action (`RETRY`, `PAYMENT_LINK`, `ESCALATE`) or rejects execution if blocked by the Policy Gate.

#### `POST /simulate/webhook`
Simulates Razorpay webhook payload events (`payment_link.paid` or `payment_retry.failed`).

#### `GET /policy` / `PUT /policy`
Reads or updates active merchant policy guardrails.

#### `GET /evaluation`
Returns held-out test split ML evaluation metrics (Precision, Recall, F1, ROC-AUC, Confusion Matrix, and Financial Impact).

---

## 🗄️ Database Schemas

```sql
-- Merchant Guardrail Settings
CREATE TABLE IF NOT EXISTS policies (
    id INTEGER PRIMARY KEY CHECK(id=1),
    body TEXT NOT NULL, -- Policy JSON configuration
    updated_at TEXT NOT NULL
);

-- Transaction State Ledger
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    body TEXT NOT NULL, -- Payment details, ML scores, attributions & outreach
    status TEXT NOT NULL, -- AT_RISK, RETRY_QUEUED, LINK_CREATED, RECOVERED, STOPPED_BY_POLICY, ESCALATED
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Immutable Event Audit Log
CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id TEXT NOT NULL,
    event TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id)
);
```

---

## 🔒 Production Hardening & Compliance Roadmap

Before deploying RazorRecover to live production environments with real payment traffic:

- **Webhook Signature Validation**: Verify `X-Razorpay-Signature` HMAC SHA256 headers on incoming webhooks to prevent payload spoofing.
- **Idempotency & Queueing**: Put retry execution behind a distributed task queue (e.g. Celery / Redis / AWS SQS) with provider idempotency keys to ensure at-most-once execution.
- **DPDP Act & Consent Management**: Enforce explicit consent collection for customer outreach and automated retention/opt-out policy compliance.
- **Distributed Ledger**: Replace SQLite with PostgreSQL for multi-region high availability and ACID transactional guarantees.
