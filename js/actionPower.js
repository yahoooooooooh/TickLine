// js/actionPower.js
import { toast, dispatchDataChanged } from './utils.js';
import { DB } from './store.js';

// --- START: 新增导入 ---
// 注意：这会产生循环依赖警告，但在Electron环境中通常可接受。
// 更好的做法是将TIMES移到一个共享的config.js文件，但为简化，我们先这样。
import { TIMES } from './sleep.js';
// --- END: 新增导入 ---

// 统一自举：旧 meta.json 没有 actionPower 时，动态补上默认结构
function ensureAPConfig() {
  const m = DB.meta || {};
  if (!m.actionPower) {
    m.actionPower = {
      base: 10,
      perPoint: 0.1,
      dailyRefreshHour: 6,
      decayStartHour: 6,
      decayEndHour: 22,
      defaultStageCost: 1,
      currentAP: 0,
      dailyCap: 0,
      lastRefreshedDay: null,
      lastDecayHourMark: null,
    };
    DB.meta = m; // 写回
  }
  return m.actionPower;
}

/**
 * 计算"今天"的业务日：早6点为界
 */
function getTodayCycleStart(cfg) {
  const now = new Date();
  const s = new Date(now);
  s.setHours(cfg.dailyRefreshHour ?? 6, 0, 0, 0);
  if (now < s) s.setDate(s.getDate() - 1);
  return s;
}

function getTodayCycleEnd(cfg) {
  const start = getTodayCycleStart(cfg);
  const e = new Date(start);
  e.setDate(e.getDate() + 1);
  return e;
}

/**
 * 初始化/刷新当日 AP
 * - 基于 formula: ceil(base + permanent_bonus + points * perPoint)
 * - 每天 6:00 重置 currentAP
 */
export function ensureTodayAPInitialized() {
  const m = DB.meta;
  const cfg = ensureAPConfig();

  const dayStartISO = getTodayCycleStart(cfg).toISOString().slice(0, 10);
  
  const needsRefresh = m.actionPower.lastRefreshedDay !== dayStartISO;
  
  // --- START: MODIFICATION (核心修复：在新的一天 或 用户睡醒时，都执行结算) ---
  if (needsRefresh || m.sleepState.isAsleep) {
  // --- END: MODIFICATION ---
    const permanentAPBonus = (m.permanentUpgrades || [])
        .filter(up => up.type === 'ap_cap_base')
        .reduce((sum, up) => sum + (up.value || 0), 0);
    
    const base = (cfg.base ?? 10) + permanentAPBonus;
    const perPoint = cfg.perPoint ?? 0.1;
    const points = m.points || 0;
    
    let dailyCap = Math.ceil(base + points * perPoint);
    let currentAP = dailyCap;

    // 奖励与惩罚结算 (只在每日首次刷新时执行, 或睡醒时执行)
    if (m.sleepState) {
      // "起床时间"就是本次刷新的时间
      const wakeUpTime = new Date();
      const h = wakeUpTime.getHours();
      const min = wakeUpTime.getMinutes();

      // 检查是否获得早起奖励
      const isRewardWakeTime = (
        (h > TIMES.WAKE_REWARD_START_H || (h === TIMES.WAKE_REWARD_START_H && min >= TIMES.WAKE_REWARD_START_M)) &&
        (h < TIMES.WAKE_REWARD_END_H || (h === TIMES.WAKE_REWARD_END_H && min <= TIMES.WAKE_REWARD_END_M))
      );

      if (m.sleepState.isEligibleForReward && isRewardWakeTime) {
        const bonus = dailyCap * 0.4;
        dailyCap += bonus;
        currentAP += bonus;

        setTimeout(() => {
          toast(`完美作息达成！今日AP上限临时提升40%！`);
        }, 500);
        appendAPHistory('reward', bonus, { reason: 'perfect_sleep_reward' });
      }

      // 应用待处理的罚款
      if (m.sleepState.pendingPenalty > 0) {
        const penalty = m.sleepState.pendingPenalty;
        currentAP = Math.max(0, currentAP - penalty);
        
        setTimeout(() => {
          toast(`因作息不规律，扣除 ${penalty.toFixed(2)} AP`);
        }, 1000);
        appendAPHistory('consume', penalty, { reason: 'sleep_penalty_applied' });
      }

      // --- START: 关键修复 ---
      // 移除了这里所有对 m.sleepState 的修改和清除操作
      // --- END: 关键修复 ---
    }

    // 更新最终的AP值
    m.actionPower.dailyCap = +dailyCap.toFixed(3);
    m.actionPower.currentAP = +currentAP.toFixed(3);
    m.actionPower.lastRefreshedDay = dayStartISO;
    m.actionPower.lastDecayHourMark = null;
    
    appendAPHistory('refresh', m.actionPower.dailyCap, { reason: 'daily_refresh', day: dayStartISO });

    DB.meta = m;
  }
}

