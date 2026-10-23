import { useEffect, useState } from 'react';
import { api, ApiError, messageOf, type AuditEvent } from './api';
import { money } from './catalogue-model';
import { gmtDateTime } from './display';

interface PriceEntry {id:string;name:string;strength:string;label:string;old_price_minor:number|null;price_minor:number;actor_name:string;changed_at:string}
export function ActivityReport({onExpired}:{onExpired:()=>void}) {
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [view,setView]=useState('activity'),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
  const [events,setEvents]=useState<AuditEvent[]>([]),[prices,setPrices]=useState<PriceEntry[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');
    const request=view==='prices'
      ? api<{entries:PriceEntry[]}>(`/admin/price-history?date=${date}&page=${page}`,{signal:controller.signal}).then(r=>setPrices(r.entries))
      : api<{events:AuditEvent[]}>(`/admin/audit?date=${date}&page=${page}`,{signal:controller.signal}).then(r=>setEvents(r.events));
    request.catch(e=>{if(!controller.signal.aborted){if(e instanceof ApiError&&e.status===401)onExpired();else setError(messageOf(e));}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
  },[view,page,date,revision]);
  return <section><h1>Activity reports</h1><p>Administrator access only. Changes are recorded with the person and time.</p><label>Activity date (GMT)<input type="date" value={date} onChange={e=>{if(e.target.value){setDate(e.target.value);setPage(1);}}}/></label><div className="account-tools"><button className="text-button" aria-pressed={view==='activity'} onClick={()=>{setView('activity');setPage(1);}}>All activity</button><button className="text-button" aria-pressed={view==='prices'} onClick={()=>{setView('prices');setPage(1);}}>Price changes</button><button className="text-button" onClick={()=>setRevision(n=>n+1)}>Refresh</button></div>
    {error&&<p role="alert" className="error-message">{error}</p>}{loading?<p>Loading records...</p>:view==='prices'?prices.map(p=><article className="panel" key={p.id}><strong>{p.name} {p.strength} / {p.label}</strong><p>{p.old_price_minor===null?'Initial price':money(p.old_price_minor)} → {money(p.price_minor)}</p><small>{p.actor_name} / {gmtDateTime(p.changed_at)} GMT</small></article>):events.map(event=><article className="panel" key={event.id}><strong>{event.action.replace(/^inventory\./,'').replaceAll('.',' / ').replaceAll('_',' ')}</strong><p>{event.actor_name??'Unauthenticated attempt'} / {gmtDateTime(event.occurred_at)} GMT</p><details><summary>View record</summary><pre className="activity-details">{JSON.stringify(event.details,null,2)}</pre></details></article>)}
    {!loading&&!(view==='prices'?prices:events).length&&<p>No records for this date on this page.</p>}
    <div className="account-tools"><button disabled={loading||page===1} onClick={()=>setPage(p=>p-1)}>Newer</button><span>Page {page}</span><button disabled={loading||(view==='prices'?prices.length<30:events.length<100)} onClick={()=>setPage(p=>p+1)}>Older</button></div>
  </section>;
}
