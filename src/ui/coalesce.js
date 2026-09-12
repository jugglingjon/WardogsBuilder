/**
 * Collapse a burst of calls into one, on the next animation frame.
 *
 * Painting a run of walls fires a change per piece. The panels only need to
 * show the result, and re-validating the whole build once per piece is what
 * turns a large build into a slideshow.
 */
export function coalesce(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn();
    });
  };
}
