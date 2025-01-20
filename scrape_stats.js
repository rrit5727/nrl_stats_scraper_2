const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // URL to scrape match links
  const baseUrl = 'https://fantasy.nrl.com';

  console.log(`Scraping match links from: ${baseUrl}/match-centre`);
  await page.goto(`${baseUrl}/match-centre`);

  // Wait for the match links to load
  await page.waitForSelector('a.match-data');

  // Extract match links
  const matchLinks = await page.$$eval('a.match-data', (links) =>
    links.map((link) => link.getAttribute('href'))
  );

  // Build full URLs (avoid duplicate 'match-centre')
  const urls = matchLinks.map((path) => `${baseUrl}${path}`);
  console.log(`Found ${urls.length} match links.`);

  let headers = [];
  let allPlayersData = [];
  const csvFilePath = path.join(__dirname, 'NRL_stats.csv');

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`Scraping data from: ${url}`);
    await page.goto(url);

    // Wait for the stats table to load
    await page.waitForSelector('.match-centre-row');

    // Extract headers (only for the first URL)
    if (i === 0) {
      headers = ['Player']; // Start with the player name column
      const statColumns = await page.$$('.column[class*="js-order-by"]');
      for (const column of statColumns) {
        const header = await column.getAttribute('data-order-by');
        if (header) {
          headers.push(header.replace(/^match_stats\.|^stats\./, ''));
        }
      }
    }

    // Extract player rows
    const rows = await page.$$('.match-centre-row');
    for (const row of rows) {
      const playerData = {};

      // Get player name
      const playerNameElement = await row.$('.player-column');
      if (playerNameElement) {
        const playerName = await playerNameElement.innerText();
        playerData['Player'] = playerName.trim();
      }

      // Get stat values
      const statCells = await row.$$('.column[class*="js-order-by"]');
      for (let j = 0; j < statCells.length; j++) {
        if (j < headers.length - 1) { // -1 because we already have 'Player' in headers
          let statValue = await statCells[j].innerText();
          statValue = statValue.trim();

          // Handle cases where the value might be wrapped in parentheses
          if (statValue.includes('(')) {
            statValue = statValue.match(/\((.*?)\)/)?.[1] || statValue;
          }

          // Convert to a number if possible
          const numericValue = parseFloat(statValue);
          playerData[headers[j + 1]] = isNaN(numericValue) ? statValue : numericValue;
        }
      }

      allPlayersData.push(playerData);
    }
  }

  // Close the browser
  await browser.close();

  // Convert to CSV
  const csvHeaders = headers.join(',') + '\n';
  const csvRows = allPlayersData
    .map((player) => headers.map((header) => player[header] || '').join(','))
    .join('\n');
  const csvContent = csvHeaders + csvRows;

  // Write CSV to file (overwrite if exists)
  fs.writeFileSync(csvFilePath, csvContent);

  console.log(`Data has been scraped and saved to ${csvFilePath}`);
})();