// ====================================================================
// Magical Auth Quick Start - Vanilla JavaScript Implementation
// ====================================================================
//
// This demo shows carrier-grade phone authentication using Glide's SDKs.
//
// Three-Step Flow:
//   1. Prepare - Your server talks to Glide API
//   2. Browser Prompt - Secure carrier verification (handled by SDK in browser)
//   3. Process - Get the verified result from your server
//
// Two Modes:
//   - High Level: One-click authentication (SDK handles all steps)
//   - Granular: Manual control over each step (great for debugging)
//
// ====================================================================

// Global variables
let authClient = null;
let currentFlowMode = 'highlevel';
let selectedFlowType = 'verify';
let debugMode = false;
let debugLogs = [];

// Granular flow state
let stepOneResponse = null;
let stepTwoResponse = null;
let stepThreeResponse = null;
let extendedResponse = null;
let isPolling = false;

// API endpoint configuration
const API_BASE_URL = window.location.origin; // Uses the same origin as the frontend
const API_ENDPOINTS = {
    prepare: `${API_BASE_URL}/api/phone-auth/prepare`,
    process: `${API_BASE_URL}/api/phone-auth/process`,
    status: `${API_BASE_URL}/api/phone-auth/status`,
    health: `${API_BASE_URL}/api/health`
};

// Get UseCase constants from the SDK (set after SDK loads)
let UseCase = null;

// ====================================================================
// Initialize Application
// ====================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Magical Auth Quick Start - Vanilla JS');
    
    // Initialize PhoneAuthClient and get constants from the global GlideWebClientSDK
    if (window.GlideWebClientSDK && window.GlideWebClientSDK.PhoneAuthClient) {
        // Get constants from SDK
        UseCase = window.GlideWebClientSDK.UseCase;
        
        // Initialize the auth client
        authClient = new window.GlideWebClientSDK.PhoneAuthClient({
            endpoints: {
                prepare: API_ENDPOINTS.prepare,
                process: API_ENDPOINTS.process,
                /* Polling Endpoint Configuration
                   Uncomment the line below to enable polling through your backend server.
                   If not provided, the SDK will call the Glide Magic Auth server directly.
                   Useful for development and production when you want to proxy requests. */
                // polling: API_ENDPOINTS.status,
            },
            debug: true, // Enable SDK debug logging to console for development purposes
            /* Mobile DevTools Console
               Uncomment the code below to enable an on-screen console for mobile testing.
               This provides visibility into logs and errors on mobile devices where 
               traditional browser DevTools are not easily accessible. */
            // devtools: {
            //   showMobileConsole: true
            // },
            timeout: 30000,
            onCrossDeviceDetected: () => {
                addDebugLog('info', 'Cross-device authentication detected (QR code shown)');
            },
            onRetryAttempt: (attempt, maxAttempts) => {
                addDebugLog('info', `Retry attempt ${attempt} of ${maxAttempts}`);
            }
        });
        
        addDebugLog('info', 'PhoneAuthClient initialized', { 
            endpoints: API_ENDPOINTS,
            useCase: UseCase 
        });
    } else {
        console.error('❌ GlideWebClientSDK not found! Make sure the SDK is loaded.');
        showError({ code: 'SDK_ERROR', message: 'Web Client SDK not loaded. Please refresh the page.' });
    }
    
    // Setup event listeners
    setupEventListeners();
    
    // Set initial button state (verify is selected by default in HTML)
    updateButtonState();
    
    // Check server health
    checkServerHealth();
});

// ====================================================================
// Event Listeners Setup
// ====================================================================

