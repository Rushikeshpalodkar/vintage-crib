// Test setup file
const mongoose = require('mongoose');

// Mock console.log to reduce noise during testing
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

// Setup test database
beforeAll(async () => {
    // Use in-memory MongoDB for testing
    const { MongoMemoryServer } = require('mongodb-memory-server');
    
    try {
        const mongod = new MongoMemoryServer();
        await mongod.start();
        const uri = mongod.getUri();
        await mongoose.connect(uri);
        global.__MONGOD__ = mongod;
    } catch (error) {
        // Fallback to mock if MongoDB Memory Server fails
        console.warn('Using mocked database for tests');
    }
});

// Clean up after tests
afterAll(async () => {
    if (global.__MONGOD__) {
        await mongoose.connection.close();
        await global.__MONGOD__.stop();
    }
});

// Clear database before each test
beforeEach(async () => {
    if (mongoose.connection.readyState === 1) {
        const collections = mongoose.connection.collections;
        for (const key in collections) {
            await collections[key].deleteMany({});
        }
    }
});