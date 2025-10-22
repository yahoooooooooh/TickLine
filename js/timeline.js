// js/timeline.js
import { $, fmtDate, clamp, startOfDay, overlaps, dispatchDataChanged, toast } from './utils.js';
import { state } from './constants.js';
import { DB, persistSettings } from './store.js';
import { showTaskPopover, openCreateAt, hideTaskPopover, showCustomTooltip, hideCustomTooltip } from './ui.js';

const timeline = $('#timeline');

// 稳定的字符串hash函数，确保相同输入总是产生相同输出
function stableHash(str) {
  let hash = 0;
  if (!str || str.length === 0) return hash;
  
  // 使用简单但稳定的hash算法（类似Java的String.hashCode）
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  
  // 确保返回正数
  return Math.abs(hash);
}

function laneAvailableForDaily(lane, task) {
  const sameDay = DB.list('daily').filter(
    t => startOfDay(new Date(t.start)).getTime() === startOfDay(new Date(task.start)).getTime() && t.id !== task.id
  );
  return !sameDay.some(t => 
    (t.lane || 0) === lane && 
    t.status !== 'completed' && 
    overlaps(+new Date(t.start), +new Date(t.end), +new Date(task.start), +new Date(task.end))
  );
}

// --- START: MODIFICATION (添加分钟级别) ---
function viewMode() {
  const W = timeline.clientWidth || 1024;
  const span = state.msPerPx * W;
  
  // 当视图范围小于等于 1.5 小时，显示5分钟刻度
  if (span <= 1.5 * 60 * 60 * 1000) return 'minute5';
  // 当视图范围小于等于 6 小时，显示15分钟刻度
  if (span <= 6 * 60 * 60 * 1000) return 'minute15';
  // 当视图范围小于等于 48 小时 (2天)，显示小时刻度
  if (span <= 2 * 24 * 60 * 60 * 1000) return 'hour';
  
  if (span <= 120 * 24 * 60 * 60 * 1000) return 'day';
  if (span <= 4 * 365 * 24 * 60 * 60 * 1000) return 'month';
  return 'year';
}

function startAligned(mode, t) {
  const d = new Date(t);
  if (mode === 'minute5') { d.setMinutes(Math.floor(d.getMinutes() / 5) * 5, 0, 0); }
  else if (mode === 'minute15') { d.setMinutes(Math.floor(d.getMinutes() / 15) * 15, 0, 0); }
  else if (mode === 'hour') { d.setMinutes(0, 0, 0); }
  else if (mode === 'day') { d.setHours(0, 0, 0, 0); }
  else if (mode === 'month') { d.setDate(1); d.setHours(0, 0, 0, 0); }
  else { d.setMonth(0, 1); d.setHours(0, 0, 0, 0); }
  return d;
}

function addOne(mode, d) {
  d = new Date(d);
  if (mode === 'minute5') d.setMinutes(d.getMinutes() + 5);
  else if (mode === 'minute15') d.setMinutes(d.getMinutes() + 15);
  else if (mode === 'hour') d.setHours(d.getHours() + 1);
  else if (mode === 'day') d.setDate(d.getDate() + 1);
  else if (mode === 'month') d.setMonth(d.getMonth() + 1, 1);
  else d.setFullYear(d.getFullYear() + 1, 0, 1);
  return d;
}

function labelFor(mode, d) {
  if (mode === 'minute5' || mode === 'minute15') return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (mode === 'hour') return String(d.getHours()).padStart(2, '0') + ':00';
  if (mode === 'day') return `${d.getMonth() + 1}.${d.getDate()}`;
  if (mode === 'month') return `${String(d.getFullYear()).slice(-2)}.${d.getMonth() + 1}`;
  return String(d.getFullYear());
}
// --- END: MODIFICATION ---

const timeToX = t => (t - state.viewportStart) / state.msPerPx;

