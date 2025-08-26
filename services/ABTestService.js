const { query } = require('../database/connection');
const AnalyticsService = require('./AnalyticsService');

class ABTestService {
    constructor() {
        this.analyticsService = new AnalyticsService();
        
        this.testTypes = {
            LAYOUT: 'layout',
            PRICING: 'pricing', 
            CROSS_POSTING: 'cross_posting'
        };
        
        this.variants = {
            A: 'A',
            B: 'B',
            CONTROL: 'control'
        };
        
        // Test configurations for different experiment types
        this.testConfigs = {
            layout: {
                variants: ['grid', 'list', 'card'],
                metrics: ['views', 'clicks', 'engagement_time'],
                duration: 14 // days
            },
            pricing: {
                variants: ['fixed', 'dynamic', 'markup_10', 'markup_20'],
                metrics: ['views', 'clicks', 'sales', 'conversion_rate'],
                duration: 21 // days
            },
            cross_posting: {
                variants: ['immediate', 'delayed_1h', 'delayed_24h', 'manual'],
                metrics: ['total_posts', 'success_rate', 'engagement'],
                duration: 30 // days
            }
        };
    }

    // Create new A/B test
    async createTest(testData) {
        try {
            const {
                testName,
                testType,
                variants,
                itemIds = [],
                sellerIds = [],
                description = '',
                targetMetric = 'conversion_rate',
                duration = 14
            } = testData;

            // Validate test type
            if (!Object.values(this.testTypes).includes(testType)) {
                throw new Error(`Invalid test type: ${testType}`);
            }

            const startDate = new Date().toISOString().split('T')[0];
            const endDate = new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            const testResults = [];

            // Create test variants
            for (const variant of variants) {
                const variantConfig = this.generateVariantConfig(testType, variant);
                
                // If specific items are provided, create test for each item
                if (itemIds.length > 0) {
                    for (const itemId of itemIds) {
                        const result = await query(`
                            INSERT INTO ab_tests (test_name, test_type, variant, item_id, seller_id, metadata, start_date, end_date, is_active)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                        `, [testName, testType, variant, itemId, sellerIds[0] || null, JSON.stringify(variantConfig), startDate, endDate]);
                        
                        testResults.push({
                            testId: result.insertId,
                            variant,
                            itemId,
                            config: variantConfig
                        });
                    }
                } else {
                    // Create general test for sellers
                    for (const sellerId of sellerIds) {
                        const result = await query(`
                            INSERT INTO ab_tests (test_name, test_type, variant, item_id, seller_id, metadata, start_date, end_date, is_active)
                            VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 1)
                        `, [testName, testType, variant, sellerId, JSON.stringify(variantConfig), startDate, endDate]);
                        
                        testResults.push({
                            testId: result.insertId,
                            variant,
                            sellerId,
                            config: variantConfig
                        });
                    }
                }
            }

            // Log test creation
            console.log(`📊 A/B Test Created: ${testName} (${testType}) - ${variants.length} variants, ${duration} days`);

            return {
                success: true,
                testName,
                testType,
                variants: testResults,
                startDate,
                endDate,
                duration
            };

        } catch (error) {
            console.error('Create A/B test error:', error);
            return { success: false, error: error.message };
        }
    }

    // Generate configuration for test variant
    generateVariantConfig(testType, variant) {
        const configs = {
            layout: {
                grid: { display: 'grid', columns: 3, imageSize: 'medium', spacing: 'normal' },
                list: { display: 'list', columns: 1, imageSize: 'large', spacing: 'wide' },
                card: { display: 'card', columns: 2, imageSize: 'large', spacing: 'compact' }
            },
            pricing: {
                fixed: { strategy: 'fixed', markup: 0, dynamic: false },
                dynamic: { strategy: 'dynamic', markup: 15, dynamic: true, priceAdjustment: 'market' },
                markup_10: { strategy: 'fixed', markup: 10, dynamic: false },
                markup_20: { strategy: 'fixed', markup: 20, dynamic: false }
            },
            cross_posting: {
                immediate: { timing: 'immediate', delay: 0, platforms: ['all'] },
                delayed_1h: { timing: 'delayed', delay: 3600, platforms: ['all'] },
                delayed_24h: { timing: 'delayed', delay: 86400, platforms: ['all'] },
                manual: { timing: 'manual', delay: null, platforms: ['selected'] }
            }
        };

        return configs[testType]?.[variant] || { variant: variant };
    }

