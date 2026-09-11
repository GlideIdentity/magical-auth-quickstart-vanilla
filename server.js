import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  MagicalAuthClient,
  MagicalAuthError,
  UseCase,
  ErrorCode,
  buildSetBindingCookieHeader,
  parseBindingCookie,
  getCompletionPageHtml,
} from '@glideidentity/glide-be-node-magical-auth';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default T-Mobile US PLMN (used when client doesn't provide one)
const DEFAULT_PLMN = { mcc: '310', mnc: '260' };

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize the Magical Auth SDK with OAuth2 credentials
const magicalAuth = new MagicalAuthClient({
  clientId: process.env.GLIDE_CLIENT_ID,
  clientSecret: process.env.GLIDE_CLIENT_SECRET,
  ...(process.env.GLIDE_API_BASE_URL && { baseUrl: process.env.GLIDE_API_BASE_URL }),
});

// CORS: restrict to localhost origins (quickstart runs locally).
// credentials: 'include' is required for HttpOnly cookie passthrough (device binding).
const ALLOWED_ORIGINS = [
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
];
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());

// Serve static files from public directory
app.use(express.static('public'));

// Serve the web SDK from node_modules
app.use('/sdk', express.static(path.join(__dirname, 'node_modules/@glideidentity/glide-fe-sdk-web/dist/browser')));

// =============================================================================
// Health Check
// =============================================================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    sdk: '@glideidentity/glide-be-node-magical-auth (MagicalAuthClient)',
    sdkInitialized: !!magicalAuth,
    env: {
      hasClientId: !!process.env.GLIDE_CLIENT_ID,
      hasClientSecret: !!process.env.GLIDE_CLIENT_SECRET,
    }
  });
});

// =============================================================================
// Step 1: Prepare Authentication
// Initializes the authentication session with the Magical Auth API
// =============================================================================

app.post('/api/magical-auth/prepare', async (req, res) => {
  try {
    // Validate the request
    if (!req.body.use_case) {
      return res.status(400).json({
        error: ErrorCode.VALIDATION_ERROR,
        message: 'use_case is required',
        status: 400
      });
    }

    const prepareRequest = { ...req.body };
    
    // Apply default PLMN for GetPhoneNumber if not provided
    if (prepareRequest.use_case === UseCase.GET_PHONE_NUMBER && !prepareRequest.plmn) {
      prepareRequest.plmn = DEFAULT_PLMN;
      console.log('📶 PLMN not provided in request, defaulting to T-Mobile US (MCC: 310, MNC: 260)');
    }

    console.log('📱 Prepare request:', { use_case: prepareRequest.use_case });
    
    // SDK auto-generates fe_code/fe_hash for device binding (link strategy)
    const response = await magicalAuth.prepare(prepareRequest);
    
    console.log('✅ Prepare success:', { 
      strategy: response.authentication_strategy,
      session_key: response.session?.session_key 
    });
    
    // Device binding: set HttpOnly cookie with fe_code for link strategy.
    // Uses the SDK's buildSetBindingCookieHeader which validates the feCode format
    // and builds a safe Set-Cookie header with Secure + HttpOnly flags.
    const sessionKey = response.session?.session_key;
    if (response.feCode && sessionKey) {
      const cookieHeader = buildSetBindingCookieHeader(response.feCode, sessionKey, { secure: true });
      res.setHeader('Set-Cookie', cookieHeader);
      console.log('Device binding cookie set for link strategy');
    }

    // Strip feCode from the response — it must NEVER be sent to the client in the body
    const { feCode: _stripped, ...clientResponse } = response;
    res.json(clientResponse);
  } catch (error) {
    console.error('❌ Prepare error:', error);
    
    const status = error.status || 500;
    res.status(status).json({
      error: error.code || ErrorCode.INTERNAL_SERVER_ERROR,
      message: error.message || 'An unexpected error occurred',
      status,
    });
  }
});

// =============================================================================
// Step 3: Process Verification
// Processes the credential received from browser (Step 2 happens in browser via SDK)
// =============================================================================

app.post('/api/magical-auth/process', async (req, res) => {
  try {
    const { use_case, session, credential } = req.body;
    
    // Validate the request
    if (!use_case || !session || !credential) {
      return res.status(400).json({
        error: ErrorCode.VALIDATION_ERROR,
        message: 'use_case, session, and credential are required',
        status: 400
      });
    }
    
    console.log('🔐 Process request:', { use_case });

    // Read the device binding code from the HttpOnly cookie set during prepare.
    // This extends device binding verification to the process step (link protocol only).
    const sessionKey = session?.session_key;
    const feCode = sessionKey ? parseBindingCookie(req.headers.cookie, sessionKey) : undefined;
    if (feCode) {
      console.log('🔒 Device binding cookie found for process step');
    }
    
    let result;
    
    // Call the appropriate method based on use_case
    if (use_case === UseCase.GET_PHONE_NUMBER) {
      result = await magicalAuth.getPhoneNumber({
        session,
        credential,
        ...(feCode && { fe_code: feCode }),
      });
      console.log('✅ GetPhoneNumber success:', { 
        phone_number: result.phone_number ? '***' + result.phone_number.slice(-4) : undefined 
      });
    } else if (use_case === UseCase.VERIFY_PHONE_NUMBER) {
      result = await magicalAuth.verifyPhoneNumber({
        session,
        credential,
        ...(feCode && { fe_code: feCode }),
      });
      console.log('✅ VerifyPhoneNumber success:', { verified: result.verified });
    } else {
      return res.status(400).json({
        error: ErrorCode.VALIDATION_ERROR,
        message: `Invalid use_case. Must be '${UseCase.GET_PHONE_NUMBER}' or '${UseCase.VERIFY_PHONE_NUMBER}'`,
        status: 400
      });
    }

    // The device binding cookie auto-expires (5 min Max-Age), so explicit clearing
    // is optional. Developers can clear it here for immediate cleanup if desired.
    
    res.json(result);
  } catch (error) {
    console.error('❌ Process error:', error);
    
    const status = error.status || 500;
    res.status(status).json({
      error: error.code || ErrorCode.INTERNAL_SERVER_ERROR,
      message: error.message || 'An unexpected error occurred',
      status,
    });
  }
});

