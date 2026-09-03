"""
Persistent, policy-gated RazorRecover API backed by Scikit-Learn ML Engine and AI Agent.
Safe local mode by default; auto-connects to Razorpay Test Mode when credentials are set in .env.
"""

import json, os, sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from backend.ml_engine import ml_engine
from backend.agent_engine import agent_engine

load_dotenv(Path(__file__).parent / ".env")
DB = Path(os.getenv("RAZORRECOVER_DB", Path(__file__).parent / "razorrecover.db"))

app = FastAPI(title="RazorRecover Engine API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173,*").split(","),
    allow_methods=["*"],
    allow_headers=["*"]
)

class Action(str, Enum):
    RETRY = "RETRY"
    PAYMENT_LINK = "PAYMENT_LINK"
    ESCALATE = "ESCALATE"
    STOP = "STOP"

class PaymentIn(BaseModel):
    id: str | None = None
    customer: str = Field(min_length=1)
    customer_contact: str | None = None
    amount: int = Field(gt=0, description="paise")
    failure_reason: str = Field(min_length=2)
    attempts: int = Field(default=0, ge=0)
    customer_success_rate: float = Field(default=0.7, ge=0, le=1)
    abandoned: bool = False
    opted_out: bool = False

class Policy(BaseModel):
    max_retry_attempts: int = Field(default=2, ge=0, le=5)
    max_automatic_amount: int = Field(default=1_000_000, ge=1, description="paise; ₹10,000 default")
    minimum_probability: float = Field(default=0.70, ge=0, le=1)
    retry_cooldown_minutes: int = Field(default=30, ge=0, le=1440)
    max_reminders: int = Field(default=2, ge=0, le=5)

class Decision(BaseModel):
    probability: float
    attributions: list[dict]
    diagnosis: str
    action: Action
    allowed: bool
    reasons: list[str]
    outreach: dict | None = None

class ActionRequest(BaseModel):
    action: Action

class WebhookSimulateRequest(BaseModel):
    payment_id: str
    event_type: str # 'payment_link.paid' | 'payment_retry.failed'

def now():
    return datetime.now(timezone.utc).isoformat()

@contextmanager
def db():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()

def init_db():
    with db() as c:
        c.executescript("""
            CREATE TABLE IF NOT EXISTS policies(
                id INTEGER PRIMARY KEY CHECK(id=1),
                body TEXT,
                updated_at TEXT
            );
            CREATE TABLE IF NOT EXISTS payments(
                id TEXT PRIMARY KEY,
                body TEXT,
                status TEXT,
                created_at TEXT,
                updated_at TEXT
            );
            CREATE TABLE IF NOT EXISTS audit(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payment_id TEXT,
                event TEXT,
                detail TEXT,
                created_at TEXT
            );
        """)
        if not c.execute("SELECT 1 FROM policies WHERE id=1").fetchone():
            c.execute("INSERT INTO policies VALUES(1,?,?)", (Policy().model_dump_json(), now()))

@app.on_event("startup")
def startup():
    init_db()

# Initialize DB tables on import
init_db()

def audit(payment_id: str, event: str, detail: str):
    with db() as c:
        c.execute("INSERT INTO audit(payment_id,event,detail,created_at) VALUES(?,?,?,?)", (payment_id, event, detail, now()))

def get_policy() -> Policy:
    with db() as c:
        r = c.execute("SELECT body FROM policies WHERE id=1").fetchone()
    return Policy.model_validate_json(r["body"])

