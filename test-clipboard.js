const CrossPostingEngine = require('./services/CrossPostingEngine');

// Create test item as specified
const testItem = {
    title: "Test Vintage T-Shirt",
    description: "Testing eBay integration",
    price: 25.00,
    images: ["https://example.com/image1.jpg"],
    tags: ["vintage", "90s", "grunge"],
    category: "clothing",
    condition: "good",
    size: "M",
    brand: "Vintage Brand"
};

console.log('🧪 Testing Clipboard Functionality\n');
console.log('===============================\n');

// Initialize CrossPostingEngine
const crossPostingEngine = new CrossPostingEngine();

console.log('📋 Test Item:');
console.log(JSON.stringify(testItem, null, 2));

console.log('\n🎯 Testing Poshmark Clipboard Preparation...\n');

// Test clipboard preparation for Poshmark
try {
    const clipboardTest = crossPostingEngine.prepareClipboardData(testItem, 'poshmark');
    
    console.log('✅ Clipboard data prepared successfully!');
    console.log('\n📄 Formatted Clipboard Data:');
    console.log('─'.repeat(50));
    console.log(clipboardTest.clipboardData);
    console.log('─'.repeat(50));
    
    console.log('\n🔗 Platform URL:', clipboardTest.platformUrl || 'Not provided');
    console.log('📝 Instructions:', clipboardTest.instructions || 'Not provided');
    
    // Test other platforms too
    console.log('\n🎯 Testing Other Platforms...\n');
    
    const platforms = ['ebay', 'depop', 'mercari'];
    platforms.forEach(platform => {
        try {
            const result = crossPostingEngine.prepareClipboardData(testItem, platform);
            console.log(`✅ ${platform.toUpperCase()}: Clipboard data prepared (${result.clipboardData.length} characters)`);
        } catch (error) {
            console.log(`❌ ${platform.toUpperCase()}: ${error.message}`);
        }
    });
    
} catch (error) {
    console.error('❌ Clipboard test failed:', error.message);
    console.error('Full error:', error);
}

console.log('\n📊 Clipboard Test Summary:');
console.log('─'.repeat(30));
console.log('✅ Expected: Formatted text with title, description, price');
console.log('✅ Expected: Platform URLs for easy navigation'); 
console.log('✅ Expected: Clear instructions for users');
console.log('✅ Expected: Process takes less than 2 minutes per platform');