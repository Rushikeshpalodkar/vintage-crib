const request = require('supertest');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Mock the server setup (simplified version)
const app = express();
app.use(cors());
app.use(express.json());

// Create a simple products mock for testing
const mockProducts = [
    { id: 1, name: 'Test Product', price: 10.99, category: 'vintage' },
    { id: 2, name: 'Another Product', price: 25.50, category: 'collectible' }
];

// Mock routes for testing
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'Backend connected successfully!',
        timestamp: new Date(),
        status: 'working'
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: '1.0.0',
        service: 'Vintage Crib API',
        message: '🏺 Vintage Crib server is running smoothly!'
    });
});

app.get('/api/products', (req, res) => {
    // Mock products response
    res.json([
        {
            id: 1,
            name: 'Test Vintage Item',
            price: 99.99,
            image: 'test-image.jpg',
            description: 'Test description',
            category: 'Test Category'
        }
    ]);
});

describe('API Endpoints', () => {
    describe('GET /api/test', () => {
        it('should return successful test response', async () => {
            const response = await request(app).get('/api/test');
            
            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Backend connected successfully!');
            expect(response.body.status).toBe('working');
            expect(response.body.timestamp).toBeDefined();
        });
    });

    describe('GET /api/health', () => {
        it('should return health status', async () => {
            const response = await request(app).get('/api/health');
            
            expect(response.status).toBe(200);
            expect(response.body.status).toBe('healthy');
            expect(response.body.service).toBe('Vintage Crib API');
            expect(response.body.uptime).toBeDefined();
            expect(response.body.memory).toBeDefined();
        });
    });

    describe('GET /api/products', () => {
        it('should return products array', async () => {
            const response = await request(app).get('/api/products');
            
            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty('name');
            expect(response.body[0]).toHaveProperty('price');
        });
    });

    describe('Error Handling', () => {
        it('should handle 404 for non-existent routes', async () => {
            const response = await request(app).get('/api/nonexistent');
            
            expect(response.status).toBe(404);
        });
    });
});