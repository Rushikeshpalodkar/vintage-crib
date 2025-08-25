const fs = require('fs').promises;
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const EBay = require('ebay-api');
const helmet = require('helmet');
const { authenticateAdmin, verifyToken } = require('./auth');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Performance optimizations for Render free tier
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Memory management
let productCache = null;
let cacheExpiry = 0;
const CACHE_DURATION = 600000; // 10 minutes

// eBay API Configuration - with fallback for missing env vars
let eBay = null;
try {
    if (process.env.EBAY_APP_ID && process.env.EBAY_CERT_ID) {
        eBay = new EBay({
            clientId: process.env.EBAY_APP_ID,
            clientSecret: process.env.EBAY_CERT_ID,
            sandbox: process.env.EBAY_ENVIRONMENT === 'sandbox',
            siteId: EBay.SiteId.EBAY_US
        });
        console.log('✅ eBay API initialized successfully');
    } else {
        console.log('⚠️ eBay API credentials not found - running in demo mode');
    }
} catch (error) {
    console.log('⚠️ eBay API initialization failed:', error.message, '- running in demo mode');
}

console.log('🏪 eBay API Environment:', process.env.EBAY_ENVIRONMENT || 'sandbox');
console.log('🔑 eBay Client ID configured:', !!process.env.EBAY_APP_ID);
console.log('🌐 Starting Vintage Crib Server...');
console.log('📁 Working directory:', __dirname);

// Simple analytics storage
let analytics = {
    totalVisits: 0,
    uniqueVisitors: new Set(),
    pageViews: {},
    productClicks: {},
    lastVisits: []
};

// Auto-sync system variables
let syncInterval = null;
let syncInProgress = false;
let lastAutoSyncTime = null;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "https:", "http:"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"]
        }
    }
}));

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware to track visits
app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    const timestamp = new Date();
    
    // Track visit
    analytics.totalVisits++;
    analytics.uniqueVisitors.add(ip);
    analytics.pageViews[req.path] = (analytics.pageViews[req.path] || 0) + 1;
    
    // Store recent visits
    analytics.lastVisits.unshift({
        ip: ip.substring(0, 10) + '...', // Hide full IP for privacy
        page: req.path,
        timestamp: timestamp,
        userAgent: userAgent
    });
    
    // Keep only last 50 visits
    analytics.lastVisits = analytics.lastVisits.slice(0, 50);
    
    console.log(`📈 Visit: ${req.path} from ${ip.substring(0, 10)}...`);
    next();
});

// Data file paths
const DATA_FILE = path.join(__dirname, 'data', 'products.json');
const SETTINGS_FILE = path.join(__dirname, 'data', 'store-settings.json');
const SYNC_SETTINGS_FILE = path.join(__dirname, 'data', 'sync-settings.json');
const SYNC_LOG_FILE = path.join(__dirname, 'data', 'sync-log.json');

// Helper functions with caching
async function readProducts() {
    // Use cache if available and not expired
    if (productCache && Date.now() < cacheExpiry) {
        return productCache;
    }
    
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const products = JSON.parse(data);
        
        // Cache the results
        productCache = products;
        cacheExpiry = Date.now() + CACHE_DURATION;
        
        return products;
    } catch (error) {
        console.log('📁 Creating new products.json file');
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
        
        // Start with empty products database - no default samples
        const defaultProducts = [];
        
        await fs.writeFile(DATA_FILE, JSON.stringify(defaultProducts, null, 2));
        console.log('📝 Created empty products database');
        return defaultProducts;
    }
}

async function writeProducts(products) {
    await fs.writeFile(DATA_FILE, JSON.stringify(products, null, 2));
}

// Store settings helper functions
async function readStoreSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('📁 Creating default store settings file');
        const defaultSettings = {
            sortOrder: 'price-low-high',
            displayStyle: 'grid',
            itemsPerPage: '24',
            defaultCategory: 'all',
            lastUpdated: new Date().toISOString()
        };
        await writeStoreSettings(defaultSettings);
        return defaultSettings;
    }
}

