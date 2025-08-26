const jwt = require('jsonwebtoken');
const token = jwt.sign({id: 1, username: 'admin', role: 'admin'}, 'vintage_crib_secret_key_2025', {expiresIn: '24h'});
console.log(token);