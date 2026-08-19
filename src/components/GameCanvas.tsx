import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { GameEngine } from '../game/GameEngine';
import { ThreeRenderer } from '../game/ThreeRenderer';

interface Props {
  engine: GameEngine;
}

export default function GameCanvas({ engine }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ThreeRenderer | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  // Surfaces a blank/frozen 3D canvas (WebGL context lost with no recovery,
  // or the per-frame update crashing repeatedly) — previously invisible to
  // a non-technical player, who'd just see an unexplained blank blue screen
  // with no way to tell it apart from a working-but-empty scene.
  const [renderIssue, setRenderIssue] = useState<string | null>(null);
  // TEMPORARY diagnostic — see the comment on reportSize in ThreeRenderer.ts.
  const [sizeInfo, setSizeInfo] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setRenderIssue(null);

    // Instantiate Three.js WebGL 3D Renderer
    const renderer = new ThreeRenderer(container, engine, setRenderIssue, setSizeInfo);
    rendererRef.current = renderer;

    let rafId = 0;
    let lastT = performance.now();

    const loop = (t: number) => {
      const dt = Math.min(50, t - lastT);
      lastT = t;

      engine.update(dt);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [engine]);

  // Touch / Swipe controls fallback for mobile testing
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    const minSwipe = 35;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > minSwipe) engine.handleAction('MOVE_RIGHT');
      else if (dx < -minSwipe) engine.handleAction('MOVE_LEFT');
    } else {
      if (dy < -minSwipe) engine.handleAction('JUMP');
      else if (dy > minSwipe) engine.handleAction('DUCK_START');
    }
  };

  return (
    <>
      <div
        ref={containerRef}
        className="game-canvas-container"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      />
      {renderIssue && (
        <div className="render-issue-banner">
          <AlertTriangle size={16} />
          <span>{renderIssue}</span>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}
      {sizeInfo && <div className="hud-debug-panel size-debug">{sizeInfo}</div>}
    </>
  );
}
