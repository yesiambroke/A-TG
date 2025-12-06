/**
 * ACE TRADE - Telegram Bot Main Logic
 * Handles user registration and session generation
 */

const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const http = require('http');
const config = require('./config/config');
const userService = require('./services/userService');
const sessionService = require('./services/sessionService');
const { TERMS_OF_SERVICE, PRIVACY_NOTICE, SECURITY_TIPS } = require('./utils/texts');

// Initialize bot
const bot = new TelegramBot(config.telegram.token, { polling: true });

console.log('🤖 ACE TRADE Bot starting...');

// ============================================
// COMMAND: /start [referral_code]
// ============================================
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referralCode = match[1]; // Extract referral code if present

  try {
    // Check if user already exists
    const userExists = await userService.userExists(chatId);

    if (userExists) {
      // Existing user - show main menu
      await showMainMenu(msg);
    } else {
      // New user - show welcome and terms of service
      // Pass referral code to registration process
      await showWelcomeAndTerms(msg, referralCode);
    }
  } catch (error) {
    console.error('Error in /start:', error);
    bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
});

// ============================================
// WELCOME & TERMS OF SERVICE
// ============================================
const showWelcomeAndTerms = async (msg, referralCode = null) => {
  const chatId = msg.chat.id;

  // Send welcome message with referral info if applicable
  let welcomeMessage = `🎴 **Welcome to ACE TRADE!**\n\n` +
    `Trade PumpFun meme coins on Solana with:\n` +
    `• Lightning-fast execution\n` +
    `• Multi-wallet management\n` +
    `• 0.5% trading fees\n` +
    `• Self-hosted private keys (coming soon)\n\n`;

  if (referralCode) {
    welcomeMessage += `🎁 **Special Offer:** You've been invited! Get **25% off** your Pro membership upgrade!\n\n`;
  }

  welcomeMessage += `Let's get you started! 🚀`;

  await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });

  // Send Terms of Service
  await bot.sendMessage(chatId, TERMS_OF_SERVICE, { parse_mode: 'Markdown' });

  // Send privacy notice
  await bot.sendMessage(chatId, PRIVACY_NOTICE, { parse_mode: 'Markdown' });

  // Show agreement button with referral context
  const keyboard = {
    inline_keyboard: [
      [{ text: '✅ I Agree to Terms of Service', callback_data: `agree_tos${referralCode ? `:${referralCode}` : ''}` }],
      [{ text: '❌ Decline', callback_data: 'decline_tos' }],
    ],
  };

  await bot.sendMessage(
    chatId,
    '👆 Please review and accept the Terms of Service to continue.',
    { reply_markup: keyboard }
  );
};

