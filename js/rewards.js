// js/rewards.js
import { $, $$, toast, logAction, dispatchDataChanged } from './utils.js';
import { DB } from './store.js';
// --- START: MODIFICATION (引入限定商品数据) ---
import { ACHIEVEMENTS, REWARDS_MILESTONES, SHOP_ITEM_POOL, defaultMeta, LIMITED_FOOD_ITEMS } from './constants.js';
// --- END: MODIFICATION ---
import { render as renderTimeline } from './timeline.js';

// --- 商店逻辑 ---
const getShopDayIdentifier = () => {
    const now = new Date();
    if (now.getHours() < 6) { now.setDate(now.getDate() - 1); }
    return now.toISOString().split('T')[0];
};

function refreshShopIfNeeded() {
    const m = DB.meta;
    if (!m.shop) m.shop = JSON.parse(JSON.stringify(defaultMeta.shop));
    const currentShopDay = getShopDayIdentifier();

    if (m.shop.lastRefresh !== currentShopDay) {
        m.shop.lastRefresh = currentShopDay;
        m.shop.purchasedSlots = [];
        m.shop.items = [];
        for (let i = 0; i < 3; i++) {
            const poolForSlot = SHOP_ITEM_POOL.filter(item => {
                if (item.cost === 1) return Math.random() < 0.5;
                if (item.cost === 5) return Math.random() < 0.5;
                if (item.cost === 10) return Math.random() < 0.5;
                return false;
            });
            const randomItem = poolForSlot.length > 0
                ? poolForSlot[Math.floor(Math.random() * poolForSlot.length)]
                : SHOP_ITEM_POOL[Math.floor(Math.random() * SHOP_ITEM_POOL.length)];

            m.shop.items.push(randomItem);
        }
        DB.meta = m;
    }
}

// --- START: REFACTORED AND NEW SHOP RENDERING LOGIC ---

/**
 * 渲染每日刷新商店
 */
function renderDailyShop() {
    refreshShopIfNeeded();
    const m = DB.meta;
    const container = $('#dailyShop');
    container.innerHTML = '';

    m.shop.items.forEach((item, index) => {
        const canAfford = m.sunkenSilver >= item.cost;
        const isPurchased = m.shop.purchasedSlots.includes(index);
        const itemEl = document.createElement('div');
        itemEl.className = 'shop-item';
        itemEl.innerHTML = `
            <div class="shop-item-details">
                <span class="name">${item.name}</span>
                <span class="cost">
                    <img src="水葬银货.png" width="14" height="14" />
                    <span>${item.cost}</span>
                </span>
            </div>
            <button class="btn primary" data-index="${index}" ${isPurchased || !canAfford ? 'disabled' : ''}>
                ${isPurchased ? '已购买' : '兑换'}
            </button>
        `;
        itemEl.querySelector('button').onclick = () => buyDailyShopItem(index);
        container.appendChild(itemEl);
    });
}

/**
 * 渲染限定商品商店
 */
function renderLimitedShop() {
    const m = DB.meta;
    const purchasedIds = new Set(m.purchasedLimitedItems || []);
    const container = $('#limitedShop');
    container.innerHTML = '';

    // --- START: MODIFICATION (排序逻辑) ---
    const sortedItems = [...LIMITED_FOOD_ITEMS].sort((a, b) => {
        const aPurchased = purchasedIds.has(a.id);
        const bPurchased = purchasedIds.has(b.id);
        if (aPurchased === bPurchased) return 0; // 如果购买状态相同，保持原顺序
        return aPurchased ? 1 : -1; // 已购买的(true)排在后面
    });
    // --- END: MODIFICATION ---

    sortedItems.forEach(item => {
        const canAfford = m.sunkenSilver >= item.cost;
        const isPurchased = purchasedIds.has(item.id);
        const itemEl = document.createElement('div');
        itemEl.className = 'shop-item';
        if (isPurchased) {
            itemEl.classList.add('purchased'); // 添加样式钩子
        }
        itemEl.innerHTML = `
            <div class="shop-item-details">
                <span class="name">${item.name}</span>
                <span class="cost">
                    <img src="水葬银货.png" width="14" height="14" />
                    <span>${item.cost}</span>
                </span>
                <span class="province">${item.province}</span>
            </div>
            <button class="btn primary" data-id="${item.id}" ${isPurchased || !canAfford ? 'disabled' : ''}>
                ${isPurchased ? '已拥有' : '购买'}
            </button>
        `;
        if (!isPurchased) {
            itemEl.querySelector('button').onclick = () => buyLimitedShopItem(item.id);
        }
        container.appendChild(itemEl);
    });
}

