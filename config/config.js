/**
 * ACE TRADE - Configuration Module
 * Loads and validates environment variables
 */

require('dotenv').config();

const config = {
  // Telegram Bot
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    polling: {
      interval: 300,
      autoStart: true,
    },
  },

  // Trade Terminal
  tradeTerminal: {
    url: process.env.TRADE_TERMINAL_URL || 'http://localhost:3000',
    authPath: '/auth/login',
    serviceToken: process.env.TRADE_TERMINAL_SERVICE_TOKEN,
  },

  // Session
  session: {
    expiryMinutes: parseInt(process.env.SESSION_EXPIRY_MINUTES || '5'),
    maxPerHour: parseInt(process.env.MAX_SESSIONS_PER_HOUR || '10'),
  },

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME || 'ace_trade_auth',
    user: process.env.DB_USER || 'ace_trade_user',
    password: process.env.DB_PASSWORD,
  },

  // Bot Settings
  bot: {
    environment: process.env.BOT_ENVIRONMENT || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
};

// Validate required config
const validateConfig = () => {
  const required = {
    'TELEGRAM_BOT_TOKEN': config.telegram.token,
    'DB_PASSWORD': config.database.password,
  };

  const missing = Object.entries(required)
    .filter(([key, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

validateConfig();

module.exports = config;