// ============================================
// CALLBACK: Agree to ToS
// ============================================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  try {
    if (data.startsWith('agree_tos')) {
      await bot.answerCallbackQuery(query.id, { text: '✅ Registering your account...' }).catch(() => {});

      // Extract referral code if present (format: agree_tos:REFCODE)
      const referralCode = data.includes(':') ? data.split(':')[1] : null;

      // Register user with optional referral
      const user = await userService.registerUser(chatId, referralCode);

      let successMessage = `✅ **Account Created Successfully!**\n\n` +
        `👤 Account ID: \`${user.account_id}\`\n` +
        `🎟️ Tier: ${user.user_tier.toUpperCase()}\n` +
        `📅 Registered: ${new Date(user.registered_at).toLocaleDateString()}\n\n`;

      if (referralCode) {
        successMessage += `🎁 **Referral Bonus Activated!**\n` +
          `You get **25% off** your Pro membership upgrade!\n\n`;
      }

      successMessage += `You can now access the trading terminal! 🎉`;

      await bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });

      // Show main menu
      await showMainMenu(query.message);
    } 
    else if (data === 'decline_tos') {
      await bot.answerCallbackQuery(query.id, { text: '❌ Terms declined' }).catch(() => {});
      await bot.sendMessage(
        chatId,
        '❌ You must agree to the Terms of Service to use Ace Trade.\n\n' +
        'Send /start again when you\'re ready to continue.'
      );
    }
    else if (data === 'open_session') {
      await handleOpenSession(query);
    }
    else if (data === 'my_account') {
      await handleMyAccount(query);
    }
    else if (data === 'security') {
      await handleSecurity(query);
    }
     else if (data === 'help') {
       await handleHelp(query);
     }
     else if (data === 'active_sessions') {
       await handleActiveSessions(query);
     }
      else if (data.startsWith('revoke_session_')) {
        const sessionId = data.replace('revoke_session_', '');
        await handleRevokeSession(query, sessionId);
      }
      else if (data === 'enable_2fa') {
        await handleEnable2FA(query);
      }
      else if (data === 'disable_2fa') {
        await handleDisable2FA(query);
      }
      else if (data === 'recovery_key') {
        await handleRecoveryKey(query);
      }
      else if (data === 'security_dashboard') {
        await handleSecurityDashboard(query);
      }
      else if (data === 'my_account') {
        await handleMyAccount(query);
      }
      else if (data === 'view_sessions') {
        await handleActiveSessions(query);
      }
      else if (data === 'recent_activity') {
        await handleRecentActivity(query);
      }
      else if (data === 'emergency_menu') {
        await handleEmergencyMenu(query);
      }
      else if (data === 'confirm_lockdown') {
        await handleConfirmLockdown(query);
      }
      else if (data === 'cancel_lockdown') {
        await handleCancelLockdown(query);
      }
      else if (data === 'help_security') {
        await handleHelpSecurity(query);
      }
      else if (data === 'help_account') {
        await handleHelpAccount(query);
      }
      else if (data === 'account_menu') {
        await handleAccountMenu(query);
      }
      else if (data === 'report_suspicious') {
        await handleReportSuspicious(query);
      }
      else if (data === 'help_sessions') {
        await handleHelpSessions(query);
      }
  } catch (error) {
    console.error('Error in callback query:', error);
    await bot.answerCallbackQuery(query.id, { text: '❌ Error occurred' });
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// ============================================
// MAIN MENU
// ============================================
const showMainMenu = async (msg) => {
  const chatId = msg.chat.id;

  const keyboard = {
    inline_keyboard: [
      [{ text: '🚀 Open Session', callback_data: 'open_session' }],
      [{ text: '👤 My Account', callback_data: 'my_account' }],
      [{ text: '🔒 Active Sessions', callback_data: 'active_sessions' }],
      [{ text: '❓ Help', callback_data: 'help' }],
    ],
  };

  await bot.sendMessage(
    chatId,
    `🎴 **ACE TRADE - Main Menu**\n\n` +
    `Choose an option below to continue:`,
    { reply_markup: keyboard, parse_mode: 'Markdown' }
  );
};

// ============================================
// HANDLER: Open Session (single flow)
// ============================================
const handleOpenSession = async (query) => {
  const chatId = query.message.chat.id;
  
    await bot.answerCallbackQuery(query.id, { text: '🔄 Generating session...' }).catch(() => {});

  // Get user
  const user = await userService.getUserByTelegramId(chatId);
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ User not found. Please restart with /start');
    return;
  }

  // Generate session token
  const session = await sessionService.generateSessionToken(
    user.user_id,
    null, // IP not available from Telegram
    'Telegram Bot'
  );

  // Generate login URL
  const loginUrl = sessionService.generateLoginUrl(session.sessionToken);

  const allowButton = (() => {
    try {
      const parsed = new URL(loginUrl);
      const unsafeHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
      return parsed.protocol === 'https:' && !unsafeHosts.includes(parsed.hostname);
    } catch {
      return false;
    }
  })();

  const keyboard = allowButton
    ? {
        inline_keyboard: [
          [{ text: '🚀 Open Trade Terminal', url: loginUrl }],
          [{ text: '🔙 Back to Menu', callback_data: 'back_menu' }],
        ],
      }
    : {
        inline_keyboard: [[{ text: '🔙 Back to Menu', callback_data: 'back_menu' }]],
      };

  await bot.sendMessage(
    chatId,
    `✅ **Session Created!**\n\n` +
    `⏱️ Expires in ${session.expiryMinutes} minutes\n` +
    `⚠️ One-time use\n\n` +
    `Open or copy this magic link:\n` +
    `[Open Session](${loginUrl}) (tap to launch)\n\n` +
    `Copy link:\n\`${loginUrl}\`\n\n` +
    `Do not share this link.`,
    { reply_markup: keyboard, parse_mode: 'Markdown' }
  );
};



// ============================================
// HANDLER: Security Settings
// ============================================
const handleSecurity = async (query) => {
  const chatId = query.message.chat.id;
  
    await bot.answerCallbackQuery(query.id, { text: '🔒 Security settings' }).catch(() => {});

  await bot.sendMessage(chatId, SECURITY_TIPS, { parse_mode: 'Markdown' });

  const keyboard = {
    inline_keyboard: [
      [{ text: '📱 View Active Sessions', url: `${config.tradeTerminal.url}/account/sessions` }],
      [{ text: '🔑 Security Settings', url: `${config.tradeTerminal.url}/account/security` }],
      [{ text: '🔙 Back to Menu', callback_data: 'back_menu' }],
    ],
  };

  await bot.sendMessage(
    chatId,
    '🔒 **Security Features**\n\n' +
    'Configure these in the Trade Terminal:',
    { reply_markup: keyboard, parse_mode: 'Markdown' }
  );
};

