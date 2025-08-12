module.exports = async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    console.log('✅ API test route called!');
    res.status(200).json({ 
        message: 'Vintage Crib API is working!',
        timestamp: new Date(),
        status: 'success'
    });
}