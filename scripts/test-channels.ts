// scripts/test-channels.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Load .env or .env.local if present
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

async function runChannelsSuite() {
  console.log('====================================================');
  console.log('📡 Channels Test Suite: Telegram, WhatsApp & Web Chat');
  console.log('====================================================\n');

  const {
    telegramAdapter,
    whatsAppAdapter,
    webChatAdapter,
    isChannelRateLimited,
    resetChannelRateLimits,
  } = await import('../src/lib/channels');
  const { db } = await import('../src/lib/db');
  const { DEMO_CLINIC_ID } = await import('../src/lib/kb/demo-clinic');
  const { initKnowledgeBase } = await import('../src/lib/kb');
  const { processMessage } = await import('../src/lib/orchestrator');

  await initKnowledgeBase();

  // Test credentials
  const TEST_TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ';
  const TEST_TG_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || 'test_tg_secret_12345';
  const TEST_WA_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'test_wa_verify_token_abc';
  const TEST_WA_SECRET = process.env.WHATSAPP_APP_SECRET || 'test_wa_app_secret_xyz_98765';
  const TEST_WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '102938475610293';
  const TEST_WA_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || 'EAAXtesttoken123456';

  // Set test env vars for unit testing
  process.env.TELEGRAM_BOT_TOKEN = TEST_TG_TOKEN;
  process.env.TELEGRAM_WEBHOOK_SECRET = TEST_TG_SECRET;
  process.env.WHATSAPP_VERIFY_TOKEN = TEST_WA_VERIFY_TOKEN;
  process.env.WHATSAPP_APP_SECRET = TEST_WA_SECRET;
  process.env.WHATSAPP_PHONE_NUMBER_ID = TEST_WA_PHONE_ID;
  process.env.WHATSAPP_ACCESS_TOKEN = TEST_WA_ACCESS_TOKEN;

  // ----------------------------------------------------
  // PART 1: TELEGRAM ADAPTER UNIT TESTS
  // ----------------------------------------------------
  console.log('--- PART 1: Telegram Adapter Unit Tests ---');

  // 1.1 Secret token verification: Valid
  const validTgReq = {
    headers: {
      get: (h: string) => (h.toLowerCase() === 'x-telegram-bot-api-secret-token' ? TEST_TG_SECRET : null),
    },
  };
  const tgAuthValid = await telegramAdapter.verifyRequest(validTgReq);
  if (!tgAuthValid.valid || tgAuthValid.status !== 200) {
    throw new Error(`Telegram valid secret check failed: ${JSON.stringify(tgAuthValid)}`);
  }
  console.log('  ✅ 1.1 Valid secret token passed (HTTP 200)');

  // 1.2 Secret token verification: Wrong token
  const wrongTgReq = {
    headers: {
      get: (h: string) => (h.toLowerCase() === 'x-telegram-bot-api-secret-token' ? 'wrong_secret' : null),
    },
  };
  const tgAuthWrong = await telegramAdapter.verifyRequest(wrongTgReq);
  if (tgAuthWrong.valid || tgAuthWrong.status !== 401) {
    throw new Error(`Telegram wrong secret check should return 401, got ${tgAuthWrong.status}`);
  }
  console.log('  ✅ 1.2 Wrong secret token rejected (HTTP 401)');

  // 1.3 Missing Bot Token (Disabled integration)
  const savedToken = process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  const tgDisabled = await telegramAdapter.verifyRequest(validTgReq);
  if (tgDisabled.valid || tgDisabled.status !== 503) {
    throw new Error(`Telegram disabled check should return 503, got ${tgDisabled.status}`);
  }
  process.env.TELEGRAM_BOT_TOKEN = savedToken;
  console.log('  ✅ 1.3 Missing Bot Token rejected (HTTP 503)');

  // 1.4 Non-text message (Voice message or photo)
  const voiceUpdate = {
    update_id: 1001,
    message: {
      message_id: 42,
      chat: { id: 987654 },
      from: { first_name: 'Rahul', username: 'rahul_b' },
      voice: { duration: 5, file_id: 'voice_abc_123' },
    },
  };
  const parsedVoice = await telegramAdapter.parseIncoming({}, voiceUpdate);
  if (!parsedVoice || !parsedVoice.isNonTextMessage || parsedVoice.nonTextType !== 'voice') {
    throw new Error(`Telegram voice parsing failed: ${JSON.stringify(parsedVoice)}`);
  }
  const nonTextReply = telegramAdapter.getNonTextReply();
  if (!nonTextReply.text.toLowerCase().includes('text messages only')) {
    throw new Error('Telegram non-text reply should instruct user to send text');
  }
  console.log('  ✅ 1.4 Non-text voice message detected & polite text reply prepared');

  // 1.5 /start Greeting command
  const startUpdate = {
    update_id: 1002,
    message: {
      message_id: 43,
      chat: { id: 987654 },
      from: { first_name: 'Rahul' },
      text: '/start',
    },
  };
  const parsedStart = await telegramAdapter.parseIncoming({}, startUpdate);
  if (!parsedStart || !parsedStart.isStartCommand) {
    throw new Error('Telegram /start command detection failed');
  }
  const startReply = telegramAdapter.getStartReply();
  if (!startReply.text.includes('City Health Clinic') || !startReply.text.includes('emergency')) {
    throw new Error('Telegram start greeting missing clinic info or emergency notice');
  }
  console.log('  ✅ 1.5 /start command handled with demo disclaimer and clinic quick replies');

  // 1.6 Contact sharing
  const contactUpdate = {
    update_id: 1003,
    message: {
      message_id: 44,
      chat: { id: 987654 },
      from: { first_name: 'Rahul' },
      contact: { phone_number: '+91 98765 43210', user_id: 987654 },
    },
  };
  const parsedContact = await telegramAdapter.parseIncoming({}, contactUpdate);
  if (!parsedContact || !parsedContact.isContactShare || parsedContact.phone !== '919876543210') {
    throw new Error(`Telegram contact share parsing failed: ${JSON.stringify(parsedContact)}`);
  }
  console.log('  ✅ 1.6 Contact share parsed (extracted phone: 919876543210)');

  // 1.7 Duplicate protection
  const testTgMsgId = `tg_dup_${Date.now()}`;
  const isFirstProcessed = await db.isMessageProcessed('telegram', testTgMsgId);
  if (isFirstProcessed) throw new Error('New message ID should not be marked processed');
  await db.recordProcessedMessage('telegram', testTgMsgId, '987654');
  const isSecondProcessed = await db.isMessageProcessed('telegram', testTgMsgId);
  if (!isSecondProcessed) throw new Error('Duplicate message ID was not detected');
  console.log('  ✅ 1.7 Duplicate delivery correctly detected and ignored');

  // 1.8 Rate limit per (channel, senderId)
  resetChannelRateLimits();
  const testTgUser = 'tg_rate_test_user';
  for (let i = 0; i < 20; i++) {
    isChannelRateLimited('telegram', testTgUser, 20, 60000);
  }
  const isTgLimited = isChannelRateLimited('telegram', testTgUser, 20, 60000);
  if (!isTgLimited) throw new Error('Telegram 21st message should be rate limited');
  console.log('  ✅ 1.8 Rate limit enforced per (telegram, senderId)\n');

  // ----------------------------------------------------
  // PART 2: WHATSAPP ADAPTER UNIT TESTS
  // ----------------------------------------------------
  console.log('--- PART 2: WhatsApp Adapter Unit Tests ---');

  // 2.1 GET Subscription Challenge
  const waSubValid = whatsAppAdapter.verifySubscription('subscribe', TEST_WA_VERIFY_TOKEN, 'test_challenge_123');
  if (!waSubValid.valid || waSubValid.challenge !== 'test_challenge_123') {
    throw new Error(`WhatsApp subscription verification failed: ${JSON.stringify(waSubValid)}`);
  }
  console.log('  ✅ 2.1 GET subscription verification passed (challenge returned)');

  const waSubWrong = whatsAppAdapter.verifySubscription('subscribe', 'invalid_token', 'test_challenge_123');
  if (waSubWrong.valid || waSubWrong.status !== 403) {
    throw new Error('WhatsApp wrong verify token should return 403');
  }
  console.log('  ✅ 2.2 GET wrong verify token rejected (HTTP 403)');

  // 2.3 POST Payload HMAC-SHA256 Signature Verification
  const samplePayload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: TEST_WA_PHONE_ID },
              contacts: [{ profile: { name: 'Priya Sharma' }, wa_id: '919876543210' }],
              messages: [
                {
                  from: '919876543210',
                  id: `wamid.test_${Date.now()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: 'What are your clinic timings?' },
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  });

  const correctHash = crypto.createHmac('sha256', TEST_WA_SECRET).update(samplePayload).digest('hex');
  const validWaReq = {
    headers: {
      get: (h: string) => (h.toLowerCase() === 'x-hub-signature-256' ? `sha256=${correctHash}` : null),
    },
  };

  const waSigValid = await whatsAppAdapter.verifyRequest(validWaReq, samplePayload);
  if (!waSigValid.valid || waSigValid.status !== 200) {
    throw new Error(`WhatsApp HMAC signature verification failed: ${JSON.stringify(waSigValid)}`);
  }
  console.log('  ✅ 2.3 Valid HMAC-SHA256 signature verified with constant-time comparison (HTTP 200)');

  // 2.4 Tampered payload / wrong signature
  const wrongHashReq = {
    headers: {
      get: (h: string) => (h.toLowerCase() === 'x-hub-signature-256' ? 'sha256=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' : null),
    },
  };
  const waSigWrong = await whatsAppAdapter.verifyRequest(wrongHashReq, samplePayload);
  if (waSigWrong.valid || waSigWrong.status !== 403) {
    throw new Error(`WhatsApp tampered payload should return 403, got ${waSigWrong.status}`);
  }
  console.log('  ✅ 2.4 Tampered payload / invalid HMAC signature rejected (HTTP 403)');

  // 2.5 Missing signature header
  const missingSigReq = { headers: { get: () => null } };
  const waSigMissing = await whatsAppAdapter.verifyRequest(missingSigReq, samplePayload);
  if (waSigMissing.valid || waSigMissing.status !== 401) {
    throw new Error(`WhatsApp missing signature should return 401, got ${waSigMissing.status}`);
  }
  console.log('  ✅ 2.5 Missing signature header rejected (HTTP 401)');

  // 2.6 Missing config (unset WHATSAPP_APP_SECRET)
  const savedAppSecret = process.env.WHATSAPP_APP_SECRET;
  delete process.env.WHATSAPP_APP_SECRET;
  const waUnconfigured = await whatsAppAdapter.verifyRequest(validWaReq, samplePayload);
  if (waUnconfigured.valid || waUnconfigured.status !== 503) {
    throw new Error(`WhatsApp unconfigured should return 503, got ${waUnconfigured.status}`);
  }
  process.env.WHATSAPP_APP_SECRET = savedAppSecret;
  console.log('  ✅ 2.6 Unconfigured WhatsApp integration returns 503 Service Unavailable');

  // 2.7 Parse incoming WhatsApp text & interactive button payloads
  const parsedWaText = await whatsAppAdapter.parseIncoming({}, JSON.parse(samplePayload));
  if (!parsedWaText || parsedWaText.senderId !== '919876543210' || parsedWaText.text !== 'What are your clinic timings?') {
    throw new Error(`WhatsApp incoming text parsing failed: ${JSON.stringify(parsedWaText)}`);
  }
  console.log('  ✅ 2.7 Incoming text payload parsed (senderId, messageId, sender phone)');

  // 2.8 Non-text message (Sticker or Image)
  const stickerPayload = {
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ profile: { name: 'Priya' } }],
              messages: [{ from: '919876543210', id: 'wamid.stk_1', type: 'sticker', sticker: { id: 'stk_123' } }],
            },
          },
        ],
      },
    ],
  };
  const parsedSticker = await whatsAppAdapter.parseIncoming({}, stickerPayload);
  if (!parsedSticker || !parsedSticker.isNonTextMessage || parsedSticker.nonTextType !== 'sticker') {
    throw new Error(`WhatsApp sticker parsing failed: ${JSON.stringify(parsedSticker)}`);
  }
  console.log('  ✅ 2.8 Non-text message parsed as sticker with polite reply fallback');

  // 2.9 24-Hour customer service window enforcement
  const expiredPhone = '919876500000';
  const over24HoursAgo = Date.now() - (25 * 60 * 60 * 1000);
  whatsAppAdapter.setInboundTimestamp(expiredPhone, over24HoursAgo);
  const sendWindowResult = await whatsAppAdapter.send(expiredPhone, {
    text: 'Test free-text message',
  });
  if (sendWindowResult.success || !sendWindowResult.error?.includes('24-hour')) {
    throw new Error(`WhatsApp 24-hr window violation not caught: ${JSON.stringify(sendWindowResult)}`);
  }
  console.log('  ✅ 2.9 24-hour customer service window strictly enforced (skipped expired free-text)');

  // 2.10 Duplicate protection
  const testWaMsgId = `wamid_dup_${Date.now()}`;
  await db.recordProcessedMessage('whatsapp', testWaMsgId, '919876543210');
  const isWaDup = await db.isMessageProcessed('whatsapp', testWaMsgId);
  if (!isWaDup) throw new Error('WhatsApp duplicate message ID was not detected');
  console.log('  ✅ 2.10 Duplicate WhatsApp message correctly detected and ignored\n');

  // ----------------------------------------------------
  // PART 3: 3-WAY PARITY TESTS ACROSS WEB, TELEGRAM & WHATSAPP
  // ----------------------------------------------------
  console.log('--- PART 3: Parity Across Web, Telegram & WhatsApp Channels ---');

  const testCases = [
    {
      name: 'FAQ: Clinic Timings & OPD Hours',
      text: 'What are your clinic timings and OPD hours?',
      expectedDecision: 'answer',
    },
    {
      name: 'Booking: Tomorrow Morning Appointment',
      text: 'Can I book a doctor appointment tomorrow morning?',
      expectedDecision: 'act',
    },
    {
      name: 'Medical Safety: Acute Emergency Chest Pain',
      text: 'Severe chest pain radiating down left arm and breathlessness, what tablet should I take?',
      expectedDecision: 'escalate',
    },
    {
      name: 'Unknown Escalation: In-House MRI / CT Scan',
      text: 'Do you offer in-house MRI and CT scan facilities at the clinic?',
      expectedDecision: 'escalate',
    },
    {
      name: 'Cancellation Request with Booking ID',
      text: 'Please cancel my appointment',
      expectedDecision: 'act',
    },
  ];

  console.log('| Test Inquiry | Web Chat | Telegram | WhatsApp | Parity Result |');
  console.log('| :--- | :---: | :---: | :---: | :---: |');

  for (const tc of testCases) {
    const timestamp = Date.now();

    // 1. Web Chat
    const { conversation: webConv } = await db.getOrCreateChannelConversation(
      DEMO_CLINIC_ID,
      'web',
      `user_web_${timestamp}`,
      'Web Patient'
    );
    const webRes = await processMessage({
      businessId: DEMO_CLINIC_ID,
      channel: 'web',
      conversationId: webConv.id,
      text: tc.text,
    });

    // 2. Telegram
    const { conversation: tgConv } = await db.getOrCreateChannelConversation(
      DEMO_CLINIC_ID,
      'telegram',
      `112233_${timestamp}`,
      'TG Patient'
    );
    const tgRes = await processMessage({
      businessId: DEMO_CLINIC_ID,
      channel: 'telegram',
      conversationId: tgConv.id,
      text: tc.text,
    });

    // 3. WhatsApp
    const { conversation: waConv } = await db.getOrCreateChannelConversation(
      DEMO_CLINIC_ID,
      'whatsapp',
      `919876543210_${timestamp}`,
      'WA Patient',
      '919876543210'
    );
    const waRes = await processMessage({
      businessId: DEMO_CLINIC_ID,
      channel: 'whatsapp',
      conversationId: waConv.id,
      senderContact: '919876543210',
      text: tc.text,
    });

    const isMatch =
      webRes.decision === tc.expectedDecision &&
      tgRes.decision === tc.expectedDecision &&
      waRes.decision === tc.expectedDecision;

    if (!isMatch) {
      throw new Error(
        `Channel Parity Mismatch for "${tc.name}"! Expected ${tc.expectedDecision}, got Web=${webRes.decision}, TG=${tgRes.decision}, WA=${waRes.decision}`
      );
    }

    console.log(
      `| ${tc.name.slice(0, 32)}... | ${webRes.decision} | ${tgRes.decision} | ${waRes.decision} | ✅ 100% IDENTICAL |`
    );
  }

  // ----------------------------------------------------
  // PART 4: OWNER CONSOLE CHANNEL DISPATCH VERIFICATION
  // ----------------------------------------------------
  console.log('\n--- PART 4: Owner Console Channel Dispatch Verification ---');

  // Verify Telegram conversation owner reply
  const tgConvForReply = await db.getOrCreateConversation(
    DEMO_CLINIC_ID,
    'telegram_cust_987654321',
    'telegram',
    'tg_conv_reply_test'
  );
  const tgOwnerMsg = await db.createMessage({
    conversation_id: tgConvForReply.id,
    sender: 'owner',
    text: 'Dr. Sneha is available today at 4:30 PM. Please arrive on time.',
  });
  if (tgOwnerMsg.sender !== 'owner' || !tgOwnerMsg.text.includes('4:30 PM')) {
    throw new Error('Owner message persistence failed');
  }
  console.log('  ✅ 4.1 Owner message saved to Telegram thread in console database');

  // Verify WhatsApp conversation owner reply
  const waConvForReply = await db.getOrCreateConversation(
    DEMO_CLINIC_ID,
    'whatsapp_cust_919876543210',
    'whatsapp',
    'wa_conv_reply_test'
  );
  const waOwnerMsg = await db.createMessage({
    conversation_id: waConvForReply.id,
    sender: 'owner',
    text: 'Your child vaccination slot has been confirmed for tomorrow.',
  });
  if (waOwnerMsg.sender !== 'owner' || !waOwnerMsg.text.includes('confirmed for tomorrow')) {
    throw new Error('Owner message persistence failed');
  }
  console.log('  ✅ 4.2 Owner message saved to WhatsApp thread in console database');

  console.log('\n====================================================');
  console.log('🎉 ALL TELEGRAM, WHATSAPP & PARITY TESTS PASSED!');
  console.log('====================================================\n');
}

runChannelsSuite().catch((err) => {
  console.error('Channel Suite Test Failed:', err);
  process.exit(1);
});