/**
 * 主渲染函数 (已简化)
 */
export function renderShop() {
    // 1. 更新银币数量
    $('#shopSilverCount').textContent = DB.meta.sunkenSilver || 0;
    
    // 2. 直接渲染限定商品列表
    renderLimitedShop();

    // 3. (已移除) 不再需要渲染每日商店和设置页签切换逻辑
}

function buyDailyShopItem(index) {
    const m = DB.meta;
    const item = m.shop.items[index];
    if (m.sunkenSilver >= item.cost && !m.shop.purchasedSlots.includes(index)) {
        m.sunkenSilver -= item.cost;
        m.achievements.stats.totalSilverSpent = (m.achievements.stats.totalSilverSpent || 0) + item.cost;

        if (item.type === 'limit' && item.key) {
            if (!m.permanentUpgrades) m.permanentUpgrades = [];
            m.permanentUpgrades.push({
                type: 'limit',
                key: item.key,
                value: 1,
                source: 'shop',
                purchasedAt: new Date().toISOString(),
                name: item.name
            });
        }

        m.shop.purchasedSlots.push(index);
        DB.meta = m;
        logAction('shop_purchase', { item: item.name, cost: item.cost });
        
        checkAchievements('shop_purchase', { item });
        
        const successMsg = item.type === 'reward' ? `兑换成功！去犒劳一下自己吧！` : `成功兑换 ${item.name}`;
        toast(successMsg);
        renderDailyShop(); // 只重绘每日商店
        $('#shopSilverCount').textContent = DB.meta.sunkenSilver || 0;
        applyUnlockedRewards();
        dispatchDataChanged(); 
    } else {
        toast('水葬银货不足或已购买');
    }
}

/**
 * 购买限定商品的逻辑
 * @param {string} itemId 
 */
function buyLimitedShopItem(itemId) {
    const m = DB.meta;
    const item = LIMITED_FOOD_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    if (m.sunkenSilver >= item.cost && !(m.purchasedLimitedItems || []).includes(itemId)) {
        m.sunkenSilver -= item.cost;
        m.achievements.stats.totalSilverSpent = (m.achievements.stats.totalSilverSpent || 0) + item.cost;

        // 添加到永久升级记录中
        if (item.effect.type === 'ap_cap_base') {
            if (!m.permanentUpgrades) m.permanentUpgrades = [];
            m.permanentUpgrades.push({
                type: 'ap_cap_base',
                value: item.effect.value,
                source: 'limited_shop',
                purchasedAt: new Date().toISOString(),
                name: item.name
            });
        }
        
        // 记录已购买
        if (!m.purchasedLimitedItems) m.purchasedLimitedItems = [];
        m.purchasedLimitedItems.push(itemId);
        
        DB.meta = m;
        logAction('shop_purchase_limited', { item: item.name, cost: item.cost });
        checkAchievements('shop_purchase', { item }); // 仍然触发通用购物成就

        toast(`成功品尝 ${item.name}！AP上限永久+${item.effect.value}。`);
        
        // 重新渲染UI
        renderLimitedShop(); // 重绘限定商店
        $('#shopSilverCount').textContent = DB.meta.sunkenSilver || 0;
        dispatchDataChanged();
    } else {
        toast('水葬银货不足或已拥有');
    }
}

// --- END: REFACTORED SHOP LOGIC ---


// --- 宝箱与兑换码 (无变化) ---
const treasureChest = $('#treasureChest');
export function showTreasureChest() {
    treasureChest.classList.remove('hidden');
    treasureChest.classList.remove('opened');
    treasureChest.onclick = () => {
        const rand = Math.random();
        let wonSilver = 0;
        if (rand < 0.7) { wonSilver = 1; } 
        else if (rand < 1.0) { wonSilver = 2; }
        
        const m = DB.meta;
        if (wonSilver > 0) {
            m.sunkenSilver = (m.sunkenSilver || 0) + wonSilver;
            toast(`开启宝箱，获得 ${wonSilver} 枚水葬银货！`);
        } else {
            toast('宝箱是空的...');
        }
        logAction('claim_chest', { reward_silver: wonSilver });
        DB.meta = m;
        treasureChest.classList.add('opened');
        treasureChest.onclick = null;
        applyUnlockedRewards();
    };
}

