// js/store.js
import { FILES, defaultMeta, state } from './constants.js';

const readStore = async (fileName) => {
  const raw = await window.electronAPI.readStore(fileName);
  try {
    if (raw) return JSON.parse(raw);
    if (fileName === FILES.meta) return defaultMeta;
    if (fileName === FILES.redemption) return {};
    if (fileName === FILES.apHistory) return [];
    return [];
  } catch (e) {
    console.error("Failed to parse store:", fileName, e);
    if (fileName === FILES.meta) return defaultMeta;
    if (fileName === FILES.redemption) return {};
    if (fileName === FILES.apHistory) return [];
    return [];
  }
};

const writeStore = (fileName, data) => window.electronAPI.writeStore(fileName, JSON.stringify(data, null, 2));

export const DB = {
  _data: {}, 
  async load() {
    this._data.meta = await readStore(FILES.meta);
    if (!this._data.meta.achievements) { this._data.meta.achievements = JSON.parse(JSON.stringify(defaultMeta.achievements)); }
    if (!this._data.meta.achievements.stats) { this._data.meta.achievements.stats = JSON.parse(JSON.stringify(defaultMeta.achievements.stats)); }
    if (this._data.meta.lastChestClaimDate === undefined) { this._data.meta.lastChestClaimDate = null; }
    if (!this._data.meta.sunkenSilver) { this._data.meta.sunkenSilver = 1; }
    if (!this._data.meta.shop) { this._data.meta.shop = JSON.parse(JSON.stringify(defaultMeta.shop)); }
    if (!this._data.meta.checklist) { this._data.meta.checklist = JSON.parse(JSON.stringify(defaultMeta.checklist)); }
    
    // --- START: 新增的代码 ---
    if (!this._data.meta.sleepState) {
        this._data.meta.sleepState = JSON.parse(JSON.stringify(defaultMeta.sleepState));
    }
    // --- END: 新增的代码 ---
    
    // --- START: MODIFIED CODE ---
    // 确保旧存档也能拥有这些数组
    if (!this._data.meta.permanentUpgrades) {
        this._data.meta.permanentUpgrades = [];
    }
    if (!this._data.meta.purchasedLimitedItems) {
        this._data.meta.purchasedLimitedItems = [];
    }
    // --- END: MODIFIED CODE ---

    this._data.daily = await readStore(FILES.daily); 
    this._data.weekly = await readStore(FILES.weekly); 
    this._data.monthly = await readStore(FILES.monthly); 
    this._data.yearly = await readStore(FILES.yearly); 
    this._data.redemption = await readStore(FILES.redemption);
    this._data.apHistory = await readStore(FILES.apHistory);
    
    Object.defineProperty(this, 'meta', { 
      get: () => this._data.meta, 
      set: (v) => { this._data.meta = v; writeStore(FILES.meta, v); } 
    });
  },
  get apHistory() { return this._data.apHistory || []; }, 
  saveAPHistory: function(list) { this._data.apHistory = list; writeStore(FILES.apHistory, list); }, 
  list: function(type) { return this._data[type] || []; },
  save: function(type, list) { this._data[type] = list; writeStore(FILES[type], list); },
  add: function(t) { const l = this.list(t.type); l.push(t); this.save(t.type, l); },
  update: function(t) { const l = this.list(t.type); const i = l.findIndex(x => x.id === t.id); if (i > -1) { l[i] = t; this.save(t.type, l); } },
  remove: function(t) { this.save(t.type, this.list(t.type).filter(x => x.id !== t.id)); }
};

export const persistSettings = () => {
  const m = DB.meta;
  m.settings.msPerPx = state.msPerPx;
  m.settings.viewportStartISO = state.viewportStart.toISOString();
  DB.meta = m;
};