function setupEventListeners() {
    // Header brand click to reset
    document.getElementById('headerBrand').addEventListener('click', () => {
        // Reset all states
        clearResults();
        resetGranularFlow();
        
        // Reset phone input
        document.getElementById('phoneInput').value = '';
        
        // Update button state
        updateButtonState();
        
        addDebugLog('info', 'App reset via header click');
    });
    
    // Mode toggle buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', handleModeToggle);
    });
    
    // Flow type cards
    document.getElementById('verifyCard').addEventListener('click', () => selectFlow('verify'));
    document.getElementById('getCard').addEventListener('click', () => selectFlow('get'));
    
    // Phone input - enter key and update button state
    const phoneInputElement = document.getElementById('phoneInput');
    phoneInputElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (currentFlowMode === 'highlevel') {
                startHighLevelAuth();
            } else {
                startGranularFlow();
            }
        }
    });
    
    // Update button state when phone input changes
    phoneInputElement.addEventListener('input', updateButtonState);
    
    // High-level auth button
    document.getElementById('startAuthButton').addEventListener('click', startHighLevelAuth);
    
    // Granular flow buttons
    document.getElementById('step1Button').addEventListener('click', executeStepOne);
    document.getElementById('step2Button').addEventListener('click', () => {
        const button = document.getElementById('step2Button');
        // Check if it's a retry based on button text
        const isRetry = button && button.textContent === 'Retry Step';
        executeStepTwo(isRetry);
    });
    document.getElementById('step3Button').addEventListener('click', executeStepThree);
    document.getElementById('resetButton').addEventListener('click', resetGranularFlow);
    
    // Step 2 polling buttons
    document.getElementById('step2RetryButton').addEventListener('click', () => {
        if (extendedResponse && extendedResponse.trigger) {
            addDebugLog('info', '[Granular] Retrying Link trigger');
            extendedResponse.trigger();
        }
    });
    
    document.getElementById('step2CancelButton').addEventListener('click', () => {
        if (extendedResponse && extendedResponse.stop_polling) {
            extendedResponse.stop_polling();
        }
        isPolling = false;
        
        // Hide polling buttons first
        const pollingBtns = document.getElementById('step2PollingButtons');
        if (pollingBtns) pollingBtns.style.display = 'none';
        
        // Show error message
        showStepError(2, 'Cancelled by user - you can retry');
        
        // Show retry button - do this AFTER showStepError
        const button = document.getElementById('step2Button');
        if (button) {
            button.style.display = 'block';
            button.textContent = 'Retry Step';
            button.disabled = false;
        }
        
        addDebugLog('info', '[Granular] Step 2 cancelled, ready to retry');
    });
    
    // Debug toggle
    document.getElementById('debugToggle').addEventListener('change', (e) => {
        debugMode = e.target.checked;
        document.getElementById('debugSection').classList.toggle('hidden', !debugMode);
        if (debugMode) {
            addDebugLog('info', 'Debug mode enabled');
        }
    });
    
    // Clear logs button
    document.getElementById('clearLogsButton').addEventListener('click', () => {
        debugLogs = [];
        document.getElementById('debugConsole').innerHTML = '';
    });
}

// ====================================================================
// Mode and Flow Selection
// ====================================================================

function handleModeToggle(e) {
    const mode = e.currentTarget.dataset.mode;
    
    // Update active state
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    // Update sliding toggle
    const slider = document.querySelector('.toggle-slider');
    if (mode === 'granular') {
        slider.classList.add('right');
        slider.classList.remove('left');
    } else {
        slider.classList.remove('right');
        slider.classList.add('left');
    }
    
    currentFlowMode = mode;
    
    // Update description
    const description = mode === 'highlevel' 
        ? 'Simple one-click authentication flow'
        : 'Step-by-step control over each authentication phase';
    document.getElementById('modeDescription').textContent = description;
    
    // Toggle sections
    document.getElementById('highLevelSection').classList.toggle('hidden', mode !== 'highlevel');
    document.getElementById('granularSection').classList.toggle('hidden', mode !== 'granular');
    
    // Reset states
    clearResults();
    if (mode === 'granular') {
        resetGranularFlow();
    }
    
    // Update button states for new mode
    updateButtonState();
    
    addDebugLog('info', `Flow mode changed to: ${mode}`);
}

