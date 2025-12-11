const express = require('express');
const cors = require('cors');
const path = require('path');
const { 
  GlideClient, 
  MagicAuthError,
  MagicAuthErrorCode,
  UseCase
} = require('@glideidentity/glide-sdk');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Glide client with API key
const glide = new GlideClient({
  apiKey: process.env.GLIDE_API_KEY,
  debug: process.env.GLIDE_DEBUG === 'true',
  logFormat: process.env.GLIDE_LOG_FORMAT || 'pretty' // Use pretty format for nice boxed logs
});

// Middleware
app.use(cors({
  origin: ['http://localhost:3030', 'http://127.0.0.1:3030', 'http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(express.json());

// Serve static files from public directory
app.use(express.static('public'));

// Serve the web-client-sdk from node_modules
app.use('/sdk', express.static(path.join(__dirname, 'node_modules/@glideidentity/web-client-sdk/dist/browser')));

// Logging middleware for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/**
 * Step 1: Prepare Authentication
 * Initializes the authentication session with Glide API
 */
app.post('/api/phone-auth/prepare', async (req, res) => {
  try {
    // Validate the request
    if (!req.body.use_case) {
      throw new MagicAuthError({
        code: MagicAuthErrorCode.VALIDATION_ERROR,
        message: 'use_case is required',
        status: 400
      });
    }

    // Prepare the authentication request - SDK will log with pretty format
    const response = await glide.magicAuth.prepare(req.body);
    res.json(response);
  } catch (error) {
    console.error('[Server] Prepare error:', error);
    
    if (error instanceof MagicAuthError) {
      res.status(error.status || 500).json({
        code: error.code,
        message: error.message,
        status: error.status
      });
    } else {
      res.status(500).json({
        code: MagicAuthErrorCode.INTERNAL_SERVER_ERROR,
        message: error.message || 'An unexpected error occurred',
        status: 500
      });
    }
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
      throw new MagicAuthError({
        code: MagicAuthErrorCode.VALIDATION_ERROR,
        message: 'use_case, session, and credential are required',
        status: 400
      });
    }
    
    let result;
    
    // Call the appropriate method based on use_case - SDK will log with pretty format
    if (use_case === UseCase.GET_PHONE_NUMBER) {
      result = await glide.magicAuth.getPhoneNumber({
        session: session,
        credential: credential
      });
    } else if (use_case === UseCase.VERIFY_PHONE_NUMBER) {
      result = await glide.magicAuth.verifyPhoneNumber({
        session: session,
        credential: credential
      });
    } else {
      throw new MagicAuthError({
        code: MagicAuthErrorCode.VALIDATION_ERROR,
        message: `Invalid use_case. Must be '${UseCase.GET_PHONE_NUMBER}' or '${UseCase.VERIFY_PHONE_NUMBER}'`,
        status: 400
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error('[Server] Process error:', error);
    
    if (error instanceof MagicAuthError) {
      res.status(error.status || 500).json({
        code: error.code,
        message: error.message,
        status: error.status
      });
    } else {
      res.status(500).json({
        code: MagicAuthErrorCode.INTERNAL_SERVER_ERROR,
        message: error.message || 'An unexpected error occurred',
        status: 500
      });
    }
  }
});

/**
 * Status Proxy Endpoint
 * Proxies status requests to avoid CORS issues
 */
app.get('/api/phone-auth/status/:sessionId', async (req, res) => {
  try {
    console.log(`[Status Proxy] Fetching status for session: ${req.params.sessionId}`);
    const response = await fetch(
      `https://api-dev.glideidentity.app/public/status/${req.params.sessionId}`,
      { 
        headers: { 'Accept': 'application/json' }
      }
    );
    
    if (!response.ok) {
      console.log(`[Status Proxy] Status check returned ${response.status}`);
      const errorText = await response.text();
      return res.status(response.status).send(errorText);
    }
    
    const data = await response.json();
    console.log(`[Status Proxy] Status response:`, data);
    res.json(data);
  } catch (error) {
    console.error('[Status Proxy] Error:', error);
    res.status(500).json({ 
      error: 'Status check failed', 
      message: error.message 
    });
  }
});

/**
 * Health Check Endpoint
 * Returns server status and configuration info
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    glideInitialized: !!glide,
    env: {
      hasApiKey: !!process.env.GLIDE_API_KEY,
      apiBaseUrl: process.env.GLIDE_API_BASE_URL || 'https://api.glideidentity.app',
      debugMode: process.env.GLIDE_DEBUG === 'true'
    }
  });
});

// Start the server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 Magical Auth Quickstart - Vanilla JavaScript');
  console.log('='.repeat(60));
  console.log(`✅ Server running on: http://localhost:${PORT}`);
  console.log(`✅ Frontend available at: http://localhost:${PORT}`);
  console.log(`🔧 API endpoints:`);
  console.log(`   - POST /api/phone-auth/prepare`);
  console.log(`   - POST /api/phone-auth/process`);
  console.log(`   - GET  /api/phone-auth/status/:sessionId`);
  console.log(`   - GET  /api/health`);
  console.log(`   - GET  /sdk/* (Web Client SDK)`);
  console.log('='.repeat(60));
  
  if (!process.env.GLIDE_API_KEY) {
    console.warn('⚠️  Warning: No GLIDE_API_KEY found in .env file');
    console.warn('   Using demo mode. Create a .env file with your API key for production.');
  } else {
    console.log('✅ Glide API key configured');
  }
  
  console.log('');
  console.log('Open http://localhost:' + PORT + ' in your browser to start!');
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received. Shutting down gracefully...');
  process.exit(0);
});
