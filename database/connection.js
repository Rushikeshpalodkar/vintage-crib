const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL connection configuration
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'vintage_crib',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 5432,
    max: 20, // Maximum number of connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection
async function testConnection() {
    try {
        const client = await pool.connect();
        console.log('✅ PostgreSQL database connected successfully');
        
        // Test query
        const result = await client.query('SELECT NOW()');
        console.log('🕐 Database time:', result.rows[0].now);
        
        client.release();
        return true;
    } catch (err) {
        console.error('❌ PostgreSQL connection error:', err.message);
        console.log('💡 Make sure PostgreSQL is running and database exists');
        console.log('🔄 Falling back to SQLite...');
        
        // Try SQLite fallback
        try {
            const sqlite = require('./sqlite-connection');
            const sqliteWorks = await sqlite.testConnection();
            if (sqliteWorks) {
                console.log('✅ Using SQLite as fallback database');
                // Replace the query function with SQLite version
                module.exports.query = sqlite.query;
                module.exports.initializeDatabase = sqlite.initializeDatabase;
                return true;
            }
        } catch (sqliteErr) {
            console.error('❌ SQLite fallback also failed:', sqliteErr.message);
        }
        
        return false;
    }
}

// Initialize database schema
async function initializeDatabase() {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Read schema file
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (!fs.existsSync(schemaPath)) {
            console.log('⚠️ Schema file not found, skipping database initialization');
            return false;
        }
        
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Execute schema
        await pool.query(schema);
        console.log('✅ Database schema initialized successfully');
        return true;
    } catch (err) {
        console.error('❌ Database initialization error:', err.message);
        return false;
    }
}

// Database query helper
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('📊 Query executed', { text: text.substring(0, 50) + '...', duration, rows: res.rowCount });
        return res;
    } catch (err) {
        console.error('❌ Database query error:', err.message);
        throw err;
    }
}

// Transaction helper
async function transaction(callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🔄 Closing database connections...');
    await pool.end();
    console.log('✅ Database connections closed');
});

module.exports = {
    pool,
    query,
    transaction,
    testConnection,
    initializeDatabase
};