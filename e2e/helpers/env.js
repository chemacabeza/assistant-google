const path = require('node:path');

const urls = {
  frontend: process.env.E2E_FRONTEND_URL || 'http://127.0.0.1:15173',
  backend: process.env.E2E_BACKEND_URL || 'http://127.0.0.1:18081',
  bridge: process.env.E2E_BRIDGE_URL || 'http://127.0.0.1:13001',
  googleMock: process.env.E2E_GOOGLE_MOCK_URL || 'http://127.0.0.1:19000',
};

module.exports = {
  urls,
  GOOGLE_CLIENT_ID: 'e2e-client-id',
  GOOGLE_AUTH_URL: `${urls.googleMock}/o/oauth2/v2/auth`,
  OAUTH_REDIRECT_URI: 'http://127.0.0.1:15173/login/oauth2/code/google',
  AUTH_FILE: path.join(__dirname, '..', '.auth', 'user.json'),
  USERS: {
    primary: { email: 'e2e@example.com', name: 'E2E User' },
    second: { email: 'second@example.com', name: 'Second User' },
  },
  WEBHOOK_VERIFY_TOKEN: process.env.E2E_WEBHOOK_VERIFY_TOKEN || 'chema_assistant_2026',
  DB_CONTAINER: process.env.E2E_DB_CONTAINER || 'assistant-e2e-postgres',
  DB_USER: process.env.POSTGRES_USER || 'assistant_user',
  DB_NAME: process.env.POSTGRES_DB || 'assistant_db',
};
