// js/utils.js

export const $ = sel => document.querySelector(sel);
export const $$ = sel => Array.from(document.querySelectorAll(sel));

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;

  // 把 toast 临时挂到最上层的 dialog（如有），确保位于编辑/创建面板之上
  const openDialogs = Array.from(document.querySelectorAll('dialog[open]'));
  const host = openDialogs.length ? openDialogs[openDialogs.length - 1] : document.body;
  if (t.parentElement !== host) host.appendChild(t);

  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1600);
}

export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const uid = () => 't_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
export const fmtDate = d => new Date(d).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function toLocalISOString(date) {
  const pad = (num) => num.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function startOfDay(d) { d = new Date(d); d.setHours(0, 0, 0, 0); return d; }
export function startOfWeek(d) { d = new Date(d); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); return d; }
export function startOfMonth(d) { d = new Date(d); d.setDate(1); d.setHours(0, 0, 0, 0); return d; }
export function startOfYear(d) { d = new Date(d); d.setMonth(0, 1); d.setHours(0, 0, 0, 0); return d; }
export const overlaps = (aStart, aEnd, bStart, bEnd) => Math.max(aStart, bStart) < Math.min(aEnd, bEnd);

// 操作日志记录函数
export function logAction(actionType, details = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: actionType,
    details: details,
  };
  // 每7天一个新文件，文件名基于自 epoch 以来的周数
  const weekId = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7));
  const logFileName = `log_week_${weekId}.json`;
  
  window.electronAPI.appendToLog(logFileName, JSON.stringify(logEntry));
}

// (新) 添加一个全局事件分发函数
export function dispatchDataChanged() {
  document.dispatchEvent(new CustomEvent('datachanged'));
}