async function writeStoreSettings(settings) {
    settings.lastUpdated = new Date().toISOString();
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// Sync settings helper functions
async function readSyncSettings() {
    try {
        const data = await fs.readFile(SYNC_SETTINGS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('📁 Creating default sync settings file');
        const defaultSyncSettings = {
            autoSyncEnabled: true,
            syncIntervalMinutes: 60, // Sync every hour
            lastSyncTime: null,
            syncTypes: {
                soldStatus: true,
                priceChanges: true,
                productUpdates: true
            },
            retrySettings: {
                maxRetries: 3,
                retryDelayMinutes: 5
            },
            createdAt: new Date().toISOString()
        };
        await writeSyncSettings(defaultSyncSettings);
        return defaultSyncSettings;
    }
}

async function writeSyncSettings(settings) {
    settings.lastUpdated = new Date().toISOString();
    await fs.writeFile(SYNC_SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// Sync log helper functions
async function readSyncLog() {
    try {
        const data = await fs.readFile(SYNC_LOG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { logs: [], stats: { totalSyncs: 0, successfulSyncs: 0, failedSyncs: 0 } };
    }
}

async function writeSyncLog(logData) {
    await fs.writeFile(SYNC_LOG_FILE, JSON.stringify(logData, null, 2));
}

async function addSyncLogEntry(entry) {
    const logData = await readSyncLog();
    logData.logs = logData.logs || [];
    logData.stats = logData.stats || { totalSyncs: 0, successfulSyncs: 0, failedSyncs: 0 };
    
    // Add new log entry
    logData.logs.unshift({
        ...entry,
        timestamp: new Date().toISOString()
    });
    
    // Keep only last 100 log entries
    if (logData.logs.length > 100) {
        logData.logs = logData.logs.slice(0, 100);
    }
    
    // Update stats
    logData.stats.totalSyncs++;
    if (entry.status === 'success') {
        logData.stats.successfulSyncs++;
    } else if (entry.status === 'error') {
        logData.stats.failedSyncs++;
    }
    
    await writeSyncLog(logData);
}

// 🔄 CONSERVATIVE AUTO-SYNC SYSTEM WITH GENTLE RATE LIMITING
let currentDelay = 10000; // Start with 10 second delay (more conservative)
let consecutiveBlocks = 0;
let lastRequestTime = 0;

// Conservative delay calculator to prevent eBay blocking
function calculateSmartDelay(wasBlocked = false) {
    if (wasBlocked) {
        consecutiveBlocks++;
        // Much gentler exponential backoff: 10s → 30s → 60s → 120s → 300s (max 5min)
        currentDelay = Math.min(currentDelay * 2, 300000); 
        console.log(`⏳ eBay blocked request - increasing delay to ${currentDelay/1000}s`);
    } else {
        // Successful request - very slowly reduce delay but keep high minimum
        if (consecutiveBlocks > 0) {
            consecutiveBlocks = Math.max(0, consecutiveBlocks - 1);
            currentDelay = Math.max(10000, currentDelay * 0.9); // Slower reduction
        }
    }
    return currentDelay;
}

// Smart request function with retry logic
async function smartEbayRequest(url, maxRetries = 3) {
    let attempt = 0;
    let lastError = null;
    
    while (attempt < maxRetries) {
        attempt++;
        
        // Respect rate limiting
        const timeSinceLastRequest = Date.now() - lastRequestTime;
        const waitTime = Math.max(0, currentDelay - timeSinceLastRequest);
        
        if (waitTime > 0) {
            console.log(`⏱️ Waiting ${waitTime/1000}s before next request (attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        lastRequestTime = Date.now();
        
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Cache-Control': 'max-age=0'
                },
                timeout: 30000,
                maxRedirects: 5,
                validateStatus: function (status) {
                    return status >= 200 && status < 400;
                }
            });
            
            // Check if eBay blocked us
            if (response.data && response.data.includes('Pardon Our Interruption')) {
                console.log(`🚫 eBay blocked request to ${url} (attempt ${attempt}/${maxRetries})`);
                calculateSmartDelay(true);
                lastError = new Error('eBay rate limited - blocked request');
                
                if (attempt < maxRetries) {
                    console.log(`🔄 Retrying in ${currentDelay/1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, currentDelay));
                    continue;
                }
            } else {
                // Success!
                calculateSmartDelay(false);
                return response;
            }
            
        } catch (error) {
            console.log(`❌ Request failed: ${error.message} (attempt ${attempt}/${maxRetries})`);
            lastError = error;
            
            if (attempt < maxRetries) {
                // Progressive delay on errors
                const errorDelay = Math.min(attempt * 10000, 30000);
                console.log(`⏳ Waiting ${errorDelay/1000}s before retry...`);
                await new Promise(resolve => setTimeout(resolve, errorDelay));
            }
        }
    }
    
    throw lastError || new Error(`Failed after ${maxRetries} attempts`);
}

async function performAutoSync() {
    if (syncInProgress) {
        console.log('⏳ Sync already in progress, skipping...');
        return;
    }

    syncInProgress = true;
    const syncStartTime = new Date();
    console.log('🚀 Starting INTELLIGENT eBay sync with adaptive rate limiting at', syncStartTime.toLocaleString());

    let syncResults = {
        status: 'success',
        startTime: syncStartTime.toISOString(),
        endTime: null,
        type: 'intelligent_automatic',
        itemsChecked: 0,
        itemsSold: 0,
        pricesUpdated: 0,
        productsUpdated: 0,
        itemsImported: 0,
        retryAttempts: 0,
        blockedRequests: 0,
        errors: [],
        details: []
    };

    try {
        const syncSettings = await readSyncSettings();
        
        if (!syncSettings.autoSyncEnabled) {
            console.log('⚠️ Auto-sync is disabled');
            syncInProgress = false;
            return;
        }

        const products = await readProducts();
        
        // Phase 1: Check limited existing products for updates (with rotation to prevent blocking)
        const activeProducts = products.filter(p => !p.isSold);
        const syncLimit = Math.min(20, activeProducts.length); // Sync up to 20 products per session
        
        // Add rotation - start from different products each sync to cover all products over time
        const startIndex = Math.floor(Math.random() * Math.max(1, activeProducts.length - syncLimit));
        const limitedProducts = activeProducts.slice(startIndex, startIndex + syncLimit);
        
        console.log(`📊 Phase 1: Found ${activeProducts.length} active products, syncing ${limitedProducts.length} (starting from index ${startIndex}) to prevent blocking`);

        for (const product of limitedProducts) {
            const ebayItemId = extractEbayItemId(product.sourceUrl || product.buyLink);
            if (!ebayItemId) continue;

            try {
                syncResults.itemsChecked++;
                console.log(`🔍 Syncing ${syncResults.itemsChecked}/${activeProducts.length}: ${product.name.substring(0, 50)}...`);

                // Try eBay API first (if available)
                let itemData = null;
                let itemAvailable = true;

                if (eBay) {
                    try {
                        itemData = await eBay.browse.getItem(ebayItemId);
                        
                        // Check if price changed
                        if (syncSettings.syncTypes.priceChanges && itemData.price) {
                            const newPrice = parseFloat(itemData.price.value || itemData.price);
                            const currentPrice = parseFloat(product.price);
                            
                            if (Math.abs(newPrice - currentPrice) > 0.01) {
                                console.log(`💰 Price change: ${product.name.substring(0, 30)}... ${currentPrice} → ${newPrice}`);
                                product.price = newPrice;
                                product.originalPrice = newPrice;
                                product.priceUpdated = true;
                                product.lastPriceUpdate = new Date().toISOString();
                                syncResults.pricesUpdated++;
                                
                                syncResults.details.push({
                                    type: 'price_update',
                                    product: product.name,
                                    oldPrice: currentPrice,
                                    newPrice: newPrice
                                });
                            }
                        }

                        // Update product details if enabled
                        if (syncSettings.syncTypes.productUpdates && itemData.title !== product.name) {
                            console.log(`📝 Title update: ${product.name} → ${itemData.title}`);
                            product.name = itemData.title;
                            product.lastUpdated = new Date().toISOString();
                            syncResults.productsUpdated++;
                        }

                    } catch (apiError) {
                        console.log(`⚠️ eBay API failed for ${ebayItemId}, will use smart web scraping`);
                        itemData = null;
                    }
                }

                // If no API data, use smart web scraping
                if (!itemData) {
                    try {
                        const pageResponse = await smartEbayRequest(product.sourceUrl || product.buyLink);
                        const pageContent = pageResponse.data.toLowerCase();
                        
                        // Conservative sold detection - only mark sold if very clear
                        if (syncSettings.syncTypes.soldStatus && (
                            pageContent.includes('this listing has ended') || 
                            pageContent.includes('no longer available') ||
                            pageContent.includes('item not found') ||
                            pageContent.includes('listing not found')
                        )) {
                            itemAvailable = false;
                        }
                        
                    } catch (scrapeError) {
                        console.log(`⚠️ Could not verify ${product.name.substring(0, 30)}... - keeping as available`);
                        syncResults.retryAttempts++;
                        if (scrapeError.message.includes('rate limited')) {
                            syncResults.blockedRequests++;
                        }
                        itemAvailable = true; // Conservative: assume still available
                    }
                }

                // Mark item as sold if clearly not available
                if (!itemAvailable && syncSettings.syncTypes.soldStatus) {
                    console.log(`🔴 Item SOLD: ${product.name}`);
                    
                    product.isSold = true;
                    product.soldDate = new Date().toISOString().split('T')[0];
                    product.salePrice = product.price;
                    product.buyerInfo = 'eBay Customer';
                    product.dateModified = new Date().toISOString();
                    product.autoDetectedSold = true;
                    product.autoSyncDetected = true;
                    
                    syncResults.itemsSold++;
                    syncResults.details.push({
                        type: 'sold_detection',
                        product: product.name,
                        price: product.price
                    });
                }

            } catch (error) {
                console.error(`❌ Error syncing ${product.name}:`, error.message);
                syncResults.errors.push({
                    product: product.name,
                    error: error.message
                });
            }
        }

        // Phase 2: Smart import of missing products (expanded search)
        console.log(`📥 Phase 2: Checking for missing products to import...`);
        
        // Enhanced list with more potential products (can be dynamically updated)
        const potentialUrls = [
            "https://www.ebay.com/itm/336117180112", // Ralph Lauren Black Polo
            "https://www.ebay.com/itm/336122384819", // NYC Collectible Tee
            "https://www.ebay.com/itm/336117025691", // Y2K Baggy Blue Shorts
            "https://www.ebay.com/itm/336122367127", // Demon Slayer Tee
            "https://www.ebay.com/itm/336122396776", // Schitt Creek Tee  
            "https://www.ebay.com/itm/336122360178", // Spring Run Motorcycle Tee
            "https://www.ebay.com/itm/336117181381", // Ralph Lauren Green Tag
            // Add more URLs here as discovered
        ];
        
        // Check if these products are already imported
        const existingUrls = new Set(products.map(p => p.sourceUrl || p.buyLink));
        const newUrlsToImport = potentialUrls.filter(url => !existingUrls.has(url));
        
        console.log(`🔍 Enhanced search: Found ${newUrlsToImport.length} potentially new products to import from ${potentialUrls.length} candidates`);
        
        for (const url of newUrlsToImport) {
            try {
                console.log(`📦 Attempting smart import of: ${url}`);
                
                const response = await smartEbayRequest(url);
                
                // Check if we got blocked
                if (response.data.includes('Pardon Our Interruption')) {
                    console.log(`🚫 Import blocked for ${url} - will retry later`);
                    syncResults.blockedRequests++;
                    continue;
                }
                
                // Extract product data
                const $ = cheerio.load(response.data);
                
                // Extract comprehensive images like the manual import function
                let allImages = [];
                
                // Try meta image first
                let metaImage = $('meta[property="og:image"]').attr('content');
                if (metaImage) {
                    if (!metaImage.startsWith('http')) metaImage = 'https:' + metaImage;
                    allImages.push(metaImage);
                }
                
                // Look for eBay-specific image galleries first
                $('.ux-image-carousel-item img, .ux-image-grid img').each((i, elem) => {
                    let imgSrc = $(elem).attr('src') || $(elem).attr('data-src');
                    if (imgSrc && imgSrc.includes('ebayimg.com')) {
                        // Convert to high-res version
                        imgSrc = imgSrc.replace('/s-l64.', '/s-l400.').replace('/s-l140.', '/s-l400.');
                        if (!imgSrc.startsWith('http')) imgSrc = 'https:' + imgSrc;
                        if (!allImages.includes(imgSrc)) {
                            allImages.push(imgSrc);
                            console.log('🖼️ eBay gallery image:', imgSrc.substring(0, 50) + '...');
                        }
                    }
                });
                
                // Scan all img tags for product images as fallback
                $('img').each((i, elem) => {
                    let imgSrc = $(elem).attr('src') || $(elem).attr('data-src');
                    if (imgSrc && 
                        !imgSrc.includes('logo') && 
                        !imgSrc.includes('icon') && 
                        !imgSrc.includes('sprite') &&
                        !imgSrc.includes('ebay_logo') &&
                        (imgSrc.includes('.jpg') || imgSrc.includes('.jpeg') || imgSrc.includes('.png'))) {
                        
                        if (!imgSrc.startsWith('http')) imgSrc = 'https:' + imgSrc;
                        if (!allImages.includes(imgSrc)) {
                            allImages.push(imgSrc);
                            console.log('🖼️ Auto-import found image:', imgSrc.substring(0, 50) + '...');
                        }
                    }
                });

                const newProduct = {
                    id: Date.now() + Math.random() * 1000,
                    name: ($('title').text().trim().split('|')[0].trim() || 'eBay Product').substring(0, 150),
                    price: extractPriceFromPage($) || 0,
                    description: ($('meta[name="description"]').attr('content') || 'High-quality product from eBay').substring(0, 300),
                    category: 'clothing',
                    platform: 'ebay',
                    image: allImages[0] || '',
                    images: allImages.slice(0, 8),
                    sourceUrl: url,
                    buyLink: url,
                    dateAdded: new Date().toISOString(),
                    isSold: false,
                    isVintage: false,
                    customTags: [],
                    autoImported: true,
                    importedViaSync: true
                };
                
                // Only add if we got meaningful data
                if (newProduct.name !== 'eBay Product' && newProduct.price > 0) {
                    products.push(newProduct);
                    syncResults.itemsImported++;
                    console.log(`✅ Auto-imported: ${newProduct.name}`);
                    
                    syncResults.details.push({
                        type: 'auto_import',
                        product: newProduct.name,
                        price: newProduct.price,
                        url: url
                    });
                } else {
                    console.log(`⚠️ Skipped import - insufficient data for ${url}`);
                }
                
            } catch (importError) {
                console.log(`❌ Failed to import ${url}: ${importError.message}`);
                syncResults.errors.push({
                    url: url,
                    error: importError.message
                });
            }
        }

        // Save all changes
        if (syncResults.itemsSold > 0 || syncResults.pricesUpdated > 0 || 
            syncResults.productsUpdated > 0 || syncResults.itemsImported > 0) {
            await writeProducts(products);
            productCache = null; // Clear cache
            console.log('💾 Products database updated with intelligent sync changes');
        }

        // Update sync settings
        syncSettings.lastSyncTime = syncStartTime.toISOString();
        await writeSyncSettings(syncSettings);

        // Log comprehensive results
        const syncEndTime = new Date();
        syncResults.endTime = syncEndTime.toISOString();
        syncResults.duration = Math.round((syncEndTime - syncStartTime) / 1000);

        console.log(`\n✅ INTELLIGENT AUTO-SYNC COMPLETED in ${syncResults.duration}s:`);
        console.log(`   📊 Items checked: ${syncResults.itemsChecked}`);
        console.log(`   🔴 Items sold: ${syncResults.itemsSold}`);
        console.log(`   💰 Prices updated: ${syncResults.pricesUpdated}`);
        console.log(`   📝 Products updated: ${syncResults.productsUpdated}`);
        console.log(`   📦 Products imported: ${syncResults.itemsImported}`);
        console.log(`   🔄 Retry attempts: ${syncResults.retryAttempts}`);
        console.log(`   🚫 Blocked requests: ${syncResults.blockedRequests}`);
        console.log(`   ❌ Errors: ${syncResults.errors.length}`);
        console.log(`   ⏳ Final delay: ${currentDelay/1000}s\n`);

        await addSyncLogEntry(syncResults);
        lastAutoSyncTime = syncStartTime;

    } catch (error) {
        console.error('❌ Intelligent auto-sync failed:', error.message);
        syncResults.status = 'error';
        syncResults.endTime = new Date().toISOString();
        syncResults.errors.push({ error: error.message });
        await addSyncLogEntry(syncResults);
    } finally {
        syncInProgress = false;
    }
}

// Helper function to extract price from eBay page
function extractPriceFromPage($) {
    let priceText = $('meta[property="product:price:amount"]').attr('content') ||
                   $('meta[property="og:price:amount"]').attr('content') ||
                   $('script').text().match(/price["\']:\s*["\']([\d,.]+)["\']/)?.[ 1] ||
                   $('script').text().match(/\$[\d,]+\.?\d*/)?.[ 0] ||
                   '$0';
    
    let priceMatch = priceText.toString().match(/[\d,]+\.?\d*/);
    return priceMatch ? parseFloat(priceMatch[ 0].replace(/,/g, '')) : 0;
}

// Initialize and start auto-sync system
async function initializeAutoSync() {
    try {
        const syncSettings = await readSyncSettings();
        
        if (syncSettings.autoSyncEnabled) {
            const intervalMs = syncSettings.syncIntervalMinutes * 60 * 1000;
            
            console.log(`🔄 Auto-sync enabled: every ${syncSettings.syncIntervalMinutes} minutes`);
            
            // Clear existing interval if any
            if (syncInterval) {
                clearInterval(syncInterval);
            }
            
            // Set up new interval with error handling
            syncInterval = setInterval(() => {
                performAutoSync().catch(error => {
                    console.error('❌ Scheduled auto-sync failed:', error.message);
                    // Don't crash the server if sync fails
                });
            }, intervalMs);
            
            // Perform initial sync after 30 minutes to allow website to load first (increased delay)
            setTimeout(() => {
                performAutoSync().catch(error => {
                    console.error('❌ Initial auto-sync failed:', error.message);
                    // Don't crash the server if sync fails
                });
            }, 1800000); // 30 minutes instead of 10
        } else {
            console.log('⏸️ Auto-sync is disabled');
        }
    } catch (error) {
        console.error('❌ Failed to initialize auto-sync:', error.message);
    }
}

// Authentication Routes
app.post('/api/admin/login', authenticateAdmin);

// Protected route example
app.get('/api/admin/verify', verifyToken, (req, res) => {
    res.json({
        success: true,
        message: 'Token is valid',
        user: req.user
    });
});

// Contact form submission
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, company, budget, timeline, description, projectTypes } = req.body;
        
        // Basic validation
        if (!name || !email || !description) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, and description are required'
            });
        }
        
        // Create contact submission object
        const contactSubmission = {
            name,
            email,
            company: company || 'Not specified',
            budget: budget || 'Not specified',
            timeline: timeline || 'Not specified',
            description,
            projectTypes: projectTypes || [],
            timestamp: new Date().toISOString(),
            ip: req.ip,
            userAgent: req.get('User-Agent')
        };
        
        // Save to file (in production, you'd save to database)
        const contactsFile = path.join(__dirname, 'data', 'contacts.json');
        let contacts = [];
        
        try {
            const existingData = await fs.readFile(contactsFile, 'utf8');
            contacts = JSON.parse(existingData);
        } catch (error) {
            // File doesn't exist, start with empty array
            contacts = [];
        }
        
        contacts.push(contactSubmission);
        
        // Keep only last 1000 contacts
        if (contacts.length > 1000) {
            contacts = contacts.slice(-1000);
        }
        
        await fs.writeFile(contactsFile, JSON.stringify(contacts, null, 2));
        
        console.log('📧 New contact submission:', name, email);
        
        res.json({
            success: true,
            message: 'Contact form submitted successfully'
        });
        
    } catch (error) {
        console.error('❌ Contact form error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit contact form'
        });
    }
});

