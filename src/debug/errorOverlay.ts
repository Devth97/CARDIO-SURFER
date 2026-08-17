// TEMPORARY diagnostic instrumentation for the "blank blue screen" production
// bug report (2026-08-17) — surfaces uncaught errors and renderer-state
// anomalies directly on-screen, since there's no way to get real devtools
// console output off a tester's phone. Remove once root cause is confirmed
// and fixed.

let overlayEl: HTMLDivElement | null = null;
const reportedKeys = new Set<string>();

function ensureOverlay(): HTMLDivElement {
  if (overlayEl) return overlayEl;
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;max-height:40vh;overflow-y:auto;' +
    'background:rgba(0,0,0,0.85);color:#0f0;font:11px monospace;' +
    'padding:8px;z-index:999999;white-space:pre-wrap;pointer-events:none;';
  document.body.appendChild(el);
  overlayEl = el;
  return el;
}

function appendLine(text: string) {
  const el = ensureOverlay();
  const line = document.createElement('div');
  line.textContent = `[${new Date().toISOString().slice(11, 19)}] ${text}`;
  el.appendChild(line);
}

// Reports once per unique key so a per-frame check doesn't flood the overlay.
export function reportDiagnosticOnce(key: string, text: string) {
  if (reportedKeys.has(key)) return;
  reportedKeys.add(key);
  appendLine(text);
}

export function installErrorOverlay() {
  window.onerror = (message, source, lineno, colno, error) => {
    appendLine(`onerror: ${message} @ ${source}:${lineno}:${colno}\n${error?.stack ?? ''}`);
  };
  window.addEventListener('unhandledrejection', (event) => {
    appendLine(`unhandledrejection: ${event.reason?.stack ?? event.reason}`);
  });
}
