const fs = require('fs');
const path = require('path');
const { createConnectionPool } = require('./db-utils.js');

// Load SQL query for fetching clients
const getClientsQuery = fs.readFileSync(
  path.join(__dirname, 'queries', 'client-data', 'get-clients-original.sql'),
  'utf8'
);

/**
 * Fetch client data from database and save to JSON file
 * @returns {Promise<Array>} Array of client objects
 */
async function fetchClientData() {
  let pool;
  
  try {
    pool = await createConnectionPool('master');
    const result = await pool.request().query(getClientsQuery);
    console.log(`✅ Client query: ${result.recordset.length} rows`);
    
    // Transform the data to match the expected format
    const clientsData = result.recordset.map(row => ({
      companyid: row.companyid,
      companyName: row.companyName,
      userid: row.userid,
      password: row.password,
      dbname: row.dbname,
      landingurl: row.landingurl,
      liveserverip: row.liveserverip,
      applandingurl: row.applandingurl
    }));
    
    // Save to JSON file
    const jsonPath = path.join(__dirname, 'clients-data-manual.json');
    const backupPath = path.join(__dirname, 'clients-data-manual.json.backup');
    
    // Create backup of existing file if it exists
    if (fs.existsSync(jsonPath)) {
      fs.copyFileSync(jsonPath, backupPath);
    }
    fs.writeFileSync(jsonPath, JSON.stringify(clientsData, null, 2), 'utf8');
    console.log(`💾 ${clientsData.length} clients → ${jsonPath}`);
    
    return clientsData;
    
  } catch (error) {
    console.error('❌ Error fetching client data:', error.message);
    throw error;
  } finally {
    if (pool) {
      await pool.close();
      console.log('🔌 Database connection closed');
    }
  }
}

module.exports = {
  fetchClientData
};