// ============================================
// HANDLER: Help
// ============================================
const handleHelp = async (query) => {
  const chatId = query.message.chat.id;
  
  await bot.answerCallbackQuery(query.id, { text: 'ℹ️ Help' });

    const helpText = `❓ *ACE TRADE - Help*

*Getting Started:*
• Use \`/start\` to access main menu
• Click "Open Session" for instant login

*Account Management:*
• \`/account\` - Overview & settings
• \`/activity\` - Recent activity (7 days)

*Security:*
• \`/enable_2fa\` - Enable 2FA
• \`/disable_2fa\` - Disable 2FA
• \`/recovery_key\` - View recovery key
• \`/2fa_status\` - 2FA status
• \`/lockdown\` - Emergency lockdown (2FA required)
• \`/unlock\` - Unlock account with 2FA code

*Sessions:*
• \`/sessions\` - View active sessions
• \`/revoke <id>\` - Revoke session

*Security Features:*
• Links expire in 5 minutes
• 2FA for enhanced security
• Recovery key for emergencies
• Account lockdown protection

Website: a-trade.fun`;

   const keyboard = {
     inline_keyboard: [
       [
         { text: '👤 Account Help', callback_data: 'help_account' },
         { text: '🔐 Security Help', callback_data: 'help_security' }
       ],
       [
         { text: '📱 Sessions Help', callback_data: 'help_sessions' },
         { text: '🚨 Emergency Help', callback_data: 'help_emergency' }
       ],
       [{ text: '🔙 Back to Menu', callback_data: 'back_menu' }],
     ],
   };

   await bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown', reply_markup: keyboard });

  await bot.sendMessage(chatId, 'Back to menu?', { reply_markup: keyboard });
};

// ============================================
// HANDLER: Active Sessions
// ============================================
const handleActiveSessions = async (query) => {
  const chatId = query.message.chat.id;

  await bot.answerCallbackQuery(query.id, { text: '🔒 Loading active sessions...' }).catch(() => {});

  try {
    // Get user
    const user = await userService.getUserByTelegramId(chatId);

    if (!user) {
      await bot.sendMessage(chatId, '❌ User not found. Please restart with /start');
      return;
    }

    // Fetch active sessions from database
    const sessions = await sessionService.listActiveSessionsForUser(user.user_id);

    if (!sessions || sessions.length === 0) {
      await bot.sendMessage(
        chatId,
        '🔒 **Active Sessions**\n\n' +
        'No active sessions found.\n\n' +
        'Active sessions are created when you log in to the trade terminal.',
        { parse_mode: 'Markdown' }
      );

      const keyboard = {
        inline_keyboard: [
          [{ text: '🚀 Open New Session', callback_data: 'open_session' }],
          [{ text: '🔙 Back to Menu', callback_data: 'back_menu' }],
        ],
      };

      await bot.sendMessage(chatId, 'What would you like to do?', { reply_markup: keyboard });
      return;
    }

    // Display sessions with revoke buttons
    let message = '🔒 **Active Sessions**\n\n';
    const keyboard = {
      inline_keyboard: [],
    };

    sessions.forEach((session, index) => {
      const sessionNum = index + 1;
      const deviceInfo = session.device_info || 'Unknown Device';
      const ipAddress = session.ip_address || 'Unknown IP';
      const createdAt = new Date(session.created_at).toLocaleString();

      message += `${sessionNum}. **${deviceInfo}**\n`;
      message += `   📍 ${ipAddress}\n`;
      message += `   🕐 ${createdAt}\n\n`;

      keyboard.inline_keyboard.push([
        { text: `❌ Revoke Session ${sessionNum}`, callback_data: `revoke_session_${session.active_session_id}` }
      ]);
    });

    keyboard.inline_keyboard.push(
      [{ text: '🚀 Open New Session', callback_data: 'open_session' }],
      [{ text: '🔙 Back to Menu', callback_data: 'back_menu' }]
    );

    await bot.sendMessage(chatId, message, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });

  } catch (error) {
    console.error('Error fetching active sessions:', error);
    await bot.sendMessage(
      chatId,
      '❌ Failed to load active sessions. Please try again later.'
    );
  }
};

// ============================================
// HANDLER: Revoke Session
// ============================================
const handleRevokeSession = async (query, sessionId) => {
  const chatId = query.message.chat.id;

  await bot.answerCallbackQuery(query.id, { text: '🔄 Revoking session...' }).catch(() => {});

  try {
    // Get user
    const user = await userService.getUserByTelegramId(chatId);

    if (!user) {
      await bot.sendMessage(chatId, '❌ User not found');
      return;
    }

    // Revoke session from database
    const success = await sessionService.deleteActiveSession(user.user_id, sessionId);

    if (success) {
      await bot.sendMessage(
        chatId,
        '✅ **Session Revoked Successfully!**\n\n' +
        'The selected session has been terminated.',
        { parse_mode: 'Markdown' }
      );
    } else {
      await bot.sendMessage(
        chatId,
        '❌ **Failed to Revoke Session**\n\n' +
        'The session may have already expired or been revoked.',
        { parse_mode: 'Markdown' }
      );
    }

    // Show updated sessions
    await handleActiveSessions(query);

  } catch (error) {
    console.error('Error revoking session:', error);
    await bot.sendMessage(
      chatId,
      '❌ Failed to revoke session. Please try again later.'
    );
  }
};



// ============================================
// HANDLER: Back to Menu
// ============================================
bot.on('callback_query', async (query) => {
  if (query.data === 'back_menu') {
    await bot.answerCallbackQuery(query.id).catch(() => {});
    await showMainMenu(query.message);
  }
  
  if (query.data === 'upgrade_pro') {
    await bot.answerCallbackQuery(query.id, { text: '⭐ Upgrade coming soon!' }).catch(() => {});
    await bot.sendMessage(
      query.message.chat.id,
      '⭐ **PRO Upgrade**\n\n' +
      'PRO tier upgrade will be available soon!\n\n' +
      'You\'ll get:\n' +
      '• 50 active wallets (vs 5)\n' +
      '• Priority support\n' +
      '• Early access to new features\n\n' +
      'Stay tuned! 🚀',
      { parse_mode: 'Markdown' }
    );
  }
});

