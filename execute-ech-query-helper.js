const fs = require('fs');
const path = require('path');
const { createConnectionPool, getDbConfig } = require('./db-utils.js');

// Load ECH SQL query
const echQueryTemplate = fs.readFileSync(path.join(__dirname, 'queries', 'ECH_query.sql'), 'utf8');

/**
 * Execute ECH query for a specific client
 * @param {Object} client - Client object with id, name, dbname, etc.
 * @param {string} startDate - Start date in format MM/DD/YYYY
 * @param {string} endDate - End date in format MM/DD/YYYY
 * @returns {Promise<Array>} Query results
 */
async function executeECHQuery(client, startDate, endDate) {
    let pool;
    
    try {
        // Validate client has dbname
        if (!client.dbname || !client.dbname.trim()) {
            throw new Error(`Client "${client.name}" does not have a database name (dbname)`);
        }

        // Get companyID from client (use id or companyid field)
        const companyID = client.id || client.companyid || client.companyID;
        if (!companyID) {
            throw new Error(`Client "${client.name}" does not have a company ID`);
        }

        // Determine server name based on liveserverip from JSON
        const liveServerIP = client.liveserverip || '';
        
        if (!liveServerIP) {
            throw new Error(`Client "${client.name}" does not have a LiveServerIP. Please ensure clients-data-manual.json is up to date.`);
        }
        
        let serverName;
        if (liveServerIP.includes('74.214.18.48')) {
            serverName = 'server48';
        } else if (liveServerIP.includes('74.214.18.52')) {
            serverName = 'server52';
        } else {
            throw new Error(`Client "${client.name}" has unknown LiveServerIP "${liveServerIP}". Expected 74.214.18.48 or 74.214.18.52`);
        }
        
        console.log(`🔍 Client "${client.name}": LiveServerIP = ${liveServerIP}, Using server = ${serverName}`);

        // Validate and format dates (format: MM/DD/YYYY)
        let formattedStartDate = startDate && startDate.trim() ? startDate.trim() : '12/01/2025';
        let formattedEndDate = endDate && endDate.trim() ? endDate.trim() : '12/31/2025';

        // Ensure dates are in MM/DD/YYYY format for SQL Server
        const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
        if (!datePattern.test(formattedStartDate)) {
            console.warn(`⚠️ Invalid start date format: ${formattedStartDate}, using default`);
            formattedStartDate = '12/01/2025';
        }
        if (!datePattern.test(formattedEndDate)) {
            console.warn(`⚠️ Invalid end date format: ${formattedEndDate}, using default`);
            formattedEndDate = '12/31/2025';
        }

        // Replace placeholders in query
        let query = echQueryTemplate;
        
        // Replace server name and database name placeholders
        query = query.replace(/{SERVER_NAME}/g, serverName);
        query = query.replace(/{DBNAME}/g, client.dbname);
        
        // Handle date declarations (commented or uncommented) - replace all occurrences
        query = query.replace(/(--\s*)?Declare @StartDate date = '[^']+';/g, `Declare @StartDate date = '${formattedStartDate}';`);
        query = query.replace(/(--\s*)?Declare @EndDate Date = '[^']+';/g, `Declare @EndDate Date = '${formattedEndDate}';`);
        
        // If date declarations don't exist at all, add them after SET statements
        if (!query.includes('Declare @StartDate')) {
            const setStatementsEnd = query.indexOf('-- 1. Handle Null Dates');
            if (setStatementsEnd !== -1) {
                query = query.slice(0, setStatementsEnd) + 
                    `\n\tDeclare @StartDate date = '${formattedStartDate}';\n\tDeclare @EndDate Date = '${formattedEndDate}';\n\n` + 
                    query.slice(setStatementsEnd);
            } else {
                // If we can't find the comment, add after SET FMTONLY OFF
                const fmtOnlyEnd = query.indexOf('SET FMTONLY OFF');
                if (fmtOnlyEnd !== -1) {
                    const nextLine = query.indexOf('\n', fmtOnlyEnd);
                    query = query.slice(0, nextLine + 1) + 
                        `\tDeclare @StartDate date = '${formattedStartDate}';\n\tDeclare @EndDate Date = '${formattedEndDate}';\n` + 
                        query.slice(nextLine + 1);
                }
            }
        }
        
        // Replace companyID (appears twice in the query)
        query = query.replace(/74 AS companyID/g, `${companyID} AS companyID`);

        const dbConfig = getDbConfig();
        console.log(`🔌 Connecting to database for client: ${client.name}`);
        console.log(`   Server: ${dbConfig.server}`);
        console.log(`   Connection Database: master (for linked server access)`);
        console.log(`   Query Database: ${client.dbname} (via ${serverName})`);
        console.log(`   Server Name (for query): ${serverName}`);
        console.log(`   Company ID: ${companyID}`);
        console.log(`   Date Range: ${formattedStartDate} to ${formattedEndDate}`);

        // Create connection pool to master database to access linked servers
        // We connect to master because linked server queries work better from there
        pool = await createConnectionPool('master');

        console.log(`✅ Connected to master database`);
        console.log(`📊 Executing ECH query on ${serverName}.${client.dbname}...`);

        // Execute the SQL query
        const result = await pool.request().query(query);

        console.log(`✅ Query executed successfully. Found ${result.recordset.length} records.`);

        return result.recordset;

    } catch (error) {
        console.error(`❌ Error executing ECH query for ${client.name}:`, error.message);
        throw error;
    } finally {
        if (pool) {
            await pool.close();
            console.log(`🔌 Database connection closed for ${client.name}`);
        }
    }
}

/**
 * Save query results to JSON file in json directory
 * @param {string} clientName - Client name (sanitized for filename)
 * @param {Array} data - Query results
 * @returns {string} Path to saved file
 */
function saveResultsToJSON(clientName, data) {
    // Create logs/json/db directory if it doesn't exist
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    const jsonDir = path.join(logsDir, 'json', 'db');
    if (!fs.existsSync(jsonDir)) {
        fs.mkdirSync(jsonDir, { recursive: true });
        console.log(`📁 Created logs/json/db directory: ${jsonDir}`);
    }

    // Sanitize client name for filename (remove special characters and spaces)
    const sanitizedClientName = clientName.replace(/[^a-zA-Z0-9]/g, '');

    const filename = `${sanitizedClientName}.json`;
    const filePath = path.join(jsonDir, filename);

    // Prepare data with metadata
    const jsonData = {
        clientName: clientName,
        generatedAt: new Date().toISOString(),
        recordCount: data.length,
        data: data
    };

    // Write to file
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf8');

    console.log(`✅ Results saved to: ${filePath}`);
    console.log(`📊 Total records: ${data.length}`);

    return filePath;
}

/**
 * Execute ECH query and save to JSON file
 * @param {Object} client - Client object
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<string>} Path to saved file
 */
async function executeAndSaveECHQuery(client, startDate, endDate) {
    try {
        console.log(`\n🔄 Executing ECH query for client: ${client.name}`);
        
        // Execute query
        const queryResults = await executeECHQuery(client, startDate, endDate);
        
        // Save to JSON file
        const filePath = saveResultsToJSON(client.name, queryResults);
        
        return filePath;
    } catch (error) {
        console.error(`❌ Failed to execute ECH query for ${client.name}:`, error.message);
        throw error;
    }
}

module.exports = {
    executeECHQuery,
    saveResultsToJSON,
    executeAndSaveECHQuery
};

