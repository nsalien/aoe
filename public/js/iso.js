// Camera met slepen, scrollen en knijp-zoomen voor een canvas.
export class Camera {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.x = 0;
    this.y = 0;
    this.zoom = opts.zoom || 1;
    this.minZoom = opts.minZoom || 0.4;
    this.maxZoom = opts.maxZoom || 2.5;
    this.bounds = opts.bounds || null; // {x0,y0,x1,y1} in wereldpixels
    this.onClick = null;
    this.onHover = null;
    this.onRightClick = null;
    this.onLongPress = null; // ingedrukt houden zonder te slepen
    // geeft onLongPress true terug, dan 'pakt' het iets vast: verder slepen gaat naar onHoldDrag('move' | 'end' | 'cancel', sx, sy)
    // in plaats van de kaart te verschuiven (zo verplaats je een gebouw)
    this.onHoldDrag = null;
    this.holdDrag = false;
    // onGrab(sx, sy) bij het neerdrukken: geeft het true, dan gaat het slepen meteen naar onHoldDrag (bv. een gebouw verschuiven)
    this.onGrab = null;
    // slepen met de rechtermuisknop (of met één vinger als lineMode aan staat): een lijn trekken in plaats van schuiven
    // onRightDrag(fase 'move' | 'end' | 'cancel', sx0, sy0, sx, sy)
    this.onRightDrag = null;
    this.lineMode = false;
    this.pointers = new Map();
    this.dragging = false;
    this.enabled = true;
    this.dpr = 1;
    this.quality = 1; // < 1: tekenen op lagere resolutie als het toestel het niet bijhoudt
    this._bind();
  }

  resize() {
    const c = this.canvas;
    const base = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = Math.max(Math.min(base, 0.75), base * this.quality);
    const w = c.clientWidth; const h = c.clientHeight;
    if (c.width !== Math.round(w * this.dpr) || c.height !== Math.round(h * this.dpr)) {
      c.width = Math.round(w * this.dpr);
      c.height = Math.round(h * this.dpr);
    }
    this.w = w; this.h = h;
  }

  apply(ctx) {
    const z = this.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, (this.w / 2 - this.x * this.zoom) * this.dpr, (this.h / 2 - this.y * this.zoom) * this.dpr);
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.w / 2) / this.zoom + this.x, y: (sy - this.h / 2) / this.zoom + this.y };
  }

  worldToScreen(wx, wy) {
    return { x: (wx - this.x) * this.zoom + this.w / 2, y: (wy - this.y) * this.zoom + this.h / 2 };
  }

  clamp() {
    if (!this.bounds) return;
    const b = this.bounds;
    this.x = Math.min(b.x1, Math.max(b.x0, this.x));
    this.y = Math.min(b.y1, Math.max(b.y0, this.y));
  }

  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // op een gsm opent lang drukken soms een contextmenu: dat is geen rechtsklik
      if (this.lastType && this.lastType !== 'mouse') return;
      if (this.onRightDrag) return; // rechtsklik en rechts slepen worden bij het loslaten afgehandeld
      const p = this._pos(e);
      if (this.onRightClick) this.onRightClick(p.x, p.y);
    });
    c.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const p = this._pos(e);
      this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      c.setPointerCapture(e.pointerId);
      const p = this._pos(e);
      this.lastType = e.pointerType;
      // lijn trekken: rechtermuisknop, of één vinger/linkerknop in de lijnstand
      if (this.onRightDrag && !this.rdrag && this.pointers.size === 0 && (e.button === 2 || (this.lineMode && e.button === 0))) {
        this.rdrag = { id: e.pointerId, sx: p.x, sy: p.y, moved: false, right: e.button === 2 };
        clearTimeout(this.lpTimer);
        return;
      }
      this.pointers.set(e.pointerId, { ...p, sx: p.x, sy: p.y, touch: e.pointerType !== 'mouse' });
      clearTimeout(this.lpTimer);
      this.longPressed = false;
      if (this.pointers.size === 1) {
        this.dragging = false; this.startCam = { x: this.x, y: this.y };
        if (this.onGrab && this.onHoldDrag && e.button !== 2 && this.onGrab(p.x, p.y)) { this.holdDrag = true; return; }
        if (this.onLongPress && e.button !== 2) {
          const id = e.pointerId;
          this.lpTimer = setTimeout(() => {
            const pt = this.pointers.get(id);
            if (!pt || this.dragging || this.pointers.size !== 1) return;
            this.longPressed = true;
            this.holdDrag = !!this.onLongPress(pt.x, pt.y) && !!this.onHoldDrag;
          }, 550);
        }
      }
      if (this.pointers.size === 2) {
        if (this.holdDrag) { this.holdDrag = false; this.onHoldDrag('cancel', p.x, p.y); }
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
        this.dragging = true;
      }
    });
    c.addEventListener('pointermove', (e) => {
      const p = this._pos(e);
      if (this.rdrag && this.rdrag.id === e.pointerId) {
        const r = this.rdrag;
        if (!r.moved && Math.hypot(p.x - r.sx, p.y - r.sy) > 8) r.moved = true;
        if (r.moved) this.onRightDrag('move', r.sx, r.sy, p.x, p.y);
        return;
      }
      if (!this.pointers.has(e.pointerId)) {
        if (this.onHover && e.pointerType === 'mouse') this.onHover(p.x, p.y);
        return;
      }
      const pt = this.pointers.get(e.pointerId);
      const dx = p.x - pt.x; const dy = p.y - pt.y;
      pt.x = p.x; pt.y = p.y;
      if (this.holdDrag) { this.onHoldDrag('move', p.x, p.y); return; }
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
        const target = Math.min(this.maxZoom, Math.max(this.minZoom, (this.pinch.zoom * d) / this.pinch.d));
        this.zoomAt(mx, my, target / this.zoom);
        this.x -= dx / 2 / this.zoom; this.y -= dy / 2 / this.zoom;
        this.clamp();
        return;
      }
      if (!this.dragging && Math.hypot(p.x - pt.sx, p.y - pt.sy) > (pt.touch ? 10 : 6)) { this.dragging = true; clearTimeout(this.lpTimer); }
      if (this.dragging) {
        this.x -= dx / this.zoom; this.y -= dy / this.zoom;
        this.clamp();
      }
      if (this.onHover && e.pointerType === 'mouse') this.onHover(p.x, p.y);
    });
    const up = (e) => {
      if (this.rdrag && this.rdrag.id === e.pointerId) {
        const r = this.rdrag; this.rdrag = null;
        const p = this._pos(e);
        if (e.type !== 'pointerup') { this.onRightDrag('cancel', r.sx, r.sy, p.x, p.y); return; }
        if (r.moved) this.onRightDrag('end', r.sx, r.sy, p.x, p.y);
        else if (r.right) { if (this.onRightClick) this.onRightClick(p.x, p.y); }
        else { this.onRightDrag('cancel', r.sx, r.sy, p.x, p.y); if (this.onClick) this.onClick(p.x, p.y, e); }
        return;
      }
      if (!this.pointers.has(e.pointerId)) return;
      const p = this._pos(e);
      const wasDrag = this.dragging;
      this.pointers.delete(e.pointerId);
      clearTimeout(this.lpTimer);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.holdDrag) {
        this.holdDrag = false; this.longPressed = false; this.dragging = false;
        this.onHoldDrag(e.type === 'pointerup' ? 'end' : 'cancel', p.x, p.y);
        return;
      }
      if (this.longPressed) { if (this.pointers.size === 0) { this.longPressed = false; this.dragging = false; } return; }
      if (!wasDrag && this.pointers.size === 0 && e.type === 'pointerup' && this.onClick) {
        if (e.button === 2) return;
        this.onClick(p.x, p.y, e);
      }
      if (this.pointers.size === 0) this.dragging = false;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && this.onHover) this.onHover(-1, -1); });
  }
}

// isometrische omrekening voor een gegeven tegelgrootte
export function isoFns(tw, th) {
  return {
    toWorld: (gx, gy) => ({ x: (gx - gy) * (tw / 2), y: (gx + gy) * (th / 2) }),
    toGrid: (wx, wy) => ({ gx: (wx / (tw / 2) + wy / (th / 2)) / 2, gy: (wy / (th / 2) - wx / (tw / 2)) / 2 }),
  };
}

export function hashInt(a, b, seed = 0) {
  let h = (a * 374761393 + b * 668265263 + seed * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
