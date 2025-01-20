const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Navigate to the page
  await page.goto('https://fantasy.nrl.com/match-centre/27/1112710');

  // Wait for the stats table to load
  await page.waitForSelector('.match-centre-row');

  // Initialize arrays for player data
  const playersData = [];

  // Extract headers
  const headers = ['Player']; // Start with the player name column
  const statColumns = await page.$$('.column[class*="js-order-by"]');
  for (const column of statColumns) {
    const header = await column.getAttribute('data-order-by');
    if (header) {
      headers.push(header.replace(/^match_stats\.|^stats\./, ''));
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

    // Get stat values - Updated selector to match the actual structure
    const statCells = await row.$$('.column[class*="js-order-by"]');
    for (let i = 0; i < statCells.length; i++) {
      if (i < headers.length - 1) { // -1 because we already have 'Player' in headers
        let statValue = await statCells[i].innerText();
        statValue = statValue.trim();

        // Handle cases where the value might be wrapped in parentheses
        if (statValue.includes('(')) {
          statValue = statValue.match(/\((.*?)\)/)?.[1] || statValue;
        }

        // Convert to a number if possible
        const numericValue = parseFloat(statValue);
        playerData[headers[i + 1]] = isNaN(numericValue) ? statValue : numericValue;
      }
    }

    playersData.push(playerData);
  }

  // Close the browser
  await browser.close();

  // Convert to CSV
  const csvFilePath = path.join(__dirname, 'rugby_stats.csv');
  const csvHeaders = headers.join(',') + '\n';
  const csvRows = playersData
    .map((player) => headers.map((header) => player[header] || '').join(','))
    .join('\n');
  const csvContent = csvHeaders + csvRows;

  // Write CSV to file
  fs.writeFileSync(csvFilePath, csvContent);

  console.log(`Data has been scraped and saved to rugby_stats.csv`);
})();