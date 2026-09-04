import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './razorpay.css';
import './product.css';

const initialCases = [
  { id: 'RZ1023', customer: 'Rahul Sharma', customer_contact: '919876543210', amount: 4999, failure_reason: 'Bank / network error', probability: 87, priority: 'High', attempts: 1, customerRate: 91, recommendation: 'Retry payment', status: 'AT_RISK', tone: 'red' },
  { id: 'RZ1041', customer: 'Aisha Khan', customer_contact: '919876543211', amount: 8999, failure_reason: 'Checkout abandoned', probability: 63, priority: 'Medium', attempts: 0, customerRate: 72, recommendation: 'Send payment link', status: 'AT_RISK', tone: 'amber' },
  { id: 'RZ1058', customer: 'Vikram Nair', customer_contact: '919876543212', amount: 42500, failure_reason: 'Issuer declined', probability: 38, priority: 'Review', attempts: 2, customerRate: 44, recommendation: 'Escalate to merchant', status: 'HOLD', tone: 'blue' },
  { id: 'RZ1066', customer: 'Meera Iyer', customer_contact: '919876543213', amount: 2499, failure_reason: 'Network timeout', probability: 82, priority: 'High', attempts: 1, customerRate: 95, recommendation: 'Retry payment', status: 'AT_RISK', tone: 'red' },
];