// API Routes
app.get('/api/test', (req, res) => {
    console.log('✅ API test route called!');
    res.json({ 
        message: 'Backend connected successfully!',
        timestamp: new Date(),
        status: 'working'
    });
});

// GET products - reads from file
app.get('/api/products', async (req, res) => {
    try {
        // Add strong cache-busting headers
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        console.log('📦 Products API: Reading from file...');
        const products = await readProducts();
        console.log('📦 Sending', products.length, 'products from file');
        res.json(products);
    } catch (error) {
        console.error('❌ Error reading products:', error);
        res.status(500).json({ error: 'Failed to read products' });
    }
});

// Clear all products - for admin use - MUST be before /:id route
app.delete('/api/products/clear-all', async (req, res) => {
    try {
        console.log('🗑️ Clearing all products');
        
        // Write empty array to products file
        await writeProducts([]);
        
        // Clear server cache immediately
        productCache = null;
        cacheExpiry = 0;
        console.log('🧹 Server cache cleared');
        
        console.log('✅ All products cleared successfully');
        res.json({ 
            success: true,
            message: 'All products cleared successfully',
            remainingProducts: 0
        });
        
    } catch (error) {
        console.error('❌ Failed to clear products:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get sold products - MUST be before /:id route
app.get('/api/products/sold', async (req, res) => {
    try {
        console.log('📋 Getting sold products');
        const products = await readProducts();
        const soldProducts = products.filter(p => p.isSold === true);
        
        console.log('💰 Found', soldProducts.length, 'sold products');
        res.json(soldProducts);
    } catch (error) {
        console.error('❌ Error reading sold products:', error);
        res.status(500).json({ error: 'Failed to read sold products' });
    }
});

// GET products with sorting applied - MUST be before /:id route
app.get('/api/products/sorted', async (req, res) => {
    try {
        console.log('📦 Getting sorted products');
        const products = await readProducts();
        const settings = await readStoreSettings();
        
        // Apply sorting based on settings
        let sortedProducts = [...products];
        switch (settings.sortOrder) {
            case 'price-low-high':
                sortedProducts.sort((a, b) => (a.price || 0) - (b.price || 0));
                break;
            case 'price-high-low':
                sortedProducts.sort((a, b) => (b.price || 0) - (a.price || 0));
                break;
            case 'name-az':
                sortedProducts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                break;
            case 'name-za':
                sortedProducts.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
                break;
            case 'date-newest':
                sortedProducts.sort((a, b) => new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0));
                break;
            case 'date-oldest':
                sortedProducts.sort((a, b) => new Date(a.dateAdded || 0) - new Date(b.dateAdded || 0));
                break;
            case 'category':
                sortedProducts.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
                break;
        }
        
        // Apply category filter if specified
        if (settings.defaultCategory && settings.defaultCategory !== 'all') {
            sortedProducts = sortedProducts.filter(p => p.category === settings.defaultCategory);
        }
        
        console.log('📦 Sending', sortedProducts.length, 'sorted products (', settings.sortOrder, ')');
        res.json({
            products: sortedProducts,
            settings: settings,
            totalCount: products.length,
            filteredCount: sortedProducts.length
        });
    } catch (error) {
        console.error('❌ Error reading sorted products:', error);
        res.status(500).json({ error: 'Failed to read sorted products' });
    }
});

// GET single product by ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        console.log('🔍 Getting single product with ID:', productId);
        
        const products = await readProducts();
        const product = products.find(p => p.id === productId);
        
        if (!product) {
            console.log('❌ Product not found with ID:', productId);
            return res.status(404).json({ error: 'Product not found' });
        }
        
        console.log('✅ Found product:', product.name);
        res.json(product);
    } catch (error) {
        console.error('❌ Error reading product:', error);
        res.status(500).json({ error: 'Failed to read product' });
    }
});

