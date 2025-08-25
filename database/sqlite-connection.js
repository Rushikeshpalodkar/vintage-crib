const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// SQLite connection for easy development/testing
const dbPath = path.join(__dirname, '../data/vintage_crib.sqlite');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ SQLite connection error:', err.message);
    } else {
        console.log('✅ SQLite database connected:', dbPath);
    }
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// SQLite schema (adapted from PostgreSQL)
const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user', -- 'user', 'seller', 'admin'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Vintage sellers
CREATE TABLE IF NOT EXISTS vintage_sellers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    store_name TEXT NOT NULL,
    bio TEXT,
    instagram_handle TEXT,
    ebay_store_url TEXT,
    profile_image TEXT,
    subscription_tier TEXT DEFAULT 'free', -- 'free', 'premium', 'pro'
    is_verified BOOLEAN DEFAULT FALSE,
    total_sales INTEGER DEFAULT 0,
    rating REAL DEFAULT 0.00,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Vintage items
CREATE TABLE IF NOT EXISTS vintage_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id INTEGER REFERENCES vintage_sellers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    original_price REAL,
    category TEXT,
    brand TEXT,
    size TEXT,
    condition TEXT, -- 'new', 'like_new', 'good', 'fair', 'poor'
    tags TEXT, -- JSON array as text
    images TEXT NOT NULL DEFAULT '[]', -- JSON array as text
    status TEXT DEFAULT 'draft', -- 'draft', 'published', 'sold', 'archived'
    published_to TEXT DEFAULT '[]', -- JSON array as text
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    sold_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cross-platform posting tracking
CREATE TABLE IF NOT EXISTS cross_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER REFERENCES vintage_items(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    external_id TEXT,
    external_url TEXT,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    posted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User favorites
CREATE TABLE IF NOT EXISTS user_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES vintage_items(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, item_id)
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_id INTEGER REFERENCES users(id),
    seller_id INTEGER REFERENCES vintage_sellers(id),
    item_id INTEGER REFERENCES vintage_items(id),
    total_amount REAL NOT NULL,
    platform TEXT,
    external_order_id TEXT,
    status TEXT DEFAULT 'pending',
    shipping_address TEXT,
    tracking_number TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_vintage_items_seller_id ON vintage_items(seller_id);
CREATE INDEX IF NOT EXISTS idx_vintage_items_status ON vintage_items(status);
CREATE INDEX IF NOT EXISTS idx_vintage_items_category ON vintage_items(category);
CREATE INDEX IF NOT EXISTS idx_cross_posts_item_id ON cross_posts(item_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
`;

// Initialize database schema
async function initializeSqliteDatabase() {
    return new Promise((resolve, reject) => {
        db.exec(schema, (err) => {
            if (err) {
                console.error('❌ SQLite schema error:', err.message);
                reject(err);
            } else {
                console.log('✅ SQLite database schema initialized');
                
                // Insert default admin user and seller
                const insertDefaults = `
                INSERT OR IGNORE INTO users (username, email, password_hash, role) 
                VALUES ('admin', 'admin@vintagecrib.com', '$2b$10$example', 'admin');
                
                INSERT OR IGNORE INTO vintage_sellers (user_id, store_name, bio, subscription_tier)
                SELECT id, 'Vintage Crib Official', 'Curated vintage collection', 'pro'
                FROM users WHERE username = 'admin';
                `;
                
                db.exec(insertDefaults, (err) => {
                    if (err) {
                        console.log('⚠️ Default data insertion warning:', err.message);
                    } else {
                        console.log('✅ Default admin user and seller created');
                    }
                    resolve();
                });
            }
        });
    });
}

// Query helper for SQLite
function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (sql.trim().toUpperCase().startsWith('SELECT')) {
            db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({ rows, rowCount: rows.length });
                }
            });
        } else {
            db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    // For INSERT statements, return the inserted row
                    if (sql.trim().toUpperCase().startsWith('INSERT') && this.lastID) {
                        db.get("SELECT * FROM " + sql.match(/INSERT INTO (\w+)/i)[1] + " WHERE id = ?", [this.lastID], (err, row) => {
                            resolve({ rows: row ? [row] : [], rowCount: this.changes });
                        });
                    } else {
                        resolve({ rows: [], rowCount: this.changes });
                    }
                }
            });
        }
    });
}

// Test connection
async function testSqliteConnection() {
    try {
        const result = await query('SELECT datetime("now") as now');
        console.log('✅ SQLite connection test successful');
        console.log('🕐 Database time:', result.rows[0].now);
        return true;
    } catch (err) {
        console.error('❌ SQLite connection test failed:', err.message);
        return false;
    }
}

module.exports = {
    db,
    query,
    testConnection: testSqliteConnection,
    initializeDatabase: initializeSqliteDatabase
};