# 🚀 Magical Auth Quick Start - Vanilla JavaScript

Experience carrier-grade phone authentication in **2 minutes**. No SMS, no delays, no fraud - just instant verification through SIM cards.

## 💨 Start in 30 Seconds

```bash
# Clone and install
npm install

# Copy environment file and add your OAuth2 credentials
cp env.example .env
# Then edit .env and add your GLIDE_CLIENT_ID and GLIDE_CLIENT_SECRET

# Run it!
npm start
```

**That's it!** Open http://localhost:3000 and try it out 🎉

## 🎮 What You Can Do

### Two Modes to Play With

**⚡ High Level Mode** (Default)
- One-click authentication
- SDK handles everything
- Perfect for production apps

**🔧 Granular Mode**
- See each step happening
- Great for understanding the flow
- Debug-friendly with full logging

### Two Use Cases to Try

1. **📲 Get Phone Number** - Retrieves the phone number from your SIM card
2. **✓ Verify Phone Number** - Confirms you own a specific phone number

## 🏗️ What's Inside

```
magical-auth-quickstart-vanilla/
├── public/
│   ├── index.html           # Main HTML page
│   ├── app.js               # Vanilla JS app (both modes)
│   ├── sdk-config-panel.js  # SDK configuration panel
│   └── styles.css           # Styling
├── server.js                # Express backend + static file serving
└── package.json             # Dependencies (both SDKs)
```

**Key Difference**: Single Express server serves both the frontend AND backend API. No build step needed!

## 🔧 Want Your Own Credentials?

The quickstart works out-of-the-box with our demo server. To use your own credentials:

1. Get your OAuth2 credentials from [Glide Dashboard](https://docs.glideidentity.com/)
2. Create `.env` file:
```env
GLIDE_CLIENT_ID=your_client_id_here
GLIDE_CLIENT_SECRET=your_client_secret_here
```
3. Restart the server - it'll use your credentials automatically!

## 👀 See What's Happening

### Enable Debug Mode

1. Toggle "Debug Mode" at the bottom of the page
2. Open browser console (F12)
3. Watch the magic:

```javascript
[PhoneAuth] PrepareResponse received: {...}
[Granular] Step 2: About to invoke secure prompt
[PhoneAuth] Credential obtained from browser
[Granular] Step 3: Final response: {phone_number: "+1234567890"}
```

### Understanding the Flow

**Step 1: Prepare** → Your server talks to Glide

**Step 2: Browser Prompt** → Secure carrier verification  

**Step 3: Process** → Get the verified result

## 🎨 Quick Customizations

### Change Carrier (for Get Phone Number)
```javascript
// In public/app.js (around line 211 and 274)
plmn: { mcc: '310', mnc: '260' }  // T-Mobile (default)
plmn: { mcc: '310', mnc: '004' }  // Verizon
```

### Customize Consent Text
```javascript
// In public/app.js
consent_data: {
  consent_text: 'Your custom message',
  policy_link: 'https://yoursite.com/privacy',
  policy_text: 'Your Policy'
}
```

### Change Server Port
```bash
# Default is 3000
PORT=3000 npm start
```

## 📱 Browser Requirements

Works on:
- **Chrome/Edge 128+** on Android ✅
- **Chrome/Edge Desktop** (with phone nearby) ✅
- **Safari** (coming soon) 🔜

## 🚀 What's Next?

Now that you've seen it work:

1. **Try both modes** - Toggle between High Level and Granular
2. **Check the console** - See all the API calls
3. **Look at the code** - Pure vanilla JavaScript in `public/app.js`
4. **Integrate into your app** - Copy the patterns you need

## 📚 Resources

- **[SDK Documentation](https://docs.glideidentity.com/)** - Full SDK reference and API docs

## 📦 SDK Loading Options

The quickstart supports multiple ways to load the SDK:

### Default: NPM Package (Recommended)
```javascript
// Already configured - SDK served from node_modules
<script src="/sdk/web-client-sdk.min.js"></script>
```

### Alternative: CDN
```html
<!-- unpkg (auto-syncs with npm) -->
<script src="https://unpkg.com/@glideidentity/glide-fe-sdk-web@5/dist/browser/web-client-sdk.min.js"></script>

<!-- jsDelivr (auto-syncs with npm) -->
<script src="https://cdn.jsdelivr.net/npm/@glideidentity/glide-fe-sdk-web@5/dist/browser/web-client-sdk.min.js"></script>
```

## 🌟 Why Vanilla JavaScript?

- **No build step** - Just npm install and run
- **No framework overhead** - Pure JavaScript
- **Easy to understand** - Simple file structure
- **Easy to integrate** - Copy patterns into any project
- **Web SDK** - Uses `PhoneAuthClient` from `@glideidentity/glide-fe-sdk-web`
- **Node SDK** - Backend uses `@glideidentity/glide-be-sdk-node`

## 💬 Need Help?

- **Email**: support@glideidentity.com

---

Built with ❤️ by Glide Identity | Making authentication magical ✨
