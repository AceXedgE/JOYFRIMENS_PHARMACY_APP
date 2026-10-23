import {useEffect,useState} from 'react';
import {type Session} from './api';
import {queuedWrites,syncSales} from './offline-sales';
export function SyncStatus({session}:{session:Session}){
 const[count,setCount]=useState(0),[error,setError]=useState(''),[offline,setOffline]=useState(!navigator.onLine),[late,setLate]=useState(false);
 useEffect(()=>{
  let active=true,running=false;
  const refresh=async()=>{const items=await queuedWrites(session.user.id);if(active){setCount(new Set(items.map(([,q])=>q.ticketId)).size);setError(items.find(([,q])=>q.error)?.[1].error??'');setOffline(!navigator.onLine);const now=new Date();setLate(now.getUTCHours()>20||now.getUTCHours()===20&&now.getUTCMinutes()>=30);}};
  const sync=async()=>{if(running)return;running=true;try{await syncSales(session);}catch{}finally{running=false;await refresh();}};
  const visible=()=>{if(document.visibilityState==='visible')void sync();};
  const changed=()=>void refresh();void sync();
  const timer=setInterval(()=>void sync(),15000);
  window.addEventListener('online',sync);window.addEventListener('offline',changed);window.addEventListener('offline-records-changed',changed);document.addEventListener('visibilitychange',visible);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('online',sync);window.removeEventListener('offline',changed);window.removeEventListener('offline-records-changed',changed);document.removeEventListener('visibilitychange',visible);};
 },[session.user.id,session.csrfToken]);
 if(!count&&!offline)return null;
 return <div className="sync-status" role="status">{offline?'Offline - using saved medicine prices. ':''}{count>0&&`${count} ticket(s) waiting to sync. `}{error&&<span>Needs review: {error} </span>}{late&&(offline||count>0)&&<strong>It is after 8:30pm GMT. Reconnect this device before finishing the daily count. </strong>}<button className="text-button" onClick={()=>void syncSales(session)}>Sync now</button></div>;
}
