import {SupplierPortal} from './SupplierPortal';
import './inventory.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './accounts.css';
import './counter.css';

createRoot(document.getElementById('root')!).render(<StrictMode>{window.location.pathname==='/supplier'?<SupplierPortal/>:<App />}</StrictMode>);

if('serviceWorker' in navigator){
 navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready).then(reg=>{const cache=()=>reg.active?.postMessage({type:'CACHE_SHELL',paths:performance.getEntriesByType('resource').map(r=>r.name)});cache();window.addEventListener('load',cache,{once:true});}).catch(()=>{});
}
