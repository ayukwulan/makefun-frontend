export const esc = value => String(value ?? "").replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
export const ended = stamp => !stamp || new Date(stamp).getTime() <= Date.now();
export const pot = item => Number(item.potUsd ?? item.rewardAmount ?? 0);
export const short = address => address ? address.slice(0, 5) + "…" + address.slice(-5) : "—";
export const initials = name => String(name || "?").trim().split(/[\s_-]+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
export function money(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: amount % 1 ? 2 : 0 });
}
export const date = stamp => stamp ? new Date(stamp).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "—";
export function left(stamp) {
  const remaining = new Date(stamp).getTime() - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return "Ended";
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  if (days) return `${days}d ${hours}h left`;
  return hours ? `${hours}h ${minutes}m left` : `${minutes}m left`;
}