export async function generateAndSaveRedemptionData() {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2,'0')}${today.getDate().toString().padStart(2,'0')}`;
    const code = `TICKLINE-${dateStr}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
    
    const m = DB.meta;
    const dailyLimit = m.limits?.dailyMaxPerDay || 2;
    const pointsToRedeem = 0.5 * dailyLimit;

    const prompt = `你是一个积极、善于引导反思的AI助手。用户正在使用一款名为TickLine的时间轴任务管理应用，并向你提供了他们所有的数据（.json文件内容）。你的任务是：
1.  **识别身份**：首先，你要意识到这是一个TickLine用户在进行每日复盘。友好地问候他们。
2.  **分析数据**：快速浏览用户提供的数据，特别是当天的'daily.json'里的已完成任务，以及'meta.json'里的积分和成就。
3.  **引导反思**：不要直接给出兑换码！你要先提出1-2个开放性问题，引导用户反思他们当天的表现。例如："我看到你今天完成了[任务A]和[任务B]，非常棒！你觉得今天最有成就感的是哪个瞬间？"或者"在完成[某个任务]时，你遇到了什么挑战吗？你是如何克服的？"
4.  **等待确认**：在用户回答了你的问题，并表示反思完成后（例如用户说"我反思完了"、"好了"、"可以了"等），你才能给出兑换码。
5.  **给出兑换码**：在确认用户反思完毕后，对他们的反思给予积极评价，然后清晰地给出下面的兑换码，并告诉他们这个兑换码可以兑换${pointsToRedeem.toFixed(1)}积分。

今日的专属兑换码是: ${code}

请严格遵守以上流程，确保优先引导用户反思。`;

    const redemptionData = { code, prompt, generatedAt: new Date().toISOString(), redeemed: false };
    await window.electronAPI.writeStore('redemption.json', JSON.stringify(redemptionData));
    $('#aiPromptModal').showModal();
}

export async function redeemCode() {
    const userInput = $('#codeInput').value.trim();
    if (!userInput) { toast('请输入兑换码'); return; }

    const raw = await window.electronAPI.readStore('redemption.json');
    const redemptionData = raw ? JSON.parse(raw) : {};

    if (!redemptionData || !redemptionData.code) { toast('今日尚未生成兑换码'); return; }
    if (redemptionData.redeemed) { toast('今日兑换码已被使用'); return; }
    
    if (userInput.toUpperCase() === redemptionData.code.toUpperCase()) {
      const m = DB.meta;
      
      const dailyLimit = m.limits?.dailyMaxPerDay || 2;
      const pointsToAdd = 0.5 * dailyLimit;
      
      m.points = (m.points || 0) + pointsToAdd;
      DB.meta = m;
      
      redemptionData.redeemed = true;
      await window.electronAPI.writeStore('redemption.json', JSON.stringify(redemptionData));
      
      logAction('redeem_code', { code: userInput, points: pointsToAdd });
      
      checkAchievements('redeem_code', {});
      
      applyUnlockedRewards();
      renderRewardsTrack();
      
      $('#codeEntryModal').close();
      $('#codeInput').value = '';

      toast(`兑换成功，获得 ${pointsToAdd.toFixed(1)} 积分！`);
      
      dispatchDataChanged();
    } else {
      toast('兑换码无效');
    }
}

// --- 成就与奖励轨道核心逻辑 ---
function applyReward(reward) {
  const m = DB.meta;
  if (reward.type === 'points') {
    m.points += reward.value;
  } else if (reward.type === 'silver') {
    m.sunkenSilver = (m.sunkenSilver || 0) + reward.value;
  }
  DB.meta = m;
}

