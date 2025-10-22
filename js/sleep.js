// js/sleep.js
import { DB } from './store.js';
import { $, toast, dispatchDataChanged } from './utils.js';
import { defaultMeta } from './constants.js';
import { ensureTodayAPInitialized } from './actionPower.js';

// --- START: 调试配置 ---
const DEBUG_MODE = false; // <--- 在这里切换 true/false 来启用或禁用调试时间

export const TIMES = DEBUG_MODE ? {
  // 您的测试时间: 16:26-16:38睡, 16:40-16:45起
  SLEEP_REWARD_START_H: 16, SLEEP_REWARD_START_M: 26,
  SLEEP_PENALTY_START_H: 17, SLEEP_PENALTY_START_M: 16, // 16:38之后睡算晚
  WAKE_REWARD_START_H: 17, WAKE_REWARD_START_M: 17,
  WAKE_REWARD_END_H: 17, WAKE_REWARD_END_M: 19,
  WAKE_PENALTY_START_H: 17, WAKE_PENALTY_START_M: 9 // 16:46之后起算晚
} : {
  // 正常运行时间
  SLEEP_REWARD_START_H: 22, SLEEP_REWARD_START_M: 0,
  SLEEP_PENALTY_START_H: 23, SLEEP_PENALTY_START_M: 0,
  WAKE_REWARD_START_H: 5, WAKE_REWARD_START_M: 50,
  WAKE_REWARD_END_H: 8, WAKE_REWARD_END_M: 0,
  WAKE_PENALTY_START_H: 8, WAKE_PENALTY_START_M: 1
};
// --- END: 调试配置 ---

const LATE_SLEEP_PENALTY_PER_10_MIN = 0.1;
const LATE_WAKEUP_PENALTY_PER_MIN = 0.05;

const sleepModal = $('#sleepModal');
const unlockTimeDisplay = $('#unlockTimeDisplay');
const countdownDisplay = $('#countdownDisplay');
let countdownInterval = null;

function ensureSleepConfig() {
  const m = DB.meta;
  if (!m.sleepState) {
    m.sleepState = JSON.parse(JSON.stringify(defaultMeta.sleepState));
    DB.meta = m;
  }
  return m.sleepState;
}

