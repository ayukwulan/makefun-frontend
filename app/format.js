export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const money = (v) => Number(v || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number(v || 0) % 1 ? 2 : 0 });
export const date = (v) => v ? new Date(v).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—';
export function left(v) {
  const ms = new Date(v).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'Ended';
  const d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000), m = Math.floor(ms % 3600000 / 60000);
  return d ? `${d}d ${h}h left` : h ? `${h}h ${m}m left` : `${m}m left`;
}
export const ended = (v) => !v || new Date(v).getTime() <= Date.now();
export const pot = (b) => Number(b.potUsd ?? b.rewardAmount ?? 0);
export const short = (v) => v ? `${v.slice(0, 5)}…${v.slice(-5)}` : '—';
export const initials = (v) => String(v || '?').trim().split(/[\s_-]+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase();