export function checkAchievements(trigger, data) {
    const m = DB.meta;
    if (!m.achievements) m.achievements = { unlocked: {}, stats: {} };
    if (!m.achievements.unlocked) m.achievements.unlocked = {};

    console.log(`Checking achievements for trigger: ${trigger}`);

    let changed = false;
    for (const id in ACHIEVEMENTS) {
        const achievement = ACHIEVEMENTS[id];
        if (!achievement.checkOn.includes(trigger)) continue;

        const progress = achievement.getProgress(trigger, data, DB);
        if (progress === 0 && achievement.tiers[0].goal > 1) continue;

        let currentTierIndex = m.achievements.unlocked[id] ?? -1;
        
        while (true) {
            const nextTierIndex = currentTierIndex + 1;
            if (nextTierIndex >= achievement.tiers.length) {
                break;
            }
            
            const nextTier = achievement.tiers[nextTierIndex];
            if (progress >= nextTier.goal) {
                m.achievements.unlocked[id] = nextTierIndex;
                applyReward(nextTier.reward);
                
                const toastPrefix = (currentTierIndex === -1) ? '成就解锁' : '成就升级';
                toast(`${toastPrefix}: ${achievement.name} (${nextTier.desc})`);
                logAction('achievement_unlocked', { id, tier: nextTierIndex, name: achievement.name });
                
                currentTierIndex = nextTierIndex;
                changed = true;
            } else {
                break;
            }
        }
    }
    if (changed) {
      applyUnlockedRewards();
    }
    DB.meta = m;
}

export function applyUnlockedRewards() {
    const m = DB.meta; 
    
    const newLimits = JSON.parse(JSON.stringify(defaultMeta.limits));
    
    REWARDS_MILESTONES.forEach(reward => {
        if (m.points >= reward.points) {
            const tempMetaForApply = { limits: newLimits };
            reward.apply(tempMetaForApply);
        }
    });
    
    const unlockedAchievements = m.achievements?.unlocked || {};
    for (const id in unlockedAchievements) {
        const achievement = ACHIEVEMENTS[id];
        if (!achievement) {
            console.warn(`发现一个未知的成就ID: "${id}"，已跳过。`);
            continue;
        }

        const unlockedTierIndex = unlockedAchievements[id];
        for (let i = 0; i <= unlockedTierIndex; i++) {
            const tier = achievement.tiers[i];
            if (tier && tier.reward && tier.reward.type === 'limit') {
                const { key, value } = tier.reward;
                if (newLimits[key] !== undefined) {
                    newLimits[key] += value;
                }
            }
        }
    }
    
    if (m.permanentUpgrades && Array.isArray(m.permanentUpgrades)) {
        m.permanentUpgrades.forEach(upgrade => {
            if (upgrade.type === 'limit' && upgrade.key && newLimits[upgrade.key] !== undefined) {
                newLimits[upgrade.key] += upgrade.value || 1;
            }
        });
    }

    m.limits = newLimits;
    DB.meta = m;
}

function formatReward(reward) {
  if (!reward) return '无奖励';
  if (reward.type === 'points') {
    return `+${reward.value} 积分`;
  } else if (reward.type === 'silver') {
    return `+${reward.value} 水葬银货`;
  } else if (reward.type === 'limit') {
    const limitNames = {
      'dailyMaxPerDay': '每日创建上限',
      'dailyMaxSimultaneous': '每日并行上限',
      'weeklyMaxPerWeek': '每周创建上限',
      'weeklyMaxSimultaneous': '每周并行上限',
      'monthlyMaxPerMonth': '每月创建上限',
      'monthlyMaxSimultaneous': '每月并行上限',
    };
    return `${limitNames[reward.key] || reward.key} +${reward.value}`;
  }
  return '未知奖励';
}