// ============================================
// COMMAND: /sessions
// ============================================
bot.onText(/\/sessions/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const user = await userService.getUserByTelegramId(chatId);

    if (!user) {
      await bot.sendMessage(chatId, '❌ User not found. Please restart with /start');
      return;
    }

    // Fetch and display active sessions
    const sessions = await sessionService.listActiveSessionsForUser(user.user_id);

    if (!sessions || sessions.length === 0) {
      await bot.sendMessage(
        chatId,
        '🔒 **Active Sessions**\n\n' +
        'No active sessions found.\n\n' +
        'Use /start to create a new session.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    let message = '🔒 **Active Sessions**\n\n';
    sessions.forEach((session, index) => {
      const sessionNum = index + 1;
      const deviceInfo = session.device_info || 'Unknown Device';
      const ipAddress = session.ip_address || 'Unknown IP';
      const createdAt = new Date(session.created_at).toLocaleString();

      message += `${sessionNum}. **${deviceInfo}**\n`;
      message += `   📍 ${ipAddress}\n`;
      message += `   🕐 ${createdAt}\n`;
      message += `   ID: \`${session.active_session_id}\`\n\n`;
    });

    message += 'Use `/revoke <session_id>` to revoke a session.';

    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in /sessions:', error);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
});

// ============================================
// COMMAND: /revoke <session_id>
// ============================================
bot.onText(/\/revoke (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const sessionId = match[1].trim();

  try {
    const user = await userService.getUserByTelegramId(chatId);

    if (!user) {
      await bot.sendMessage(chatId, '❌ User not found. Please restart with /start');
      return;
    }

    // Revoke session
    const success = await sessionService.deleteActiveSession(user.user_id, sessionId);

    if (success) {
      await bot.sendMessage(
        chatId,
        '✅ **Session Revoked Successfully!**\n\n' +
        `Session \`${sessionId}\` has been terminated.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await bot.sendMessage(
        chatId,
        '❌ **Failed to Revoke Session**\n\n' +
        `Could not revoke session \`${sessionId}\`.\n` +
        'It may have already expired or been revoked.',
        { parse_mode: 'Markdown' }
      );
    }

  } catch (error) {
    console.error('Error in /revoke:', error);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
  }
});

// ============================================
// COMMAND: /help
// ============================================
bot.onText(/\/help/, async (msg) => {
  await handleHelp({ message: msg, id: 'help_command' });
  await bot.answerCallbackQuery('help_command').catch(() => {});
});

// ============================================
// COMMAND: /enable_2fa
// ============================================
bot.onText(/\/enable_2fa/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    // Generate one-time code for 2FA enable
    const code = await sessionService.generate2FACode(user.user_id, 'enable');

    await bot.sendMessage(chatId,
      `🔐 *2FA Setup Code*\n\n` +
      `Use this code on the web to enable 2FA:\n` +
      `\`${code}\`\n\n` +
      `⚠️ This code expires in 90 seconds.\n` +
      `🔒 Keep your account secure!`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error in /enable_2fa:', error);
    bot.sendMessage(chatId, '❌ Failed to generate 2FA code. Please try again.');
  }
});

// ============================================
// COMMAND: /disable_2fa
// ============================================
bot.onText(/\/disable_2fa/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    // Generate one-time code for 2FA disable
    const code = await sessionService.generate2FACode(user.user_id, 'disable');

    await bot.sendMessage(chatId,
      `🔓 *2FA Disable Code*\n\n` +
      `Use this code on the web to disable 2FA:\n` +
      `\`${code}\`\n\n` +
      `⚠️ This code expires in 90 seconds.\n` +
      `⚠️ Only use if you have access to your authenticator app!`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error in /disable_2fa:', error);
    bot.sendMessage(chatId, '❌ Failed to generate 2FA code. Please try again.');
  }
});

// ============================================
// COMMAND: /recovery_key
// ============================================
bot.onText(/\/recovery_key/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    // Check if 2FA is enabled and recovery key exists
    const recoveryKey = await sessionService.getRecoveryKey(user.user_id);

    if (!recoveryKey) {
      return bot.sendMessage(chatId,
        `❌ **No Recovery Key Found**\n\n` +
        `You need to enable 2FA first to get a recovery key.\n` +
        `Use /enable_2fa to set up 2FA.`
      );
    }

    await bot.sendMessage(chatId,
      `🛡️ *Recovery Key Available*\n\n` +
      `A recovery key exists and is valid for this account.\n\n` +
      `⚠️ *For Security:*\n` +
      `• Recovery keys are only shown once on the web setup step\n` +
      `• They are never displayed in Telegram\n` +
      `• Visit https://yourapp.com/recovery to use it\n` +
      `• Enter your Account ID + recovery key\n\n` +
      `🔒 Keep your recovery key secure and private!`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error in /recovery_key:', error);
    bot.sendMessage(chatId, '❌ Failed to retrieve recovery key. Please try again.');
  }
});

