# 🗄️ PostgreSQL Setup Guide for Vintage Crib

Your PostgreSQL 17 is installed but needs configuration. Here's how to get it working:

## ✅ Current Status
- ✅ PostgreSQL 17.6 is installed at `C:\Program Files\PostgreSQL\17\`
- ✅ Service `postgresql-x64-17` exists
- ⚠️ Service is not accepting connections properly

## 🚀 Quick Fix Steps

### Step 1: Start PostgreSQL Service (Run as Administrator)

Open **Command Prompt as Administrator** and run:

```cmd
net start postgresql-x64-17
```

### Step 2: Alternative - Start via Services

1. Press `Win + R`, type `services.msc`
2. Find `postgresql-x64-17` 
3. Right-click → Start
4. Set to "Automatic" startup

### Step 3: Test Connection

Open Command Prompt and run:

```cmd
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d postgres
```

If it asks for a password, try:
- Default password set during installation
- Leave blank (press Enter)
- Common defaults: `postgres`, `admin`, `password`

### Step 4: Create Database

Once connected to psql, run:

```sql
CREATE DATABASE vintage_crib;
\q
```

### Step 5: Update Your .env File

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=vintage_crib
DB_USER=postgres
DB_PASSWORD=your_password_here
```

## 🛠️ If PostgreSQL Won't Start

### Option A: Restart PostgreSQL Service

1. Open Services (`services.msc`)
2. Find `postgresql-x64-17`
3. Right-click → Restart
4. Check log files at `C:\Program Files\PostgreSQL\17\data\log\`

### Option B: Check Configuration

Edit `C:\Program Files\PostgreSQL\17\data\postgresql.conf`:

```conf
listen_addresses = '*'          # or 'localhost'
port = 5432
```

Edit `C:\Program Files\PostgreSQL\17\data\pg_hba.conf`:

```conf
# Add this line for local connections
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
```

Then restart the service.

### Option C: Manual Database Initialization

If the data directory is corrupted:

```cmd
cd "C:\Program Files\PostgreSQL\17\bin"
initdb -D "C:\Program Files\PostgreSQL\17\data" -U postgres
pg_ctl start -D "C:\Program Files\PostgreSQL\17\data"
```

## 🎯 Test Everything is Working

### 1. Test PostgreSQL Connection

```bash
node -e "
const { Client } = require('pg');
const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: '' // Use your password
});

client.connect()
  .then(() => {
    console.log('✅ PostgreSQL connected!');
    return client.query('SELECT version()');
  })
  .then(res => {
    console.log('📋 Version:', res.rows[0].version);
    client.end();
  })
  .catch(err => {
    console.error('❌ Connection failed:', err.message);
  });
"
```

### 2. Start Your Server

```bash
node server.js
```

You should see:
```
✅ PostgreSQL database connected successfully
🗄️ Database integration active
✅ Database schema initialized successfully
```

### 3. Test Database API

```bash
curl http://localhost:3001/api/db/stats
```

### 4. Migrate Existing Products

```bash
curl -X POST http://localhost:3001/api/db/migrate/json-to-db
```

## 🆘 Alternative: Use SQLite for Quick Testing

If PostgreSQL continues to have issues, you can temporarily use SQLite:

```bash
npm install sqlite3
```

I can create an SQLite version of the database integration for immediate testing while you fix PostgreSQL.

## ✅ Expected Results

When working correctly, you'll see:

```
🚀 Server running on http://0.0.0.0:3001
✅ PostgreSQL database connected successfully
🗄️ Database integration active  
✅ Database schema initialized successfully
```

And these endpoints will work:
- `GET /api/db/items` - Multi-seller products
- `GET /api/db/sellers` - Seller profiles  
- `GET /api/db/stats` - Database statistics
- `POST /api/db/migrate/json-to-db` - Import existing products

## 💡 Common Issues & Solutions

### Issue: "Access is denied"
- Run Command Prompt as Administrator
- Check Windows User Account Control settings

### Issue: "Connection refused"
- PostgreSQL service not running
- Firewall blocking port 5432
- Wrong host/port configuration

### Issue: "Password authentication failed"
- Reset postgres user password:
  ```cmd
  "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres
  ALTER USER postgres PASSWORD 'newpassword';
  ```

### Issue: "Database does not exist"
- Create database manually:
  ```sql
  CREATE DATABASE vintage_crib;
  ```

## 🎯 Next Steps After Setup

1. ✅ PostgreSQL running and accessible
2. ✅ vintage_crib database created  
3. ✅ Server connecting to database
4. ✅ Database tables created automatically
5. ✅ Existing products migrated
6. 🚀 Multi-seller marketplace ready!

Need help? The system gracefully falls back to JSON files if database is unavailable, so your existing functionality continues to work! 🎉