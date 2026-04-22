const path = require('path');
console.log('__dirname:', __dirname);
console.log('Joined path:', path.join(__dirname, '../frontend/dist'));
console.log('Absolute path:', path.resolve(__dirname, '../frontend/dist'));
const fs = require('fs');
const p = path.resolve(__dirname, '../frontend/dist/index.html');
console.log('Exists:', fs.existsSync(p));
