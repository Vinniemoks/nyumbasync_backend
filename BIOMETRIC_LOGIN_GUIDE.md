# USB Fingerprint Scanner Login Guide

## Overview
NyumbaSync now supports biometric authentication using USB fingerprint scanners, Windows Hello, Touch ID, Face ID, and other WebAuthn-compatible devices.

## ✅ What's Been Implemented

### Backend (Complete)
- ✅ Biometric controller with all endpoints
- ✅ User model updated with biometric fields
- ✅ Routes registered at `/api/v1/biometric/*`
- ✅ WebAuthn protocol support
- ✅ Challenge-response authentication
- ✅ Multiple device support per user

### Features
- ✅ Register fingerprint/biometric device
- ✅ Login with fingerprint
- ✅ Multiple devices per account
- ✅ Device management (list, remove)
- ✅ Secure challenge-response flow
- ✅ Counter-based replay attack prevention

## 🔌 Hardware Requirements

### Supported Devices
- **USB Fingerprint Scanners** (FIDO2/WebAuthn compatible)
- **Windows Hello** (built-in Windows 10/11)
- **Touch ID** (MacBook, iMac)
- **Face ID** (iPhone, iPad with Safari)
- **YubiKey** (with biometric support)
- **Any FIDO2/WebAuthn compatible device**

### Recommended USB Fingerprint Scanners
1. **Kensington VeriMark** (~$50)
2. **Eikon Mini** (~$40)
3. **Synaptics FS7600** (~$60)
4. **Generic FIDO2 USB scanners** (~$20-30)

## 📋 Setup Process

### Step 1: Register Your Fingerprint Device

**Prerequisites:**
- You must be logged in with email/password first
- Have your USB fingerprint scanner connected

**API Endpoint:** `POST /api/v1/biometric/register/challenge`

**Request:**
```bash
curl -X POST https://mokuavinnie.tech/api/v1/biometric/register/challenge \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "challenge": "base64_encoded_challenge",
  "rp": {
    "name": "NyumbaSync",
    "id": "mokuavinnie.tech"
  },
  "user": {
    "id": "base64_user_id",
    "name": "user@example.com",
    "displayName": "John Doe"
  },
  "pubKeyCredParams": [
    { "type": "public-key", "alg": -7 },
    { "type": "public-key", "alg": -257 }
  ],
  "authenticatorSelection": {
    "authenticatorAttachment": "cross-platform",
    "requireResidentKey": false,
    "userVerification": "preferred"
  },
  "timeout": 60000,
  "attestation": "none"
}
```

### Step 2: Complete Registration

After scanning your fingerprint, send the credential:

**API Endpoint:** `POST /api/v1/biometric/register/verify`

**Request:**
```bash
curl -X POST https://mokuavinnie.tech/api/v1/biometric/register/verify \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "credential": {
      "id": "credential_id",
      "rawId": "raw_credential_id",
      "response": {
        "attestationObject": "base64_attestation"
      },
      "type": "public-key"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Biometric authentication enabled",
  "credentialId": "your_credential_id"
}
```

### Step 3: Login with Fingerprint

**API Endpoint:** `POST /api/v1/biometric/login/challenge`

**Request:**
```bash
curl -X POST https://mokuavinnie.tech/api/v1/biometric/login/challenge \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@example.com"
  }'
```

**Response:**
```json
{
  "challenge": "base64_challenge",
  "rpId": "mokuavinnie.tech",
  "allowCredentials": [
    {
      "type": "public-key",
      "id": "your_credential_id"
    }
  ],
  "userVerification": "preferred",
  "timeout": 60000
}
```

### Step 4: Complete Login

After scanning fingerprint:

**API Endpoint:** `POST /api/v1/biometric/login/verify`

**Request:**
```bash
curl -X POST https://mokuavinnie.tech/api/v1/biometric/login/verify \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@example.com",
    "credential": {
      "id": "credential_id",
      "response": {
        "authenticatorData": "base64_data",
        "signature": "base64_signature",
        "clientDataJSON": "base64_json"
      }
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "landlord",
    "phone": "254712345678"
  }
}
```

## 🖥️ Frontend Implementation

### Using WebAuthn API (JavaScript)

#### 1. Register Fingerprint

```javascript
async function registerFingerprint() {
  try {
    // Get challenge from backend
    const challengeResponse = await fetch('/api/v1/biometric/register/challenge', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });
    
    const options = await challengeResponse.json();
    
    // Convert base64 strings to ArrayBuffers
    options.challenge = base64ToArrayBuffer(options.challenge);
    options.user.id = base64ToArrayBuffer(options.user.id);
    
    // Create credential using WebAuthn
    const credential = await navigator.credentials.create({
      publicKey: options
    });
    
    // Send credential to backend
    const verifyResponse = await fetch('/api/v1/biometric/register/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        credential: {
          id: credential.id,
          rawId: arrayBufferToBase64(credential.rawId),
          response: {
            attestationObject: arrayBufferToBase64(credential.response.attestationObject)
          },
          type: credential.type
        }
      })
    });
    
    const result = await verifyResponse.json();
    console.log('Fingerprint registered:', result);
    
  } catch (error) {
    console.error('Registration failed:', error);
  }
}

// Helper functions
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
```

#### 2. Login with Fingerprint