// POST products - adds new product to file
app.post('/api/products', async (req, res) => {
    try {
        console.log('💾 Adding product to backend:', req.body.name);
        
        // Read existing products
        const products = await readProducts();
        console.log('📂 Current products in file:', products.length);
        
        // Create new product
        const newProduct = {
            id: Date.now(),
            name: req.body.name,
            price: req.body.price,
            description: req.body.description,
            category: req.body.category || 'electronics',
            platform: req.body.platform,
            image: req.body.image,
            images: req.body.images || [],
            sourceUrl: req.body.sourceUrl,
            buyLink: req.body.buyLink,
            dateAdded: new Date().toISOString(),
            // Vintage logic: manual admin marking OR auto-mark if price > $35
            isVintage: req.body.isVintage === true || req.body.price > 35,
            // Custom tags system for admin-created unique tags
            customTags: req.body.customTags || []
        };
        
        // Add to products array
        products.push(newProduct);
        
        // Save to file
        await writeProducts(products);
        
        console.log('✅ Product saved successfully:', newProduct.name);
        console.log('📊 Total products now:', products.length);
        
        res.json(newProduct);
        
    } catch (error) {
        console.error('❌ Failed to save product:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE product - NEW ROUTE FOR DELETING PRODUCTS
app.delete('/api/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        console.log('🗑️ Deleting product with ID:', productId);
        
        // Read existing products
        const products = await readProducts();
        console.log('📂 Current products before delete:', products.length);
        
        // Find product to delete
        const productToDelete = products.find(p => p.id === productId);
        if (!productToDelete) {
            console.log('❌ Product not found with ID:', productId);
            return res.status(404).json({ error: 'Product not found' });
        }
        
        console.log('🎯 Found product to delete:', productToDelete.name);
        
        // Filter out the product to delete
        const updatedProducts = products.filter(p => p.id !== productId);
        
        // Save updated products to file
        await writeProducts(updatedProducts);
        
        console.log('✅ Product deleted successfully:', productToDelete.name);
        console.log('📊 Remaining products:', updatedProducts.length);
        
        res.json({ 
            success: true,
            message: 'Product deleted successfully',
            deletedProduct: {
                id: productToDelete.id,
                name: productToDelete.name
            },
            remainingCount: updatedProducts.length
        });
        
    } catch (error) {
        console.error('❌ Failed to delete product:', error);
        res.status(500).json({ error: error.message });
    }
});

// Store Settings API Routes
// GET store settings
app.get('/api/store-settings', async (req, res) => {
    try {
        console.log('⚙️ Getting store settings');
        const settings = await readStoreSettings();
        res.json(settings);
    } catch (error) {
        console.error('❌ Error reading store settings:', error);
        res.status(500).json({ error: 'Failed to read store settings' });
    }
});

// POST store settings
app.post('/api/store-settings', async (req, res) => {
    try {
        const newSettings = req.body;
        console.log('⚙️ Updating store settings:', newSettings);
        
        // Validate settings
        const validSettings = {
            sortOrder: newSettings.sortOrder || 'price-low-high',
            displayStyle: newSettings.displayStyle || 'grid',
            itemsPerPage: newSettings.itemsPerPage || '24',
            defaultCategory: newSettings.defaultCategory || 'all'
        };
        
        await writeStoreSettings(validSettings);
        
        console.log('✅ Store settings updated successfully');
        res.json({
            success: true,
            message: 'Store settings updated successfully',
            settings: validSettings
        });
    } catch (error) {
        console.error('❌ Error updating store settings:', error);
        res.status(500).json({ error: 'Failed to update store settings' });
    }
});

// 🔄 SYNC MANAGEMENT API ENDPOINTS

// GET sync settings
app.get('/api/sync-settings', async (req, res) => {
    try {
        console.log('⚙️ Getting sync settings');
        const settings = await readSyncSettings();
        res.json(settings);
    } catch (error) {
        console.error('❌ Error reading sync settings:', error);
        res.status(500).json({ error: 'Failed to read sync settings' });
    }
});

// POST sync settings
app.post('/api/sync-settings', async (req, res) => {
    try {
        const newSettings = req.body;
        console.log('⚙️ Updating sync settings:', newSettings);
        
        // Validate settings
        const validSettings = {
            autoSyncEnabled: newSettings.autoSyncEnabled !== undefined ? newSettings.autoSyncEnabled : true,
            syncIntervalMinutes: Math.max(15, newSettings.syncIntervalMinutes || 60), // Min 15 minutes
            syncTypes: {
                soldStatus: newSettings.syncTypes?.soldStatus !== undefined ? newSettings.syncTypes.soldStatus : true,
                priceChanges: newSettings.syncTypes?.priceChanges !== undefined ? newSettings.syncTypes.priceChanges : true,
                productUpdates: newSettings.syncTypes?.productUpdates !== undefined ? newSettings.syncTypes.productUpdates : true
            },
            retrySettings: {
                maxRetries: Math.min(10, newSettings.retrySettings?.maxRetries || 3), // Max 10 retries
                retryDelayMinutes: Math.max(1, newSettings.retrySettings?.retryDelayMinutes || 5) // Min 1 minute
            }
        };
        
        // Get current settings to preserve some fields
        const currentSettings = await readSyncSettings();
        const updatedSettings = {
            ...currentSettings,
            ...validSettings
        };
        
        await writeSyncSettings(updatedSettings);
        
        // Restart auto-sync with new settings
        if (updatedSettings.autoSyncEnabled) {
            console.log('🔄 Restarting auto-sync with new settings...');
            await initializeAutoSync();
        } else {
            console.log('⏸️ Stopping auto-sync...');
            if (syncInterval) {
                clearInterval(syncInterval);
                syncInterval = null;
            }
        }
        
        console.log('✅ Sync settings updated successfully');
        res.json({
            success: true,
            message: 'Sync settings updated successfully',
            settings: updatedSettings
        });
    } catch (error) {
        console.error('❌ Error updating sync settings:', error);
        res.status(500).json({ error: 'Failed to update sync settings' });
    }
});

// GET sync status and logs
app.get('/api/sync-status', async (req, res) => {
    try {
        console.log('📊 Getting sync status');
        const logData = await readSyncLog();
        const syncSettings = await readSyncSettings();
        
        res.json({
            syncInProgress: syncInProgress,
            lastAutoSyncTime: lastAutoSyncTime,
            settings: syncSettings,
            stats: logData.stats,
            recentLogs: logData.logs.slice(0, 10) // Last 10 logs
        });
    } catch (error) {
        console.error('❌ Error reading sync status:', error);
        res.status(500).json({ error: 'Failed to read sync status' });
    }
});

// GET detailed sync logs
app.get('/api/sync-logs', async (req, res) => {
    try {
        console.log('📜 Getting sync logs');
        const logData = await readSyncLog();
        res.json(logData);
    } catch (error) {
        console.error('❌ Error reading sync logs:', error);
        res.status(500).json({ error: 'Failed to read sync logs' });
    }
});

// POST manual sync trigger
app.post('/api/sync-trigger', async (req, res) => {
    try {
        console.log('🚀 Manual sync triggered');
        
        if (syncInProgress) {
            return res.json({
                success: false,
                message: 'Sync already in progress',
                syncInProgress: true
            });
        }
        
        // Start sync in background
        performAutoSync().catch(error => {
            console.error('❌ Manual sync failed:', error);
        });
        
        res.json({
            success: true,
            message: 'Manual sync started',
            syncInProgress: true
        });
        
    } catch (error) {
        console.error('❌ Error triggering manual sync:', error);
        res.status(500).json({ error: 'Failed to trigger manual sync' });
    }
});

// Get eBay store URLs (for auto-import)
app.post('/api/ebay/get-store-urls', async (req, res) => {
    try {
        console.log('🔍 Getting eBay store URLs');
        
        // Return the pre-scanned missing URLs
        const missingUrls = [
            "https://www.ebay.com/itm/336121633610",
            "https://www.ebay.com/itm/336117041224", 
            "https://www.ebay.com/itm/336122385881",
            "https://www.ebay.com/itm/336122345757",
            "https://www.ebay.com/itm/336122353950",
            "https://www.ebay.com/itm/336122400475",
            "https://www.ebay.com/itm/336122350230",
            "https://www.ebay.com/itm/336122322093",
            "https://www.ebay.com/itm/336122382939",
            "https://www.ebay.com/itm/336122365182",
            "https://www.ebay.com/itm/336122394965",
            "https://www.ebay.com/itm/336122393815",
            "https://www.ebay.com/itm/336122355698",
            "https://www.ebay.com/itm/336123961180",
            "https://www.ebay.com/itm/336122363807",
            "https://www.ebay.com/itm/336122379893",
            "https://www.ebay.com/itm/336123968441",
            "https://www.ebay.com/itm/336122389587",
            "https://www.ebay.com/itm/336118761422",
            "https://www.ebay.com/itm/336117180112",
            "https://www.ebay.com/itm/336122384819",
            "https://www.ebay.com/itm/336117025691",
            "https://www.ebay.com/itm/336122367127",
            "https://www.ebay.com/itm/336122396776",
            "https://www.ebay.com/itm/336122360178",
            "https://www.ebay.com/itm/336117181381"
        ];

        res.json({
            success: true,
            urls: missingUrls,
            count: missingUrls.length,
            message: `Found ${missingUrls.length} missing products from your eBay store`
        });

    } catch (error) {
        console.error('❌ Error getting store URLs:', error);
        res.status(500).json({ error: 'Failed to get eBay store URLs' });
    }
});

// Extract product from URL
app.post('/api/extract-product', async (req, res) => {
    try {
        const { url } = req.body;
        console.log('🔍 Extracting from:', url);
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 30000,
            maxRedirects: 5,
            validateStatus: function (status) {
                return status >= 200 && status < 400; // Accept redirects
            }
        });
        
        // Check if eBay blocked us
        if (response.data && response.data.includes('Pardon Our Interruption')) {
            console.log('⚠️ eBay blocked the request - rate limited or bot detected');
            throw new Error('eBay blocked this request. Please try again later or use a different approach.');
        }
        
        const $ = cheerio.load(response.data);
        
        let product = {
            name: 'Extracted Product',
            price: 0,
            description: '',
            platform: 'ebay',
            image: '',
            images: [],
            sourceUrl: url,
            buyLink: url
        };
        
        if (url.includes('ebay.com')) {
            // Extract name from page title
            product.name = $('title').text().trim().split('|')[0].trim() || 
                          $('meta[property="og:title"]').attr('content') ||
                          'eBay Product';
            
            // Extract price from meta tags and page content
            let priceText = $('meta[property="product:price:amount"]').attr('content') ||
                           $('meta[property="og:price:amount"]').attr('content') ||
                           $('script').text().match(/price["\']:\s*["\']([\d,.]+)["\']/)?.[1] ||
                           $('script').text().match(/\$[\d,]+\.?\d*/)?.[0] ||
                           '$0';
            
            console.log('💰 Found price:', priceText);
            
            // Parse price
            let priceMatch = priceText.toString().match(/[\d,]+\.?\d*/);
            product.price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;
            
            // Extract images
            let allImages = [];
            
            // Try meta image first
            let metaImage = $('meta[property="og:image"]').attr('content');
            if (metaImage) {
                if (!metaImage.startsWith('http')) metaImage = 'https:' + metaImage;
                allImages.push(metaImage);
            }
            
            // Look for eBay-specific image galleries first
            $('.ux-image-carousel-item img, .ux-image-grid img').each((i, elem) => {
                let imgSrc = $(elem).attr('src') || $(elem).attr('data-src');
                if (imgSrc && imgSrc.includes('ebayimg.com')) {
                    // Convert to high-res version
                    imgSrc = imgSrc.replace('/s-l64.', '/s-l400.').replace('/s-l140.', '/s-l400.');
                    if (!imgSrc.startsWith('http')) imgSrc = 'https:' + imgSrc;
                    if (!allImages.includes(imgSrc)) {
                        allImages.push(imgSrc);
                        console.log('🖼️ eBay gallery image:', imgSrc.substring(0, 50) + '...');
                    }
                }
            });
            
            // Scan all img tags for product images as fallback
            $('img').each((i, elem) => {
                let imgSrc = $(elem).attr('src') || $(elem).attr('data-src');
                if (imgSrc && 
                    !imgSrc.includes('logo') && 
                    !imgSrc.includes('icon') && 
                    !imgSrc.includes('sprite') &&
                    !imgSrc.includes('ebay_logo') &&
                    (imgSrc.includes('.jpg') || imgSrc.includes('.jpeg') || imgSrc.includes('.png'))) {
                    
                    if (!imgSrc.startsWith('http')) imgSrc = 'https:' + imgSrc;
                    if (!allImages.includes(imgSrc)) {
                        allImages.push(imgSrc);
                        console.log('🖼️ Found image:', imgSrc.substring(0, 80) + '...');
                    }
                }
            });
            
            product.image = allImages[0] || '';
            product.images = allImages.slice(0, 8);
            
            // Extract description
            product.description = $('meta[name="description"]').attr('content') ||
                                $('meta[property="og:description"]').attr('content') ||
                                'High-quality product from eBay';
            
            product.platform = 'ebay';
        }
        
        // Clean up
        product.name = product.name.substring(0, 150).trim();
        product.description = product.description.substring(0, 300).trim();
        
        console.log('✅ Extraction complete:', {
            name: product.name.substring(0, 50) + '...',
            price: product.price,
            totalImages: product.images.length,
            hasMainImage: !!product.image
        });
        
        res.json(product);
        
    } catch (error) {
        console.error('❌ Extraction failed:', error.message);
        res.json({
            name: 'Product from eBay',
            price: 0,
            description: 'Could not extract details automatically',
            platform: 'ebay',
            image: '',
            images: [],
            sourceUrl: req.body.url,
            buyLink: req.body.url
        });
    }
});

// eBay API - Get item details by ID
app.get('/api/ebay/item/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;
        console.log('📦 eBay API Get Item:', itemId);

        if (!eBay) {
            return res.status(503).json({ 
                error: 'eBay API not available - demo mode only',
                demo: true 
            });
        }

        const item = await eBay.browse.getItem(itemId);
        
        // Transform to our product format
        const product = {
            ebayItemId: item.itemId,
            name: item.title,
            price: parseFloat(item.price?.value || 0),
            currency: item.price?.currency || 'USD',
            description: item.shortDescription || item.description || 'High-quality product from eBay',
            image: item.image?.imageUrl || '',
            images: item.additionalImages?.map(img => img.imageUrl) || [],
            condition: item.condition,
            platform: 'ebay',
            sourceUrl: item.itemWebUrl,
            buyLink: item.itemWebUrl
        };

        console.log('✅ eBay Item Details Retrieved:', product.name);
        res.json(product);

    } catch (error) {
        console.error('❌ eBay Item API Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to get eBay item details', 
            details: error.message 
        });
    }
});

// eBay Store - Get product URLs from store page  
app.post('/api/ebay/store-urls', async (req, res) => {
    try {
        const { storeUrl } = req.body;
        console.log('🔍 Extracting URLs from store:', storeUrl);

        if (!storeUrl || !storeUrl.includes('ebay.com/usr/')) {
            return res.status(400).json({ error: 'Invalid eBay store URL' });
        }

        // Since eBay blocks server-side scraping, return instructions for manual extraction
        const instructions = {
            success: false,
            error: 'eBay blocks automated scraping',
            instructions: [
                '1. Open your eBay store in browser: ' + storeUrl,
                '2. Open browser Developer Tools (F12)',
                '3. Go to Console tab',
                '4. Paste this code:',
                `
const urls = [];
document.querySelectorAll('a[href*="/itm/"]').forEach(link => {
    const href = link.href.split('?')[0];
    if (href.includes('/itm/') && !urls.includes(href)) {
        urls.push(href);
    }
});
console.log('Found URLs:', urls);
copy(urls.join('\\n')); // Copies to clipboard
                `,
                '5. The URLs will be copied to your clipboard',
                '6. Paste them in the text area below and click Import'
            ]
        };

        res.json(instructions);

    } catch (error) {
        console.error('❌ URL Extraction Error:', error.message);
        res.status(500).json({ 
            error: 'Failed to extract store URLs', 
            details: error.message 
        });
    }
});

