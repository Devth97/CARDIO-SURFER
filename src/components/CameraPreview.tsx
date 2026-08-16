import { useEffect, useRef } from 'react';
import type { PoseDebugState } from '../pose/PoseTracker';

export type CameraPreviewMode = 'hidden' | 'full' | 'mini';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  debug: PoseDebugState | null;
  mode: CameraPreviewMode;
}

// Landmark connections we draw for the debug skeleton overlay (subset).
const CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

export default function CameraPreview({ videoRef, debug, mode }: Props) {
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);

    if (!debug?.landmarks) return;

    ctx.fillStyle = debug.tracking ? '#2fd0a5' : '#e0533d';
    ctx.strokeStyle = debug.tracking ? '#2fd0a5' : '#e0533d';
    ctx.lineWidth = 2;

    const pt = (i: number) => {
      const lm = debug.landmarks![i];
      // landmarks were computed on a pre-mirrored frame, so x maps 1:1 to
      // this (already-mirrored via CSS) preview.
      return { x: lm.x * w, y: lm.y * h };
    };

    for (const [a, b] of CONNECTIONS) {
      if (!debug.landmarks[a] || !debug.landmarks[b]) continue;
      const p1 = pt(a);
      const p2 = pt(b);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let i = 0; i <= 28; i++) {
      if (!debug.landmarks[i]) continue;
      const p = pt(i);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [debug, videoRef, mode]);

  return (
    <div className={`camera-preview mode-${mode}`}>
      <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
      <canvas ref={overlayRef} className="camera-overlay" />
    </div>
  );
}
