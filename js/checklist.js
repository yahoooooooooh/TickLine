// js/checklist.js
import { DB } from './store.js';
import { uid, dispatchDataChanged } from './utils.js';
import { consumeAP } from './actionPower.js';

/**
 * 获取 "今天" 的起始时间点（早上6点）。
 * 如果当前时间在 00:00 到 05:59 之间，则今天的周期从昨天早上6点开始。
 * @returns {Date}
 */
function getStartOfTodayCycle() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(6, 0, 0, 0);
    if (now < start) {
        start.setDate(start.getDate() - 1);
    }
    return start;
}

/**
 * 检查一个清单项今天是否已完成。
 * @param {object} item - 清单项对象
 * @returns {boolean}
 */
function isCompletedToday(item) {
    if (!item.lastCompletedAt) return false;
    const lastCompletion = new Date(item.lastCompletedAt);
    const todayStart = getStartOfTodayCycle();
    return lastCompletion >= todayStart;
}

/**
 * 计算并返回当前清单的所有状态。
 * @returns {{
 *   visibleItems: object[],
 *   limit: number,
 *   canAdd: boolean,
 *   items: object[]
 * }}
 */
export function getChecklistState() {
    const m = DB.meta;
    const items = m.checklist?.items || [];
    const limit = Math.floor((m.points || 0) / 10);
    
    const visibleItems = items.filter(item => !isCompletedToday(item));
    // 修复：canAdd应该基于总任务数是否小于上限，而不是基于可见任务数
    const canAdd = items.length < limit;

    return {
        items, // 全部事项
        visibleItems, // 今天需要显示的事项
        limit, // 总上限
        canAdd, // 是否还能添加
    };
}

/**
 * 添加或更新一个清单项。
 * @param {{id?: string, title: string, content: string}} data - 事项数据
 */
export function addOrUpdateChecklistItem(data) {
    const m = DB.meta;
    if (!m.checklist) m.checklist = { items: [] };
    
    if (data.id) {
        // 更新
        const index = m.checklist.items.findIndex(item => item.id === data.id);
        if (index > -1) {
            m.checklist.items[index] = { ...m.checklist.items[index], ...data };
        }
    } else {
        // 新增
        const limit = Math.floor((m.points || 0) / 10);
        // 修复：应该基于总任务数判断是否达到上限，而不是基于可见任务数
        if (m.checklist.items.length >= limit) {
            console.warn("Cannot add checklist item: limit reached.");
            return;
        }
        // --- START: FIX ---
        // 错误：之前的代码 ...data 会用 data.id (值为null) 覆盖 uid()
        // 修正：显式地从 data 中提取所需字段，并使用 uid() 生成新 ID
        m.checklist.items.push({
            id: uid(),
            title: data.title,
            content: data.content,
            lastCompletedAt: null
        });
        // --- END: FIX ---
    }
    DB.meta = m;
    dispatchDataChanged();
}

/**
 * 将一个清单项标记为今天已完成。
 * @param {string} itemId - 事项的ID
 */
export function completeChecklistItem(itemId) {
    const m = DB.meta;
    const item = m.checklist.items.find(item => item.id === itemId);
    if (item) {
        // 先消耗 1 点行动力
        if (!consumeAP(1, { reason: 'checklist_complete', itemId })) return;
        item.lastCompletedAt = new Date().toISOString();
        DB.meta = m;
        dispatchDataChanged();
    }
}

/**
 * 从清单中永久删除一个事项。
 * @param {string} itemId - 事项的ID
 */
export function deleteChecklistItem(itemId) {
    const m = DB.meta;
    if (m.checklist?.items) {
        m.checklist.items = m.checklist.items.filter(item => item.id !== itemId);
        DB.meta = m;
        dispatchDataChanged();
    }
}

/**
 * 根据提供的 ID 顺序重新排列清单项。
 * @param {string[]} newOrderIds - 按新顺序排列的事项 ID 数组
 */
export function reorderChecklistItems(newOrderIds) {
    const m = DB.meta;
    if (!m.checklist?.items) return;

    // 创建一个从 id 到 item 对象的映射，以便快速查找
    const itemsMap = new Map(m.checklist.items.map(item => [item.id, item]));

    // 根据新的 ID 顺序构建新的 items 数组
    const reorderedItems = newOrderIds.map(id => itemsMap.get(id)).filter(Boolean);

    // 确保所有项目都被包含进来，以防万一
    if (reorderedItems.length !== m.checklist.items.length) {
        console.error("Reordering failed: Mismatch in item count.");
        return; // 防止数据丢失
    }

    m.checklist.items = reorderedItems;
    DB.meta = m;
    dispatchDataChanged(); // 通知 UI 刷新
}