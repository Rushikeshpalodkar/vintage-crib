const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { RateLimiterMemory } = require('rate-limiter-flexible');

// Rate limiter for login attempts
const loginLimiter = new RateLimiterMemory({
    keyGenerator: (req) => req.ip,
    points: 5, // Number of attempts
    duration: 900, // Per 15 minutes
});

// Hash password utility
const hashPassword = async (password) => {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
};

// Verify password utility
const verifyPassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

// Generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.id, 
            username: user.username,
            role: user.role || 'admin'
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
};

// Verify JWT token middleware
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1] || 
                  req.headers['x-access-token'] || 
                  req.query.token;

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Access denied. No token provided.' 
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ 
            success: false, 
            message: 'Invalid token.' 
        });
    }
};

// Admin authentication endpoint
const authenticateAdmin = async (req, res) => {
    try {
        // Rate limiting
        await loginLimiter.consume(req.ip);

        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        // Check against environment variables
        const validUsername = process.env.ADMIN_USERNAME || 'admin';
        const validPassword = process.env.ADMIN_PASSWORD || 'mystore123';

        if (username === validUsername && password === validPassword) {
            const user = {
                id: 1,
                username: validUsername,
                role: 'admin'
            };

            const token = generateToken(user);

            res.json({
                success: true,
                token: token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role
                },
                message: 'Login successful'
            });
        } else {
            res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
    } catch (rejRes) {
        // Rate limit exceeded
        const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
        res.set('Retry-After', String(secs));
        res.status(429).json({
            success: false,
            message: `Too many login attempts. Try again in ${secs} seconds.`
        });
    }
};

module.exports = {
    hashPassword,
    verifyPassword,
    generateToken,
    verifyToken,
    authenticateAdmin,
    loginLimiter
};