// Intelligent Product Categorization
function categorizeProduct(name, description = '') {
    const text = (name + ' ' + description).toLowerCase();
    
    // Clothing keywords
    if (text.match(/\b(shirt|tshirt|t-shirt|jacket|coat|jeans|pants|trousers|dress|skirt|blouse|sweater|hoodie|cardigan|blazer|suit|tie|scarf|hat|cap|shoes|boots|sneakers|sandals|belt|gloves|socks|underwear|bra|lingerie|pajama|nightwear|swimwear|bikini|shorts|polo|tank|vest|denim|leather|wool|cotton|silk|vintage clothing|apparel|fashion|wear|outfit)\b/)) {
        return 'clothing';
    }
    
    // Electronics keywords
    if (text.match(/\b(phone|smartphone|computer|laptop|tablet|ipad|iphone|android|tv|television|monitor|speaker|headphone|earphone|camera|radio|stereo|electronic|digital|tech|gadget|device|console|gaming|playstation|xbox|nintendo|processor|memory|hard drive|ssd|usb|charger|cable|battery|wire|circuit|chip|component)\b/)) {
        return 'electronics';
    }
    
    // Home & Garden keywords
    if (text.match(/\b(home|house|kitchen|bedroom|bathroom|living room|dining|furniture|chair|table|sofa|bed|mattress|pillow|blanket|sheet|curtain|lamp|light|mirror|frame|vase|pot|plant|garden|outdoor|decor|decoration|ceramic|glass|wood|metal|plastic|storage|organization|cleaning|tool|appliance|microwave|refrigerator|oven|dishwasher|vacuum|iron)\b/)) {
        return 'home';
    }
    
    // Collectibles keywords
    if (text.match(/\b(collectible|antique|vintage|rare|limited|edition|coin|stamp|card|trading|baseball|pokemon|magic|comic|book|art|painting|sculpture|figurine|toy|doll|model|memorabilia|signed|autograph|historic|old|classic|retro|nostalgia|collection)\b/)) {
        return 'collectibles';
    }
    
    // Accessories keywords
    if (text.match(/\b(watch|jewelry|ring|necklace|bracelet|earring|pendant|chain|accessory|bag|purse|wallet|handbag|backpack|luggage|sunglasses|glasses|keychain|pin|badge|cufflink|brooch|charm)\b/)) {
        return 'accessories';
    }
    
    // Books & Media
    if (text.match(/\b(book|novel|magazine|newspaper|cd|dvd|bluray|vinyl|record|album|music|movie|film|video|media|literature|textbook|manual|guide|encyclopedia)\b/)) {
        return 'books';
    }
    
    // Sports & Outdoors
    if (text.match(/\b(sport|sports|outdoor|camping|hiking|fishing|hunting|golf|tennis|football|basketball|baseball|soccer|bike|bicycle|skateboard|ski|snowboard|fitness|exercise|gym|workout|equipment|gear|athletic)\b/)) {
        return 'sports';
    }
    
    // Default to vintage if price suggests it or contains vintage keywords
    if (text.match(/\b(vintage|antique|retro|classic|old|historic|traditional|heritage|nostalgia|period|era|decades?|\d{4}s|mid.century|art.deco)\b/)) {
        return 'vintage';
    }
    
    // Default fallback
    return 'vintage';
}

// Extract product data from eBay page
function extractProductData(page, url) {
    try {
        const $ = page;
        
        // Extract product name
        let name = $('#x-title-label-lbl').text().trim() ||
                  $('[data-testid="x-title-label"]').text().trim() ||
                  $('h1[id*="title"]').text().trim() ||
                  $('h1').first().text().trim() ||
                  $('title').text().split('|')[0].trim();
        
        // Extract price
        let priceText = $('.price .ur-money .ur-units').text().trim() ||
                       $('.price-current .ur-money').text().trim() ||
                       $('.u-flL.condText .ur-money').text().trim() ||
                       $('[data-testid="price"] .ur-money').text().trim() ||
                       $('.notranslate').text().match(/\$[\d,]+\.?\d*/)?.[0] ||
                       ($('script').text().match(/price[\"\\']:\\s*[\"\\']([\\d,.]+)[\"\\']/) || [])[1] ||
                       '0';
        
        const priceMatch = priceText.replace(/[,$]/g, '').match(/[\d.]+/);
        const price = priceMatch ? parseFloat(priceMatch[0]) : 0;
        
        // Extract description
        let description = $('#desc_div').text().trim() ||
                         $('[data-testid="item-description"]').text().trim() ||
                         $('.u-flL.condText').text().trim() ||
                         $('meta[name="description"]').attr('content') ||
                         'Authentic vintage item from eBay store';
        
        // Limit description length
        description = description.substring(0, 300).trim();
        
        // Extract main image
        let mainImage = $('#icImg').attr('src') ||
                       $('[data-testid="image-viewer"] img').attr('src') ||
                       $('.img img').first().attr('src') ||
                       $('img[src*="ebayimg"]').first().attr('src') ||
                       '';
        
        // Clean up image URL
        if (mainImage && !mainImage.startsWith('http')) {
            mainImage = 'https:' + mainImage;
        }
        
        // Extract additional images
        let images = [mainImage].filter(Boolean);
        $('img[src*="ebayimg"]').each((i, elem) => {
            let imgSrc = $(elem).attr('src');
            if (imgSrc && !imgSrc.includes('logo') && !images.includes(imgSrc)) {
                if (!imgSrc.startsWith('http')) imgSrc = 'https:' + imgSrc;
                images.push(imgSrc);
            }
        });
        images = images.slice(0, 5); // Limit to 5 images
        
        // Intelligent categorization
        const category = categorizeProduct(name, description);
        
        return {
            name: name.substring(0, 150).trim(),
            price: price,
            description: description,
            platform: 'ebay',
            image: mainImage,
            images: images,
            sourceUrl: url,
            buyLink: url,
            category: category
        };
        
    } catch (error) {
        console.error('❌ Error extracting product data:', error);
        return {
            name: 'eBay Product',
            price: 0,
            description: 'Product from eBay store',
            platform: 'ebay',
            image: '',
            images: [],
            sourceUrl: url,
            buyLink: url,
            category: 'vintage'
        };
    }
}

// Step 1: Get eBay Store Product URLs (lighter request)
app.post('/api/ebay/get-store-urls', async (req, res) => {
    try {
        const { storeUrl } = req.body;
        console.log('🔍 Getting product URLs from store:', storeUrl);

        if (!storeUrl || !storeUrl.includes('ebay.com/usr/')) {
            return res.status(400).json({ error: 'Invalid eBay store URL' });
        }

        // Extract store name from URL
        const storeName = storeUrl.split('/usr/')[1];
        console.log('👤 Store name:', storeName);

        try {
            // Random user agents to avoid detection
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
            ];
            const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
            
            // Initial delay to be respectful
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
            
            const response = await axios.get(storeUrl, {
                headers: {
                    'User-Agent': randomUA,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                timeout: 15000,
                maxRedirects: 5
            });

            const $ = cheerio.load(response.data);
            
            // Extract product listings from eBay store
            const productLinks = [];
            $('a[href*="/itm/"]').each((i, elem) => {
                const href = $(elem).attr('href');
                if (href && href.includes('/itm/') && !productLinks.includes(href)) {
                    const cleanUrl = href.split('?')[0]; // Remove URL parameters
                    if (!productLinks.includes(cleanUrl)) {
                        productLinks.push(cleanUrl);
                    }
                }
            });

            console.log('🔗 Found', productLinks.length, 'product links');
            
            if (productLinks.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No products found in store. Please check the store URL or try again later.',
                    storeUrl: storeUrl,
                    storeName: storeName
                });
            }

            res.json({
                success: true,
                message: `Found ${productLinks.length} products in ${storeName} store`,
                productUrls: productLinks,
                storeName: storeName,
                storeUrl: storeUrl,
                nextStep: 'Use /api/ebay/import-from-urls to import these products'
            });

        } catch (error) {
            console.warn('⚠️ Store URL extraction failed:', error.message);
            res.status(400).json({
                success: false,
                error: 'Could not access store. eBay may be blocking requests.',
                details: error.message,
                suggestion: 'Try again in a few minutes or check if the store URL is correct'
            });
        }

    } catch (error) {
        console.error('❌ Store URL extraction error:', error.message);
        res.status(500).json({
            error: 'Failed to extract store URLs',
            details: error.message
        });
    }
});

// Step 2: Import products from URLs (heavier request with delays)
app.post('/api/ebay/import-from-urls', async (req, res) => {
    try {
        const { productUrls, storeName, storeUrl, maxProducts = 5 } = req.body;
        
        if (!productUrls || !Array.isArray(productUrls)) {
            return res.status(400).json({ error: 'productUrls array is required' });
        }

        console.log('🚀 Importing products from', productUrls.length, 'URLs, max:', maxProducts);

        const extractedProducts = [];
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
        ];
        
        // Process only a limited number of URLs to avoid timeouts
        const linksToProcess = productUrls.slice(0, maxProducts);
        
        for (const [index, link] of linksToProcess.entries()) {
            try {
                console.log(`🔍 Processing product ${index + 1}/${linksToProcess.length}:`, link.substring(0, 80) + '...');
                
                // Random user agent for each product request
                const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
                
                // Random delay between 3-6 seconds to be very respectful
                const randomDelay = 3000 + Math.random() * 3000;
                console.log(`⏳ Waiting ${Math.round(randomDelay)}ms before request...`);
                await new Promise(resolve => setTimeout(resolve, randomDelay));
                
                const productResponse = await axios.get(link, {
                    headers: {
                        'User-Agent': randomUA,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'DNT': '1',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1'
                    },
                    timeout: 15000
                });

                const productPage = cheerio.load(productResponse.data);
                
                // Extract product data
                const productData = extractProductData(productPage, link);
                if (productData.name && productData.price > 0) {
                    extractedProducts.push(productData);
                    console.log('✅ Extracted:', productData.name.substring(0, 50) + '...');
                } else {
                    console.log('⚠️ Product data incomplete:', productData.name || 'No name', '$' + productData.price);
                }
                
            } catch (productError) {
                console.warn('⚠️ Failed to process product:', link, productError.message);
                continue;
            }
        }

        if (extractedProducts.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No products could be extracted from the provided URLs',
                processedUrls: linksToProcess.length
            });
        }

        // Read existing products and add new ones
        const products = await readProducts();
        let importedCount = 0;

        for (const productData of extractedProducts) {
            const newProduct = {
                id: Date.now() + Math.random(), // Unique ID
                name: productData.name,
                price: productData.price,
                description: productData.description,
                category: productData.category,
                platform: productData.platform,
                image: productData.image,
                images: productData.images,
                sourceUrl: productData.sourceUrl,
                buyLink: productData.buyLink,
                dateAdded: new Date().toISOString(),
                isVintage: productData.price > 35, // Auto-vintage logic
                customTags: [],
                importedFrom: storeUrl || 'eBay Store',
                storeName: storeName || 'Unknown Store'
            };

            products.push(newProduct);
            importedCount++;
        }

        // Save updated products
        await writeProducts(products);

        console.log('✅ Import complete:', importedCount, 'products imported');
        
        res.json({
            success: true,
            message: `Successfully imported ${importedCount} products from ${storeName || 'eBay store'}`,
            importedCount: importedCount,
            totalProcessed: linksToProcess.length,
            remainingUrls: productUrls.length - linksToProcess.length,
            products: extractedProducts
        });

    } catch (error) {
        console.error('❌ Import from URLs error:', error.message);
        res.status(500).json({
            error: 'Failed to import products from URLs',
            details: error.message
        });
    }
});

