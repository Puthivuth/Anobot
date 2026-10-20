import { useState, useEffect } from 'react';
import { Layers3, Play, Download, Trash2 } from 'lucide-react';
import { api, type Project, type DatasetVersion, type TrainingJob } from '../api/client';

interface VersionsAndTrainProps {
  project: Project;
  initialTab?: 'versions' | 'train';
}

export function VersionsAndTrain({ project, initialTab = 'versions' }: VersionsAndTrainProps) {
  const [tab, setTab] = useState<'versions' | 'train'>(initialTab);
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [notice, setNotice] = useState('');

  // Version generation form
  const [trainSplit, setTrainSplit] = useState(70);
  const [valSplit, setValSplit] = useState(20);
  const [testSplit, setTestSplit] = useState(10);
  const [exportFormat, setExportFormat] = useState('yolov8');
  const [generating, setGenerating] = useState(false);

  // Training form
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [modelName, setModelName] = useState('yolov8n');
  const [epochs, setEpochs] = useState(50);
  const [batchSize, setBatchSize] = useState(16);
  const [imgSize, setImgSize] = useState(640);
  const [startingTraining, setStartingTraining] = useState(false);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  const loadData = async () => {
    try {
      const [verList, jobList] = await Promise.all([
        api.getVersions(project.id),
        api.getTrainingJobs(project.id),
      ]);
      setVersions(verList);
      setJobs(jobList);
      if (verList.length > 0 && !selectedVersionId) {
        setSelectedVersionId(verList[0].id);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, [project.id]);

  // Generate Version
  const handleGenerateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (trainSplit + valSplit + testSplit !== 100) {
      showNotice('Splits must sum to exactly 100%.');
      return;
    }
    setGenerating(true);
    try {
      const ver = await api.createVersion(project.id, {
        name: `v${versions.length + 1}.0`,
        splits: { train: trainSplit, val: valSplit, test: testSplit },
        format: exportFormat,
      });
      showNotice(`Dataset version v${ver.version_number} generated!`);
      loadData();
    } catch (err: any) {
      showNotice(err.message || 'Failed to generate version');
    } finally {
      setGenerating(false);
    }
  };

  // Start Training
  const handleStartTraining = async (e: React.FormEvent) => {
    e.preventDefault();
    setStartingTraining(true);
    try {
      const job = await api.startTraining(project.id, {
        version_id: selectedVersionId || undefined,
        model_name: modelName,
        epochs,
        batch_size: batchSize,
        img_size: imgSize,
      });
      showNotice(`Training job ${job.id.slice(0, 8)} queued!`);
      loadData();
    } catch (err: any) {
      showNotice(err.message || 'Failed to start training');
    } finally {
      setStartingTraining(false);
    }
  };

  // Cancel Job
  const handleCancelJob = async (jobId: string) => {
    try {
      await api.cancelTrainingJob(jobId);
      loadData();
      showNotice('Job cancelled.');
    } catch (err: any) {
      showNotice(err.message || 'Failed to cancel job');
    }
  };

  // Delete version
  const handleDeleteVersion = async (versionId: string) => {
    try {
      await api.deleteVersion(versionId);
      loadData();
      showNotice('Version deleted.');
    } catch (err: any) {
      showNotice(err.message || 'Failed to delete version');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {notice && <div className="app-notice">{notice}</div>}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          className={tab === 'versions' ? 'primary-button' : 'app-button'}
          onClick={() => setTab('versions')}
        >
          <Layers3 size={15} /> Dataset Versions ({versions.length})
        </button>
        <button
          className={tab === 'train' ? 'primary-button' : 'app-button'}
          onClick={() => setTab('train')}
        >
          <Play size={15} /> Model Training ({jobs.length})
        </button>
      </div>

      {tab === 'versions' ? (
        <>
          {/* Version generator form */}
          <section className="panel app-panel">
            <div className="panel-heading">
              <div>
                <h3>Generate New Dataset Version</h3>
                <p>Lock annotated data, configure train/val/test splits, and export format.</p>
              </div>
            </div>

            <form onSubmit={handleGenerateVersion} style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-grid">
                <label className="app-field">
                  <span>Train Split (%)</span>
                  <input
                    type="number"
                    min="10"
                    max="90"
                    value={trainSplit}
                    onChange={(e) => setTrainSplit(Number(e.target.value))}
                  />
                </label>
                <label className="app-field">
                  <span>Validation Split (%)</span>
                  <input
                    type="number"
                    min="5"
                    max="50"
                    value={valSplit}
                    onChange={(e) => setValSplit(Number(e.target.value))}
                  />
                </label>
                <label className="app-field">
                  <span>Test Split (%)</span>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={testSplit}
                    onChange={(e) => setTestSplit(Number(e.target.value))}
                  />
                </label>
                <label className="app-field">
                  <span>Export Format</span>
                  <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}>
                    <option value="yolov8">YOLOv8 PyTorch (data.yaml)</option>
                    <option value="coco">COCO JSON (_annotations.coco.json)</option>
                  </select>
                </label>
              </div>

              <div>
                <button type="submit" className="primary-button" disabled={generating}>
                  {generating ? 'Generating Version Archive...' : 'Generate Version'}
                </button>
              </div>
            </form>
          </section>

          {/* Versions list */}
          <section className="panel app-panel">
            <div className="panel-heading">
              <div>
                <h3>Existing Versions</h3>
              </div>
            </div>

            {versions.length === 0 ? (
              <p className="muted" style={{ marginTop: '10px' }}>No versions generated yet. Generate your first version above.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
                {versions.map((v) => (
                  <div
                    key={v.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px',
                      border: '1px solid #e5e5e5',
                      borderRadius: '8px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ fontSize: '13px' }}>{v.name || `Version ${v.version_number}`}</strong>
                        <span className="role-pill">v{v.version_number}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#777', marginTop: '4px' }}>
                        {v.image_count} images · Splits: {v.splits.train}% train, {v.splits.val}% val, {v.splits.test}% test · {new Date(v.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <a
                        href={api.getVersionDownloadUrl(project.id, v.id)}
                        className="app-button"
                        download
                        style={{ textDecoration: 'none' }}
                      >
                        <Download size={14} /> Download ZIP
                      </a>
                      <button
                        className="icon-button"
                        style={{ color: '#d93a52', borderColor: 'transparent' }}
                        onClick={() => handleDeleteVersion(v.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          {/* Model training configurator */}
          <section className="panel app-panel">
            <div className="panel-heading">
              <div>
                <h3>Configure & Train Ultralytics YOLO</h3>
                <p>Train state-of-the-art YOLOv8 architecture on your dataset.</p>
              </div>
            </div>

            <form onSubmit={handleStartTraining} style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-grid">
                <label className="app-field">
                  <span>Dataset Version</span>
                  <select
                    value={selectedVersionId}
                    onChange={(e) => setSelectedVersionId(e.target.value)}
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name || `v${v.version_number}`} ({v.image_count} images)
                      </option>
                    ))}
                  </select>
                </label>

                <label className="app-field">
                  <span>Architecture</span>
                  <select value={modelName} onChange={(e) => setModelName(e.target.value)}>
                    <option value="yolov8n">YOLOv8 Nano (Fastest inference)</option>
                    <option value="yolov8s">YOLOv8 Small (Balanced)</option>
                    <option value="yolov8m">YOLOv8 Medium (High accuracy)</option>
                    <option value="yolov8l">YOLOv8 Large (Complex scenes)</option>
                  </select>
                </label>

                <label className="app-field">
                  <span>Epochs</span>
                  <input
                    type="number"
                    min="1"
                    max="300"
                    value={epochs}
                    onChange={(e) => setEpochs(Number(e.target.value))}
                  />
                </label>

                <label className="app-field">
                  <span>Batch Size</span>
                  <input
                    type="number"
                    min="1"
                    max="64"
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                  />
                </label>

                <label className="app-field">
                  <span>Image Size</span>
                  <input
                    type="number"
                    step="32"
                    min="320"
                    max="1280"
                    value={imgSize}
                    onChange={(e) => setImgSize(Number(e.target.value))}
                  />
                </label>
              </div>

              <div>
                <button type="submit" className="primary-button" disabled={startingTraining || versions.length === 0}>
                  <Play size={14} /> {startingTraining ? 'Queueing Training...' : 'Start Training Run'}
                </button>
                {versions.length === 0 && (
                  <span style={{ fontSize: '11px', color: '#d93a52', marginLeft: '12px' }}>
                    Generate a dataset version first before training.
                  </span>
                )}
              </div>
            </form>
          </section>

          {/* Training Jobs */}
          <section className="panel app-panel">
            <div className="panel-heading">
              <div>
                <h3>Training Runs ({jobs.length})</h3>
              </div>
            </div>

            {jobs.length === 0 ? (
              <p className="muted" style={{ marginTop: '10px' }}>No training runs launched yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    style={{
                      padding: '14px',
                      border: '1px solid #e5e5e5',
                      borderRadius: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong>{job.model_name.toUpperCase()}</strong>
                        <span
                          className={`badge-${
                            job.status === 'completed'
                              ? 'active'
                              : job.status === 'failed' || job.status === 'cancelled'
                              ? 'disabled'
                              : 'active'
                          }`}
                        >
                          {job.status.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '11px', color: '#777' }}>
                          {job.epochs} epochs · batch {job.batch_size} · {job.img_size}px
                        </span>
                      </div>

                      {job.status === 'training' || job.status === 'queued' ? (
                        <button
                          className="app-button"
                          style={{ color: '#d93a52', borderColor: '#fad2d2' }}
                          onClick={() => handleCancelJob(job.id)}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>

                    {/* Progress track */}
                    {(job.status === 'training' || job.status === 'queued') && (
                      <div className="progress-track" style={{ margin: '4px 0' }}>
                        <span style={{ width: `${job.progress}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