function selectFlow(flowType) {
    selectedFlowType = flowType;
    
    // Update selected card
    document.querySelectorAll('.card').forEach(card => {
        card.classList.toggle('selected', card.dataset.flow === flowType);
    });
    
    // Show/hide phone input
    document.getElementById('phoneInputSection').classList.toggle('hidden', flowType === 'get');
    
    // Update button text
    const buttonText = flowType === 'verify' ? 'Verify Phone Number' : 'Get Phone Number';
    document.getElementById('buttonText').textContent = buttonText;
    
    // Clear previous results
    clearResults();
    
    // Reset phone input if switching to get flow
    if (flowType === 'get') {
        document.getElementById('phoneInput').value = '';
    }
    
    // Update button state based on phone input
    updateButtonState();
    
    addDebugLog('info', `Flow type changed to: ${flowType}`);
}

// Update button disabled state based on current flow and phone input
function updateButtonState() {
    const button = document.getElementById('startAuthButton');
    const step1Button = document.getElementById('step1Button');
    const phoneInput = document.getElementById('phoneInput').value.trim();
    
    // Disable button if verify flow and no phone input
    if (selectedFlowType === 'verify' && !phoneInput) {
        button.disabled = true;
        if (step1Button && !step1Button.textContent.includes('Completed')) {
            step1Button.disabled = true;
        }
    } else if (!button.classList.contains('loading')) {
        button.disabled = false;
        if (step1Button && !step1Button.textContent.includes('Completed')) {
            step1Button.disabled = false;
        }
    }
}

// ====================================================================
// High-Level Authentication Flow
// ====================================================================

async function startHighLevelAuth() {
    if (!authClient) {
        showError({ code: 'NO_CLIENT', message: 'Authentication client not initialized' });
        return;
    }
    
    const phoneInput = document.getElementById('phoneInput').value.trim();
    
    if (selectedFlowType === 'verify' && !phoneInput) {
        showError({ code: 'MISSING_PHONE', message: 'Please enter a phone number to verify' });
        return;
    }
    
    // Clear previous results and show loading
    clearResults();
    setLoading(true);
    
    try {
        addDebugLog('info', 'Starting authentication', {
            flow: selectedFlowType,
            phone: selectedFlowType === 'verify' ? phoneInput : undefined
        });
        
        const options = {
            use_case: selectedFlowType === 'get' ? UseCase.GET_PHONE_NUMBER : UseCase.VERIFY_PHONE_NUMBER,
            phone_number: selectedFlowType === 'verify' ? phoneInput : undefined,
            plmn: selectedFlowType === 'get' ? { mcc: '310', mnc: '260' } : undefined, // T-Mobile USA for GetPhoneNumber
            consent_data: {
                consent_text: 'I agree to verify my phone number',
                policy_link: 'https://example.com/privacy',
                policy_text: 'Privacy Policy'
            }
        };
        
        let response;
        if (selectedFlowType === 'get') {
            response = await authClient.getPhoneNumberComplete(options);
        } else {
            response = await authClient.verifyPhoneNumberComplete(phoneInput, options);
        }
        
        showResult(response);
        addDebugLog('success', 'Authentication successful', response);
    } catch (error) {
        console.error('Authentication error:', error);
        showError(error);
        addDebugLog('error', 'Authentication failed', error);
    } finally {
        setLoading(false);
    }
}

// ====================================================================
// Granular Authentication Flow
// ====================================================================

function startGranularFlow() {
    const phoneInput = document.getElementById('phoneInput').value.trim();
    
    if (selectedFlowType === 'verify' && !phoneInput) {
        showError({ code: 'MISSING_PHONE', message: 'Please enter a phone number to verify' });
        return;
    }
    
    resetGranularFlow();
    executeStepOne();
}

