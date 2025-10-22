// js/ui.js
import { $, $$, toast, uid, fmtDate, toLocalISOString, overlaps, startOfDay, startOfWeek, startOfMonth, startOfYear, logAction, dispatchDataChanged } from './utils.js';
import { state } from './constants.js';
import { DB } from './store.js';
import { renderShop, redeemCode, checkAchievements, applyUnlockedRewards, renderRewardsTrack, generateAndSaveRedemptionData, showTreasureChest } from './rewards.js';
import { getChecklistState, addOrUpdateChecklistItem, completeChecklistItem, deleteChecklistItem, reorderChecklistItems } from './checklist.js';
import { consumeAP, getAPStatus, advanceStageIfPossible } from './actionPower.js';
// --- START: 新增的导入 ---
import { startSleep, TIMES } from './sleep.js'; // 引入 TIMES
// --- END: 新增的导入 ---

// --- START: 添加的代码 ---
const customTooltip = $('#customTooltip');

/**
 * 显示自定义工具提示。
 * @param {string} text - 要显示的文本。
 * @param {MouseEvent} event - 用于定位的鼠标事件。
 */
export function showCustomTooltip(text, event) {
    if (!customTooltip) return;
    
    customTooltip.textContent = text;
    customTooltip.classList.add('visible');

    // 延迟一帧以确保浏览器已计算出工具提示的尺寸
    requestAnimationFrame(() => {
        const offsetX = 10;
        const offsetY = 15;
        let left = event.clientX + offsetX;
        let top = event.clientY + offsetY;
        
        const rect = customTooltip.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // 如果超出右边界，则翻转到左侧
        if (left + rect.width > vw - 10) {
            left = event.clientX - rect.width - offsetX;
        }
        // 如果超出下边界，则翻转到上方
        if (top + rect.height > vh - 10) {
            top = event.clientY - rect.height - offsetY;
        }

        customTooltip.style.left = `${left}px`;
        customTooltip.style.top = `${top}px`;
    });
}

/**
 * 隐藏自定义工具提示。
 */
export function hideCustomTooltip() {
    if (!customTooltip) return;
    customTooltip.classList.remove('visible');
}
// --- END: 添加的代码 ---

// --- START: 新增的动画关闭辅助函数 ---
/**
 * 为 dialog 元素添加渐隐动画并关闭它。
 * @param {HTMLDialogElement} dialog - The dialog element to close.
 */
function closeDialogWithAnimation(dialog) {
    if (!dialog) return;

    dialog.classList.add('closing');

    dialog.addEventListener('transitionend', () => {
        dialog.classList.remove('closing');
        dialog.close();
    }, { once: true }); // 'once: true' 确保事件监听器在触发后自动移除
}
// --- END: 新增的动画关闭辅助函数 ---

// =========================
// START PATCH: 阶段多段描述编辑器
// =========================
function renderStageNotesEditor(taskDraft) {
  const c = $('#stageNotesContainer');
  if (!c) return;
  c.innerHTML = '';

  const stages = taskDraft?.stages || [];
  stages.forEach((stg, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'stage-notes__item';
    wrap.innerHTML = `
      <div class="stage-notes__item-title">${stg.title || `阶段 ${i + 1}`}</div>
      <textarea data-stage-note="${i}" rows="3" placeholder="这一阶段要做什么？">${stg.note || ''}</textarea>
    `;
    c.appendChild(wrap);
  });
}
// =======================
// END PATCH
// =======================

const checklistContainer = $('#checklistContainer');
const checklistItemsEl = $('#checklistItems');
const checklistAddBtn = $('#checklistAddBtn');
const checklistLimitEl = $('#checklistLimit');
const checklistItemModal = $('#checklistItemModal');
const checklistItemTitle = $('#checklistItemTitle');
const checklistItemContent = $('#checklistItemContent');
const checklistItemDeleteBtn = $('#checklistItemDeleteBtn');
let editingChecklistItem = null;

const taskModal = $('#taskModal'), taskType = $('#taskType'), taskName = $('#taskName'), taskStart = $('#taskStart'), taskEnd = $('#taskEnd'), taskDesc = $('#taskDesc'), taskDeleteBtn = $('#taskDeleteBtn'), taskRuleHelp = $('#taskRuleHelp');
const reportModal = $('#reportModal'), reportSegments = $('#reportSegments');
const taskPopover = $('#taskPopover');

function openChecklistEditor(item = null) {
    editingChecklistItem = item;
    if (item) {
        $('#checklistItemModalTitle').textContent = '编辑事项';
        checklistItemTitle.value = item.title;
        checklistItemContent.value = item.content || '';
        checklistItemDeleteBtn.style.display = 'inline-block';
    } else {
        $('#checklistItemModalTitle').textContent = '新建事项';
        checklistItemTitle.value = '';
        checklistItemContent.value = '';
        checklistItemDeleteBtn.style.display = 'none';
    }
    checklistItemModal.showModal();
}

