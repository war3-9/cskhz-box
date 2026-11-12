import { useEffect, useState } from 'react';
import { prepareIconPairDirectory } from './io';

export function useIconPairDirectory(enabled: boolean, directory: string) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ preparing: false, error: '' });
  useEffect(() => {
    let cancelled = false;
    setState({ preparing: enabled && !!directory, error: '' });
    if (enabled && directory) void prepareIconPairDirectory(directory).then(
      () => { if (!cancelled) setState({ preparing: false, error: '' }); },
      error => { if (!cancelled) setState({ preparing: false, error: String(error) }); },
    );
    return () => { cancelled = true; };
  }, [enabled, directory, revision]);
  return { ...state, retry: () => setRevision(value => value + 1) };
}
