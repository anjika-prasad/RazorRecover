"""RazorRecover demo API — policy-first recovery orchestration.

All transactions exposed by this service are clearly labelled simulated/test data.
Never connect a live payment action without replacing MockRazorpayGateway and adding
webhook signature verification plus idempotency storage.
"""
from datetime import datetime, timezone
from enum import Enum
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="RazorRecover", version="0.1.0")

class Action(str, Enum): RETRY="RETRY"; PAYMENT_LINK="PAYMENT_LINK"; ESCALATE="ESCALATE"; STOP="STOP"
class Payment(BaseModel):
    id: str; amount: int = Field(gt=0); failure_reason: str; attempts: int = Field(ge=0)
    customer_success_rate: float = Field(ge=0, le=1); abandoned: bool = False; opted_out: bool = False
class Policy(BaseModel):
    max_retry_attempts: int = 2; max_automatic_amount: int = 10_000
    minimum_probability: float = .70; max_reminders: int = 2
class Decision(BaseModel):
    probability: float; diagnosis: str; action: Action; allowed: bool; reasons: list[str]

def predict_recovery(p: Payment) -> float:
    """Deterministic demo score. Replace with a versioned trained sklearn pipeline."""
    base = .48 + (p.customer_success_rate * .30)
    if "network" in p.failure_reason.lower() or "bank" in p.failure_reason.lower(): base += .18
    if p.abandoned: base -= .12
    base -= p.attempts * .13
    return round(max(.03, min(.97, base)), 2)

def decide(p: Payment, policy: Policy) -> Decision:
    score = predict_recovery(p)
    reasons = [f"Recovery score {score:.0%}", f"Customer success rate {p.customer_success_rate:.0%}"]
    if p.opted_out: return Decision(probability=score, diagnosis="Customer opted out", action=Action.STOP, allowed=False, reasons=reasons+["Consent missing"])
    if p.attempts >= policy.max_retry_attempts: return Decision(probability=score, diagnosis="Retry limit reached", action=Action.STOP, allowed=False, reasons=reasons+["Retry threshold reached"])
    if p.amount > policy.max_automatic_amount: return Decision(probability=score, diagnosis="Amount requires review", action=Action.ESCALATE, allowed=False, reasons=reasons+["Amount exceeds merchant limit"])
    if score < .20: return Decision(probability=score, diagnosis="Low likelihood of recovery", action=Action.STOP, allowed=False, reasons=reasons+["Expected value too low"])
    if p.abandoned or score < policy.minimum_probability: return Decision(probability=score, diagnosis="Customer needs a new payment path", action=Action.PAYMENT_LINK, allowed=True, reasons=reasons+["Payment link is safer than retry"])
    return Decision(probability=score, diagnosis="Likely temporary payment rail failure", action=Action.RETRY, allowed=True, reasons=reasons+["Retry is within policy"])

@app.get('/health')
def health(): return {"status":"ok", "mode":"test/simulated only"}

@app.post('/decisions', response_model=Decision)
def create_decision(payment: Payment, policy: Policy = Policy()): return decide(payment, policy)

@app.post('/actions/{action}')
def execute(action: Action, payment: Payment, policy: Policy = Policy()):
    decision = decide(payment, policy)
    if not decision.allowed or decision.action != action:
        raise HTTPException(409, detail={"message":"Policy gate rejected action", "decision":decision.model_dump()})
    # Test-mode mock: in production enqueue an idempotent Razorpay operation here.
    return {"payment_id":payment.id, "action":action, "status":"TEST_ACTION_ACCEPTED", "at":datetime.now(timezone.utc), "audit":decision.reasons}
