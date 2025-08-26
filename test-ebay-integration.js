const jwt = require('jsonwebtoken');

// Create a test item as specified by the user
const testItem = {
    title: "Test Vintage T-Shirt",
    description: "Testing eBay integration",
    price: 25.00,
    images: ["https://example.com/image1.jpg"],
    tags: ["vintage", "90s", "grunge"]
};

console.log('Testing eBay integration with sample item:');
console.log(JSON.stringify(testItem, null, 2));

// Create auth token
const token = jwt.sign(
    {id: 1, username: 'admin', role: 'admin'}, 
    'vintage_crib_secret_key_2025', 
    {expiresIn: '24h'}
);

console.log('\nAuth token created successfully');

// Test if eBay service is available
const fetch = require('node-fetch');

async function testEbayIntegration() {
    try {
        console.log('\nTesting eBay integration...');
        
        // First, try to publish to eBay via the vintage API
        const response = await fetch('http://localhost:3001/api/vintage/items/1/publish', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                platforms: ['ebay'],
                ...testItem
            })
        });
        
        const result = await response.json();
        console.log('eBay publish result:', result);
        
        if (result.success) {
            console.log('✅ eBay integration working');
            console.log('📝 Item ID on eBay:', result.ebayItemId || 'Demo mode');
        } else {
            console.log('⚠️ eBay integration response:', result.message || result.error);
        }
        
    } catch (error) {
        console.error('❌ eBay integration test error:', error.message);
    }
}

testEbayIntegration();