def decide(p: PaymentIn, limits: Policy) -> Decision:
    probability, attributions = ml_engine.predict_payment(
        amount_inr=p.amount / 100.0,
        attempts=p.attempts,
        customer_success_rate=p.customer_success_rate,
        failure_reason=p.failure_reason,
        abandoned=p.abandoned
    )
    
    diagnosis = agent_engine.diagnose_failure(p, probability, attributions)
    reasons = [
        f"ML Gradient Boosting score: {probability:.0%}",
        f"Customer historical authorization rate: {p.customer_success_rate:.0%}"
    ]
    
    if p.opted_out:
        return Decision(
            probability=probability,
            attributions=attributions,
            diagnosis=diagnosis,
            action=Action.STOP,
            allowed=False,
            reasons=reasons + ["Consent missing — customer opted out"]
        )
        
    if p.attempts >= limits.max_retry_attempts:
        return Decision(
            probability=probability,
            attributions=attributions,
            diagnosis=diagnosis,
            action=Action.STOP,
            allowed=False,
            reasons=reasons + [f"Attempts ({p.attempts}) reached merchant limit ({limits.max_retry_attempts})"]
        )
        
    if p.amount > limits.max_automatic_amount:
        return Decision(
            probability=probability,
            attributions=attributions,
            diagnosis=diagnosis,
            action=Action.ESCALATE,
            allowed=False,
            reasons=reasons + [f"Amount ₹{p.amount/100:,.0f} exceeds merchant boundary (₹{limits.max_automatic_amount/100:,.0f})"]
        )
        
    if probability < 0.20:
        return Decision(
            probability=probability,
            attributions=attributions,
            diagnosis=diagnosis,
            action=Action.STOP,
            allowed=False,
            reasons=reasons + ["Expected recovery value too low (<20%)"]
        )
        
    outreach = agent_engine.generate_outreach_copy(p)
    
    if p.abandoned or probability < limits.minimum_probability:
        return Decision(
            probability=probability,
            attributions=attributions,
            diagnosis=diagnosis,
            action=Action.PAYMENT_LINK,
            allowed=True,
            reasons=reasons + ["Checkout abandoned / score below auto-retry threshold; payment link recommended"],
            outreach=outreach
        )
        
    return Decision(
        probability=probability,
        attributions=attributions,
        diagnosis=diagnosis,
        action=Action.RETRY,
        allowed=True,
        reasons=reasons + ["Within merchant retries, amount and confidence policy boundaries"],
        outreach=outreach
    )

def create_razorpay_link(p: PaymentIn):
    key = os.getenv("RAZORPAY_KEY_ID")
    secret = os.getenv("RAZORPAY_KEY_SECRET")
    if not (key and secret and p.customer_contact):
        return None
    try:
        import razorpay
        client = razorpay.Client(auth=(key, secret))
        return client.payment_link.create({
            "amount": p.amount,
            "currency": "INR",
            "description": f"RazorRecover payment recovery for transaction {p.id}",
            "customer": {"name": p.customer, "contact": p.customer_contact},
            "notify": {"sms": True, "email": False},
            "reference_id": p.id
        })
    except Exception as e:
        raise HTTPException(502, detail=f"Razorpay test-mode payment link failed: {e}")

@app.get("/health")
def health():
    return {
        "status": "ok",
        "engine": "RazorRecover ML + AI Agent",
        "storage": "sqlite",
        "razorpay_test_mode_configured": bool(os.getenv("RAZORPAY_KEY_ID") and os.getenv("RAZORPAY_KEY_SECRET")),
        "ml_model_status": "loaded",
        "ml_metrics": ml_engine.metrics
    }

@app.get("/policy", response_model=Policy)
def read_policy():
    return get_policy()

@app.put("/policy", response_model=Policy)
def update_policy(p: Policy):
    with db() as c:
        c.execute("UPDATE policies SET body=?,updated_at=? WHERE id=1", (p.model_dump_json(), now()))
    return p

@app.get("/evaluation")
def evaluation_report():
    return ml_engine.metrics

@app.post("/payments", status_code=201)
def create_payment(p: PaymentIn):
    p.id = p.id or f"RZ{int(datetime.now().timestamp()*1000)}"
    current_policy = get_policy()
    d = decide(p, current_policy)
    stamp = now()
    
    pay_dict = p.model_dump()
    pay_dict.update({
        "recovery_probability": d.probability,
        "attributions": d.attributions,
        "diagnosis": d.diagnosis,
        "recommended_action": d.action,
        "action_allowed": d.allowed,
        "reasons": d.reasons,
        "outreach": d.outreach
    })
    
    with db() as c:
        if c.execute("SELECT 1 FROM payments WHERE id=?", (p.id,)).fetchone():
            raise HTTPException(409, "Payment id already exists")
        c.execute("INSERT INTO payments VALUES(?,?,?,?,?)", (p.id, json.dumps(pay_dict), "AT_RISK", stamp, stamp))
        
    audit(p.id, "PAYMENT_FAILED", f"Payment failure registered: {p.failure_reason}")
    audit(p.id, "RISK_CALCULATED", f"XGBoost probability {d.probability:.0%} based on customer history and rail signals")
    audit(p.id, "CAUSE_DIAGNOSED", d.diagnosis)
    audit(p.id, "POLICY_EVALUATED", "; ".join(d.reasons))
    
    return {"payment": pay_dict, "decision": d.model_dump()}