export function render() {
  timeline.innerHTML = '';
  hideTaskPopover();

  const W = timeline.clientWidth || window.innerWidth;
  const initialH = timeline.clientHeight || window.innerHeight;
  const taskH = 28, gap = 10; // 提前定义任务尺寸常量

  // ===== START: 动态计算并设置时间线高度以容纳所有轨道 =====
  // 1) 获取配置的并行上限
  const simConfigured = DB.meta?.limits?.dailyMaxSimultaneous || 1;

  // 2) 计算当前视窗内“每日任务”实际用到的最大 lane (0-indexed)
  const startMs = +state.viewportStart;
  const endMs   = startMs + W * state.msPerPx;
  const visibleDaily = DB.list('daily').filter(t => {
    const s = +new Date(t.start), e = +new Date(t.end);
    return Math.max(s, startMs) < Math.min(e, endMs);
  });
  const maxLaneUsed = visibleDaily.reduce((m, t) => Math.max(m, t.lane || 0), 0);

  // 3) 确定有效轨道数 (取配置值与实际使用值中的较大者)
  const effectiveSim = Math.max(simConfigured, maxLaneUsed + 1);

  // 4) 计算容纳所有轨道所需的最小高度
  const minTopPadding = 16; // 为最顶部的轨道留出一些空白
  // 计算daily轨道空间
  const dailySpace = (gap + taskH) + (effectiveSim - 1) * (taskH + gap);
  // 计算weekly/monthly/yearly轨道空间（每种类型一个轨道）
  const weeklyLanes = DB.meta.limits.weeklyMaxSimultaneous || 1;
  const weeklySpace = (gap + taskH) + (weeklyLanes - 1) * (taskH + gap);
  const monthlyLanes = DB.meta.limits.monthlyMaxSimultaneous || 1;
  const monthlySpace = (gap + taskH) + (monthlyLanes - 1) * (taskH + gap);
  const yearlyLanes = DB.meta.limits.yearlyUnlocked ? 1 : 0; // yearly暂时固定1轨道
  const yearlySpace = yearlyLanes > 0 ? ((gap + taskH) + (yearlyLanes - 1) * (taskH + gap)) : 0;

  const neededSpaceAboveBase = dailySpace + weeklySpace + monthlySpace + yearlySpace + minTopPadding;
  const neededH = Math.ceil(neededSpaceAboveBase / 0.75); // 因为 baseY 是 75% H

  // 5) 设置容器最小高度
  const finalH = Math.max(initialH, neededH);
  timeline.style.minHeight = finalH + 'px';
  // ===== END: 动态高度计算 =====

  // 使用最终计算出的高度来确定布局
  const H = finalH;
  const baseY = Math.round(H * 0.75);


  const base = document.createElement('div');
  base.className = 'baseline';
  base.style.top = baseY + 'px';
  timeline.appendChild(base);

  // --- (这是上一次修复的核心逻辑，保持不变) ---
  const mode = viewMode();
  let t = startAligned(mode, state.viewportStart);
  const MIN_LABEL_SPACING_PX = 70;
  let lastLabelX = -Infinity;

  for (let i = 0; i < 500; i++) {
    const x = Math.round(timeToX(+t));
    
    if (x < -200) {
      t = addOne(mode, t);
      continue;
    }
    if (x > W + 200) break;
    
    if (x - lastLabelX < MIN_LABEL_SPACING_PX) {
      const ln = document.createElement('div');
      ln.className = 'tick-line minor';
      ln.style.left = x + 'px';
      timeline.appendChild(ln);
      t = addOne(mode, t); 
      continue;
    }
    
    lastLabelX = x;
    const lab = document.createElement('div');
    lab.className = 'tick-label';
    lab.style.left = x + 'px';
    lab.textContent = labelFor(mode, t);
    timeline.appendChild(lab);

    const ln = document.createElement('div');
    ln.className = 'tick-line';
    ln.style.left = x + 'px';
    timeline.appendChild(ln);

    t = addOne(mode, t);
  }

  // ===== 注意: 此处的 taskH 和 gap 已被移至函数开头 =====
  function yFor(type, lane) {
    let y = baseY - gap - taskH;
    if (type === 'daily') return y - (lane || 0) * (taskH + gap);
    
    // 动态计算：所有daily轨道的总高度
    const dailyLanes = DB.meta?.limits?.dailyMaxSimultaneous || 1;
    y -= dailyLanes * (taskH + gap);
    
    if (type === 'weekly') return y - (lane || 0) * (taskH + gap);
    
    const weeklyLanes = DB.meta?.limits?.weeklyMaxSimultaneous || 1;
    y -= weeklyLanes * (taskH + gap);
    
    if (type === 'monthly') return y - (lane || 0) * (taskH + gap);
    
    const monthlyLanes = DB.meta?.limits?.monthlyMaxSimultaneous || 1;
    y -= monthlyLanes * (taskH + gap);
    
    return y - (lane || 0) * (taskH + gap); // yearly
  }

  function placeTask(t) {
    const s = new Date(t.start), e = new Date(t.end);
    const startMs = +state.viewportStart, endMs = startMs + W * state.msPerPx;
    if (Math.max(+s, startMs) >= Math.min(+e, endMs)) return;

    const left = Math.max(0, Math.round((Math.max(+s, startMs) - startMs) / state.msPerPx));
    const right = Math.min(W, Math.round((Math.min(+e, endMs) - startMs) / state.msPerPx));
    const width = Math.max(2, right - left);

    const el = document.createElement('div');
    let taskClasses = `task ${t.type}`;
    
    const isCompleted = t.status === 'completed';
    if (isCompleted) {
      taskClasses += ' completed sunken';
    }
    
    if (width < 50) {
      taskClasses += ' text-hidden';
    }
    el.className = taskClasses;

    el.style.left = left + 'px';
    
    if (isCompleted) {
      const hash = stableHash(t.id);
      const sinkDepth = 40 + (hash % 80);
      const driftX = -10 + (hash % 20);
      el.style.top = (baseY + sinkDepth) + 'px';
      el.style.transform = `translateX(${driftX}px)`; // 移除了 rotate()
      el.style.zIndex = Math.floor(-sinkDepth);
    } else {
      el.style.top = yFor(t.type, t.lane || 0) + 'px';
    }
    
    el.style.width = width + 'px';
    el.addEventListener('mouseenter', (e) => {
      const tooltipText = `${t.name}\n${fmtDate(t.start)} - ${fmtDate(t.end)}`;
      showCustomTooltip(tooltipText, e);
    });
    el.addEventListener('mouseleave', hideCustomTooltip);
    
    let iconHTML = '';
    if (isCompleted) {
      iconHTML = `<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
    }
    let stageBadge = '';
    // --- START: MODIFICATION ---
    // 在数组中加入 'daily'，让每日任务也显示阶段进度
    if (!isCompleted && ['daily', 'weekly','monthly','yearly'].includes(t.type) && t.stages?.length) {
    // --- END: MODIFICATION ---
      const total = t.stages.length, pg = t.stageProgress || 0;
      stageBadge = `<span style="margin-left:6px; font-size:11px; font-weight:700; color:var(--text-light)">${pg}/${total}</span>`;
    }
    el.innerHTML = `${iconHTML}<span class="task-name">${t.name}</span>${stageBadge}`;
    
    if (!isCompleted) {
      el.addEventListener('click', ev => { ev.stopPropagation(); showTaskPopover(t, el); });
      
      if (t.type === 'daily') {
        el.addEventListener('mousedown', e => {
          if (e.button !== 0) return;
          e.stopPropagation();
          const H = timeline.clientHeight || window.innerHeight;
          const baseY = Math.round(H * 0.75);
          const taskH = 28, gap = 10;
          const startLane = t.lane || 0;
          const startY = e.clientY;
          let moved = false;

          const onMove = (ev) => {
            const dy = ev.clientY - startY;
            if (!moved && Math.abs(dy) < 4) return;
            if (!moved) {
              moved = true;
              el.classList.add('dragging');
            }
            const deltaLanes = Math.round(dy / (taskH + gap));
            const sim = DB.meta?.limits?.dailyMaxSimultaneous || 1;
            const targetLane = clamp(startLane + deltaLanes, 0, sim - 1);
            const top = baseY - gap - taskH - targetLane * (taskH + gap);
            el.style.top = top + 'px';
          };

          const onUp = (ev) => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (moved) el.classList.remove('dragging');

            if (!moved) return;

            const dy = ev.clientY - startY;
            const deltaLanes = Math.round(dy / (taskH + gap));
            const sim = DB.meta?.limits?.dailyMaxSimultaneous || 1;
            const targetLane = clamp(startLane + deltaLanes, 0, sim - 1);

            if (targetLane === startLane) { return; }

            if (laneAvailableForDaily(targetLane, t)) {
              const updated = { ...t, lane: targetLane };
              DB.update(updated);
              toast(`已移动到轨道 ${targetLane + 1}`);
              dispatchDataChanged();
            } else {
              toast('目标轨道已占用');
              dispatchDataChanged();
            }
          };

          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        });
      }
    }
    
    timeline.appendChild(el);
  }

  ['daily', 'weekly', 'monthly', 'yearly'].forEach(tp => {
    if (tp === 'yearly' && !DB.meta.limits.yearlyUnlocked) return;
    DB.list(tp).forEach(placeTask);
  });
}

function onWheel(e) {
  e.preventDefault();
  const W = timeline.clientWidth || window.innerWidth;
  const mouseRatio = e.offsetX / W;
  const worldAtCursor = +state.viewportStart + state.msPerPx * e.offsetX;
  const factor = Math.exp(-e.deltaY * 0.0015);
  const min = 100, max = (365 * 24 * 60 * 60 * 1000 * 10) / W;
  state.msPerPx = clamp(state.msPerPx / factor, min, max);
  state.viewportStart = new Date(worldAtCursor - state.msPerPx * mouseRatio * W);
  persistSettings();
  render();
}

export function setupTimelineInteractions() {
  timeline.addEventListener('wheel', onWheel, { passive: false });

  let dragging = false, sx = 0, startMs = 0;
  timeline.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    sx = e.clientX;
    startMs = +state.viewportStart;
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - sx;
    state.viewportStart = new Date(startMs - dx * state.msPerPx);
    render();
  });
  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      persistSettings();
    }
  });

  timeline.addEventListener('click', e => {
    if (e.target !== timeline) return;
    const H = timeline.clientHeight || window.innerHeight;
    const baseY = Math.round(H * 0.75);
    const dy = Math.abs(e.offsetY - baseY);
    if (dy > 16) return;
    const t = +state.viewportStart + state.msPerPx * e.offsetX;
    openCreateAt(new Date(t));
  });

  timeline.addEventListener('mousemove', e => {
    const H = timeline.clientHeight || window.innerHeight;
    const baseY = Math.round(H * 0.75);
    const dy = Math.abs(e.offsetY - baseY);
    timeline.style.cursor = dy <= 16 ? 'crosshair' : 'grab';
  });
}