function saveChecklistItem() {
    const title = checklistItemTitle.value.trim();
    if (!title) {
        toast('标题不能为空');
        return;
    }
    const data = {
        id: editingChecklistItem ? editingChecklistItem.id : null,
        title,
        content: checklistItemContent.value.trim(),
    };
    addOrUpdateChecklistItem(data);
    closeDialogWithAnimation(checklistItemModal); // [修改]
}

export function renderChecklist() {
    const state = getChecklistState();
    
    checklistItemsEl.innerHTML = '';
    
    // 用于存储当前拖拽的元素
    let draggedItem = null;

    state.visibleItems.forEach(item => {
        const itemEl = document.createElement('li');
        itemEl.className = 'checklist-item';
        itemEl.setAttribute('draggable', 'true'); // 1. 使整个列表项可拖动
        itemEl.dataset.itemId = item.id; // 存储ID以便于识别

        // 2. 添加拖拽把手和主要内容
        itemEl.innerHTML = `
            <div class="checklist-drag-handle" title="拖动排序">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 19a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm-4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm8 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm-4-6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm-8 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm4-6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm-4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm8 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>
            </div>
            <div class="checklist-item-text">
                <div class="title">${item.title}</div>
                ${item.content ? `<div class="content">${item.content}</div>` : ''}
            </div>
            <button class="checklist-complete-btn" title="完成"></button>
        `;
        
        // --- 3. 添加拖放事件监听器 ---

        // 开始拖动
        itemEl.addEventListener('dragstart', (e) => {
            // 阻止点击事件冒泡
            e.stopPropagation();
            draggedItem = itemEl;
            // 使用 setTimeout 确保浏览器有时间渲染拖动时的样式
            setTimeout(() => itemEl.classList.add('dragging'), 0);
        });

        // 拖动结束 (无论成功与否)
        itemEl.addEventListener('dragend', (e) => {
            e.stopPropagation();
            if (draggedItem) {
                draggedItem.classList.remove('dragging');
                draggedItem = null;
            }
        });

        // 拖动经过其他元素
        itemEl.addEventListener('dragover', (e) => {
            e.preventDefault(); // 必须阻止默认行为才能触发 drop 事件
            e.stopPropagation();
            if (itemEl !== draggedItem) {
                itemEl.classList.add('drag-over');
            }
        });
        
        // 拖动离开其他元素
        itemEl.addEventListener('dragleave', (e) => {
            e.stopPropagation();
            itemEl.classList.remove('drag-over');
        });

        // 成功放置
        itemEl.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            itemEl.classList.remove('drag-over');
            
            if (itemEl !== draggedItem) {
                // 获取所有可见项的当前DOM顺序
                const allItems = [...checklistItemsEl.children];
                const fromIndex = allItems.indexOf(draggedItem);
                const toIndex = allItems.indexOf(itemEl);

                // 重新排序DOM元素以提供即时反馈
                if (fromIndex < toIndex) {
                    checklistItemsEl.insertBefore(draggedItem, itemEl.nextSibling);
                } else {
                    checklistItemsEl.insertBefore(draggedItem, itemEl);
                }

                // 从新的DOM顺序中提取ID，并调用数据层进行更新
                const newOrderIds = [...checklistItemsEl.children].map(li => li.dataset.itemId);
                reorderChecklistItems(newOrderIds); // 调用 checklist.js 中的新函数
            }
        });


        // --- 原有事件监听器保持不变 ---
        itemEl.querySelector('.checklist-complete-btn').onclick = (e) => {
            e.stopPropagation();
            completeChecklistItem(item.id);
        };
        // 避免拖拽把手触发编辑
        itemEl.querySelector('.checklist-item-text').onclick = () => openChecklistEditor(item);
        
        checklistItemsEl.appendChild(itemEl);
    });
    
    checklistLimitEl.textContent = `${state.items.length}/${state.limit}`;
    checklistAddBtn.style.display = state.canAdd ? 'flex' : 'none';
}

// --- Popover ---
export function hideTaskPopover() {
  if (taskPopover) taskPopover.classList.remove('visible'); // [修改]
  state.popoverTask = null;
}