async function executeStepOne() {
    if (!authClient) {
        showStepError(1, 'Authentication client not initialized');
        return;
    }
    
    const phoneInput = document.getElementById('phoneInput').value.trim();
    
    if (selectedFlowType === 'verify' && !phoneInput) {
        showStepError(1, 'Please enter a phone number to verify');
        return;
    }
    
    setStepLoading(1, true);
    
    try {
        addDebugLog('info', 'Step 1: Preparing authentication');
        
        const options = {
            use_case: selectedFlowType === 'get' ? UseCase.GET_PHONE_NUMBER : UseCase.VERIFY_PHONE_NUMBER,
            phone_number: selectedFlowType === 'verify' ? phoneInput : undefined,
            plmn: selectedFlowType === 'get' ? { mcc: '310', mnc: '260' } : undefined, // T-Mobile USA
            consent_data: {
                consent_text: 'I agree to verify my phone number',
                policy_link: 'https://example.com/privacy',
                policy_text: 'Privacy Policy'
            }
        };
        
        addDebugLog('info', '[Granular] Step 1: Preparing with options', options);
        
        stepOneResponse = await authClient.preparePhoneRequest(options);
        
        addDebugLog('info', '[Granular] Step 1: Prepare response', stepOneResponse);
        
        showStepSuccess(1, `Session prepared. Strategy: ${stepOneResponse.authentication_strategy}`);
        enableStep(2);
        
        addDebugLog('success', 'Step 1 completed', stepOneResponse);
    } catch (error) {
        addDebugLog('error', '[Granular] Step 1 Error', error);
        showStepError(1, error.message || 'Failed to prepare authentication');
        addDebugLog('error', 'Step 1 failed', error);
    } finally {
        setStepLoading(1, false);
    }
}

async function executeStepTwo(isRetry = false) {
    if (!authClient || !stepOneResponse) return;
    
    // Clear error state if retrying
    if (isRetry) {
        // Clean up existing extended response before creating a new one
        if (extendedResponse) {
            if (extendedResponse.cancel) {
                extendedResponse.cancel();
            }
            if (extendedResponse.stop_polling) {
                extendedResponse.stop_polling();
            }
            extendedResponse = null;
        }
        
        const errorDiv = document.getElementById('step2Error');
        if (errorDiv) errorDiv.classList.add('hidden');
        const card = document.getElementById('step2Card');
        if (card) {
            card.classList.remove('error', 'completed');
            card.classList.add('active');
        }
    } else {
        // Only set loading if we're not retrying (retrying will show polling UI)
        setStepLoading(2, true);
    }
    
    try {
        addDebugLog('info', 'Step 2: Invoking secure browser prompt');
        addDebugLog('info', '[Granular] Step 2: About to invoke secure prompt with', stepOneResponse);
        
        // Use extended mode for better control  
        const invokeResult = await authClient.invokeSecurePrompt(stepOneResponse, {
            executionMode: 'extended',
            preventDefaultUI: false,
            autoTrigger: !isRetry // Don't auto-trigger on retry
        });
        
        addDebugLog('info', '[Granular] Step 2: Extended invoke result', invokeResult);
        
        let credential;
        if (invokeResult.strategy === 'link' || invokeResult.strategy === 'desktop') {
            // Store extended response for potential retry
            extendedResponse = invokeResult;
            isPolling = true;
            updateStep2UIForPolling();
            
            // For Link strategy, trigger if it's a retry
            if (isRetry && invokeResult.trigger) {
                addDebugLog('info', '[Granular] Step 2: Triggering retry for Link strategy');
                invokeResult.trigger();
            }
            
            // Wait for credential - SDK handles timeout
            const authCredential = await invokeResult.credential;
            // Link and Desktop return AuthCredential object, extract the credential string
            credential = authCredential.credential || authCredential;
            isPolling = false;
        } else if (invokeResult.strategy === 'ts43') {
            // TS43 returns credential directly
            credential = invokeResult.credential || invokeResult;
        } else {
            // Unknown strategy - handle as generic
            credential = invokeResult.credential || invokeResult;
        }
        
        stepTwoResponse = credential;
        addDebugLog('info', '[Granular] Step 2: Received credential', credential);
        
        showStepSuccess(2, 'Credential obtained from browser');
        enableStep(3);
        updateStep2UIForNormal();
        
        addDebugLog('success', 'Step 2 completed', credential);
        // Clean up extended response
        if (extendedResponse) {
            extendedResponse = null;
        }
    } catch (error) {
        addDebugLog('error', '[Granular] Step 2 Error', error);
        const errorMessage = error.message || 'Browser verification failed';
        showStepError(2, errorMessage);
        addDebugLog('error', 'Step 2 failed', error);
        isPolling = false;
        
        // Show retry option for Desktop/Link strategies
        const shouldShowRetry = extendedResponse || 
            errorMessage.toLowerCase().includes('cancel') || 
            errorMessage.toLowerCase().includes('closed');
            
        if (shouldShowRetry) {
            // Clear the card state and show retry button
            const card = document.getElementById('step2Card');
            if (card) {
                card.classList.remove('completed');
                card.classList.add('error');
            }
            
            // Make sure polling buttons are hidden
            const pollingBtns = document.getElementById('step2PollingButtons');
            if (pollingBtns) pollingBtns.style.display = 'none';
            
            // Show retry button - do this after hiding polling buttons
            const button = document.getElementById('step2Button');
            if (button) {
                button.style.display = 'block';
                button.textContent = 'Retry Step';
                button.disabled = false;
            }
        } else {
            // For non-retryable errors, just show the error UI
            // Don't call setStepLoading as it would incorrectly show "Completed"
            updateStep2UIForError();
        }
    } finally {
        isPolling = false;
    }
}

