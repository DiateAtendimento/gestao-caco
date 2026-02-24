const { google } = require('googleapis');
const env = require('../config/env');

const auth = new google.auth.JWT({
  email: env.googleServiceAccountEmail,
  key: env.googlePrivateKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

module.exports = sheets;
