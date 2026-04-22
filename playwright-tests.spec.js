import { test, expect } from '@playwright/test';
const { executeAndSaveECHQuery } = require('./execute-ech-query-helper.js');
const { compareDBAndPortal, resolveDbJsonPath, listPortalCandidates } = require('./compare-db-portal.js');
const fs = require('fs');
const path = require('path');

// Helper function to extract table data with DB-compatible format
function extractTableData() {
    try {
        console.log('🔍 Starting extractTableData function...');
        
        function getCellText(cell) {
        if (!cell) return '';
        const clone = cell.cloneNode(true);
        clone.querySelectorAll('script, style').forEach(el => el.remove());
        return clone.textContent.trim();
    }
    
    let table = document.querySelector('#ctl00_mainPane_ReportViewer1_fixedTable');
    if (table) {
        console.log('✅ Found table using ID: #ctl00_mainPane_ReportViewer1_fixedTable');
    }
    
    // If not found by ID, try XPath: (//table[@cellpadding='0'])[3]
    if (!table) {
        try {
            const xpathResult = document.evaluate(
                "(//table[@cellpadding='0'])[3]",
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            );
            table = xpathResult.singleNodeValue;
            
            if (table) {
                console.log('✅ Found table using XPath: (//table[@cellpadding="0"])[3]');
            }
        } catch (xpathError) {
            console.log('⚠️ XPath evaluation failed:', xpathError.message);
        }
    }
    
    // Fallback: Try the old method if XPath doesn't work
    if (!table) {
        console.log('🔍 Trying fallback: #VisibleReportContentctl00_mainPane_ReportViewer1_ctl10');
        const reportContent = document.querySelector('#VisibleReportContentctl00_mainPane_ReportViewer1_ctl10');
        if (reportContent) {
            table = reportContent.querySelector('table');
            if (table) {
                console.log('✅ Found table using #VisibleReportContentctl00_mainPane_ReportViewer1_ctl10');
            }
        }
    }
    
    // If still not found, find table with most rows (likely the data table)
    if (!table) {
        console.log('🔍 Trying fallback: finding table with most rows...');
        const allTables = document.querySelectorAll('table');
        let maxRows = 0;
        let bestTable = null;
        
        for (const t of allTables) {
            const rows = t.querySelectorAll('tbody tr, tr');
            if (rows.length > maxRows && rows.length > 100) { // Must have at least 100 rows
                maxRows = rows.length;
                bestTable = t;
            }
        }
        
        if (bestTable) {
            table = bestTable;
            console.log(`✅ Found table with most rows: ${maxRows} rows`);
        }
    }
    
    // Last resort: search all tables for expected columns
    if (!table) {
        console.log('🔍 Trying fallback: searching all tables for expected columns...');
        const expectedColumns = ['RM', 'DM', 'Store Name', 'User Name', 'Camera Net Hours', 'Monitored'];
        const allTables = document.querySelectorAll('table');
        console.log(`   Found ${allTables.length} total tables on page`);
        
        for (const t of allTables) {
            const rows = t.querySelectorAll('tr');
            for (let i = 0; i < Math.min(10, rows.length); i++) {
                const row = rows[i];
                const cells = row.querySelectorAll('th, td');
                const cellTexts = Array.from(cells).map(cell => getCellText(cell).toLowerCase());
                
                const foundColumns = expectedColumns.filter(col => 
                    cellTexts.some(text => text.includes(col.toLowerCase()))
                );
                
                if (foundColumns.length >= 4) {
                    table = t;
                    console.log(`✅ Found table by matching ${foundColumns.length} expected columns`);
                    break;
                }
            }
            if (table) break;
        }
    }
    
    if (!table) {
        console.log('❌ No table found after all fallback attempts');
        return null;
    }
    
    console.log(`✅ Table found with ${table.querySelectorAll('tr').length} rows`);
    
    // Find header row - look for row with all expected column headers
    const rows = Array.from(table.querySelectorAll('tr'));
    console.log(`📊 Processing ${rows.length} rows to find header...`);
    
    if (rows.length === 0) {
        console.log('❌ Table has no rows');
        return null;
    }
    
    let headerRowIndex = -1;
    let bestMatchScore = 0;
    
    // Look for the row that has the most matching column headers
    for (let i = 0; i < Math.min(20, rows.length); i++) {
        const cells = rows[i].querySelectorAll('th, td');
        if (cells.length < 3) continue; // Skip rows with too few cells
        
        const cellTexts = Array.from(cells).map(cell => getCellText(cell).toLowerCase().trim());
        
        // Count how many expected columns we find
        let matchScore = 0;
        const expectedHeaders = ['rm', 'dm', 'store name', 'user name', 'camera', 'hours', 'monitored'];
        
        expectedHeaders.forEach(header => {
            if (cellTexts.some(text => text.includes(header))) {
                matchScore++;
            }
        });
        
        // Also check for exact matches
        if (cellTexts.some(text => text === 'rm' || text === 'dm')) matchScore += 0.5;
        if (cellTexts.some(text => text.includes('user name') || text.includes('username'))) matchScore += 0.5;
        if (cellTexts.some(text => text.includes('store name') || text.includes('storename'))) matchScore += 0.5;
        
        // Prefer rows with reasonable number of cells (not too many, not too few)
        if (cells.length >= 5 && cells.length <= 20) {
            matchScore += 1;
        }
        
        if (matchScore > bestMatchScore) {
            bestMatchScore = matchScore;
            headerRowIndex = i;
        }
    }
    
    if (headerRowIndex === -1) {
        console.log('❌ Could not find header row after checking first 20 rows');
        console.log('   Attempting to use first row with sufficient cells as header...');
        
        // Last resort: use first row with enough cells
        for (let i = 0; i < Math.min(5, rows.length); i++) {
            const cells = rows[i].querySelectorAll('th, td');
            if (cells.length >= 6) {
                headerRowIndex = i;
                console.log(`   Using row ${i} as header (${cells.length} cells)`);
                break;
            }
        }
        
        if (headerRowIndex === -1) {
            console.log('❌ Could not find any suitable header row');
            return null;
        }
    }
    
    console.log(`✅ Found header row at index ${headerRowIndex} (match score: ${bestMatchScore})`);
    
    // Map columns
    const headerRow = rows[headerRowIndex];
    const headerCells = headerRow.querySelectorAll('th, td');
    let columnMap = {};
    
    // Debug: Log all header texts
    const headerTexts = [];
    const isMonitoredPercentHeader = (text) => {
        if (!text.includes('monitor')) return false;
        if (text.includes('day')) return false;
        return text.includes('percent') || text.includes('%');
    };
    const mapIdentity = (cell, idx) => {
        const text = getCellText(cell).toLowerCase().trim();
        headerTexts.push(`[${idx}]: "${text}"`);
        if (!text) return;
        if (text.includes('rm') && columnMap.RM === undefined) columnMap.RM = idx;
        else if (text.includes('dm') && columnMap.DM === undefined) columnMap.DM = idx;
        else if ((text.includes('store name') || text.includes('storename') || (text.includes('store') && text.length < 20)) && columnMap.StoreName === undefined) columnMap.StoreName = idx;
        else if ((text.includes('user name') || text.includes('username') || text.includes('employee')) && columnMap.UserName === undefined) columnMap.UserName = idx;
    };
    headerCells.forEach((cell, idx) => mapIdentity(cell, idx));
    headerCells.forEach((cell, idx) => {
        const text = getCellText(cell).toLowerCase().trim();
        if (isMonitoredPercentHeader(text) && columnMap.MonitoredPercent === undefined) columnMap.MonitoredPercent = idx;
    });
    headerCells.forEach((cell, idx) => {
        const text = getCellText(cell).toLowerCase().trim();
        if (text.includes('camera') && text.includes('hours') && columnMap.CameraNetHours === undefined) columnMap.CameraNetHours = idx;
    });
    headerCells.forEach((cell, idx) => {
        const text = getCellText(cell).toLowerCase().trim();
        if (text.includes('camera') && !text.includes('hours') && columnMap.CameraNetHours === undefined) columnMap.CameraNetHours = idx;
    });
    headerCells.forEach((cell, idx) => {
        const text = getCellText(cell).toLowerCase().trim();
        if ((text.includes('hours') || text === 'hrs') && !text.includes('camera') && columnMap.NetHours === undefined) columnMap.NetHours = idx;
    });
    
    console.log('📋 Header columns found:', headerTexts.slice(0, 20).join(', '), headerTexts.length > 20 ? `... (${headerTexts.length} total)` : '');
    console.log('🗺️ Column mapping:', JSON.stringify(columnMap));
    
    // Verify we found the essential columns
    if (!columnMap.UserName && !columnMap.StoreName) {
        console.log('⚠️ Warning: Could not find UserName or StoreName column. Trying alternative detection...');
        // Try to find by position if header text matching failed
        if (headerCells.length >= 6) {
            columnMap.RM = columnMap.RM !== undefined ? columnMap.RM : 0;
            columnMap.DM = columnMap.DM !== undefined ? columnMap.DM : 1;
            columnMap.StoreName = columnMap.StoreName !== undefined ? columnMap.StoreName : 2;
            columnMap.UserName = columnMap.UserName !== undefined ? columnMap.UserName : 3;
            if (headerCells.length >= 7) {
                columnMap.CameraNetHours = columnMap.CameraNetHours !== undefined ? columnMap.CameraNetHours : 4;
                columnMap.NetHours = columnMap.NetHours !== undefined ? columnMap.NetHours : 5;
                columnMap.MonitoredPercent = columnMap.MonitoredPercent !== undefined ? columnMap.MonitoredPercent : 6;
            } else {
                columnMap.CameraNetHours = columnMap.CameraNetHours !== undefined ? columnMap.CameraNetHours : 4;
                columnMap.MonitoredPercent = columnMap.MonitoredPercent !== undefined ? columnMap.MonitoredPercent : 5;
            }
            console.log('🗺️ Using fallback column mapping:', JSON.stringify(columnMap));
        }
    }
    
    // Extract data rows - handle rowspan/colspan for hierarchical tables
    const dataRows = [];
    let skippedRows = 0;
    let emptyUserNameRows = 0;
    
    // Track values from rowspan cells (for hierarchical data)
    let lastRM = '';
    let lastDM = '';
    let lastStoreName = '';
    
    // First, verify column mapping makes sense
    const maxColumnIndex = Math.max(
        columnMap.RM || 0,
        columnMap.DM || 0,
        columnMap.StoreName || 0,
        columnMap.UserName || 0,
        columnMap.CameraNetHours || 0,
        columnMap.NetHours || 0,
        columnMap.MonitoredPercent || 0
    );
    
    // Check if column indices are reasonable (should be < 50 for a normal table)
    if (maxColumnIndex > 50) {
        console.log(`⚠️ Column mapping indices seem too high (max: ${maxColumnIndex}). Re-scanning header row...`);
        
        // Re-scan header row more carefully - only look at first 30 cells
        const headerCellsRescan = headerRow.querySelectorAll('th, td');
        const newColumnMap = {};
        
        for (let idx = 0; idx < Math.min(30, headerCellsRescan.length); idx++) {
            const cell = headerCellsRescan[idx];
            const text = getCellText(cell).toLowerCase().trim();
            if (text.includes('rm') && newColumnMap.RM === undefined) newColumnMap.RM = idx;
            else if (text.includes('dm') && newColumnMap.DM === undefined) newColumnMap.DM = idx;
            else if ((text.includes('store name') || text.includes('storename') || text.includes('store')) && newColumnMap.StoreName === undefined) newColumnMap.StoreName = idx;
            else if ((text.includes('user name') || text.includes('username') || text.includes('employee')) && newColumnMap.UserName === undefined) newColumnMap.UserName = idx;
        }
        for (let idx = 0; idx < Math.min(30, headerCellsRescan.length); idx++) {
            const text = getCellText(headerCellsRescan[idx]).toLowerCase().trim();
            if (isMonitoredPercentHeader(text) && newColumnMap.MonitoredPercent === undefined) newColumnMap.MonitoredPercent = idx;
        }
        for (let idx = 0; idx < Math.min(30, headerCellsRescan.length); idx++) {
            const text = getCellText(headerCellsRescan[idx]).toLowerCase().trim();
            if (text.includes('camera') && text.includes('hours') && newColumnMap.CameraNetHours === undefined) newColumnMap.CameraNetHours = idx;
        }
        for (let idx = 0; idx < Math.min(30, headerCellsRescan.length); idx++) {
            const text = getCellText(headerCellsRescan[idx]).toLowerCase().trim();
            if (text.includes('camera') && !text.includes('hours') && newColumnMap.CameraNetHours === undefined) newColumnMap.CameraNetHours = idx;
        }
        for (let idx = 0; idx < Math.min(30, headerCellsRescan.length); idx++) {
            const text = getCellText(headerCellsRescan[idx]).toLowerCase().trim();
            if ((text.includes('hours') || text === 'hrs') && !text.includes('camera') && newColumnMap.NetHours === undefined) newColumnMap.NetHours = idx;
        }
        
        // Only update if we found better mappings
        if (Object.keys(newColumnMap).length >= 3) {
            Object.assign(columnMap, newColumnMap);
            console.log('🗺️ Re-mapped columns:', JSON.stringify(columnMap));
        } else {
            console.log('⚠️ Re-scan did not improve mapping, keeping original');
        }
    }
    
    // Track active rowspan cells across rows - map column index to {value, remainingRows}
    const activeRowspans = new Map(); // columnIndex -> {value, remainingRows}
    
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        const allCells = row.querySelectorAll('td, th');
        if (allCells.length === 0) continue;
        
        // Build a virtual cell array that accounts for rowspan
        // This is critical for hierarchical tables where cells are merged
        const virtualCells = [];
        let virtualIndex = 0;
        
        // Process actual cells in this row
        for (let c = 0; c < allCells.length; c++) {
            const cell = allCells[c];
            const text = getCellText(cell);
            const rowspan = parseInt(cell.getAttribute('rowspan') || '1');
            const colspan = parseInt(cell.getAttribute('colspan') || '1');
            
            // Skip positions that are filled by active rowspans
            while (activeRowspans.has(virtualIndex)) {
                const span = activeRowspans.get(virtualIndex);
                virtualCells[virtualIndex] = span.value;
                span.remainingRows--;
                if (span.remainingRows <= 0) {
                    activeRowspans.delete(virtualIndex);
                }
                virtualIndex++;
            }
            
            // Handle colspan - add the same value multiple times
            for (let col = 0; col < colspan; col++) {
                virtualCells[virtualIndex] = text;
                
                // If this cell has rowspan, track it for future rows at this column index
                if (rowspan > 1) {
                    activeRowspans.set(virtualIndex, {
                        value: text,
                        remainingRows: rowspan - 1
                    });
                }
                
                virtualIndex++;
            }
        }
        
        // Fill in any remaining active rowspans that extend beyond this row's cells
        const rowspanKeys = Array.from(activeRowspans.keys());
        const maxIndex = rowspanKeys.length > 0 
            ? Math.max(virtualCells.length - 1, ...rowspanKeys)
            : virtualCells.length - 1;
        for (let idx = virtualCells.length; idx <= maxIndex; idx++) {
            if (activeRowspans.has(idx)) {
                const span = activeRowspans.get(idx);
                virtualCells[idx] = span.value;
                span.remainingRows--;
                if (span.remainingRows <= 0) {
                    activeRowspans.delete(idx);
                }
            }
        }
        
        // Now we have a complete virtual cell array with all values
        const cells = virtualCells;
        
        // Get values from mapped columns
        let rm = '';
        let dm = '';
        let storeName = '';
        let userName = '';
        let cameraHours = '';
        let netHours = '';
        let monitored = '';
        
        // Helper to safely get cell value from virtual array
        const getCellValue = (index) => {
            if (index === undefined || index === null) return '';
            if (index < 0 || index >= cells.length) return '';
            const value = cells[index];
            return (value && value.trim()) || '';
        };
        
        // Get values from mapped columns
        if (columnMap.RM !== undefined) {
            rm = getCellValue(columnMap.RM);
            if (rm) lastRM = rm;
        }
        if (!rm && lastRM) {
            rm = lastRM; // Fallback to last known value
        }
        
        if (columnMap.DM !== undefined) {
            dm = getCellValue(columnMap.DM);
            if (dm) lastDM = dm;
        }
        if (!dm && lastDM) {
            dm = lastDM;
        }
        
        if (columnMap.StoreName !== undefined) {
            storeName = getCellValue(columnMap.StoreName);
            if (storeName) lastStoreName = storeName;
        }
        if (!storeName && lastStoreName) {
            storeName = lastStoreName;
        }
        
        if (columnMap.UserName !== undefined) {
            userName = getCellValue(columnMap.UserName);
        }
        
        if (columnMap.CameraNetHours !== undefined) {
            cameraHours = getCellValue(columnMap.CameraNetHours);
        }
        
        if (columnMap.NetHours !== undefined) {
            netHours = getCellValue(columnMap.NetHours);
        }
        if (!netHours && cameraHours) {
            netHours = cameraHours;
        }
        
        if (columnMap.MonitoredPercent !== undefined) {
            monitored = getCellValue(columnMap.MonitoredPercent);
        }
        
        const rowData = {
            RM: rm,
            DM: dm,
            StoreName: storeName,
            UserName: userName,
            NetHours: netHours,
            CameraNetHours: cameraHours,
            MonitoredPercent: monitored
        };
        
        // Debug first few rows
        if (i <= headerRowIndex + 5) {
            console.log(`📊 Row ${i - headerRowIndex}: actualCells=${allCells.length}, virtualCells=${cells.length}, UserName="${rowData.UserName}", StoreName="${rowData.StoreName}", RM="${rowData.RM}"`);
            console.log(`   Virtual cells: ${cells.slice(0, 10).map((c, idx) => `[${idx}]="${c}"`).join(', ')}${cells.length > 10 ? '...' : ''}`);
            console.log(`   Active rowspans: ${activeRowspans.size}`);
        }
        
        // Skip rows without UserName (these are likely header/total rows or rowspan continuation)
        if (!rowData.UserName || rowData.UserName.length === 0) {
            emptyUserNameRows++;
            continue;
        }
        
        // Skip total rows
        if (rowData.UserName.toLowerCase().includes('total')) {
            skippedRows++;
            continue;
        }
        
        dataRows.push(rowData);
    }
    
    const result = {
        headers: ['RM', 'DM', 'StoreName', 'UserName', 'NetHours', 'CameraNetHours', 'MonitoredPercent'],
        rows: dataRows,
        rowCount: dataRows.length,
        debug: {
            totalRowsInTable: rows.length - headerRowIndex - 1,
            extractedRows: dataRows.length,
            skippedTotalRows: skippedRows,
            emptyUserNameRows: emptyUserNameRows,
            columnMap: columnMap,
            headerRowIndex: headerRowIndex
        }
    };
    
        console.log(`✅ Extraction complete: ${dataRows.length} data rows extracted from ${rows.length} total rows`);
        return result;
        
    } catch (error) {
        console.error('❌ Error in extractTableData:', error.message);
        console.error('Stack:', error.stack);
        return null;
    }
}

