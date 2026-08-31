import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './razorpay.css';

const cases = [
  { id:'RZ1023', customer:'Rahul Sharma', amount:4999, issue:'Bank / network error', probability:87, priority:'High', attempts:1, customerRate:91, recommendation:'Retry payment', status:'Ready', tone:'red' },
  { id:'RZ1041', customer:'Aisha Khan', amount:8999, issue:'Checkout abandoned', probability:63, priority:'Medium', attempts:0, customerRate:72, recommendation:'Send payment link', status:'Ready', tone:'amber' },
  { id:'RZ1058', customer:'Vikram Nair', amount:42500, issue:'Issuer declined', probability:38, priority:'Review', attempts:2, customerRate:44, recommendation:'Escalate to merchant', status:'Hold', tone:'blue' },
  { id:'RZ1066', customer:'Meera Iyer', amount:2499, issue:'Network timeout', probability:82, priority:'High', attempts:1, customerRate:95, recommendation:'Retry payment', status:'Ready', tone:'red' },
];

const money = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);
const time = () => new Date().toLocaleTimeString('en-IN',{hour12:false});

function App(){
  const [selected,setSelected] = useState(cases[0]);
  const [tab,setTab] = useState('overview');
  const [logs,setLogs] = useState([
    ['09:18:04','PAYMENT_FAILED','Payment RZ1023 reported a bank/network failure'],
    ['09:18:05','RISK_CALCULATED','Recovery likelihood scored at 87%'],
    ['09:18:06','CAUSE_IDENTIFIED','Temporary payment rail issue likely'],
    ['09:18:07','POLICY_APPROVED','Within amount, retry and consent limits'],
    ['09:18:08','RETRY_INITIATED','Retry scheduled after 30-minute cooldown'],
  ]);
  const [result,setResult] = useState('pending');
  const [liveRecovered,setLiveRecovered] = useState(24500);
  const [filter,setFilter] = useState('All');
  const visible = useMemo(()=>filter==='All'?cases:cases.filter(x=>x.priority===filter),[filter]);
  const choose = c => { setSelected(c); setResult('pending'); setTab('audit'); setLogs([
    ['08:42:13','PAYMENT_FAILED',`Payment ${c.id} reported: ${c.issue}`],
    ['08:42:14','RISK_CALCULATED',`Recovery likelihood scored at ${c.probability}%`],
    ['08:42:15','CAUSE_IDENTIFIED', c.issue==='Checkout abandoned'?'Customer dropped before authorization':'Temporary payment rail issue likely'],
    ['08:42:16','POLICY_APPROVED', c.amount<=10000 && c.attempts<3 ? 'Within merchant-defined safety boundaries' : 'Autonomous recovery not permitted'],
  ]); };
  const execute = () => {
    if(selected.amount>10000 || selected.attempts>=3){ setResult('stopped'); setLogs(l=>[...l,[time(),'POLICY_STOP','Action blocked: merchant automation threshold reached']]); return; }
    if(selected.id==='RZ1041'){ setResult('link'); setLogs(l=>[...l,[time(),'PAYMENT_LINK_SENT','Secure payment link delivered to customer']]); return; }
    setResult('recovered'); setLiveRecovered(x=>x+selected.amount); setLogs(l=>[...l,[time(),'RETRY_INITIATED','Payment retry safely initiated'],[time(),'PAYMENT_SUCCESS',`${money(selected.amount)} recovered in test mode`]]);
  };
  const simulateFail=()=>{ setResult('stopped'); setLogs(l=>[...l,[time(),'RETRY_FAILED','Retry #2 failed — issuer unavailable'],[time(),'POLICY_STOP','Retry threshold reached; moved to manual recovery workflow'],[time(),'MERCHANT_NOTIFIED','Merchant notified with recommended payment link']]); };
  return <div className="app">
    <aside><div className="brand"><div className="mark">↗</div><div>Razor<span>Recover</span><small>POWERED FOR RAZORPAY TEST MODE</small></div></div>
      <nav>{[['overview','Overview'],['audit','Recovery workspace'],['settings','Policy controls']].map(([id,label])=><button className={tab===id?'active':''} onClick={()=>setTab(id)} key={id}><i>{id==='overview'?'◈':id==='audit'?'⌘':'⚙'}</i>{label}</button>)}</nav>
      <div className="sidecard"><p>LIVE TEST MODE</p><strong>12</strong><span>tracked payment events</span><hr/><em>Razorpay test objects only</em></div><div className="profile"><div>AS</div><span>Acme Store<small>Merchant admin</small></span><b>⌄</b></div>
    </aside>
    <main><header><div><p className="eyebrow">{tab==='overview'?'TODAY · 29 AUG 2026':'CONTROLLED RECOVERY WORKFLOW'}</p><h1>{tab==='overview'?'Recover revenue before it slips away.':'Every payment action has a reason.'}</h1></div><div className="headerActions"><span className="mode"><b></b> Test mode connected</span><button className="outline" onClick={()=>setTab('settings')}>Policy limits</button></div></header>
    {tab==='overview' ? <>
      <section className="hero"><div><p>REVENUE AT RISK</p><h2>₹8.42L</h2><span><b>↑ 12.4%</b> from last week</span></div><div><p>RECOVERED REVENUE <small>BACKTEST</small></p><h2>₹5.71L</h2><span><b className="green">67.8%</b> recovery rate</span></div><div><p>LIVE TEST RECOVERED</p><h2>{money(liveRecovered)}</h2><span>Across 12 test transactions</span></div><div className="heroGraphic"><div className="ring"><b>68%</b><small>RECOVERY</small></div></div></section>
      <section className="split"><div className="panel cases"><div className="panelhead"><div><p className="eyebrow">PRIORITY QUEUE</p><h3>Recovery opportunities</h3></div><button className="link" onClick={()=>setTab('audit')}>Open workspace →</button></div><div className="filters">{['All','High','Medium','Review'].map(x=><button onClick={()=>setFilter(x)} className={filter===x?'selected':''} key={x}>{x}</button>)}</div>{visible.map(c=><button className="case" onClick={()=>choose(c)} key={c.id}><span className={'dot '+c.tone}></span><div><strong>{money(c.amount)} <small>{c.priority.toUpperCase()}</small></strong><p>{c.issue} · {c.customer}</p></div><div className="prob"><b>{c.probability}%</b><small>recovery likelihood</small></div><span className="arrow">→</span></button>)}</div>
      <div className="rightcol"><div className="panel"><div className="panelhead"><div><p className="eyebrow">AUTONOMY STATUS</p><h3>Agent activity</h3></div><span className="live"><b></b> Running</span></div><div className="activity"><p><i className="ok">✓</i><b>34</b> payments recovered</p><p><i className="ok">✓</i><b>17</b> payment links sent</p><p><i className="ok">✓</i><b>12</b> retries executed</p><p><i className="pause">Ⅱ</i><b>8</b> cases stopped by policy</p></div></div><div className="insight"><p>AI INSIGHT</p><b>Network failures are recovering 2.3× more often after 6 PM.</b><span>Recovery model · 1,247 events analyzed</span></div></div></section>
    </> : tab==='audit' ? <section className="workspace"><div className="queue"><p className="eyebrow">CASE QUEUE</p>{cases.map(c=><button className={selected.id===c.id?'current':''} onClick={()=>choose(c)} key={c.id}><span className={'dot '+c.tone}></span><div><b>{money(c.amount)}</b><small>{c.id} · {c.probability}% likely</small></div></button>)}</div><div className="detail"><div className="detailtop"><div><p className="eyebrow">TRANSACTION #{selected.id}</p><h2>{money(selected.amount)} <span className="failed">PAYMENT FAILED</span></h2><p>{selected.customer} · {selected.issue} · {selected.attempts} prior attempt</p></div><div className={'state '+result}>{result==='recovered'?'RECOVERED':result==='stopped'?'STOPPED BY POLICY':result==='link'?'LINK SENT':'AWAITING ACTION'}</div></div><div className="decision"><div><p>RECOVERY PROBABILITY</p><strong>{selected.probability}%</strong><small>ML model confidence: high</small></div><div><p>RECOMMENDED ACTION</p><strong>{selected.recommendation}</strong><small>Expected recovery: {money(Math.round(selected.amount*selected.probability/100))}</small></div><button className="primary" onClick={execute}>{selected.recommendation} <span>→</span></button></div><div className="timeline"><p className="eyebrow">EXPLAINABLE AUDIT TRAIL</p>{logs.map((l,i)=><div className="event" key={i}><span className={l[1].includes('SUCCESS')?'success':l[1].includes('FAILED')||l[1].includes('STOP')?'warning':''}></span><time>{l[0]}</time><div><b>{l[1].replaceAll('_',' ')}</b><p>{l[2]}</p></div></div>)}</div>{result==='pending'&&selected.id==='RZ1023'&&<button className="dangerlink" onClick={simulateFail}>Demo: simulate second retry failure</button>}</div></section> : <section className="settings"><p className="eyebrow">MERCHANT-DEFINED BOUNDARIES</p><h2>Policy controls</h2><p className="sub">The agent can recommend anything; it can only act within these limits.</p><div className="settingsGrid">{[['Maximum automatic retry attempts','2'],['Maximum automated recovery amount','₹10,000'],['Minimum recovery probability','70%'],['Retry cooldown','30 minutes'],['Maximum customer reminders','2']].map(([a,b])=><label key={a}><span>{a}</span><strong>{b}</strong><i>✓ Active</i></label>)}</div><div className="policyNote">Policy gate is enforced before every money-related action. Exceeding any threshold stops automation and alerts the merchant.</div></section>}
    </main>
  </div>
}
createRoot(document.getElementById('root')).render(<App/>);
