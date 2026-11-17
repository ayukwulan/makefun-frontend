export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export const number = value => Number(value ?? 0).toLocaleString('en-US');
export const money = value => Number(value ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number(value) % 1 ? 2 : 0, maximumFractionDigits: 2 });
export const pot = item => Number(item.potUsd ?? item.rewardAmount ?? 0);
export const count = item => Number(item.submissionCount ?? item.submissions?.length ?? 0);
export const category = item => item.category || item.categoryName || 'Other';
export const remaining = date => Date.parse(date) - Date.now();
export const ended = date => remaining(date) <= 0;
export const soon = date => remaining(date) > 0 && remaining(date) < 86_400_000;
export function timeLeft(date) {
  const ms = remaining(date);
  if (!Number.isFinite(ms)) return 'No deadline';
  if (ms <= 0) return 'Ended';
  const days = Math.floor(ms / 86_400_000), hours = Math.floor(ms / 3_600_000) % 24, minutes = Math.floor(ms / 60_000) % 60;
  return days ? `${days}d ${hours}h left` : hours ? `${hours}h ${minutes}m left` : minutes ? `${minutes}m left` : '<1m left';
}
export function date(value, withTime = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Date(value).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) });
}
export const initials = value => String(value || '?').trim().split(/[\s_.-]+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
export const route = (slug, suffix = '') => '#/bounty/' + encodeURIComponent(slug) + suffix;
export function link(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? escape(url.href) : ''; } catch { return ''; }
}
export function avatar(value) {
  try { return value ? link(new URL(value, 'https://make.fun').href) : ''; } catch { return ''; }
}