export function showTaskPopover(task, el) {
  state.popoverTask = task;
  $('#popoverTitle').textContent = task.name;
  $('#popoverTime').textContent = `${fmtDate(task.start)} - ${fmtDate(task.end)}`;
  
  // =========================
  // START PATCH: 锁定阶段 → 展示当前阶段的描述
  // =========================
  const descEl = $('#popoverDesc');
  let desc = task.description || '无描述。';
  if (task.stagesLocked && Array.isArray(task.stages) && task.stages.length) {
    const idx = task.stageProgress || 0;
    if (idx < task.stages.length) {
      const stg = task.stages[idx];
      desc = (stg.note && stg.note.trim()) ? stg.note : (stg.title || `阶段 ${idx + 1}`);
    } else {
      desc = '阶段全部完成，可提交。';
    }
  }
  descEl.textContent = desc;
  // =========================
  // END PATCH
  // =========================
  
  try {
    const ap = getAPStatus();
    const apEl = $('#popoverAP');
    if (apEl) apEl.textContent = `AP ${ap.current}/${ap.cap}`;
  } catch { /* 安静兜底 */ }
  
  // 修复：为 el 增加兜底锚点；已打开时沿用上次位置，否则居中
  const existing = taskPopover.getBoundingClientRect?.();
  let anchorTop, anchorLeft;
  
  // 1) 有传入元素：使用元素矩形
  if (el && typeof el.getBoundingClientRect === 'function') {
    const rect = el.getBoundingClientRect();
    anchorTop = rect.top;
    anchorLeft = rect.left + rect.width / 2;
  } else {
    // 2) 没有元素：若弹窗已可见，用上次位置；否则居中
    if (taskPopover.classList.contains('visible') && existing) {
      anchorTop = existing.top;
      anchorLeft = existing.left + existing.width / 2;
    } else {
      anchorTop = window.innerHeight * 0.4;
      anchorLeft = window.innerWidth / 2;
    }
  }
  
  const popoverHeight = taskPopover.offsetHeight || 150;
  const desiredTop = Math.max(12, anchorTop - popoverHeight - 8);
  const desiredLeft = Math.max(12, anchorLeft - 140);
  
  taskPopover.style.top = `${desiredTop}px`;
  taskPopover.style.left = `${desiredLeft}px`;
  taskPopover.classList.add('visible'); // [修改]
  
  const isCompleted = task.status === 'completed';
  $('#popoverComplete').style.display = isCompleted ? 'none' : 'inline-block';
  $('#popoverEdit').style.display = isCompleted ? 'none' : 'inline-block';
  
  // --- START: MODIFICATION ---
  // 阶段推进：对所有未完成的任务都显示
  const stageBtn = $('#popoverAdvanceStage');
  if (!isCompleted) {
    stageBtn.style.display = 'inline-block';
    const total = (task.stages?.length || 0);
    const pg = task.stageProgress || 0;
    $('#popoverStageInfo').textContent = total ? `阶段 ${pg}/${total}` : '未配置阶段';
  } else {
    stageBtn.style.display = 'none';
    $('#popoverStageInfo').textContent = '';
  }
  // --- END: MODIFICATION ---
}

// --- Task Editor ---
const ruleTexts = {
  daily: '提示：每日任务。', weekly: '提示：每周任务。', monthly: '提示：每月任务。', yearly: '提示：每年任务。'
};

// --- START: MODIFICATION ---
// 简化：不再需要根据任务类型切换字段，此函数仅根据“阶段是否锁定”来切换
function updateStageEditorVisibility() {
  const locked = !!window.__taskDraftStagesLocked;
  
  const rowStageCount = document.querySelector('#taskStageCount')?.closest('.field');
  const rowStageCost  = document.querySelector('#taskStageCost')?.closest('.row');
  const rowConfirm    = document.querySelector('#confirmStagesBtn')?.closest('.row');
  const notesBox = $('#stageNotesContainer');
  const descWrap = $('#taskDesc')?.parentElement;

  if (locked) {
      // 如果阶段已锁定，隐藏输入和确认按钮，显示多段描述编辑器
      if (rowStageCount) rowStageCount.style.display = 'none';
      if (rowStageCost)  rowStageCost.style.display  = 'none';
      if (rowConfirm)    rowConfirm.style.display    = 'none';
      if (notesBox) notesBox.style.display = 'block';
      if (descWrap) descWrap.style.display = 'none';
  } else {
      // 如果未锁定，显示输入和确认按钮，隐藏多段描述编辑器
      if (rowStageCount) rowStageCount.style.display = '';
      if (rowStageCost)  rowStageCost.style.display  = '';
      if (rowConfirm)    rowConfirm.style.display    = '';
      if (notesBox) { notesBox.style.display = 'none'; notesBox.innerHTML = ''; }
      if (descWrap) descWrap.style.display = 'block';
  }
}
// --- END: MODIFICATION ---


function permissibleWithinBounds(type, start, end) {
  return true;
}

function autoAssignLaneForDaily(start, end, excludeId) {
  const same = DB.list('daily').filter(t => startOfDay(new Date(t.start)).getTime() === startOfDay(start).getTime() && t.id !== excludeId);
  const sim = DB.meta.limits.dailyMaxSimultaneous;
  for (let lane = 0; lane < sim; lane++) {
    const laneTasks = same.filter(t => (t.lane || 0) === lane);
    const conflict = laneTasks.some(t => overlaps(+new Date(t.start), +new Date(t.end), +start, +end) && t.status !== 'completed');
    if (!conflict) return lane;
  }
  return -1;
}

