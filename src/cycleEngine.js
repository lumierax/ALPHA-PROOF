import { FUTURES_BASES, KLINE_LIMIT } from './constants';

const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;

export async function fetchJSON(path, params = {}, timeout = 9000) {
  const q = new URLSearchParams(params).toString();
  let lastErr;
  for (const base of FUTURES_BASES) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(base + path + (q ? '?' + q : ''), { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json && typeof json === 'object' && !Array.isArray(json) && json.code && json.code < 0) {
        throw new Error(json.msg || 'Binance API error');
      }
      return json;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
    }
  }
  throw lastErr || new Error('Network error');
}

export function closedKlines(raw) {
  const now = Date.now();
  return (raw || [])
    .filter(r => +r[6] < now - 1000)
    .map(r => ({ t:+r[0], ct:+r[6], o:+r[1], h:+r[2], l:+r[3], c:+r[4], v:+r[5], tb:+r[9] }));
}

export function cyclePoint(k, i) {
  if (i < 35) return null;
  const win = k.slice(i - 35, i + 1);
  const hi = Math.max(...win.map(x => x.h));
  const lo = Math.min(...win.map(x => x.l));
  const range = Math.max(1e-12, hi - lo);
  const pos = (k[i].c - lo) / range;
  const ret3 = k[i].c / k[i - 3].c - 1;
  let dir = 'neutral';
  if (pos <= .35 && ret3 <= -.001) dir = 'long';
  else if (pos >= .65 && ret3 >= .001) dir = 'short';
  return { dir, pos, ret3, hi, lo, range, c:k[i].c, t:k[i].t, ct:k[i].ct };
}

export function computeTaker(k) {
  if (!k || k.length < 8) return { dir:'neutral', cur:NaN, prev3:NaN };
  const ratios = k.map(x => x.v > 0 ? x.tb / x.v : .5);
  const i = ratios.length - 1;
  const cur = ratios[i];
  const prev3 = mean(ratios.slice(i - 3, i));
  let dir = 'neutral';
  if (cur >= .52 && prev3 <= .48) dir = 'long';
  else if (cur <= .48 && prev3 >= .52) dir = 'short';
  return { dir, cur, prev3 };
}

export function analyzeFrame(k, id) {
  if (!k || k.length < 40) return { id, ready:false, taker:computeTaker(k || []) };
  const taker = computeTaker(k);
  const points = [];
  for (let i = 35; i < k.length; i++) points.push(cyclePoint(k, i));
  const current = points[points.length - 1];
  let lastEvent = null;
  let prev = 'neutral';
  for (const p of points) {
    if ((p.dir === 'long' || p.dir === 'short') && p.dir !== prev) lastEvent = { ...p };
    prev = p.dir;
  }
  if (!lastEvent) return { id, ready:true, current, lastEvent:null, taker };
  const curPrice = k[k.length - 1].c;
  const dir = lastEvent.dir;
  const opposite = dir === 'long' ? lastEvent.lo + .65 * lastEvent.range : lastEvent.lo + .35 * lastEvent.range;
  const edge = dir === 'long' ? lastEvent.hi : lastEvent.lo;
  const denom = dir === 'long' ? opposite - lastEvent.c : lastEvent.c - opposite;
  const moved = dir === 'long' ? curPrice - lastEvent.c : lastEvent.c - curPrice;
  const usedPct = (denom > 0 ? moved / denom : 0) * 100;
  const roomOppPct = dir === 'long' ? (opposite - curPrice) / curPrice * 100 : (curPrice - opposite) / curPrice * 100;
  const roomEdgePct = dir === 'long' ? (edge - curPrice) / curPrice * 100 : (curPrice - edge) / curPrice * 100;
  const active = current?.dir === dir;
  return {
    id,
    ready:true,
    current,
    lastEvent:{ ...lastEvent, active, usedPct, roomOppPct, roomEdgePct, opposite, edge, curPrice },
    taker,
  };
}

export async function fetchFrame(symbol, id) {
  const raw = await fetchJSON('/fapi/v1/klines', { symbol, interval:id, limit:KLINE_LIMIT });
  return analyzeFrame(closedKlines(raw), id);
}

export async function fetchFrames(symbol, ids) {
  const pairs = await Promise.all(ids.map(async id => [id, await fetchFrame(symbol, id)]));
  return Object.fromEntries(pairs);
}

export function executionReady5m(frame5) {
  if (!frame5?.ready) return { ready:false, side:null };
  const cyc = frame5.current?.dir;
  const tak = frame5.taker?.dir;
  const side = (cyc === 'long' || cyc === 'short') && cyc === tak ? cyc : null;
  return { ready:!!side, side, cyc, tak };
}

export function higherFrameExit(frames, trade) {
  if (!trade) return null;
  const opposite = trade.side === 'long' ? 'short' : 'long';
  const ids = ['15m','30m','1h','2h','4h','6h','8h','12h','1d','1w'];
  const hits = [];
  for (const id of ids) {
    const p = frames?.[id]?.current;
    if (p && p.dir === opposite && p.ct > (trade.startedAt || 0)) hits.push({ id, point:p });
  }
  hits.sort((a,b) => (a.point.ct || 0) - (b.point.ct || 0));
  return hits[0] || null;
}

export function pendingFiveMinuteReversal(frame5, pending) {
  if (!pending || !frame5?.ready) return null;
  const opposite = pending.side === 'long' ? 'short' : 'long';
  if (frame5.current?.dir === opposite && frame5.taker?.dir === opposite) {
    return { reason:`5M closed CYC+TAK ${opposite.toUpperCase()}` };
  }
  return null;
}