// Auto-Import eBay Store Products (Combined - for backward compatibility)
app.post('/api/ebay/auto-import-store', async (req, res) => {
    try {
        const { storeUrl } = req.body;
        console.log('🚀 Auto-importing from store:', storeUrl);

        if (!storeUrl || !storeUrl.includes('ebay.com/usr/')) {
            return res.status(400).json({ error: 'Invalid eBay store URL' });
        }

        // Extract store name from URL
        const storeName = storeUrl.split('/usr/')[1];
        console.log('👤 Store name:', storeName);

        // Try to fetch real eBay store data
        let extractedProducts = [];
        
        try {
            console.log('🔍 Attempting to fetch store page:', storeUrl);
            
            // Random user agents to avoid detection
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
            ];
            const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
            
            // Initial delay to be respectful
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
            
            const response = await axios.get(storeUrl, {
                headers: {
                    'User-Agent': randomUA,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                timeout: 15000,
                maxRedirects: 5
            });

            const $ = cheerio.load(response.data);
            
            // Extract product listings from eBay store
            const productLinks = [];
            $('a[href*="/itm/"]').each((i, elem) => {
                const href = $(elem).attr('href');
                if (href && href.includes('/itm/') && !productLinks.includes(href)) {
                    productLinks.push(href.split('?')[0]); // Remove URL parameters
                }
            });

            console.log('🔗 Found', productLinks.length, 'product links');

            // Extract products from first few links (to avoid overwhelming)
            const linksToProcess = productLinks.slice(0, 10); // Process first 10 products
            
            for (const link of linksToProcess) {
                try {
                    console.log('🔍 Processing product:', link.substring(0, 80) + '...');
                    
                    // Random user agent for each product request
                    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
                    
                    // Random delay between 2-5 seconds to be respectful
                    const randomDelay = 2000 + Math.random() * 3000;
                    console.log(`⏳ Waiting ${Math.round(randomDelay)}ms before request...`);
                    await new Promise(resolve => setTimeout(resolve, randomDelay));
                    
                    const productResponse = await axios.get(link, {
                        headers: {
                            'User-Agent': randomUA,
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.9',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache',
                            'DNT': '1',
                            'Connection': 'keep-alive',
                            'Upgrade-Insecure-Requests': '1',
                            'Sec-Fetch-Dest': 'document',
                            'Sec-Fetch-Mode': 'navigate',
                            'Sec-Fetch-Site': 'none',
                            'Sec-Fetch-User': '?1'
                        },
                        timeout: 12000
                    });

                    const productPage = cheerio.load(productResponse.data);
                    
                    // Extract product data
                    const productData = extractProductData(productPage, link);
                    if (productData.name && productData.price > 0) {
                        extractedProducts.push(productData);
                        console.log('✅ Extracted:', productData.name.substring(0, 50) + '...');
                    } else {
                        console.log('⚠️ Product data incomplete:', productData.name || 'No name', '$' + productData.price);
                    }
                    
                } catch (productError) {
                    console.warn('⚠️ Failed to process product:', link, productError.message);
                    // Continue with next product instead of stopping
                    continue;
                }
            }

        } catch (storeError) {
            console.warn('⚠️ Store scraping failed:', storeError.message);
        }

        // If scraping failed, return error instead of fake products
        if (extractedProducts.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No products found in store. Please check the store URL or try again later.',
                scrapingAttempted: true,
                storeUrl: storeUrl
            });
        }

        // Read existing products
        const products = await readProducts();
        let importedCount = 0;

        // Add each extracted product (real import)
        for (const productData of extractedProducts) {
            const newProduct = {
                id: Date.now() + Math.random(), // Unique ID
                name: productData.name,
                price: productData.price,
                description: productData.description,
                category: productData.category,
                platform: productData.platform,
                image: productData.image,
                images: productData.images,
                sourceUrl: productData.sourceUrl,
                buyLink: productData.buyLink,
                dateAdded: new Date().toISOString(),
                isVintage: productData.price > 35, // Auto-vintage logic
                customTags: [],
                importedFrom: storeUrl,
                storeName: storeName
            };

            products.push(newProduct);
            importedCount++;
            
            // Small delay to simulate processing
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Save updated products
        await writeProducts(products);

        console.log('✅ Store import complete:', importedCount, 'products imported');
        
        res.json({
            success: true,
            message: `Successfully imported ${importedCount} products from ${storeName}`,
            importedCount: importedCount,
            storeName: storeName,
            products: extractedProducts
        });

    } catch (error) {
        console.error('❌ Store Auto-Import Error:', error.message);
        res.status(500).json({
            error: 'Failed to auto-import store products',
            details: error.message
        });
    }
});