function autoAssignLane(type, start, end, excludeId) {
  if (type === 'daily') {
    return autoAssignLaneForDaily(start, end, excludeId);
  }
  
  // 确定时间范围函数
  const getTimeRange = (t) => {
    if (type === 'weekly') return startOfWeek(new Date(t)).getTime();
    if (type === 'monthly') return startOfMonth(new Date(t)).getTime();
    if (type === 'yearly') return startOfYear(new Date(t)).getTime();
    return t;
  };
  
  // 获取同周期的任务
  const rangeStart = getTimeRange(start);
  const samePeriod = DB.list(type).filter(t => {
    return getTimeRange(new Date(t.start)) === rangeStart && t.id !== excludeId;
  });
  
  // 获取并行上限
  const simKey = `${type}MaxSimultaneous`;
  const sim = DB.meta.limits[simKey] || 1;
  
  // 尝试分配到每条轨道
  for (let lane = 0; lane < sim; lane++) {
    const laneTasks = samePeriod.filter(t => (t.lane || 0) === lane);
    const conflict = laneTasks.some(t => 
      overlaps(+new Date(t.start), +new Date(t.end), +start, +end) && t.status !== 'completed'
    );
    if (!conflict) return lane;
  }
  
  return -1; // 无可用轨道
}

function canCreateByQuota(type, start, end, editingTask) {
    const L = DB.meta.limits;
    const list = DB.list(type).filter(t => !editingTask || t.id !== editingTask.id);
    const within = list.filter(t => {
        const s = new Date(t.start);
        if (type === 'daily') return startOfDay(s).getTime() === startOfDay(start).getTime();
        if (type === 'weekly') return startOfWeek(s).getTime() === startOfWeek(start).getTime();
        if (type === 'monthly') return startOfMonth(s).getTime() === startOfMonth(start).getTime();
        if (type === 'yearly') return startOfYear(s).getTime() === startOfYear(start).getTime();
    });
    if (type === 'daily' && within.length >= L.dailyMaxPerDay) return [false, `该日已建立 ${within.length}/${L.dailyMaxPerDay}`];
    if (type === 'weekly' && within.length >= L.weeklyMaxPerWeek) return [false, `该周已建立 ${within.length}/${L.weeklyMaxPerWeek}`];
    if (type === 'monthly' && within.length >= L.monthlyMaxPerMonth) return [false, `该月已建立 ${within.length}/${L.monthlyMaxPerMonth}`];
    if (type === 'yearly' && !L.yearlyUnlocked) return [false, '未解锁年任务'];
    if (type === 'yearly' && within.length >= L.yearlyMaxPerYear) return [false, `该年已建立 ${within.length}/${L.yearlyMaxPerYear}`];
    if (type === 'daily') { if (autoAssignLaneForDaily(start, end, editingTask ? editingTask.id : null) === -1) return [false, `每日并行任务已达上限 ${L.dailyMaxSimultaneous}`]; }
    // 统一检查：使用autoAssignLane
    if (['weekly', 'monthly', 'yearly'].includes(type)) {
        if (autoAssignLane(type, start, end, editingTask ? editingTask.id : null) === -1) {
            const simKey = `${type}MaxSimultaneous`;
            const typeNames = { weekly: '周', monthly: '月', yearly: '年' };
            return [false, `${typeNames[type]}任务并行上限 ${L[simKey]}`];
        }
    }
    return [true, ''];
}

export function openCreateAt(ts) {
    state.editingTask = null;
    
    // 重置会话草稿，避免上次残留
    window.__taskDraftStages = undefined;
    window.__taskDraftStagesLocked = false;
    
    // 还原控件的禁用/显隐状态
    $('#taskStageCount').disabled = false;
    $('#taskStageCost').disabled = false;
    const notesBox = $('#stageNotesContainer');
    if (notesBox) {
        notesBox.classList.add('stage-notes'); // 确保样式类
        notesBox.style.display = 'none';
        notesBox.innerHTML = '';
    }
    const descWrap = $('#taskDesc')?.parentElement;
    if (descWrap) descWrap.style.display = 'block';
    
    // === 新增：复位被隐藏的行（新建时需要显示） ===
    [['#taskStageCount', '.field'], ['#taskStageCost', '.row'], ['#confirmStagesBtn', '.row']].forEach(([sel, scope]) => {
      const row = document.querySelector(sel)?.closest(scope);
      if (row) row.style.display = '';
    });
    // === 新增：复位"类型/名称"可编辑与可见 ===
    if (taskType) {
      taskType.disabled = false;
      const f = taskType.closest('.field'); if (f) f.style.display = '';
    }
    if (taskName) {
      taskName.disabled = false;
      const f = taskName.closest('.field'); if (f) f.style.display = '';
    }

    $('#taskModalTitle').textContent = '新建任务';
    taskType.value = 'daily';
    taskName.value = '';
    const s = new Date(ts);
    let dur = 2 * 60 * 60 * 1000;
    taskStart.value = toLocalISOString(s);
    taskEnd.value = toLocalISOString(new Date(+s + dur));
    taskDesc.value = '';
    taskDeleteBtn.style.display = 'none';
    taskRuleHelp.textContent = ruleTexts[taskType.value];
    taskModal.showModal();
    updateStageEditorVisibility(); // [修改] 使用新的通用函数
}

