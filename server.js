const express = require('express');
const cors = require('cors');
const path = require('path');
const { 
  GlideClient, 
  LogLevel,
  UseCase,
  ErrorCode
} = require('@glideidentity/glide-be-sdk-node');
const dotenv = require('dotenv');
const { storeStatusUrl, getStatusUrl, extractStatusUrl } = require('./session-store');

// Load environment variables
dotenv.config();

// Default T-Mobile US PLMN (used when client doesn't provide one)
const DEFAULT_PLMN = { mcc: '310', mnc: '260' };

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Glide client with OAuth2 credentials
const glide = new GlideClient({
  clientId: process.env.GLIDE_CLIENT_ID,
  clientSecret: process.env.GLIDE_CLIENT_SECRET,
  logLevel: process.env.GLIDE_DEBUG === 'true' ? LogLevel.DEBUG : LogLevel.INFO,
});

// Middleware
app.use(cors()); // Allow all origins for local development
app.use(express.json());

// Serve static files from public directory
app.use(express.static('public'));

// Serve the web SDK from node_modules
app.use('/sdk', express.static(path.join(__dirname, 'node_modules/@glideidentity/glide-fe-sdk-web/dist/browser')));

/**
 * Step 1: Prepare Authentication
 * Initializes the authentication session with Glide API
 */
app.post('/api/phone-auth/prepare', async (req, res) => {
  try {
    // Validate the request
    if (!req.body.use_case) {
      return res.status(400).json({
        error: ErrorCode.MISSING_REQUIRED_FIELD,
        message: 'use_case is required',
        status: 400
      });
    }

    const prepareRequest = { ...req.body };
    
    // Apply default PLMN for GetPhoneNumber if not provided
    const isGetPhoneNumber = prepareRequest.use_case === UseCase.GET_PHONE_NUMBER || prepareRequest.use_case === 'GetPhoneNumber';
    if (isGetPhoneNumber && !prepareRequest.plmn) {
      prepareRequest.plmn = DEFAULT_PLMN;
      console.log('📶 PLMN not provided in request, defaulting to T-Mobile US (MCC: 310, MNC: 260)');
    }

    console.log('📱 Prepare request:', { use_case: prepareRequest.use_case });
    
    // Prepare the authentication request
    const response = await glide.magicalAuth.prepare(prepareRequest);
    
    console.log('✅ Prepare success:', { 
      strategy: response.authentication_strategy,
      session_key: response.session?.session_key 
    });
    
    // Store status_url for the polling proxy endpoint
    const statusUrl = extractStatusUrl(response);
    if (statusUrl && response.session?.session_key) {
      storeStatusUrl(response.session.session_key, statusUrl);
    }
    
    res.json(response);
  } catch (error) {
    console.error('❌ Prepare error:', error);
    
    const status = error.status || 500;
    res.status(status).json({
      error: error.code || ErrorCode.INTERNAL_SERVER_ERROR,
      message: error.message || 'An unexpected error occurred',
      status,
      ...(error.details && { details: error.details })
    });
  }
});

/**
 * Step 3: Process Verification
 * Processes the credential received from browser (Step 2 happens in browser via SDK)
 */
