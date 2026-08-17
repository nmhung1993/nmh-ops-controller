export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / Math.pow(1024, index)).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export function formatTemperature(celsius) {
  const value = Number(celsius);
  return Number.isFinite(value) ? `${value.toFixed(1)} °C` : '--';
}

export function formatWatts(watts) {
  const value = Number(watts);
  return Number.isFinite(value) ? `${value.toFixed(value >= 100 ? 0 : 1)} W` : '--';
}

export function formatUptime(seconds, lang = 'vi') {
  const value = Number(seconds || 0);
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (lang === 'vi') {
    return `${days} ngày ${hours} giờ ${minutes} phút`;
  }
  return `${days}d ${hours}h ${minutes}m`;
}

export function formatDateTime(isoString, lang = 'vi') {
  if (!isoString) return '--';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '--';
  return date.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

export function formatRelativeTime(isoString, lang = 'vi') {
  if (!isoString) return lang === 'vi' ? 'Chưa từng' : 'Never';
  const diffSec = Math.floor((Date.now() - Date.parse(isoString)) / 1000);
  if (isNaN(diffSec) || diffSec < 0) return '--';
  if (diffSec < 5) return lang === 'vi' ? 'Vừa xong' : 'Just now';
  if (diffSec < 60) return lang === 'vi' ? `${diffSec} giây trước` : `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return lang === 'vi' ? `${diffMin} phút trước` : `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return lang === 'vi' ? `${diffHours} giờ trước` : `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return lang === 'vi' ? `${diffDays} ngày trước` : `${diffDays}d ago`;
}
