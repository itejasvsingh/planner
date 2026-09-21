const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://alignplanner.vercel.app');
  await page.waitForSelector('div[dir="auto"]'); // Wait for RN Web to render
  const html = await page.evaluate(() => {
    return document.getElementById('root').outerHTML;
  });
  console.log(html.substring(0, 500));
  await browser.close();
})();
