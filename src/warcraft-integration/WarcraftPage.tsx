import { useEffect, useState } from 'react';
import { WarcraftWorkspace } from '../warcraft-ui/App';
import { TitleBar } from '../app/TitleBar';
import { initializeWarcraft, warcraftRestoreWarning } from './persistence';
import { UiSettings } from './settings/UiSettings';
import './workspace.css';
export function WarcraftPage({ active, goHome }: { active: boolean; goHome: () => void }) {
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [settings, setSettings] = useState(false);
  useEffect(() => { void initializeWarcraft().then(() => setReady(true)).catch(error => setError(String(error))); }, []);
  return <><TitleBar viewer goHome={goHome} featureSettings={() => setSettings(true)} />
    <div className="warcraft-normal-slot">{error ? <p role="alert">{error}</p> : ready && <WarcraftWorkspace embedded initialMessage={warcraftRestoreWarning()} />}</div>
    {settings && active && <UiSettings close={() => setSettings(false)} />}</>;
}
