/**
 * SDK Configuration Panel Module
 * 
 * Separates the SDK configuration UI logic from the main authentication flow,
 * making app.js easier to understand and focus on the core SDK usage.
 * 
 * This module handles:
 * - Loading/saving SDK configuration from localStorage
 * - Populating and reading the config form
 * - Panel open/close functionality
 * - Default config values
 */

// Default SDK configuration values
const defaultSdkConfig = {
    pollingInterval: 2000,
    maxPollingAttempts: 30,
    modalTheme: 'auto',
    viewMode: 'toggle',
    title: '',
    description: '',
    showCloseButton: true,
    closeOnBackdrop: true,
    closeOnEscape: true
};

// Current SDK configuration (loaded from localStorage or defaults)
let sdkConfig = { ...defaultSdkConfig };

/**
 * Initialize SDK configuration from localStorage
 */
function initSdkConfig() {
    const saved = localStorage.getItem('sdkConfig');
    if (saved) {
        try {
            sdkConfig = { ...defaultSdkConfig, ...JSON.parse(saved) };
        } catch (e) {
            console.warn('Failed to parse saved SDK config, using defaults');
            sdkConfig = { ...defaultSdkConfig };
        }
    }
    return sdkConfig;
}

/**
 * Get current SDK configuration
 */
function getSdkConfig() {
    return { ...sdkConfig };
}

/**
 * Populate the config form with current values
 */
function populateConfigForm() {
    document.getElementById('configPollingInterval').value = sdkConfig.pollingInterval;
    document.getElementById('configMaxPollingAttempts').value = sdkConfig.maxPollingAttempts;
    document.getElementById('configModalTheme').value = sdkConfig.modalTheme;
    document.getElementById('configViewMode').value = sdkConfig.viewMode;
    document.getElementById('configTitle').value = sdkConfig.title || '';
    document.getElementById('configDescription').value = sdkConfig.description || '';
    document.getElementById('configShowCloseButton').checked = sdkConfig.showCloseButton;
    document.getElementById('configCloseOnBackdrop').checked = sdkConfig.closeOnBackdrop;
    document.getElementById('configCloseOnEscape').checked = sdkConfig.closeOnEscape;
}

/**
 * Read current values from the config form
 */
function readConfigFromForm() {
    return {
        pollingInterval: parseInt(document.getElementById('configPollingInterval').value, 10) || 2000,
        maxPollingAttempts: parseInt(document.getElementById('configMaxPollingAttempts').value, 10) || 30,
        modalTheme: document.getElementById('configModalTheme').value,
        viewMode: document.getElementById('configViewMode').value,
        title: document.getElementById('configTitle').value.trim(),
        description: document.getElementById('configDescription').value.trim(),
        showCloseButton: document.getElementById('configShowCloseButton').checked,
        closeOnBackdrop: document.getElementById('configCloseOnBackdrop').checked,
        closeOnEscape: document.getElementById('configCloseOnEscape').checked
    };
}

/**
 * Setup config panel event listeners
 * @param {Function} onConfigApply - Callback when config is applied (receives new config)
 * @param {Function} addDebugLog - Debug logging function from main app
 */
function setupConfigPanel(onConfigApply, addDebugLog) {
    const configBtn = document.getElementById('sdkConfigBtn');
    const configPanel = document.getElementById('sdkConfigPanel');
    const configOverlay = document.getElementById('sdkConfigOverlay');
    const configClose = document.getElementById('sdkConfigClose');
    const configReset = document.getElementById('sdkConfigReset');
    const configApplyBtn = document.getElementById('sdkConfigApply');
    
    // Open panel
    configBtn.addEventListener('click', () => {
        configPanel.classList.add('open');
        configOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    });
    
    // Close panel function
    const closePanel = () => {
        configPanel.classList.remove('open');
        configOverlay.classList.remove('open');
        document.body.style.overflow = '';
    };
    
    configClose.addEventListener('click', closePanel);
    configOverlay.addEventListener('click', closePanel);
    
    // Reset to defaults
    configReset.addEventListener('click', () => {
        sdkConfig = { ...defaultSdkConfig };
        populateConfigForm();
        if (addDebugLog) {
            addDebugLog('info', 'SDK Configuration reset to defaults');
        }
    });
    
    // Apply and close
    configApplyBtn.addEventListener('click', () => {
        // Read values from form
        sdkConfig = readConfigFromForm();
        
        // Save to localStorage
        localStorage.setItem('sdkConfig', JSON.stringify(sdkConfig));
        
        if (addDebugLog) {
            addDebugLog('success', 'SDK Configuration applied', sdkConfig);
        }
        
        // Notify main app
        if (onConfigApply) {
            onConfigApply(sdkConfig);
        }
        
        closePanel();
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && configPanel.classList.contains('open')) {
            closePanel();
        }
    });
}

/**
 * Get SDK invoke options based on current config
 * Used by main app when calling invokeSecurePrompt
 */
function getSdkInvokeOptions() {
    const options = {
        pollingInterval: sdkConfig.pollingInterval,
        maxPollingAttempts: sdkConfig.maxPollingAttempts,
        modalOptions: {
            theme: sdkConfig.modalTheme,
            viewMode: sdkConfig.viewMode,
            showCloseButton: sdkConfig.showCloseButton,
            closeOnBackdropClick: sdkConfig.closeOnBackdrop,
            closeOnEscape: sdkConfig.closeOnEscape
        }
    };
    
    // Only add optional fields if they have values
    if (sdkConfig.title) {
        options.modalOptions.title = sdkConfig.title;
    }
    if (sdkConfig.description) {
        options.modalOptions.description = sdkConfig.description;
    }
    
    return options;
}

// Export for use by main app
window.SdkConfigPanel = {
    init: initSdkConfig,
    getConfig: getSdkConfig,
    populateForm: populateConfigForm,
    setup: setupConfigPanel,
    getInvokeOptions: getSdkInvokeOptions,
    defaults: defaultSdkConfig
};

