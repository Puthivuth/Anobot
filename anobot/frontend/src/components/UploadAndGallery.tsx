import { useState, useEffect } from 'react';
import { CloudUpload, Trash2, Plus, ScanLine, AlertTriangle } from 'lucide-react';
import { api, type Project, type ProjectClass, type ImageItem } from '../api/client';

interface UploadAndGalleryProps {
  project: Project;
  classes: ProjectClass[];
  onClassesUpdated: () => void;
  onOpenAnnotation: (image: ImageItem) => void;
}

const PALETTE = [
  '#6706ce', '#12a36b', '#2563eb', '#d93a52', '#d97706',
  '#0891b2', '#7c3aed', '#db2777', '#4b5563', '#ea580c'
];

export function UploadAndGallery({
  project,
  classes,
  onClassesUpdated,
  onOpenAnnotation,
}: UploadAndGalleryProps) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'labeled' | 'unlabeled'>('all');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [duplicateWarnings, setDuplicateWarnings] = useState<any[]>([]);
  const [notice, setNotice] = useState('');

  // Class manager states
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState(PALETTE[0]);

  const loadImages = async () => {
    setLoading(true);
    try {
      const res = await api.getImages(project.id, { filter });
      setImages(res.items);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadImages();
  }, [project.id, filter]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  // Upload handler
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploading(true);
    setUploadProgress(10);
    setDuplicateWarnings([]);
    try {
      setUploadProgress(40);
      const res = await api.uploadImages(project.id, files);
      setUploadProgress(100);
      showNotice(`Successfully uploaded ${res.uploaded_count} image(s)!`);
      if (res.duplicate_warnings && res.duplicate_warnings.length > 0) {
        setDuplicateWarnings(res.duplicate_warnings);
      }
      loadImages();
    } catch (err: any) {
      showNotice(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // Delete image
  const handleDeleteImage = async (imgId: string) => {
    try {
      await api.deleteImage(imgId);
      setImages((prev) => prev.filter((img) => img.id !== imgId));
      showNotice('Image removed.');
    } catch (err: any) {
      showNotice(err.message || 'Failed to delete image');
    }
  };

  // Add class
  const handleAddClass = async () => {
    if (!newClassName.trim()) return;
    try {
      await api.createClass(project.id, {
        name: newClassName.trim(),
        color: newClassColor,
      });
      setNewClassName('');
      onClassesUpdated();
      showNotice('Class added.');
    } catch (err: any) {
      showNotice(err.message || 'Failed to create class');
    }
  };

  // Delete class
  const handleDeleteClass = async (classId: string) => {
    try {
      await api.deleteClass(classId);
      onClassesUpdated();
      showNotice('Class deleted.');
    } catch (err: any) {
      showNotice(err.message || 'Failed to delete class');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {notice && <div className="app-notice">{notice}</div>}

      {/* Upload Zone */}
      <section className="panel app-panel">
        <div className="panel-heading">
          <div>
            <h3>Upload Images</h3>
            <p>Upload raw images into this dataset (JPEG, PNG, WebP up to 25 MB).</p>
          </div>
        </div>

        <div className="upload-drop" style={{ marginTop: '12px' }}>
          <CloudUpload size={32} />
          <strong>Drop images here or click to browse</strong>
          <span>Images are automatically processed: EXIF oriented, 320px thumbnail, 1280px preview, and perceptual dHash indexed.</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/bmp"
            multiple
            onChange={handleFilesSelected}
            disabled={uploading}
          />
        </div>

        {uploading && (
          <div style={{ marginTop: '14px' }}>
            <div className="progress-track">
              <span style={{ width: `${uploadProgress}%` }} />
            </div>
            <span style={{ fontSize: '11px', color: '#6706ce', fontWeight: 600 }}>Uploading & processing images...</span>
          </div>
        )}

        {duplicateWarnings.length > 0 && (
          <div style={{ marginTop: '14px', background: '#fffbeb', border: '1px solid #fef3c7', padding: '12px', borderRadius: '7px', fontSize: '11.5px', color: '#92400e' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 700, marginBottom: '4px' }}>
              <AlertTriangle size={15} /> Perceptual Duplicate Warnings ({duplicateWarnings.length})
            </div>
            <span>Duplicate perceptual hash matches found in this project. The duplicates were uploaded but flagged for review.</span>
          </div>
        )}
      </section>

      {/* Class Manager */}
      <section className="panel app-panel">
        <div className="panel-heading">
          <div>
            <h3>Project Classes ({classes.length})</h3>
            <p>Define labels to detect, segment, or classify in this project.</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '14px 0' }}>
          {classes.map((cls) => (
            <div
              key={cls.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: `1px solid ${cls.color}40`,
                background: `${cls.color}10`,
                fontSize: '11.5px',
                fontWeight: 600,
                color: '#333',
              }}
            >
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: cls.color }} />
              <span>{cls.name}</span>
              <button
                onClick={() => handleDeleteClass(cls.id)}
                style={{ border: 0, background: 'none', color: '#888', cursor: 'pointer', padding: 0 }}
                title="Delete class"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Add class bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <input
            style={{ width: '200px', border: '1px solid #dedede', borderRadius: '6px', padding: '8px 10px', fontSize: '11.5px' }}
            placeholder="New class name..."
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddClass()}
          />

          {/* Color palette picker */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewClassColor(c)}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: c,
                  border: newClassColor === c ? '2px solid #000' : '1px solid transparent',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>

          <button className="primary-button" onClick={handleAddClass} style={{ padding: '8px 12px' }}>
            <Plus size={14} /> Add Class
          </button>
        </div>
      </section>

      {/* Image Library Grid */}
      <section className="panel app-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h3>Dataset Images ({images.length})</h3>
            <p>Review and select images to label.</p>
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['all', 'labeled', 'unlabeled'] as const).map((f) => (
              <button
                key={f}
                className={filter === f ? 'primary-button' : 'app-button'}
                style={{ padding: '6px 11px', textTransform: 'capitalize' }}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="muted">Loading images...</p>
        ) : images.length === 0 ? (
          <div className="empty-dataset">
            <ScanLine size={32} />
            <strong>No images found</strong>
            <span>Upload your images above to populate this project dataset.</span>
          </div>
        ) : (
          <div className="image-grid">
            {images.map((img) => (
              <div
                key={img.id}
                className="image-tile"
                style={{ position: 'relative', cursor: 'pointer' }}
                onClick={() => onOpenAnnotation(img)}
              >
                <img
                  src={api.getImageFileUrl(project.id, img.id, 'thumb')}
                  alt={img.filename}
                  loading="lazy"
                />

                {/* Annotation badge */}
                <span
                  style={{
                    position: 'absolute',
                    top: '6px',
                    left: '6px',
                    background: img.annotations_count > 0 ? '#12a36b' : '#6b7280',
                    color: '#fff',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    fontWeight: 700,
                  }}
                >
                  {img.annotations_count > 0 ? `${img.annotations_count} labeled` : 'unlabeled'}
                </span>

                {/* Delete button */}
                <button
                  style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    background: 'rgba(0,0,0,0.6)',
                    color: '#fff',
                    border: 0,
                    borderRadius: '4px',
                    padding: '3px',
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteImage(img.id);
                  }}
                  title="Delete image"
                >
                  <Trash2 size={12} />
                </button>

                <span title={img.filename}>
                  {img.filename} ({img.width}×{img.height})
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

