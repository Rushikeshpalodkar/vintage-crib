const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');

// MongoDB connection configuration
const connectDB = async () => {
    try {
        // Use MongoDB Atlas connection string from environment, or local MongoDB
        const mongoURI = process.env.MONGODB_URI || 
                         process.env.MONGO_URL || 
                         'mongodb://127.0.0.1:27017/vintage-crib';

        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            bufferCommands: false,
            bufferMaxEntries: 0
        };

        // Connect to MongoDB
        await mongoose.connect(mongoURI, options);
        console.log('✅ MongoDB connected successfully');
        console.log('🗄️  Database:', mongoose.connection.name);
        
        return mongoose.connection;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        console.log('💡 Tip: Make sure MongoDB is running or check your connection string');
        
        // Don't exit process, continue with JSON file fallback
        return null;
    }
};

// Migration function to move from JSON to MongoDB
const migrateFromJSON = async () => {
    try {
        const Product = require('./models/Product');
        
        // Check if products already exist in database
        const existingCount = await Product.countDocuments();
        if (existingCount > 0) {
            console.log(`📊 Database already contains ${existingCount} products, skipping migration`);
            return;
        }

        // Read existing JSON data
        const dataPath = path.join(__dirname, 'data', 'products.json');
        const jsonData = await fs.readFile(dataPath, 'utf8');
        const products = JSON.parse(jsonData);

        if (!products || products.length === 0) {
            console.log('📝 No products found in JSON file to migrate');
            return;
        }

        // Transform JSON data to match MongoDB schema
        const transformedProducts = products.map(product => {
            const transformed = {
                name: product.name || 'Untitled Product',
                price: parseFloat(product.price) || 0,
                image: product.image || '',
                description: product.description || '',
                category: product.category || 'Uncategorized',
                condition: product.condition || 'Used',
                ebayItemId: product.ebayItemId || null,
                ebayUrl: product.ebayUrl || product.url || null,
                sold: product.sold || false,
                featured: product.featured || false,
                views: product.views || 0,
                clicks: product.clicks || 0,
                lastSynced: product.lastSynced ? new Date(product.lastSynced) : new Date(),
                tags: product.tags || []
            };

            // Add vintage data if available
            if (product.vintage) {
                transformed.vintage = {
                    era: product.vintage.era,
                    year: product.vintage.year,
                    authenticity: product.vintage.authenticity || 'Unknown'
                };
            }

            return transformed;
        });

        // Insert into MongoDB
        const inserted = await Product.insertMany(transformedProducts, { ordered: false });
        console.log(`✅ Successfully migrated ${inserted.length} products from JSON to MongoDB`);

        // Create backup of original JSON file
        const backupPath = path.join(__dirname, 'data', `products-backup-${Date.now()}.json`);
        await fs.copyFile(dataPath, backupPath);
        console.log(`💾 Created backup of original JSON file: ${path.basename(backupPath)}`);

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('📝 No existing JSON file found, starting with empty database');
        } else {
            console.error('❌ Migration failed:', error.message);
        }
    }
};

// Database health check
const checkDatabaseHealth = async () => {
    try {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.db.admin().ping();
            return { status: 'healthy', connection: 'mongodb' };
        } else {
            return { status: 'disconnected', connection: 'json-fallback' };
        }
    } catch (error) {
        return { status: 'error', connection: 'json-fallback', error: error.message };
    }
};

// Graceful shutdown
const closeDB = async () => {
    try {
        await mongoose.connection.close();
        console.log('🔒 MongoDB connection closed gracefully');
    } catch (error) {
        console.error('❌ Error closing MongoDB connection:', error.message);
    }
};

module.exports = {
    connectDB,
    migrateFromJSON,
    checkDatabaseHealth,
    closeDB
};