// =============================================================================
// Invoke — reports that an authentication flow was started (ASR tracking)
// =============================================================================

app.post('/api/magical-auth/report-invocation', async (req, res) => {
  const sessionId = req.body?.session_id;
  
  if (!sessionId) {
    console.warn('⚠️ [Invoke] No session_id provided');
    return res.json({ success: false, reason: 'missing_session_id' });
  }
  
  const sessionPreview = sessionId.length > 8 ? sessionId.substring(0, 8) + '...' : sessionId;
  console.log(`📊 [Invoke] Reporting invocation for session: ${sessionPreview}`);
  
  try {
    // The new SDK takes sessionId as a string parameter (not an object)
    const result = await magicalAuth.reportInvocation(sessionId);
    console.log('✅ [Invoke] Report response:', result);
    res.json({ success: !!result });
  } catch (error) {
    // Log the error but NEVER fail the response
    console.error('❌ [Invoke] Failed to report invocation:', error.message || error);
    res.json({ success: false, error: error.message || 'unknown_error' });
  }
});

// =============================================================================
// Device Binding: Completion Redirect Page
// =============================================================================

/**
 * Completion redirect page — served after carrier authentication.
 * 
 * The aggregator redirects the phone browser to this URL with agg_code and
 * session_key in the URL fragment. The page extracts them and POSTs to
 * /api/magical-auth/complete (the browser auto-attaches the _glide_bind cookie).
 */
app.get('/glide-complete', (req, res) => {
  try {
    // The SDK provides the completion page HTML — no inline HTML needed
    const html = getCompletionPageHtml('/api/magical-auth/complete');
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.send(html);
  } catch (error) {
    console.error('❌ Failed to generate completion page:', error);
    res.status(500).send('Internal server error');
  }
});

// =============================================================================
// Device Binding: Complete Endpoint
// =============================================================================

/**
 * Complete endpoint — called by the completion redirect page.
 * 
 * Reads fe_code from the _glide_bind HttpOnly cookie (auto-attached by the browser),
 * agg_code and session_key from the POST body, and forwards all three to the
 * aggregator's /complete endpoint via the SDK. Returns 204 on success.
 */
app.post('/api/magical-auth/complete', async (req, res) => {
  const { session_key, agg_code } = req.body;

  if (!session_key || !agg_code) {
    return res.status(400).json({
      error: ErrorCode.VALIDATION_ERROR,
      message: 'session_key and agg_code are required',
      status: 400,
    });
  }

  // Read fe_code from the session-scoped HttpOnly cookie (set during prepare)
  const feCode = parseBindingCookie(req.headers.cookie, session_key);

  if (!feCode) {
    console.error('❌ Complete: device binding cookie missing or invalid');
    return res.status(403).json({
      error: ErrorCode.MISSING_BINDING_COOKIE,
      message: 'Device binding cookie is missing. The prepare and complete must happen in the same browser.',
      status: 403,
    });
  }

  try {
    console.log('🔐 Complete request for session:', session_key.substring(0, 8) + '...');

    // The SDK validates the binding codes and completes the session
    await magicalAuth.complete({ session_key, fe_code: feCode, agg_code });

    console.log('✅ Complete succeeded');

    // The device binding cookie is intentionally not cleared here — it is needed
    // by the process step for continued device binding validation.
    // The cookie auto-expires after 5 minutes.
    res.status(204).send();
  } catch (error) {
    console.error('❌ Complete error:', error);

    if (error instanceof MagicalAuthError) {
      return res.status(error.status || 500).json({
        error: error.code,
        message: error.message,
        status: error.status,
      });
    }

    res.status(500).json({
      error: ErrorCode.INTERNAL_SERVER_ERROR,
      message: error.message || 'An unexpected error occurred',
      status: 500,
    });
  }
});

// =============================================================================
// Start Server
// =============================================================================

const server = app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('Magical Auth Quickstart - Vanilla JavaScript');
  console.log('='.repeat(60));
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log(`Frontend available at: http://localhost:${PORT}`);
  console.log(`SDK: @glideidentity/glide-be-node-magical-auth (MagicalAuthClient)`);
  console.log(`API endpoints:`);
  console.log(`   - POST /api/magical-auth/prepare`);
  console.log(`   - POST /api/magical-auth/report-invocation`);
  console.log(`   - POST /api/magical-auth/process`);
  console.log(`   - POST /api/magical-auth/complete     (device binding)`);
  console.log(`   - GET  /api/health`);
  console.log(`   - GET  /glide-complete                (completion page)`);
  console.log(`   - GET  /sdk/* (Web Client SDK)`);
  console.log('='.repeat(60));
  
  if (!process.env.GLIDE_CLIENT_ID || !process.env.GLIDE_CLIENT_SECRET) {
    console.warn('Warning: Missing GLIDE_CLIENT_ID or GLIDE_CLIENT_SECRET in .env file');
  } else {
    console.log('OAuth2 credentials configured');
  }
  
  console.log('');
  console.log('Open http://localhost:' + PORT + ' in your browser to start!');
  console.log('='.repeat(60));
});

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed. Port freed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.log('Forcing shutdown...');
    process.exit(0);
  }, 3000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