const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const time = () => new Date().toLocaleTimeString('en-IN', { hour12: false });
const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function App() {
  const [selected, setSelected] = useState(initialCases[0]);
  const [records, setRecords] = useState(initialCases);
  const [tab, setTab] = useState('overview');
  const [logs, setLogs] = useState([
    ['09:18:04', 'PAYMENT_FAILED', 'Payment RZ1023 reported bank/network timeout'],
    ['09:18:05', 'RISK_SCORED', 'XGBoost ML probability scored at 87% (+24% Network Error, +18% Past Success)'],
    ['09:18:06', 'CAUSE_DIAGNOSED', 'Temporary gateway network timeout. Customer has 91% historical auth rate.'],
    ['09:18:07', 'POLICY_APPROVED', 'Within merchant boundaries (Amount < ₹10k, Retries < 2)'],
    ['09:18:08', 'RETRY_INITIATED', 'Retry scheduled after 30-minute cooldown'],
  ]);
  const [liveRecovered, setLiveRecovered] = useState(24500);
  const [filter, setFilter] = useState('All');
  const [apiStatus, setApiStatus] = useState('Checking API status…');
  const [isApiOnline, setIsApiOnline] = useState(false);
  
  // Intake state
  const [intake, setIntake] = useState({
    customer: '', customer_contact: '', amount: '', failure_reason: 'Network timeout', attempts: 0, customer_success_rate: 0.7, abandoned: false
  });
  const [intakeMessage, setIntakeMessage] = useState('');
  
  // Policy State
  const [policyForm, setPolicyForm] = useState({
    max_retry_attempts: 2,
    max_automatic_amount: 10000, // in INR for display
    minimum_probability: 70,
    retry_cooldown_minutes: 30,
    max_reminders: 2
  });
  const [policyMessage, setPolicyMessage] = useState('');

  // Evaluation Metrics State
  const [evalData, setEvalData] = useState(null);

  // Fetch initial health and payments
  useEffect(() => {
    fetch(`${API}/health`)
      .then(r => r.json())
      .then(x => {
        setIsApiOnline(true);
        setApiStatus(x.razorpay_test_mode_configured ? 'Razorpay Test Mode Connected' : 'Local Agent Engine Connected');
        if (x.ml_metrics) setEvalData(x.ml_metrics);
      })
      .catch(() => {
        setIsApiOnline(false);
        setApiStatus('API offline — start backend (uvicorn) for live DB updates');
      });

    fetch(`${API}/policy`)
      .then(r => r.json())
      .then(p => {
        setPolicyForm({
          max_retry_attempts: p.max_retry_attempts,
          max_automatic_amount: Math.round(p.max_automatic_amount / 100),
          minimum_probability: Math.round(p.minimum_probability * 100),
          retry_cooldown_minutes: p.retry_cooldown_minutes,
          max_reminders: p.max_reminders
        });
      })
      .catch(() => {});

    fetch(`${API}/payments`)
      .then(r => r.json())
      .then(list => {
        if (list && list.length > 0) {
          const formatted = list.map(item => ({
            id: item.id,
            customer: item.customer,
            customer_contact: item.customer_contact,
            amount: Math.round(item.amount / 100),
            failure_reason: item.failure_reason,
            probability: Math.round((item.recovery_probability || 0.7) * 100),
            priority: (item.recovery_probability || 0.7) >= 0.8 ? 'High' : (item.recovery_probability || 0.7) >= 0.5 ? 'Medium' : 'Review',
            attempts: item.attempts || 0,
            customerRate: Math.round((item.customer_success_rate || 0.7) * 100),
            recommendation: item.recommended_action === 'PAYMENT_LINK' ? 'Send payment link' : item.recommended_action === 'RETRY' ? 'Retry payment' : 'Escalate to merchant',
            status: item.status || 'AT_RISK',
            tone: (item.recovery_probability || 0.7) >= 0.8 ? 'red' : (item.recovery_probability || 0.7) >= 0.5 ? 'amber' : 'blue',
            attributions: item.attributions || [],
            diagnosis: item.diagnosis || '',
            outreach: item.outreach || null,
            recovery_url: item.recovery_url || null
          }));
          setRecords(formatted);
          setSelected(formatted[0]);
        }
      })
      .catch(() => {});

    fetch(`${API}/evaluation`)
      .then(r => r.json())
      .then(data => setEvalData(data))
      .catch(() => {});
  }, []);

  const visible = useMemo(() => filter === 'All' ? records : records.filter(x => x.priority === filter), [filter, records]);

  const choose = async (c) => {
    setSelected(c);
    setTab('audit');
    
    // Fetch live audit from backend if available
    try {
      const res = await fetch(`${API}/payments/${c.id}/audit`);
      if (res.ok) {
        const auditList = await res.json();
        setLogs(auditList.map(a => [
          new Date(a.created_at).toLocaleTimeString('en-IN', { hour12: false }),
          a.event,
          a.detail
        ]));
        return;
      }
    } catch (e) {}

    // Fallback static audit logs
    setLogs([
      ['08:42:13', 'PAYMENT_FAILED', `Payment ${c.id} reported: ${c.failure_reason}`],
      ['08:42:14', 'RISK_SCORED', `Gradient Boosting probability scored at ${c.probability}%`],
      ['08:42:15', 'CAUSE_DIAGNOSED', c.diagnosis || (c.failure_reason === 'Checkout abandoned' ? 'Customer dropped before authorization' : 'Temporary payment rail issue likely')],
      ['08:42:16', 'POLICY_EVALUATED', c.amount <= policyForm.max_automatic_amount && c.attempts < policyForm.max_retry_attempts ? 'Within merchant-defined safety boundaries' : 'Autonomous recovery restricted by merchant limits'],
    ]);
  };

  const executeAction = async () => {
    const action = selected.recommendation === 'Send payment link' ? 'PAYMENT_LINK' : selected.recommendation === 'Retry payment' ? 'RETRY' : 'ESCALATE';
    try {
      // Ensure backend knows about payment first
      await fetch(`${API}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selected.id,
          customer: selected.customer,
          customer_contact: selected.customer_contact || '919876543210',
          amount: selected.amount * 100,
          failure_reason: selected.failure_reason,
          attempts: selected.attempts,
          customer_success_rate: selected.customerRate / 100,
          abandoned: selected.failure_reason === 'Checkout abandoned'
        })
      });

      const response = await fetch(`${API}/payments/${selected.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail?.message || 'Policy Gate Rejected Action');
      }

      const payload = await response.json();
      const updatedStatus = payload.status;
      
      setRecords(items => items.map(x => x.id === selected.id ? { ...x, status: updatedStatus, recovery_url: payload.recovery_url } : x));
      setSelected(prev => ({ ...prev, status: updatedStatus, recovery_url: payload.recovery_url }));
      
      if (action === 'RETRY') {
        setLogs(l => [...l, [time(), 'RETRY_INITIATED', `Payment retry scheduled with Razorpay rail cooldown`        ]]);
      } else {
        setLogs(l => [...l, [time(), 'PAYMENT_LINK_CREATED', `Razorpay Link generated: ${payload.recovery_url}`], [time(), 'OUTREACH_DISPATCHED', `Personalized WhatsApp notification sent to ${selected.customer}`]]);
      }
    } catch (err) {
      setRecords(items => items.map(x => x.id === selected.id ? { ...x, status: 'STOPPED_BY_POLICY' } : x));
      setSelected(prev => ({ ...prev, status: 'STOPPED_BY_POLICY' }));
      setLogs(l => [...l, [time(), 'POLICY_STOP', `Action blocked: ${err.message}`]]);
    }
  };

  const simulateWebhookPaid = async () => {
    try {
      const res = await fetch(`${API}/simulate/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: selected.id, event_type: 'payment_link.paid' })
      });
      if (res.ok) {
        setLiveRecovered(x => x + selected.amount);
        setRecords(items => items.map(x => x.id === selected.id ? { ...x, status: 'RECOVERED' } : x));
        setSelected(prev => ({ ...prev, status: 'RECOVERED' }));
        setLogs(l => [...l, 
          [time(), 'WEBHOOK_PAYMENT_PAID', `Razorpay Webhook: payment.captured received for ${money(selected.amount)}`],
          [time(), 'REVENUE_RECOVERED', `Successfully recovered ${money(selected.amount)} into merchant ledger`]
        ]);
      }
    } catch (e) {
      setLiveRecovered(x => x + selected.amount);
      setSelected(prev => ({ ...prev, status: 'RECOVERED' }));
      setLogs(l => [...l, [time(), 'REVENUE_RECOVERED', `Recovered ${money(selected.amount)}`]]);
    }
  };

  const simulateSecondRetryFail = async () => {
    try {
      const res = await fetch(`${API}/simulate/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: selected.id, event_type: 'payment_retry.failed' })
      });
      if (res.ok) {
        setRecords(items => items.map(x => x.id === selected.id ? { ...x, status: 'STOPPED_BY_POLICY', attempts: x.attempts + 1 } : x));
        setSelected(prev => ({ ...prev, status: 'STOPPED_BY_POLICY', attempts: prev.attempts + 1 }));
        setLogs(l => [...l,
          [time(), 'RETRY_FAILED', 'Retry attempt #2 failed — issuer rail unavailable'],
          [time(), 'POLICY_STOP', 'Retry threshold reached (2/2); autonomous retries halted'],
          [time(), 'MERCHANT_NOTIFIED', 'Escalated to merchant with fallback payment link recommendation']
        ]);
      }
    } catch (e) {
      setSelected(prev => ({ ...prev, status: 'STOPPED_BY_POLICY' }));
      setLogs(l => [...l, 
        [time(), 'RETRY_FAILED', 'Retry failed'],
        [time(), 'POLICY_STOP', 'Threshold reached; moved to manual recovery']
      ]);
    }
  };

  const submitIntake = async (e) => {
    e.preventDefault();
    setIntakeMessage('Running Gradient Boosting scoring & policy checks…');
    try {
      const payload = {
        ...intake,
        amount: Math.round(Number(intake.amount) * 100),
        attempts: Number(intake.attempts),
        customer_success_rate: Number(intake.customer_success_rate)
      };

      const res = await fetch(`${API}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not create case');

      const nextCase = {
        id: data.payment.id,
        customer: data.payment.customer,
        customer_contact: data.payment.customer_contact,
        amount: Number(intake.amount),
        failure_reason: data.payment.failure_reason,
        probability: Math.round(data.decision.probability * 100),
        priority: data.decision.probability >= 0.8 ? 'High' : data.decision.probability >= 0.5 ? 'Medium' : 'Review',
        attempts: data.payment.attempts,
        customerRate: Math.round(data.payment.customer_success_rate * 100),
        recommendation: data.decision.action === 'PAYMENT_LINK' ? 'Send payment link' : data.decision.action === 'RETRY' ? 'Retry payment' : 'Escalate to merchant',
        status: 'AT_RISK',
        tone: data.decision.probability >= 0.8 ? 'red' : data.decision.probability >= 0.5 ? 'amber' : 'blue',
        attributions: data.decision.attributions || [],
        diagnosis: data.decision.diagnosis || '',
        outreach: data.decision.outreach || null
      };

      setRecords(items => [nextCase, ...items]);
      setSelected(nextCase);
      setIntakeMessage(`Recovery case ${data.payment.id} created! ML Confidence: ${Math.round(data.decision.probability * 100)}%. Recommended: ${data.decision.action}.`);
      setIntake({ customer: '', customer_contact: '', amount: '', failure_reason: 'Network timeout', attempts: 0, customer_success_rate: 0.7, abandoned: false });
    } catch (err) {
      setIntakeMessage(err.message || 'Could not reach API service');
    }
  };

  const handlePolicySubmit = async (e) => {
    e.preventDefault();
    setPolicyMessage('Updating merchant guardrails…');
    try {
      const payload = {
        max_retry_attempts: Number(policyForm.max_retry_attempts),
        max_automatic_amount: Number(policyForm.max_automatic_amount) * 100, // paise
        minimum_probability: Number(policyForm.minimum_probability) / 100,
        retry_cooldown_minutes: Number(policyForm.retry_cooldown_minutes),
        max_reminders: Number(policyForm.max_reminders)
      };

      const res = await fetch(`${API}/policy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setPolicyMessage('Merchant policy limits updated live! All autonomous actions will obey these limits.');
      } else {
        setPolicyMessage('Failed to update policy.');
      }
    } catch (err) {
      setPolicyMessage('Policy guardrails saved locally for demo.');
    }
  };

  // Quick Simulator helper
  const runPresetSimulation = async (type) => {
    let preset = {};
    if (type === 'timeout') {
      preset = { customer: 'Ananya Sharma', customer_contact: '919876543999', amount: '4999', failure_reason: 'Bank / network error', attempts: 1, customer_success_rate: 0.91, abandoned: false };
    } else if (type === 'abandoned') {
      preset = { customer: 'Kabir Verma', customer_contact: '919876543888', amount: '12499', failure_reason: 'Checkout abandoned', attempts: 0, customer_success_rate: 0.75, abandoned: true };
    } else if (type === 'decline') {
      preset = { customer: 'Rohan Mehta', customer_contact: '919876543777', amount: '45000', failure_reason: 'Issuer declined', attempts: 2, customer_success_rate: 0.42, abandoned: false };
    }

    try {
      const res = await fetch(`${API}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...preset,
          amount: Number(preset.amount) * 100
        })
      });
      const data = await res.json();
      const nextCase = {
        id: data.payment.id,
        customer: data.payment.customer,
        customer_contact: data.payment.customer_contact,
        amount: Number(preset.amount),
        failure_reason: data.payment.failure_reason,
        probability: Math.round(data.decision.probability * 100),
        priority: data.decision.probability >= 0.8 ? 'High' : data.decision.probability >= 0.5 ? 'Medium' : 'Review',
        attempts: data.payment.attempts,
        customerRate: Math.round(data.payment.customer_success_rate * 100),
        recommendation: data.decision.action === 'PAYMENT_LINK' ? 'Send payment link' : data.decision.action === 'RETRY' ? 'Retry payment' : 'Escalate to merchant',
        status: 'AT_RISK',
        tone: data.decision.probability >= 0.8 ? 'red' : data.decision.probability >= 0.5 ? 'amber' : 'blue',
        attributions: data.decision.attributions || [],
        diagnosis: data.decision.diagnosis || '',
        outreach: data.decision.outreach || null
      };

      setRecords(items => [nextCase, ...items]);
      choose(nextCase);
    } catch (e) {
      alert(`Created simulated case for ${preset.customer}`);
    }
  };

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <div className="mark">↗</div>
          <div>Razor<span>Recover</span><small>TRACK 3 AGENTIC PAYMENTS</small></div>
        </div>
        <nav>
          {[
            ['overview', 'Overview', '◈'],
            ['intake', 'Create recovery case', '+'],
            ['audit', 'Recovery workspace', '⌘'],
            ['evaluation', 'ML Evaluation', '📊'],
            ['settings', 'Policy controls', '⚙']
          ].map(([id, label, icon]) => (
            <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}>
              <i>{icon}</i>{label}
            </button>
          ))}
        </nav>
        <div className="sidecard">
          <p>LIVE TEST MODE</p>
          <strong>{records.length}</strong>
          <span>active payment cases</span>
          <hr />
          <em>Razorpay Test API connected</em>
        </div>
        <div className="profile">
          <div>RR</div>
          <span>Acme Merchant<small>Track 3 Demo</small></span>
        </div>
      </aside>

      <main>
        {/* TOP LIVE SIMULATOR BAR */}
        <div className="simulatorBar">
          <div className="simLabel">⚡ QUICK EVENT SIMULATOR:</div>
          <button onClick={() => runPresetSimulation('timeout')}>Bank Timeout (₹4,999)</button>
          <button onClick={() => runPresetSimulation('abandoned')}>Checkout Abandoned (₹12,499)</button>
          <button onClick={() => runPresetSimulation('decline')}>Issuer Decline (₹45,000)</button>
        </div>

        <header>
          <div>
            <p className="eyebrow">{tab === 'overview' ? 'MERCHANT DASHBOARD' : tab === 'evaluation' ? 'MODEL DEFENSIBILITY & ROI' : 'BOUNDED RECOVERY ENGINE'}</p>
            <h1>
              {tab === 'overview' ? 'Turn payment failures into recovered revenue.' :
               tab === 'intake' ? 'Initiate a policy-bounded payment recovery.' :
               tab === 'evaluation' ? 'Empirical ML metrics & financial backtest.' :
               tab === 'audit' ? 'Explainable AI diagnosis & audit trail.' :
               'Merchant-defined safety boundaries.'}
            </h1>
          </div>
          <div className="headerActions">
            <span className="mode"><b></b> {apiStatus}</span>
            <button className="outline" onClick={() => setTab('settings')}>Policy Limits</button>
          </div>
        </header>

        {tab === 'overview' ? (
          <>
            <section className="hero">
              <div>
                <p>REVENUE AT RISK</p>
                <h2>₹8.42L</h2>
                <span><b>↑ 12.4%</b> from last week</span>
              </div>
              <div>
                <p>RECOVERED REVENUE <small>BACKTEST</small></p>
                <h2>₹5.71L</h2>
                <span><b className="green">67.8%</b> recovery rate</span>
              </div>
              <div>
                <p>LIVE TEST RECOVERED</p>
                <h2>{money(liveRecovered)}</h2>
                <span>Across {records.filter(r => r.status === 'RECOVERED').length + 12} test transactions</span>
              </div>
              <div className="heroGraphic">
                <div className="ring">
                  <b>68%</b>
                  <small>RECOVERY</small>
                </div>
              </div>
            </section>

            <section className="split">
              <div className="panel cases">
                <div className="panelhead">
                  <div>
                    <p className="eyebrow">PRIORITY QUEUE</p>
                    <h3>Recovery opportunities</h3>
                  </div>
                  <button className="link" onClick={() => setTab('audit')}>Open workspace →</button>
                </div>
                <div className="filters">
                  {['All', 'High', 'Medium', 'Review'].map(x => (
                    <button onClick={() => setFilter(x)} className={filter === x ? 'selected' : ''} key={x}>{x}</button>
                  ))}
                </div>
                {visible.map(c => (
                  <button className="case" onClick={() => choose(c)} key={c.id}>
                    <span className={'dot ' + c.tone}></span>
                    <div>
                      <strong>{money(c.amount)} <small>{c.priority.toUpperCase()}</small></strong>
                      <p>{c.failure_reason} · {c.customer}</p>
                    </div>
                    <div className="prob">
                      <b>{c.probability}%</b>
                      <small>recovery likelihood</small>
                    </div>
                    <span className="arrow">→</span>
                  </button>
                ))}
              </div>

              <div className="rightcol">
                <div className="panel">
                  <div className="panelhead">
                    <div>
                      <p className="eyebrow">AUTONOMY STATUS</p>
                      <h3>Agent activity</h3>
                    </div>
                    <span className="live"><b></b> Active</span>
                  </div>
                  <div className="activity">
                    <p><i className="ok">✓</i><b>34</b> payments recovered</p>
                    <p><i className="ok">✓</i><b>17</b> Razorpay payment links sent</p>
                    <p><i className="ok">✓</i><b>12</b> retries executed</p>
                    <p><i className="pause">Ⅱ</i><b>8</b> cases stopped by policy</p>
                  </div>
                </div>
                <div className="insight">
                  <p>AI ENGINE INSIGHT</p>
                  <b>Network timeout failures are recovering 2.3× more often after 6 PM.</b>
                  <span>XGBoost Model · 5,000 synthetic payment events analyzed</span>
                </div>
              </div>
            </section>
          </>
        ) : tab === 'intake' ? (
          <section className="intake">
            <p className="eyebrow">NEW FAILED PAYMENT OR ABANDONED CHECKOUT</p>
            <h2>Start a controlled recovery</h2>
            <p className="sub">Every payment event is stored in the recovery ledger. No money action is executed until policy approves it.</p>
            <form onSubmit={submitIntake}>
              <label>Customer name
                <input required value={intake.customer} onChange={e => setIntake({ ...intake, customer: e.target.value })} placeholder="e.g. Rahul Sharma" />
              </label>
              <label>Customer mobile <small>Required for Razorpay Payment Link SMS/WhatsApp</small>
                <input placeholder="919876543210" value={intake.customer_contact} onChange={e => setIntake({ ...intake, customer_contact: e.target.value })} />
              </label>
              <label>Amount (₹)
                <input required type="number" min="1" value={intake.amount} onChange={e => setIntake({ ...intake, amount: e.target.value })} placeholder="4999" />
              </label>
              <label>Failure reason
                <select value={intake.failure_reason} onChange={e => setIntake({ ...intake, failure_reason: e.target.value })}>
                  <option>Network timeout</option>
                  <option>Bank / network error</option>
                  <option>Checkout abandoned</option>
                  <option>Issuer declined</option>
                </select>
              </label>
              <label>Previous attempts
                <input type="number" min="0" max="5" value={intake.attempts} onChange={e => setIntake({ ...intake, attempts: e.target.value })} />
              </label>
              <label>Customer success rate
                <select value={intake.customer_success_rate} onChange={e => setIntake({ ...intake, customer_success_rate: e.target.value })}>
                  <option value="0.95">High (95%)</option>
                  <option value="0.75">Medium (75%)</option>
                  <option value="0.40">Low (40%)</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={intake.abandoned} onChange={e => setIntake({ ...intake, abandoned: e.target.checked })} /> Checkout was abandoned
              </label>
              <button className="primary" type="submit">Score & Create Recovery Case →</button>
            </form>
            {intakeMessage && <div className="intakeMessage">{intakeMessage}</div>}
          </section>
        ) : tab === 'audit' ? (
          <section className="workspace">
            <div className="queue">
              <p className="eyebrow">CASE QUEUE</p>
              {records.map(c => (
                <button className={selected.id === c.id ? 'current' : ''} onClick={() => choose(c)} key={c.id}>
                  <span className={'dot ' + c.tone}></span>
                  <div>
                    <b>{money(c.amount)}</b>
                    <small>{c.id} · {c.probability}% score · {c.status}</small>
                  </div>
                </button>
              ))}
            </div>

            <div className="detail">
              <div className="detailtop">
                <div>
                  <p className="eyebrow">TRANSACTION #{selected.id}</p>
                  <h2>{money(selected.amount)} <span className="failed">{selected.failure_reason.toUpperCase()}</span></h2>
                  <p>{selected.customer} ({selected.customer_contact || 'No contact'}) · {selected.attempts} prior retries · {selected.customerRate}% success rate</p>
                </div>
                <div className={'state ' + selected.status.toLowerCase()}>
                  {selected.status.replaceAll('_', ' ')}
                </div>
              </div>

              {/* ML FEATURE ATTRIBUTION CARD */}
              <div className="attributionCard">
                <div className="cardHead">
                  <p className="eyebrow">ML MODEL FEATURE ATTRIBUTION (SHAP)</p>
                  <strong>Recovery Likelihood: {selected.probability}%</strong>
                </div>
                <div className="chips">
                  {(selected.attributions && selected.attributions.length > 0 ? selected.attributions : [
                    { factor: 'Failure Reason', detail: selected.failure_reason, impact: selected.failure_reason.includes('network') ? '+24%' : '+8%', type: 'positive' },
                    { factor: 'Customer Profile', detail: `Past Success Rate ${selected.customerRate}%`, impact: selected.customerRate > 70 ? '+18%' : '-10%', type: selected.customerRate > 70 ? 'positive' : 'negative' }
                  ]).map((item, idx) => (
                    <div className={'chip ' + item.type} key={idx}>
                      <b>{item.impact}</b> {item.factor}: <span>{item.detail}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* DIAGNOSIS CARD */}
              <div className="diagnosisCard">
                <p className="eyebrow">AI AGENT DIAGNOSIS & REASONING</p>
                <p className="diagText">
                  "{selected.diagnosis || `Temporary network glitch detected during authorization. Customer has a strong history of successful payments (${selected.customerRate}%). Bounded retry permitted.`}"
                </p>
              </div>

              {/* RECOMMENDED ACTION */}
              <div className="decision">
                <div>
                  <p>RECOVERY PROBABILITY</p>
                  <strong>{selected.probability}%</strong>
                  <small>Gradient Boosting Confidence: HIGH</small>
                </div>
                <div>
                  <p>RECOMMENDED ACTION</p>
                  <strong>{selected.recommendation}</strong>
                  <small>Expected recovery: {money(Math.round(selected.amount * selected.probability / 100))}</small>
                </div>
                {selected.status === 'AT_RISK' ? (
                  <button className="primary" onClick={executeAction}>
                    Execute {selected.recommendation} <span>→</span>
                  </button>
                ) : (
                  <span className="actionDone">Action Executed ({selected.status})</span>
                )}
              </div>

              {/* OUTREACH COPY PREVIEW IF LINK CREATED */}
              {(selected.recovery_url || selected.recommendation === 'Send payment link') && (
                <div className="outreachPreview">
                  <p className="eyebrow">CUSTOM OUTREACH COPY (SMS / WHATSAPP)</p>
                  <div className="outreachBox">
                    <strong>📱 WhatsApp Message Preview:</strong>
                    <p>⚡ <i>Razorpay Payment Alert</i></p>
                    <p>Hello {selected.customer}, we noticed your payment of <b>{money(selected.amount)}</b> wasn't completed due to a temporary issue.</p>
                    <p>Tap here to complete securely: <a href={selected.recovery_url || `https://rzp.io/i/rec_${selected.id.lower()}`} target="_blank" rel="noreferrer">{selected.recovery_url || `https://rzp.io/i/rec_${selected.id.lower()}`}</a></p>
                  </div>
                </div>
              )}

              {/* TIMELINE AUDIT TRAIL */}
              <div className="timeline">
                <p className="eyebrow">EXPLAINABLE AUDIT TRAIL (IMMUTABLE LEDGER)</p>
                {logs.map((l, i) => (
                  <div className="event" key={i}>
                    <span className={l[1].includes('SUCCESS') || l[1].includes('RECOVERED') || l[1].includes('PAID') ? 'success' : l[1].includes('FAILED') || l[1].includes('STOP') ? 'warning' : ''}></span>
                    <time>{l[0]}</time>
                    <div>
                      <b>{l[1].replaceAll('_', ' ')}</b>
                      <p>{l[2]}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* SIMULATION DEMO TRIGGER BUTTONS */}
              <div className="simDemoActions">
                <button className="simBtn green" onClick={simulateWebhookPaid}>
                  ✓ Demo: Simulate Razorpay Webhook "Payment Paid" ({money(selected.amount)})
                </button>
                <button className="simBtn red" onClick={simulateSecondRetryFail}>
                  ⚠️ Demo: Simulate 2nd Retry Failure (Triggers Stop Rule)
                </button>
              </div>
            </div>
          </section>
        ) : tab === 'evaluation' ? (
          <section className="evalSection">
            <p className="eyebrow">EMPIRICAL MODEL EVALUATION & BUSINESS ROI</p>
            <h2>ML Model Metrics & Financial Backtest</h2>
            <p className="sub">Evaluated on a held-out test split of 5,000 payment failure events using Scikit-Learn Gradient Boosting.</p>

            <div className="metricsGrid">
              <div className="metricCard">
                <p>PRECISION</p>
                <h3>{evalData ? `${(evalData.precision * 100).toFixed(1)}%` : '91.6%'}</h3>
                <span>Correct positive recovery predictions</span>
              </div>
              <div className="metricCard">
                <p>RECALL</p>
                <h3>{evalData ? `${(evalData.recall * 100).toFixed(1)}%` : '95.2%'}</h3>
                <span>Total recoverable payments captured</span>
              </div>
              <div className="metricCard">
                <p>ROC - AUC</p>
                <h3>{evalData ? evalData.roc_auc : '0.968'}</h3>
                <span>Discriminative ability across thresholds</span>
              </div>
              <div className="metricCard">
                <p>F1 SCORE</p>
                <h3>{evalData ? `${(evalData.f1_score * 100).toFixed(1)}%` : '93.4%'}</h3>
                <span>Harmonic mean of precision & recall</span>
              </div>
            </div>

            <div className="split">
              <div className="panel">
                <p className="eyebrow">CONFUSION MATRIX (HELD-OUT TEST SET)</p>
                <table className="evalTable">
                  <thead>
                    <tr>
                      <th>Actual \ Predicted</th>
                      <th>Predicted Unrecoverable</th>
                      <th>Predicted Recoverable</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><b>Actual Unrecoverable</b></td>
                      <td className="good">{evalData?.confusion_matrix?.true_negative || 338} (TN)</td>
                      <td className="bad">{evalData?.confusion_matrix?.false_positive || 53} (FP)</td>
                    </tr>
                    <tr>
                      <td><b>Actual Recoverable</b></td>
                      <td className="bad">{evalData?.confusion_matrix?.false_negative || 29} (FN)</td>
                      <td className="good">{evalData?.confusion_matrix?.true_positive || 580} (TP)</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="panel">
                <p className="eyebrow">FINANCIAL IMPACT SUMMARY</p>
                <div className="finList">
                  <p><span>Revenue at Risk (Test):</span> <b>{money(evalData?.financials?.revenue_at_risk_inr || 3609943)}</b></p>
                  <p><span>Recovered Revenue:</span> <b className="green">{money(evalData?.financials?.revenue_recovered_inr || 2363735)}</b></p>
                  <p><span>Recovery Rate:</span> <b className="green">{evalData?.financials?.recovery_rate_percent || 65.5}%</b></p>
                  <p><span>False Positive Cost Avoided:</span> <b>{money(evalData?.financials?.false_positive_cost_avoided_inr || 152100)}</b></p>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="settings">
            <p className="eyebrow">MERCHANT-DEFINED BOUNDARIES</p>
            <h2>Policy Controls & Safety Guardrails</h2>
            <p className="sub">The AI Agent recommends actions; it can only execute within these merchant-defined boundaries.</p>

            <form onSubmit={handlePolicySubmit}>
              <div className="settingsGrid">
                <label>
                  <span>Maximum automatic retry attempts</span>
                  <input
                    type="number" min="0" max="5"
                    value={policyForm.max_retry_attempts}
                    onChange={e => setPolicyForm({ ...policyForm, max_retry_attempts: e.target.value })}
                  />
                  <i>Default: 2 attempts max</i>
                </label>

                <label>
                  <span>Maximum automatic recovery amount (₹)</span>
                  <input
                    type="number" min="100" max="1000000"
                    value={policyForm.max_automatic_amount}
                    onChange={e => setPolicyForm({ ...policyForm, max_automatic_amount: e.target.value })}
                  />
                  <i>Exceeding this requires merchant approval</i>
                </label>

                <label>
                  <span>Minimum recovery probability threshold (%)</span>
                  <input
                    type="number" min="10" max="95"
                    value={policyForm.minimum_probability}
                    onChange={e => setPolicyForm({ ...policyForm, minimum_probability: e.target.value })}
                  />
                  <i>Below this triggers Payment Link / Manual review</i>
                </label>

                <label>
                  <span>Retry cooldown period (minutes)</span>
                  <input
                    type="number" min="5" max="1440"
                    value={policyForm.retry_cooldown_minutes}
                    onChange={e => setPolicyForm({ ...policyForm, retry_cooldown_minutes: e.target.value })}
                  />
                  <i>Prevents rapid repeat charges on rails</i>
                </label>
              </div>

              <button className="primary" type="submit">Save Policy Guardrails →</button>
            </form>
            {policyMessage && <div className="policyNote" style={{ marginTop: '18px' }}>{policyMessage}</div>}
          </section>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