// ============================================
// COMMAND: /2fa_status
// ============================================
bot.onText(/\/2fa_status/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    const status = user.is_2fa_enabled ? '✅ Enabled' : '❌ Disabled';
    const recovery = await sessionService.hasRecoveryKey(user.user_id) ? '✅ Available' : '❌ Not set';

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔓 Enable 2FA', callback_data: 'enable_2fa' },
          { text: '🔒 Disable 2FA', callback_data: 'disable_2fa' }
        ],
        [
          { text: '🛡️ Recovery Key', callback_data: 'recovery_key' },
          { text: '📊 Security Dashboard', callback_data: 'security_dashboard' }
        ],
        [{ text: '❓ Help', callback_data: 'help_security' }]
      ]
    };

    await bot.sendMessage(chatId,
      `🔐 **2FA Status**\n\n` +
      `Status: ${status}\n` +
      `Recovery Key: ${recovery}\n\n` +
      `Quick Actions:`,
      { reply_markup: keyboard }
    );
  } catch (error) {
    console.error('Error in /2fa_status:', error);
    bot.sendMessage(chatId, '❌ Failed to check 2FA status. Please try again.');
  }
});

// ============================================
// COMMAND: /account
// ============================================
bot.onText(/\/account/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔐 Security', callback_data: 'security_dashboard' },
          { text: '📱 Sessions', callback_data: 'view_sessions' }
        ],
        [
          { text: '📊 Activity', callback_data: 'recent_activity' },
          { text: '🚨 Emergency', callback_data: 'emergency_menu' }
        ],
        [{ text: '❓ Help', callback_data: 'help_account' }]
      ]
    };

    const isLocked = await sessionService.isAccountLocked(user.user_id);

    await bot.sendMessage(chatId,
      `👤 *Account Overview*\n\n` +
      `Account ID: \`${user.account_id}\`\n` +
      `Tier: \`${user.user_tier.toUpperCase()}\`\n` +
      `2FA: ${user.is_2fa_enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
      `Status: ${isLocked ? '🔒 Locked' : '✅ Active'}\n` +
      `Registered: ${new Date(user.registered_at).toLocaleDateString()}\n\n` +
      `*Account Actions:*`,
      { reply_markup: keyboard, parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error in /account:', error);
    bot.sendMessage(chatId, '❌ Failed to load account info. Please try again.');
  }
});

// ============================================
// COMMAND: /activity
// ============================================
bot.onText(/\/activity/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    // Get recent activity (last 7 days)
    const activity = await sessionService.getRecentActivity(user.user_id, 7);

    let message = `📊 **Recent Activity** (Last 7 days)\n\n`;

    if (activity.length === 0) {
      message += `No recent activity found.\n\n`;
    } else {
      activity.forEach((item, index) => {
        message += `${index + 1}. **${item.action}**\n`;
        message += `   📅 ${new Date(item.timestamp).toLocaleString()}\n`;
        message += `   📱 ${item.device_info || 'Unknown device'}\n\n`;
      });
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔙 Back to Account', callback_data: 'account_menu' }],
        [{ text: '🚨 Report Suspicious', callback_data: 'report_suspicious' }]
      ]
    };

    await bot.sendMessage(chatId, message, { reply_markup: keyboard, parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error in /activity:', error);
    bot.sendMessage(chatId, '❌ Failed to load activity. Please try again.');
  }
});

// ============================================
// COMMAND: /lockdown
// ============================================
bot.onText(/\/lockdown/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    // Check if 2FA is enabled (required for lockdown)
    if (!user.is_2fa_enabled) {
      return bot.sendMessage(chatId,
        `❌ **2FA Required**\n\n` +
        `Lockdown feature requires 2FA to be enabled.\n` +
        `Enable 2FA first with /enable_2fa`
      );
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🚨 CONFIRM LOCKDOWN', callback_data: 'confirm_lockdown' },
          { text: '❌ Cancel', callback_data: 'cancel_lockdown' }
        ]
      ]
    };

    await bot.sendMessage(chatId,
      `🚨 *EMERGENCY LOCKDOWN*\n\n` +
      `This will:\n` +
      `• Destroy ALL active sessions\n` +
      `• Lock your account until unlocked\n` +
      `• Require 2FA verification to unlock\n\n` +
      `⚠️ *Use only if you suspect unauthorized access!*\n\n` +
      `Are you sure you want to proceed?`,
      { reply_markup: keyboard, parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error in /lockdown:', error);
    bot.sendMessage(chatId, '❌ Failed to initiate lockdown. Please try again.');
  }
});

// ============================================
// COMMAND: /unlock
// ============================================
bot.onText(/\/unlock/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    // Check if account is locked
    const isLocked = await sessionService.isAccountLocked(user.user_id);
    if (!isLocked) {
      return bot.sendMessage(chatId,
        `✅ **Account Not Locked**\n\n` +
        `Your account is not currently locked.\n` +
        `Use /lockdown to lock your account if needed.`
      );
    }

    await bot.sendMessage(chatId,
      `🔓 *Account Unlock*\n\n` +
      `Enter your 6-digit 2FA code to unlock your account:\n\n` +
      `Send your code in format: \`/unlock <code>\`\n` +
      `Example: \`/unlock 123456\``,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error in /unlock:', error);
    bot.sendMessage(chatId, '❌ Failed to check account status. Please try again.');
  }
});

