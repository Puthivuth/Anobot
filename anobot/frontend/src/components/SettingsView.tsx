import { useState, useEffect } from 'react';
import { Save, Download, Upload } from 'lucide-react';
import { api } from '../api/client';

export function SettingsView() {
  const [settings, setSettings] = useState<Record<string, any>>({
    workspace_name: 'AnoBot Workspace',
    min_password_length: 8,
    session_hours: 24,
    max_upload_mb: 25,
    gemini_model: 'gemini-2.0-flash',
  });
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState('');

  const loadSettings = async () => {
    try {
      const data = await api.getAdminSettings();
      setSettings((prev) => ({ ...prev, ...data }));
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateAdminSettings(settings);
      setNotice('Workspace settings saved successfully!');
    } catch (err: any) {
      setNotice(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    if (!confirm(`Restore system backup from "${file.name}"? Existing users and configurations will be updated.`)) return;

    setRestoring(true);
    try {
      await api.restoreBackup(file);
      setNotice('Backup restored successfully!');
      loadSettings();
    } catch (err: any) {
      setNotice(err.message || 'Failed to restore backup');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {notice && <div className="app-notice">{notice}</div>}

      {/* Workspace Preferences */}
      <section className="panel app-panel">
        <div className="panel-heading">
          <div>
            <h3>Workspace Configuration</h3>
            <p className="muted">Global system rules, session lifespans, and upload boundaries.</p>
          </div>
        </div>

        <form onSubmit={handleSave} style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
          <label className="app-field">
            <span>Workspace Name</span>
            <input
              type="text"
              value={settings.workspace_name || ''}
              onChange={(e) => setSettings({ ...settings, workspace_name: e.target.value })}
              required
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <label className="app-field">
              <span>Minimum Password Length</span>
              <input
                type="number"
                min="8"
                max="32"
                value={settings.min_password_length || 8}
                onChange={(e) => setSettings({ ...settings, min_password_length: Number(e.target.value) })}
                required
              />
            </label>

            <label className="app-field">
              <span>Session Duration (Hours)</span>
              <input
                type="number"
                min="1"
                max="168"
                value={settings.session_hours || 24}
                onChange={(e) => setSettings({ ...settings, session_hours: Number(e.target.value) })}
                required
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <label className="app-field">
              <span>Max Image Upload Size (MB)</span>
              <input
                type="number"
                min="5"
                max="100"
                value={settings.max_upload_mb || 25}
                onChange={(e) => setSettings({ ...settings, max_upload_mb: Number(e.target.value) })}
                required
              />
            </label>

            <label className="app-field">
              <span>Default Gemini Vision Model</span>
              <select
                value={settings.gemini_model || 'gemini-2.0-flash'}
                onChange={(e) => setSettings({ ...settings, gemini_model: e.target.value })}
              >
                <option value="gemini-2.0-flash">Gemini 2.0 Flash (Recommended)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
              </select>
            </label>
          </div>

          <div style={{ marginTop: '8px' }}>
            <button type="submit" className="primary-button" disabled={saving}>
              <Save size={14} />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </section>

      {/* System Backup & Disaster Recovery */}
      <section className="panel app-panel">
        <div className="panel-heading">
          <div>
            <h3>System Backup & Restore</h3>
            <p className="muted">Export or restore full database configurations, users, and audit records as JSON.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '16px' }}>
          <div style={{ border: '1px solid #e5e5e5', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
            <h4 style={{ fontSize: '14px', margin: '0 0 8px' }}>Export System Backup</h4>
            <p style={{ fontSize: '12px', color: '#666', margin: '0 0 14px' }}>
              Download a complete JSON snapshot containing users, configuration keys, and recent audit logs.
            </p>
            <a
              href={api.getBackupDownloadUrl()}
              className="primary-button"
              style={{ display: 'inline-flex', textDecoration: 'none' }}
              download
            >
              <Download size={14} /> Download Backup JSON
            </a>
          </div>

          <div style={{ border: '1px solid #e5e5e5', borderRadius: '8px', padding: '16px', background: '#fafafa' }}>
            <h4 style={{ fontSize: '14px', margin: '0 0 8px' }}>Restore from Backup</h4>
            <p style={{ fontSize: '12px', color: '#666', margin: '0 0 14px' }}>
              Select a valid AnoBot backup JSON file to restore accounts and system settings.
            </p>
            <label className="primary-button" style={{ display: 'inline-flex', cursor: 'pointer' }}>
              <Upload size={14} />
              {restoring ? 'Restoring Backup...' : 'Choose Backup File'}
              <input type="file" accept=".json" onChange={handleRestoreFile} style={{ display: 'none' }} />
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
