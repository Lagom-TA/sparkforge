import { useEffect, useState } from 'react';
import { client, getErrorMessage } from '@/lib/sparkforge';
import { Button } from './ui/button';

export default function VersionAcceptance({versionId, criteria, readOnly, onVerified}: {
  versionId: number; criteria: string[]; readOnly: boolean; onVerified: () => void;
}) {
  const [checks, setChecks] = useState<boolean[]>(criteria.map(() => false));
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    client.apiCall.invoke({url: `/api/v1/version-verification/${versionId}`, method: 'GET', data: {}}).then(result => {
      if (active) {setVerified(result.data.verified); setLoaded(true);}
    }).catch(cause => {if (active) setError(getErrorMessage(cause));});
    return () => {active = false;};
  }, [versionId, reload]);
  async function save() {
    setBusy(true); setError('');
    try {
      await client.apiCall.invoke({url: `/api/v1/version-verification/${versionId}`, method: 'PUT', data: {checks}});
      setVerified(true); onVerified();
    } catch (cause) {setError(getErrorMessage(cause));}
    finally {setBusy(false);}
  }
  return <section className="mb-4 rounded-lg border p-4">
    <h3 className="text-sm font-medium">{verified ? '你已确认此版本通过验收' : '功能验收'}</h3>
    <p className="mt-1 text-sm text-muted-foreground">源码生成完成不代表功能已验证。请在下方实际操作后逐项确认。</p>
    {!verified && <div className="my-3 space-y-2">{criteria.map((criterion, index) => <label key={index} className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" disabled={readOnly || busy} checked={checks[index]} onChange={event => setChecks(values => values.map((value, i) => i === index ? event.target.checked : value))} /><span className="min-w-0 break-words">{criterion}</span></label>)}</div>}
    {error && <div role="alert" className="my-2 text-sm text-destructive">{error}{!loaded && <Button size="sm" variant="ghost" onClick={() => {setError(''); setReload(value => value + 1);}}>重新加载</Button>}</div>}
    {!verified && <Button size="sm" disabled={!loaded || readOnly || busy || !checks.length || !checks.every(Boolean)} onClick={() => void save()}>{busy ? '正在保存…' : '确认已逐项验证'}</Button>}
  </section>;
}
