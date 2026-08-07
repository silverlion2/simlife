const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

if (process.env.SIMLIFE_TEST_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.SIMLIFE_TEST_USER_DATA));
} else {
  const appData = process.env.APPDATA;

  if (appData) {
    const legacyUserData = path.join(appData, 'the-game');
    const brandedUserData = path.join(appData, 'SimLife Hearthbyte Edition');

    try {
      const legacyLocalStorage = path.join(legacyUserData, 'Local Storage');
      const brandedLocalStorage = path.join(brandedUserData, 'Local Storage');
      if (fs.existsSync(legacyLocalStorage) && !fs.existsSync(brandedLocalStorage)) {
        fs.cpSync(legacyLocalStorage, brandedLocalStorage, { recursive: true });
      }
      app.setPath('userData', brandedUserData);
    } catch (error) {
      console.warn('Failed to migrate the legacy SimLife profile', error);
    }
  }
}

let client = null;
const steamAppId = Number.parseInt(process.env.SIMLIFE_STEAM_APP_ID || '', 10);
if (Number.isInteger(steamAppId) && steamAppId > 0) {
  try {
    const steamworks = require('steamworks.js');
    client = steamworks.init(steamAppId);
    steamworks.electronEnableSteamOverlay();
  } catch (error) {
    console.warn('Failed to initialize Steamworks', error);
  }
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
