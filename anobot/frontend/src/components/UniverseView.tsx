import { useState, useEffect } from 'react';
import { Globe, GitFork, Search, Filter } from 'lucide-react';
import { api, type UniverseDataset } from '../api/client';

interface UniverseViewProps {
  onForkSuccess: (projectId: string) => void;
}

export function UniverseView({ onForkSuccess }: UniverseViewProps) {
  const [datasets, setDatasets] = useState<UniverseDataset[]>([]);
  const [filterType, setFilterType] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [forkingId, setForkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const loadDatasets = async () => {
    setLoading(true);
    try {
      const list = await api.getUniverseDatasets({
        type: filterType || undefined,
        q: searchQuery || undefined,
      });
      setDatasets(list);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDatasets();
  }, [filterType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadDatasets();
  };

  const handleFork = async (ds: UniverseDataset) => {
    setForkingId(ds.id);
    try {
      const res = await api.forkUniverseDataset(ds.id);
      setNotice(`Forked "${ds.title}" successfully into project "${res.project.name}"!`);
      onForkSuccess(res.project.id);
    } catch (err: any) {
      setNotice(err.message || 'Failed to fork dataset');
    } finally {
      setForkingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {notice && <div className="app-notice">{notice}</div>}

      {/* Header Banner */}
      <section className="panel app-panel" style={{ background: 'linear-gradient(135deg, #faf7fe 0%, #f3ebfc 100%)', border: '1px solid #e1d3f8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#6706ce', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <Globe size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '18px', margin: 0, color: '#1a1a1a' }}>AnoBot Universe</h2>
            <p style={{ margin: '4px 0 0', color: '#555', fontSize: '13px' }}>
              Explore curated, open-source computer vision datasets. Fork any dataset with one click to train or annotate in your workspace.
            </p>
          </div>
        </div>
      </section>

      {/* Search and Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: '1', maxWidth: '400px' }}>
          <input
            type="text"
            placeholder="Search datasets (e.g. solar, traffic, pcb)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" className="primary-button" disabled={loading}>
            <Search size={14} /> {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Filter size={15} style={{ color: '#666' }} />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ padding: '6px 12px' }}>
            <option value="">All Project Types</option>
            <option value="detect">Object Detection</option>
            <option value="segment">Instance Segmentation</option>
            <option value="keypoint">Keypoints / Pose</option>
          </select>
        </div>
      </div>

      {/* Dataset Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {datasets.map((ds) => (
          <div
            key={ds.id}
            style={{
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              padding: '16px',
              background: '#fff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <span className="badge-active" style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                  {ds.project_type}
                </span>
                <span style={{ fontSize: '11px', color: '#888' }}>
                  {ds.image_count} images · {ds.license}
                </span>
              </div>

              <h3 style={{ fontSize: '15px', margin: '0 0 6px', color: '#111' }}>{ds.title}</h3>
              <p style={{ fontSize: '13px', color: '#555', lineHeight: 1.4, margin: '0 0 12px' }}>
                {ds.description}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '14px' }}>
                {ds.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      background: '#f4f4f5',
                      color: '#666',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                    }}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '12px' }}>
              <button
                className="primary-button"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => handleFork(ds)}
                disabled={forkingId === ds.id}
              >
                <GitFork size={14} />
                {forkingId === ds.id ? 'Forking Dataset...' : 'Fork to My Workspace'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
