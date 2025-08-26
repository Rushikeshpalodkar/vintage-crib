const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function setupAnalytics() {
    console.log('📊 Setting up Analytics Tables (Direct SQLite)...\n');
    
    const dbPath = path.join(__dirname, 'data', 'vintage_crib.sqlite');
    const db = new sqlite3.Database(dbPath);
    
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Create tables
            console.log('Creating vintage_analytics table...');
            db.run(`
                CREATE TABLE IF NOT EXISTS vintage_analytics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    seller_id INTEGER,
                    item_id INTEGER,
                    event_type VARCHAR(50),
                    platform VARCHAR(50),
                    metadata TEXT,
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (seller_id) REFERENCES vintage_sellers(id),
                    FOREIGN KEY (item_id) REFERENCES vintage_items(id)
                )
            `);

            console.log('Creating seller_stats table...');
            db.run(`
                CREATE TABLE IF NOT EXISTS seller_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    seller_id INTEGER,
                    date DATE,
                    total_views INTEGER DEFAULT 0,
                    total_clicks INTEGER DEFAULT 0,
                    total_likes INTEGER DEFAULT 0,
                    total_shares INTEGER DEFAULT 0,
                    items_published INTEGER DEFAULT 0,
                    items_sold INTEGER DEFAULT 0,
                    revenue DECIMAL(10,2) DEFAULT 0,
                    conversion_rate DECIMAL(5,2) DEFAULT 0,
                    avg_item_price DECIMAL(10,2) DEFAULT 0,
                    top_platform VARCHAR(50),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (seller_id) REFERENCES vintage_sellers(id),
                    UNIQUE(seller_id, date)
                )
            `);

            console.log('Creating platform_analytics table...');
            db.run(`
                CREATE TABLE IF NOT EXISTS platform_analytics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform VARCHAR(50),
                    date DATE,
                    total_items INTEGER DEFAULT 0,
                    total_views INTEGER DEFAULT 0,
                    total_sales INTEGER DEFAULT 0,
                    total_revenue DECIMAL(12,2) DEFAULT 0,
                    avg_sale_price DECIMAL(10,2) DEFAULT 0,
                    conversion_rate DECIMAL(5,2) DEFAULT 0,
                    active_sellers INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(platform, date)
                )
            `);

            console.log('Creating ab_tests table...');
            db.run(`
                CREATE TABLE IF NOT EXISTS ab_tests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    test_name VARCHAR(100),
                    test_type VARCHAR(50),
                    variant VARCHAR(50),
                    item_id INTEGER,
                    seller_id INTEGER,
                    metadata TEXT,
                    conversion_events INTEGER DEFAULT 0,
                    total_exposures INTEGER DEFAULT 0,
                    conversion_rate DECIMAL(5,2) DEFAULT 0,
                    start_date DATE,
                    end_date DATE,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (item_id) REFERENCES vintage_items(id),
                    FOREIGN KEY (seller_id) REFERENCES vintage_sellers(id)
                )
            `);

            // Create indexes
            console.log('Creating indexes...');
            db.run('CREATE INDEX IF NOT EXISTS idx_analytics_seller_date ON vintage_analytics(seller_id, created_at)');
            db.run('CREATE INDEX IF NOT EXISTS idx_analytics_item_event ON vintage_analytics(item_id, event_type)');
            db.run('CREATE INDEX IF NOT EXISTS idx_analytics_platform ON vintage_analytics(platform, created_at)');

            // Insert sample data
            console.log('Inserting sample data...');
            
            // Sample analytics events
            const stmt = db.prepare('INSERT OR IGNORE INTO vintage_analytics (seller_id, item_id, event_type, platform, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)');
            stmt.run(1, 1, 'view', 'vintage_crib', '{"source": "homepage"}', '2025-08-18 10:00:00');
            stmt.run(1, 1, 'click', 'vintage_crib', '{"button": "details"}', '2025-08-19 14:30:00');
            stmt.run(1, 2, 'view', 'ebay', '{"source": "search"}', '2025-08-20 09:15:00');
            stmt.run(1, 1, 'sale', 'vintage_crib', '{"price": 29.99}', '2025-08-23 16:45:00');
            stmt.finalize();

            // Sample seller stats
            const statsStmt = db.prepare('INSERT OR IGNORE INTO seller_stats (seller_id, date, total_views, total_clicks, items_sold, revenue, top_platform) VALUES (?, ?, ?, ?, ?, ?, ?)');
            statsStmt.run(1, '2025-08-18', 15, 3, 0, 0, 'vintage_crib');
            statsStmt.run(1, '2025-08-19', 23, 8, 0, 0, 'vintage_crib');
            statsStmt.run(1, '2025-08-20', 31, 12, 0, 0, 'ebay');
            statsStmt.run(1, '2025-08-23', 19, 6, 1, 29.99, 'vintage_crib');
            statsStmt.finalize();

            // Sample platform analytics
            const platformStmt = db.prepare('INSERT OR IGNORE INTO platform_analytics (platform, date, total_items, total_views, total_sales, total_revenue) VALUES (?, ?, ?, ?, ?, ?)');
            platformStmt.run('vintage_crib', '2025-08-18', 5, 87, 0, 0);
            platformStmt.run('vintage_crib', '2025-08-23', 5, 91, 1, 29.99);
            platformStmt.run('ebay', '2025-08-20', 1, 31, 0, 0);
            platformStmt.finalize();

            console.log('✅ All analytics tables created and populated!');
            
            // Verify data
            db.all('SELECT COUNT(*) as count FROM vintage_analytics', (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                console.log(`📊 Analytics events: ${rows[0].count}`);
                
                db.all('SELECT COUNT(*) as count FROM seller_stats', (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    console.log(`📈 Seller stats records: ${rows[0].count}`);
                    console.log('🎯 Analytics database ready for dashboard!');
                    
                    db.close();
                    resolve();
                });
            });
        });
    });
}

// Run if called directly
if (require.main === module) {
    setupAnalytics()
        .then(() => {
            console.log('\n✅ Analytics setup complete!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Setup failed:', error);
            process.exit(1);
        });
}

module.exports = setupAnalytics;