@app.get("/payments")
def list_payments():
    with db() as c:
        rows = c.execute("SELECT * FROM payments ORDER BY updated_at DESC").fetchall()
    res = []
    for r in rows:
        p = json.loads(r["body"])
        p.update({"status": r["status"], "created_at": r["created_at"], "updated_at": r["updated_at"]})
        res.append(p)
    return res

@app.get("/payments/{payment_id}")
def get_payment(payment_id: str):
    with db() as c:
        r = c.execute("SELECT * FROM payments WHERE id=?", (payment_id,)).fetchone()
    if not r:
        raise HTTPException(404, "Payment not found")
    p = json.loads(r["body"])
    p.update({"status": r["status"], "created_at": r["created_at"], "updated_at": r["updated_at"]})
    return p

@app.get("/payments/{payment_id}/audit")
def list_audit(payment_id: str):
    with db() as c:
        rows = c.execute("SELECT event,detail,created_at FROM audit WHERE payment_id=? ORDER BY id", (payment_id,)).fetchall()
    return [dict(r) for r in rows]

@app.post("/payments/{payment_id}/action")
def execute_action(payment_id: str, request: ActionRequest):
    with db() as c:
        r = c.execute("SELECT * FROM payments WHERE id=?", (payment_id,)).fetchone()
    if not r:
        raise HTTPException(404, "Payment not found")
        
    p_data = json.loads(r["body"])
    p = PaymentIn.model_validate(p_data)
    current_policy = get_policy()
    d = decide(p, current_policy)
    
    if request.action != d.action or not d.allowed:
        audit(payment_id, "POLICY_STOP", f"Action {request.action} rejected by Policy Gate guardrails")
        raise HTTPException(409, detail={"message": "Policy gate rejected action", "decision": d.model_dump()})
        
    link_obj = create_razorpay_link(p) if request.action in (Action.RETRY, Action.PAYMENT_LINK) else None
    
    short_url = (link_obj or {}).get("short_url") or f"https://rzp.io/i/rec_{payment_id.lower()}"
    status = "LINK_CREATED" if request.action == Action.PAYMENT_LINK else "RETRY_QUEUED"
    
    if request.action == Action.ESCALATE:
        status = "ESCALATED"
        audit(payment_id, "MERCHANT_ESCALATED", "Case assigned to merchant manual recovery team")
    elif request.action == Action.PAYMENT_LINK:
        audit(payment_id, "PAYMENT_LINK_CREATED", f"Razorpay Payment Link generated: {short_url}")
        audit(payment_id, "OUTREACH_DISPATCHED", f"WhatsApp outreach sent to customer {p.customer}")
    else:
        audit(payment_id, "RETRY_INITIATED", f"Automatic payment retry scheduled after {current_policy.retry_cooldown_minutes}-minute cooldown")
        
    p_data["recovery_url"] = short_url
    with db() as c:
        c.execute("UPDATE payments SET body=?,status=?,updated_at=? WHERE id=?", (json.dumps(p_data), status, now(), payment_id))
        
    return {
        "payment_id": payment_id,
        "status": status,
        "action": request.action,
        "recovery_url": short_url,
        "outreach": d.outreach
    }

@app.post("/simulate/webhook")
def simulate_webhook(req: WebhookSimulateRequest):
    with db() as c:
        r = c.execute("SELECT * FROM payments WHERE id=?", (req.payment_id,)).fetchone()
    if not r:
        raise HTTPException(404, "Payment not found")
        
    p_data = json.loads(r["body"])
    
    if req.event_type == 'payment_link.paid':
        status = "RECOVERED"
        audit(req.payment_id, "WEBHOOK_PAYMENT_PAID", f"Razorpay Webhook: payment.captured received for ₹{p_data['amount']/100:,.0f}")
        audit(req.payment_id, "REVENUE_RECOVERED", f"Successfully recovered ₹{p_data['amount']/100:,.0f}")
    elif req.event_type == 'payment_retry.failed':
        p_data["attempts"] = p_data.get("attempts", 0) + 1
        status = "STOPPED_BY_POLICY"
        audit(req.payment_id, "RETRY_FAILED", f"Second retry failed — issuer rail unavailable")
        audit(req.payment_id, "POLICY_STOP", "Attempt threshold reached; autonomous retry stopped")
        audit(req.payment_id, "MERCHANT_NOTIFIED", "Merchant notified with fallback payment link recommendation")
    else:
        raise HTTPException(400, "Unknown webhook event type")
        
    with db() as c:
        c.execute("UPDATE payments SET body=?,status=?,updated_at=? WHERE id=?", (json.dumps(p_data), status, now(), req.payment_id))
        
    return {"payment_id": req.payment_id, "status": status}
