const request = require('supertest');
const express = require('express');
const { authenticateAdmin, verifyToken } = require('../auth');

// Create test app
const app = express();
app.use(express.json());
app.post('/api/admin/login', authenticateAdmin);
app.get('/api/admin/verify', verifyToken, (req, res) => {
    res.json({ success: true, user: req.user });
});

describe('Authentication', () => {
    describe('POST /api/admin/login', () => {
        beforeEach(() => {
            process.env.ADMIN_USERNAME = 'testadmin';
            process.env.ADMIN_PASSWORD = 'testpass123';
            process.env.JWT_SECRET = 'test-secret-key';
        });

        it('should login with valid credentials', async () => {
            const response = await request(app)
                .post('/api/admin/login')
                .send({
                    username: 'testadmin',
                    password: 'testpass123'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.token).toBeDefined();
            expect(response.body.user.username).toBe('testadmin');
        });

        it('should reject invalid credentials', async () => {
            const response = await request(app)
                .post('/api/admin/login')
                .send({
                    username: 'wronguser',
                    password: 'wrongpass'
                });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toBe('Invalid credentials');
        });

        it('should reject missing credentials', async () => {
            const response = await request(app)
                .post('/api/admin/login')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });

    describe('JWT Token Verification', () => {
        let validToken;

        beforeEach(async () => {
            process.env.ADMIN_USERNAME = 'testadmin';
            process.env.ADMIN_PASSWORD = 'testpass123';
            process.env.JWT_SECRET = 'test-secret-key';

            const loginResponse = await request(app)
                .post('/api/admin/login')
                .send({
                    username: 'testadmin',
                    password: 'testpass123'
                });

            validToken = loginResponse.body.token;
        });

        it('should verify valid token', async () => {
            const response = await request(app)
                .get('/api/admin/verify')
                .set('Authorization', `Bearer ${validToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.user.username).toBe('testadmin');
        });

        it('should reject invalid token', async () => {
            const response = await request(app)
                .get('/api/admin/verify')
                .set('Authorization', 'Bearer invalid-token');

            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
        });

        it('should reject missing token', async () => {
            const response = await request(app)
                .get('/api/admin/verify');

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
        });
    });
});