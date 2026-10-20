import { useState } from 'react';
import { Plus, Trash2, FolderPlus, Check, X } from 'lucide-react';
import { api, type Project } from '../api/client';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (proj: Project) => void;
  onProjectCreated: (proj: Project) => void;
  onProjectDeleted: (projectId: string) => void;
}

export function ProjectModal({
  isOpen,
  onClose,
  projects,
  activeProject,
  onSelectProject,
  onProjectCreated,
  onProjectDeleted,
}: ProjectModalProps) {
  const [tab, setTab] = useState<'switch' | 'create'>('switch');
  const [name, setName] = useState('');
  const [type, setType] = useState('detect');
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a project name.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const created = await api.createProject({
        name: name.trim(),
        type,
        is_public: isPublic,
      });
      onProjectCreated(created);
      onSelectProject(created);
      setName('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (projId: string) => {
    try {
      await api.deleteProject(projId);
      onProjectDeleted(projId);
      setDeletingId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete project');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '520px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={tab === 'switch' ? 'primary-button' : 'app-button'}
              onClick={() => setTab('switch')}
            >
              Switch Project
            </button>
            <button
              className={tab === 'create' ? 'primary-button' : 'app-button'}
              onClick={() => setTab('create')}
            >
              <Plus size={14} /> New Project
            </button>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        {error && <div className="alert-error">{error}</div>}

        {tab === 'switch' ? (
          <div>
            <p className="muted" style={{ margin: '0 0 12px' }}>
              Select a project from your workspace:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
              {projects.map((p) => {
                const isActive = activeProject?.id === p.id;
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      border: isActive ? '2px solid #6706ce' : '1px solid #e5e5e5',
                      borderRadius: '8px',
                      background: isActive ? '#fbf8ff' : '#fff',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      onSelectProject(p);
                      onClose();
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ fontSize: '13px' }}>{p.name}</strong>
                        <span className="role-pill" style={{ textTransform: 'uppercase' }}>{p.type}</span>
                        {isActive && <span className="badge-active"><Check size={11} /> ACTIVE</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                        {p.images_count} images · {p.annotated_count} annotated · {p.classes_count} classes
                      </div>
                    </div>

                    <button
                      className="icon-button"
                      style={{ color: '#d93a52', borderColor: 'transparent' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(p.id);
                      }}
                      title="Delete project"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <label className="app-field">
              <span>Project Name</span>
              <input
                placeholder="e.g. Autonomous Vehicle Detect"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </label>

            <label className="app-field">
              <span>Project Type</span>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="detect">Object Detection (Bounding Boxes)</option>
                <option value="segment">Instance Segmentation (Polygons)</option>
                <option value="classify">Classification (Single/Multi-label)</option>
                <option value="keypoint">Keypoint Detection (Pose / Landmarks)</option>
                <option value="obb">Oriented Bounding Boxes (Rotated Bounding Box)</option>
              </select>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                style={{ width: 'auto' }}
              />
              <span>Public Project (Visible in Universe)</span>
            </label>

            <div className="modal-actions">
              <button type="button" className="app-button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={loading}>
                <FolderPlus size={15} /> {loading ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </form>
        )}

        {/* Delete Confirmation Modal */}
        {deletingId && (
          <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <div className="modal-content" style={{ maxWidth: '380px', textAlign: 'center' }}>
              <Trash2 size={36} style={{ color: '#d93a52', margin: '0 auto 12px' }} />
              <h3>Delete this project?</h3>
              <p className="muted">This action will delete all images, annotations, and generated versions permanently.</p>
              <div className="modal-actions" style={{ justifyContent: 'center' }}>
                <button className="app-button" onClick={() => setDeletingId(null)}>
                  Cancel
                </button>
                <button
                  className="primary-button"
                  style={{ background: '#d93a52', borderColor: '#d93a52' }}
                  onClick={() => handleDelete(deletingId)}
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