// ============================================
// COMMAND: /unlock <code>
// ============================================
bot.onText(/\/unlock (\d{6})/, async (msg, match) => {
  const chatId = msg.chat.id;
  const totpCode = match[1];

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    const isLocked = await sessionService.isAccountLocked(user.user_id);
    if (!isLocked) {
      return bot.sendMessage(chatId,
        `✅ **Account Not Locked**\n\n` +
        `Your account is already unlocked.\n` +
        `Use /lockdown to secure your account if needed.`
      );
    }

    await sessionService.unlockAccount(user.user_id, totpCode);

    await bot.sendMessage(chatId,
      `✅ *Account Unlocked!*\n\n` +
      `Your account has been successfully unlocked.\n` +
      `You can now create new sessions normally.\n\n` +
      `Stay safe! 🔒`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error in /unlock code:', error);
    const errorMsg = error.message === 'Invalid 2FA code' ?
      '❌ Invalid 2FA code. Please try again.' :
      '❌ Failed to unlock account. Please try again.';
    bot.sendMessage(chatId, errorMsg);
  }
});

// ============================================
// HANDLER: Enable 2FA
// ============================================
const handleEnable2FA = async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id, { text: '🔓 Enabling 2FA...' });

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    const code = await sessionService.generate2FACode(user.user_id, 'enable');

    await bot.sendMessage(chatId,
      `🔐 *2FA Setup Code*\n\n` +
      `Use this code on the web to enable 2FA:\n` +
      `\`${code}\`\n\n` +
      `⚠️ This code expires in 90 seconds.\n` +
      `🔒 Keep your account secure!`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error in handleEnable2FA:', error);
    bot.sendMessage(chatId, '❌ Failed to generate 2FA code. Please try again.');
  }
};

// ============================================
// HANDLER: Disable 2FA
// ============================================
const handleDisable2FA = async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id, { text: '🔒 Disabling 2FA...' });

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    const code = await sessionService.generate2FACode(user.user_id, 'disable');

    await bot.sendMessage(chatId,
      `🔓 *2FA Disable Code*\n\n` +
      `Use this code on the web to disable 2FA:\n` +
      `\`${code}\`\n\n` +
      `⚠️ This code expires in 90 seconds.\n` +
      `⚠️ Only use if you have access to your authenticator app!`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error in handleDisable2FA:', error);
    bot.sendMessage(chatId, '❌ Failed to generate 2FA code. Please try again.');
  }
};

// ============================================
// COMMAND: /recovery_key
// ============================================
const handleRecoveryKey = async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id, { text: '🛡️ Getting recovery key...' });

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    // Check if 2FA is enabled and recovery key exists
    if (!user.is_2fa_enabled) {
      return bot.sendMessage(chatId,
        `❌ **2FA Not Enabled**\n\n` +
        `Recovery keys are only available when 2FA is active.\n` +
        `Enable 2FA first with /enable_2fa to get a recovery key.`
      );
    }

    const hasValidKey = await sessionService.hasRecoveryKey(user.user_id);

    if (!hasValidKey) {
      return bot.sendMessage(chatId,
        `❌ **No Valid Recovery Key**\n\n` +
        `Your recovery key may have been used or invalidated.\n` +
        `Re-enable 2FA to generate a new recovery key.`
      );
    }

    await bot.sendMessage(chatId,
      `🛡️ **Recovery Key Available**\n\n` +
      `A recovery key exists and is valid for this account.\n\n` +
      `⚠️ **For Security:**\n` +
      `• Recovery keys are only shown once on the web setup step\n` +
      `• They are never displayed in Telegram\n` +
      `• Visit https://yourapp.com/recovery to use it\n` +
      `• Enter your Account ID + recovery key\n\n` +
      `🔒 Keep your recovery key secure and private!`
    );
  } catch (error) {
    console.error('Error in handleRecoveryKey:', error);
    bot.sendMessage(chatId, '❌ Failed to check recovery key. Please try again.');
  }
};

// ============================================
// HANDLER: Security Dashboard
// ============================================
const handleSecurityDashboard = async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id, { text: '🔐 Loading security dashboard...' });

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    const status = user.is_2fa_enabled ? '✅ Enabled' : '❌ Disabled';
    const recovery = await sessionService.hasRecoveryKey(user.user_id) ? '✅ Available' : '❌ Not set';
    const sessions = await sessionService.getActiveSessionCount(user.user_id);
    const isLocked = await sessionService.isAccountLocked(user.user_id);

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔓 Enable 2FA', callback_data: 'enable_2fa' },
          { text: '🔒 Disable 2FA', callback_data: 'disable_2fa' }
        ],
        [
          { text: '🛡️ Recovery Key', callback_data: 'recovery_key' },
          { text: '📱 Sessions', callback_data: 'view_sessions' }
        ],
        [
          { text: '📊 Activity', callback_data: 'recent_activity' },
          { text: '🚨 Emergency', callback_data: 'emergency_menu' }
        ],
        [{ text: '🔙 Back', callback_data: 'account_menu' }]
      ]
    };

    await bot.sendMessage(chatId,
      `🔐 *Security Dashboard*\n\n` +
      `2FA Status: ${status}\n` +
      `Recovery Key: ${recovery}\n` +
      `Active Sessions: ${sessions}\n` +
      `Account Status: ${isLocked ? '🔒 Locked' : '✅ Active'}\n\n` +
      `*Security Actions:*`,
      { reply_markup: keyboard, parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error in handleSecurityDashboard:', error);
    bot.sendMessage(chatId, '❌ Failed to load security dashboard. Please try again.');
  }
};

// ============================================
// HANDLER: My Account
// ============================================
const handleMyAccount = async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id, { text: '👤 Loading account...' });

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔐 Security', callback_data: 'security_dashboard' },
          { text: '📱 Sessions', callback_data: 'view_sessions' }
        ],
        [
          { text: '📊 Activity', callback_data: 'recent_activity' },
          { text: '🚨 Emergency', callback_data: 'emergency_menu' }
        ],
        [{ text: '❓ Help', callback_data: 'help_account' }]
      ]
    };

    const isLocked = await sessionService.isAccountLocked(user.user_id);

    await bot.sendMessage(chatId,
      `👤 *Account Overview*\n\n` +
      `Account ID: \`${user.account_id}\`\n` +
      `Tier: \`${user.user_tier.toUpperCase()}\`\n` +
      `2FA: ${user.is_2fa_enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
      `Status: ${isLocked ? '🔒 Locked' : '✅ Active'}\n` +
      `Registered: ${new Date(user.registered_at).toLocaleDateString()}\n\n` +
      `*Account Actions:*`,
      { reply_markup: keyboard, parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error in handleMyAccount:', error);
    bot.sendMessage(chatId, '❌ Failed to load account info. Please try again.');
  }
};

// ============================================
// HANDLER: Recent Activity
// ============================================
const handleRecentActivity = async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id, { text: '📊 Loading activity...' });

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    const activity = await sessionService.getRecentActivity(user.user_id, 7);

    let message = `📊 *Recent Activity* (Last 7 days)\n\n`;

    if (activity.length === 0) {
      message += `No recent activity found.\n\n`;
    } else {
      activity.forEach((item, index) => {
        message += `${index + 1}. *${item.action}*\n`;
        message += `   📅 ${new Date(item.timestamp).toLocaleString()}\n`;
        message += `   📱 ${item.device_info || 'Unknown device'}\n\n`;
      });
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔙 Back to Account', callback_data: 'account_menu' }],
        [{ text: '🚨 Report Suspicious', callback_data: 'report_suspicious' }]
      ]
    };

    await bot.sendMessage(chatId, message, { reply_markup: keyboard, parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error in handleRecentActivity:', error);
    bot.sendMessage(chatId, '❌ Failed to load activity. Please try again.');
  }
};

// ============================================
// HANDLER: Emergency Menu
// ============================================
const handleEmergencyMenu = async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id, { text: '🚨 Emergency options...' });

  const keyboard = {
    inline_keyboard: [
      [{ text: '🚨 ACCOUNT LOCKDOWN', callback_data: 'confirm_lockdown' }],
      [{ text: '🛡️ Recovery Key', callback_data: 'recovery_key' }],
      [{ text: '📞 Support', callback_data: 'contact_support' }],
      [{ text: '🔙 Back', callback_data: 'account_menu' }]
    ]
  };

  await bot.sendMessage(chatId,
    `🚨 *Emergency Actions*\n\n` +
    `⚠️ *Use these only if you suspect unauthorized access!*\n\n` +
    `Available actions:`,
    { reply_markup: keyboard, parse_mode: 'Markdown' }
  );
};

// ============================================
// HANDLER: Confirm Lockdown
// ============================================
const handleConfirmLockdown = async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id, { text: '🔒 Initiating lockdown...' });

  try {
    const user = await userService.getUserByTelegramId(chatId);
    if (!user) {
      return bot.sendMessage(chatId, '❌ Please register first with /start');
    }

    await sessionService.initiateLockdown(user.user_id);

    await bot.sendMessage(chatId,
      `🔒 *ACCOUNT LOCKDOWN ACTIVATED*\n\n` +
      `✅ All sessions destroyed\n` +
      `✅ Account locked\n\n` +
      `To unlock your account:\n` +
      `Send: \`/unlock <your_2fa_code>\`\n` +
      `Example: \`/unlock 123456\`\n\n` +
      `⚠️ Account will remain locked until you provide valid 2FA code.`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error in handleConfirmLockdown:', error);
    bot.sendMessage(chatId, '❌ Failed to initiate lockdown. Please try again.');
  }
};

// ============================================
// HANDLER: Cancel Lockdown
// ============================================
const handleCancelLockdown = async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id, { text: '❌ Lockdown cancelled' });

  await bot.sendMessage(chatId, '❌ Lockdown cancelled. No action taken.');
};

// ============================================
// HANDLER: Help Security
// ============================================
const handleHelpSecurity = async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id, { text: 'ℹ️ Security help' });

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔐 2FA Setup', callback_data: 'help_2fa' }],
      [{ text: '🛡️ Recovery', callback_data: 'help_recovery' }],
      [{ text: '🚨 Emergency', callback_data: 'help_emergency' }],
      [{ text: '🔙 Back', callback_data: 'security_dashboard' }]
    ]
  };

  await bot.sendMessage(chatId,
    `ℹ️ *Security Help*\n\n` +
    `*2FA (Two-Factor Authentication):*\n` +
    `• Adds extra security layer\n` +
    `• Requires authenticator app\n` +
    `• Protects against unauthorized access\n\n` +
    `*Recovery Key:*\n` +
    `• Emergency 2FA disable\n` +
    `• One-time use only\n` +
    `• Store securely offline\n\n` +
    `*Emergency Actions:*\n` +
    `• Lockdown: Destroys all sessions\n` +
    `• Recovery: Use backup key\n\n` +
    `Choose a topic for detailed help:`,
    { reply_markup: keyboard, parse_mode: 'Markdown' }
  );
};

// ============================================
// HANDLER: Help Account
// ============================================
const handleHelpAccount = async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id, { text: 'ℹ️ Account help' });

  const keyboard = {
    inline_keyboard: [
      [{ text: '👤 Account Overview', callback_data: 'help_account_overview' }],
      [{ text: '📊 Activity Logs', callback_data: 'help_activity' }],
      [{ text: '🔐 Security Settings', callback_data: 'help_security' }],
      [{ text: '🔙 Back', callback_data: 'account_menu' }]
    ]
  };

  await bot.sendMessage(chatId,
    `ℹ️ *Account Management Help*\n\n` +
    `*Account Overview:*\n` +
    `• View your account details\n` +
    `• Check tier and status\n` +
    `• Access all account features\n\n` +
    `*Activity Logs:*\n` +
    `• Recent login history\n` +
    `• Device information\n` +
    `• Security events\n\n` +
    `*Security Settings:*\n` +
    `• 2FA management\n` +
    `• Session control\n` +
    `• Emergency actions\n\n` +
    `Choose a topic for detailed help:`,
    { reply_markup: keyboard, parse_mode: 'Markdown' }
  );
};

// ============================================
// HANDLER: Account Menu
// ============================================
const handleAccountMenu = async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id, { text: '👤 Account menu' });

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🔐 Security', callback_data: 'security_dashboard' },
        { text: '📱 Sessions', callback_data: 'view_sessions' }
      ],
      [
        { text: '📊 Activity', callback_data: 'recent_activity' },
        { text: '🚨 Emergency', callback_data: 'emergency_menu' }
      ],
      [{ text: '❓ Help', callback_data: 'help_account' }]
    ]
  };

  await bot.sendMessage(chatId,
    `👤 *Account Menu*\n\nChoose an option:`,
    { reply_markup: keyboard, parse_mode: 'Markdown' }
  );
};

// ============================================
// HANDLER: Report Suspicious
// ============================================
const handleReportSuspicious = async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id, { text: '🚨 Reporting suspicious activity...' });

  await bot.sendMessage(chatId,
    `🚨 **Suspicious Activity Reported**\n\n` +
    `Thank you for reporting. Our security team will investigate.\n\n` +
    `For immediate action:\n` +
    `• Use /lockdown to secure your account\n` +
    `• Change your passwords\n` +
    `• Contact support if needed\n\n` +
    `Stay safe! 🔒`
  );
};

// ============================================
// HANDLER: Help Sessions
// ============================================
const handleHelpSessions = async (query) => {
  const chatId = query.message.chat.id;
  await bot.answerCallbackQuery(query.id, { text: '📱 Session help' });

  const keyboard = {
    inline_keyboard: [
      [{ text: '📱 View Sessions', callback_data: 'view_sessions' }],
      [{ text: '🔙 Back to Help', callback_data: 'help' }]
    ]
  };

  await bot.sendMessage(chatId,
    `📱 **Session Management Help**\n\n` +
    `*Viewing Sessions:*\n` +
    `• /sessions - See all active sessions\n` +
    `• Shows device and login time\n` +
    `• No location data for privacy\n\n` +
    `*Revoking Sessions:*\n` +
    `• /revoke <session_id> - End specific session\n` +
    `• Use when you suspect unauthorized access\n` +
    `• Immediate logout on that device\n\n` +
    `*Security Tips:*\n` +
    `• Regularly check active sessions\n` +
    `• Revoke suspicious logins immediately\n` +
    `• Use /lockdown for emergency`,
    { reply_markup: keyboard }
  );
};

// ============================================
// PERIODIC CLEANUP (every hour)
// ============================================
setInterval(async () => {
  try {
    await sessionService.cleanupExpiredSessions();
  } catch (error) {
    console.error('Error in cleanup:', error);
  }
}, 60 * 60 * 1000); // 1 hour

// ============================================
// ERROR HANDLING
// ============================================
bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error.message);
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down bot...');
  bot.stopPolling();
  process.exit(0);
});

console.log('✅ Bot is running! Send /start to begin.');

module.exports = bot;
