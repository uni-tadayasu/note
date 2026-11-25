/** Resolution-independent ink. All saved coordinates use the page's logical size. */
const TOOLS = new Set(['pen', 'marker', 'eraser', 'line', 'rect', 'ellipse', 'select', 'text']);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const uid = () => globalThis.crypto?.randomUUID?.() || `ink-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;

function pointDistanceSquared(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = dx || dy ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1) : 0;
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
}
function segmentsDistanceSquared(a, b, c, d) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC < 0 && abD > 0) || (abC > 0 && abD < 0)) && ((cdA < 0 && cdB > 0) || (cdA > 0 && cdB < 0))) return 0;
  return Math.min(pointDistanceSquared(a, c, d), pointDistanceSquared(b, c, d), pointDistanceSquared(c, a, b), pointDistanceSquared(d, a, b));
}
const overlaps = (a, b) => a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
function rectFrom(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}
function strokeWidth(stroke, point) {
  return stroke.size * (stroke.tool === 'pen' && stroke.pressure ? 0.38 + clamp(point.p ?? 0.5, 0, 1) * 1.24 : 1);
}
function strokeBounds(stroke) {
  if (!stroke.points.length) return { x: 0, y: 0, width: 0, height: 0 };
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const point of stroke.points) {
    left = Math.min(left, point.x); top = Math.min(top, point.y);
    right = Math.max(right, point.x); bottom = Math.max(bottom, point.y);
  }
  const pad = stroke.size * (stroke.tool === 'marker' ? 0.65 : 0.9) + 1;
  return { x: left - pad, y: top - pad, width: right - left + pad * 2, height: bottom - top + pad * 2 };
}
function segment(ctx, stroke, points, index) {
  const point = points[index];
  const start = index ? midpoint(points[index - 1], point) : point;
  const end = index < points.length - 1 ? midpoint(point, points[index + 1]) : point;
  ctx.lineWidth = strokeWidth(stroke, point);
  ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.quadraticCurveTo(point.x, point.y, end.x, end.y); ctx.stroke();
}
/** This renderer never applies random jitter: saved and exported paths stay identical. */
function paintStroke(ctx, stroke, colorOverride = null) {
  const points = stroke.points;
  if (!points.length) return;
  ctx.save();
  ctx.strokeStyle = colorOverride || stroke.color;
  ctx.fillStyle = colorOverride || stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = stroke.tool === 'marker' ? (colorOverride ? 0.6 : 0.27) : 1;
  const first = points[0], last = points[points.length - 1];
  if (['line', 'rect', 'ellipse'].includes(stroke.tool)) {
    ctx.beginPath();
    if (stroke.tool === 'line') { ctx.moveTo(first.x, first.y); ctx.lineTo(last.x, last.y); }
    if (stroke.tool === 'rect') ctx.rect(first.x, first.y, last.x - first.x, last.y - first.y);
    if (stroke.tool === 'ellipse') ctx.ellipse((first.x + last.x) / 2, (first.y + last.y) / 2, Math.abs(last.x - first.x) / 2, Math.abs(last.y - first.y) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (points.length === 1) {
    ctx.beginPath(); ctx.arc(first.x, first.y, strokeWidth(stroke, first) / 2, 0, Math.PI * 2); ctx.fill();
  } else if (stroke.tool === 'marker') {
    ctx.beginPath(); ctx.moveTo(first.x, first.y);
    for (let i = 0; i < points.length - 1; i++) {
      const mid = midpoint(points[i], points[i + 1]);
      ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
    }
    ctx.lineTo(last.x, last.y); ctx.stroke();
  } else {
    for (let i = 0; i < points.length; i++) segment(ctx, stroke, points, i);
  }
  ctx.restore();
}

export class InkEngine {
  constructor(canvas, options = {}) {
    if (!canvas?.getContext) throw new TypeError('InkEngine requires a canvas.');
    this.canvas = canvas;
    this.options = options;
    this.width = finite(options.width, 1400);
    this.height = finite(options.height, 900);
    this.ctx = canvas.getContext('2d', { desynchronized: true });
    this.buffer = document.createElement('canvas');
    this.bufferCtx = this.buffer.getContext('2d');
    this.live = document.createElement('canvas');
    this.liveCtx = this.live.getContext('2d');
    this.tool = 'pen'; this.color = '#f4f2df'; this.size = 4;
    this.penOnly = false; this.zoom = 1; this.strokes = [];
    this.history = []; this.future = []; this.selection = null;
    this.active = null; this.lastPenTime = -Infinity; this.frame = 0;
    this.boundsCache = new WeakMap(); this.destroyed = false;
    this.canvas.style.touchAction = 'none';
    this.canvas.style.userSelect = 'none';
    this.canvas.style.webkitUserSelect = 'none';
    this.canvas.style.webkitTouchCallout = 'none';
    this.canvas.tabIndex = this.canvas.tabIndex < 0 ? 0 : this.canvas.tabIndex;
    this.handlers = {
      pointerdown: event => this._down(event),
      pointermove: event => this._move(event),
      pointerup: event => this._up(event),
      pointercancel: event => this._up(event, true),
      lostpointercapture: event => this._up(event, true),
      contextmenu: event => event.preventDefault(),
      dragstart: event => event.preventDefault(),
    };
    for (const [type, handler] of Object.entries(this.handlers)) canvas.addEventListener(type, handler, { passive: false });
    this.resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
    this.resizeObserver?.observe(canvas);
    this.resize();
  }

  setTool(tool) {
    if (!TOOLS.has(tool)) return;
    this._finish(); this.tool = tool;
    this.canvas.style.cursor = tool === 'text' ? 'text' : tool === 'select' ? 'crosshair' : tool === 'eraser' ? 'cell' : 'crosshair';
    this._schedule();
  }
  setColor(color) { if (typeof color === 'string') this.color = color; }
  setSize(size) { this.size = clamp(finite(size, 4), 0.5, 80); }
  setPenOnly(value) { this.penOnly = Boolean(value); }
  setZoom(value) { this.zoom = clamp(finite(value, 1), 0.25, 6); this.resize(); }
  setViewport(width, height) {
    const nextWidth = clamp(finite(width, this.width), 64, 16384);
    const nextHeight = clamp(finite(height, this.height), 64, 16384);
    if (nextWidth === this.width && nextHeight === this.height) return;
    // Commit to the old page coordinates before the host changes its mapping.
    // Saved paths are never rescaled or clipped when the visible viewport changes.
    this._finish();
    this.width = nextWidth; this.height = nextHeight;
    this.clearSelection();
    this.resize();
    // The CSS pixel dimensions can stay identical while logical dimensions change.
    // Repaint in that case too, without replacing paths or clearing history.
    this._rebuild();
  }
  getStrokes() { return this.strokes.slice(); }
  getContentBounds() {
    if (!this.strokes.length) return null;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const stroke of this.strokes) {
      const bounds = this._bounds(stroke);
      left = Math.min(left, bounds.x); top = Math.min(top, bounds.y);
      right = Math.max(right, bounds.x + bounds.width); bottom = Math.max(bottom, bounds.y + bounds.height);
    }
    // Include the full pressure-safe stroke padding, even outside the viewport.
    return { x: left, y: top, width: right - left, height: bottom - top };
  }
  finishStroke() { this._finish(); }
  get canUndo() { return this.history.length > 0; }
  get canRedo() { return this.future.length > 0; }
  getSelection() { return this.selection ? { ...this.selection, ids: [...this.selection.ids] } : null; }

  setStrokes(strokes = []) {
    this._finish();
    this.strokes = strokes.filter(s => s && Array.isArray(s.points) && s.points.length).map(stroke => ({
      ...stroke,
      id: stroke.id || uid(),
      tool: TOOLS.has(stroke.tool) ? stroke.tool : 'pen',
      color: typeof stroke.color === 'string' ? stroke.color : '#f4f2df',
      size: clamp(finite(stroke.size, 4), 0.5, stroke.tool === 'marker' ? 320 : 80),
      points: stroke.points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).map(p => ({ x: p.x, y: p.y, p: clamp(finite(p.p ?? p.pressure, 0.5), 0, 1), t: finite(p.t) })),
    })).filter(s => s.points.length);
    this.history = []; this.future = []; this.clearSelection(); this._rebuild();
    this.options.onHistoryChange?.({ canUndo: false, canRedo: false });
  }

  clearSelection() {
    if (this.active?.kind === 'move' || this.active?.kind === 'select') this._finish();
    this.selection = null;
    this.options.onSelectionChange?.(null);
    this._schedule();
  }
  clear() {
    this._finish();
    if (!this.strokes.length) return;
    const command = { added: [], removed: this.strokes.map((stroke, index) => ({ stroke, index })) };
    this.strokes = []; this.clearSelection(); this._commit(command); this._rebuild();
  }
  deleteSelection() {
    this._finish();
    if (!this.selection?.ids.length) return false;
    const ids = new Set(this.selection.ids);
    const removed = this.strokes.map((stroke, index) => ({ stroke, index })).filter(({ stroke }) => ids.has(stroke.id));
    this.strokes = this.strokes.filter(s => !ids.has(s.id));
    this.clearSelection(); this._commit({ added: [], removed }); this._rebuild(); return true;
  }
  undo() {
    this._finish();
    const command = this.history.pop(); if (!command) return false;
    this._apply(command, true); this.future.push(command); this.clearSelection(); this._rebuild(); this._changed(); return true;
  }
  redo() {
    this._finish();
    const command = this.future.pop(); if (!command) return false;
    this._apply(command, false); this.history.push(command); this.clearSelection(); this._rebuild(); this._changed(); return true;
  }
  _apply(command, reverse) {
    const remove = new Set((reverse ? command.added : command.removed).map(x => x.stroke.id));
    this.strokes = this.strokes.filter(s => !remove.has(s.id));
    for (const entry of [...(reverse ? command.removed : command.added)].sort((a, b) => a.index - b.index)) this.strokes.splice(entry.index, 0, entry.stroke);
  }
  _commit(command) {
    if (!command.added.length && !command.removed.length) return;
    this.history.push(command);
    // Commands retain references to changed paths, never a full point-by-point page snapshot.
    if (this.history.length > 250) this.history.shift();
    this.future = []; this._changed();
  }
  _changed() {
    const history = { canUndo: this.canUndo, canRedo: this.canRedo };
    this.options.onChange?.(this.getStrokes(), history);
    this.options.onHistoryChange?.(history);
  }

  resize() {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = this.canvas.clientWidth || rect.width || this.width;
    const cssHeight = this.canvas.clientHeight || rect.height || this.height;
    let dpr = clamp(globalThis.devicePixelRatio || 1, 1, 3);
    dpr = Math.min(dpr, 4096 / Math.max(cssWidth, cssHeight), Math.sqrt(8_000_000 / (cssWidth * cssHeight)));
    const width = Math.max(1, Math.round(cssWidth * dpr)), height = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      for (const canvas of [this.canvas, this.buffer, this.live]) { canvas.width = width; canvas.height = height; }
      this.sx = width / this.width; this.sy = height / this.height;
      this.liveIndex = 0;
      this._rebuild();
    } else {
      this.sx = width / this.width; this.sy = height / this.height;
      this._schedule();
    }
  }
  _clear(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(this.sx || 1, 0, 0, this.sy || 1, 0, 0);
  }
  _rebuild() {
    this._clear(this.bufferCtx);
    for (const stroke of this.strokes) paintStroke(this.bufferCtx, stroke);
    if (this.active?.kind === 'move') this._prepareMoveBackground();
    this._schedule();
  }
  _schedule() {
    if (!this.frame && !this.destroyed) this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); });
  }
  draw() {
    if (this.destroyed) return;
    const ctx = this.ctx;
    this._clear(ctx);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.active?.kind === 'move') ctx.drawImage(this.live, 0, 0);
    else if (this.active?.kind !== 'erase') ctx.drawImage(this.buffer, 0, 0);
    ctx.restore();
    if (this.active?.kind === 'erase') for (const stroke of this.strokes) if (!this.active.ids.has(stroke.id)) paintStroke(ctx, stroke);
    if (this.active?.kind === 'move') {
      ctx.save(); ctx.translate(this.active.dx, this.active.dy);
      for (const { stroke } of this.active.entries) paintStroke(ctx, stroke);
      ctx.restore();
    }
    const stroke = this.active?.stroke;
    if (stroke) {
      if (stroke.tool === 'pen' && stroke.points.length > 1) {
        const liveCtx = this.liveCtx;
        liveCtx.strokeStyle = stroke.color; liveCtx.lineCap = 'round'; liveCtx.lineJoin = 'round';
        // Only newly stable curve segments are painted; long strokes do not redraw every sample.
        for (; this.liveIndex < stroke.points.length - 1; this.liveIndex++) segment(liveCtx, stroke, stroke.points, this.liveIndex);
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.live, 0, 0); ctx.restore();
        ctx.save(); ctx.strokeStyle = stroke.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        segment(ctx, stroke, stroke.points, stroke.points.length - 1); ctx.restore();
      } else paintStroke(ctx, stroke);
    }
    const selection = this.active?.kind === 'select' ? rectFrom(this.active.start, this.active.end) : this.active?.kind === 'move' ? { ...this.selection, x: this.selection.x + this.active.dx, y: this.selection.y + this.active.dy } : this.selection;
    if (selection && selection.width > 0 && selection.height > 0) {
      const pixel = this.width / (this.canvas.getBoundingClientRect().width || this.width);
      ctx.save(); ctx.strokeStyle = '#e7c372'; ctx.fillStyle = 'rgba(231,195,114,.075)'; ctx.lineWidth = pixel * 1.5;
      ctx.setLineDash([pixel * 7, pixel * 5]); ctx.fillRect(selection.x, selection.y, selection.width, selection.height);
      ctx.strokeRect(selection.x, selection.y, selection.width, selection.height); ctx.restore();
    }
  }

  _point(event, startedAt = event.timeStamp) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) * this.width / (rect.width || 1), 0, this.width),
      y: clamp((event.clientY - rect.top) * this.height / (rect.height || 1), 0, this.height),
      p: event.pointerType === 'pen' ? clamp(event.pressure || 0.25, 0.05, 1) : 0.5,
      t: Math.max(0, event.timeStamp - startedAt),
    };
  }
  _down(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.pointerType === 'pen') {
      this.lastPenTime = performance.now();
      // A palm may touch the glass just before the stylus. Give the stylus
      // priority and discard that uncommitted touch path instead of blocking ink.
      if (this.active?.pointerType === 'touch') {
        const touchId = this.active.pointerId; this.active = null;
        try { if (this.canvas.hasPointerCapture(touchId)) this.canvas.releasePointerCapture(touchId); } catch { /* released by the OS */ }
        this._rebuild();
      }
    }
    if (this.active || (this.penOnly && event.pointerType === 'touch')) return;
    if (event.pointerType === 'touch' && (performance.now() - this.lastPenTime < 650 || Math.max(event.width || 0, event.height || 0) > 50)) return;
    event.preventDefault();
    const start = this._point(event);
    if (this.tool === 'text') { this.options.onTextRequest?.({ x: start.x, y: start.y }); return; }
    try { this.canvas.setPointerCapture(event.pointerId); } catch { /* detached canvas */ }
    const base = { pointerId: event.pointerId, pointerType: event.pointerType, startedAt: event.timeStamp };
    const tool = event.pointerType === 'pen' && (event.button === 5 || (event.buttons & 32)) ? 'eraser' : this.tool;
    if (tool === 'select') {
      const selection = this.selection;
      if (selection?.ids.length && this._insideSelection(start)) {
        const ids = new Set(selection.ids);
        const entries = this.strokes.map((stroke, index) => ({ stroke, index })).filter(entry => ids.has(entry.stroke.id));
        let left = selection.x, top = selection.y, right = selection.x + selection.width, bottom = selection.y + selection.height;
        for (const { stroke } of entries) {
          const bounds = this._bounds(stroke);
          left = Math.min(left, Math.max(0, bounds.x)); top = Math.min(top, Math.max(0, bounds.y));
          right = Math.max(right, Math.min(this.width, bounds.x + bounds.width)); bottom = Math.max(bottom, Math.min(this.height, bounds.y + bounds.height));
        }
        this.active = { ...base, kind: 'move', start, dx: 0, dy: 0, ids, entries, limits: { minX: -left, minY: -top, maxX: this.width - right, maxY: this.height - bottom } };
        this.canvas.style.cursor = 'grabbing'; this._prepareMoveBackground();
      } else this.active = { ...base, kind: 'select', start, end: start };
    }
    else if (tool === 'eraser') {
      this.active = { ...base, kind: 'erase', ids: new Set(), last: start }; this._eraseBetween(start, start);
    } else {
      this.active = { ...base, kind: 'draw', stroke: { id: uid(), tool, color: this.color, size: tool === 'marker' ? Math.max(16, this.size * 4) : this.size, pressure: event.pointerType === 'pen', points: [start] } };
      this._clear(this.liveCtx); this.liveIndex = 0;
    }
    this._schedule();
  }
  _insideSelection(point) {
    const s = this.selection;
    return Boolean(s && point.x >= s.x && point.x <= s.x + s.width && point.y >= s.y && point.y <= s.y + s.height);
  }
  _prepareMoveBackground() {
    this._clear(this.liveCtx);
    for (const stroke of this.strokes) if (!this.active.ids.has(stroke.id)) paintStroke(this.liveCtx, stroke);
  }
  _move(event) {
    if (event.pointerType === 'pen') this.lastPenTime = performance.now();
    if (!this.active) {
      if (this.tool === 'select') this.canvas.style.cursor = this.selection?.ids.length && this._insideSelection(this._point(event)) ? 'grab' : 'crosshair';
      return;
    }
    if (this.active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const events = event.getCoalescedEvents?.() || [];
    const samples = events.length ? events : [event];
    for (const sample of samples) {
      const point = this._point(sample, this.active.startedAt);
      if (this.active.kind === 'select') this.active.end = point;
      else if (this.active.kind === 'move') {
        const { limits, start } = this.active;
        this.active.dx = clamp(point.x - start.x, limits.minX, limits.maxX);
        this.active.dy = clamp(point.y - start.y, limits.minY, limits.maxY);
      }
      else if (this.active.kind === 'erase') { this._eraseBetween(this.active.last, point); this.active.last = point; }
      else {
        const stroke = this.active.stroke;
        if (['line', 'rect', 'ellipse'].includes(stroke.tool)) stroke.points[1] = point;
        else {
          const previous = stroke.points[stroke.points.length - 1];
          if ((point.x - previous.x) ** 2 + (point.y - previous.y) ** 2 < 0.04) continue;
          point.p = previous.p * 0.35 + point.p * 0.65;
          stroke.points.push(point);
        }
      }
    }
    this._schedule();
  }
  _up(event, cancelled = false) {
    if (event.pointerType === 'pen') this.lastPenTime = performance.now();
    if (!this.active || event.pointerId !== this.active.pointerId) return;
    if (!cancelled) this._move(event);
    this._finish();
  }
  _finish() {
    const active = this.active; if (!active) return;
    this.active = null;
    try { if (this.canvas.hasPointerCapture(active.pointerId)) this.canvas.releasePointerCapture(active.pointerId); } catch { /* pointer already released */ }
    if (active.kind === 'draw') {
      const stroke = active.stroke;
      // A tap is a dot. Degenerate shapes become a short dot rather than disappearing.
      if (['line', 'rect', 'ellipse'].includes(stroke.tool) && stroke.points.length === 1) stroke.tool = 'pen';
      this.strokes.push(stroke); paintStroke(this.bufferCtx, stroke);
      this._commit({ added: [{ stroke, index: this.strokes.length - 1 }], removed: [] });
    } else if (active.kind === 'erase') {
      const removed = this.strokes.map((stroke, index) => ({ stroke, index })).filter(({ stroke }) => active.ids.has(stroke.id));
      this.strokes = this.strokes.filter(s => !active.ids.has(s.id));
      this._commit({ removed, added: [] }); this._rebuild();
    } else if (active.kind === 'move') {
      if (active.dx || active.dy) {
        const added = active.entries.map(({ stroke, index }) => ({ index, stroke: { ...stroke, points: stroke.points.map(point => ({ ...point, x: point.x + active.dx, y: point.y + active.dy })) } }));
        const moved = new Map(added.map(entry => [entry.stroke.id, entry.stroke]));
        this.strokes = this.strokes.map(stroke => moved.get(stroke.id) || stroke);
        this.selection = { ...this.selection, x: this.selection.x + active.dx, y: this.selection.y + active.dy };
        this._commit({ removed: active.entries, added }); this._rebuild();
      }
      this.canvas.style.cursor = 'grab';
      this.options.onSelectionChange?.(this.getSelection());
    } else if (active.kind === 'select') {
      const bounds = rectFrom(active.start, active.end);
      this.selection = bounds.width > 3 && bounds.height > 3 ? { ...bounds, ids: this.strokes.filter(s => overlaps(this._bounds(s), bounds)).map(s => s.id) } : null;
      this.options.onSelectionChange?.(this.getSelection());
    }
    this._schedule();
  }
  _bounds(stroke) {
    if (!this.boundsCache.has(stroke)) this.boundsCache.set(stroke, strokeBounds(stroke));
    return this.boundsCache.get(stroke);
  }
  _geometry(stroke) {
    const points = stroke.points, first = points[0], last = points[points.length - 1];
    if (stroke.tool === 'rect') return [first, { x: last.x, y: first.y }, last, { x: first.x, y: last.y }, first];
    if (stroke.tool === 'ellipse') {
      const x = (first.x + last.x) / 2, y = (first.y + last.y) / 2, rx = Math.abs(last.x - first.x) / 2, ry = Math.abs(last.y - first.y) / 2;
      return Array.from({ length: 49 }, (_, i) => ({ x: x + Math.cos(i * Math.PI / 24) * rx, y: y + Math.sin(i * Math.PI / 24) * ry }));
    }
    return points;
  }
  _eraseBetween(start, end) {
    const radius = Math.max(10, this.size * 2.5), area = rectFrom(start, end);
    area.x -= radius; area.y -= radius; area.width += radius * 2; area.height += radius * 2;
    for (const stroke of this.strokes) {
      if (this.active.ids.has(stroke.id) || !overlaps(this._bounds(stroke), area)) continue;
      const points = this._geometry(stroke), threshold = (radius + stroke.size / 2) ** 2;
      let hit = points.length === 1 && pointDistanceSquared(points[0], start, end) <= threshold;
      for (let i = 1; !hit && i < points.length; i++) hit = segmentsDistanceSquared(start, end, points[i - 1], points[i]) <= threshold;
      if (hit) this.active.ids.add(stroke.id);
    }
  }

  _exportArea({ crop = false, selectionOnly = false, padding = 28 } = {}) {
    let strokes = this.strokes;
    const selection = selectionOnly && this.selection ? this.selection : null;
    if (selection) strokes = strokes.filter(s => overlaps(this._bounds(s), selection));
    let bounds = { x: 0, y: 0, width: this.width, height: this.height };
    if (selection) bounds = { x: selection.x, y: selection.y, width: selection.width, height: selection.height };
    else if (crop && strokes.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const stroke of strokes) { const b = this._bounds(stroke); minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height); }
      bounds = { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
    }
    const x = clamp(bounds.x, 0, this.width), y = clamp(bounds.y, 0, this.height);
    bounds = { x, y, width: Math.max(1, Math.min(this.width, bounds.x + bounds.width) - x), height: Math.max(1, Math.min(this.height, bounds.y + bounds.height) - y) };
    return { strokes, bounds };
  }
  exportCanvas({ background = null, inkColor = null, crop = false, selectionOnly = false, scale = 1, padding = 28 } = {}) {
    this._finish();
    const { strokes, bounds } = this._exportArea({ crop, selectionOnly, padding });
    const canvas = document.createElement('canvas');
    scale = clamp(scale, 0.25, Math.min(3, 4096 / Math.max(bounds.width, bounds.height)));
    canvas.width = Math.max(1, Math.ceil(bounds.width * scale)); canvas.height = Math.max(1, Math.ceil(bounds.height * scale));
    const ctx = canvas.getContext('2d');
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.scale(scale, scale); ctx.translate(-bounds.x, -bounds.y);
    for (const stroke of strokes) paintStroke(ctx, stroke, inkColor);
    return canvas;
  }
  getRecognitionInput() {
    this._finish();
    const selectionOnly = Boolean(this.selection);
    const { strokes, bounds } = this._exportArea({ crop: true, selectionOnly, padding: 32 });
    if (!strokes.length) throw new Error(selectionOnly ? '選択した範囲に手書きがありません。文字を囲み直してください。' : 'まず文字を手書きしてから、文字に変換してください。');
    const canvas = this.exportCanvas({ background: '#ffffff', inkColor: '#161616', crop: true, selectionOnly, scale: 1.5, padding: 32 });
    // Native stroke APIs cannot clip a path at a rectangle edge. Use the clipped
    // raster for selected ranges so text outside the range is never recognized.
    const imageScaleX = canvas.width / bounds.width, imageScaleY = canvas.height / bounds.height;
    const pathsContained = strokes.every(s => s.points.every(p => p.x >= bounds.x && p.x <= bounds.x + bounds.width && p.y >= bounds.y && p.y <= bounds.y + bounds.height));
    const nativeStrokes = selectionOnly || !pathsContained ? [] : strokes.filter(s => ['pen', 'marker'].includes(s.tool)).map(s => ({ ...s, points: s.points.map(p => ({ ...p, x: (p.x - bounds.x) * imageScaleX, y: (p.y - bounds.y) * imageScaleY })) }));
    return { canvas, strokes: nativeStrokes, bounds };
  }
  destroy() {
    this._finish(); this.destroyed = true;
    cancelAnimationFrame(this.frame); this.resizeObserver?.disconnect();
    for (const [type, handler] of Object.entries(this.handlers)) this.canvas.removeEventListener(type, handler);
  }
}

export { paintStroke, strokeBounds };
