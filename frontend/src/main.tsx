import {SupplierPortal} from './SupplierPortal';
import './inventory.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { InstallApp } from './InstallApp';
import './styles.css';
import './accounts.css';
import './counter.css';

createRoot(document.getElementById('root')!).render(<StrictMode>{window.location.pathname==='/supplier'?<SupplierPortal/>:<><InstallApp/><App /></>}</StrictMode>);

if(import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator){
 navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(error=>console.error('Joyfrimens offline setup failed:', error));
}
