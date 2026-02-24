require('dotenv').config();

function must(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável obrigatória ausente: ${name}`);
  }
  return value;
}

const env = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: must('JWT_SECRET'),
  googleSheetId: must('GOOGLE_SHEET_ID'),
  googleServiceAccountEmail: must('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
  googlePrivateKey: must('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  frontendUrl: process.env.FRONTEND_URL || '*'
};

module.exports = env;