/**
 * 每小时衰减：6:00–22:00，每过整点扣 0.2
 * 防重入：依据 lastDecayHourMark（形如 2025-10-13T09）做幂等
 */
export function applyHourlyDecayIfNeeded() {
  const m = DB.meta;
  const cfg = ensureAPConfig();
  ensureTodayAPInitialized();

  const now = new Date();
  const inCycleStart = new Date(getTodayCycleStart(cfg));
  const inCycleEnd = new Date(getTodayCycleEnd(cfg));
  if (!(now >= inCycleStart && now <= inCycleEnd)) return;

  const startHour = cfg.decayStartHour ?? 6;
  const endHour = cfg.decayEndHour ?? 22;
  const h = now.getHours();
  if (h < startHour || h > endHour) return;

  const hourMark = `${now.toISOString().slice(0, 13)}`;
  if (m.actionPower.lastDecayHourMark === hourMark) return;

  const lastMark = m.actionPower.lastDecayHourMark;
  const marksToApply = [];
  if (lastMark) {
    const last = new Date(lastMark + ':00:00.000Z');
    const cursor = new Date(last);
    cursor.setHours(cursor.getHours() + 1);
    while (cursor <= new Date(hourMark + ':00:00.000Z')) {
      if (cursor.getHours() >= startHour && cursor.getHours() <= endHour) {
        marksToApply.push(cursor.toISOString().slice(0, 13));
      }
      cursor.setHours(cursor.getHours() + 1);
    }
  } else {
    const dayStart = getTodayCycleStart(cfg);
    const first = new Date(dayStart);
    first.setHours(startHour, 0, 0, 0);
    const endHourThisRun = Math.min(h, endHour);
    const cursor = new Date(first);
    while (cursor.getHours() <= endHourThisRun && cursor <= now) {
      marksToApply.push(cursor.toISOString().slice(0, 13));
      cursor.setHours(cursor.getHours() + 1);
    }
  }

  for (const mk of marksToApply) {
    consumeAP(0.2, { reason: 'hourly_decay', hourMark: mk }, true);
    m.actionPower.lastDecayHourMark = mk;
    DB.meta = m;
  }
}

/**
 * 统一 AP 消耗接口
 * - 失败：返回 false + toast
 * - 成功：返回 true（并记历史）
 */
export function consumeAP(amount, extra = {}, silent = false) {
  const m = DB.meta;
  ensureAPConfig();
  ensureTodayAPInitialized();

  const left = m.actionPower.currentAP ?? 0;
  if (left <= 0 || left - amount < 0) {
    if (!silent) toast('行动力不足，今日无法执行该操作');
    return false;
  }
  m.actionPower.currentAP = Math.max(0, +(left - amount).toFixed(3));
  DB.meta = m;
  appendAPHistory('consume', amount, extra);
  if (!silent) dispatchDataChanged();
  return true;
}

/**
 * 历史记录落盘（独立文件）
 */
function appendAPHistory(kind, amount, details = {}) {
  const h = DB.apHistory || [];
  h.push({
    ts: new Date().toISOString(),
    kind,
    amount,
    details,
  });
  DB.saveAPHistory(h);
}

/**
 * 对外：读取当日 AP 状态
 */
export function getAPStatus() {
  try {
    ensureTodayAPInitialized();
    const m = DB.meta || {};
    const ap = (m.actionPower) ? m.actionPower : { currentAP: 0, dailyCap: 0 };
    return { current: ap.currentAP ?? 0, cap: ap.dailyCap ?? 0 };
  } catch (e) {
    console.warn('getAPStatus fallback:', e);
    return { current: 0, cap: 0 };
  }
}

/**
 * 阶段推进：根据阶段配置扣 AP
 * - 返回新进度（或失败 false）
 */
export function advanceStageIfPossible(task) {
  const m = DB.meta;
  const cfg = m.actionPower;
  
  const stages = task.stages || [];
  const idx = task.stageProgress || 0;
  if (idx >= stages.length) {
    toast('所有阶段均已完成');
    return false;
  }

  const cost = stages[idx]?.cost ?? cfg.defaultStageCost ?? 1;
  if (!consumeAP(cost, { reason: 'advance_stage', taskId: task.id, cost })) return false;

  task.stageProgress = idx + 1;
  return task.stageProgress;
}