"""Persistent, policy-gated RazorRecover API. Safe local mode by default."""
import json, os, sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
DB = Path(os.getenv("RAZORRECOVER_DB", Path(__file__).parent / "razorrecover.db"))
app = FastAPI(title="RazorRecover", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS","http://127.0.0.1:5173,http://localhost:5173").split(","), allow_methods=["*"], allow_headers=["*"])
class Action(str, Enum): RETRY="RETRY"; PAYMENT_LINK="PAYMENT_LINK"; ESCALATE="ESCALATE"; STOP="STOP"
class PaymentIn(BaseModel):
    id:str|None=None; customer:str=Field(min_length=1); customer_contact:str|None=None; amount:int=Field(gt=0,description="paise")
    failure_reason:str=Field(min_length=2); attempts:int=Field(default=0,ge=0); customer_success_rate:float=Field(default=.7,ge=0,le=1); abandoned:bool=False; opted_out:bool=False
class Policy(BaseModel):
    max_retry_attempts:int=Field(default=2,ge=0,le=5); max_automatic_amount:int=Field(default=1_000_000,ge=1); minimum_probability:float=Field(default=.70,ge=0,le=1); retry_cooldown_minutes:int=Field(default=30,ge=0,le=1440); max_reminders:int=Field(default=2,ge=0,le=5)
class Decision(BaseModel): probability:float; diagnosis:str; action:Action; allowed:bool; reasons:list[str]
class ActionRequest(BaseModel): action:Action
def now(): return datetime.now(timezone.utc).isoformat()
@contextmanager
def db():
    c=sqlite3.connect(DB); c.row_factory=sqlite3.Row
    try: yield c; c.commit()
    finally: c.close()
def init():
    with db() as c:
        c.executescript("CREATE TABLE IF NOT EXISTS policies(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT,updated_at TEXT);CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,body TEXT,status TEXT,created_at TEXT,updated_at TEXT);CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,payment_id TEXT,event TEXT,detail TEXT,created_at TEXT);")
        if not c.execute("SELECT 1 FROM policies WHERE id=1").fetchone(): c.execute("INSERT INTO policies VALUES(1,?,?)",(Policy().model_dump_json(),now()))
@app.on_event("startup")
def startup(): init()
def audit(payment_id,event,detail):
    with db() as c:c.execute("INSERT INTO audit(payment_id,event,detail,created_at) VALUES(?,?,?,?)",(payment_id,event,detail,now()))
def policy():
    with db() as c:r=c.execute("SELECT body FROM policies WHERE id=1").fetchone()
    return Policy.model_validate_json(r["body"])
def score(p):
    x=.48+p.customer_success_rate*.30; reason=p.failure_reason.lower()
    if any(k in reason for k in ("network","bank","timeout")):x+=.18
    if "declin" in reason:x-=.10
    if p.abandoned:x-=.12
    return round(max(.03,min(.97,x-p.attempts*.13)),2)
def decide(p, limits):
    s=score(p); reasons=[f"Recovery score {s:.0%}",f"Customer success rate {p.customer_success_rate:.0%}"]
    if p.opted_out:return Decision(probability=s,diagnosis="Customer opted out",action=Action.STOP,allowed=False,reasons=reasons+["Consent missing"])
    if p.attempts>=limits.max_retry_attempts:return Decision(probability=s,diagnosis="Retry limit reached",action=Action.STOP,allowed=False,reasons=reasons+["Retry threshold reached"])
    if p.amount>limits.max_automatic_amount:return Decision(probability=s,diagnosis="Amount requires review",action=Action.ESCALATE,allowed=False,reasons=reasons+["Amount exceeds merchant limit"])
    if s<.20:return Decision(probability=s,diagnosis="Low likelihood of recovery",action=Action.STOP,allowed=False,reasons=reasons+["Expected value too low"])
    if p.abandoned or s<limits.minimum_probability:return Decision(probability=s,diagnosis="Customer needs a new payment path",action=Action.PAYMENT_LINK,allowed=True,reasons=reasons+["Payment link is safer than retry"])
    return Decision(probability=s,diagnosis="Likely temporary payment rail failure",action=Action.RETRY,allowed=True,reasons=reasons+["Retry is within policy"])
def payment_row(r):
    p=json.loads(r["body"]);p.update(status=r["status"],created_at=r["created_at"],updated_at=r["updated_at"]);return p
def create_link(p):
    key,secret=os.getenv("RAZORPAY_KEY_ID"),os.getenv("RAZORPAY_KEY_SECRET")
    if not(key and secret and p.customer_contact):return None
    try:
        import razorpay
        return razorpay.Client(auth=(key,secret)).payment_link.create({"amount":p.amount,"currency":"INR","description":f"Recovery for {p.id}","customer":{"name":p.customer,"contact":p.customer_contact},"notify":{"sms":True,"email":False},"reference_id":p.id})
    except Exception as e:raise HTTPException(502,detail=f"Razorpay test-mode link failed: {e}")
@app.get("/health")
def health():return {"status":"ok","storage":"sqlite","razorpay_test_mode_configured":bool(os.getenv("RAZORPAY_KEY_ID") and os.getenv("RAZORPAY_KEY_SECRET"))}
@app.get("/policy",response_model=Policy)
def read_policy():return policy()
@app.put("/policy",response_model=Policy)
def update_policy(p:Policy):
    with db() as c:c.execute("UPDATE policies SET body=?,updated_at=? WHERE id=1",(p.model_dump_json(),now()))
    return p
@app.post("/payments",status_code=201)
def create_payment(p:PaymentIn):
    p.id=p.id or f"RZ{int(datetime.now().timestamp()*1000)}"; d=decide(p,policy()); stamp=now()
    with db() as c:
        if c.execute("SELECT 1 FROM payments WHERE id=?",(p.id,)).fetchone():raise HTTPException(409,"Payment id already exists")
        c.execute("INSERT INTO payments VALUES(?,?,?,?,?)",(p.id,p.model_dump_json(),"AT_RISK",stamp,stamp))
    audit(p.id,"PAYMENT_FAILED",p.failure_reason);audit(p.id,"RISK_CALCULATED",f"Recovery probability {d.probability:.0%}");audit(p.id,"POLICY_EVALUATED","; ".join(d.reasons));return {"payment":p.model_dump(),"decision":d.model_dump()}
@app.get("/payments")
def payments():
    with db() as c:rows=c.execute("SELECT * FROM payments ORDER BY updated_at DESC").fetchall()
    return [payment_row(r) for r in rows]
@app.get("/payments/{payment_id}/audit")
def events(payment_id:str):
    with db() as c:rows=c.execute("SELECT event,detail,created_at FROM audit WHERE payment_id=? ORDER BY id",(payment_id,)).fetchall()
    return [dict(r) for r in rows]
@app.post("/payments/{payment_id}/action")
def act(payment_id:str,request:ActionRequest):
    with db() as c:r=c.execute("SELECT * FROM payments WHERE id=?",(payment_id,)).fetchone()
    if not r:raise HTTPException(404,"Payment not found")
    p=PaymentIn.model_validate_json(r["body"]);d=decide(p,policy())
    if request.action!=d.action or not d.allowed:audit(payment_id,"POLICY_STOP",f"Rejected {request.action}");raise HTTPException(409,detail={"message":"Policy gate rejected action","decision":d.model_dump()})
    link=create_link(p) if request.action in (Action.RETRY,Action.PAYMENT_LINK) else None; status="LINK_CREATED" if link else ("AWAITING_CUSTOMER" if link is None else "ESCALATED")
    event="PAYMENT_LINK_CREATED" if request.action==Action.PAYMENT_LINK else "RETRY_RECOVERY_STARTED"; detail=(link or {}).get("short_url","Workflow queued locally. Add Razorpay test credentials and customer contact for a test-mode payment link.")
    with db() as c:c.execute("UPDATE payments SET status=?,updated_at=? WHERE id=?",(status,now(),payment_id))
    audit(payment_id,event,detail);return {"payment_id":payment_id,"status":status,"action":request.action,"recovery_url":(link or {}).get("short_url")}
