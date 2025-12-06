/**
 * ACE TRADE - User Service
 * Handles user registration and lookup
 */

const crypto = require('crypto');
const db = require('../database/db');

/**
 * Check if user exists by telegram_chat_id
 */
const userExists = async (telegramChatId) => {
  const result = await db.query(
    'SELECT user_id FROM users WHERE telegram_chat_id = $1',
    [telegramChatId]
  );
  return result.rows.length > 0;
};

/**
 * Get user by telegram_chat_id
 */
const getUserByTelegramId = async (telegramChatId) => {
  const result = await db.query(
    'SELECT user_id, account_id, telegram_chat_id, user_tier, is_2fa_enabled, registered_at, last_login FROM users WHERE telegram_chat_id = $1',
    [telegramChatId]
  );
  return result.rows[0] || null;
};

/**
 * Get user by account_id (for recovery)
 */
const getUserByAccountId = async (accountId) => {
  const result = await db.query(
    'SELECT user_id, account_id, telegram_chat_id, user_tier, is_2fa_enabled FROM users WHERE account_id = $1',
    [accountId]
  );
  return result.rows[0] || null;
};

/**
 * Register new user with optional referral
 */
const registerUser = async (telegramChatId, referralCode = null) => {
  try {
    // Generate unique account ID (12-character alphanumeric)
    const accountId = crypto.randomBytes(6).toString('hex').toUpperCase();

    // Check if referral code is valid and get referrer ID
    let referrerId = null;
    if (referralCode) {
      const referrerResult = await db.query(
        'SELECT user_id FROM users WHERE referral_code = $1',
        [referralCode]
      );
      if (referrerResult.rows.length > 0) {
        referrerId = referrerResult.rows[0].user_id;
      }
    }

    const result = await db.query(
      `INSERT INTO users (telegram_chat_id, account_id, agreed_to_tos, user_tier, registered_at, referred_by)
       VALUES ($1, $2, true, 'basic', NOW(), $3)
       RETURNING user_id, account_id, telegram_chat_id, user_tier, registered_at`,
      [telegramChatId, accountId, referrerId]
    );

    const newUser = result.rows[0];

    // If referral was valid, create referral record
    if (referrerId) {
      await db.query(
        `INSERT INTO referrals (referrer_id, referee_id, status, created_at)
         VALUES ($1, $2, 'pending', NOW())`,
        [referrerId, newUser.user_id]
      );

      // Log referral event
      await db.query(
        `INSERT INTO security_logs (user_id, event_type, details, created_at)
         VALUES ($1, 'referral_registration', $2, NOW())`,
        [newUser.user_id, JSON.stringify({ referrer_id: referrerId, referral_code: referralCode })]
      );
    }

    // Log security event
    await db.query(
      `INSERT INTO security_logs (user_id, event_type, details, created_at)
       VALUES ($1, 'user_registered', $2, NOW())`,
      [newUser.user_id, JSON.stringify({
        telegram_chat_id: telegramChatId,
        account_id: accountId,
        referred_by: referrerId,
        referral_code: referralCode
      })]
    );

    return newUser;
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      throw new Error('User already registered');
    }
    throw error;
  }
};

/**
 * Update last login timestamp
 */
const updateLastLogin = async (userId) => {
  await db.query(
    'UPDATE users SET last_login = NOW() WHERE user_id = $1',
    [userId]
  );
};

/**
 * Get user tier
 */
const getUserTier = async (userId) => {
  const result = await db.query(
    'SELECT user_tier FROM users WHERE user_id = $1',
    [userId]
  );
  return result.rows[0]?.user_tier || 'basic';
};

/**
 * Upgrade user tier (for future use)
 */
const upgradeUserTier = async (userId, tier) => {
  if (!['basic', 'pro'].includes(tier)) {
    throw new Error('Invalid tier');
  }

  await db.query(
    'UPDATE users SET user_tier = $1 WHERE user_id = $2',
    [tier, userId]
  );

  // Log security event
  await db.query(
    `INSERT INTO security_logs (user_id, event_type, details, created_at) 
     VALUES ($1, 'tier_upgraded', $2, NOW())`,
    [userId, JSON.stringify({ new_tier: tier })]
  );
};

module.exports = {
  userExists,
  getUserByTelegramId,
  getUserByAccountId,
  registerUser,
  updateLastLogin,
  getUserTier,
  upgradeUserTier,
};

