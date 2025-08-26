const { query } = require('../database/connection');

class AnalyticsService {
    constructor() {
        this.eventTypes = {
            VIEW: 'view',
            CLICK: 'click',
            LIKE: 'like',
            SHARE: 'share',
            PUBLISH: 'publish',
            SALE: 'sale',
            INQUIRY: 'inquiry'
        };

        this.platforms = {
            VINTAGE_CRIB: 'vintage_crib',
            EBAY: 'ebay',
            POSHMARK: 'poshmark',
            DEPOP: 'depop',
            MERCARI: 'mercari'
        };
    }

    // Track individual events
    async trackEvent(eventData) {
        try {
            const {
                sellerId,
                itemId,
                eventType,
                platform,
                metadata = {},
                ipAddress = null,
                userAgent = null
            } = eventData;

            const result = await query(
                `INSERT INTO vintage_analytics (seller_id, item_id, event_type, platform, metadata, ip_address, user_agent, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [sellerId, itemId, eventType, platform, JSON.stringify(metadata), ipAddress, userAgent]
            );

            // Update daily stats asynchronously
            this.updateDailyStats(sellerId, eventType, platform, metadata).catch(err => 
                console.error('Failed to update daily stats:', err)
            );

            return { success: true, eventId: result.insertId };

        } catch (error) {
            console.error('Track event error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get seller analytics dashboard data
    async getSellerAnalytics(sellerId, dateRange = 30) {
        try {
            // Get overall stats
            const overallStats = await query(`
                SELECT 
                    COUNT(*) as total_events,
                    COUNT(CASE WHEN event_type = 'view' THEN 1 END) as total_views,
                    COUNT(CASE WHEN event_type = 'click' THEN 1 END) as total_clicks,
                    COUNT(CASE WHEN event_type = 'like' THEN 1 END) as total_likes,
                    COUNT(CASE WHEN event_type = 'sale' THEN 1 END) as total_sales,
                    COUNT(DISTINCT platform) as platforms_used,
                    COUNT(DISTINCT item_id) as items_with_activity
                FROM vintage_analytics 
                WHERE seller_id = ? AND created_at >= date('now', '-${dateRange} days')
            `, [sellerId]);

            // Get platform breakdown
            const platformBreakdown = await query(`
                SELECT 
                    platform,
                    COUNT(*) as total_events,
                    COUNT(CASE WHEN event_type = 'view' THEN 1 END) as views,
                    COUNT(CASE WHEN event_type = 'click' THEN 1 END) as clicks,
                    COUNT(CASE WHEN event_type = 'sale' THEN 1 END) as sales,
                    ROUND(
                        CAST(COUNT(CASE WHEN event_type = 'click' THEN 1 END) AS REAL) * 100.0 / 
                        NULLIF(COUNT(CASE WHEN event_type = 'view' THEN 1 END), 0), 2
                    ) as click_rate
                FROM vintage_analytics 
                WHERE seller_id = ? AND created_at >= date('now', '-${dateRange} days')
                GROUP BY platform
                ORDER BY total_events DESC
            `, [sellerId]);

            // Get daily trends
            const dailyTrends = await query(`
                SELECT 
                    date(created_at) as date,
                    COUNT(CASE WHEN event_type = 'view' THEN 1 END) as views,
                    COUNT(CASE WHEN event_type = 'click' THEN 1 END) as clicks,
                    COUNT(CASE WHEN event_type = 'sale' THEN 1 END) as sales
                FROM vintage_analytics 
                WHERE seller_id = ? AND created_at >= date('now', '-${dateRange} days')
                GROUP BY date(created_at)
                ORDER BY date
            `, [sellerId]);

            // Get top performing items
            const topItems = await query(`
                SELECT 
                    va.item_id,
                    vi.title,
                    vi.price,
                    vi.status,
                    COUNT(*) as total_events,
                    COUNT(CASE WHEN va.event_type = 'view' THEN 1 END) as views,
                    COUNT(CASE WHEN va.event_type = 'click' THEN 1 END) as clicks,
                    COUNT(CASE WHEN va.event_type = 'sale' THEN 1 END) as sales,
                    ROUND(
                        CAST(COUNT(CASE WHEN va.event_type = 'click' THEN 1 END) AS REAL) * 100.0 / 
                        NULLIF(COUNT(CASE WHEN va.event_type = 'view' THEN 1 END), 0), 2
                    ) as engagement_rate
                FROM vintage_analytics va
                JOIN vintage_items vi ON va.item_id = vi.id
                WHERE va.seller_id = ? AND va.created_at >= date('now', '-${dateRange} days')
                GROUP BY va.item_id
                ORDER BY total_events DESC
                LIMIT 10
            `, [sellerId]);

            // Get revenue data
            const revenueData = await query(`
                SELECT 
                    SUM(CAST(JSON_EXTRACT(metadata, '$.sale_price') AS REAL)) as total_revenue,
                    AVG(CAST(JSON_EXTRACT(metadata, '$.sale_price') AS REAL)) as avg_sale_price,
                    COUNT(*) as total_sales
                FROM vintage_analytics 
                WHERE seller_id = ? 
                AND event_type = 'sale' 
                AND created_at >= date('now', '-${dateRange} days')
                AND JSON_EXTRACT(metadata, '$.sale_price') IS NOT NULL
            `, [sellerId]);

            return {
                success: true,
                data: {
                    overview: overallStats.rows[0] || {},
                    platformBreakdown: platformBreakdown.rows || [],
                    dailyTrends: dailyTrends.rows || [],
                    topItems: topItems.rows || [],
                    revenue: revenueData.rows[0] || { total_revenue: 0, avg_sale_price: 0, total_sales: 0 },
                    dateRange: dateRange
                }
            };

        } catch (error) {
            console.error('Get seller analytics error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get admin analytics (platform usage, top sellers, etc.)
    async getAdminAnalytics(dateRange = 30) {
        try {
            // Platform performance
            const platformStats = await query(`
                SELECT 
                    platform,
                    COUNT(*) as total_events,
                    COUNT(DISTINCT seller_id) as active_sellers,
                    COUNT(DISTINCT item_id) as items_with_activity,
                    COUNT(CASE WHEN event_type = 'view' THEN 1 END) as total_views,
                    COUNT(CASE WHEN event_type = 'sale' THEN 1 END) as total_sales,
                    COALESCE(SUM(CAST(JSON_EXTRACT(metadata, '$.sale_price') AS REAL)), 0) as revenue
                FROM vintage_analytics 
                WHERE created_at >= date('now', '-${dateRange} days')
                GROUP BY platform
                ORDER BY total_events DESC
            `);

            // Top sellers
            const topSellers = await query(`
                SELECT 
                    va.seller_id,
                    vs.store_name,
                    COUNT(*) as total_events,
                    COUNT(CASE WHEN va.event_type = 'view' THEN 1 END) as views,
                    COUNT(CASE WHEN va.event_type = 'sale' THEN 1 END) as sales,
                    COALESCE(SUM(CAST(JSON_EXTRACT(va.metadata, '$.sale_price') AS REAL)), 0) as revenue
                FROM vintage_analytics va
                JOIN vintage_sellers vs ON va.seller_id = vs.id
                WHERE va.created_at >= date('now', '-${dateRange} days')
                GROUP BY va.seller_id
                ORDER BY total_events DESC
                LIMIT 10
            `);

            // Daily activity trends
            const dailyActivity = await query(`
                SELECT 
                    date(created_at) as date,
                    COUNT(*) as total_events,
                    COUNT(DISTINCT seller_id) as active_sellers,
                    COUNT(CASE WHEN event_type = 'view' THEN 1 END) as views,
                    COUNT(CASE WHEN event_type = 'sale' THEN 1 END) as sales
                FROM vintage_analytics 
                WHERE created_at >= date('now', '-${dateRange} days')
                GROUP BY date(created_at)
                ORDER BY date
            `);

            // Event type distribution
            const eventDistribution = await query(`
                SELECT 
                    event_type,
                    COUNT(*) as count,
                    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM vintage_analytics WHERE created_at >= date('now', '-${dateRange} days')), 2) as percentage
                FROM vintage_analytics 
                WHERE created_at >= date('now', '-${dateRange} days')
                GROUP BY event_type
                ORDER BY count DESC
            `);

            // Growth metrics
            const growthMetrics = await query(`
                SELECT 
                    'current_period' as period,
                    COUNT(*) as total_events,
                    COUNT(DISTINCT seller_id) as active_sellers
                FROM vintage_analytics 
                WHERE created_at >= date('now', '-${dateRange} days')
                UNION ALL
                SELECT 
                    'previous_period' as period,
                    COUNT(*) as total_events,
                    COUNT(DISTINCT seller_id) as active_sellers
                FROM vintage_analytics 
                WHERE created_at >= date('now', '-${dateRange * 2} days') 
                AND created_at < date('now', '-${dateRange} days')
            `);

            return {
                success: true,
                data: {
                    platformStats: platformStats.rows || [],
                    topSellers: topSellers.rows || [],
                    dailyActivity: dailyActivity.rows || [],
                    eventDistribution: eventDistribution.rows || [],
                    growthMetrics: growthMetrics.rows || [],
                    dateRange: dateRange
                }
            };

        } catch (error) {
            console.error('Get admin analytics error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get item performance details
    async getItemAnalytics(itemId, dateRange = 30) {
        try {
            // Overall item stats
            const itemStats = await query(`
                SELECT 
                    vi.title,
                    vi.price,
                    vi.status,
                    vi.category,
                    vi.created_at as item_created,
                    COUNT(va.id) as total_events,
                    COUNT(CASE WHEN va.event_type = 'view' THEN 1 END) as views,
                    COUNT(CASE WHEN va.event_type = 'click' THEN 1 END) as clicks,
                    COUNT(CASE WHEN va.event_type = 'like' THEN 1 END) as likes,
                    COUNT(CASE WHEN va.event_type = 'sale' THEN 1 END) as sales
                FROM vintage_items vi
                LEFT JOIN vintage_analytics va ON vi.id = va.item_id 
                    AND va.created_at >= date('now', '-${dateRange} days')
                WHERE vi.id = ?
                GROUP BY vi.id
            `, [itemId]);

            // Platform performance
            const platformPerformance = await query(`
                SELECT 
                    platform,
                    COUNT(*) as total_events,
                    COUNT(CASE WHEN event_type = 'view' THEN 1 END) as views,
                    COUNT(CASE WHEN event_type = 'click' THEN 1 END) as clicks,
                    COUNT(CASE WHEN event_type = 'sale' THEN 1 END) as sales
                FROM vintage_analytics 
                WHERE item_id = ? AND created_at >= date('now', '-${dateRange} days')
                GROUP BY platform
                ORDER BY total_events DESC
            `, [itemId]);

            // Hourly activity patterns
            const activityPatterns = await query(`
                SELECT 
                    CAST(strftime('%H', created_at) AS INTEGER) as hour,
                    COUNT(*) as events
                FROM vintage_analytics 
                WHERE item_id = ? AND created_at >= date('now', '-${dateRange} days')
                GROUP BY hour
                ORDER BY hour
            `, [itemId]);

            return {
                success: true,
                data: {
                    itemStats: itemStats.rows[0] || {},
                    platformPerformance: platformPerformance.rows || [],
                    activityPatterns: activityPatterns.rows || []
                }
            };

        } catch (error) {
            console.error('Get item analytics error:', error);
            return { success: false, error: error.message };
        }
    }

    // Update daily aggregated stats
    async updateDailyStats(sellerId, eventType, platform, metadata = {}) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // Check if record exists for today
            const existing = await query(
                'SELECT id FROM seller_stats WHERE seller_id = ? AND date = ?',
                [sellerId, today]
            );

            if (existing.rows.length === 0) {
                // Create new record
                await query(`
                    INSERT INTO seller_stats (seller_id, date, total_views, total_clicks, total_likes, items_sold, revenue, top_platform) 
                    VALUES (?, ?, 0, 0, 0, 0, 0, ?)
                `, [sellerId, today, platform]);
            }

            // Update counters based on event type
            const updates = {
                view: 'total_views = total_views + 1',
                click: 'total_clicks = total_clicks + 1',
                like: 'total_likes = total_likes + 1',
                sale: `items_sold = items_sold + 1, revenue = revenue + ${metadata.sale_price || 0}`
            };

            if (updates[eventType]) {
                await query(`
                    UPDATE seller_stats 
                    SET ${updates[eventType]}, updated_at = CURRENT_TIMESTAMP
                    WHERE seller_id = ? AND date = ?
                `, [sellerId, today]);
            }

            return { success: true };

        } catch (error) {
            console.error('Update daily stats error:', error);
            return { success: false, error: error.message };
        }
    }

    // A/B Testing functionality
    async createABTest(testData) {
        try {
            const {
                testName,
                testType,
                variants,
                itemIds = [],
                sellerIds = [],
                metadata = {},
                startDate,
                endDate
            } = testData;

            const testId = `${testName}_${Date.now()}`;
            
            // Create test variants
            for (const variant of variants) {
                for (const itemId of itemIds) {
                    await query(`
                        INSERT INTO ab_tests (test_name, test_type, variant, item_id, seller_id, metadata, start_date, end_date, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                    `, [testId, testType, variant, itemId, sellerIds[0] || null, JSON.stringify({...metadata, variant_config: variant}), startDate, endDate]);
                }
            }

            return { success: true, testId: testId };

        } catch (error) {
            console.error('Create A/B test error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get A/B test results
    async getABTestResults(testName) {
        try {
            const results = await query(`
                SELECT 
                    variant,
                    COUNT(*) as total_items,
                    SUM(conversion_events) as total_conversions,
                    SUM(total_exposures) as total_exposures,
                    ROUND(AVG(conversion_rate), 2) as avg_conversion_rate
                FROM ab_tests 
                WHERE test_name = ?
                GROUP BY variant
                ORDER BY avg_conversion_rate DESC
            `, [testName]);

            return {
                success: true,
                results: results.rows || []
            };

        } catch (error) {
            console.error('Get A/B test results error:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = AnalyticsService;