/**
 * ACE TRADE - Session Service
 * Handles one-time session token generation and validation
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../database/db');
const config = require('../config/config');

/**
 * Generate a one-time session token
 */
const generateSessionToken = async (userId, ipAddress = null, deviceInfo = null) => {
  // Check rate limit (max sessions per hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentSessions = await db.query(
    'SELECT COUNT(*) as count FROM one_time_sessions WHERE user_id = $1 AND created_at > $2',
    [userId, oneHourAgo]
  );

  if (parseInt(recentSessions.rows[0].count) >= config.session.maxPerHour) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }

  // Generate session token
  const sessionToken = uuidv4();
  const expiresAt = new Date(Date.now() + config.session.expiryMinutes * 60 * 1000);

  const result = await db.query(
    `INSERT INTO one_time_sessions (user_id, session_token, ip_address, device_info, expires_at, created_at) 
     VALUES ($1, $2, $3, $4, $5, NOW()) 
     RETURNING session_id, session_token, expires_at`,
    [userId, sessionToken, ipAddress, deviceInfo, expiresAt]
  );

  // Log security event
  await db.query(
    `INSERT INTO security_logs (user_id, event_type, ip_address, device_info, details, created_at) 
     VALUES ($1, 'session_generated', $2, $3, $4, NOW())`,
    [userId, ipAddress, deviceInfo, JSON.stringify({ session_id: result.rows[0].session_id })]
  );

  return {
    sessionToken: result.rows[0].session_token,
    expiresAt: result.rows[0].expires_at,
    expiryMinutes: config.session.expiryMinutes,
  };
};

/**
 * Generate login URL with session token
 */
const generateLoginUrl = (sessionToken) => {
  return `${config.tradeTerminal.url}${config.tradeTerminal.authPath}?token=${sessionToken}`;
};

/**
 * Validate session token (for Trade Terminal to call)
 */
const validateSessionToken = async (sessionToken) => {
  const result = await db.query(
    `SELECT s.session_id, s.user_id, s.used, s.expires_at, u.user_tier, u.is_2fa_enabled
     FROM one_time_sessions s
     JOIN users u ON s.user_id = u.user_id
     WHERE s.session_token = $1`,
    [sessionToken]
  );

  if (result.rows.length === 0) {
    return { valid: false, error: 'Invalid session token' };
  }

  const session = result.rows[0];

  // Check if already used
  if (session.used) {
    return { valid: false, error: 'Session token already used' };
  }

  // Check if expired
  if (new Date(session.expires_at) < new Date()) {
    return { valid: false, error: 'Session token expired' };
  }

  // Mark as used
  await db.query(
    'UPDATE one_time_sessions SET used = true WHERE session_id = $1',
    [session.session_id]
  );

  // Log security event
  await db.query(
    `INSERT INTO security_logs (user_id, event_type, details, created_at) 
     VALUES ($1, 'session_validated', $2, NOW())`,
    [session.user_id, JSON.stringify({ session_id: session.session_id })]
  );

  return {
    valid: true,
    userId: session.user_id,
    userTier: session.user_tier,
    is2faEnabled: session.is_2fa_enabled,
  };
};

/**
 * Clean up expired sessions (should be run periodically)
 */
const cleanupExpiredSessions = async () => {
  const result = await db.query(
    'DELETE FROM one_time_sessions WHERE expires_at < NOW() RETURNING session_id'
  );

  console.log(`🧹 Cleaned up ${result.rowCount} expired sessions`);
  return result.rowCount;
};

/**
 * Get user's recent sessions
 */
const getUserSessions = async (userId, limit = 10) => {
  const result = await db.query(
    `SELECT session_id, created_at, expires_at, used, ip_address, device_info 
     FROM one_time_sessions 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT $2`,
    [userId, limit]
  );

  return result.rows;
};

/**
 * List active sessions for user
 */
const listActiveSessionsForUser = async (userId) => {
  const result = await db.query(
    `SELECT active_session_id, ip_address, device_info, created_at
     FROM active_sessions
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
};

/**
 * Delete an active session
 */
const deleteActiveSession = async (userId, sessionId) => {
  const result = await db.query(
    'DELETE FROM active_sessions WHERE user_id = $1 AND active_session_id = $2',
    [userId, sessionId]
  );

  return result.rowCount > 0;
};

/**
 * Generate a one-time code for 2FA operations
 */
const generate2FACode = async (userId, actionType) => {
  // Generate 8-character alphanumeric code
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();

  // Store in database with 90-second expiry
  const expiresAt = new Date(Date.now() + 90 * 1000);

  await db.query(
    `INSERT INTO twofa_codes (user_id, code, action_type, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, code, actionType, expiresAt]
  );

  return code;
};

/**
 * Verify a 2FA code
 */
const verify2FACode = async (userId, code, actionType) => {
  const result = await db.query(
    `SELECT code_id FROM twofa_codes
     WHERE user_id = $1 AND code = $2 AND action_type = $3
     AND expires_at > NOW() AND used = false`,
    [userId, code, actionType]
  );

  if (result.rows.length === 0) {
    return false;
  }

  // Mark as used
  await db.query(
    `UPDATE twofa_codes SET used = true WHERE code_id = $1`,
    [result.rows[0].code_id]
  );

  return true;
};

/**
 * Generate and store recovery key
 */
