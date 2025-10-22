

// preload.js

const { contextBridge, ipcRenderer } = require('electron');

// 在 window 对象上暴露一个名为 electronAPI 的全局变量
contextBridge.exposeInMainWorld('electronAPI', {
  // 暴露一个 readStore 方法
  readStore: (fileName) => ipcRenderer.invoke('read-store', fileName),
  // 暴露一个 writeStore 方法
  writeStore: (fileName, data) => ipcRenderer.invoke('write-store', fileName, data),
  // (新) 暴露一个用于追加日志的方法
  appendToLog: (fileName, logEntry) => ipcRenderer.invoke('append-to-log', fileName, logEntry),
});