    // Record test event (exposure or conversion)
    async recordTestEvent(testId, eventType, metadata = {}) {
        try {
            // Get test details
            const testResult = await query('SELECT * FROM ab_tests WHERE id = ?', [testId]);
            
            if (testResult.rows.length === 0) {
                throw new Error('Test not found');
            }

            const test = testResult.rows[0];

            // Update test metrics
            if (eventType === 'exposure') {
                await query(`
                    UPDATE ab_tests 
                    SET total_exposures = total_exposures + 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [testId]);
            } else if (eventType === 'conversion') {
                await query(`
                    UPDATE ab_tests 
                    SET conversion_events = conversion_events + 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [testId]);
            }

            // Recalculate conversion rate
            const updatedTest = await query('SELECT * FROM ab_tests WHERE id = ?', [testId]);
            const updated = updatedTest.rows[0];
            
            if (updated.total_exposures > 0) {
                const conversionRate = (updated.conversion_events / updated.total_exposures * 100).toFixed(2);
                await query(`
                    UPDATE ab_tests 
                    SET conversion_rate = ?
                    WHERE id = ?
                `, [conversionRate, testId]);
            }

            // Also track in analytics
            if (test.item_id && test.seller_id) {
                await this.analyticsService.trackEvent({
                    sellerId: test.seller_id,
                    itemId: test.item_id,
                    eventType: eventType,
                    platform: 'vintage_crib',
                    metadata: { ...metadata, abTest: test.test_name, variant: test.variant }
                });
            }

            return { success: true, testId, eventType };

        } catch (error) {
            console.error('Record test event error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get test results and analysis
    async getTestResults(testName) {
        try {
            // Get all variants for the test
            const variants = await query(`
                SELECT 
                    variant,
                    COUNT(*) as test_count,
                    SUM(total_exposures) as total_exposures,
                    SUM(conversion_events) as total_conversions,
                    AVG(conversion_rate) as avg_conversion_rate,
                    metadata
                FROM ab_tests 
                WHERE test_name = ?
                GROUP BY variant
                ORDER BY avg_conversion_rate DESC
            `, [testName]);

            if (variants.rows.length === 0) {
                throw new Error('Test not found or no data available');
            }

            // Calculate statistical significance
            const results = variants.rows.map(variant => {
                const significance = this.calculateStatisticalSignificance(
                    variant.total_conversions,
                    variant.total_exposures,
                    variants.rows
                );

                return {
                    variant: variant.variant,
                    exposures: variant.total_exposures,
                    conversions: variant.total_conversions,
                    conversionRate: parseFloat(variant.avg_conversion_rate || 0),
                    significance: significance,
                    isWinning: significance.isSignificant && significance.isWinner,
                    config: JSON.parse(variant.metadata || '{}')
                };
            });

            // Get test metadata
            const testInfo = await query(`
                SELECT test_type, start_date, end_date, is_active
                FROM ab_tests 
                WHERE test_name = ?
                LIMIT 1
            `, [testName]);

            const testMeta = testInfo.rows[0] || {};
            const isComplete = new Date() > new Date(testMeta.end_date);

            return {
                success: true,
                testName,
                testType: testMeta.test_type,
                startDate: testMeta.start_date,
                endDate: testMeta.end_date,
                isComplete,
                isActive: testMeta.is_active,
                variants: results,
                recommendation: this.generateTestRecommendation(results),
                summary: this.generateTestSummary(results)
            };

        } catch (error) {
            console.error('Get test results error:', error);
            return { success: false, error: error.message };
        }
    }

    // Calculate statistical significance (simplified)
    calculateStatisticalSignificance(conversions, exposures, allVariants) {
        if (exposures === 0) {
            return { isSignificant: false, isWinner: false, confidence: 0 };
        }

        const conversionRate = conversions / exposures;
        
        // Find control group (usually first variant or one with most exposures)
        const control = allVariants.reduce((prev, curr) => 
            curr.total_exposures > prev.total_exposures ? curr : prev
        );
        
        const controlRate = control.total_conversions / Math.max(control.total_exposures, 1);
        
        // Simplified significance test (normally would use proper statistical tests)
        const improvement = ((conversionRate - controlRate) / Math.max(controlRate, 0.001)) * 100;
        const sampleSize = exposures;
        
        // Simple heuristic: significant if improvement > 20% and sample size > 100
        const isSignificant = Math.abs(improvement) > 20 && sampleSize > 100;
        const isWinner = improvement > 0 && isSignificant;
        
        return {
            isSignificant,
            isWinner,
            improvement: improvement.toFixed(1),
            confidence: isSignificant ? 95 : Math.min(90, sampleSize / 100 * 90)
        };
    }

    // Generate test recommendation
    generateTestRecommendation(results) {
        const winner = results.find(r => r.isWinning);
        const bestPerforming = results.reduce((prev, curr) => 
            curr.conversionRate > prev.conversionRate ? curr : prev
        );

        if (winner) {
            return {
                action: 'implement',
                variant: winner.variant,
                reason: `Variant ${winner.variant} shows statistically significant improvement`,
                improvement: winner.significance.improvement + '%',
                confidence: winner.significance.confidence + '%'
            };
        } else if (bestPerforming.conversionRate > 0) {
            return {
                action: 'continue',
                variant: bestPerforming.variant,
                reason: `Variant ${bestPerforming.variant} performing best but needs more data`,
                improvement: 'TBD',
                confidence: 'Low'
            };
        } else {
            return {
                action: 'redesign',
                variant: null,
                reason: 'No variants showing clear improvement, consider new approaches',
                improvement: '0%',
                confidence: 'High'
            };
        }
    }

    // Generate test summary
    generateTestSummary(results) {
        const totalExposures = results.reduce((sum, r) => sum + r.exposures, 0);
        const totalConversions = results.reduce((sum, r) => sum + r.conversions, 0);
        const avgConversionRate = totalExposures > 0 ? (totalConversions / totalExposures * 100) : 0;

        return {
            totalExposures,
            totalConversions,
            avgConversionRate: avgConversionRate.toFixed(2),
            variantCount: results.length,
            hasWinner: results.some(r => r.isWinning),
            dataQuality: totalExposures > 1000 ? 'high' : totalExposures > 100 ? 'medium' : 'low'
        };
    }

    // Get all active tests
    async getActiveTests() {
        try {
            const tests = await query(`
                SELECT 
                    test_name,
                    test_type,
                    COUNT(DISTINCT variant) as variant_count,
                    SUM(total_exposures) as total_exposures,
                    SUM(conversion_events) as total_conversions,
                    start_date,
                    end_date,
                    MIN(created_at) as created_at
                FROM ab_tests 
                WHERE is_active = 1 AND end_date >= date('now')
                GROUP BY test_name
                ORDER BY created_at DESC
            `);

            return {
                success: true,
                tests: tests.rows.map(test => ({
                    ...test,
                    status: new Date() > new Date(test.end_date) ? 'completed' : 'active',
                    daysRemaining: Math.max(0, Math.ceil((new Date(test.end_date) - new Date()) / (1000 * 60 * 60 * 24)))
                }))
            };

        } catch (error) {
            console.error('Get active tests error:', error);
            return { success: false, error: error.message };
        }
    }

    // Stop/end a test early
    async stopTest(testName, reason = 'manual_stop') {
        try {
            await query(`
                UPDATE ab_tests 
                SET is_active = 0, end_date = date('now'), updated_at = CURRENT_TIMESTAMP
                WHERE test_name = ?
            `, [testName]);

            console.log(`⏹️ A/B Test Stopped: ${testName} (${reason})`);

            return { success: true, testName, reason };

        } catch (error) {
            console.error('Stop test error:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = ABTestService;