// Diagnostic script — run via cPanel → Node.js → Run JS script
const path = require('path');

// Check what's actually in admin.js on disk
const fs = require('fs');
const adminContent = fs.readFileSync(path.join(__dirname, 'src/routes/admin.js'), 'utf8');

const hasGroups = adminContent.includes("router.post('/groups'");
const hasGetGroups = adminContent.includes("router.get('/groups'");
const lineCount = adminContent.split('\n').length;

console.log('=== admin.js on disk ===');
console.log('Has POST /groups route:', hasGroups);
console.log('Has GET /groups route:', hasGetGroups);
console.log('Total lines:', lineCount);
console.log('File size:', adminContent.length, 'bytes');

// Check what routes the admin router actually registers
try {
  const adminRouter = require('./src/routes/admin');
  const routes = (adminRouter.stack || [])
    .filter(r => r.route)
    .map(r => `${Object.keys(r.route.methods).join(',').toUpperCase()} ${r.route.path}`);
  console.log('\n=== Registered routes in admin router ===');
  routes.forEach(r => console.log(r));
} catch(e) {
  console.log('\nERROR loading admin router:', e.message);
}

// Check index.js
const indexContent = fs.readFileSync(path.join(__dirname, 'src/index.js'), 'utf8');
console.log('\n=== index.js ===');
console.log('Lines:', indexContent.split('\n').length);
console.log('Has inline groups route:', indexContent.includes("app.post('/api/admin/groups'"));