function updateCountdown(unlockTime) {
  const now = new Date();
  const earliestUnlockTime = new Date(unlockTime);
  earliestUnlockTime.setHours(TIMES.WAKE_REWARD_START_H, TIMES.WAKE_REWARD_START_M, 0, 0);
  const diff = earliestUnlockTime.getTime() - now.getTime();

  if (diff <= 0) {
    countdownDisplay.textContent = "可以起床了";
    if (countdownInterval) clearInterval(countdownInterval);
    return;
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  countdownDisplay.textContent = 
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function showLockScreen() {
  const state = ensureSleepConfig();
  if (!state.isAsleep || !state.sleepUntil) return;
  
  const unlockTime = new Date(state.sleepUntil);
  const wakeStart = `${String(TIMES.WAKE_REWARD_START_H).padStart(2, '0')}:${String(TIMES.WAKE_REWARD_START_M).padStart(2, '0')}`;
  const wakeEnd = `${String(TIMES.WAKE_REWARD_END_H).padStart(2, '0')}:${String(TIMES.WAKE_REWARD_END_M).padStart(2, '0')}`;
  unlockTimeDisplay.textContent = `次日 ${wakeStart} - ${wakeEnd}`;

  if (countdownInterval) clearInterval(countdownInterval);
  updateCountdown(unlockTime);
  countdownInterval = setInterval(() => updateCountdown(unlockTime), 1000);

  sleepModal.showModal();
}

function hideLockScreen() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
  sleepModal.close();
}

export function startSleep() {
  const now = new Date();
  const m = DB.meta;
  ensureSleepConfig();
  
  m.sleepState.pendingPenalty = 0;
  m.sleepState.isEligibleForReward = false;
  
  const h = now.getHours();
  const min = now.getMinutes();

  // --- START: MODIFICATION ---
  // 1. 检查是否符合奖励条件 (逻辑已放宽)
  // 只要在晚睡惩罚时间 (23:00) 之前点击入睡，都算作有早睡意愿
  const isBeforePenaltyStart = h < TIMES.SLEEP_PENALTY_START_H || (h === TIMES.SLEEP_PENALTY_START_H && min < TIMES.SLEEP_PENALTY_START_M);

  if (isBeforePenaltyStart) {
    m.sleepState.isEligibleForReward = true;
    toast('已记录理想就寝时间，早起有惊喜！');
  }
  // --- END: MODIFICATION ---

  // 2. 计算晚睡惩罚
  const penaltyTime = new Date(now);
  penaltyTime.setHours(TIMES.SLEEP_PENALTY_START_H, TIMES.SLEEP_PENALTY_START_M, 0, 0);
  if (now >= penaltyTime) {
    const minutesPastBedtime = Math.floor((now.getTime() - penaltyTime.getTime()) / (1000 * 60));
    const penaltyCycles = Math.floor(minutesPastBedtime / 10);
    if (penaltyCycles > 0) {
      const totalPenalty = penaltyCycles * LATE_SLEEP_PENALTY_PER_10_MIN;
      m.sleepState.pendingPenalty += totalPenalty;
      toast(`记录晚睡惩罚：${totalPenalty.toFixed(2)} AP 将在次日扣除`);
    }
  }

  // 3. 设置解锁时间 (已为调试模式优化)
  const unlockTime = new Date(now);
  
  if (!DEBUG_MODE && now.getHours() >= TIMES.WAKE_REWARD_START_H) {
    unlockTime.setDate(unlockTime.getDate() + 1);
  }

  unlockTime.setHours(TIMES.WAKE_REWARD_END_H, 0, 0, 0);

  m.sleepState.isAsleep = true;
  m.sleepState.sleepUntil = unlockTime.toISOString();
  m.sleepState.sleepStartedAt = now.toISOString();
  DB.meta = m;

  showLockScreen();
}

function endSleep() {
  const now = new Date();
  const m = DB.meta;
  const state = ensureSleepConfig();
  if (!state.isAsleep) return;
  
  // 1. 计算晚起惩罚
  const penaltyLine = new Date(now);
  penaltyLine.setHours(TIMES.WAKE_PENALTY_START_H, TIMES.WAKE_PENALTY_START_M, 0, 0);
  
  if (now > penaltyLine) {
    const minutesPastWakeup = Math.floor((now.getTime() - penaltyLine.getTime()) / (1000 * 60));
    if (minutesPastWakeup > 0) {
      const totalPenalty = minutesPastWakeup * LATE_WAKEUP_PENALTY_PER_MIN;
      m.sleepState.pendingPenalty = (m.sleepState.pendingPenalty || 0) + totalPenalty;
    }
  }
  
  // --- START: MODIFICATION (调整执行顺序) ---
  // 2. 调用AP初始化函数，它现在只负责"计算"奖励和惩罚，不再清除状态
  ensureTodayAPInitialized();

  // --- START: 关键修复 ---
  // 3. 由 endSleep 亲自负责清理所有与本次睡眠相关的状态
  m.sleepState.isAsleep = false;
  m.sleepState.sleepStartedAt = null;
  m.sleepState.sleepUntil = null;
  m.sleepState.pendingPenalty = 0;
  m.sleepState.isEligibleForReward = false;
  DB.meta = m; // 一次性保存所有更新
  
  hideLockScreen();
  dispatchDataChanged();
  // --- END: 关键修复 ---
  // --- END: MODIFICATION ---
}

export function checkSleepOnStartup() {
  const state = ensureSleepConfig();
  if (!state.isAsleep) return false;

  const now = new Date();
  const unlockDay = new Date(state.sleepUntil);

  const earliestUnlockTime = new Date(unlockDay);
  earliestUnlockTime.setHours(TIMES.WAKE_REWARD_START_H, TIMES.WAKE_REWARD_START_M, 0, 0);

  if (now >= earliestUnlockTime) {
    endSleep();
    return false;
  } else {
    showLockScreen();
    return true;
  }
}