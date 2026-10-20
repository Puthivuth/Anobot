import { useState, useEffect } from 'react';
import { LockKeyhole, Plus, Trash2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { api, type ApiKey } from '../api/client';

export function AdminApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState('Gemini API Key');
  const [service, setService] = useState('gemini');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'ok' | 'error'; message: string } | null>(null);
  const [notice, setNotice] = useState('');

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  const loadKeys = async () => {
    try {
      const data = await api.getApiKeys();
      setKeys(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    setTestResult(null);
    try {
      await api.createApiKey({
        name: name.trim(),
        service,
        value: value.trim(),
      });
      setValue('');
      loadKeys();
      showNotice('API key stored securely (encrypted at rest with Fernet).');
    } catch (err: any) {
      showNotice(err.message || 'Failed to save API key');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (keyId: string) => {
    try {
      await api.deleteApiKey(keyId);
      loadKeys();
      showNotice('API key deleted.');
    } catch (err: any) {
      showNotice(err.message || 'Failed to delete API key');
    }
  };

  const handleTestKey = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testGeminiKey(value.trim() || undefined);
      setTestResult({
        status: res.status === 'ok' ? 'ok' : 'error',
        message: res.message,
      });
    } catch (err: any) {
      setTestResult({
        status: 'error',
        message: err.message || 'Failed to verify API key with Google Gemini.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {notice && <div className="app-notice">{notice}</div>}

      <section className="panel app-panel">
        <div className="panel-heading">
          <div>
            <h3>Encrypted API Key Slots</h3>
            <p>API keys are encrypted at rest with Fernet (AES-256-GCM) using your configured master encryption key.</p>
          </div>
        </div>

        {/* Existing keys */}
        <div style={{ margin: '14px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {keys.length === 0 ? (
            <p className="muted">No API keys saved yet. Add a Gemini API key below to enable AI-assisted auto labeling.</p>
          ) : (
            keys.map((k) => (
              <div
                key={k.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LockKeyhole size={14} style={{ color: '#6706ce' }} />
                    <strong style={{ fontSize: '13px' }}>{k.name}</strong>
                    <span className="role-pill" style={{ textTransform: 'uppercase' }}>{k.service}</span>
                    <span className="badge-active">ACTIVE</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#777', marginTop: '4px' }}>
                    Value: <code>{k.masked_value}</code> · Configured {new Date(k.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="app-button" onClick={handleTestKey} disabled={testing}>
                    {testing ? <RefreshCw size={13} className="animate-spin" /> : null} Test Key
                  </button>
                  <button
                    className="icon-button"
                    style={{ color: '#d93a52', borderColor: 'transparent' }}
                    onClick={() => handleDelete(k.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Test Result Message */}
        {testResult && (
          <div
            className={testResult.status === 'ok' ? 'alert-success' : 'alert-error'}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {testResult.status === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{testResult.message}</span>
          </div>
        )}

        {/* Add Key Form */}
        <form onSubmit={handleSaveKey} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #eee' }}>
          <div className="form-grid">
            <label className="app-field">
              <span>Key Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Gemini 2.0 Flash Key"
                required
              />
            </label>

            <label className="app-field">
              <span>Service</span>
              <select value={service} onChange={(e) => setService(e.target.value)}>
                <option value="gemini">Google Gemini API</option>
              </select>
            </label>

            <label className="app-field form-span">
              <span>API Key Secret (AIzaSy...)</span>
              <input
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Paste API key here..."
                required
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="primary-button" disabled={loading}>
              <Plus size={14} /> {loading ? 'Saving...' : 'Save Encrypted Key'}
            </button>
            <button type="button" className="app-button" onClick={handleTestKey} disabled={testing || !value}>
              Test Entered Key
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

