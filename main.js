const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const steamworks = require('steamworks.js');

let client;
try {
  client = steamworks.init(480);
  steamworks.electronEnableSteamOverlay();
} catch (e) {
  console.warn('Failed to initialize Steamworks', e);
  client = null;
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  ipcMain.handle('steam-get-name', () => {
    return client ? client.localplayer.getName() : 'Guest';
  });
  ipcMain.handle('steam-activate-achievement', (event, achId) => {
    if (client) {
      try {
        client.achievement.activate(achId);
        return true;
      } catch (err) {
        console.error(err);
      }
    }
    return false;
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
