const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const integers = new Intl.NumberFormat('en-US');
const calendar = [false, true].map(time => new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
  ...(time ? { hour: '2-digit', minute: '2-digit', hour12: false } : {})
}));
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
export const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
export const money = value => dollars.format(numeric(value)).replace(/\.00$/, '');
export const number = value => integers.format(numeric(value));
export const livePot = bounty => numeric(bounty.potUsd ?? bounty.rewardAmount);
export const entries = bounty => numeric(bounty.submissionCount ?? bounty.submissions?.length);
export const category = bounty => bounty.category || bounty.categoryName || 'Other';
export const openedAt = bounty => bounty.opensAt || bounty.openedAt || bounty.publishedAt || bounty.createdAt;
export const millisecondsLeft = deadline => Date.parse(deadline) - Date.now();
export const hasEnded = deadline => millisecondsLeft(deadline) <= 0;
export const closingSoon = deadline => millisecondsLeft(deadline) > 0 && millisecondsLeft(deadline) < 86_400_000;

export function countdown(deadline) {
  const remaining = millisecondsLeft(deadline);
  if (!Number.isFinite(remaining)) return 'No deadline';
  if (remaining <= 0) return 'Ended';
  const minutes = Math.floor(remaining / 60_000);
  if (minutes < 1) return 'Under 1m left';
  const hours = Math.floor(minutes / 60);
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h left`
    : hours ? `${hours}h ${minutes % 60}m left` : `${minutes}m left`;
}

export function date(value, time = false) {
  if (!Number.isFinite(Date.parse(value))) return '—';
  return calendar[time ? 1 : 0].format(new Date(value));
}

export function bountyState(bounty) {
  if (hasEnded(bounty.deadline)) return 'Ended';
  if (Date.parse(openedAt(bounty)) > Date.now()) return 'Upcoming';
  return bounty.acceptingSubmissions === false ? 'Entries paused' : 'Open for entries';
}
export const bountyURL = (slug, tail = '') => '#/bounty/' + encodeURIComponent(slug) + tail;
export const makerURL = handle => '#/u/' + encodeURIComponent(handle);
export const publicURL = (slug, tail = '') => 'https://make.fun/bounty/' + encodeURIComponent(slug) + tail;
export function safeURL(value, base = 'https://make.fun') {
  if (!value) return '';
  try {
    const url = new URL(String(value), base);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}
export function initials(value) {
  const parts = String(value || '?').trim().split(/[\s._-]+/).filter(Boolean);
  return parts.slice(0, 2).map(part => [...part][0]).join('').toUpperCase();
}
export const shortWallet = address => address.length > 12 ? address.slice(0, 5) + '…' + address.slice(-5) : address;
export const scoreValue = (row, column) => row.display?.[column.key] ?? row.values?.[column.key] ?? '—';
