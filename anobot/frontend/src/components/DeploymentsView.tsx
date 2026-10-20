import { useState, useEffect } from 'react';
import { Plus, Copy, Check } from 'lucide-react';
import { api, type Project, type DeployKey } from '../api/client';

interface DeploymentsViewProps {
  project: Project;
}

export function DeploymentsView({ project }: DeploymentsViewProps) {
  const [keys, setKeys] = useState<DeployKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<DeployKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const loadKeys = async () => {
    try {
      const list = await api.getDeployKeys(project.id);
      setKeys(list);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadKeys();
  }, [project.id]);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setLoading(true);
    try {
      const res = await api.createDeployKey(project.id, newKeyName.trim());
      setCreatedKey(res);
      setNewKeyName('');
      loadKeys();
    } catch (err: any) {
      setNotice(err.message || 'Failed to create key');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this deploy key? Any services using it will immediately lose access.')) return;
    try {
      await api.revokeDeployKey(id);
      loadKeys();
      setNotice('Deploy key revoked.');
    } catch (err: any) {
      setNotice(err.message || 'Failed to revoke key');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {notice && <div className="app-notice">{notice}</div>}

      {/* Created Key Modal/Banner */}
      {createdKey && createdKey.raw_key && (
        <section className="panel app-panel" style={{ border: '2px solid #6706ce', background: '#faf8fe' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ color: '#6706ce', margin: 0 }}>Deploy Key Created</h3>
            <button className="app-button" onClick={() => setCreatedKey(null)}>Dismiss</button>
          </div>
          <p style={{ fontSize: '13px', margin: '0 0 10px', color: '#444' }}>
            <strong>Important:</strong> Copy your deploy key now. You will not be able to see it again!
          </p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              readOnly
              value={createdKey.raw_key}
              style={{ fontFamily: 'monospace', fontSize: '13px', background: '#fff', border: '1px solid #c9b4f2' }}
            />
            <button className="primary-button" onClick={() => handleCopy(createdKey.raw_key!)}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy Key'}
            </button>
          </div>
        </section>
      )}

      {/* Generate Key Form */}
      <section className="panel app-panel">
        <div className="panel-heading">
          <div>
            <h3>Generate New Deploy Key</h3>
            <p className="muted">Authorize external services, devices, or frontend apps to call your model inference API.</p>
          </div>
        </div>

        <form onSubmit={handleCreateKey} style={{ display: 'flex', gap: '10px', marginTop: '14px', maxWidth: '500px' }}>
          <input
            type="text"
            placeholder="e.g. Edge Device Camera 01, Webhook Service"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            required
          />
          <button type="submit" className="primary-button" disabled={loading || !newKeyName.trim()}>
            <Plus size={14} />
            Generate
          </button>
        </form>
      </section>

      {/* Keys Table */}
      <section className="panel app-panel">
        <div className="panel-heading">
          <div>
            <h3>Active Project Deploy Keys ({keys.length})</h3>
          </div>
        </div>

        {keys.length === 0 ? (
          <p className="muted" style={{ marginTop: '10px' }}>No deploy keys created yet for this project.</p>
        ) : (
          <div className="app-table-wrap" style={{ marginTop: '14px' }}>
            <table className="app-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key Token</th>
                  <th>Created At</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td><strong>{k.name}</strong></td>
                    <td style={{ fontFamily: 'monospace' }}>ano_live_••••{k.last4}</td>
                    <td>{new Date(k.created_at).toLocaleDateString()}</td>
                    <td>
                      <span className={k.revoked_at ? 'badge-disabled' : 'badge-active'}>
                        {k.revoked_at ? 'Revoked' : 'Active'}
                      </span>
                    </td>
                    <td>
                      {!k.revoked_at && (
                        <button
                          className="app-button"
                          style={{ color: '#d93a52', borderColor: '#fad2d2' }}
                          onClick={() => handleRevoke(k.id)}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* API Reference */}
      <section className="panel app-panel">
        <div className="panel-heading">
          <div>
            <h3>Integration Snippet</h3>
            <p className="muted">How to invoke the inference API in production.</p>
          </div>
        </div>

        <div style={{ marginTop: '12px', background: '#1c1c20', color: '#f0f0f0', padding: '16px', borderRadius: '8px' }}>
          <div style={{ color: '#999', fontSize: '12px', marginBottom: '8px' }}>Python Inference Script:</div>
          <pre style={{ margin: 0, fontSize: '12px', fontFamily: 'monospace', overflowX: 'auto' }}>
{`import requests

url = "http://localhost:8000/api/v1/infer/YOUR_MODEL_ID"
headers = {"Authorization": "Bearer YOUR_DEPLOY_KEY"}

with open("sample.jpg", "rb") as f:
    response = requests.post(
        url,
        headers=headers,
        files={"file": f},
        data={"confidence": 0.25, "iou": 0.45}
    )

predictions = response.json()
print("Detections:", predictions)`}
          </pre>
        </div>
      </section>
    </div>
  );
}
