const STORAGE_KEY = "parcel-demo-scans";

export function getScans() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addScan(scan) {
  const current = getScans();
  const next = [scan, ...current];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearScans() {
  window.localStorage.removeItem(STORAGE_KEY);
}