function openTaskEditor(task) {
  state.editingTask = task;  // 确保指向当前任务

  // 1) 重置会话草稿，避免上次残留
  window.__taskDraftStages = undefined;
  window.__taskDraftStagesLocked = undefined; // [修改] 使用 undefined

  // 2) 还原控件的禁用/显隐状态
  $('#taskStageCount').disabled = false;
  $('#taskStageCost').disabled = false;
  const notesBox = $('#stageNotesContainer');
  if (notesBox) {
    notesBox.classList.add('stage-notes'); // 确保样式类
    notesBox.style.display = 'none';
    notesBox.innerHTML = '';
  }
  const descWrap = $('#taskDesc')?.parentElement;
  if (descWrap) descWrap.style.display = 'block';

  // 3) 用当前任务填充表单
  $('#taskModalTitle').textContent = '编辑任务';
  taskType.value = task.type || 'daily';
  taskName.value = task.name || '';
  taskStart.value = toLocalISOString(new Date(task.start)).slice(0,16);
  taskEnd.value = toLocalISOString(new Date(task.end)).slice(0,16);
  taskDesc.value = task.description || '';
  taskDeleteBtn.style.display = 'block';
  taskRuleHelp.textContent = ruleTexts[task.type];

  // 4) 按任务恢复阶段配置与锁定状态 (对所有类型都适用)
  const count = task.stages?.length || 0;
  $('#taskStageCount').value = String(count);
  $('#taskStageCost').value = String(task.stages?.[0]?.cost ?? 1);

  if (task.stagesLocked && count > 0) {
    // 锁定状态：禁用输入，显示多段描述
    $('#taskStageCount').disabled = true;
    $('#taskStageCost').disabled = true;

    window.__taskDraftStages = JSON.parse(JSON.stringify(task.stages)); // 深拷贝草稿
    window.__taskDraftStagesLocked = true;

    notesBox.style.display = 'block';
    renderStageNotesEditor({ stages: window.__taskDraftStages });

    if (descWrap) descWrap.style.display = 'none';

    const stageCountField = document.querySelector('#taskStageCount')?.closest('.field');
    const rowStageCostAndHelp = document.querySelector('#taskStageCost')?.closest('.row');
    const rowConfirm = document.querySelector('#confirmStagesBtn')?.closest('.row');
    if (stageCountField) stageCountField.style.display = 'none';
    if (rowStageCostAndHelp) rowStageCostAndHelp.style.display = 'none';
    if (rowConfirm) rowConfirm.style.display = 'none';
  }

  // === 新增：任务建立以后"类型 / 名字"不可修改并隐藏 ===
  if (state.editingTask) {
    if (taskType) {
      taskType.disabled = true;
      const f = taskType.closest('.field'); if (f) f.style.display = 'none';
    }
    if (taskName) {
      taskName.disabled = true;
      const f = taskName.closest('.field'); if (f) f.style.display = 'none';
    }
  }

  // 5) 打开 Modal
  taskModal.showModal();
  updateStageEditorVisibility(); // [修改] 使用新的通用函数
}

