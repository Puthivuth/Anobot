import { useState, useRef, useEffect } from 'react';
import { Play, Code2, Image as ImageIcon } from 'lucide-react';
import { api, type Project, type TrainingJob, type ImageItem } from '../api/client';

interface ModelVisualizeProps {
  project: Project;
  projectImages: ImageItem[];
}

export function ModelVisualize({ project, projectImages }: ModelVisualizeProps) {
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('yolov8n');
  const [confidence, setConfidence] = useState<number>(25);
  const [iou, setIou] = useState<number>(45);

  const [testImageFile, setTestImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [showCode, setShowCode] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    api.getTrainingJobs(project.id).then((list) => {
      setJobs(list);
      const completed = list.filter((j) => j.status === 'completed');
      if (completed.length > 0) {
        setSelectedModel(completed[0].id);
      }
    });
  }, [project.id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setTestImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setPredictions([]);
    }
  };

  const handleSelectFromProject = async (img: ImageItem) => {
    try {
      const res = await fetch(api.getImageUrl(project.id, img.id, 'original'));
      const blob = await res.blob();
      const file = new File([blob], img.filename, { type: 'image/jpeg' });
      setTestImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setPredictions([]);
    } catch (err: any) {
      setNotice('Could not load project image: ' + err.message);
    }
  };

  const handleRunInference = async () => {
    if (!testImageFile) {
      setNotice('Please select or upload an image first.');
      return;
    }
    setLoading(true);
    setNotice('');
    try {
      const res = await api.runInference(selectedModel, testImageFile, confidence / 100, iou / 100);
      setPredictions(res);
      setNotice(`Detected ${res.length} prediction(s)!`);
    } catch (err: any) {
      setNotice(err.message || 'Inference failed');
    } finally {
      setLoading(false);
    }
  };

  // Draw predictions on canvas
  useEffect(() => {
    if (!previewUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = previewUrl;
    img.onload = () => {
      imageObjRef.current = img;
      drawCanvas();
    };
  }, [previewUrl, predictions]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageObjRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    const maxW = 800;
    const scale = Math.min(1, maxW / img.width);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw predictions
    predictions.forEach((pred) => {
      const color = '#6706ce';
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;

      if (pred.box) {
        const { x, y, w, h } = pred.box;
        const bx = x * canvas.width;
        const by = y * canvas.height;
        const bw = w * canvas.width;
        const bh = h * canvas.height;

        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = `${color}22`;
        ctx.fillRect(bx, by, bw, bh);

        // Label tag
        const text = `${pred.label} ${Math.round(pred.confidence * 100)}%`;
        ctx.font = 'bold 12px monospace';
        const textW = ctx.measureText(text).width;
        ctx.fillStyle = color;
        ctx.fillRect(bx, Math.max(0, by - 20), textW + 10, 20);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, bx + 5, Math.max(14, by - 5));
      } else if (pred.polygon) {
        ctx.fillStyle = `${color}33`;
        ctx.beginPath();
        pred.polygon.forEach((pt: [number, number], pIdx: number) => {
          const px = pt[0] * canvas.width;
          const py = pt[1] * canvas.height;
          if (pIdx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {notice && <div className="app-notice">{notice}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>
        {/* Left Settings Panel */}
        <section className="panel app-panel">
          <div className="panel-heading">
            <div>
              <h3>Inference Controls</h3>
            </div>
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: '14px', marginTop: '14px' }}>
            <label className="app-field">
              <span>Model Architecture</span>
              <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                <optgroup label="Trained Custom Models">
                  {jobs.filter((j) => j.status === 'completed').map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.model_name.toUpperCase()} (Run {j.id.slice(0, 6)})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Base Pretrained Models">
                  <option value="yolov8n">YOLOv8 Nano (Default)</option>
                  <option value="yolov8s">YOLOv8 Small</option>
                  <option value="yolov8m">YOLOv8 Medium</option>
                </optgroup>
              </select>
            </label>

            <label className="app-field">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Confidence Threshold</span>
                <strong>{confidence}%</strong>
              </div>
              <input
                type="range"
                min="5"
                max="95"
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
              />
            </label>

            <label className="app-field">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Overlap (IOU) Threshold</span>
                <strong>{iou}%</strong>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                value={iou}
                onChange={(e) => setIou(Number(e.target.value))}
              />
            </label>

            <label className="app-field">
              <span>Upload Test Image</span>
              <input type="file" accept="image/*" onChange={handleFileChange} />
            </label>

            {projectImages.length > 0 && (
              <div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '6px' }}>
                  Or pick from project dataset:
                </span>
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px' }}>
                  {projectImages.slice(0, 6).map((img) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => handleSelectFromProject(img)}
                      style={{ border: '1px solid #ddd', padding: '2px', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}
                    >
                      <img
                        src={api.getImageUrl(project.id, img.id, 'thumb')}
                        alt="thumb"
                        style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '3px' }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              className="primary-button"
              onClick={handleRunInference}
              disabled={loading || !testImageFile}
              style={{ marginTop: '8px' }}
            >
              <Play size={15} />
              {loading ? 'Running Inference...' : 'Run Test Prediction'}
            </button>

            <button
              type="button"
              className="app-button"
              onClick={() => setShowCode(!showCode)}
            >
              <Code2 size={14} />
              {showCode ? 'Hide API Snippet' : 'View cURL / Python Snippet'}
            </button>
          </div>
        </section>

        {/* Right Preview & Visualizer */}
        <section className="panel app-panel">
          <div className="panel-heading">
            <div>
              <h3>Detection Canvas</h3>
              <p className="muted">Live model predictions rendered at native coordinates.</p>
            </div>
            {predictions.length > 0 && (
              <span className="badge-active">{predictions.length} Objects Found</span>
            )}
          </div>

          <div
            style={{
              marginTop: '14px',
              minHeight: '400px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#fcfcfc',
              border: '1px dashed #e0e0e0',
              borderRadius: '8px',
              padding: '10px',
              position: 'relative',
              overflow: 'auto',
            }}
          >
            {previewUrl ? (
              <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto', borderRadius: '6px' }} />
            ) : (
              <div style={{ textAlign: 'center', color: '#999' }}>
                <ImageIcon size={48} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                <p>Upload a test image on the left or select an existing project image to run predictions.</p>
              </div>
            )}
          </div>

          {/* Predictions list */}
          {predictions.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <h4 style={{ fontSize: '13px', margin: '0 0 8px' }}>Detected Objects</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {predictions.map((p, i) => (
                  <span
                    key={i}
                    style={{
                      background: '#f4effc',
                      color: '#6706ce',
                      border: '1px solid #d4c5f9',
                      padding: '4px 10px',
                      borderRadius: '16px',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    {p.label} · {Math.round(p.confidence * 100)}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Code Snippet Drawer */}
          {showCode && (
            <div style={{ marginTop: '16px', padding: '14px', background: '#1c1c20', color: '#eaeaea', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>cURL Inference Endpoint:</div>
              <pre style={{ margin: 0, fontSize: '12px', fontFamily: 'monospace', overflowX: 'auto' }}>
{`curl -X POST "http://localhost:8000/api/v1/infer/${selectedModel}" \\
  -H "Authorization: Bearer <YOUR_DEPLOY_KEY>" \\
  -F "file=@image.jpg" \\
  -F "confidence=${confidence / 100}" \\
  -F "iou=${iou / 100}"`}
              </pre>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
