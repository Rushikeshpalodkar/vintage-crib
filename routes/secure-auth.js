const express = require('express');
const router = express.Router();
const securityManager = require('../auth/security');

// Secure Admin Login
router.post('/auth/login', securityManager.validateInput(securityManager.getValidationSchemas().login), async (req, res) => {
    try {
        const { username, password } = req.validatedData;
        
        // Log login attempt
        securityManager.logSecurityEvent('LOGIN_ATTEMPT', req, { username });
        
        // Sanitize input
        const sanitizedUsername = securityManager.sanitizeInput(username);
        
        // Verify credentials
        const envUsername = process.env.ADMIN_USERNAME || 'admin';
        const envPasswordHash = process.env.ADMIN_PASSWORD_HASH;
        
        if (!envPasswordHash) {
            console.error('🚨 ADMIN_PASSWORD_HASH not configured in .env file');
            return res.status(500).json({
                error: 'Server configuration error',
                message: 'Authentication system not properly configured'
            });
        }
        
        // Check username
        if (sanitizedUsername !== envUsername) {
            securityManager.logSecurityEvent('LOGIN_FAILED', req, { 
                reason: 'invalid_username',
                username: sanitizedUsername 
            });
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'Username or password is incorrect'
            });
        }
        
        // Verify password hash
        const isPasswordValid = await securityManager.verifyPassword(password, envPasswordHash);
        if (!isPasswordValid) {
            securityManager.logSecurityEvent('LOGIN_FAILED', req, { 
                reason: 'invalid_password',
                username: sanitizedUsername 
            });
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'Username or password is incorrect'
            });
        }
        
        // Create secure session
        req.session.isAuthenticated = true;
        req.session.username = sanitizedUsername;
        req.session.loginTime = Date.now();
        req.session.lastAccess = Date.now();
        req.session.sessionId = securityManager.generateSessionId();
        
        // Log successful login
        securityManager.logSecurityEvent('LOGIN_SUCCESS', req, { 
            username: sanitizedUsername,
            sessionId: req.session.sessionId.substring(0, 8) + '...' // Log partial session ID
        });
        
        res.json({
            success: true,
            message: 'Login successful',
            user: {
                username: sanitizedUsername,
                loginTime: req.session.loginTime
            }
        });
        
    } catch (error) {
        console.error('🚨 Login error:', error);
        securityManager.logSecurityEvent('LOGIN_ERROR', req, { error: error.message });
        
        res.status(500).json({
            error: 'Authentication failed',
            message: 'An error occurred during login'
        });
    }
});

// Secure Logout
router.post('/auth/logout', (req, res) => {
    if (req.session) {
        const username = req.session.username || 'unknown';
        const sessionId = req.session.sessionId;
        
        // Log logout
        securityManager.logSecurityEvent('LOGOUT', req, { 
            username,
            sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'unknown'
        });
        
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err);
                return res.status(500).json({
                    error: 'Logout failed',
                    message: 'Could not complete logout'
                });
            }
            
            res.json({
                success: true,
                message: 'Logout successful'
            });
        });
    } else {
        res.json({
            success: true,
            message: 'Already logged out'
        });
    }
});

// Check Authentication Status
router.get('/auth/status', (req, res) => {
    if (req.session && req.session.isAuthenticated) {
        // Check session timeout
        const sessionAge = Date.now() - (req.session.lastAccess || req.session.loginTime);
        const maxAge = parseInt(process.env.SESSION_TIMEOUT_HOURS) * 60 * 60 * 1000 || 24 * 60 * 60 * 1000;
        
        if (sessionAge > maxAge) {
            req.session.destroy();
            return res.json({
                authenticated: false,
                reason: 'session_expired'
            });
        }
        
        // Update last access
        req.session.lastAccess = Date.now();
        
        res.json({
            authenticated: true,
            user: {
                username: req.session.username,
                loginTime: req.session.loginTime,
                lastAccess: req.session.lastAccess
            }
        });
    } else {
        res.json({
            authenticated: false,
            reason: 'not_logged_in'
        });
    }
});

// Generate new admin password hash (development only)
router.post('/auth/generate-password-hash', (req, res) => {
    // Only allow in development environment
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'This endpoint is only available in development'
        });
    }
    
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({
            error: 'Password required',
            message: 'Please provide a password to hash'
        });
    }
    
    securityManager.hashPassword(password)
        .then(hash => {
            res.json({
                success: true,
                hash: hash,
                instructions: [
                    'Add this hash to your .env file as ADMIN_PASSWORD_HASH',
                    'Remove any plain password from .env',
                    'Restart the server'
                ]
            });
        })
        .catch(error => {
            res.status(500).json({
                error: 'Hash generation failed',
                message: error.message
            });
        });
});

module.exports = router;