# Comprehensive Security Audit and Remediation Plan (AutoBell/NGPAS)

This prompt serves as a master action plan to secure the entire AutoBell application across all its layers (Backend, Web Dashboard, Mobile App, and IoT Firmware). The goal is to eliminate all vulnerabilities, ensure secure data handling, and implement enterprise-grade security best practices.

## Phase 1: Mobile App Security (React Native / Expo)
The mobile app currently stores sensitive data insecurely and requires immediate attention.

### 1.1 Secure Storage Migration
- **Vulnerability:** Sensitive API keys (OpenAI, ElevenLabs, CambAI, TopMediai) and active profile IDs are currently stored in plain text using `@react-native-async-storage/async-storage`. This leaves credentials exposed to extraction on compromised or rooted devices.
- **Action:** Replace all instances of `AsyncStorage` for sensitive data (API keys, session tokens, user credentials) with **Expo SecureStore** (`expo-secure-store`) or `react-native-keychain`.
- **Implementation:** Create a wrapper utility `SecureStorage.ts` to handle encryption and decryption seamlessly. Migrate existing data from `AsyncStorage` to `SecureStore` on app startup.

### 1.2 Network Security & Deep Linking
- **Vulnerability:** Unpinned certificates and insecure deep link handling.
- **Action:** Implement SSL Certificate Pinning to prevent Man-In-The-Middle (MITM) attacks. Ensure all deep links and universal links validate the intent and origin to prevent malicious URL hijacking.

## Phase 2: Web Dashboard Security (React / Vite)
The web dashboard suffers from client-side secret exposure and lacks defensive HTTP configurations.

### 2.1 Client-Side Secrets & LocalStorage
- **Vulnerability:** Third-party API keys for TTS providers are stored in `localStorage` in `Broadcast.tsx`. 
- **Action:** **Stop storing API keys on the client.** Move all third-party API integrations (OpenAI, ElevenLabs) to the Supabase Backend (Edge Functions). The frontend should only send a request to the Edge Function with the user's JWT. If users provide their own keys, store them securely in the backend (using Supabase Vault) and never expose them back to the client.
- **Action:** Ensure any remaining non-sensitive preferences in `localStorage` are sanitized before use.

### 2.2 Cross-Site Scripting (XSS) & Content Security Policy (CSP)
- **Vulnerability:** React prevents most XSS, but dangerouslySetInnerHTML or malicious data from the DB can still cause issues. Lack of CSP allows malicious script execution.
- **Action:** Implement a strict Content Security Policy (CSP) using meta tags or server headers. Restrict `script-src`, `connect-src` (allow only Supabase URL and trusted APIs), and `img-src`.
- **Action:** Audit all user inputs and sanitize data rendered on the screen.

## Phase 3: Firmware Security (ESP32)
The IoT devices are the most vulnerable edge points and require robust hardening.

### 3.1 Hardcoded Credentials & Plaintext HTTP
- **Vulnerability:** `SUPABASE_URL` and `SUPABASE_KEY` (likely the anon key) are hardcoded in `main_s3.cpp`. The device calls Supabase APIs with these. Also, `http://ip-api.com/json/` and radio streams use plaintext HTTP.
- **Action:** Implement secure device provisioning (e.g., via BLE or SoftAP) where the device receives a unique, short-lived JWT or device-specific token rather than using a global hardcoded key.
- **Action:** Switch all plaintext `http://` calls to `https://` (e.g., use an HTTPS GeoIP service). For radio streams, ensure fallback mechanisms if HTTPS streams are unavailable, but strictly validate the stream origin.

### 3.2 Secure Boot and OTA (Over-The-Air) Updates
- **Vulnerability:** Firmware updates might be downloaded and flashed without cryptographic verification.
- **Action:** Enable **ESP32 Secure Boot V2** and **Flash Encryption**.
- **Action:** Ensure OTA updates are downloaded over HTTPS and cryptographically signed. The ESP32 must verify the digital signature before applying the update.

## Phase 4: Backend & Database Security (Supabase)
The backend is the source of truth and must enforce strict access controls.

### 4.1 Row Level Security (RLS) Audit
- **Vulnerability:** Inconsistent RLS policies can lead to unauthorized data access or modification.
- **Action:** Audit every table in the database schema. Ensure `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` is applied universally.
- **Action:** Verify policies explicitly prevent cross-tenant access. A user belonging to `school_id = A` must never be able to read/write data for `school_id = B`.

### 4.2 RPC Functions & Privilege Escalation
- **Vulnerability:** Supabase RPCs run with `SECURITY DEFINER` by default if configured improperly, allowing them to bypass RLS.
- **Action:** Review all RPC functions (e.g., `register_device_from_esp`, `update_heartbeat`, `ack_command`). Ensure they use `SECURITY INVOKER` where possible, or explicitly check `auth.uid()` and tenant IDs inside `SECURITY DEFINER` functions to prevent unauthorized calls.

### 4.3 Supabase Vault for Secrets
- **Vulnerability:** Storing integration keys in standard tables.
- **Action:** Implement **Supabase Vault** to store third-party API keys (OpenAI, ElevenLabs) securely.

### 4.4 Rate Limiting & API Abuse
- **Vulnerability:** Endpoints and Edge Functions can be spammed.
- **Action:** Implement rate limiting on Edge Functions and critical RPCs (like authentication, registration, and TTS generation) to prevent DDoS and financial exhaustion (billing abuse).

---

## Execution Instructions for the AI:
When the user requests to execute this security plan, follow these steps systematically:
1. Begin with **Phase 1** and refactor the mobile app to use SecureStore.
2. Proceed to **Phase 2**, removing API keys from the Web Dashboard's `localStorage` and migrating the logic to Supabase Edge Functions.
3. Address **Phase 3** by implementing a secure provisioning flow for ESP32 and enforcing HTTPS.
4. Conclude with **Phase 4** by conducting a comprehensive SQL audit of RLS policies and RPC functions.
5. Provide a summary report upon completion of each phase.