app.post('/api/phone-auth/process', async (req, res) => {
  try {
    const { use_case, session, credential } = req.body;
    
    // Validate the request
    if (!use_case || !session || !credential) {
      return res.status(400).json({
        error: ErrorCode.MISSING_REQUIRED_FIELD,
        message: 'use_case, session, and credential are required',
        status: 400
      });
    }
    
    console.log('🔐 Process request:', { use_case });
    
    let result;
    
    // Call the appropriate method based on use_case
    if (use_case === UseCase.GET_PHONE_NUMBER || use_case === 'GetPhoneNumber') {
      result = await glide.magicalAuth.getPhoneNumber({
        session: session,
        credential: credential
      });
      console.log('✅ GetPhoneNumber success:', { 
        phone_number: result.phone_number ? '***' + result.phone_number.slice(-4) : undefined 
      });
    } else if (use_case === UseCase.VERIFY_PHONE_NUMBER || use_case === 'VerifyPhoneNumber') {
      result = await glide.magicalAuth.verifyPhoneNumber({
        session: session,
        credential: credential
      });
      console.log('✅ VerifyPhoneNumber success:', { verified: result.verified });
    } else {
      return res.status(400).json({
        error: ErrorCode.INVALID_USE_CASE,
        message: `Invalid use_case. Must be '${UseCase.GET_PHONE_NUMBER}' or '${UseCase.VERIFY_PHONE_NUMBER}'`,
        status: 400
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error('❌ Process error:', error);
    
    const status = error.status || 500;
    res.status(status).json({
      error: error.code || ErrorCode.INTERNAL_SERVER_ERROR,
      message: error.message || 'An unexpected error occurred',
      status,
      ...(error.details && { details: error.details })
    });
  }
});

/**
 * Reports that an authentication flow was started.
 * This call can be made asynchronously without blocking the flow.
 */
app.post('/api/phone-auth/invoke', async (req, res) => {
  const sessionId = req.body?.session_id;
  
  if (!sessionId) {
    console.warn('⚠️ [Invoke] No session_id provided');
    return res.json({ success: false, reason: 'missing_session_id' });
  }
  
  const sessionPreview = sessionId.length > 8 ? sessionId.substring(0, 8) + '...' : sessionId;
  console.log(`📊 [Invoke] Reporting invocation for session: ${sessionPreview}`);
  
  try {
    const result = await glide.magicalAuth.reportInvocation({ session_id: sessionId });
    console.log('✅ [Invoke] Report response:', result);
    res.json({ success: result.success });
  } catch (error) {
    // Log the error but NEVER fail the response
    console.error('❌ [Invoke] Failed to report invocation:', error.message || error);
    res.json({ success: false, error: error.message || 'unknown_error' });
  }
});

/**
 * Status Proxy Endpoint for Desktop/QR Authentication Polling
 * 
 * Uses the stored status_url from the prepare response for polling.
 */
app.get('/api/phone-auth/status/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  // Get the stored status URL from prepare response
  const statusUrl = getStatusUrl(sessionId);
  
  if (!statusUrl) {
    const sessionPreview = sessionId.length > 8 ? sessionId.substring(0, 8) + '...' : sessionId;
    console.warn(`[Status Proxy] No stored status URL for session: ${sessionPreview}`);
    return res.status(404).json({
      error: 'SESSION_NOT_FOUND',
      message: 'Session not found. It may have expired or prepare was not called.'
    });
  }
  
  const sessionPreview = sessionId.length > 8 ? sessionId.substring(0, 8) + '...' : sessionId;
  console.log(`[Status Proxy] Polling session: ${sessionPreview}`);
  
  try {
    const response = await fetch(statusUrl, { 
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      console.log(`[Status Proxy] Status check returned ${response.status}`);
      return res.status(response.status).json({
        error: 'STATUS_CHECK_FAILED',
        message: `Status check returned ${response.status}`,
        status: response.status
      });
    }
    
    const data = await response.json();
    console.log(`[Status Proxy] Status check returned ${response.status}`);
    res.json(data);
  } catch (error) {
    console.error('[Status Proxy] Error:', error);
    res.status(500).json({ 
      error: 'STATUS_CHECK_FAILED', 
      message: error.message 
    });
  }
});

/**
 * Health Check Endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    glideInitialized: !!glide,
    env: {
      hasClientId: !!process.env.GLIDE_CLIENT_ID,
      hasClientSecret: !!process.env.GLIDE_CLIENT_SECRET,
    }
  });
});

// Start the server
const server = app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 Magical Auth Quickstart - Vanilla JavaScript');
  console.log('='.repeat(60));
  console.log(`✅ Server running on: http://localhost:${PORT}`);
  console.log(`✅ Frontend available at: http://localhost:${PORT}`);
  console.log(`🔧 API endpoints:`);
  console.log(`   - POST /api/phone-auth/prepare`);
  console.log(`   - POST /api/phone-auth/invoke`);
  console.log(`   - POST /api/phone-auth/process`);
  console.log(`   - GET  /api/phone-auth/status/:sessionId`);
  console.log(`   - GET  /api/health`);
  console.log(`   - GET  /sdk/* (Web Client SDK)`);
  console.log('='.repeat(60));
  
  if (!process.env.GLIDE_CLIENT_ID || !process.env.GLIDE_CLIENT_SECRET) {
    console.warn('⚠️  Warning: Missing GLIDE_CLIENT_ID or GLIDE_CLIENT_SECRET in .env file');
    console.warn('   Create a .env file with your OAuth2 credentials for production.');
  } else {
    console.log('✅ Glide OAuth2 credentials configured');
  }
  
  console.log('');
  console.log('Open http://localhost:' + PORT + ' in your browser to start!');
  console.log('='.repeat(60));
});

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('✅ Server closed. Port freed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.log('⚠️  Forcing shutdown...');
    process.exit(0);
  }, 3000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
