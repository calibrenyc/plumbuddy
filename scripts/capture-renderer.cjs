const { app, BrowserWindow } = require('electron');
const { writeFile } = require('node:fs/promises');
const path = require('node:path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 920, show: false, webPreferences: { contextIsolation: true } });
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await win.webContents.executeJavaScript(`localStorage.setItem('plumbuddy.settings', JSON.stringify({onboardingComplete:true})); localStorage.removeItem('plumbuddy.packs'); localStorage.removeItem('plumbuddy.activities')`);
  await win.reload();
  win.webContents.setZoomFactor(1.1);
  await new Promise(resolve => setTimeout(resolve, 500));
  const image = await win.webContents.capturePage();
  await writeFile(path.join(__dirname, '..', 'qa-renderer.png'), image.toPNG());
  app.quit();
});
