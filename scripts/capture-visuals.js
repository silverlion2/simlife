const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output', 'playwright');

async function waitForGame(page) {
  await page.waitForFunction(() => {
    const canvas = document.getElementById('game-canvas');
    return window.Game?.State?.get?.() && canvas?.clientWidth > 0 && canvas?.clientHeight > 0;
  }, null, { timeout: 60000 });
  await page.waitForTimeout(1800);
}

async function capture(page, name) {
  await page.screenshot({ path: path.join(output, `pretty-${name}.png`) });
}

async function captureRuntimeState(page, status, title, message) {
  await page.evaluate(({ status, title, message }) => {
    const overlay = document.getElementById('runtime-status');
    overlay.dataset.status = status;
    overlay.classList.remove('hidden');
    document.getElementById('runtime-status-title').textContent = title;
    document.getElementById('runtime-status-message').textContent = message;
    document.getElementById('btn-runtime-retry').classList.toggle('hidden', status !== 'error');
  }, { status, title, message });
  await capture(page, `runtime-${status}-desktop`);
}

async function openPanel(page, panelName) {
  await page.evaluate(name => {
    const panel = document.getElementById('side-panel');
    if (!panel.classList.contains('hidden') && panel.dataset.active === name) return;
    if (!panel.classList.contains('hidden') && panel.dataset.active) {
      window.Game.UI.togglePanel(panel.dataset.active);
    }
    window.Game.UI.togglePanel(name);
  }, panelName);
  await page.waitForSelector(`#side-panel:not(.hidden)[data-active="${panelName}"]`);
  await page.waitForTimeout(180);
}

async function closePanel(page) {
  await page.evaluate(() => {
    const panel = document.getElementById('side-panel');
    if (!panel.classList.contains('hidden') && panel.dataset.active) {
      window.Game.UI.togglePanel(panel.dataset.active);
    }
  });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'simlife-visual-'));
  const app = await electron.launch({
    args: [root],
    env: { ...process.env, SIMLIFE_TEST_USER_DATA: userData },
  });
  const page = await app.firstWindow({ timeout: 60000 });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error.message || error)));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  try {
    await page.waitForLoadState('domcontentloaded');
    await page.setViewportSize({ width: 1440, height: 900 });
    await capture(page, 'menu-desktop');
    await captureRuntimeState(page, 'loading', 'Preparing your world…', 'Loading local world and avatar assets.');
    await captureRuntimeState(page, 'partial', 'World ready with limited avatars', 'Some optional avatar layers were unavailable.');
    await captureRuntimeState(page, 'error', 'Graphics could not initialize', 'Retry the renderer to continue.');
    await page.evaluate(() => document.getElementById('runtime-status').classList.add('hidden'));

    await page.setViewportSize({ width: 430, height: 820 });
    await page.waitForTimeout(300);
    await capture(page, 'menu-mobile');
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.click('#btn-mm-new');
    await page.waitForSelector('#char-creation-screen:not(.hidden)');
    await page.waitForSelector('#cc-avatar-editor .avatar-editor');
    await capture(page, 'creator-desktop');

    await page.setViewportSize({ width: 430, height: 820 });
    await page.waitForTimeout(300);
    await capture(page, 'creator-mobile');
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.evaluate(() => document.getElementById('btn-cc-start').click());
    await waitForGame(page);
    await capture(page, 'game-desktop');

    const panels = ['market', 'collections', 'goals', 'activities', 'career', 'social', 'skills', 'legacy', 'campaign'];
    for (const panelName of panels) {
      await openPanel(page, panelName);
      await capture(page, `panel-${panelName}-desktop`);
    }

    await openPanel(page, 'build');
    for (const tab of ['rooms', 'furniture', 'renovate']) {
      await page.evaluate(name => window.Game.UI.setBuildPanelTab(name), tab);
      await page.waitForTimeout(120);
      await capture(page, `panel-build-${tab}-desktop`);
    }
    await closePanel(page);

    await page.evaluate(() => {
      window.Game.UI.showNotification('Object added to storage.');
      window.Game.UI.showNotification('Reward ready: Garden Patch complete.');
      window.Game.UI.showNotification('Cannot place furniture outside a room.');
    });
    await page.waitForTimeout(160);
    await capture(page, 'notifications-desktop');
    await page.evaluate(() => document.getElementById('notifications')?.replaceChildren());

    await page.evaluate(() => window.Game.UI.showEvent({
      title: 'A Neighbor Drops By',
      visual: '🌻',
      dialogue: 'Your garden is looking brighter every day.',
      desc: 'Maya brought a packet of wildflower seeds for the new yard.',
      choices: [
        { label: 'Plant them together' },
        { label: 'Save them for spring' },
      ],
    }));
    await page.waitForTimeout(120);
    await capture(page, 'event-desktop');
    await page.evaluate(() => window.Game.UI.hideEvent());

    await page.evaluate(() => window.Game.UI.playAnnouncer('A New Day Begins'));
    await page.waitForTimeout(120);
    await capture(page, 'announcer-desktop');
    await page.evaluate(() => {
      const overlay = document.getElementById('announcer-overlay');
      overlay?.classList.add('hidden');
      if (overlay) overlay.style.display = 'none';
    });

    await page.evaluate(() => {
      window.Game.Renderer.showPieMenu(window.innerWidth * 0.55, window.innerHeight * 0.45, '×', [
        { icon: '💬', label: 'Chat', callback() {} },
        { icon: '🧹', label: 'Clean', callback() {} },
        { icon: '🔧', label: 'Repair', callback() {} },
        { icon: '📦', label: 'Store', callback() {} },
      ]);
    });
    await page.waitForTimeout(700);
    await capture(page, 'interaction-wheel-desktop');
    await page.evaluate(() => window.Game.Renderer.closePieMenu());

    await page.evaluate(() => {
      const key = Object.keys(window.Game.Config.ROOMS)
        .find(roomKey => !window.Game.HomeGrowth || window.Game.HomeGrowth.isRoomUnlocked(roomKey));
      if (key) window.Game.UI.startBuild('room', key);
    });
    await page.waitForTimeout(160);
    await capture(page, 'placement-desktop');
    await page.evaluate(() => window.Game.UI.cancelBuild());

    await page.keyboard.press('Escape');
    await page.waitForSelector('#pause-overlay:not(.hidden)');
    await capture(page, 'pause-desktop');
    await page.keyboard.press('Escape');

    await page.setViewportSize({ width: 430, height: 820 });
    await page.waitForTimeout(500);
    await capture(page, 'game-mobile');

    await openPanel(page, 'activities');
    await capture(page, 'panel-activities-mobile');
    await openPanel(page, 'build');
    await page.evaluate(() => window.Game.UI.setBuildPanelTab('furniture'));
    await page.waitForTimeout(120);
    await capture(page, 'panel-build-mobile');
    await closePanel(page);

    await page.keyboard.press('Escape');
    await page.waitForSelector('#pause-overlay:not(.hidden)');
    await capture(page, 'pause-mobile');
  } finally {
    await app.close();
    fs.rmSync(userData, { recursive: true, force: true });
  }

  if (errors.length) {
    throw new Error(`Visual capture logged runtime errors:\n${errors.join('\n')}`);
  }
  console.log(`Captured visual review set in ${output}`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
