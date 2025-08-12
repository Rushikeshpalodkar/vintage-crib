# 🔒 Security Configuration for Vintage Crib

## 🛡️ Production Security Checklist

### SSL/TLS Certificate Setup

#### Automatic SSL (Recommended Platforms)
- **Vercel**: SSL certificates are automatically provisioned
- **Netlify**: Auto-SSL with Let's Encrypt
- **Railway**: Built-in SSL termination

#### Manual SSL Setup (DigitalOcean/Custom Server)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d vintagecrib.com -d www.vintagecrib.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Security Headers
Add these to your reverse proxy (Nginx) or hosting platform:

```nginx
# Security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src 'self' fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self';" always;

# Hide server information
server_tokens off;

# Enable HSTS
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
```

### Environment Security

#### Production Environment Variables
```env
# Never commit these to Git!
EBAY_APP_ID=your_production_app_id
EBAY_CERT_ID=your_production_cert_id
EBAY_DEV_ID=your_production_dev_id
EBAY_ENVIRONMENT=production
NODE_ENV=production

# Optional: Add rate limiting
RATE_LIMIT_WINDOW=900000  # 15 minutes
RATE_LIMIT_MAX=100        # 100 requests per window
```

#### File Permissions (Linux/Mac)
```bash
# Secure file permissions
chmod 600 .env
chmod 644 data/products.json
chmod 755 frontend/
```

### Rate Limiting
Add to your server.js:

```javascript
const rateLimit = require('express-rate-limit');

// Create rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all requests
app.use('/api/', limiter);

// Stricter limits for sensitive endpoints
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many requests to this endpoint',
});

app.use('/api/extract-product', strictLimiter);
```

### Input Validation
Add to your API routes:

```javascript
const validator = require('validator');

// Sanitize inputs
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return validator.escape(input.trim());
}

// Validate URLs
function isValidUrl(url) {
  return validator.isURL(url, {
    protocols: ['http', 'https'],
    require_protocol: true
  });
}
```

### CORS Configuration
Update your CORS settings:

```javascript
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://vintagecrib.com', 'https://www.vintagecrib.com']
    : ['http://localhost:3001'],
  credentials: true,
  optionsSuccessStatus: 200
}));
```

### Monitoring & Logging

#### Error Monitoring with Sentry
```bash
npm install @sentry/node @sentry/tracing
```

```javascript
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

// Add error handling middleware
app.use(Sentry.Handlers.errorHandler());
```

#### Request Logging
```javascript
const morgan = require('morgan');

// Production logging
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}
```

### Database Security

#### Backup Strategy
```bash
# Daily backups
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp data/products.json "backups/products_backup_$DATE.json"

# Keep only last 30 days
find backups/ -name "products_backup_*.json" -mtime +30 -delete
```

#### Data Validation
```javascript
function validateProduct(product) {
  const errors = [];
  
  if (!product.name || product.name.length < 1 || product.name.length > 200) {
    errors.push('Product name must be 1-200 characters');
  }
  
  if (!product.price || isNaN(product.price) || product.price < 0) {
    errors.push('Price must be a valid positive number');
  }
  
  if (product.sourceUrl && !isValidUrl(product.sourceUrl)) {
    errors.push('Source URL must be valid');
  }
  
  return errors;
}
```

### Firewall Configuration (DigitalOcean)
```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow ssh

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Deny all other incoming
sudo ufw default deny incoming
sudo ufw default allow outgoing
```

### Regular Security Updates
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Node.js dependencies
npm audit
npm audit fix

# Check for outdated packages
npm outdated
```

### Security Scanning

#### npm audit
```bash
# Check for vulnerabilities
npm audit

# Fix automatically
npm audit fix

# Force fix (use carefully)
npm audit fix --force
```

#### Snyk Security Testing
```bash
# Install Snyk CLI
npm install -g snyk

# Test for vulnerabilities
snyk test

# Monitor continuously
snyk monitor
```

### Backup & Recovery

#### Automated Backups
```bash
#!/bin/bash
# backup.sh
rsync -avz --delete /var/www/vintage-crib/ /backup/vintage-crib/
tar -czf "/backup/vintage-crib-$(date +%Y%m%d).tar.gz" /backup/vintage-crib/
find /backup/ -name "vintage-crib-*.tar.gz" -mtime +7 -delete
```

#### Recovery Plan
1. **Data Recovery**: Restore from latest backup
2. **Service Recovery**: Redeploy from Git repository
3. **DNS Recovery**: Update DNS if IP changes
4. **SSL Recovery**: Re-issue certificates if needed

### Security Contacts

#### Incident Response
- **Primary**: security@vintagecrib.com  
- **Backup**: admin@vintagecrib.com
- **Platform Support**: Contact your hosting provider

#### Security Updates
Subscribe to security advisories:
- Node.js Security Releases
- eBay API Security Notices
- Your hosting platform's security updates

---

## 🚨 Security Incident Response

### If You Detect a Security Issue:
1. **Isolate** - Take affected systems offline if needed
2. **Assess** - Determine scope and impact
3. **Contain** - Stop the attack/breach
4. **Investigate** - Log analysis and root cause
5. **Recover** - Restore from clean backups
6. **Learn** - Update security measures

### Regular Security Checklist:
- [ ] SSL certificate valid and renewed
- [ ] Dependencies updated monthly
- [ ] Backup system tested quarterly
- [ ] Access logs reviewed weekly
- [ ] Security headers configured
- [ ] Rate limiting active
- [ ] Error monitoring operational
- [ ] Firewall rules current

---

**🔐 Keep your Vintage Crib secure and your customers' data protected!**