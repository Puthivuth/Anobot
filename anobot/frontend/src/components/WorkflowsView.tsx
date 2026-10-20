import { useState, useEffect } from 'react';
import { GitBranch, Play, Plus, Trash2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api, type Project, type WorkflowItem } from '../api/client';

interface WorkflowsViewProps {
  project: Project;
}

export function WorkflowsView({ project }: WorkflowsViewProps) {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [newWfName, setNewWfName] = useState('');
  const [selectedWf, setSelectedWf] = useState<WorkflowItem | null>(null);
  const [testFile, setTestFile] = useState<File | null>(null);
  const [runLogs, setRunLogs] = useState<string[]>([]);
  const [runDetections, setRunDetections] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('');

  const loadWorkflows = async () => {
    try {
      const list = await api.getWorkflows(project.id);
      setWorkflows(list);
      if (list.length > 0 && !selectedWf) {
        setSelectedWf(list[0]);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadWorkflows();
  }, [project.id]);

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWfName.trim()) return;
    try {
      const defaultBlocks = [
        { id: '1', type: 'input', label: 'Input Image Stream' },
        { id: '2', type: 'model', label: 'YOLOv8 Detection Pass' },
        { id: '3', type: 'filter', label: 'Confidence Gating (0.50)' },
        { id: '4', type: 'output', label: 'JSON Predictions / Webhook' },
      ];
      const created = await api.createWorkflow(project.id, {
        name: newWfName.trim(),
        blocks: defaultBlocks,
        is_api_enabled: true,
      });
      setNewWfName('');
      setWorkflows([created, ...workflows]);
      setSelectedWf(created);
      setNotice(`Workflow "${created.name}" created!`);
    } catch (err: any) {
      setNotice(err.message || 'Failed to create workflow');
    }
  };

  const handleDeleteWorkflow = async (id: string) => {
    if (!confirm('Delete this workflow?')) return;
    try {
      await api.deleteWorkflow(id);
      setWorkflows(workflows.filter((w) => w.id !== id));
      if (selectedWf?.id === id) setSelectedWf(null);
      setNotice('Workflow deleted.');
    } catch (err: any) {
      setNotice(err.message || 'Failed to delete workflow');
    }
  };

  const handleRunWorkflow = async () => {
    if (!selectedWf || !testFile) {
      setNotice('Select a workflow and upload an image to test.');
      return;
    }
    setRunning(true);
    setRunLogs([]);
    setRunDetections([]);
    try {
      const res = await api.runWorkflow(selectedWf.id, testFile);
      setRunLogs(res.logs || []);
      setRunDetections(res.detections || []);
      setNotice('Workflow executed successfully!');
    } catch (err: any) {
      setNotice(err.message || 'Workflow run failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {notice && <div className="app-notice">{notice}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>
        {/* Left: Workflow List & Creator */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <section className="panel app-panel">
            <div className="panel-heading">
              <div>
                <h3>Create Workflow</h3>
              </div>
            </div>
            <form onSubmit={handleCreateWorkflow} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
              <input
                type="text"
                placeholder="Workflow name (e.g. Defect Filter)"
                value={newWfName}
                onChange={(e) => setNewWfName(e.target.value)}
                required
              />
              <button type="submit" className="primary-button">
                <Plus size={14} /> New Workflow
              </button>
            </form>
          </section>

          <section className="panel app-panel">
            <div className="panel-heading">
              <div>
                <h3>Workflows ({workflows.length})</h3>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              {workflows.length === 0 ? (
                <p className="muted">No workflows yet.</p>
              ) : (
                workflows.map((wf) => (
                  <div
                    key={wf.id}
                    onClick={() => setSelectedWf(wf)}
                    style={{
                      padding: '12px',
                      borderRadius: '6px',
                      border: `1px solid ${selectedWf?.id === wf.id ? '#6706ce' : '#e0e0e0'}`,
                      background: selectedWf?.id === wf.id ? '#faf8fe' : '#fff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '13px', display: 'block' }}>{wf.name}</strong>
                      <span style={{ fontSize: '11px', color: '#777' }}>
                        {wf.blocks.length} blocks · {wf.is_api_enabled ? 'API enabled' : 'Internal'}
                      </span>
                    </div>
                    <button
                      className="app-button"
                      style={{ padding: '4px 6px', color: '#d93a52', borderColor: 'transparent' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWorkflow(wf.id);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Right: Visual Pipeline Builder & Test Runner */}
        <section className="panel app-panel">
          {selectedWf ? (
            <>
              <div className="panel-heading">
                <div>
                  <h3>Pipeline Architecture: {selectedWf.name}</h3>
                  <p className="muted">Sequential processing graph executed upon image receipt.</p>
                </div>
              </div>

              {/* Block Diagram */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
                {selectedWf.blocks.map((block: any, idx: number) => (
                  <div key={block.id || idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        padding: '14px 18px',
                        background: '#ffffff',
                        border: '1px solid #d4c5f9',
                        borderRadius: '8px',
                        boxShadow: '0 2px 6px rgba(103, 6, 206, 0.05)',
                        textAlign: 'center',
                        minWidth: '130px',
                      }}
                    >
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#6706ce', fontWeight: 700 }}>
                        Step {idx + 1}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '4px' }}>
                        {block.label || block.type}
                      </div>
                    </div>
                    {idx < selectedWf.blocks.length - 1 && (
                      <ArrowRight size={18} style={{ color: '#bbb' }} />
                    )}
                  </div>
                ))}
              </div>

              {/* Test Runner */}
              <div style={{ marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                <h4 style={{ fontSize: '14px', margin: '0 0 10px' }}>Test Workflow Execution</h4>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files && setTestFile(e.target.files[0])}
                  />
                  <button
                    className="primary-button"
                    onClick={handleRunWorkflow}
                    disabled={running || !testFile}
                  >
                    <Play size={14} />
                    {running ? 'Executing Workflow...' : 'Execute Pipeline'}
                  </button>
                </div>

                {/* Execution Logs */}
                {runLogs.length > 0 && (
                  <div style={{ marginTop: '16px', background: '#1c1c20', color: '#eaeaea', padding: '14px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>Pipeline Execution Log:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: 'monospace', fontSize: '12px' }}>
                      {runLogs.map((l, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle2 size={12} style={{ color: '#12a36b' }} />
                          <span>{l}</span>
                        </div>
                      ))}
                    </div>

                    {runDetections.length > 0 && (
                      <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {runDetections.map((d, di) => (
                          <span key={di} style={{ background: '#2e2e38', color: '#12a36b', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace' }}>
                            {d.label} ({Math.round(d.confidence * 100)}%)
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: '#999' }}>
              <GitBranch size={40} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
              <p>Select or create a workflow to view and test its pipeline.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
