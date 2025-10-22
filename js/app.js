// js/app.js
import { state } from './constants.js';
import { DB } from './store.js';
import { render, setupTimelineInteractions } from './timeline.js';
import { setupUIInteractions, renderChecklist } from './ui.js';
import { setupRewardsInteractions, applyUnlockedRewards } from './rewards.js';
import { ensureTodayAPInitialized, applyHourlyDecayIfNeeded } from './actionPower.js';
// --- START: 新增的导入 ---
import { checkSleepOnStartup } from './sleep.js';
// --- END: 新增的导入 ---
// --- START: 添加的导入 ---
import { toast } from './utils.js';
// --- END: 添加的导入 ---

async function initializeApp() {
  await DB.load();

  // --- START: 新增的应用启动检查 ---
  const isLockedOnStartup = checkSleepOnStartup();
  if (isLockedOnStartup) {
    // 如果应用启动时应处于锁定状态，则不执行任何后续UI初始化
    console.log("Application is locked for sleep. Halting UI initialization.");
    return;
  }
  // --- END: 新增的应用启动检查 ---
  
  // --- START: BUG FIX COMPENSATION ---
  // 这是为帮助识别并修复上限重置Bug而发放的一次性补偿。
  if (!DB.meta.compensation_granted_limits_bug_fix) {
      const m = DB.meta;
      m.sunkenSilver = (m.sunkenSilver || 0) + 10;
      m.compensation_granted_limits_bug_fix = true; // 设置标记，确保只执行一次
      DB.meta = m;
      // 延迟显示提示，确保UI已加载
      setTimeout(() => toast('已发放 10 水葬银货作为 Bug 修复补偿'), 500);
  }
  // --- END: BUG FIX COMPENSATION ---

  // --- START: 新增的开发者福利 ---
  if (!DB.meta.developer_silver_grant_v1) {
    const m = DB.meta;
    m.sunkenSilver = (m.sunkenSilver || 0) + 2;
    m.developer_silver_grant_v1 = true; // 设置标记，确保只执行一次
    DB.meta = m;
    setTimeout(() => toast('开发者福利：已发放 2 水葬银货'), 1000);
  }
  // --- END: 新增的开发者福利 ---

  // --- START: 一次性历史数据修复逻辑 ---
  if (!DB.meta.stats_recalculated_on_2024_05_21) { // 使用一个标记来确保只运行一次
    console.log("Running one-time stats recalculation...");
    const stats = DB.meta.achievements.stats;
    stats.tasksCompletedByType = { daily: 0, weekly: 0, monthly: 0, yearly: 0 };
    
    ['daily', 'weekly', 'monthly', 'yearly'].forEach(type => {
      const completedCount = DB.list(type).filter(t => t.status === 'completed').length;
      stats.tasksCompletedByType[type] = completedCount;
    });

    DB.meta.stats_recalculated_on_2024_05_21 = true; // 设置标记
    DB.meta = DB.meta; // 保存更新
    console.log("Stats recalculation complete:", DB.meta.achievements.stats.tasksCompletedByType);
    setTimeout(() => toast('已修正历史任务统计数据'), 500);
  }
  // --- END: 一次性历史数据修复逻辑 ---
  
  // --- START: 新增的一次性数据迁移：将旧的每日任务转换为阶段模式 ---
  if (!DB.meta.data_migrated_daily_to_stages_v1) {
    console.log("Running one-time migration: converting daily tasks to stage model...");
    let changed = false;
    const dailyTasks = DB.list('daily');
    
    dailyTasks.forEach(task => {
      if (!task.stages) { // 只处理没有 stages 字段的旧任务
        task.stages = [{
          title: '完成任务',
          cost: task.dailyCost || 1, // 沿用旧的成本，否则默认为1
          note: task.description || '' // 将旧描述移入阶段备注
        }];
        task.stageProgress = 0;
        task.stagesLocked = true; // 自动转换的阶段默认锁定
        delete task.dailyCost; // 移除旧字段
        changed = true;
      }
    });

    if (changed) {
      DB.save('daily', dailyTasks); // 保存更新后的列表
      setTimeout(() => toast('已将旧的每日任务升级为阶段模式'), 1000);
    }
    
    DB.meta.data_migrated_daily_to_stages_v1 = true; // 设置迁移完成标记
    DB.meta = DB.meta; // 保存 meta
    console.log("Daily task migration complete.");
  }
  // --- END: 新增的一次性数据迁移 ---

  // --- START: 新增的一次性美食成就数据迁移 ---
  if (!DB.meta.food_achievements_migrated_v1) {
    console.log("Running one-time migration for special food achievements...");
    const m = DB.meta;
    let changed = false;

    // 旧成就ID -> 新成就ID 的映射表
    const migrationMap = {
      'food_北京_豆汁儿': 'ach_food_北京_豆汁儿',
      'food_广西市县_柳州螺蛳粉': 'ach_food_广西市县_柳州螺蛳粉',
      'food_湖南_臭豆腐长沙': 'ach_food_湖南_臭豆腐长沙',
      'food_天津_煎饼果子': 'ach_food_天津_煎饼果子',
      'food_四川_双流老妈兔头': 'ach_food_四川_双流老妈兔头',
    };

    const unlocked = m.achievements.unlocked || {};
    for (const oldId in migrationMap) {
      if (unlocked[oldId] !== undefined) {
        const newId = migrationMap[oldId];
        // 继承解锁状态
        unlocked[newId] = unlocked[oldId];
        // 移除旧记录
        delete unlocked[oldId];
        changed = true;
        console.log(`Migrated achievement: ${oldId} -> ${newId}`);
      }
    }

    // 设置迁移完成标记，并仅在发生变化时保存
    m.food_achievements_migrated_v1 = true;
    if (changed) {
      toast('美食成就系统已升级');
      DB.meta = m; // 保存更新后的 meta
    } else {
      DB.meta = m; // 即使无变化也保存标记
    }
    console.log("Food achievement migration check complete.");
  }
  // --- END: 新增的一次性美食成就数据迁移 ---

  // --- START: 新增的水葬银货补偿 ---
  if (!DB.meta.additional_silver_grant_v1) {
    const m = DB.meta;
    m.sunkenSilver = (m.sunkenSilver || 0) + 3;
    m.additional_silver_grant_v1 = true; // 设置标记，确保只执行一次
    DB.meta = m;
    setTimeout(() => toast('已发放 3 水葬银货'), 1500);
  }
  // --- END: 新增的水葬银货补偿 ---

  // Load settings from DB into state
  state.msPerPx = DB.meta.settings.msPerPx;
  state.viewportStart = new Date(DB.meta.settings.viewportStartISO);

  // Setup all interactions
  setupTimelineInteractions();
  setupUIInteractions();
  setupRewardsInteractions();
  
  // 行动力初始化 + 小时衰减
  ensureTodayAPInitialized();
  applyHourlyDecayIfNeeded();
  // 每 3 分钟轮询一次，若跨整点则扣 0.2
  setInterval(() => { applyHourlyDecayIfNeeded(); }, 180000);
  
  // 设置事件监听器，作为唯一的渲染触发点
  document.addEventListener('datachanged', () => {
    console.log('Data changed, re-rendering...');
    applyUnlockedRewards(); // 确保每次数据变化都重新计算奖励
    render();
    renderChecklist(); // 刷新每日清单
    // 数据变化时也尝试应用小时衰减，保持幂等
    applyHourlyDecayIfNeeded();
  });
  
  // Initial render
  applyUnlockedRewards();
  render();
  renderChecklist();
}

// Start the app
initializeApp();