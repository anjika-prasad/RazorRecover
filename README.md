# RazorRecover

Turn failed payments into recovered revenue — with bounded, explainable automation.

## Run the dashboard

```powershell
npm install
npm run dev
```

## Run the product API

```powershell
py -m pip install -r backend/requirements.txt
py -m uvicorn backend.main:app --reload
```

The dashboard now includes a **Create recovery case** workflow backed by a persistent SQLite ledger. Start the API before opening the dashboard so cases, policies and audit events survive page refreshes.

To optionally create Razorpay **test-mode payment links**, copy `backend/.env.example` to `backend/.env`, add your test keys, and load the environment before starting Uvicorn. The API remains in safe local mode without those keys. A retry never attempts to re-charge a failed payment; it creates a fresh customer payment link.

## Demo path (3 minutes)

1. Begin in **Overview**: narrate revenue at risk versus recovered backtest revenue.
2. Open the ₹4,999 opportunity to show its prediction, diagnosis, policy checks, and the complete audit trail.
3. Click **Retry payment** to create a clearly labelled test recovery.
4. Reload the case, then use **simulate second retry failure** to show the autonomous stop rule and merchant notification.
5. Finish in **Policy controls**: merchant-defined monetary and contact limits make the agent safe by design.

## Production hardening before real money

- Verify Razorpay webhook signatures and store events idempotently.
- Replace the deterministic scoring function with a versioned, evaluated ML pipeline.
- Put action execution behind a queue, persist every state transition, and use provider idempotency keys.
- Obtain consent before outreach and enforce retention, opt-out, and merchant approval policies.
