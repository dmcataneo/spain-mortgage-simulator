// Tests load the same embedded series the page uses.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'euribor-data.js'), 'utf8');
const window = {};
eval(src);
module.exports = window.EURIBOR;