const generateRecoveryKey = async (userId) => {
  // Generate 32-character hex key
  const recoveryKey = crypto.randomBytes(16).toString('hex').toUpperCase();

  // Hash for storage
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash(recoveryKey, 12);

  await db.query(
    `UPDATE users SET recovery_key_hash = $1, recovery_key_used = false, recovery_key_created_at = NOW()
     WHERE user_id = $2`,
    [hash, userId]
  );

  return recoveryKey;
};

/**
 * Get recovery key (for display)
 */
const getRecoveryKey = async (userId) => {
  const result = await db.query(
    `SELECT recovery_key_hash, recovery_key_used FROM users WHERE user_id = $1`,
    [userId]
  );

  if (!result.rows[0] || !result.rows[0].recovery_key_hash || result.rows[0].recovery_key_used) {
    return null;
  }

  // We can't return the actual key since it's hashed
  // This function is for checking if recovery key exists
  return 'EXISTS'; // Indicate it exists but don't reveal it
};

/**
 * Verify recovery key
 */
const verifyRecoveryKey = async (userId, recoveryKey) => {
  const result = await db.query(
    `SELECT recovery_key_hash FROM users WHERE user_id = $1`,
    [userId]
  );

  if (!result.rows[0] || !result.rows[0].recovery_key_hash) {
    return false;
  }

  const bcrypt = require('bcrypt');
  const isValid = await bcrypt.compare(recoveryKey, result.rows[0].recovery_key_hash);

  if (isValid) {
    // Mark as used
    await db.query(
      `UPDATE users SET recovery_key_used = true WHERE user_id = $1`,
      [userId]
    );
  }

  return isValid;
};

/**
 * Check if user has recovery key
 */
const hasRecoveryKey = async (userId) => {
  const result = await db.query(
    `SELECT recovery_key_hash, recovery_key_used FROM users WHERE user_id = $1`,
    [userId]
  );

  return result.rows[0] && result.rows[0].recovery_key_hash && !result.rows[0].recovery_key_used;
};

/**
 * Get recent activity for user (last N days)
 */
const getRecentActivity = async (userId, days = 7) => {
  const result = await db.query(
    `SELECT
       event_type as action,
       created_at as timestamp,
       device_info
     FROM security_logs
     WHERE user_id = $1
     AND created_at >= NOW() - INTERVAL '${days} days'
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId]
  );

  return result.rows;
};

/**
 * Get count of active sessions for user
 */
const getActiveSessionCount = async (userId) => {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM active_sessions WHERE user_id = $1`,
    [userId]
  );

  return parseInt(result.rows[0].count);
};

/**
 * Check if account is locked
 */
const isAccountLocked = async (userId) => {
  const result = await db.query(
    `SELECT account_locked FROM users WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0]?.account_locked || false;
};

/**
 * Initiate account lockdown
 */
const initiateLockdown = async (userId) => {
  // Check if 2FA is enabled (required for lockdown)
  const userResult = await db.query(
    `SELECT is_2fa_enabled FROM users WHERE user_id = $1`,
    [userId]
  );

  if (!userResult.rows[0]?.is_2fa_enabled) {
    throw new Error('2FA must be enabled to use lockdown feature');
  }

  // Delete all active sessions
  await db.query(
    `DELETE FROM active_sessions WHERE user_id = $1`,
    [userId]
  );

  // Mark account as locked
  await db.query(
    `UPDATE users SET account_locked = true WHERE user_id = $1`,
    [userId]
  );

  // Log the lockdown
  await db.query(
    `INSERT INTO security_logs (user_id, event_type, details, created_at)
     VALUES ($1, 'account_lockdown', $2, NOW())`,
    [userId, JSON.stringify({ action: 'emergency_lockdown', sessions_destroyed: true, account_locked: true })]
  );
};

/**
 * Unlock account (requires 2FA verification)
 */
const unlockAccount = async (userId, totpCode) => {
  // Verify 2FA code
  const userResult = await db.query(
    `SELECT google_2fa_secret FROM users WHERE user_id = $1`,
    [userId]
  );

  if (!userResult.rows[0]?.google_2fa_secret) {
    throw new Error('2FA not configured');
  }

  const speakeasy = require('speakeasy');
  const isValid = speakeasy.totp.verify({
    secret: userResult.rows[0].google_2fa_secret,
    encoding: 'base32',
    token: totpCode,
    window: 2,
  });

  if (!isValid) {
    throw new Error('Invalid 2FA code');
  }

  // Unlock account
  await db.query(
    `UPDATE users SET account_locked = false WHERE user_id = $1`,
    [userId]
  );

  // Log the unlock
  await db.query(
    `INSERT INTO security_logs (user_id, event_type, details, created_at)
     VALUES ($1, 'account_unlock', $2, NOW())`,
    [userId, JSON.stringify({ action: 'account_unlocked', verified_by_2fa: true })]
  );
};

module.exports = {
  generateSessionToken,
  generateLoginUrl,
  validateSessionToken,
  cleanupExpiredSessions,
  getUserSessions,
  listActiveSessionsForUser,
  deleteActiveSession,
  generate2FACode,
  verify2FACode,
  generateRecoveryKey,
  getRecoveryKey,
  verifyRecoveryKey,
  hasRecoveryKey,
  getRecentActivity,
  getActiveSessionCount,
  isAccountLocked,
  initiateLockdown,
  unlockAccount,
};

