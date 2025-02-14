const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // URL to scrape match links
  const baseUrl = 'https://fantasy.nrl.com';

  console.log(`Scraping match links from: ${baseUrl}/match-centre/1`);
  await page.goto(`${baseUrl}/match-centre/1`);

  // Wait for the match links to load
  await page.waitForSelector('a.match-data');

  // Extract match links
  const matchLinks = await page.$$eval('a.match-data', (links) =>
    links.map((link) => link.getAttribute('href'))
  );

  // Build full URLs (avoid duplicate 'match-centre')
  const urls = matchLinks.map((path) => `${baseUrl}${path}`);
  console.log(`Found ${urls.length} match links.`);

  let headers = ['Round', 'Player', 'Team', 'POS1', 'POS2', 'Cost', 'PTS', 'MP', 'Average Points', 'TOG', 'T', 'TS', 'G', 'FG', 'TA', 'LB', 'LBA', 'TCK', 'TB', 'MT', 'OFG', 'OFH', 'ER', 'TO', 'FTF', 'MG', 'KM', 'KD', 'PC', 'SB', 'SO', 'FGO', 'SAI', 'EFIG'];
  const statColumns = await page.$$('.column[class*="js-order-by"]');
  for (const column of statColumns) {
    const header = await column.getAttribute('data-order-by');
    if (header) {
      const cleanHeader = header.replace(/^match_stats\.|^stats\./, '');
      if (!headers.includes(cleanHeader)) {
        headers.push(cleanHeader);
      }
    }
  }

  let allPlayersData = [];
  const csvFilePath = path.join(__dirname, 'NRL_stats1.csv');

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`Scraping data from: ${url}`);
    await page.goto(url);

    // Extract round number from URL
    const roundMatch = url.match(/match-centre\/(\d+)$/);
    const roundNumber = roundMatch ? roundMatch[1] : '';

    // Wait for the stats table to load
    await page.waitForSelector('.match-centre-row');

    // Extract player rows
    const rows = await page.$$('.match-centre-row');
    for (const row of rows) {
      const playerData = {
        'Round': roundNumber  // Add round number as first column
      };
      
      // Get player name and team info
      const playerInfo = await row.$('.player-info');
      if (playerInfo) {
        // Get player name
        const nameElement = await playerInfo.$('.player-name span');
        if (nameElement) {
          const playerName = await nameElement.innerText();
          playerData['Player'] = playerName.trim();
        }

        // Get team info and extract just the first team
        const opponentElement = await playerInfo.$('.player-opponent');
        if (opponentElement) {
          const opponentText = await opponentElement.innerText();
          // Extract first team abbreviation whether it's "CAN v WAR" or just "WAR"
          const teamMatch = opponentText.match(/^([A-Z]+)/);
          if (teamMatch) {
            playerData['Team'] = teamMatch[1];
          }
        }

        // Get positions and split into POS1 and POS2
        const positionsElement = await playerInfo.$('.player-positions');
        if (positionsElement) {
          const positions = await positionsElement.innerText();
          const posArray = positions.trim().split(',').map(p => p.trim());
          playerData['POS1'] = posArray[0] || '';
          playerData['POS2'] = posArray[1] || '';
        }

        // Get player cost
        const costElement = await playerInfo.$('.player-cost');
        if (costElement) {
          const cost = await costElement.innerText();
          playerData['Cost'] = cost.trim();
        }
      }

      // Get PTS (points last round)
      const ptsElement = await row.$('.column[data-order-by="stats.points_last_round"] span');
      if (ptsElement) {
        const pts = await ptsElement.innerText();
        playerData['PTS'] = pts.trim();
      }

      // Get MP (minutes played / time on ground)
      const mpElement = await row.$('.column[data-order-by="match_stats.TOG"] .score');
      if (mpElement) {
        const mp = await mpElement.innerText();
        // Clean up the value (remove parentheses and convert to number if possible)
        const cleanMp = mp.trim().replace(/[()]/g, '').replace('-', '');
        const numericMp = parseFloat(cleanMp);
        playerData['MP'] = isNaN(numericMp) ? '' : numericMp;
      }

      // Get average points
      const avgPointsElement = await row.$('.column[data-order-by="stats.avg_points"]');
      if (avgPointsElement) {
        const avgPoints = await avgPointsElement.innerText();
        playerData['Average Points'] = avgPoints.trim();
      }

      // Get all other stat values
      const statColumns = [
        { header: 'TOG', class: 'match_stats.T' },
        { header: 'T', class: 'match_stats.T' },
        { header: 'TS', class: 'match_stats.TS' },
        { header: 'G', class: 'match_stats.G' },
        { header: 'FG', class: 'match_stats.FG' },
        { header: 'TA', class: 'match_stats.TA' },
        { header: 'LB', class: 'match_stats.LB' },
        { header: 'LBA', class: 'match_stats.LBA' },
        { header: 'TCK', class: 'match_stats.TCK' },
        { header: 'TB', class: 'match_stats.TB' },
        { header: 'MT', class: 'match_stats.MT' },
        { header: 'OFG', class: 'match_stats.OFG' },
        { header: 'OFH', class: 'match_stats.OFH' },
        { header: 'ER', class: 'match_stats.ER' },
        { header: 'TO', class: 'match_stats.TO' },
        { header: 'FTF', class: 'match_stats.FTF' },
        { header: 'MG', class: 'match_stats.MG' },
        { header: 'KM', class: 'match_stats.KM' },
        { header: 'KD', class: 'match_stats.KD' },
        { header: 'PC', class: 'match_stats.PC' },
        { header: 'SB', class: 'match_stats.SB' },
        { header: 'SO', class: 'match_stats.SO' },
        { header: 'FGO', class: 'match_stats.FGO' },
        { header: 'SAI', class: 'match_stats.SAI' },
        { header: 'EFIG', class: 'match_stats.EFIG' }
      ];

      // Get all stat values
      for (const stat of statColumns) {
        const statCell = await row.$(`.column[data-order-by="${stat.class}"] .score`);
        if (statCell) {
          let statValue = await statCell.innerText();
          statValue = statValue.trim();
          
          // Keep the '-' value if that's what's shown
          if (statValue === '-') {
            playerData[stat.header] = '-';
          } else {
            // Remove parentheses if present
            statValue = statValue.replace(/[()]/g, '');
            
            // Convert to number if possible
            const numericValue = parseFloat(statValue);
            playerData[stat.header] = isNaN(numericValue) ? statValue : numericValue;
          }
        } else {
          playerData[stat.header] = '';
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