function saveTask() {
    // === 修改：编辑状态下强制沿用原始类型与名称 ===
    let type = taskType.value;
    if (type === 'yearly' && !DB.meta.limits.yearlyUnlocked) { toast('尚未解锁年任务'); return; }
    const start = new Date(taskStart.value), end = new Date(taskEnd.value);
    
    if (!(start < end)) { toast('结束时间必须晚于开始时间'); return; }
    if (!permissibleWithinBounds(type, start, end)) { toast('任务违反了不可跨越属性'); return; }

    const [ok, reason] = canCreateByQuota(type, start, end, state.editingTask);
    if (!ok) { toast(reason); return; }

    // 读取"阶段"基础输入
    const stageCountInput = $('#taskStageCount');
    const stageCostInput  = $('#taskStageCost');
    const stageCount = stageCountInput ? Math.max(0, parseInt(stageCountInput.value || '0', 10)) : 0;
    
    // START: MODIFICATION - Handle float cost and clamp between 0.1 and 3
    let stageCost = stageCostInput ? parseFloat(stageCostInput.value || '1') : 1;
    if (isNaN(stageCost) || stageCost <= 0) {
        stageCost = 1; // 如果输入无效或小于等于0，则默认为1
    }
    stageCost = Math.max(0.1, Math.min(3, stageCost)); // 强制约束在 0.1 到 3 之间
    // END: MODIFICATION

    // --- START: MODIFICATION ---
    // 所有任务都必须有阶段
    if (!window.__taskDraftStagesLocked && stageCount === 0) {
        toast('所有任务都必须至少有一个阶段。');
        return;
    }
    // --- END: MODIFICATION ---

    const stagesLocked = !!window.__taskDraftStagesLocked;
    let stages = window.__taskDraftStages
      || (stageCount > 0
          ? Array.from({ length: stageCount }).map((_, i) => ({ title: `阶段 ${i + 1}`, cost: stageCost }))
          : undefined);

    if (stagesLocked && stages && stages.length) {
      // 收集每个阶段的 note
      const notes = Array.from(document.querySelectorAll('[data-stage-note]'));
      notes.forEach(el => {
        const idx = parseInt(el.getAttribute('data-stage-note'), 10);
        if (stages[idx]) stages[idx].note = el.value || '';
      });
    }

    // 名称在编辑态不可变更
    let finalName = taskName.value || '[未命名]';
    if (state.editingTask) {
      type = state.editingTask.type;          // 覆盖提交类型为原值
      finalName = state.editingTask.name;     // 覆盖提交名称为原值
    }
    const taskData = { 
        name: finalName, 
        start: start.toISOString(), 
        end: end.toISOString(), 
        description: stagesLocked ? (taskDesc.value || '') : (taskDesc.value)
    };
    
    // --- START: MODIFICATION ---
    // 统一为所有任务添加阶段数据
    if (stages && stages.length > 0) {
      taskData.stages = stages;
      if (typeof (state.editingTask?.stageProgress) !== 'number') {
        taskData.stageProgress = 0;
      }
    } else {
      delete taskData.stages;
      delete taskData.stageProgress;
    }
    if (stagesLocked) taskData.stagesLocked = true;
    // --- END: MODIFICATION ---

    if (state.editingTask) {
        const originalTask = state.editingTask;
        const updatedTask = { ...originalTask, ...taskData, type }; // 这里的 type 已在上方被锁回原值
        const assignedLane = autoAssignLane(type, start, end, originalTask.id);
        if (assignedLane !== -1) {
          updatedTask.lane = assignedLane;
        } else {
          delete updatedTask.lane;
        }
        
        if (originalTask.type !== type) { DB.remove(originalTask); DB.add(updatedTask); } 
        else { DB.update(updatedTask); }
        
        const m = DB.meta;
        m.achievements.stats.totalTaskUpdates = (m.achievements.stats.totalTaskUpdates || 0) + 1;
        DB.meta = m;

        logAction('task_update', { id: updatedTask.id, name: updatedTask.name });
        checkAchievements('task_update', { task: updatedTask });
        toast('已保存');
    } else {
        const newTask = { id: uid(), type, ...taskData, status: 'active', reports: [], createdAt: new Date().toISOString() };
        const assignedLane = autoAssignLane(type, start, end, null);
        if (assignedLane !== -1) {
          newTask.lane = assignedLane;
        }
        DB.add(newTask);
        logAction('task_create', { id: newTask.id, name: newTask.name, type: newTask.type });
        checkAchievements('task_create', { task: newTask });
        toast('已创建');
    }
    closeDialogWithAnimation(taskModal); // [修改]
    dispatchDataChanged();
    
    window.__taskDraftStages = undefined;
    window.__taskDraftStagesLocked = false;
}

function closeTaskEditor() {
  window.__taskDraftStages = undefined;
  window.__taskDraftStagesLocked = false;

  $('#taskStageCount').disabled = false;
  $('#taskStageCost').disabled = false;
  const notesBox = $('#stageNotesContainer');
  if (notesBox) {
    notesBox.style.display = 'none';
    notesBox.innerHTML = '';
  }
  const descWrap = $('#taskDesc')?.parentElement;
  if (descWrap) descWrap.style.display = 'block';

  [['#taskStageCount', '.field'], ['#taskStageCost', '.row'], ['#confirmStagesBtn', '.row']].forEach(([sel, scope]) => {
    const row = document.querySelector(sel)?.closest(scope);
    if (row) row.style.display = '';
  });
  if (taskType) {
    taskType.disabled = false;
    const f = taskType.closest('.field'); if (f) f.style.display = '';
  }
  if (taskName) {
    taskName.disabled = false;
    const f = taskName.closest('.field'); if (f) f.style.display = '';
  }
}

// --- Report ---
function openReport(task) {
    state.reportingTask = task;
    reportSegments.innerHTML = '';
    (task.reports && task.reports.length ? task.reports : ['']).forEach(addSeg);
    reportModal.showModal();
}

