import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, messageOf, type Session, type Shop } from './api';
import { money, parseMoney } from './catalogue-model';

type Entry={requestKey:string;amountMinor:number;reason:string};
export function MoneyOut({session,shop,onExpired,setNavigationGuard}:{session:Session;shop:Shop;onExpired:()=>void;setNavigationGuard:(guard:(()=>Promise<boolean>)|null)=>void}){
  const storageKey=`money-out:${session.user.id}:${shop.id}`;
  const [pending,setPending]=useState<Entry|null>(()=>{try{return JSON.parse(sessionStorage.getItem(storageKey)??'null');}catch{return null;}});
  const [amount,setAmount]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const blocked=busy||!!pending;
  useEffect(()=>{setNavigationGuard(async()=>{if(blocked){setError('Retry the pending money-out entry before leaving.');return false;}return true;});return()=>setNavigationGuard(null);});
  async function send(entry:Entry){
    setBusy(true);setError('');setNotice('');
    try{
      await api(`/shops/${shop.id}/cash/money-out`,{method:'POST',csrf:session.csrfToken,body:entry});
      sessionStorage.removeItem(storageKey);setPending(null);setAmount('');setReason('');
      setNotice(`${money(entry.amountMinor)} recorded and deducted from today's expected cash.`);
    }catch(e){
      if(e instanceof ApiError&&e.status>=400&&e.status<500){sessionStorage.removeItem(storageKey);setPending(null);if(e.status===401)onExpired();}
      setError(messageOf(e));
    }finally{setBusy(false);}
  }
  async function submit(event:FormEvent){event.preventDefault();if(blocked)return;setError('');
    try{const entry={requestKey:crypto.randomUUID(),amountMinor:parseMoney(amount),reason:reason.trim()};
      if(entry.reason.length<3)throw new Error('Enter a short reason for taking the money.');
      sessionStorage.setItem(storageKey,JSON.stringify(entry));setPending(entry);await send(entry);
    }catch(e){setError(messageOf(e));}
  }
  return <section className="sales"><h1>Money out</h1><p>{shop.name}</p><p>Record money taken from the shop. It is deducted immediately from today's expected cash.</p>
    {error&&<p className="error-message" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {pending&&<button className="primary-button" disabled={busy} onClick={()=>void send(pending)}>Retry money-out entry</button>}
    <form className="sales-form" aria-label="Record money out" onSubmit={e=>void submit(e)}><fieldset disabled={blocked}>
      <label>Amount (GHS)<input inputMode="decimal" required value={amount} onChange={e=>setAmount(e.target.value)}/></label>
      <label>Reason<textarea required minLength={3} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <button className="primary-button">Record money out</button>
    </fieldset></form>
  </section>;
}
