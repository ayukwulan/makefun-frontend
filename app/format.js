export function htmlText(input) {
  return String(input ?? '').replace(/[&<>"']/g, symbol => '&#' + symbol.charCodeAt(0) + ';');
}

export function dollars(input) {
  const numeric = Number(input || 0);
  return numeric.toLocaleString('en-US', {
    currency: 'USD',
    minimumFractionDigits: numeric % 1 ? 2 : 0,
    style: 'currency'
  });
}

export function calendar(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleDateString('en-US', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric'
  }) : '—';
}

export function timeRemaining(timestamp) {
  const milliseconds = new Date(timestamp).getTime() - Date.now();
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 'Ended';
  const dayCount = Math.floor(milliseconds / 86_400_000);
  const hourCount = Math.floor(milliseconds % 86_400_000 / 3_600_000);
  const minuteCount = Math.floor(milliseconds % 3_600_000 / 60_000);
  if (dayCount > 0) return `${dayCount}d ${hourCount}h left`;
  if (hourCount > 0) return `${hourCount}h ${minuteCount}m left`;
  return `${minuteCount}m left`;
}

export const deadlinePassed = timestamp => !timestamp || new Date(timestamp).getTime() <= Date.now();
export const livePot = competition => Number(competition.potUsd ?? competition.rewardAmount ?? 0);
export const walletLabel = address => address ? `${address.slice(0, 5)}…${address.slice(-5)}` : '—';
export function monogram(label) {
  return String(label || '?').trim().split(/[\s_-]+/).slice(0, 2)
    .map(word => word[0] || '').join('').toUpperCase();
}