const addSeg = val => {
    const seg = document.createElement('div');
    seg.className = 'field';
    seg.innerHTML = `<div style="display:flex; align-items: flex-start; gap:8px;"><textarea rows="3" style="flex:1;" placeholder="记录你的完成情况…">${val || ''}</textarea><button class="btn danger" type="button">移除</button></div>`;
    seg.querySelector('button').onclick = () => seg.remove();
    reportSegments.appendChild(seg);
};

async function submitReport() {
    const task = state.reportingTask;
    if (!task) return;

    const segs = Array.from(reportSegments.querySelectorAll('textarea')).map(t => t.value.trim()).filter(Boolean);
    
    // --- START: MODIFICATION ---
    // 统一逻辑：所有任务都必须完成所有阶段才能提交
    const total = task.stages?.length || 0;
    const pg = task.stageProgress || 0;
    
    // 如果任务有配置阶段，但阶段尚未全部完成
    if (total > 0 && pg < total) {
      toast('请先完成所有阶段，再提交任务');
      return;
    }
    
    // 如果任务没有配置阶段（例如，非常老的历史数据），则按默认成本1扣除
    const cost = total > 0 ? 0 : (DB.meta.actionPower?.defaultStageCost ?? 1);
    if (cost > 0 && !consumeAP(cost, { reason: 'long_task_complete_no_stage', taskId: task.id, cost })) {
      return;
    }
    // --- END: MODIFICATION ---

    task.reports = segs;
    task.status = 'completed';
    task.completedAt = new Date().toISOString(); 
    logAction('task_complete', { id: task.id, name: task.name });
    DB.update(task);
    
    const pt = { daily: 0.5, weekly: 3, monthly: 10, yearly: 100 };
    const m = DB.meta;
    m.points = (m.points || 0) + (pt[task.type] || 0);

    if (!m.achievements.stats.tasksCompletedByType) {
        m.achievements.stats.tasksCompletedByType = { daily: 0, weekly: 0, monthly: 0, yearly: 0 };
    }
    if (m.achievements.stats.tasksCompletedByType[task.type] !== undefined) {
        m.achievements.stats.tasksCompletedByType[task.type]++;
    } else {
        m.achievements.stats.tasksCompletedByType[task.type] = 1;
    }

    if (task.type === 'daily') {
      const todayStr = new Date().toDateString(); 
      if (m.lastChestClaimDate !== todayStr) { 
        m.lastChestClaimDate = todayStr; 
        showTreasureChest();
      }
    }
    DB.meta = m; 
    
    checkAchievements('task_complete', { task });
    applyUnlockedRewards();
    
    if (task.type === 'daily') {
      const todayStart = startOfDay(new Date());
      const dailyTasks = DB.list('daily');
      const todaysCompletedCount = dailyTasks.filter(t => {
        if (t.status !== 'completed') return false;
        if (t.completedAt) {
          return startOfDay(new Date(t.completedAt)).getTime() === todayStart.getTime();
        }
        return startOfDay(new Date(t.end)).getTime() === todayStart.getTime();
      }).length;
      
      if (todaysCompletedCount >= DB.meta.limits.dailyMaxPerDay) {
        const raw = await window.electronAPI.readStore('redemption.json');
        const redemptionData = raw ? JSON.parse(raw) : {};
        if (!redemptionData.code || startOfDay(new Date(redemptionData.generatedAt)).getTime() !== todayStart.getTime()) {
           generateAndSaveRedemptionData();
        }
      }
    }

    closeDialogWithAnimation(reportModal); // [修改]
    dispatchDataChanged();
    toast('已提交并完成');
}