```javascript
async function loginWithFingerprint(email) {
  try {
    // Get challenge
    const challengeResponse = await fetch('/api/v1/biometric/login/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: email })
    });
    
    const options = await challengeResponse.json();
    
    // Convert base64 to ArrayBuffer
    options.challenge = base64ToArrayBuffer(options.challenge);
    options.allowCredentials = options.allowCredentials.map(cred => ({
      ...cred,
      id: base64ToArrayBuffer(cred.id)
    }));
    
    // Get credential (triggers fingerprint scan)
    const assertion = await navigator.credentials.get({
      publicKey: options
    });
    
    // Send to backend for verification
    const verifyResponse = await fetch('/api/v1/biometric/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: email,
        credential: {
          id: assertion.id,
          response: {
            authenticatorData: arrayBufferToBase64(assertion.response.authenticatorData),
            signature: arrayBufferToBase64(assertion.response.signature),
            clientDataJSON: arrayBufferToBase64(assertion.response.clientDataJSON)
          }
        }
      })
    });
    
    const result = await verifyResponse.json();
    
    if (result.success) {
      localStorage.setItem('token', result.token);
      console.log('Login successful!', result.user);
      // Redirect to dashboard
      window.location.href = '/dashboard';
    }
    
  } catch (error) {
    console.error('Login failed:', error);
  }
}
```

### React Component Example

```jsx
import React, { useState } from 'react';

function BiometricLogin() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleBiometricLogin = async () => {
    setLoading(true);
    setError('');
    
    try {
      await loginWithFingerprint(email);
    } catch (err) {
      setError('Biometric login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="biometric-login">
      <h2>Login with Fingerprint</h2>
      
      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      
      <button 
        onClick={handleBiometricLogin}
        disabled={loading || !email}
      >
        {loading ? 'Scanning...' : '🔒 Login with Fingerprint'}
      </button>
      
      {error && <p className="error">{error}</p>}
      
      <p className="hint">
        Place your finger on the scanner when prompted
      </p>
    </div>
  );
}

export default BiometricLogin;
```

## 🔐 Security Features

### Challenge-Response Flow
- Each login generates a unique challenge
- Challenges expire after 5 minutes
- Prevents replay attacks

### Counter-Based Protection
- Each credential has a counter
- Counter increments with each use
- Detects cloned credentials

### Device Management
- Users can register multiple devices
- View all registered devices
- Remove devices remotely

## 📱 Device Management

### List Your Devices

**API Endpoint:** `GET /api/v1/biometric/credentials`

**Request:**
```bash
curl -X GET https://mokuavinnie.tech/api/v1/biometric/credentials \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "enabled": true,
  "credentials": [
    {
      "id": "credential_1",
      "createdAt": "2025-11-20T10:00:00Z",
      "lastUsed": "2025-11-20T15:30:00Z",
      "counter": 15
    },
    {
      "id": "credential_2",
      "createdAt": "2025-11-15T08:00:00Z",
      "lastUsed": "2025-11-19T12:00:00Z",
      "counter": 8
    }
  ]
}
```

### Remove a Device

**API Endpoint:** `DELETE /api/v1/biometric/credentials/:credentialId`

**Request:**
```bash
curl -X DELETE https://mokuavinnie.tech/api/v1/biometric/credentials/credential_1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Biometric credential removed"
}
```

## 🧪 Testing

### Test with Postman

1. **Register Device:**
   - POST `/api/v1/biometric/register/challenge`
   - Add Authorization header with JWT token
   - Save the challenge response

2. **Verify Registration:**
   - POST `/api/v1/biometric/register/verify`
   - Send credential data from your device

3. **Test Login:**
   - POST `/api/v1/biometric/login/challenge`
   - Send email/phone identifier
   - POST `/api/v1/biometric/login/verify`
   - Send credential assertion

## 🐛 Troubleshooting

### "Biometric authentication not enabled for this account"
- You need to register your fingerprint first
- Login with email/password, then register biometric

### "Challenge expired or invalid"
- Challenges expire after 5 minutes
- Request a new challenge

### "Invalid credential"
- The credential ID doesn't match any registered device
- Re-register your device

### "Failed to connect to localhost"
- Make sure your backend server is running
- Check the port (default: 10000)

### USB Scanner Not Detected
- Check if scanner is FIDO2/WebAuthn compatible
- Install manufacturer drivers if needed
- Try a different USB port
- Check browser compatibility (Chrome, Edge, Firefox, Safari)

## 🌐 Browser Compatibility

| Browser | Windows | macOS | Linux |
|---------|---------|-------|-------|
| Chrome  | ✅      | ✅    | ✅    |
| Edge    | ✅      | ✅    | ✅    |
| Firefox | ✅      | ✅    | ✅    |
| Safari  | ❌      | ✅    | ❌    |

## 📝 Environment Variables

Add to your `.env` file:

```env
# Relying Party ID (your domain)
RP_ID=mokuavinnie.tech

# For local development
# RP_ID=localhost
```

## 🚀 Deployment Checklist

- [ ] Backend deployed with biometric routes
- [ ] User model updated with biometric fields
- [ ] HTTPS enabled (required for WebAuthn)
- [ ] RP_ID environment variable set to your domain
- [ ] Frontend implements WebAuthn API
- [ ] USB fingerprint scanner connected
- [ ] Browser supports WebAuthn

## 📚 Additional Resources

- [WebAuthn Guide](https://webauthn.guide/)
- [FIDO Alliance](https://fidoalliance.org/)
- [MDN WebAuthn API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API)
- [Can I Use WebAuthn](https://caniuse.com/webauthn)

## 🎉 Success!

Once everything is set up, you can:
1. Register your USB fingerprint scanner
2. Login with just your fingerprint
3. No more passwords needed!
4. Faster and more secure authentication

---

**Status:** ✅ Fully Implemented and Ready to Use
**Last Updated:** November 20, 2025
