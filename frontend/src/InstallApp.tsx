import { useEffect, useState } from 'react';
import './pwa.css';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    const display = window.matchMedia('(display-mode: standalone)');
    const changed = () => setInstalled(display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', complete);
    display.addEventListener('change', changed);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', complete);
      display.removeEventListener('change', changed);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    setBusy(true); setError('');
    try {
      await prompt.prompt();
      if ((await prompt.userChoice).outcome === 'accepted') setInstalled(true);
    } catch {
      setError('Installation could not start. Try your browser’s install menu.');
    } finally {
      setPrompt(null); setBusy(false);
    }
  }

  if (installed) return null;
  return <aside className="install-app" aria-label="Install Joyfrimens">
    {prompt ? <button className="secondary-button" disabled={busy} onClick={() => void install()}>Install app</button> : <details>
      <summary>Install app</summary>
      {!window.isSecureContext ? <p>Open Joyfrimens over HTTPS to install it on this device.</p> : <>
        <p>On iPhone or iPad, open this page in Safari, tap Share, then Add to Home Screen.</p>
        <p>On Android or a computer, use your browser’s Install app or Add to Home Screen option, if available.</p>
      </>}
    </details>}
    {error && <p role="status">{error}</p>}
  </aside>;
}