async function executeStepThree() {
    if (!authClient || !stepOneResponse || !stepTwoResponse) return;
    
    setStepLoading(3, true);
    
    try {
        addDebugLog('info', 'Step 3: Processing verification');
        addDebugLog('info', '[Granular] Step 3: Processing with credential', stepTwoResponse);
        addDebugLog('info', '[Granular] Step 3: Using session', stepOneResponse.session);
        
        let response;
        if (selectedFlowType === 'get') {
            response = await authClient.getPhoneNumber(stepTwoResponse, stepOneResponse.session);
        } else {
            response = await authClient.verifyPhoneNumber(stepTwoResponse, stepOneResponse.session);
        }
        
        addDebugLog('info', '[Granular] Step 3: Final response', response);
        
        stepThreeResponse = response;
        showStepSuccess(3, `Verification complete! Phone: ${response.phone_number} - Verified: ${response.verified ? 'Yes' : 'No'}`);
        showGranularResult(response);
        
        // Show reset button
        document.getElementById('resetButton').classList.remove('hidden');
        
        addDebugLog('success', 'Step 3 completed', response);
    } catch (error) {
        addDebugLog('error', '[Granular] Step 3 Error', error);
        showStepError(3, error.message || 'Verification processing failed');
        addDebugLog('error', 'Step 3 failed', error);
    } finally {
        setStepLoading(3, false);
    }
}

function resetGranularFlow() {
    // Reset state
    stepOneResponse = null;
    stepTwoResponse = null;
    stepThreeResponse = null;
    
    // Clean up extended response if exists
    if (extendedResponse && extendedResponse.cancel) {
        extendedResponse.cancel();
    }
    if (extendedResponse && extendedResponse.stop_polling) {
        extendedResponse.stop_polling();
    }
    extendedResponse = null;
    isPolling = false;
    
    // Reset UI
    for (let i = 1; i <= 3; i++) {
        const card = document.getElementById(`step${i}Card`);
        const button = document.getElementById(`step${i}Button`);
        const success = document.getElementById(`step${i}Success`);
        const error = document.getElementById(`step${i}Error`);
        
        card.classList.remove('active', 'completed', 'error');
        card.classList.toggle('disabled', i > 1);
        
        button.disabled = i > 1;
        button.textContent = 'Execute Step';
        button.style.display = 'block'; // Ensure button is visible
        
        success.classList.add('hidden');
        error.classList.add('hidden');
    }
    
    // Specifically hide step 2 polling buttons
    const pollingBtns = document.getElementById('step2PollingButtons');
    if (pollingBtns) pollingBtns.style.display = 'none';
    
    // Hide reset button and results
    document.getElementById('resetButton').classList.add('hidden');
    document.getElementById('granularResult').classList.add('hidden');
    
    addDebugLog('info', 'Granular flow reset');
}

// ====================================================================
// UI Helper Functions
// ====================================================================

