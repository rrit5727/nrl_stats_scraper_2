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

  // Build full URLs
  const urls = matchLinks.map((path) => `${baseUrl}${path}`);
  console.log(`Found ${urls.length} match links.`);

  // Manually removed TOG column - check if this affects the correct allocation of stats to columns
  let headers = ['Round', 'Player', 'Team', 'Age', 'POS1', 'POS2', 'Price', 'Priced at', 'PTS', 'MP', 'AVG', 'T', 'TS', 'G', 'FG', 'TA', 'LB', 'LBA', 'TCK', 'TB', 'MT', 'OFG', 'OFH', 'ER', 'TO', 'FTF', 'MG', 'KM', 'KD', 'PC', 'SB', 'SO', 'FDO', 'SAI', 'EFIG', '', 'Total base', '', 'Base exceeds price premium'];
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
    const roundMatch = url.match(/match-centre\/(\d+)/);
    const roundNumber = roundMatch ? roundMatch[1] : '';
    console.log(`Processing round: ${roundNumber}`);

    // Wait for the stats table to load
    await page.waitForSelector('.match-centre-row');

    // Extract player rows
    const rows = await page.$$('.match-centre-row');
    for (const row of rows) {
      const playerData = {
        'Round': roundNumber,
        'Age': '',  // Add empty Age column
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

        // Get player cost and convert to number
        const costElement = await playerInfo.$('.player-cost');
        if (costElement) {
          const cost = await costElement.innerText();
          // Remove '$' and 'K', convert to number and multiply by 1000
          const priceNumber = parseInt(cost.replace(/[\$K]/g, '')) * 1000;
          playerData['Price'] = priceNumber;
          
          // Calculate 'Priced at' value
          playerData['Priced at'] = Math.round(priceNumber / 13700);
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

      // Get average points and round to nearest number
      const avgPointsElement = await row.$('.column[data-order-by="stats.avg_points"]');
      if (avgPointsElement) {
        const avgPoints = await avgPointsElement.innerText();
        playerData['AVG'] = Math.round(parseFloat(avgPoints.trim()));
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
        { header: 'FDO', class: 'match_stats.FDO' },
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

      // Calculate Total base
      const baseStats = ['G', 'TCK', 'TB', 'MT', 'OFG', 'OFH', 'ER', 'MG', 'KM', 'KD', 'FDO', 'EFIG'];
      let totalBase = 0;

      // Sum up base stats
      for (const stat of baseStats) {
        if (playerData[stat] && playerData[stat] !== '-') {
          totalBase += parseFloat(playerData[stat]) || 0;
        }
      }

      // Add TA/2 for HLF or WFB positions
      if ((playerData['POS1'] === 'HLF' || playerData['POS2'] === 'HLF' || 
           playerData['POS1'] === 'WFB' || playerData['POS2'] === 'WFB') && 
          playerData['TA'] && playerData['TA'] !== '-') {
        totalBase += (parseFloat(playerData['TA']) || 0) / 2;
      }

      // Add TS for WFB position
      if ((playerData['POS1'] === 'WFB' || playerData['POS2'] === 'WFB') && 
          playerData['TS'] && playerData['TS'] !== '-') {
        totalBase += parseFloat(playerData['TS']) || 0;
      }

      playerData['Total base'] = totalBase;

      // Calculate Base exceeds price premium
      if (playerData['Priced at'] !== undefined) {
        playerData['Base exceeds price premium'] = totalBase - playerData['Priced at'];
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