// Smart eBay Import - Only imports new products and updates existing ones
app.post('/api/ebay/smart-import', async (req, res) => {
    try {
        const { productUrls, storeName, storeUrl, smartSync = true } = req.body;
        
        if (!productUrls || !Array.isArray(productUrls)) {
            return res.status(400).json({ error: 'productUrls array is required' });
        }

        console.log('🧠 Smart importing from', productUrls.length, 'URLs');

        // Read existing products
        const existingProducts = await readProducts();
        const existingUrls = new Set(existingProducts.map(p => p.sourceUrl || p.buyLink));
        
        let newProducts = 0;
        let updatedProducts = 0;
        let skippedProducts = 0;
        
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];

        // Process each URL
        for (let i = 0; i < Math.min(productUrls.length, 20); i++) { // Limit to 20 for API safety
            const productUrl = productUrls[i];
            
            try {
                // Check if product already exists
                const existingProduct = existingProducts.find(p => 
                    (p.sourceUrl === productUrl) || (p.buyLink === productUrl)
                );
                
                if (existingProduct && !smartSync) {
                    console.log('⏭️ Skipping existing product:', existingProduct.name.substring(0, 40) + '...');
                    skippedProducts++;
                    continue;
                }
                
                // Add delay to avoid blocking
                if (i > 0) {
                    const delay = 3000 + Math.random() * 2000; // 3-5 second delay
                    console.log(`⏳ Waiting ${Math.round(delay/1000)}s before next request...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
                console.log(`🔍 Processing product ${i + 1}/${Math.min(productUrls.length, 20)}: ${productUrl}...`);
                
                // Fetch product page
                const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
                const productResponse = await axios.get(productUrl, {
                    headers: {
                        'User-Agent': userAgent,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'DNT': '1',
                        'Connection': 'keep-alive'
                    },
                    timeout: 12000
                });

                const productPage = cheerio.load(productResponse.data);
                const productData = extractProductData(productPage, productUrl);
                
                if (!productData.name || productData.price <= 0) {
                    console.log('⚠️ Incomplete product data, skipping:', productData.name || 'No name');
                    continue;
                }
                
                if (existingProduct) {
                    // Update existing product with fresh data
                    existingProduct.price = productData.price;
                    existingProduct.description = productData.description;
                    existingProduct.image = productData.image || existingProduct.image;
                    existingProduct.images = productData.images || existingProduct.images;
                    existingProduct.dateModified = new Date().toISOString();
                    existingProduct.lastSynced = new Date().toISOString();
                    
                    console.log('🔄 Updated existing product:', existingProduct.name.substring(0, 40) + '...');
                    updatedProducts++;
                } else {
                    // Add new product
                    const newProduct = {
                        id: Date.now() + Math.random(),
                        name: productData.name,
                        price: productData.price,
                        description: productData.description,
                        category: productData.category,
                        platform: productData.platform,
                        image: productData.image,
                        images: productData.images,
                        sourceUrl: productData.sourceUrl,
                        buyLink: productData.buyLink,
                        dateAdded: new Date().toISOString(),
                        lastSynced: new Date().toISOString(),
                        isVintage: productData.price > 35,
                        customTags: [],
                        importedFrom: storeUrl,
                        storeName: storeName
                    };

                    existingProducts.push(newProduct);
                    console.log('✅ Added new product:', newProduct.name.substring(0, 40) + '...');
                    newProducts++;
                }
                
            } catch (productError) {
                console.warn('⚠️ Failed to process product:', productUrl, productError.message);
                continue;
            }
        }

        // Save updated products
        await writeProducts(existingProducts);

        console.log('🧠 Smart import complete:', newProducts, 'new,', updatedProducts, 'updated,', skippedProducts, 'skipped');
        
        res.json({
            success: true,
            message: `Smart sync complete! Added ${newProducts} new products, updated ${updatedProducts} existing ones.`,
            newProducts: newProducts,
            updatedProducts: updatedProducts,
            skippedProducts: skippedProducts,
            totalProcessed: newProducts + updatedProducts + skippedProducts,
            storeName: storeName,
            storeUrl: storeUrl
        });

    } catch (error) {
        console.error('❌ Smart Import Error:', error.message);
        res.status(500).json({
            error: 'Failed to perform smart import',
            details: error.message
        });
    }
});

// Fix all product categories using intelligent categorization
app.post('/api/products/fix-categories', async (req, res) => {
    try {
        console.log('🔧 Fixing product categories...');
        
        const products = await readProducts();
        let fixedCount = 0;
        
        products.forEach(product => {
            const oldCategory = product.category;
            const newCategory = categorizeProduct(product.name, product.description);
            
            if (oldCategory !== newCategory) {
                product.category = newCategory;
                product.dateModified = new Date().toISOString();
                fixedCount++;
                console.log(`📝 ${product.name.substring(0, 30)}... : ${oldCategory} → ${newCategory}`);
            }
        });
        
        await writeProducts(products);
        
        console.log('✅ Category fix complete:', fixedCount, 'products updated');
        res.json({
            success: true,
            message: `Fixed categories for ${fixedCount} products`,
            fixedCount: fixedCount,
            totalProducts: products.length
        });
        
    } catch (error) {
        console.error('❌ Failed to fix categories:', error);
        res.status(500).json({ error: error.message });
    }
});

// Mark product as sold
app.post('/api/products/:id/sold', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const { salePrice, soldDate, buyerInfo } = req.body;
        
        console.log('💰 Marking product as sold:', productId);
        
        const products = await readProducts();
        const productIndex = products.findIndex(p => p.id === productId);
        
        if (productIndex === -1) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        // Update product with sold information
        products[productIndex].isSold = true;
        products[productIndex].soldDate = soldDate || new Date().toISOString();
        products[productIndex].salePrice = salePrice || products[productIndex].price;
        products[productIndex].buyerInfo = buyerInfo || 'Customer';
        products[productIndex].dateModified = new Date().toISOString();
        
        await writeProducts(products);
        
        console.log('✅ Product marked as sold:', products[productIndex].name);
        res.json({
            success: true,
            message: 'Product marked as sold',
            product: products[productIndex]
        });
        
    } catch (error) {
        console.error('❌ Failed to mark product as sold:', error);
        res.status(500).json({ error: error.message });
    }
});

// Remove product from sold (mark as available again)
app.delete('/api/products/:id/sold', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        console.log('🔄 Unmarking product as sold:', productId);
        
        const products = await readProducts();
        const productIndex = products.findIndex(p => p.id === productId);
        
        if (productIndex === -1) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        // Remove sold status
        delete products[productIndex].isSold;
        delete products[productIndex].soldDate;
        delete products[productIndex].salePrice;
        delete products[productIndex].buyerInfo;
        products[productIndex].dateModified = new Date().toISOString();
        
        await writeProducts(products);
        
        console.log('✅ Product unmarked as sold:', products[productIndex].name);
        res.json({
            success: true,
            message: 'Product returned to available inventory',
            product: products[productIndex]
        });
        
    } catch (error) {
        console.error('❌ Failed to unmark product as sold:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const updatedData = req.body;
        
        console.log('📝 Updating product:', productId, updatedData);
        
        const products = await readProducts();
        const productIndex = products.findIndex(p => p.id === productId);
        
        if (productIndex === -1) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        // Update product while preserving original data
        const updatedProduct = {
            ...products[productIndex],
            ...updatedData,
            id: productId, // Ensure ID doesn't change
            dateAdded: products[productIndex].dateAdded, // Preserve original date
            dateModified: new Date().toISOString()
        };
        
        // Apply vintage logic: manual admin marking OR auto-mark if price > $35
        updatedProduct.isVintage = updatedData.isVintage === true || updatedProduct.price > 35;
        
        // Update custom tags if provided
        if (updatedData.customTags !== undefined) {
            updatedProduct.customTags = updatedData.customTags;
        }
        
        products[productIndex] = updatedProduct;
        
        await writeProducts(products);
        
        console.log('✅ Product updated successfully:', products[productIndex].name);
        res.json({ 
            success: true, 
            message: 'Product updated successfully',
            product: products[productIndex]
        });
        
    } catch (error) {
        console.error('❌ Failed to update product:', error);
        res.status(500).json({ error: error.message });
    }
});

// 🚀 Health Check & Keep-Alive Endpoint
app.get('/api/health', (req, res) => {
    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0',
        service: 'Vintage Crib API',
        keepAlive: true,
        message: '🏺 Vintage Crib server is running smoothly!'
    };
    
    res.json(healthData);
});

// 🔄 Wake-up endpoint for external monitoring services
app.get('/api/wake', (req, res) => {
    console.log('🔄 Wake-up call received from:', req.ip);
    res.json({
        status: 'awake',
        message: '🚀 Server is active and ready!',
        timestamp: new Date().toISOString(),
        products: analytics.totalVisits || 0
    });
});

// Analytics API endpoint
app.get('/api/analytics', (req, res) => {
    res.json({
        totalVisits: analytics.totalVisits,
        uniqueVisitors: analytics.uniqueVisitors.size,
        pageViews: analytics.pageViews,
        recentVisits: analytics.lastVisits.slice(0, 10)
    });
});

// Admin health check endpoint
app.get('/api/admin/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        adminService: 'running',
        endpoints: {
            products: 'available',
            ebay: 'available',
            analytics: 'available'
        }
    });
});

// Enhanced Admin stats endpoint with real data
app.get('/api/admin/stats', async (req, res) => {
    try {
        const productData = await readProducts();
        const syncSettings = await readSyncSettings();
        const syncLogData = await readSyncLog();
        const syncLogs = syncLogData.logs || [];
        
        // Real product statistics
        const activeProducts = productData.filter(p => !p.isSold);
        const soldProducts = productData.filter(p => p.isSold);
        const recentProducts = productData.filter(p => {
            const addedDate = new Date(p.dateAdded);
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            return addedDate > weekAgo;
        });
        
        // Real sync statistics
        const successfulSyncs = syncLogs.filter(log => log.status === 'success').length;
        const totalSyncs = syncLogs.length;
        const lastSync = syncLogs.length > 0 ? syncLogs[syncLogs.length - 1] : null;
        
        // Real revenue calculations
        const totalRevenue = soldProducts.reduce((sum, product) => {
            return sum + parseFloat(product.salePrice || product.price || 0);
        }, 0);
        
        const averageSalePrice = soldProducts.length > 0 ? totalRevenue / soldProducts.length : 0;
        const averagePrice = activeProducts.length > 0 ? 
            activeProducts.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0) / activeProducts.length : 0;
        
        // Category breakdown
        const categoryStats = productData.reduce((acc, product) => {
            const category = product.category || 'uncategorized';
            if (!acc[category]) {
                acc[category] = { total: 0, sold: 0, active: 0 };
            }
            acc[category].total++;
            if (product.isSold) {
                acc[category].sold++;
            } else {
                acc[category].active++;
            }
            return acc;
        }, {});
        
        // Real system uptime and health
        const uptimeHours = Math.floor(process.uptime() / 3600);
        const uptimeDays = Math.floor(uptimeHours / 24);
        
        res.json({
            // Core product metrics
            totalProducts: productData.length,
            activeProducts: activeProducts.length,
            soldProducts: soldProducts.length,
            recentlyAdded: recentProducts.length,
            
            // Financial metrics
            totalRevenue: totalRevenue.toFixed(2),
            averagePrice: averagePrice.toFixed(2),
            averageSalePrice: averageSalePrice.toFixed(2),
            
            // Sync system metrics
            syncStats: {
                totalSyncs: totalSyncs,
                successfulSyncs: successfulSyncs,
                failedSyncs: totalSyncs - successfulSyncs,
                successRate: totalSyncs > 0 ? Math.round((successfulSyncs / totalSyncs) * 100) : 100,
                autoSyncEnabled: syncSettings.autoSyncEnabled,
                lastSyncTime: lastSync ? lastSync.startTime : null,
                lastSyncStatus: lastSync ? lastSync.status : 'none'
            },
            
            // Category breakdown
            categoryStats: categoryStats,
            
            // Visitor analytics (real data)
            analytics: {
                totalVisits: analytics.totalVisits,
                uniqueVisitors: analytics.uniqueVisitors.size,
                recentActivity: analytics.lastVisits.slice(0, 10),
                todayVisits: analytics.lastVisits.filter(visit => {
                    const today = new Date().toDateString();
                    return new Date(visit.timestamp).toDateString() === today;
                }).length
            },
            
            // System health
            systemStatus: {
                uptime: process.uptime(),
                uptimeFormatted: `${uptimeDays}d ${uptimeHours % 24}h`,
                memory: process.memoryUsage(),
                environment: process.env.NODE_ENV || 'development',
                nodeVersion: process.version,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ Admin stats error:', error);
        res.status(500).json({ error: 'Failed to load admin stats' });
    }
});

// Admin route protection middleware
function requireAdminAuth(req, res, next) {
    // Check if accessing admin files
    if (req.path.includes('admin') && req.path.includes('.html')) {
        // In a real app, you'd verify JWT tokens or session here
        // For now, we'll rely on client-side protection + this warning
        console.log('⚠️ Admin access attempt:', req.ip, req.get('User-Agent'));
        
        // Add security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    }
    next();
}

// Auto-detect sold items using eBay API - v2 (BEFORE admin auth)
app.post('/api/products/sync-sold-status', async (req, res) => {
    try {
        console.log('🔄 Starting sold items sync...');
        
        if (!eBay) {
            return res.status(503).json({ 
                error: 'eBay API not available - cannot sync sold status',
                demo: true 
            });
        }

        const products = await readProducts();
        let checkedCount = 0;
        let markedSoldCount = 0;
        let errorCount = 0;
        const results = [];

        // Check each product that has an eBay source URL and isn't already marked as sold
        for (const product of products) {
            // Skip products already marked as sold
            if (product.isSold) {
                continue;
            }

            // Extract eBay item ID from product URL
            const ebayItemId = extractEbayItemId(product.sourceUrl || product.buyLink);
            if (!ebayItemId) {
                continue; // Skip non-eBay products
            }

            try {
                checkedCount++;
                console.log(`🔍 Checking item ${checkedCount}: ${product.name} (${ebayItemId})`);
                
                // Try to check if item is still available using multiple methods
                let itemStatus = 'unknown';
                let itemAvailable = true;
                
                try {
                    // Method 1: Try eBay Browse API
                    const itemResponse = await eBay.browse.getItem(ebayItemId);
                    itemStatus = 'active';
                    itemAvailable = true;
                } catch (apiError) {
                    // Method 2: If API fails, try direct page scraping
                    try {
                        const pageResponse = await axios.get(product.sourceUrl || product.buyLink, {
                            timeout: 10000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                            }
                        });
                        
                        const pageContent = pageResponse.data.toLowerCase();
                        
                        // Check for sold indicators
                        if (pageContent.includes('this listing has ended') || 
                            pageContent.includes('no longer available') ||
                            pageContent.includes('item not found') ||
                            pageContent.includes('listing not found') ||
                            pageContent.includes('sold') && pageContent.includes('ended')) {
                            itemStatus = 'sold';
                            itemAvailable = false;
                        } else {
                            itemStatus = 'active';
                            itemAvailable = true;
                        }
                    } catch (scrapeError) {
                        itemStatus = 'error';
                        itemAvailable = true; // Assume available if we can't check
                    }
                }
                
                results.push({
                    productId: product.id,
                    productName: product.name,
                    ebayItemId: ebayItemId,
                    status: itemStatus,
                    available: itemAvailable
                });
                
                // If item is detected as sold, mark it in our database
                if (!itemAvailable && itemStatus === 'sold') {
                    console.log(`💰 Item detected as sold: ${product.name}`);
                    
                    product.isSold = true;
                    product.soldDate = new Date().toISOString().split('T')[0];
                    product.salePrice = product.price; // Use original price as sale price
                    product.buyerInfo = 'eBay Customer';
                    product.dateModified = new Date().toISOString();
                    product.autoDetectedSold = true; // Flag for auto-detection
                    
                    markedSoldCount++;
                    results[results.length - 1].autoMarked = true;
                }
                
                // Small delay to respect API limits
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                // CONSERVATIVE APPROACH: Only mark as sold for very specific confirmations
                // DO NOT auto-mark as sold based on errors - too risky!
                console.warn(`⚠️ Error checking ${product.name}:`, error.message.substring(0, 100));
                
                errorCount++;
                results.push({
                    productId: product.id,
                    productName: product.name,
                    ebayItemId: ebayItemId,
                    status: 'error',
                    error: error.message
                });
            }
        }

        // Save updated products if any were marked as sold
        if (markedSoldCount > 0) {
            await writeProducts(products);
            console.log(`✅ Saved ${markedSoldCount} newly sold products`);
        }

        const summary = {
            success: true,
            message: `Sync complete! Checked ${checkedCount} items, marked ${markedSoldCount} as sold`,
            checkedCount,
            markedSoldCount,
            errorCount,
            results: results
        };

        console.log('📊 Sync Summary:', summary.message);
        res.json(summary);

    } catch (error) {
        console.error('❌ Sold items sync error:', error);
        res.status(500).json({
            error: 'Failed to sync sold status',
            details: error.message
        });
    }
});

// Fix products with insufficient images by re-scraping
app.post('/api/products/fix-images', async (req, res) => {
    try {
        console.log('🖼️ Starting image fix process...');
        
        // Read current products
        const products = await readProducts();
        let fixedCount = 0;
        let processedCount = 0;
        const errors = [];
        
        console.log(`📊 Checking ${products.length} products for insufficient images...`);
        
        for (const product of products) {
            // Skip if product already has 3+ images
            if (product.images && product.images.length >= 3) {
                continue;
            }
            
            processedCount++;
            console.log(`🔍 Processing ${processedCount}: ${product.name.substring(0, 50)}... (${product.images?.length || 0} images)`);
            
            try {
                const sourceUrl = product.sourceUrl || product.buyLink;
                if (!sourceUrl || !sourceUrl.includes('ebay.com')) {
                    continue; // Skip non-eBay products
                }
                
                // Re-scrape images using the same logic as manual extraction
                const axios = require('axios');
                const cheerio = require('cheerio');
                
                const response = await axios.get(sourceUrl, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                
                const $ = cheerio.load(response.data);
                let allImages = [];
                
                // Try meta image first
                let metaImage = $('meta[property="og:image"]').attr('content');
                if (metaImage) {
                    if (!metaImage.startsWith('http')) metaImage = 'https:' + metaImage;
                    allImages.push(metaImage);
                }
                
                // Look for eBay-specific image galleries
                $('.ux-image-carousel-item img, .ux-image-grid img').each((i, elem) => {
                    let imgSrc = $(elem).attr('src') || $(elem).attr('data-src');
                    if (imgSrc && imgSrc.includes('ebayimg.com')) {
                        imgSrc = imgSrc.replace('/s-l64.', '/s-l400.').replace('/s-l140.', '/s-l400.');
                        if (!imgSrc.startsWith('http')) imgSrc = 'https:' + imgSrc;
                        if (!allImages.includes(imgSrc)) {
                            allImages.push(imgSrc);
                        }
                    }
                });
                
                // Scan all img tags as fallback
                $('img').each((i, elem) => {
                    let imgSrc = $(elem).attr('src') || $(elem).attr('data-src');
                    if (imgSrc && 
                        !imgSrc.includes('logo') && 
                        !imgSrc.includes('icon') && 
                        !imgSrc.includes('sprite') &&
                        !imgSrc.includes('ebay_logo') &&
                        (imgSrc.includes('.jpg') || imgSrc.includes('.jpeg') || imgSrc.includes('.png'))) {
                        
                        if (!imgSrc.startsWith('http')) imgSrc = 'https:' + imgSrc;
                        if (!allImages.includes(imgSrc)) {
                            allImages.push(imgSrc);
                        }
                    }
                });
                
                // Update product if we found more images
                if (allImages.length > (product.images?.length || 0)) {
                    product.images = allImages.slice(0, 8); // Limit to 8 images max
                    product.image = allImages[0] || product.image;
                    product.dateModified = new Date().toISOString();
                    fixedCount++;
                    console.log(`✅ Fixed ${product.name.substring(0, 30)}... (${allImages.length} images found)`);
                } else {
                    console.log(`⚠️ No additional images found for ${product.name.substring(0, 30)}...`);
                }
                
                // Add small delay to be respectful
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                errors.push(`${product.name}: ${error.message}`);
                console.error(`❌ Error fixing images for ${product.name}:`, error.message);
            }
        }
        
        // Save updated products
        if (fixedCount > 0) {
            await writeProducts(products);
            console.log('💾 Products saved with updated images');
        }
        
        const summary = {
            success: true,
            message: `✅ Image fix complete: ${fixedCount} products updated out of ${processedCount} processed`,
            processedCount,
            fixedCount,
            totalProducts: products.length,
            errors: errors.slice(0, 10) // Limit errors shown
        };
        
        console.log('🖼️ Image Fix Summary:', summary.message);
        res.json(summary);
        
    } catch (error) {
        console.error('❌ Image fix error:', error);
        res.status(500).json({
            error: 'Failed to fix product images',
            details: error.message
        });
    }
});

// Helper function to extract eBay item ID from URL
function extractEbayItemId(url) {
    if (!url || !url.includes('ebay.com')) {
        return null;
    }
    
    // Extract item ID from various eBay URL formats
    const patterns = [
        /\/itm\/(\d+)/,           // /itm/123456789
        /\/p\/(\d+)/,             // /p/123456789  
        /item=(\d+)/,             // item=123456789
        /\/(\d{10,})/             // Any 10+ digit number
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }
    
    return null;
}

// Apply admin protection
app.use(requireAdminAuth);

// Favicon route to prevent 404/502 errors
app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No content for favicon
});

// Static files - AFTER API routes and protection
app.use(express.static(path.join(__dirname))); // Serve from root directory
app.use(express.static(path.join(__dirname, 'frontend'))); // Serve from frontend directory

// API Error handling middleware
app.use('/api/*', (err, req, res, next) => {
    console.error('❌ API Error:', err.message);
    res.status(500).json({
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Global error handler to prevent server crashes
app.use((err, req, res, next) => {
    console.error('❌ Global Error:', err.message);
    
    // Ensure we always send a response
    if (!res.headersSent) {
        if (req.path.startsWith('/api/')) {
            res.status(500).json({
                error: 'Server error',
                message: 'Please try again later'
            });
        } else {
            res.status(500).send('<!DOCTYPE html><html><head><title>Server Error</title></head><body><h1>Server Error</h1><p>Please try again later.</p></body></html>');
        }
    }
});

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
    console.warn('❌ API endpoint not found:', req.method, req.path);
    res.status(404).json({
        error: 'API endpoint not found',
        path: req.path,
        method: req.method
    });
});

// Catch-all - MUST BE LAST
app.get('*', (req, res) => {
    console.log('📄 Serving index.html for:', req.path);
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling for stability
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    // Don't exit, try to recover
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit, try to recover
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

// Ensure data directory exists on startup
async function ensureDataDirectory() {
    try {
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
        console.log('📁 Data directory ready');
    } catch (error) {
        console.warn('⚠️ Data directory warning:', error.message);
    }
}

// Daily eBay Sync Scheduler
function startDailySyncScheduler() {
    const STORE_URL = 'https://www.ebay.com/usr/cjj-3227';
    const SYNC_HOUR = 6; // 6 AM daily sync
    
    console.log('📅 Daily eBay sync scheduler started (6 AM daily)');
    
    // Calculate time until next sync
    function getTimeUntilNextSync() {
        const now = new Date();
        const next = new Date();
        next.setHours(SYNC_HOUR, 0, 0, 0);
        
        // If it's past sync time today, schedule for tomorrow
        if (now >= next) {
            next.setDate(next.getDate() + 1);
        }
        
        return next - now;
    }
    
    // Perform smart sync
    async function performDailySync() {
        try {
            console.log('🌅 Starting daily eBay sync...');
            
            // Use the existing smart import logic
            const axios = require('axios');
            
            // Get store URLs
            const urlsResponse = await axios.post(`http://localhost:${PORT}/api/ebay/get-store-urls`, {
                storeUrl: STORE_URL
            });
            
            if (urlsResponse.data.success) {
                // Perform smart import
                const importResponse = await axios.post(`http://localhost:${PORT}/api/ebay/smart-import`, {
                    productUrls: urlsResponse.data.productUrls,
                    storeName: urlsResponse.data.storeName,
                    storeUrl: STORE_URL,
                    smartSync: true
                });
                
                if (importResponse.data.success) {
                    console.log(`✅ Daily sync complete: ${importResponse.data.newProducts} new, ${importResponse.data.updatedProducts} updated`);
                } else {
                    console.error('❌ Daily sync import failed:', importResponse.data.error);
                }
            } else {
                console.log('⚠️ Daily sync: Store URL extraction failed, manual sync may be needed');
            }
            
        } catch (error) {
            console.error('❌ Daily sync error:', error.message);
        }
        
        // Schedule next sync
        setTimeout(performDailySync, 24 * 60 * 60 * 1000); // 24 hours
    }
    
    // Schedule first sync
    const timeUntilNext = getTimeUntilNextSync();
    console.log(`⏰ Next sync scheduled in ${Math.round(timeUntilNext / (1000 * 60 * 60))} hours`);
    
    setTimeout(performDailySync, timeUntilNext);
}

// Start server
const server = app.listen(PORT, '0.0.0.0', async () => {
    try {
        await ensureDataDirectory();
        console.log('🚀 Server running on http://0.0.0.0:' + PORT);
        console.log('📂 Frontend folder: ./frontend/');
        console.log('🧪 Test API: http://localhost:' + PORT + '/api/test');
        console.log('📦 Products API: http://localhost:' + PORT + '/api/products');
        console.log('🗑️ Delete API: DELETE http://localhost:' + PORT + '/api/products/:id');
        console.log('🌐 Environment: ' + (process.env.NODE_ENV || 'development'));
        
        // Start daily eBay sync scheduler
        startDailySyncScheduler();
        
        // Initialize comprehensive auto-sync system
        await initializeAutoSync();
    } catch (error) {
        console.error('❌ Server startup error:', error.message);
    }
});

// Handle server errors
server.on('error', (error) => {
    console.error('❌ Server error:', error.message);
    if (error.code === 'EADDRINUSE') {
        console.error('💥 Port ' + PORT + ' is already in use');
        process.exit(1);
    }
});

// Handle server timeout
server.timeout = 300000; // 5 minutes timeout for admin operations
server.keepAliveTimeout = 65000; // Keep alive timeout
server.headersTimeout = 66000; // Headers timeout

// Keep alive for Render + Memory cleanup
setInterval(() => {
    try {
        // Light memory cleanup
        if (global.gc) {
            global.gc();
        }
        
        // Prevent analytics memory leaks
        if (analytics.uniqueVisitors.size > 1000) {
            analytics.uniqueVisitors.clear();
            console.log('🧹 Cleared analytics cache to prevent memory leak');
        }
        
        // Keep recent visits smaller
        if (analytics.lastVisits.length > 100) {
            analytics.lastVisits = analytics.lastVisits.slice(0, 50);
        }
        
        // Clear product cache if it gets too old
        if (Date.now() > cacheExpiry + (5 * 60 * 1000)) { // 5 minutes past expiry
            productCache = null;
            cacheExpiry = 0;
        }
    } catch (error) {
        console.warn('⚠️ Memory cleanup error:', error.message);
    }
}, 120000); // Every 2 minutes

// 🚀 Keep-Alive System for Render Free Tier
const keepAliveConfig = {
    enabled: process.env.NODE_ENV === 'production',
    intervalMinutes: 10, // Ping every 10 minutes
    maxRetries: 3,
    services: [
        'https://vintage-crib.onrender.com/api/health',
        'https://vintage-crib.onrender.com/api/test'
    ]
};

// Self-ping to prevent sleep
if (keepAliveConfig.enabled) {
    setInterval(async () => {
        try {
            const response = await axios.get('https://vintage-crib.onrender.com/api/health', {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Vintage-Crib-KeepAlive/1.0'
                }
            });
            if (response.status === 200) {
                console.log('🔄 Keep-alive ping successful');
            } else {
                console.warn('⚠️ Keep-alive ping failed:', response.status);
            }
        } catch (error) {
            console.warn('⚠️ Keep-alive ping error:', error.message);
        }
    }, keepAliveConfig.intervalMinutes * 60 * 1000);
    
    console.log(`🔄 Keep-alive system enabled - pinging every ${keepAliveConfig.intervalMinutes} minutes`);
}