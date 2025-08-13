// 🚀 External Keep-Alive Service for Vintage Crib
// Use this script with external services like UptimeRobot, Cronitor, etc.

const VINTAGE_CRIB_URL = 'https://vintage-crib.onrender.com';

const keepAliveEndpoints = [
    `${VINTAGE_CRIB_URL}/api/health`,
    `${VINTAGE_CRIB_URL}/api/wake`,
    `${VINTAGE_CRIB_URL}/api/test`,
    `${VINTAGE_CRIB_URL}/store-3d.html`
];

async function pingServer() {
    console.log('🔄 Starting keep-alive ping...');
    
    for (const endpoint of keepAliveEndpoints) {
        try {
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Vintage-Crib-KeepAlive/1.0'
                }
            });
            
            if (response.ok) {
                console.log(`✅ ${endpoint} - OK (${response.status})`);
            } else {
                console.warn(`⚠️ ${endpoint} - Failed (${response.status})`);
            }
        } catch (error) {
            console.error(`❌ ${endpoint} - Error: ${error.message}`);
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('🏺 Keep-alive cycle completed');
}

// For external monitoring services - URLs to ping every 10-15 minutes:
console.log(`
🚀 VINTAGE CRIB KEEP-ALIVE ENDPOINTS
===================================

📡 Health Check: ${VINTAGE_CRIB_URL}/api/health
🔄 Wake Up: ${VINTAGE_CRIB_URL}/api/wake  
🧪 Test API: ${VINTAGE_CRIB_URL}/api/test
🏺 Main Store: ${VINTAGE_CRIB_URL}/store-3d.html

⏰ Recommended ping interval: Every 10-15 minutes
🛡️ This prevents Render free tier from sleeping

📊 FREE MONITORING SERVICES YOU CAN USE:
- UptimeRobot (uptimerobot.com) - 50 free monitors
- Cronitor (cronitor.io) - Free tier available  
- StatusCake (statuscake.com) - Free monitoring
- Pingdom (pingdom.com) - Free tier

🎯 Setup Instructions:
1. Create account with any monitoring service above
2. Add these URLs as HTTP monitors
3. Set check interval to 10-15 minutes
4. Your site will stay awake 24/7!
`);

// If run directly, perform a test ping
if (require.main === module) {
    pingServer().catch(console.error);
}

module.exports = { pingServer, keepAliveEndpoints, VINTAGE_CRIB_URL };