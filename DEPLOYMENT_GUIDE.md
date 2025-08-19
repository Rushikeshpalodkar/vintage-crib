# 🚀 Production Deployment Guide

## Prerequisites

### 1. Environment Setup
- Node.js 18+ installed
- MongoDB Atlas account (or local MongoDB)
- Redis Cloud account (or local Redis)
- Domain name with DNS access
- SSL certificate

### 2. Required Environment Variables

Create a `.env.production` file:

```env
# Server Configuration
NODE_ENV=production
PORT=3001

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/vintage-crib
REDIS_URL=redis://username:password@host:port

# Security (CHANGE THESE!)
ADMIN_USERNAME=your_secure_admin_username
ADMIN_PASSWORD=your_very_secure_password_123!
JWT_SECRET=your_super_secret_jwt_key_minimum_32_characters_long

# eBay API (Production)
EBAY_APP_ID=your_production_app_id
EBAY_CERT_ID=your_production_cert_id
EBAY_DEV_ID=your_production_dev_id
EBAY_USER_TOKEN=your_production_user_token
EBAY_ENVIRONMENT=production

# Logging
LOG_LEVEL=info
```

## Deployment Options

### Option 1: Docker Deployment (Recommended)

1. **Build and run with Docker Compose:**
```bash
docker-compose up -d
```

2. **Or build manually:**
```bash
docker build -t vintage-crib .
docker run -d -p 3001:3001 --env-file .env.production vintage-crib
```

### Option 2: Platform as a Service

#### Render.com
1. Connect your GitHub repository
2. Set environment variables in Render dashboard
3. Deploy automatically on push

#### Railway.app
1. Connect repository
2. Configure environment variables
3. Deploy with custom domain

#### Vercel (Frontend only)
1. Deploy frontend folder
2. Configure serverless functions for API

### Option 3: VPS/Dedicated Server

1. **Install dependencies:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install MongoDB (if not using Atlas)
sudo apt-get install -y mongodb

# Install Redis (if not using cloud)
sudo apt-get install -y redis-server
```

2. **Clone and setup application:**
```bash
git clone https://github.com/yourusername/vintage-crib.git
cd vintage-crib
npm ci --production
```

3. **Configure PM2:**
```bash
# Create ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'vintage-crib',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
EOF

# Start application
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

4. **Setup Nginx reverse proxy:**
```bash
sudo apt-get install -y nginx

# Create site configuration
sudo cat > /etc/nginx/sites-available/vintage-crib << 'EOF'
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/vintage-crib /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

5. **Setup SSL with Let's Encrypt:**
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## Database Setup

### MongoDB Atlas
1. Create cluster at mongodb.com
2. Create database user
3. Whitelist IP addresses
4. Get connection string

### Local MongoDB
```bash
# Start MongoDB
sudo systemctl start mongodb
sudo systemctl enable mongodb

# Create database and user
mongo
use vintage-crib
db.createUser({
  user: "vintage_user",
  pwd: "secure_password",
  roles: ["readWrite"]
})
```

## Performance Optimization

### 1. Enable Compression
Already configured in your app with `compression` middleware.

### 2. Setup CDN
- Cloudflare (free tier available)
- AWS CloudFront
- Google Cloud CDN

### 3. Optimize Images
Your app includes Sharp for automatic image optimization.

### 4. Database Indexing
```javascript
// Add these indexes to your MongoDB
db.products.createIndex({ "name": "text", "description": "text" })
db.products.createIndex({ "sold": 1, "featured": -1, "createdAt": -1 })
db.products.createIndex({ "category": 1, "sold": 1 })
db.products.createIndex({ "ebayItemId": 1 })
```

## Monitoring & Maintenance

### 1. Health Checks
- `/api/health` - Application health
- `/api/metrics` - Performance metrics

### 2. Logging
Logs are stored in `./logs/` directory:
- `combined.log` - All logs
- `error.log` - Error logs only
- `access.log` - HTTP requests

### 3. Backup Strategy
```bash
# Database backup
mongodump --uri="your_mongodb_uri" --out=./backups/$(date +%Y%m%d)

# File backup
tar -czf backups/files_$(date +%Y%m%d).tar.gz uploads/
```

### 4. Security Updates
```bash
# Update dependencies regularly
npm audit
npm update

# System updates
sudo apt update && sudo apt upgrade -y
```

## Scaling Considerations

### 1. Horizontal Scaling
- Use PM2 cluster mode (already configured)
- Load balancer (Nginx, HAProxy)
- Multiple server instances

### 2. Database Scaling
- MongoDB sharding
- Read replicas
- Connection pooling

### 3. Caching
- Redis cluster
- CDN for static assets
- Application-level caching

## Troubleshooting

### Common Issues

1. **Port already in use:**
```bash
sudo lsof -i :3001
sudo kill -9 <PID>
```

2. **MongoDB connection issues:**
- Check firewall rules
- Verify connection string
- Check authentication

3. **High memory usage:**
```bash
pm2 monit
# Check logs for memory leaks
```

4. **SSL certificate issues:**
```bash
sudo certbot renew --dry-run
sudo nginx -t
```

### Logs and Debugging
```bash
# Application logs
pm2 logs vintage-crib

# System logs
sudo journalctl -u nginx
sudo journalctl -u mongodb

# Real-time monitoring
pm2 monit
htop
```

## Maintenance Checklist

### Daily
- [ ] Check application health
- [ ] Monitor error rates
- [ ] Review security alerts

### Weekly
- [ ] Check disk usage
- [ ] Review performance metrics
- [ ] Update dependencies

### Monthly
- [ ] Database maintenance
- [ ] Backup verification
- [ ] Security audit
- [ ] SSL certificate check

---

## Support

For deployment issues:
1. Check logs first
2. Verify environment variables
3. Test database connections
4. Review this guide

Your application is now production-ready with:
- ✅ Security (JWT, Helmet, Rate limiting)
- ✅ Database (MongoDB with proper schema)
- ✅ Caching (Redis/Memory)
- ✅ Monitoring (Winston logging, metrics)
- ✅ Testing (Jest test suite)
- ✅ Performance (Compression, image optimization)
- ✅ DevOps (Docker, CI/CD pipeline)