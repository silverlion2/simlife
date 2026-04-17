const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await page.goto('http://localhost:8095/');
  await page.waitForTimeout(1000); 
  await page.click('#start-btn');
  
  // Wait 0.5s for announcer overlay
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'C:/Users/T480S/.gemini/antigravity/brain/897c6e93-d46e-4b95-bf4d-2c90b4763fd2/metal_slug_announcer.png' });
  
  // Wait for announcer to clear
  await page.waitForTimeout(2000);
  
  // Force hover highlight and spawn some explosions
  await page.evaluate(() => {
     if (window.Game && Game.State.get().house.furniture.length > 0) {
         const furn = Game.State.get().house.furniture[0];
         Game.UI.hoveredFurnId = furn.id;
         Game.Renderer.spawnParticles(furn.x + 0.5, furn.y + 0.5, 40, '#ffcc00');
     }
  });
  
  await page.waitForTimeout(50);
  await page.screenshot({ path: 'C:/Users/T480S/.gemini/antigravity/brain/897c6e93-d46e-4b95-bf4d-2c90b4763fd2/metal_slug_indicator.png' });
  
  // Force pie menu
  await page.evaluate(() => {
     if (window.Game && Game.State.get().house.furniture.length > 0) {
         const furn = Game.State.get().house.furniture[0];
         // mock showPieMenu since it's an internal function exported on Game.UI? No, it's not exported.
         // Wait, showPieMenu is not exported! I can't call it. 
         // I'll just skip the pie menu picture, we took one earlier anyway.
     }
  });
  
  await browser.close();
})();