// --- Setup All Event Listeners ---
export function setupUIInteractions() {
    // Top-right buttons
    $('#redeemBtn').onclick = () => $('#codeEntryModal').showModal();
    $('#shopBtn').onclick = () => {
        renderShop();
        $('#shopModal').showModal();
    };

    // --- START: REFACTORED CODE ---
    // "就寝"按钮的逻辑被大大简化
    $('#sleepBtn').onclick = () => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();

      // 使用从 sleep.js 导入的 TIMES 配置
      const isBeforeRewardTime = h < TIMES.SLEEP_REWARD_START_H || (h === TIMES.SLEEP_REWARD_START_H && m < TIMES.SLEEP_REWARD_START_M);

      // 只有在严格的就寝时间之前才需要确认
      if (isBeforeRewardTime) {
        if (confirm('现在还没到推荐的就寝时间，确定要提前锁定应用吗？')) {
          startSleep();
        }
      } else {
        // 在推荐就寝时间之后，直接执行，不再需要确认
        startSleep();
      }
    };
    // --- END: REFACTORED CODE ---

    // Popover buttons
    $('#popoverEdit').onclick = () => { if(state.popoverTask) openTaskEditor(state.popoverTask); hideTaskPopover(); };
    $('#popoverComplete').onclick = () => { if(state.popoverTask) openReport(state.popoverTask); hideTaskPopover(); };
    $('#popoverAdvanceStage').onclick = () => {
      const t = state.popoverTask;
      if (!t) return;
      const next = advanceStageIfPossible(t);
      if (next === false) { /* AP不足或已完成的toast已在内部处理 */ return; }
      DB.update(t);
      toast(`已推进阶段：${next}/${t.stages.length || 0}`);
      showTaskPopover(t, null);
      dispatchDataChanged();
    };
    document.addEventListener('click', (e) => {
        if (!taskPopover.contains(e.target) && state.popoverTask) {
            hideTaskPopover();
        }
    });

    // =========================
    // START PATCH: 绑定"确认阶段"按钮
    // =========================
    const confirmBtn = $('#confirmStagesBtn');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        // --- START: MODIFICATION ---
        // 移除类型检查，所有任务都适用阶段
        // --- END: MODIFICATION ---

        const count = Math.max(0, parseInt($('#taskStageCount').value || '0', 10));
        if (count <= 0) { toast('请先设置阶段数量（≥1）'); return; }

        // --- START: FIX ---
        const costInput = $('#taskStageCost').value || '1';
        let cost = parseFloat(costInput);
        if (isNaN(cost) || cost <= 0) {
            cost = 1; // 如果输入无效或为0，则默认为1
        }
        cost = Math.max(0.1, Math.min(3, cost)); // 关键：使用 parseFloat 并将下限改为 0.1
        // --- END: FIX ---

        const stages = Array.from({ length: count }).map((_, i) => ({
          title: `阶段 ${i + 1}`,
          cost
        }));

        const mainDesc = ($('#taskDesc')?.value || '').trim();
        if (mainDesc && stages.length) {
          stages[0].note = mainDesc;
        }

        window.__taskDraftStages = stages;
        window.__taskDraftStagesLocked = true;

        $('#taskStageCount').disabled = true;
        $('#taskStageCost').disabled = true;

        const notesBox = $('#stageNotesContainer');
        notesBox.classList.add('stage-notes');
        notesBox.style.display = 'block';

        const descWrap = $('#taskDesc')?.parentElement;
        if (descWrap) descWrap.style.display = 'none';

        const stageCountField = document.querySelector('#taskStageCount')?.closest('.field');
        if (stageCountField) stageCountField.style.display = 'none';
        
        const rowStageCostAndHelp = document.querySelector('#taskStageCost')?.closest('.row');
        if (rowStageCostAndHelp) rowStageCostAndHelp.style.display = 'none';
        
        const rowConfirm = document.querySelector('#confirmStagesBtn')?.closest('.row');
        if (rowConfirm) rowConfirm.style.display = 'none';
        
        window.__taskDraftStagesLocked = true;

        renderStageNotesEditor({ stages });
      };
    }
    // =========================
    // END PATCH
    // =========================

    // Task Modal
    $('#taskSave').onclick = saveTask;
    $('#taskDeleteBtn').onclick = () => {
        if (!state.editingTask) return;
        if (!confirm('确认删除该任务？')) return;
        logAction('task_delete', { id: state.editingTask.id, name: state.editingTask.name });
        checkAchievements('task_delete', { task: state.editingTask });
        DB.remove(state.editingTask);
        closeDialogWithAnimation(taskModal); // [修改]
        dispatchDataChanged();
        toast('已删除');
    };
    taskType.onchange = () => { 
      taskRuleHelp.textContent = ruleTexts[taskType.value]; 
      updateStageEditorVisibility(); // [修改] 使用新的通用函数
    };
    
    // [修改] 统一处理所有弹窗的关闭按钮
    $$('.modal-close-btn, .btn[data-action="close-dialog"]').forEach(btn => {
        btn.onclick = () => {
            const dialog = btn.closest('dialog');
            if (dialog) {
                if (dialog.id === 'taskModal') {
                    closeTaskEditor();
                }
                closeDialogWithAnimation(dialog);
            }
        };
    });

    // Report Modal
    $('#addSegBtn').onclick = () => addSeg('');
    $('#reportSubmit').onclick = submitReport;

    // Redemption Modal
    $('#redeemSubmitBtn').onclick = async () => {
        await redeemCode();
    };
    
    // Checklist Interactions
    checklistAddBtn.onclick = () => openChecklistEditor();
    $('#checklistItemSave').onclick = saveChecklistItem;
    $('#checklistItemDeleteBtn').onclick = () => {
        if (editingChecklistItem && confirm('确认永久删除该事项？')) {
            deleteChecklistItem(editingChecklistItem.id);
            closeDialogWithAnimation(checklistItemModal); // [修改]
        }
    };
}