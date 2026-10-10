// Score history as a single-series line chart in plain SVG.
// x is the run number (so a burst of runs in one sitting doesn't bunch up),
// y is the score. Hover or tap a point for its date and score.

export interface Point {
  score: number;
  startedAt: number;
}

const SVG = 'http://www.w3.org/2000/svg';
const PAD = { top: 16, right: 16, bottom: 28, left: 36 };

function niceStep(span: number): number {
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function renderChart(host: HTMLElement, points: Point[]): void {
  host.replaceChildren();
  if (points.length === 0) return;
  const width = Math.max(280, host.clientWidth);
  const height = Math.round(Math.min(260, Math.max(180, width * 0.4)));
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const scores = points.map((p) => p.score);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const step = niceStep(Math.max(4, max - min));
  const yMin = Math.max(0, Math.floor((min - step / 2) / step) * step);
  const yMax = Math.ceil((max + step / 4) / step) * step;
  const n = points.length;
  const x = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', class: 'chart' });
  svg.setAttribute('aria-label', `Scores for your last ${n} runs, from ${min} to ${max}.`);

  for (let v = yMin; v <= yMax; v += step) {
    svg.append(el('line', { x1: PAD.left, x2: width - PAD.right, y1: y(v), y2: y(v), class: 'grid' }));
    const label = el('text', { x: PAD.left - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' });
    label.textContent = String(v);
    svg.append(label);
  }

  const first = el('text', { x: PAD.left, y: height - 8, class: 'tick' });
  first.textContent = dateFmt.format(points[0]!.startedAt);
  svg.append(first);
  if (n > 1) {
    const last = el('text', { x: width - PAD.right, y: height - 8, 'text-anchor': 'end', class: 'tick' });
    last.textContent = dateFmt.format(points[n - 1]!.startedAt);
    svg.append(last);
  }

  if (n > 1) {
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join('');
    svg.append(el('path', { d, class: 'series' }));
  }

  // Dots only while they stay readable; past that the line carries it.
  const bestIndex = scores.lastIndexOf(max);
  const dots = n <= 60;
  points.forEach((p, i) => {
    if (dots || i === bestIndex || i === n - 1) {
      svg.append(el('circle', { cx: x(i), cy: y(p.score), r: 4, class: 'dot' }));
    }
  });

  const bestLabel = el('text', {
    x: x(bestIndex),
    y: y(max) - 10,
    'text-anchor': bestIndex === 0 ? 'start' : bestIndex === n - 1 ? 'end' : 'middle',
    class: 'label',
  });
  bestLabel.textContent = `Best ${max}`;
  svg.append(bestLabel);

  const cross = el('line', { y1: PAD.top, y2: PAD.top + innerH, class: 'cross', visibility: 'hidden' });
  const focus = el('circle', { r: 5, class: 'dot focus', visibility: 'hidden' });
  svg.append(cross, focus);

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  host.append(svg, tip);

  const showAt = (clientX: number) => {
    const box = svg.getBoundingClientRect();
    const px = ((clientX - box.left) / box.width) * width;
    const i = n === 1 ? 0 : Math.round(((px - PAD.left) / innerW) * (n - 1));
    const k = Math.min(n - 1, Math.max(0, i));
    const p = points[k]!;
    cross.setAttribute('x1', String(x(k)));
    cross.setAttribute('x2', String(x(k)));
    focus.setAttribute('cx', String(x(k)));
    focus.setAttribute('cy', String(y(p.score)));
    cross.setAttribute('visibility', 'visible');
    focus.setAttribute('visibility', 'visible');
    tip.textContent = `${p.score} · ${timeFmt.format(p.startedAt)}`;
    tip.hidden = false;
    const left = (x(k) / width) * box.width;
    tip.style.left = `${Math.min(box.width - tip.offsetWidth, Math.max(0, left - tip.offsetWidth / 2))}px`;
    tip.style.top = `${(y(p.score) / height) * box.height - tip.offsetHeight - 12}px`;
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    focus.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  svg.addEventListener('pointermove', (e) => showAt(e.clientX));
  svg.addEventListener('pointerdown', (e) => showAt(e.clientX));
  svg.addEventListener('pointerleave', hide);
}