function renderAchievements() {
    const container = $('#achievementsGrid'); 
    if(!container) return; 
    container.innerHTML = ''; 
    const unlocked = DB.meta.achievements?.unlocked || {};

    for (const id in ACHIEVEMENTS) {
      if (ACHIEVEMENTS[id].hidden && unlocked[id] === undefined) continue;
      
      const achievement = ACHIEVEMENTS[id];
      const currentTier = unlocked[id] ?? -1;
      const item = document.createElement('div');
      item.className = 'achievement-item';
      
      let tiersHTML = '';
      achievement.tiers.forEach((tier, index) => {
        const isUnlocked = index <= currentTier;
        const rewardText = formatReward(tier.reward);
        tiersHTML += `<div class="tier ${isUnlocked ? 'unlocked' : ''}">
          <span class="tooltip">${tier.desc}<br>目标: ${tier.goal} | 奖励: ${rewardText}</span>
        </div>`;
      });
      
      let nameHTML = `<div class="name">${achievement.name}</div>`;
      if(ACHIEVEMENTS[id].hidden) nameHTML += ` <span style="font-style:italic; color:var(--text-light);">(隐藏)</span>`

      item.innerHTML = `${nameHTML}<div class="desc">${achievement.desc}</div><div class="achievement-tiers">${tiersHTML}</div>`;
      container.appendChild(item);
    }
}

export function renderRewardsTrack() {
    const points = DB.meta.points || 0; 
    const limits = DB.meta.limits; 
    $('#currentPointsDisplay').textContent = points.toFixed(1);
    $('#limit-daily-max').textContent = `${limits.dailyMaxPerDay} / ${limits.dailyMaxSimultaneous}`; 
    $('#limit-weekly-max').textContent = `${limits.weeklyMaxPerWeek} / ${limits.weeklyMaxSimultaneous}`; 
    $('#limit-monthly-max').textContent = `${limits.monthlyMaxPerMonth} / ${limits.monthlyMaxSimultaneous}`;
    $('#limit-yearly').textContent = limits.yearlyUnlocked ? `已解锁 (上限 ${limits.yearlyMaxPerYear})` : '未解锁';
    $('#limit-yearly').style.color = limits.yearlyUnlocked ? 'var(--primary)' : 'var(--text)';
    $('#limit-yearly').style.background = limits.yearlyUnlocked ? 'rgba(138, 122, 102, 0.1)' : 'var(--bg)';
    
    // --- START: MODIFICATION ---
    // 获取已完成任务的统计数据
    const stats = DB.meta.achievements?.stats?.tasksCompletedByType || {};
    const completedDaily = stats.daily || 0;
    const completedWeekly = stats.weekly || 0;
    const completedMonthly = stats.monthly || 0;
    const completedYearly = stats.yearly || 0;

    // 更新界面上的统计数值
    $('#completed-daily-count').textContent = completedDaily;
    $('#completed-weekly-count').textContent = completedWeekly;
    $('#completed-monthly-count').textContent = completedMonthly;
    $('#completed-yearly-count').textContent = completedYearly;

    // 如果年度任务已解锁，则显示其完成数量
    const yearlyRow = $('#completed-yearly-row');
    if (limits.yearlyUnlocked) {
        yearlyRow.style.display = 'flex';
    } else {
        yearlyRow.style.display = 'none';
    }
    // --- END: MODIFICATION ---
    
    const maxMilestonePoints = REWARDS_MILESTONES.reduce((max, r) => Math.max(max, r.points), 100);
    const maxPoints = Math.max(maxMilestonePoints + 50, Math.ceil((points + 20) / 50) * 50);
    const progressPercent = Math.min(100, (points / maxPoints) * 100);
    $('#trackProgress').style.width = `${progressPercent}%`;

    const milestonesContainer = $('#trackMilestones');
    milestonesContainer.innerHTML = '';
    REWARDS_MILESTONES.forEach(reward => {
      if (reward.points > maxPoints) return;
      const milestoneEl = document.createElement('div');
      const isUnlocked = points >= reward.points;
      milestoneEl.className = `milestone ${isUnlocked ? 'unlocked' : ''}`;
      milestoneEl.style.left = `${(reward.points / maxPoints) * 100}%`;
      milestoneEl.setAttribute('data-points', reward.points);
      milestoneEl.innerHTML = `<span class="tooltip">${reward.desc}</span>`;
      milestonesContainer.appendChild(milestoneEl);
    });

    renderAchievements(); 
}

export function setupRewardsInteractions() {
    $('#upgradeBtn').onclick = () => {
        renderRewardsTrack();
        $('#timeline').style.display = 'none';
        $('#rewardsTrack').style.display = 'flex';
    };
    $('#backToTimelineBtn').onclick = () => {
        $('#rewardsTrack').style.display = 'none';
        $('#timeline').style.display = 'block';
        renderTimeline();
    };
}