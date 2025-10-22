

// main.js

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// --- 数据持久化设置 ---
// (修改) 根据要求，将数据根目录硬编码到指定路径
// 注意：这会降低应用的可移植性，通常用于特定的开发或调试环境
const dataDirPath = 'C:\\src\\TickLine\\data';
const logsDirPath = path.join(dataDirPath, 'logs'); // <--- 新增日志目录路径

// 确保数据和日志目录存在
if (!fs.existsSync(dataDirPath)) {
  fs.mkdirSync(dataDirPath, { recursive: true });
}
if (!fs.existsSync(logsDirPath)) { // <--- 确保日志目录存在
  fs.mkdirSync(logsDirPath, { recursive: true });
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden', // (修改) 恢复无边框窗口设置
    webPreferences: {
      // 预加载脚本，这是连接 Node.js 环境和前端页面的安全桥梁
      preload: path.join(__dirname, 'preload.js'),
      // 注意：为了安全，不建议开启 nodeIntegration
      // contextIsolation 默认为 true，保持开启
    }
  });

  win.loadFile('index.html');
  win.setMenu(null); // (修改) 添加这一行来移除菜单栏

  // 可选：打开开发者工具
  // win.webContents.openDevTools(); // 已禁用开发者工具
  
  // 添加 Ctrl+Shift+I 快捷键来打开开发者工具
  win.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools();
    }
  });
};

app.whenReady().then(() => {
  // --- 设置 IPC 通信，处理来自渲染进程的文件读写请求 ---
  ipcMain.handle('read-store', (event, fileName) => {
    const filePath = path.join(dataDirPath, fileName);
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
      }
      return null; // 文件不存在返回 null
    } catch (error) {
      console.error(`Failed to read ${fileName}:`, error);
      return null;
    }
  });

  ipcMain.handle('write-store', (event, fileName, data) => {
    const filePath = path.join(dataDirPath, fileName);
    try {
      fs.writeFileSync(filePath, data, 'utf8');
      return true;
    } catch (error) {
      console.error(`Failed to write ${fileName}:`, error);
      return false;
    }
  });
  
  // (新) 添加处理日志追加的 IPC 通信
  ipcMain.handle('append-to-log', (event, fileName, logEntryString) => {
    const filePath = path.join(logsDirPath, fileName);
    try {
      let logs = [];
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        if (content) {
            logs = JSON.parse(content);
        }
      }
      logs.push(JSON.parse(logEntryString)); // 解析传入的日志条目
      fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error(`Failed to append log to ${fileName}:`, error);
      return false;
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});