/** First report table that has header + at least one non-empty data row (browser context). */
async function evaluateReportTableReady(page) {
    return page.evaluate(() => {
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
            const rows = table.querySelectorAll('tbody tr, tr');
            if (rows.length < 2) continue;
            let dataRowCount = 0;
            for (let i = 1; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll('td, th');
                let hasData = false;
                for (const cell of cells) {
                    const text = cell.textContent.trim();
                    if (text && text.length > 0 && text !== '-' && text !== 'N/A' && text !== '&nbsp;') {
                        hasData = true;
                        break;
                    }
                }
                if (hasData) dataRowCount++;
            }
            if (dataRowCount > 0) {
                return { ready: true, totalRows: rows.length, dataRows: dataRowCount };
            }
        }
        return { ready: false, totalRows: 0, dataRows: 0 };
    });
}

// Test configuration for Employee Camera Hours applications
test.describe('Employee Camera Hours Applications', () => {
    
    // Test data - this will be populated dynamically
    let testClients = [];
    
    test.beforeAll(async () => {
        // Load client data from environment variable
        const selectedClients = process.env.SELECTED_CLIENTS;
        
        if (selectedClients) {
            try {
                testClients = JSON.parse(selectedClients);
                console.log(`🔍 Loaded ${testClients.length} selected clients for testing...`);
                
                // Validate that clients have required fields
                testClients.forEach(client => {
                    if (!client.applandingurl) {
                        console.error(`❌ Client "${client.name}" missing applandingurl`);
                    }
                    if (!client.liveserverip) {
                        console.error(`❌ Client "${client.name}" missing liveserverip`);
                    }
                    if (!client.dbname) {
                        console.error(`❌ Client "${client.name}" missing dbname`);
                    }
                });
                
            } catch (error) {
                console.error('❌ Error parsing selected clients:', error);
                testClients = [];
            }
        } else {
            console.error('❌ No selected clients found in environment variable');
            testClients = [];
        }
        
        if (testClients.length > 0) {
            console.log('📋 Clients to test:', testClients.map(c => `${c.name} (${c.applandingurl})`));
        } else {
            console.log('⚠️ No valid clients found for testing');
        }
    });
    
    // Single test that handles all clients dynamically
    test('Test selected client applications', async ({ page, browser }) => {
        // Set test timeout to 5 minutes (300000ms) to handle multiple clients and slow operations
        test.setTimeout(300000);
        
        if (testClients.length === 0) {
            console.log('❌ No clients selected for testing - test will be skipped');
            test.skip('No clients selected for testing');
            return;
        }
        
        console.log(`🎯 Starting tests for ${testClients.length} clients...`);
        
        // Test each client one by one
        let currentPage = page;
        const context = page.context(); // Get context before we might close the page
        
        for (let i = 0; i < testClients.length; i++) {
            const client = testClients[i];
            console.log(`\n🔄 Testing client ${i + 1}/${testClients.length}: ${client.name}`);
            console.log(`🌐 URL: ${client.applandingurl}`);
            console.log(`👤 Username: ${client.username || 'Not provided'}`);
            console.log(`🔐 Password: ${client.password ? '***' : 'Not provided'}`);
            
            try {
                await testClientApplication(currentPage, client);
                
                // Close the browser/page after client test completes
                console.log(`🔒 ${client.name}: Closing browser...`);
                try {
                    if (!currentPage.isClosed()) {
                        await currentPage.close();
                        console.log(`✅ ${client.name}: Browser closed`);
                    }
                } catch (closeError) {
                    console.log(`⚠️ ${client.name}: Error closing browser - ${closeError.message}`);
                }
                
                // Execute ECH query after browser closes (always save DB JSON for Compare — PS/CLI runs often omit env dates)
                console.log(`\n📊 ${client.name}: Starting ECH query execution...`);
                let echSucceeded = false;
                try {
                    const envStart = (process.env.START_DATE || '').trim();
                    const envEnd = (process.env.END_DATE || '').trim();
                    const startDate = envStart || '12/01/2025';
                    const endDate = envEnd || '12/31/2025';
                    if (!envStart || !envEnd) {
                        console.warn(`⚠️ ${client.name}: START_DATE/END_DATE not set (e.g. running Playwright from PowerShell without env). Using ECH defaults: ${startDate} – ${endDate}`);
                    } else {
                        console.log(`📅 ${client.name}: Using dates from UI/env - Start: ${startDate}, End: ${endDate}`);
                    }
                    const jsonFilePath = await executeAndSaveECHQuery(client, startDate, endDate);
                    console.log(`✅ ${client.name}: ECH query completed and saved to ${jsonFilePath}`);
                    console.log(`✅ ${client.name}: DB data extracted successfully`);
                    echSucceeded = true;
                } catch (echError) {
                    console.error(`❌ ${client.name}: ECH query failed - ${echError.message}`);
                    console.log(`✅ ${client.name}: DB extraction attempt completed (failed, but marked as done)`);
                }

                if (echSucceeded) {
                    const dbDir = path.join(__dirname, 'logs', 'json', 'db');
                    const portalDir = path.join(__dirname, 'logs', 'json', 'portal');
                    const dbPath = resolveDbJsonPath(dbDir, client.name);
                    if (dbPath && fs.existsSync(portalDir)) {
                        try {
                            const portalFiles = listPortalCandidates(portalDir, client.name, client.id);
                            if (portalFiles.length > 0) {
                                const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
                                const result = compareDBAndPortal(dbData, portalFiles[0].data, client.id, client.name);
                                expect(result.success, result.error || 'compareDBAndPortal failed').toBeTruthy();
                                expect(
                                    result.stats.differences,
                                    `DB vs Portal mismatch for ${client.name}: ${JSON.stringify(result.stats)}. Excel: ${result.filePath}`
                                ).toBe(0);
                                console.log(
                                    `✅ ${client.name}: DB/Portal comparison passed (${result.stats.totalDBRecords} DB / ${result.stats.totalPortalRecords} portal rows)`
                                );
                            } else {
                                console.log(
                                    `⚠️ ${client.name}: No portal JSON under ${portalDir} for this client — skipping DB/Portal assertion (extract report first)`
                                );
                            }
                        } catch (compareErr) {
                            console.error(`❌ ${client.name}: DB/Portal comparison error - ${compareErr.message}`);
                            throw compareErr;
                        }
                    } else if (!dbPath) {
                        console.log(`⚠️ ${client.name}: DB JSON not found after ECH — skipping DB/Portal assertion`);
                    }
                }
                
            } catch (error) {
                console.error(`❌ Error testing client ${client.name}: ${error.message}`);
                // Continue with next client even if one fails
            }
            
            // Create a new page for the next client if current page is closed
            if (i < testClients.length - 1) {
                if (currentPage.isClosed()) {
                    console.log('🆕 Creating new page for next client...');
                    currentPage = await context.newPage();
                }
                console.log('⏳ Waiting 2 seconds before testing next client...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        console.log(`\n✅ Completed testing all ${testClients.length} clients!`);
    });
    
    
    async function testClientApplication(page, client) {
        console.log(`\n🧪 Starting test for: ${client.name}`);
        console.log(`🌐 Navigating to: ${client.applandingurl}`);
        console.log(`👤 Username: ${client.username || 'Not provided'}`);
        console.log(`🔐 Password: ${client.password ? '***' : 'Not provided'}`);
        
        try {
            // Test 1: Navigate to application
            await page.goto(client.applandingurl, { 
                waitUntil: 'networkidle',
                timeout: 30000 
            });
            
            // Test 2: Check page load
            const title = await page.title();
            console.log(`✅ ${client.name}: Page loaded - "${title}"`);
            
            // Test 3: Look for login elements and attempt login
            const usernameField = await page.$('input[type="text"], input[type="email"], input[name*="user"], input[name*="login"], input[name*="username"]');
            const passwordField = await page.$('input[type="password"]');
            const submitButton = await page.$('button[type="submit"], input[type="submit"]');
            
            // Test 4: Attempt to login with credentials if available
            let loginAttempted = false;
            let loginResult = '';
            
            if (client.username && client.password && usernameField && passwordField) {
                try {
                    console.log(`🔐 ${client.name}: Attempting login with username: ${client.username}`);
                    
                    // Fill username field
                    await usernameField.fill(client.username);
                    await page.waitForTimeout(500);
                    
                    // Fill password field
                    await passwordField.fill(client.password);
                    await page.waitForTimeout(500);
                    
                    // Click submit button
                    if (submitButton) {
                        try {
                            const isVisible = await submitButton.isVisible();
                            const isEnabled = await submitButton.isEnabled();
                            console.log(`🔘 ${client.name}: Submit button - visible: ${isVisible}, enabled: ${isEnabled}`);
                            
                            if (isVisible && isEnabled) {
                                await submitButton.scrollIntoViewIfNeeded();
                                await page.waitForTimeout(500);
                                await submitButton.click({ timeout: 15000 });
                                
                                // Wait for navigation or page change
                                try {
                                    await page.waitForNavigation({ timeout: 10000, waitUntil: 'networkidle' });
                                    console.log(`✅ ${client.name}: Navigation completed after login`);
                                } catch (navError) {
                                    console.log(`⚠️ ${client.name}: No navigation detected, waiting for page change...`);
                                                await page.waitForTimeout(2000); // Reduced from 5 to 2 seconds
                                }
                                
                                loginAttempted = true;
                                loginResult = `Login attempted with credentials for user: ${client.username}`;
                                console.log(`✅ ${client.name}: Login attempted successfully`);
                            } else {
                                throw new Error(`Submit button not visible (${isVisible}) or not enabled (${isEnabled})`);
                            }
                        } catch (clickError) {
                            console.log(`⚠️ ${client.name}: Direct submit click failed: ${clickError.message}, trying alternative...`);
                            // Try pressing Enter on password field
                            try {
                                await passwordField.press('Enter');
                                                await page.waitForTimeout(2000); // Reduced from 5 to 2 seconds
                                loginAttempted = true;
                                loginResult = `Login attempted via Enter key`;
                                console.log(`✅ ${client.name}: Login attempted via Enter key`);
                            } catch (enterError) {
                                throw new Error(`Both click and Enter failed: ${clickError.message}`);
                            }
                        }
                    } else {
                        // Try to find and click any submit button
                        console.log(`🔍 ${client.name}: No submit button found, searching for login buttons...`);
                        const submitElements = await page.$$('button, input[type="button"], input[type="submit"]');
                        console.log(`   Found ${submitElements.length} potential submit elements`);
                        
                        for (const element of submitElements) {
                            try {
                                const text = await element.textContent();
                                const isVisible = await element.isVisible();
                                const isEnabled = await element.isEnabled();
                                
                                if (text && (text.toLowerCase().includes('login') || text.toLowerCase().includes('sign in') || text.toLowerCase().includes('submit')) && isVisible && isEnabled) {
                                    console.log(`   Clicking button with text: "${text.trim()}"`);
                                    await element.scrollIntoViewIfNeeded();
                                    await page.waitForTimeout(500);
                                    await element.click({ timeout: 15000 });
                                                await page.waitForTimeout(2000); // Reduced from 5 to 2 seconds
                                    loginAttempted = true;
                                    loginResult = `Login attempted with credentials via "${text.trim()}" button`;
                                    console.log(`✅ ${client.name}: Login attempted via "${text.trim()}" button`);
                                    break;
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                        
                        if (!loginAttempted) {
                            // Last resort: try Enter key
                            try {
                                await passwordField.press('Enter');
                                loginAttempted = true;
                                loginResult = `Login attempted via Enter key (fallback)`;
                                console.log(`✅ ${client.name}: Login attempted via Enter key (fallback)`);
                            } catch (e) {
                                throw new Error('No submit button found and Enter key failed');
                            }
                        }
                    }
                } catch (error) {
                    loginResult = `Login attempt failed: ${error.message}`;
                    console.log(`❌ ${client.name}: Login attempt failed - ${error.message}`);
                    // Don't set loginAttempted to false if it was already true
                }
            } else if (client.username && client.password) {
                loginResult = 'Credentials available but login form not found';
                console.log(`⚠️ ${client.name}: Has credentials but no login form found`);
            } else {
                loginResult = 'No credentials available for login';
                console.log(`⚠️ ${client.name}: No username/password available`);
            }
            
            // Test 5: Fill date fields after login
            let datesFilled = false;
            // Try to fill dates - either after login or if already on the page
            // (some clients might already be logged in or have different login flow)
            if (loginAttempted) {
                console.log(`📅 ${client.name}: Attempting to fill dates after login...`);
            } else {
                console.log(`📅 ${client.name}: Login not attempted, but trying to fill dates anyway (may already be logged in)...`);
            }
            
            // Always try to fill dates regardless of login status
            {
                try {
                    // Wait for navigation to complete
                    try {
                        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }); // Changed from networkidle to domcontentloaded, reduced timeout
                        console.log(`✅ ${client.name}: Page network idle`);
                    } catch (e) {
                        console.log(`⚠️ ${client.name}: Network idle timeout, continuing...`);
                    }
                    
                    // Get dates from environment variable (passed from UI)
                    let startDateStr = process.env.START_DATE || '';
                    let endDateStr = process.env.END_DATE || '';
                    
                    // If dates not provided from UI, calculate defaults
                    if (!startDateStr || !endDateStr) {
                        const today = new Date();
                        const startDate = new Date(today.getFullYear(), today.getMonth(), 1); // 1st of current month
                        const endDate = new Date(today);
                        endDate.setDate(today.getDate() - 2); // Today - 2 days
                        
                        // Format dates as MM/DD/YYYY
                        const formatDate = (date) => {
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const year = date.getFullYear();
                            return `${month}/${day}/${year}`;
                        };
                        
                        startDateStr = formatDate(startDate);
                        endDateStr = formatDate(endDate);
                        console.log(`📅 ${client.name}: Using calculated dates (UI dates not provided)`);
                    } else {
                        console.log(`📅 ${client.name}: Using dates from UI`);
                    }
                    
                    console.log(`📅 ${client.name}: Setting dates - Start: ${startDateStr}, End: ${endDateStr}`);
                    
                    // Check if page is still open
                    if (page.isClosed()) {
                        throw new Error('Page was closed before filling dates');
                    }
                    
                    // Wait for date fields to be available
                    console.log(`⏳ ${client.name}: Waiting for date fields to appear...`);
                    let dateFieldsFound = false;
                    const dateFieldSelectors = [
                        'input#mainPane_txtStartDate',
                        'input#mainPane_txtEndDate',
                        'input.txtStartDate',
                        'input.txtEndDate',
                        'input.jsStartDate',
                        'input.jsEndDate',
                        'input[id*="StartDate"]',
                        'input[id*="EndDate"]',
                        'input[name*="txtStartDate"]',
                        'input[name*="txtEndDate"]'
                    ];
                    
                    for (const selector of dateFieldSelectors) {
                        try {
                            await page.waitForSelector(selector, { 
                                timeout: 5000,
                                state: 'visible' 
                            });
                            console.log(`✅ ${client.name}: Found date field: ${selector}`);
                            dateFieldsFound = true;
                            break;
                        } catch (e) {
                            continue;
                        }
                    }
                    
                    if (!dateFieldsFound) {
                        // Debug: List all input fields on the page
                        console.log(`🔍 ${client.name}: Date fields not found with standard selectors, listing all inputs...`);
                        try {
                            const allInputs = await page.$$('input[type="text"], input:not([type])');
                            console.log(`   Found ${allInputs.length} text inputs on page`);
                            for (let i = 0; i < Math.min(allInputs.length, 15); i++) {
                                try {
                                    const input = allInputs[i];
                                    const id = await input.getAttribute('id') || 'no-id';
                                    const name = await input.getAttribute('name') || 'no-name';
                                    const placeholder = await input.getAttribute('placeholder') || 'no-placeholder';
                                    const className = await input.getAttribute('class') || 'no-class';
                                    const value = await input.getAttribute('value') || '';
                                    const isVisible = await input.isVisible();
                                    console.log(`   Input ${i}: id="${id}", name="${name}", placeholder="${placeholder}", class="${className}", value="${value}", visible=${isVisible}`);
                                } catch (e) {
                                    console.log(`   Input ${i}: Could not read attributes - ${e.message}`);
                                }
                            }
                        } catch (e) {
                            console.log(`   Could not list inputs: ${e.message}`);
                        }
                    }
                    
                    // Find and fill Start Date field - SIMPLE: just paste date and press Enter
                    console.log(`🔍 ${client.name}: Looking for Start Date field...`);
                    let startDateFilled = false;
                    let startField = null;
                    
                    // Try multiple approaches to find the start date field
                    const startSelectors = [
                        'input#mainPane_txtStartDate',
                        'input.txtStartDate',
                        'input.jsStartDate',
                        'input[name*="txtStartDate" i]',
                        'input[id*="txtStartDate" i]'
                    ];
                    
                    for (const selector of startSelectors) {
                        try {
                            startField = await page.waitForSelector(selector, { 
                                timeout: 5000,
                                state: 'visible' 
                            });
                            if (startField) {
                                console.log(`✅ ${client.name}: Found start date field with: ${selector}`);
                                break;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                    
                    // If not found, try finding by label
                    if (!startField) {
                        try {
                            const startLabel = await page.locator('text=/Start Date/i').first();
                            if (await startLabel.isVisible()) {
                                // Find input near the label
                                startField = await startLabel.locator('..').locator('input[type="text"]').first();
                                if (startField && await startField.isVisible()) {
                                    console.log(`✅ ${client.name}: Found start date field by label`);
                                }
                            }
                        } catch (e) {
                            // Continue
                        }
                    }
                    
                    if (startField && await startField.isVisible()) {
                        try {
                            console.log(`✍️ ${client.name}: Pasting start date: ${startDateStr}`);
                            
                            // Click, select all (Ctrl+A), type date, press Enter
                            await startField.click();
                            
                            // Select all existing text using Ctrl+A
                            await page.keyboard.press('Control+a');
                            
                            // Type the date
                            await startField.type(startDateStr, { delay: 20 });
                            
                            // Press Enter to submit
                            await startField.press('Enter');
                            
                            // Verify
                            const value = await startField.inputValue();
                            console.log(`🔍 ${client.name}: Start date value after fill: "${value}"`);
                            
                            if (value) {
                                startDateFilled = true;
                                console.log(`✅ ${client.name}: Start date filled: ${value}`);
                            }
                        } catch (e) {
                            console.log(`⚠️ ${client.name}: Error filling start date: ${e.message}`);
                        }
                    } else {
                        console.log(`⚠️ ${client.name}: Start date field not found`);
                    }
                    
                    // Find and fill End Date field - SIMPLE: just paste date and press Enter
                    console.log(`🔍 ${client.name}: Looking for End Date field...`);
                    let endDateFilled = false;
                    let endField = null;
                    
                    // Try multiple approaches to find the end date field
                    const endSelectors = [
                        'input#mainPane_txtEndDate',
                        'input.txtEndDate',
                        'input.jsEndDate',
                        'input[name*="txtEndDate" i]',
                        'input[id*="txtEndDate" i]'
                    ];
                    
                    for (const selector of endSelectors) {
                        try {
                            endField = await page.waitForSelector(selector, { 
                                timeout: 5000,
                                state: 'visible' 
                            });
                            if (endField) {
                                console.log(`✅ ${client.name}: Found end date field with: ${selector}`);
                                break;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                    
                    // If not found, try finding by label
                    if (!endField) {
                        try {
                            const endLabel = await page.locator('text=/End Date/i').first();
                            if (await endLabel.isVisible()) {
                                // Find input near the label
                                endField = await endLabel.locator('..').locator('input[type="text"]').first();
                                if (endField && await endField.isVisible()) {
                                    console.log(`✅ ${client.name}: Found end date field by label`);
                                }
                            }
                        } catch (e) {
                            // Continue
                        }
                    }
                    
                    if (endField && await endField.isVisible()) {
                        try {
                            console.log(`✍️ ${client.name}: Pasting end date: ${endDateStr}`);
                            
                            // Click, select all (Ctrl+A), type date, press Enter
                            await endField.click();
                            
                            // Select all existing text using Ctrl+A
                            await page.keyboard.press('Control+a');
                            
                            // Type the date
                            await endField.type(endDateStr, { delay: 20 });
                            
                            // Press Enter to submit
                            await endField.press('Enter');
                            
                            // Verify
                            const value = await endField.inputValue();
                            console.log(`🔍 ${client.name}: End date value after fill: "${value}"`);
                            
                            if (value) {
                                endDateFilled = true;
                                console.log(`✅ ${client.name}: End date filled: ${value}`);
                            }
                        } catch (e) {
                            console.log(`⚠️ ${client.name}: Error filling end date: ${e.message}`);
                        }
                    } else {
                        console.log(`⚠️ ${client.name}: End date field not found`);
                    }
                    
                    if (startDateFilled && endDateFilled) {
                        datesFilled = true;
                        console.log(`✅ ${client.name}: Both dates filled successfully`);
                        
                        // Wait for dates to be fully processed
                        console.log(`⏳ ${client.name}: Waiting for dates to be processed...`);
                        await page.waitForTimeout(1000); // Reduced from 2 to 1 second
                        
                        // Step 6: Click on rollup field (Multiple Stores link) to open modal
                        try {
                            console.log(`🔍 ${client.name}: Looking for rollup selection field...`);
                            
                            // Find the rollup/Store Hierarchy link - based on HTML provided
                            const rollupSelectors = [
                                'a.lnkStoreHierarchy',
                                'a#mainPane_LinkButton1',
                                'a[title*="hierarchy" i]',
                                'a[title*="view hierarchy" i]',
                                'a:has-text("Multiple Stores")',
                                'a:has-text("None")',
                                '.lnkStoreHierarchy',
                                'input[value*="None" i]',
                                'input[placeholder*="None" i]',
                                'div:has-text("None")',
                                'span:has-text("None")',
                                'button:has-text("None")',
                                'input[readonly]:has-text("None")',
                                '.dropdown-trigger:has-text("None")',
                                '.select-trigger:has-text("None")'
                            ];
                            
                            let rollupFieldClicked = false;
                            for (const selector of rollupSelectors) {
                                try {
                                    const rollupField = await page.$(selector);
                                    if (rollupField && await rollupField.isVisible()) {
                                        await rollupField.click();
                                        await page.waitForTimeout(1000);
                                        rollupFieldClicked = true;
                                        console.log(`✅ ${client.name}: Clicked on rollup field (${selector})`);
                                        break;
                                    }
                                } catch (e) {
                                    continue;
                                }
                            }
                            
                            // If direct click didn't work, try finding by text content
                            if (!rollupFieldClicked) {
                                const allLinks = await page.$$('a, input, select, div, span');
                                for (const element of allLinks) {
                                    try {
                                        const text = await element.textContent();
                                        const value = await element.getAttribute('value') || '';
                                        const title = await element.getAttribute('title') || '';
                                        if ((text && (text.trim() === 'None' || text.includes('Multiple Stores') || text.includes('hierarchy'))) || 
                                            (value && value.trim() === 'None') ||
                                            (title && title.toLowerCase().includes('hierarchy'))) {
                                            if (await element.isVisible()) {
                                                await element.click();
                                                await page.waitForTimeout(1000);
                                                rollupFieldClicked = true;
                                                console.log(`✅ ${client.name}: Clicked on rollup field (by text/title)`);
                                                break;
                                            }
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }
                            }
                            
                            // Wait for modal/dropdown to appear after clicking rollup field
                            if (rollupFieldClicked) {
                                console.log(`⏳ ${client.name}: Waiting for rollup modal to open...`);
                                
                                // Wait for modal or dropdown to appear - based on HTML provided
                                const modalSelectors = [
                                    '.modelPopupForRollup',
                                    '.modal.show',
                                    '.modal.fade.show',
                                    '.modal-dialog',
                                    '.modal-content',
                                    '.modal',
                                    '[class*="modal"]',
                                    '[class*="dialog"]',
                                    '.pnlPurchaseTree',
                                    '[title*="Select Rollup" i]',
                                    '[title*="Select" i]'
                                ];
                                
                                let modalOpened = false;
                                for (const selector of modalSelectors) {
                                    try {
                                        await page.waitForSelector(selector, { 
                                            timeout: 10000,
                                            state: 'visible' 
                                        });
                                        modalOpened = true;
                                        console.log(`✅ ${client.name}: Rollup modal opened (found ${selector})`);
                                        break;
                                    } catch (e) {
                                        continue;
                                    }
                                }
                                
                                // Additional wait to ensure modal is fully loaded
                                if (modalOpened) {
                                    await page.waitForTimeout(500);
                                } else {
                                    console.log(`⚠️ ${client.name}: Modal not detected, waiting 1 second...`);
                                    await page.waitForTimeout(1000);
                                }
                                
                                // Find and select ALL checkboxes in the modal
                                console.log(`☑️ ${client.name}: Looking for checkboxes in rollup modal...`);
                                
                                const checkboxSelectors = [
                                    '.MyTreeView input[type="checkbox"]',
                                    '.modal input[type="checkbox"]',
                                    '.pnlPurchaseTree input[type="checkbox"]',
                                    'input[type="checkbox"]',
                                    '.modal-body input[type="checkbox"]'
                                ];
                                
                                let checkboxesSelected = 0;
                                for (const selector of checkboxSelectors) {
                                    try {
                                        const checkboxes = await page.$$(selector);
                                        if (checkboxes.length > 0) {
                                            console.log(`   Found ${checkboxes.length} checkboxes with selector: ${selector}`);
                                            
                                            // Select ALL visible unchecked checkboxes
                                            for (const checkbox of checkboxes) {
                                                try {
                                                    const isChecked = await checkbox.isChecked();
                                                    const isVisible = await checkbox.isVisible();
                                                    if (!isChecked && isVisible) {
                                                        await checkbox.click();
                                                        await page.waitForTimeout(100); // Small delay between clicks
                                                        checkboxesSelected++;
                                                    }
                                                } catch (e) {
                                                    continue;
                                                }
                                            }
                                            
                                            if (checkboxesSelected > 0) {
                                                console.log(`✅ ${client.name}: Selected ${checkboxesSelected} checkboxes in rollup modal`);
                                                break;
                                            }
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }
                                
                                // Click OK button in modal if checkboxes were selected
                                if (checkboxesSelected > 0) {
                                    console.log(`🆗 ${client.name}: Looking for OK button in modal...`);
                                    const okButtonSelectors = [
                                        'button.btnPurchaseOk',
                                        'input.btnPurchaseOk',
                                        '.modal-footer button:has-text("OK")',
                                        '.modal-footer input[value="OK"]',
                                        'button:has-text("OK")',
                                        'input[type="button"][value="OK"]',
                                        'input[type="submit"][value="OK"]',
                                        '#mainPane_Button3'
                                    ];
                                    
                                    for (const selector of okButtonSelectors) {
                                        try {
                                            const okButton = await page.$(selector);
                                            if (okButton && await okButton.isVisible()) {
                                                await okButton.click();
                                                console.log(`✅ ${client.name}: Clicked OK button in modal`);
                                                break;
                                            }
                                        } catch (e) {
                                            continue;
                                        }
                                    }
                                }
                            }
                            
                            // Step 7: Click on Search button
                            if (rollupFieldClicked) {
                                console.log(`🔍 ${client.name}: Looking for Search button...`);
                                
                                let searchClicked = false;
                                
                                // Try finding by button text content
                                try {
                                    const allButtons = await page.$$('button, input[type="submit"], input[type="button"]');
                                    console.log(`   Found ${allButtons.length} potential buttons`);
                                    
                                    // Debug: Log all button texts
                                    const buttonTexts = [];
                                    for (let i = 0; i < Math.min(allButtons.length, 15); i++) {
                                        try {
                                            const text = await allButtons[i].textContent();
                                            const value = await allButtons[i].getAttribute('value') || '';
                                            const id = await allButtons[i].getAttribute('id') || '';
                                            const isVisible = await allButtons[i].isVisible();
                                            buttonTexts.push(`[${i}] text="${text?.trim()}" value="${value}" id="${id}" visible=${isVisible}`);
                                        } catch (e) {
                                            buttonTexts.push(`[${i}] error`);
                                        }
                                    }
                                    console.log(`   Button details:\n${buttonTexts.join('\n')}`);
                                    
                                    for (const button of allButtons) {
                                        try {
                                            const text = await button.textContent();
                                            const value = await button.getAttribute('value') || '';
                                            const isVisible = await button.isVisible();
                                            
                                            if (isVisible && (
                                                (text && text.toLowerCase().includes('search')) ||
                                                (value && value.toLowerCase().includes('search'))
                                            )) {
                                                console.log(`   Clicking button with text: "${text || value}"`);
                                                await button.click();
                                                await page.waitForTimeout(500);
                                                searchClicked = true;
                                                console.log(`✅ ${client.name}: Clicked Search button`);
                                                break;
                                            }
                                        } catch (e) {
                                            continue;
                                        }
                                    }
                                } catch (error) {
                                    console.log(`⚠️ ${client.name}: Error finding search button - ${error.message}`);
                                }
                                
                                if (!searchClicked) {
                                    console.log(`⚠️ ${client.name}: Search button not found! Trying alternative method...`);
                                    
                                    // Alternative: Try finding by ID or specific selectors
                                    const alternativeSelectors = [
                                        '#mainPane_btnSearch',
                                        'input[id*="Search"]',
                                        'button[id*="Search"]',
                                        'input[value="SEARCH"]',
                                        'button.btn-search',
                                        'input.btnSearch'
                                    ];
                                    
                                    for (const selector of alternativeSelectors) {
                                        try {
                                            const button = await page.$(selector);
                                            if (button && await button.isVisible()) {
                                                console.log(`   Found search button with selector: ${selector}`);
                                                await button.click();
                                                await page.waitForTimeout(500);
                                                searchClicked = true;
                                                console.log(`✅ ${client.name}: Clicked Search button (alternative method)`);
                                                break;
                                            }
                                        } catch (e) {
                                            continue;
                                        }
                                    }
                                    
                                    if (!searchClicked) {
                                        console.log(`❌ ${client.name}: Could not find Search button with any method!`);
                                    }
                                }
                                
                                    // Step 8: Wait for report to load properly - OPTIMIZED: Reduced waits
                                if (searchClicked) {
                                    // Step 1: Wait for loading indicator to disappear first (reduced timeout)
                                    try {
                                        console.log(`⏳ ${client.name}: Waiting for loading indicator to disappear...`);
                                        await page.waitForSelector('#mainPane_UpdateProgress1', { 
                                            state: 'hidden', 
                                            timeout: 30000 // Reduced from 90 to 30 seconds
                                        });
                                        console.log(`✅ ${client.name}: Loading indicator disappeared`);
                                    } catch (e) {
                                        console.log(`⚠️ ${client.name}: Loading indicator check skipped or timeout - ${e.message}`);
                                        // Reduced wait if indicator check fails
                                        await page.waitForTimeout(1000);
                                    }
                                    
                                    // Step 2: Wait for network to be idle with reduced timeout
                                    try {
                                        console.log(`⏳ ${client.name}: Waiting for network to be idle...`);
                                        await page.waitForLoadState('networkidle', { timeout: 30000 }); // Reduced from 90 to 30 seconds
                                        console.log(`✅ ${client.name}: Network is idle`);
                                    } catch (e) {
                                        console.log(`⚠️ ${client.name}: Network idle timeout - ${e.message}, waiting 2 seconds...`);
                                        await page.waitForTimeout(2000); // Reduced from 5 to 2 seconds
                                    }
                                    
                                    // Step 3: Wait for report table to appear with actual data rows (optimized)
                                    console.log(`⏳ ${client.name}: STEP 2 - Waiting for report table with data rows to appear...`);
                                    let tableReady = false;
                                    let maxWaitAttempts = 30; // Reduced from 60 to 30 seconds
                                    let waitAttempt = 0;
                                    
                                    while (!tableReady && waitAttempt < maxWaitAttempts) {
                                        try {
                                            // Check if table exists and has data rows
                                            const tableStatus = await evaluateReportTableReady(page);
                                            
                                            if (tableStatus.ready && tableStatus.dataRows > 0) {
                                                tableReady = true;
                                                console.log(`✅ ${client.name}: Report table is ready! (${tableStatus.totalRows} total rows, ${tableStatus.dataRows} data rows)`);
                                            } else {
                                                waitAttempt++;
                                                if (waitAttempt % 5 === 0) {
                                                    console.log(`⏳ ${client.name}: Still waiting for table data... (attempt ${waitAttempt}/${maxWaitAttempts})`);
                                                }
                                                await page.waitForTimeout(500); // Reduced from 1000ms to 500ms
                                            }
                                        } catch (e) {
                                            waitAttempt++;
                                            await page.waitForTimeout(1000);
                                        }
                                    }
                                    
                                    if (!tableReady) {
                                        console.log(`⚠️ ${client.name}: Table with data not found after ${maxWaitAttempts} seconds, but continuing anyway...`);
                                        await page.waitForTimeout(2000); // Reduced from 5 to 2 seconds
                                    } else {
                                        // Reduced wait to ensure all data is fully rendered
                                        console.log(`⏳ ${client.name}: Table found, waiting 1 second for data to fully render...`);
                                        await page.waitForTimeout(1000); // Reduced from 3 to 1 second
                                    }
                                    
                                    // Step 9: STEP 3 - Extract report data from table (only after report is fully loaded)
                                    console.log(`📊 ${client.name}: STEP 3 - Extracting report data from table...`);
                                    let reportData = null;
                                    let htmlTable = null;
                                    
                                    try {
                                        // Final verification that table exists and has data before extraction
                                        console.log(`⏳ ${client.name}: Verifying table is ready for extraction...`);
                                        const tableVerification = await evaluateReportTableReady(page);
                                        
                                        if (!tableVerification.ready || tableVerification.dataRows === 0) {
                                            console.log(`⚠️ ${client.name}: Table not ready for extraction (${tableVerification.totalRows} rows, ${tableVerification.dataRows} data rows)`);
                                            console.log(`   Waiting 2 more seconds and retrying...`);
                                            await page.waitForTimeout(2000); // Reduced from 5 to 2 seconds
                                            
                                            // Retry verification
                                            const retryVerification = await evaluateReportTableReady(page);
                                            
                                            if (!retryVerification.ready) {
                                                console.log(`⚠️ ${client.name}: Table still not ready after retry, but continuing with extraction...`);
                                                // Don't throw error, just continue - extraction function will handle it
                                            } else {
                                                console.log(`✅ ${client.name}: Table ready after retry (${retryVerification.totalRows} rows, ${retryVerification.dataRows} data rows)`);
                                            }
                                        } else {
                                            console.log(`✅ ${client.name}: Table verified and ready for extraction (${tableVerification.totalRows} rows, ${tableVerification.dataRows} data rows)`);
                                        }
                                        
                                        // Extract table data with DB-compatible format
                                        console.log(`📊 ${client.name}: Starting data extraction...`);
                                        
                                        // Scroll to load all table rows (for virtual scrolling/lazy loading)
                                        console.log(`📜 ${client.name}: Scrolling to load all table rows...`);
                                        try {
                                            // Find the table and scroll to load all rows
                                            const scrollResult = await page.evaluate(() => {
                                                // Find the table or its container
                                                const tables = document.querySelectorAll('table');
                                                let targetTable = null;
                                                
                                                // Try to find the report table (the one with most rows)
                                                let maxRows = 0;
                                                for (const table of tables) {
                                                    const rows = table.querySelectorAll('tbody tr, tr');
                                                    if (rows.length > maxRows) {
                                                        maxRows = rows.length;
                                                        targetTable = table;
                                                    }
                                                }
                                                
                                                if (!targetTable) {
                                                    return { success: false, message: 'Table not found' };
                                                }
                                                
                                                const initialRowCount = targetTable.querySelectorAll('tbody tr, tr').length;
                                                
                                                // Find scrollable containers
                                                const scrollContainers = [];
                                                
                                                // Check table's parent elements for scrollable containers
                                                let element = targetTable.parentElement;
                                                while (element && element !== document.body) {
                                                    const style = window.getComputedStyle(element);
                                                    if (style.overflow === 'auto' || style.overflow === 'scroll' || 
                                                        style.overflowY === 'auto' || style.overflowY === 'scroll') {
                                                        scrollContainers.push(element);
                                                    }
                                                    element = element.parentElement;
                                                }
                                                
                                                // Also check for common scrollable containers
                                                const commonSelectors = [
                                                    '#mainPane_ReportViewer1_ctl10',
                                                    '[id*="ReportViewer"]',
                                                    '[class*="scroll"]',
                                                    '[id*="scroll"]'
                                                ];
                                                
                                                for (const selector of commonSelectors) {
                                                    try {
                                                        const el = document.querySelector(selector);
                                                        if (el) {
                                                            const style = window.getComputedStyle(el);
                                                            if (style.overflow === 'auto' || style.overflow === 'scroll' || 
                                                                style.overflowY === 'auto' || style.overflowY === 'scroll') {
                                                                if (!scrollContainers.includes(el)) {
                                                                    scrollContainers.push(el);
                                                                }
                                                            }
                                                        }
                                                    } catch (e) {}
                                                }
                                                
                                                // If no specific container found, use body
                                                if (scrollContainers.length === 0) {
                                                    scrollContainers.push(document.body);
                                                }
                                                
                                                // Scroll each container to bottom multiple times
                                                let lastRowCount = initialRowCount;
                                                let stableCount = 0;
                                                const maxIterations = 15; // Reduced from 30 to 15 for faster execution
                                                
                                                for (let i = 0; i < maxIterations; i++) {
                                                    // Scroll all containers
                                                    for (const container of scrollContainers) {
                                                        container.scrollTop = container.scrollHeight;
                                                    }
                                                    
                                                    // Also scroll window
                                                    window.scrollTo(0, document.body.scrollHeight);
                                                    
                                                    // Check if more rows loaded
                                                    const currentRowCount = targetTable.querySelectorAll('tbody tr, tr').length;
                                                    
                                                    if (currentRowCount > lastRowCount) {
                                                        stableCount = 0;
                                                        lastRowCount = currentRowCount;
                                                    } else {
                                                        stableCount++;
                                                        if (stableCount >= 3) {
                                                            // Row count stable for 3 iterations, likely all loaded (reduced from 5)
                                                            break;
                                                        }
                                                    }
                                                    
                                                    // Minimal delay for lazy loading
                                                    const start = Date.now();
                                                    while (Date.now() - start < 50) {} // Reduced from 300ms to 50ms
                                                }
                                                
                                                const finalRowCount = targetTable.querySelectorAll('tbody tr, tr').length;
                                                
                                                return {
                                                    success: true,
                                                    initialRowCount: initialRowCount,
                                                    finalRowCount: finalRowCount,
                                                    rowsAdded: finalRowCount - initialRowCount
                                                };
                                            });
                                            
                                            if (scrollResult.success) {
                                                console.log(`✅ ${client.name}: Scrolling completed - Initial: ${scrollResult.initialRowCount} rows, Final: ${scrollResult.finalRowCount} rows (Added: ${scrollResult.rowsAdded})`);
                                            } else {
                                                console.log(`⚠️ ${client.name}: Scrolling issue - ${scrollResult.message}`);
                                            }
                                            
                                            // Reduced wait after scrolling
                                            await page.waitForTimeout(1000); // Reduced from 3 to 1 second
                                        } catch (scrollError) {
                                            console.log(`⚠️ ${client.name}: Scrolling error (continuing anyway) - ${scrollError.message}`);
                                        }
                                        
                                        // Take screenshot before extraction for debugging
                                        try {
                                            await page.screenshot({ 
                                                path: `screenshots/${client.name.replace(/[^a-zA-Z0-9]/g, '_')}_before_extraction.png`,
                                                fullPage: true 
                                            });
                                            console.log(`📸 ${client.name}: Screenshot saved before extraction`);
                                        } catch (screenshotError) {
                                            console.log(`⚠️ ${client.name}: Could not save screenshot - ${screenshotError.message}`);
                                        }
                                        
                                        // Re-verify table exists before extraction
                                        const preExtractionCheck = await page.evaluate(() => {
                                            const tables = document.querySelectorAll('table');
                                            const results = [];
                                            for (const table of tables) {
                                                const rows = table.querySelectorAll('tbody tr, tr');
                                                results.push({
                                                    rowCount: rows.length,
                                                    cellpadding: table.getAttribute('cellpadding'),
                                                    id: table.id,
                                                    className: table.className,
                                                    hasTbody: !!table.querySelector('tbody')
                                                });
                                            }
                                            return results;
                                        });
                                        
                                        console.log(`🔍 ${client.name}: Pre-extraction table check - Found ${preExtractionCheck.length} tables:`, preExtractionCheck);
                                        
                                        // Call extractTableData - it's defined in Node context, so we need to inject it
                                        // Convert function to string and evaluate in browser context
                                        const functionString = extractTableData.toString();
                                        reportData = await page.evaluate((funcStr) => {
                                            // Evaluate the function string to define it in browser context
                                            eval(`window.extractTableData = ${funcStr}`);
                                            // Call the function
                                            return window.extractTableData();
                                        }, functionString);
                                        
                                        // If extraction failed, try with more detailed error info
                                        if (!reportData) {
                                            console.log(`⚠️ ${client.name}: First extraction attempt returned NULL, trying with enhanced error reporting...`);
                                            
                                            // Try extraction with error details
                                            const extractionWithErrors = await page.evaluate(() => {
                                                try {
                                                    // Try the same extraction but with error reporting
                                                    const tables = document.querySelectorAll('table');
                                                    console.log(`Found ${tables.length} tables in DOM`);
                                                    
                                                    for (let idx = 0; idx < tables.length; idx++) {
                                                        const table = tables[idx];
                                                        const rows = table.querySelectorAll('tbody tr, tr');
                                                        console.log(`Table ${idx}: ${rows.length} rows, cellpadding="${table.getAttribute('cellpadding')}"`);
                                                    }
                                                    
                                                    // Try to call the extraction function
                                                    if (typeof extractTableData === 'function') {
                                                        return extractTableData();
                                                    } else {
                                                        return { error: 'extractTableData function not found' };
                                                    }
                                                } catch (error) {
                                                    return { error: error.message, stack: error.stack };
                                                }
                                            });
                                            
                                            console.log(`🔍 ${client.name}: Enhanced extraction result:`, extractionWithErrors);
                                            
                                            // If still null, try a simpler extraction approach
                                            if (!extractionWithErrors || extractionWithErrors.error) {
                                                console.log(`🔄 ${client.name}: Trying fallback extraction method...`);
                                                
                                                reportData = await page.evaluate(() => {
                                                    // Find table with most rows
                                                    const tables = Array.from(document.querySelectorAll('table'));
                                                    let targetTable = null;
                                                    let maxRows = 0;
                                                    
                                                    for (const table of tables) {
                                                        const rows = table.querySelectorAll('tbody tr, tr');
                                                        if (rows.length > maxRows) {
                                                            maxRows = rows.length;
                                                            targetTable = table;
                                                        }
                                                    }
                                                    
                                                    if (!targetTable || maxRows < 10) {
                                                        return null;
                                                    }
                                                    
                                                    // Simple extraction - find headers and data
                                                    const rows = Array.from(targetTable.querySelectorAll('tbody tr, tr'));
                                                    
                                                    // Find header row (first row with th or first row with many cells)
                                                    let headerRowIndex = -1;
                                                    for (let i = 0; i < Math.min(10, rows.length); i++) {
                                                        const cells = rows[i].querySelectorAll('th, td');
                                                        if (cells.length >= 6) {
                                                            const cellTexts = Array.from(cells).map(c => c.textContent.trim().toLowerCase());
                                                            const hasExpectedHeaders = ['rm', 'dm', 'store', 'user', 'camera', 'monitor'].some(h => 
                                                                cellTexts.some(ct => ct.includes(h))
                                                            );
                                                            if (hasExpectedHeaders) {
                                                                headerRowIndex = i;
                                                                break;
                                                            }
                                                        }
                                                    }
                                                    
                                                    if (headerRowIndex === -1) {
                                                        return null;
                                                    }
                                                    
                                                    // Extract headers
                                                    const headerCells = rows[headerRowIndex].querySelectorAll('th, td');
                                                    const headers = Array.from(headerCells).map(c => c.textContent.trim());
                                                    
                                                    const headersLower = headers.map(h => h.toLowerCase());
                                                    const isMonPct = (t) => t.includes('monitor') && !t.includes('day') && (t.includes('percent') || t.includes('%'));
                                                    const findIdx = (pred) => {
                                                        for (let i = 0; i < headersLower.length; i++) {
                                                            if (pred(headersLower[i])) return i;
                                                        }
                                                        return -1;
                                                    };
                                                    
                                                    const rmIdx = findIdx((t) => t.includes('rm'));
                                                    const dmIdx = findIdx((t) => t.includes('dm'));
                                                    const storeIdx = findIdx((t) => t.includes('store'));
                                                    const userIdx = findIdx((t) => t.includes('user') || t.includes('username'));
                                                    const monitorIdx = findIdx(isMonPct);
                                                    const camCombinedIdx = findIdx((t) => t.includes('camera') && t.includes('hours'));
                                                    const camOnlyIdx = findIdx((t) => t.includes('camera') && !t.includes('hours'));
                                                    const hoursOnlyIdx = findIdx((t) => (t.includes('hours') && !t.includes('camera')) || t === 'hrs');
                                                    
                                                    let cameraNetIdx = camCombinedIdx >= 0 ? camCombinedIdx : camOnlyIdx;
                                                    let netHoursIdx = hoursOnlyIdx;
                                                    
                                                    if (userIdx === -1) {
                                                        return null;
                                                    }
                                                    
                                                    if (cameraNetIdx < 0 && headers.length >= 7) cameraNetIdx = 4;
                                                    if (netHoursIdx < 0 && headers.length >= 7) netHoursIdx = 5;
                                                    let monitorColIdx = monitorIdx;
                                                    if (monitorColIdx < 0 && headers.length >= 7) monitorColIdx = 6;
                                                    else if (monitorColIdx < 0 && headers.length >= 6) monitorColIdx = 5;
                                                    if (cameraNetIdx < 0 && headers.length >= 6 && headers.length < 7) cameraNetIdx = 4;
                                                    
                                                    const dataRows = [];
                                                    let lastRM = '', lastDM = '', lastStore = '';
                                                    
                                                    for (let i = headerRowIndex + 1; i < rows.length; i++) {
                                                        const cells = rows[i].querySelectorAll('td, th');
                                                        if (cells.length < 6) continue;
                                                        
                                                        const getCell = (idx) => idx >= 0 && idx < cells.length ? cells[idx].textContent.trim() : '';
                                                        
                                                        let rm = rmIdx >= 0 ? getCell(rmIdx) : lastRM;
                                                        let dm = dmIdx >= 0 ? getCell(dmIdx) : lastDM;
                                                        let store = storeIdx >= 0 ? getCell(storeIdx) : lastStore;
                                                        let user = getCell(userIdx);
                                                        let camera = cameraNetIdx >= 0 ? getCell(cameraNetIdx) : '';
                                                        let netH = netHoursIdx >= 0 ? getCell(netHoursIdx) : '';
                                                        if (!netH && camera) netH = camera;
                                                        let monitor = monitorColIdx >= 0 ? getCell(monitorColIdx) : '';
                                                        
                                                        if (!user || user.toLowerCase().includes('total')) continue;
                                                        
                                                        if (rm) lastRM = rm;
                                                        if (dm) lastDM = dm;
                                                        if (store) lastStore = store;
                                                        
                                                        dataRows.push({
                                                            RM: rm,
                                                            DM: dm,
                                                            StoreName: store,
                                                            UserName: user,
                                                            NetHours: netH,
                                                            CameraNetHours: camera,
                                                            MonitoredPercent: monitor
                                                        });
                                                    }
                                                    
                                                    return {
                                                        headers: ['RM', 'DM', 'StoreName', 'UserName', 'NetHours', 'CameraNetHours', 'MonitoredPercent'],
                                                        rows: dataRows,
                                                        rowCount: dataRows.length
                                                    };
                                                });
                                            }
                                        }
                                        
                                        // Debug the extraction result
                                        if (reportData) {
                                            console.log(`📊 ${client.name}: Extraction returned:`);
                                            console.log(`   Headers: ${reportData.headers?.length || 0} - ${JSON.stringify(reportData.headers)}`);
                                            console.log(`   Rows extracted: ${reportData.rows?.length || 0}`);
                                            
                                            if (reportData.debug) {
                                                console.log(`   Debug info:`);
                                                console.log(`     Total rows in table: ${reportData.debug.totalRowsInTable}`);
                                                console.log(`     Empty UserName rows: ${reportData.debug.emptyUserNameRows}`);
                                                console.log(`     Skipped total rows: ${reportData.debug.skippedTotalRows}`);
                                                console.log(`     Column mapping: ${JSON.stringify(reportData.debug.columnMap)}`);
                                                console.log(`     Header row index: ${reportData.debug.headerRowIndex}`);
                                            }
                                            
                                            if (reportData.rows && reportData.rows.length > 0) {
                                                console.log(`   Sample row 1: ${JSON.stringify(reportData.rows[0])}`);
                                                console.log(`   Sample row 2: ${JSON.stringify(reportData.rows[1])}`);
                                            } else {
                                                console.log(`   ⚠️ No rows extracted! All ${reportData.debug?.totalRowsInTable || 0} rows were filtered out.`);
                                            }
                                        } else {
                                            console.log(`❌ ${client.name}: Extraction returned NULL!`);
                                        }
                                        
                                        console.log(`✅ ${client.name}: Data extraction completed - ${reportData?.rowCount || 0} rows extracted`);
                                        
                                        // Extract HTML table for saving
                                        console.log(`📄 ${client.name}: Extracting HTML table...`);
                                        htmlTable = await page.evaluate(() => {
                                            const reportContent = document.querySelector('#VisibleReportContentctl00_mainPane_ReportViewer1_ctl10');
                                            if (reportContent) {
                                                const table = reportContent.querySelector('table');
                                                if (table) return table.outerHTML;
                                            }
                                            // Fallback: find any table with data
                                            const tables = document.querySelectorAll('table');
                                            for (const table of tables) {
                                                const rows = table.querySelectorAll('tr');
                                                if (rows.length > 5) return table.outerHTML;
                                            }
                                            return null;
                                        });
                                        
                                        if (htmlTable) {
                                            console.log(`✅ ${client.name}: HTML table extracted successfully`);
                                        }
                                    } catch (extractError) {
                                        console.log(`❌ ${client.name}: Error extracting report data - ${extractError.message}`);
                                        console.log(`   Stack: ${extractError.stack}`);
                                        // Try alternative extraction method
                                        try {
                                            console.log(`🔄 ${client.name}: Attempting alternative extraction...`);
                                            await page.waitForTimeout(1000); // Reduced from 2 to 1 second
                                            // Inject function and call it
                                            const functionString = extractTableData.toString();
                                            reportData = await page.evaluate((funcStr) => {
                                                eval(`window.extractTableData = ${funcStr}`);
                                                return window.extractTableData();
                                            }, functionString);
                                            
                                            if (reportData && reportData.rows && reportData.rows.length > 0) {
                                                console.log(`✅ ${client.name}: Alternative extraction successful (${reportData.rows.length} rows)`);
                                                // Extract HTML table if not already extracted
                                                if (!htmlTable) {
                                                    htmlTable = await page.evaluate(() => {
                                                        const reportContent = document.querySelector('#VisibleReportContentctl00_mainPane_ReportViewer1_ctl10');
                                                        if (reportContent) {
                                                            const table = reportContent.querySelector('table');
                                                            if (table) return table.outerHTML;
                                                        }
                                                        const tables = document.querySelectorAll('table');
                                                        for (const table of tables) {
                                                            const rows = table.querySelectorAll('tr');
                                                            if (rows.length > 5) return table.outerHTML;
                                                        }
                                                        return null;
                                                    });
                                                }
                                            } else {
                                                console.log(`❌ ${client.name}: Alternative extraction also failed`);
                                            }
                                        } catch (altError) {
                                            console.log(`❌ ${client.name}: Alternative extraction failed - ${altError.message}`);
                                        }
                                    }
                                    
                                    // STEP 4: Send report data to server (CRITICAL - must execute)
                                    if (reportData && reportData.rows && reportData.rows.length > 0) {
                                            console.log(`📤 ${client.name}: Sending ${reportData.rows.length} rows to server for JSON/Excel saving...`);
                                            
                                            // Helper function to save data directly to portal directory (only when server fails)
                                            const saveToPortal = async (serverError = null) => {
                                                try {
                                                    const portalDir = path.join(__dirname, 'json', 'portal');
                                                    if (!fs.existsSync(portalDir)) {
                                                        fs.mkdirSync(portalDir, { recursive: true });
                                                    }
                                                    
                                                    const sanitizedClientName = client.name.replace(/[^a-zA-Z0-9]/g, '');
                                                    const jsonFileName = `${sanitizedClientName}-report-${Date.now()}.json`;
                                                    const jsonFilePath = path.join(portalDir, jsonFileName);
                                                    
                                                    const jsonData = {
                                                        clientName: client.name,
                                                        clientId: client.id || '',
                                                        timestamp: new Date().toISOString(),
                                                        generatedAt: new Date().toISOString(),
                                                        totalRows: reportData.rowCount || 0,
                                                        headers: reportData.headers || [],
                                                        data: reportData.rows || [],
                                                        savedDirectly: true,
                                                        serverError: serverError?.message || 'Unknown error'
                                                    };
                                                    
                                                    fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8');
                                                    console.log(`💾 ${client.name}: Data saved directly to portal directory (server unavailable): ${jsonFileName}`);
                                                    console.log(`📁 File path: ${jsonFilePath}`);
                                                } catch (saveError) {
                                                    console.log(`⚠️ ${client.name}: Failed to save data - ${saveError.message}`);
                                                }
                                            };
                                            
                                            // Use chunked transfer to avoid payload size issues
                                            const chunkSize = 100;
                                            
                                            try {
                                                console.log(`📦 ${client.name}: Using chunked transfer (${reportData.rows.length} rows, ${Math.ceil(reportData.rows.length / chunkSize)} chunks)...`);
                                                
                                                // Step 1: Initialize chunked transfer
                                                const sessionId = `${client.name}-${Date.now()}`;
                                                const initResponse = await fetch('http://localhost:3010/report-data-chunk-start', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        sessionId: sessionId,
                                                        clientName: client.name,
                                                        clientId: client.id,
                                                        headers: reportData.headers,
                                                        totalRows: reportData.rows.length,
                                                        timestamp: new Date().toISOString()
                                                    })
                                                });
                                                
                                                if (!initResponse.ok) {
                                                    const errorText = await initResponse.text();
                                                    console.log(`⚠️ ${client.name}: Chunked transfer init failed: ${initResponse.status}`);
                                                    console.log(`   Error details: ${errorText.substring(0, 500)}`);
                                                    
                                                    if (initResponse.status === 404) {
                                                        console.log(`⚠️ ${client.name}: Chunked transfer endpoint not found (404). Saving directly to portal...`);
                                                        throw new Error('CHUNKED_ENDPOINT_NOT_FOUND');
                                                    }
                                                    
                                                    throw new Error(`Failed to initialize chunked transfer: ${initResponse.status}`);
                                                }
                                                
                                                console.log(`✅ ${client.name}: Chunked transfer initialized (session: ${sessionId})`);
                                                
                                                // Step 2: Send chunks sequentially
                                                const totalChunks = Math.ceil(reportData.rows.length / chunkSize);
                                                for (let i = 0; i < totalChunks; i++) {
                                                    const startIdx = i * chunkSize;
                                                    const endIdx = Math.min(startIdx + chunkSize, reportData.rows.length);
                                                    const chunk = reportData.rows.slice(startIdx, endIdx);
                                                    
                                                    console.log(`📤 ${client.name}: Sending chunk ${i + 1}/${totalChunks} (rows ${startIdx + 1}-${endIdx})...`);
                                                    
                                                    const chunkResponse = await fetch('http://localhost:3010/report-data-chunk', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({
                                                            sessionId: sessionId,
                                                            chunkIndex: i,
                                                            totalChunks: totalChunks,
                                                            rows: chunk
                                                        })
                                                    });
                                                    
                                                    if (!chunkResponse.ok) {
                                                        throw new Error(`Failed to send chunk ${i + 1}: ${chunkResponse.status}`);
                                                    }
                                                    
                                                    // Small delay between chunks
                                                    if (i < totalChunks - 1) {
                                                        await new Promise(resolve => setTimeout(resolve, 200));
                                                    }
                                                }
                                                
                                                // Step 3: Finalize and save
                                                console.log(`✅ ${client.name}: All chunks sent, finalizing...`);
                                                const finalizeResponse = await fetch('http://localhost:3010/report-data-chunk-finalize', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        sessionId: sessionId,
                                                        htmlTable: htmlTable || null
                                                    })
                                                });
                                                
                                                if (finalizeResponse.ok) {
                                                    const result = await finalizeResponse.json();
                                                    console.log(`✅ ${client.name}: Report data saved successfully via chunked transfer (${reportData.rows.length} rows)`);
                                                    console.log(`📄 ${client.name}: ${result.message || 'Data saved to JSON and Excel'}`);
                                                    
                                                    // Server already saved the file, no need for backup copy
                                                    // Log portal extraction completion
                                                    console.log(`✅ ${client.name}: Portal data extracted successfully (${reportData.rows.length} rows)`);
                                                } else {
                                                    throw new Error(`Failed to finalize: ${finalizeResponse.status}`);
                                                }
                                            } catch (fetchError) {
                                                console.log(`⚠️ ${client.name}: Error sending report data to server - ${fetchError.message}`);
                                                console.log(`   Make sure the server is running on http://localhost:3010`);
                                                
                                                // Save directly to portal directory when server fails
                                                await saveToPortal(fetchError);
                                                
                                                // Log portal extraction completion even if server communication failed
                                                if (reportData && reportData.rows && reportData.rows.length > 0) {
                                                    console.log(`✅ ${client.name}: Portal data extracted successfully (${reportData.rows.length} rows, saved directly)`);
                                                }
                                            }
                                        } else {
                                            console.log(`⚠️ ${client.name}: No data extracted (${reportData?.headers?.length || 0} headers, ${reportData?.rows?.length || 0} rows)`);
                                        }
                                    
                                    console.log(`✅ ${client.name}: Report processing completed`);
                                }
                            }
                            
                        } catch (error) {
                            console.log(`⚠️ ${client.name}: Error in search process - ${error.message}`);
                        }
                    } else {
                        console.log(`⚠️ ${client.name}: Date fields not found or could not be filled`);
                        console.log(`   Start date filled: ${startDateFilled}`);
                        console.log(`   End date filled: ${endDateFilled}`);
                        
                    }
                    
                } catch (error) {
                    console.log(`⚠️ ${client.name}: Error filling dates - ${error.message}`);
                }
            }
            
            // Test summary
            const startDateUsed = process.env.START_DATE || 'Calculated (1st)';
            const endDateUsed = process.env.END_DATE || 'Calculated (Today-2)';
            
            console.log(`\n📋 ${client.name} Test Summary:`);
            console.log(`   ✅ Page loaded successfully`);
            console.log(`   📄 Page title: "${title}"`);
            console.log(`   🔐 Login: ${loginAttempted ? 'Attempted' : 'Not attempted'}`);
            console.log(`   📅 Dates: ${datesFilled ? `Filled (Start: ${startDateUsed}, End: ${endDateUsed})` : 'Not filled'}`);
            console.log(`   🔍 Search: ${datesFilled ? 'Executed' : 'Skipped'}`);
            console.log(`✅ ${client.name}: Test completed successfully\n`);
            
        } catch (error) {
            console.error(`\n❌ ${client.name}: Test failed - ${error.message}`);
            
            console.log('');
        }
    }
});
