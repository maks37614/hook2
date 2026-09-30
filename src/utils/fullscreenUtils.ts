/**
 * Cross-browser safe fullscreen helper
 * Handles environments where requestFullscreen is undefined (Safari, iOS WebKit, iFrames, etc.)
 */

export function isFullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as any;
  const el = document.documentElement as any;
  return Boolean(
    el?.requestFullscreen ||
    el?.webkitRequestFullscreen ||
    el?.mozRequestFullScreen ||
    el?.msRequestFullscreen ||
    doc?.exitFullscreen ||
    doc?.webkitExitFullscreen ||
    doc?.mozCancelFullScreen ||
    doc?.msExitFullscreen
  );
}

export function isCurrentlyFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as any;
  return Boolean(
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement
  );
}

export async function requestFullscreenSafe(element: HTMLElement = document.documentElement): Promise<boolean> {
  if (typeof document === 'undefined' || !element) return false;
  const el = element as any;
  const requestFn =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.mozRequestFullScreen ||
    el.msRequestFullscreen;

  if (typeof requestFn === 'function') {
    try {
      const res = requestFn.call(el);
      if (res && typeof res.then === 'function') {
        await res;
      }
      return true;
    } catch (err) {
      console.warn('Fullscreen request failed or denied:', err);
      return false;
    }
  }
  return false;
}

export async function exitFullscreenSafe(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const doc = document as any;
  const exitFn =
    doc.exitFullscreen ||
    doc.webkitExitFullscreen ||
    doc.mozCancelFullScreen ||
    doc.msExitFullscreen;

  if (typeof exitFn === 'function') {
    try {
      const res = exitFn.call(doc);
      if (res && typeof res.then === 'function') {
        await res;
      }
      return true;
    } catch (err) {
      console.warn('Exit fullscreen failed:', err);
      return false;
    }
  }
  return false;
}

export async function toggleFullscreenSafe(element: HTMLElement = document.documentElement): Promise<boolean> {
  if (isCurrentlyFullscreen()) {
    return exitFullscreenSafe();
  } else {
    return requestFullscreenSafe(element);
  }
}
