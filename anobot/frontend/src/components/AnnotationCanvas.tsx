import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Square, Hexagon, CircleDot, Undo2, Trash2, Save, ArrowLeft, ArrowRight,
  ZoomIn, ZoomOut, Maximize2, Sparkles, RefreshCw
} from 'lucide-react';
import { api, type Project, type ProjectClass, type ImageItem } from '../api/client';

interface AnnotationCanvasProps {
  project: Project;
  image: ImageItem;
  classes: ProjectClass[];
  onNext?: () => void;
  onPrev?: () => void;
  onAnnotationCountChange?: (count: number) => void;
}

export function AnnotationCanvas({
  project,
  image,
  classes,
  onNext,
  onPrev,
  onAnnotationCountChange,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isSpacePressedRef = useRef<boolean>(false);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  const [activeTool, setActiveTool] = useState<'box' | 'polygon' | 'keypoint'>('box');
  const [selectedAnnIndex, setSelectedAnnIndex] = useState<number | null>(null);
  const [history, setHistory] = useState<any[][]>([]);

  // Drawing states
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [polyPoints, setPolyPoints] = useState<Array<[number, number]>>([]);

  // Viewport transforms (Zoom & Pan)
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Async states
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);

  // Load annotations on image change
  useEffect(() => {
    let isMounted = true;
    api.getImageAnnotations(project.id, image.id)
      .then((data) => {
        if (!isMounted) return;
        const mapped = data.map((d) => ({
          id: d.id,
          class_id: d.class_id,
          kind: d.kind,
          geometry: d.geometry,
          source: d.source,
        }));
        setAnnotations(mapped);
        setHistory([mapped]);
        if (onAnnotationCountChange) onAnnotationCountChange(mapped.length);
      })
      .catch((err) => console.error('Failed to load annotations:', err));

    return () => { isMounted = false; };
  }, [project.id, image.id]);

  // Load image element
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = api.getImageFileUrl(project.id, image.id, 'preview');
    img.onload = () => setImgElement(img);
  }, [project.id, image.id]);

  // Set default class if not set
  useEffect(() => {
    if (classes.length > 0 && !selectedClassId) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
  };

  // Convert canvas pixel position to original image coordinates
  const canvasToImageCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !imgElement) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const clickX = (clientX - rect.left - offset.x) / scale;
      const clickY = (clientY - rect.top - offset.y) / scale;

      // Scale relative to actual image width/height
      const scaleX = image.width / imgElement.width;
      const scaleY = image.height / imgElement.height;

      return {
        x: Math.max(0, Math.min(image.width, clickX * scaleX)),
        y: Math.max(0, Math.min(image.height, clickY * scaleY)),
      };
    },
    [offset, scale, imgElement, image.width, image.height]
  );

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgElement) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset and clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // Draw background image
    ctx.drawImage(imgElement, 0, 0, imgElement.width, imgElement.height);

    // Draw saved annotations
    annotations.forEach((ann, idx) => {
      const cls = classes.find((c) => c.id === ann.class_id);
      const color = cls?.color || '#6706ce';
      const isSelected = selectedAnnIndex === idx;

      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeStyle = color;
      ctx.fillStyle = isSelected ? `${color}33` : `${color}22`;

      const scaleX = imgElement.width / image.width;
      const scaleY = imgElement.height / image.height;

      if (ann.kind === 'box') {
        const geom = ann.geometry || {};
        const xMin = geom.x_min * scaleX;
        const yMin = geom.y_min * scaleY;
        const w = (geom.x_max - geom.x_min) * scaleX;
        const h = (geom.y_max - geom.y_min) * scaleY;

        ctx.fillRect(xMin, yMin, w, h);
        ctx.strokeRect(xMin, yMin, w, h);

        // Label pill
        ctx.fillStyle = color;
        ctx.font = '11px sans-serif';
        const labelText = cls?.name || 'Class';
        const textWidth = ctx.measureText(labelText).width;
        ctx.fillRect(xMin, yMin - 18 > 0 ? yMin - 18 : yMin, textWidth + 8, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, xMin + 4, yMin - 18 > 0 ? yMin - 6 : yMin + 12);

      } else if (ann.kind === 'polygon') {
        const pts = ann.geometry?.points || [];
        if (pts.length > 1) {
          ctx.beginPath();
          ctx.moveTo(pts[0][0] * scaleX, pts[0][1] * scaleY);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i][0] * scaleX, pts[i][1] * scaleY);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      } else if (ann.kind === 'keypoint') {
        const px = ann.geometry?.x * scaleX;
        const py = ann.geometry?.y * scaleY;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Draw active drawing preview
    if (isDrawing && startPos && currentPos) {
      const cls = classes.find((c) => c.id === selectedClassId);
      const color = cls?.color || '#6706ce';
      ctx.strokeStyle = color;
      ctx.fillStyle = `${color}33`;
      ctx.lineWidth = 2;

      const scaleX = imgElement.width / image.width;
      const scaleY = imgElement.height / image.height;

      if (activeTool === 'box') {
        const xMin = Math.min(startPos.x, currentPos.x) * scaleX;
        const yMin = Math.min(startPos.y, currentPos.y) * scaleY;
        const w = Math.abs(currentPos.x - startPos.x) * scaleX;
        const h = Math.abs(currentPos.y - startPos.y) * scaleY;
        ctx.fillRect(xMin, yMin, w, h);
        ctx.strokeRect(xMin, yMin, w, h);
      }
    }

    // Draw polygon points preview
    if (polyPoints.length > 0) {
      const cls = classes.find((c) => c.id === selectedClassId);
      const color = cls?.color || '#6706ce';
      const scaleX = imgElement.width / image.width;
      const scaleY = imgElement.height / image.height;

      ctx.strokeStyle = color;
      ctx.fillStyle = `${color}22`;
      ctx.beginPath();
      ctx.moveTo(polyPoints[0][0] * scaleX, polyPoints[0][1] * scaleY);
      for (let i = 1; i < polyPoints.length; i++) {
        ctx.lineTo(polyPoints[i][0] * scaleX, polyPoints[i][1] * scaleY);
      }
      ctx.stroke();

      polyPoints.forEach(([px, py]) => {
        ctx.beginPath();
        ctx.arc(px * scaleX, py * scaleY, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
    }

    ctx.restore();
  }, [
    imgElement,
    offset,
    scale,
    annotations,
    selectedAnnIndex,
    isDrawing,
    startPos,
    currentPos,
    polyPoints,
    classes,
    selectedClassId,
    activeTool,
    image.width,
    image.height,
  ]);

  // Handle Save
  const handleSave = async (listToSave = annotations) => {
    setSaving(true);
    try {
      await api.batchSaveAnnotations(
        project.id,
        image.id,
        listToSave.map((a) => ({
          class_id: a.class_id,
          kind: a.kind,
          geometry: a.geometry,
          source: a.source || 'manual',
        }))
      );
      showNotice('Annotations saved.');
      if (onAnnotationCountChange) onAnnotationCountChange(listToSave.length);
    } catch (err: any) {
      showNotice(err.message || 'Failed to save annotations');
    } finally {
      setSaving(false);
    }
  };

  // Undo
  const handleUndo = () => {
    if (history.length <= 1) return;
    const nextHist = history.slice(0, -1);
    const prev = nextHist[nextHist.length - 1];
    setHistory(nextHist);
    setAnnotations(prev);
    handleSave(prev);
  };

  const pushAnnotation = (newAnn: any) => {
    const updated = [...annotations, newAnn];
    setAnnotations(updated);
    setHistory((prev) => [...prev, updated]);
    handleSave(updated);
  };

  // Delete selected
  const handleDeleteSelected = () => {
    if (selectedAnnIndex === null) return;
    const updated = annotations.filter((_, idx) => idx !== selectedAnnIndex);
    setSelectedAnnIndex(null);
    setAnnotations(updated);
    setHistory((prev) => [...prev, updated]);
    handleSave(updated);
  };

  // Gemini Assist
  const handleGeminiAssist = async () => {
    setAiLoading(true);
    try {
      const generated = await api.geminiAssistLabeling(project.id, image.id);
      const mapped = generated.map((g) => ({
        id: g.id,
        class_id: g.class_id,
        kind: g.kind,
        geometry: g.geometry,
        source: 'gemini',
      }));
      setAnnotations(mapped);
      setHistory((prev) => [...prev, mapped]);
      showNotice(`Gemini detected ${mapped.length} objects.`);
      if (onAnnotationCountChange) onAnnotationCountChange(mapped.length);
    } catch (err: any) {
      showNotice(err.message || 'Gemini auto-labeling failed.');
    } finally {
      setAiLoading(false);
    }
  };

  // Mouse interaction
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || isSpacePressedRef.current) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      return;
    }

    const coords = canvasToImageCoords(e.clientX, e.clientY);

    if (activeTool === 'keypoint') {
      pushAnnotation({
        class_id: selectedClassId,
        kind: 'keypoint',
        geometry: { x: coords.x, y: coords.y },
        source: 'manual',
      });
      return;
    }

    if (activeTool === 'polygon') {
      // Check if clicking near start point to close
      if (polyPoints.length >= 3) {
        const startPt = polyPoints[0];
        const dist = Math.hypot(coords.x - startPt[0], coords.y - startPt[1]);
        if (dist < 20) {
          pushAnnotation({
            class_id: selectedClassId,
            kind: 'polygon',
            geometry: { points: polyPoints },
            source: 'manual',
          });
          setPolyPoints([]);
          return;
        }
      }
      setPolyPoints((prev) => [...prev, [coords.x, coords.y]]);
      return;
    }

    // Box drawing
    setIsDrawing(true);
    setStartPos(coords);
    setCurrentPos(coords);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    if (isDrawing) {
      const coords = canvasToImageCoords(e.clientX, e.clientY);
      setCurrentPos(coords);
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDrawing && startPos && currentPos) {
      setIsDrawing(false);
      const xMin = Math.min(startPos.x, currentPos.x);
      const yMin = Math.min(startPos.y, currentPos.y);
      const xMax = Math.max(startPos.x, currentPos.x);
      const yMax = Math.max(startPos.y, currentPos.y);

      // Only save if dimensions are significant (> 5px)
      if (xMax - xMin > 5 && yMax - yMin > 5) {
        pushAnnotation({
          class_id: selectedClassId,
          kind: 'box',
          geometry: { x_min: Math.round(xMin), y_min: Math.round(yMin), x_max: Math.round(xMax), y_max: Math.round(yMax) },
          source: 'manual',
        });
      }
      setStartPos(null);
      setCurrentPos(null);
    }
  };

  // Zoom with wheel
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setScale((prev) => Math.min(5, Math.max(0.5, prev * zoomFactor)));
  };

  // Keyboard shortcuts (1-9 for classes, Ctrl+Z undo, Delete to delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = true;
      }
      // 1-9 select class
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= classes.length) {
        setSelectedClassId(classes[num - 1].id);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'Escape') {
        setIsDrawing(false);
        setPolyPoints([]);
      } else if (e.key.toLowerCase() === 'd' || e.key === 'ArrowRight') {
        if (onNext) onNext();
      } else if (e.key.toLowerCase() === 'a' || e.key === 'ArrowLeft') {
        if (onPrev) onPrev();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [classes, selectedAnnIndex, history, annotations, onNext, onPrev]);

  return (
    <div className="canvas-workspace-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {notice && <div className="app-notice">{notice}</div>}

      {/* Top action toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        {/* Tool selector */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className={activeTool === 'box' ? 'primary-button' : 'app-button'}
            onClick={() => setActiveTool('box')}
            title="Bounding Box (B)"
          >
            <Square size={14} /> Box
          </button>
          <button
            className={activeTool === 'polygon' ? 'primary-button' : 'app-button'}
            onClick={() => setActiveTool('polygon')}
            title="Polygon (P)"
          >
            <Hexagon size={14} /> Polygon
          </button>
          <button
            className={activeTool === 'keypoint' ? 'primary-button' : 'app-button'}
            onClick={() => setActiveTool('keypoint')}
            title="Keypoint (K)"
          >
            <CircleDot size={14} /> Keypoint
          </button>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className="app-button"
            onClick={handleGeminiAssist}
            disabled={aiLoading}
            style={{ color: '#6706ce', borderColor: '#d3b2f2' }}
          >
            {aiLoading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Gemini Auto-Label
          </button>
          <button className="app-button" onClick={handleUndo} title="Undo (Ctrl+Z)">
            <Undo2 size={14} /> Undo
          </button>
          {selectedAnnIndex !== null && (
            <button className="app-button" onClick={handleDeleteSelected} title="Delete selected (Del)">
              <Trash2 size={14} style={{ color: '#d93a52' }} /> Delete
            </button>
          )}
          <button className="primary-button" onClick={() => handleSave()} disabled={saving}>
            <Save size={14} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Class selector row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', padding: '6px 0' }}>
        <span style={{ fontSize: '11px', fontWeight: 650, color: '#777', whiteSpace: 'nowrap' }}>Classes (1-9):</span>
        {classes.map((cls, idx) => (
          <button
            key={cls.id}
            onClick={() => setSelectedClassId(cls.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '6px',
              border: selectedClassId === cls.id ? `2px solid ${cls.color}` : '1px solid #ddd',
              background: selectedClassId === cls.id ? `${cls.color}15` : '#fff',
              color: selectedClassId === cls.id ? cls.color : '#333',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cls.color }} />
            <span>{idx + 1}. {cls.name}</span>
          </button>
        ))}
      </div>

      {/* Main interactive Canvas */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '520px',
          backgroundColor: '#1e1e1e',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onWheel={handleWheel}
      >
        <canvas
          ref={canvasRef}
          width={880}
          height={520}
          style={{ width: '100%', height: '100%', cursor: isPanning ? 'grab' : 'crosshair' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />

        {/* Canvas overlays: Zoom controls */}
        <div style={{ position: 'absolute', bottom: '14px', right: '14px', display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.6)', padding: '5px', borderRadius: '6px' }}>
          <button className="icon-button" onClick={() => setScale((s) => Math.min(5, s * 1.2))} style={{ background: 'transparent', color: '#fff', border: 0 }}>
            <ZoomIn size={15} />
          </button>
          <button className="icon-button" onClick={() => setScale((s) => Math.max(0.5, s / 1.2))} style={{ background: 'transparent', color: '#fff', border: 0 }}>
            <ZoomOut size={15} />
          </button>
          <button className="icon-button" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} style={{ background: 'transparent', color: '#fff', border: 0 }}>
            <Maximize2 size={15} />
          </button>
        </div>

        {/* Image metadata overlay */}
        <div style={{ position: 'absolute', top: '14px', left: '14px', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', display: 'flex', gap: '10px' }}>
          <span><strong>{image.filename}</strong></span>
          <span>{image.width} × {image.height}</span>
          <span>{annotations.length} annotation(s)</span>
        </div>
      </div>

      {/* Bottom navigation bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
        <button className="app-button" onClick={onPrev} disabled={!onPrev} title="Previous image (A)">
          <ArrowLeft size={14} /> Previous Image
        </button>
        <span style={{ fontSize: '11px', color: '#888' }}>
          Shortcuts: <strong>1-9</strong> Class · <strong>Ctrl+Z</strong> Undo · <strong>Del</strong> Delete · <strong>D</strong> Next Image
        </span>
        <button className="primary-button" onClick={onNext} disabled={!onNext} title="Next image (D)">
          Next Image <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