function setLoading(isLoading) {
    const button = document.getElementById('startAuthButton');
    const spinner = document.getElementById('loadingSpinner');
    const buttonText = document.getElementById('buttonText');
    
    button.classList.toggle('loading', isLoading);
    spinner.classList.toggle('hidden', !isLoading);
    
    if (isLoading) {
        button.disabled = true;
        buttonText.textContent = 'Processing...';
    } else {
        const text = selectedFlowType === 'verify' ? 'Verify Phone Number' : 'Get Phone Number';
        buttonText.textContent = text;
        // Update button state after loading completes
        updateButtonState();
    }
}

function setStepLoading(step, isLoading) {
    const button = document.getElementById(`step${step}Button`);
    if (isLoading) {
        button.disabled = true;
        button.textContent = 'Processing...';
        button.style.display = 'block'; // Ensure it's visible
        
        // For step 2, hide polling buttons if they exist
        if (step === 2) {
            const pollingBtns = document.getElementById('step2PollingButtons');
            if (pollingBtns) pollingBtns.style.display = 'none';
        }
    } else {
        // Keep button disabled after completion
        button.disabled = true;
        button.textContent = 'Completed';
        button.style.display = 'block'; // Ensure it's visible
    }
}

function showStepSuccess(step, message) {
    const card = document.getElementById(`step${step}Card`);
    const success = document.getElementById(`step${step}Success`);
    const button = document.getElementById(`step${step}Button`);
    
    card.classList.add('completed');
    card.classList.remove('active', 'error');
    success.textContent = message;
    success.classList.remove('hidden');
    button.textContent = 'Completed';
    button.disabled = true;
    button.style.display = 'block'; // Ensure it's visible
    
    // For step 2, hide polling buttons if they exist
    if (step === 2) {
        const pollingBtns = document.getElementById('step2PollingButtons');
        if (pollingBtns) pollingBtns.style.display = 'none';
    }
}

function showStepError(step, message) {
    const card = document.getElementById(`step${step}Card`);
    const error = document.getElementById(`step${step}Error`);
    
    card.classList.add('error');
    card.classList.remove('active', 'completed');
    error.textContent = message;
    error.classList.remove('hidden');
}

function enableStep(step) {
    const card = document.getElementById(`step${step}Card`);
    const button = document.getElementById(`step${step}Button`);
    
    card.classList.remove('disabled');
    card.classList.add('active');
    
    // Only enable button if it's not already completed
    if (button.textContent !== 'Completed') {
        button.disabled = false;
    }
}

// UI functions for Step 2 polling state
function updateStep2UIForPolling() {
    const step2Actions = document.getElementById('step2Actions');
    if (!step2Actions) return;
    
    // Clear any success/error states first
    const success = document.getElementById('step2Success');
    const error = document.getElementById('step2Error');
    if (success) success.classList.add('hidden');
    if (error) error.classList.add('hidden');
    
    // Hide normal button, show polling buttons
    const normalBtn = document.getElementById('step2Button');
    if (normalBtn) {
        normalBtn.style.display = 'none';
        normalBtn.textContent = 'Execute Step'; // Reset text
    }
    
    const pollingBtns = document.getElementById('step2PollingButtons');
    if (pollingBtns) pollingBtns.style.display = 'flex';
}

function updateStep2UIForNormal() {
    const step2Actions = document.getElementById('step2Actions');
    if (!step2Actions) return;
    
    // Show normal button, hide polling buttons
    const normalBtn = document.getElementById('step2Button');
    if (normalBtn) normalBtn.style.display = 'block';
    
    const pollingBtns = document.getElementById('step2PollingButtons');
    if (pollingBtns) pollingBtns.style.display = 'none';
}

function updateStep2UIForError() {
    const step2Actions = document.getElementById('step2Actions');
    if (!step2Actions) return;
    
    // Show normal button for retry, hide polling buttons
    const normalBtn = document.getElementById('step2Button');
    if (normalBtn) {
        normalBtn.style.display = 'block';
        normalBtn.textContent = 'Retry Step';
        normalBtn.disabled = false;
    }
    
    const pollingBtns = document.getElementById('step2PollingButtons');
    if (pollingBtns) pollingBtns.style.display = 'none';
}

