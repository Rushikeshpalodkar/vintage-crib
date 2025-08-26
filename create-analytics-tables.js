const { query } = require('./database/connection');

async function createAnalyticsTables() {
    console.log('📊 Creating Analytics Database Tables...\n');
    
    try {
        // Create vintage_analytics table (SQLite compatible)
        console.log('Creating vintage_analytics table...');
        await query(`
            CREATE TABLE IF NOT EXISTS vintage_analytics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                seller_id INTEGER,
                item_id INTEGER,
                event_type VARCHAR(50), -- 'view', 'click', 'publish', 'sale', 'like', 'share'
                platform VARCHAR(50), -- 'vintage_crib', 'ebay', 'poshmark', 'depop', 'mercari'
                metadata TEXT, -- JSON string for additional event data
                ip_address VARCHAR(45),
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (seller_id) REFERENCES vintage_sellers(id),
                FOREIGN KEY (item_id) REFERENCES vintage_items(id)
            )
        `);
        console.log('✅ vintage_analytics table created');

        // Create seller_stats table (SQLite compatible)
        console.log('Creating seller_stats table...');
        await query(`
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
                conversion_rate DECIMAL(5,2) DEFAULT 0, -- views to sales percentage
                avg_item_price DECIMAL(10,2) DEFAULT 0,
                top_platform VARCHAR(50),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (seller_id) REFERENCES vintage_sellers(id),
                UNIQUE(seller_id, date)
            )
        `);
        console.log('✅ seller_stats table created');

        // Create platform_analytics table for admin insights
        console.log('Creating platform_analytics table...');
        await query(`
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
        console.log('✅ platform_analytics table created');

        // Create ab_tests table for A/B testing
        console.log('Creating ab_tests table...');
        await query(`
            CREATE TABLE IF NOT EXISTS ab_tests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                test_name VARCHAR(100),
                test_type VARCHAR(50), -- 'layout', 'pricing', 'cross_posting'
                variant VARCHAR(50), -- 'A', 'B', 'control'
                item_id INTEGER,
                seller_id INTEGER,
                metadata TEXT, -- JSON string with test parameters
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
        console.log('✅ ab_tests table created');

        // Create indexes for performance
        console.log('Creating performance indexes...');
        
        await query('CREATE INDEX IF NOT EXISTS idx_analytics_seller_date ON vintage_analytics(seller_id, created_at)');
        await query('CREATE INDEX IF NOT EXISTS idx_analytics_item_event ON vintage_analytics(item_id, event_type)');
        await query('CREATE INDEX IF NOT EXISTS idx_analytics_platform ON vintage_analytics(platform, created_at)');
        await query('CREATE INDEX IF NOT EXISTS idx_seller_stats_date ON seller_stats(seller_id, date)');
        await query('CREATE INDEX IF NOT EXISTS idx_platform_analytics_date ON platform_analytics(platform, date)');
        await query('CREATE INDEX IF NOT EXISTS idx_ab_tests_active ON ab_tests(is_active, test_name)');
        
        console.log('✅ Performance indexes created');

        // Insert sample data with individual queries to avoid SQLite parsing issues
        console.log('Inserting sample analytics data...');
        
        // Insert sample analytics events one by one
        const analyticsEvents = [
            [1, 1, 'view', 'vintage_crib', '{"source": "homepage", "device": "desktop"}'],
            [1, 1, 'view', 'vintage_crib', '{"source": "search", "device": "mobile"}'],
            [1, 1, 'click', 'vintage_crib', '{"button": "view_details", "device": "desktop"}'],
            [1, 2, 'publish', 'ebay', '{"auto_posted": true, "fees": 2.50}'],
            [1, 2, 'view', 'ebay', '{"source": "ebay_search", "keywords": "vintage jacket"}'],
            [1, 3, 'view', 'poshmark', '{"source": "poshmark_feed", "device": "mobile"}'],
            [1, 3, 'like', 'poshmark', '{"user_id": "poshmark_user_123"}'],
            [1, 1, 'sale', 'vintage_crib', '{"sale_price": 29.99, "commission": 2.99}'],
            [1, 2, 'view', 'depop', '{"source": "hashtag", "hashtag": "#vintage"}'],
            [1, 4, 'publish', 'mercari', '{"cross_posted": true, "original_platform": "vintage_crib"}']
        ];

        for (let i = 0; i < analyticsEvents.length; i++) {
            const [seller_id, item_id, event_type, platform, metadata] = analyticsEvents[i];
            await query(
                'INSERT OR IGNORE INTO vintage_analytics (seller_id, item_id, event_type, platform, metadata, created_at) VALUES (?, ?, ?, ?, ?, datetime("now", ?))',
                [seller_id, item_id, event_type, platform, metadata, `-${7-i} days`]
            );
        }

        // Insert sample seller stats
        const sellerStats = [
            [1, 15, 3, 1, 0, 0, 0, 0, 0, 'vintage_crib', '-7 days'],
            [1, 23, 8, 2, 0, 0, 0, 0, 0, 'vintage_crib', '-6 days'],
            [1, 18, 5, 1, 1, 0, 0, 0, 0, 'ebay', '-5 days'],
            [1, 31, 12, 3, 0, 0, 0, 0, 0, 'ebay', '-4 days'],
            [1, 27, 9, 4, 0, 0, 0, 0, 0, 'poshmark', '-3 days'],
            [1, 19, 6, 2, 0, 1, 29.99, 5.26, 29.99, 'vintage_crib', '-2 days'],
            [1, 22, 7, 3, 0, 0, 0, 0, 0, 'depop', '-1 days'],
            [1, 14, 4, 1, 1, 0, 0, 0, 0, 'mercari', '0 days']
        ];

        for (const [seller_id, views, clicks, likes, published, sold, revenue, conversion, avg_price, platform, date_offset] of sellerStats) {
            await query(
                'INSERT OR IGNORE INTO seller_stats (seller_id, date, total_views, total_clicks, total_likes, items_published, items_sold, revenue, conversion_rate, avg_item_price, top_platform) VALUES (?, date("now", ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [seller_id, date_offset, views, clicks, likes, published, sold, revenue, conversion, avg_price, platform]
            );
        }

        console.log('✅ Sample analytics data inserted');

        // Verify tables were created
        console.log('\n📊 Verifying analytics tables...');
        const tables = await query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%analytics%' OR name LIKE '%stats%' OR name = 'ab_tests'");
        
        console.log('Created tables:');
        tables.rows.forEach(table => {
            console.log(`✅ ${table.name}`);
        });

        // Show sample data counts
        console.log('\n📈 Data counts:');
        const analyticsCount = await query('SELECT COUNT(*) as count FROM vintage_analytics');
        const statsCount = await query('SELECT COUNT(*) as count FROM seller_stats');
        const platformCount = await query('SELECT COUNT(*) as count FROM platform_analytics');
        const abTestCount = await query('SELECT COUNT(*) as count FROM ab_tests');

        console.log(`📊 vintage_analytics: ${analyticsCount.rows[0].count} events`);
        console.log(`📈 seller_stats: ${statsCount.rows[0].count} daily records`);
        console.log(`🌐 platform_analytics: ${platformCount.rows[0].count} platform records`);
        console.log(`🧪 ab_tests: ${abTestCount.rows[0].count} test variants`);

        console.log('\n✅ Analytics database setup complete!');
        console.log('🎯 Ready for analytics dashboard implementation.');

    } catch (error) {
        console.error('❌ Error creating analytics tables:', error);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    createAnalyticsTables()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = createAnalyticsTables;