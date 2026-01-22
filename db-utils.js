const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Load database configuration
const dbConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'db-config.json'), 'utf8'));

/**
 * Create a database connection pool
 * @param {string} database - Database name to connect to (default: from config)
 * @returns {Promise<sql.ConnectionPool>} Connection pool
 */
async function createConnectionPool(database = null) {
    const connectionConfig = {
        server: dbConfig.server,
        user: dbConfig.user,
        password: dbConfig.password,
        database: database || dbConfig.database,
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true
        },
        requestTimeout: 300000, // 5 minutes timeout
        connectionTimeout: 30000 // 30 seconds connection timeout
    };

    return await sql.connect(connectionConfig);
}

/**
 * Get database configuration
 * @returns {Object} Database configuration object
 */
function getDbConfig() {
    return dbConfig;
}

module.exports = {
    createConnectionPool,
    getDbConfig
};