function showResult(result) {
    const resultDiv = document.getElementById('resultSuccess');
    const detailsDiv = document.getElementById('resultDetails');
    
    detailsDiv.innerHTML = `
        <p><strong>Phone Number:</strong> ${result.phone_number || 'N/A'}</p>
        <p><strong>Verified:</strong> ${result.verified !== undefined ? (result.verified ? 'Yes' : 'No') : 'Yes'}</p>
        ${result.aud ? `<p><strong>Audience:</strong> ${result.aud}</p>` : ''}
    `;
    
    resultDiv.classList.remove('hidden');
}

function showGranularResult(result) {
    const resultDiv = document.getElementById('granularResult');
    const detailsDiv = document.getElementById('granularResultDetails');
    
    detailsDiv.innerHTML = `
        <p><strong>Phone Number:</strong> ${result.phone_number || 'N/A'}</p>
        <p><strong>Verified:</strong> ${result.verified !== undefined ? (result.verified ? 'Yes' : 'No') : 'Yes'}</p>
        ${result.aud ? `<p><strong>Audience:</strong> ${result.aud}</p>` : ''}
    `;
    
    resultDiv.classList.remove('hidden');
}

function showError(error) {
    const errorDiv = document.getElementById('errorMessage');
    const errorCode = document.getElementById('errorCode');
    const errorText = document.getElementById('errorText');
    
    errorCode.textContent = error.code || 'UNKNOWN_ERROR';
    errorText.textContent = error.message || 'An unexpected error occurred';
    
    errorDiv.classList.remove('hidden');
}

function clearResults() {
    document.getElementById('resultSuccess').classList.add('hidden');
    document.getElementById('errorMessage').classList.add('hidden');
    document.getElementById('granularResult').classList.add('hidden');
}

// ====================================================================
// Debug Functions
// ====================================================================

function addDebugLog(type, message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    
    const logEntry = {
        timestamp,
        type,
        message,
        data
    };
    
    debugLogs.push(logEntry);
    
    // Also log to console
    const consoleMsg = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    if (data) {
        console.log(consoleMsg, data);
    } else {
        console.log(consoleMsg);
    }
    
    // Update debug console if visible
    if (debugMode) {
        updateDebugConsole(logEntry);
    }
}

function updateDebugConsole(logEntry) {
    const debugConsole = document.getElementById('debugConsole');
    
    const entryDiv = document.createElement('div');
    entryDiv.className = 'debug-entry';
    
    let html = `
        <span class="debug-time">${logEntry.timestamp}</span>
        <span class="debug-type ${logEntry.type}">${logEntry.type}</span>
        <div class="debug-message">${logEntry.message}</div>
    `;
    
    if (logEntry.data) {
        html += `<pre class="debug-data">${JSON.stringify(logEntry.data, null, 2)}</pre>`;
    }
    
    entryDiv.innerHTML = html;
    debugConsole.appendChild(entryDiv);
    
    // Auto-scroll to bottom
    debugConsole.scrollTop = debugConsole.scrollHeight;
}

// ====================================================================
// Server Health Check
// ====================================================================

async function checkServerHealth() {
    try {
        const response = await fetch(API_ENDPOINTS.health);
        const data = await response.json();
        
        if (data.status === 'ok') {
            addDebugLog('success', 'Server health check passed', data);
        } else {
            addDebugLog('warning', 'Server health check returned unexpected status', data);
        }
    } catch (error) {
        console.error('Server health check failed:', error);
        addDebugLog('error', 'Server health check failed. Make sure the server is running on port 3001');
        showError({
            code: 'SERVER_ERROR',
            message: 'Cannot connect to server. Please make sure the server is running (npm run dev)'
        });
    }
}

// ====================================================================
// Utility Functions
// ====================================================================

function formatPhoneNumber(phoneNumber) {
    // Simple phone number formatting
    if (!phoneNumber) return 'N/A';
    
    // Remove all non-numeric characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // Format as US phone number if it matches
    if (cleaned.length === 10) {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length === 11 && cleaned[0] === '1') {
        return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    
    return phoneNumber;
}
