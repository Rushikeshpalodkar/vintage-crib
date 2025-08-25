const { exec } = require('child_process');
const path = require('path');

// PostgreSQL setup script for Windows
console.log('🗄️ PostgreSQL Database Setup for Vintage Crib');
console.log('================================================');

// PostgreSQL installation path
const pgPath = 'C:\\Program Files\\PostgreSQL\\17\\bin';
const psqlCmd = `"${pgPath}\\psql.exe"`;
const createdbCmd = `"${pgPath}\\createdb.exe"`;

console.log('📋 Setup Steps:');
console.log('1. First, set a password for the postgres user');
console.log('2. Create the vintage_crib database');
console.log('3. Test the connection');
console.log('');

// Function to run PostgreSQL commands
function runPgCommand(command, description) {
    return new Promise((resolve, reject) => {
        console.log(`🔧 ${description}...`);
        console.log(`Running: ${command}`);
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Error: ${error.message}`);
                console.error(`stderr: ${stderr}`);
                reject(error);
            } else {
                console.log(`✅ Success: ${description}`);
                if (stdout) console.log(`Output: ${stdout}`);
                resolve(stdout);
            }
        });
    });
}

async function setupDatabase() {
    try {
        console.log('🚀 Starting database setup...');
        
        // Step 1: Test if we can connect without password
        console.log('\\n📝 Testing PostgreSQL connection...');
        
        // Try to connect to postgres database (should exist by default)
        const testCmd = `${psqlCmd} -U postgres -d postgres -c "SELECT version();" -t`;
        
        try {
            await runPgCommand(testCmd, 'Testing connection');
            console.log('✅ PostgreSQL is accessible!');
        } catch (error) {
            console.log('⚠️ Connection test failed - this is normal for fresh installs');
            console.log('💡 You may need to set up authentication');
        }
        
        // Step 2: Try to create database
        console.log('\\n🏗️ Creating vintage_crib database...');
        const createDbCmd = `${createdbCmd} -U postgres vintage_crib`;
        
        try {
            await runPgCommand(createDbCmd, 'Creating database');
            console.log('✅ Database created successfully!');
        } catch (error) {
            console.log('⚠️ Database creation failed or database already exists');
        }
        
        // Step 3: Test connection to new database
        console.log('\\n🔍 Testing connection to vintage_crib database...');
        const testDbCmd = `${psqlCmd} -U postgres -d vintage_crib -c "SELECT 'Database ready!' as status;" -t`;
        
        try {
            await runPgCommand(testDbCmd, 'Testing vintage_crib database');
            console.log('🎉 Database is ready to use!');
            
            // Update .env file
            console.log('\\n📝 Updating .env configuration...');
            const fs = require('fs');
            let envContent = '';
            if (fs.existsSync('.env')) {
                envContent = fs.readFileSync('.env', 'utf8');
            }
            
            // Update or add database settings
            if (!envContent.includes('DB_PASSWORD=')) {
                envContent += '\\n# Database Configuration\\n';
                envContent += 'DB_HOST=localhost\\n';
                envContent += 'DB_PORT=5432\\n';
                envContent += 'DB_NAME=vintage_crib\\n';
                envContent += 'DB_USER=postgres\\n';
                envContent += 'DB_PASSWORD=\\n'; // Empty password for local development
            }
            
            fs.writeFileSync('.env', envContent);
            console.log('✅ .env file updated');
            
        } catch (error) {
            console.log('❌ Connection to vintage_crib failed');
        }
        
        console.log('\\n🎯 Next Steps:');
        console.log('1. If authentication failed, you may need to set a password for postgres user');
        console.log('2. Restart your server: node server.js');
        console.log('3. The server will automatically create all required tables');
        console.log('4. Test the database API: curl http://localhost:3001/api/db/stats');
        
    } catch (error) {
        console.error('💥 Setup failed:', error.message);
        console.log('\\n🔧 Manual Setup Instructions:');
        console.log('1. Open Command Prompt as Administrator');
        console.log('2. Run: cd "C:\\Program Files\\PostgreSQL\\17\\bin"');
        console.log('3. Run: psql -U postgres');
        console.log('4. In psql, run: CREATE DATABASE vintage_crib;');
        console.log('5. Exit psql with: \\q');
        console.log('6. Restart your Node.js server');
    }
}

// Run setup
setupDatabase();