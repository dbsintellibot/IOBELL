Title: TTS Default and Mobile Feature Parity Fix (ttsfix2)

You are updating the AutoBell product (web app and Android mobile app) to fix TTS configuration and feature parity between platforms.

Goals:
- Make Device Built-in (free) TTS the default TTS engine on both web and Android mobile app.
- Keep all third‑party TTS providers (OpenAI, Camb AI, ElevenLabs, etc.) available as optional choices in a dropdown selector.
- Ensure the Android mobile app exposes all features that exist on the web app, including but not limited to: TTS, voice notes, scheduling, and any other current or future web features.

Requirements:
- TTS defaults:
  - Set Device Built-in (free) TTS as the default TTS provider everywhere TTS is used in the product (web and Android).
  - If a user has not explicitly chosen a TTS provider, automatically use Device Built-in.
  - If a user previously selected a third‑party provider, keep their preference and do not silently override it.
- TTS provider selection UI:
  - On both web and Android, provide a single, consistent dropdown (or equivalent selector) listing:
    - Device Built-in (free) – marked clearly as the default/recommended option.
    - OpenAI TTS.
    - Camb AI TTS.
    - ElevenLabs TTS.
  - The dropdown must allow switching providers at any time.
  - Persist provider choice per user in the existing settings or profile storage layer so it is restored on next app launch or login.
- Platform behavior:
  - Web:
    - Use Device Built-in TTS by default, invoking the browser’s native TTS implementation when “Device Built-in” is selected.
    - When a third‑party provider is selected, route TTS requests through the appropriate API without breaking existing authentication or rate‑limit handling.
  - Android:
    - Use the system TTS engine when “Device Built-in” is selected.
    - When a third‑party provider is selected, route requests through the same backend/SDK logic as the web app where applicable, reusing existing abstractions.
- Feature parity (web → Android):
  - Bring all existing web features to the Android app, including at minimum:
    - TTS playback (using the selected provider).
    - Voice notes (recording, playback, and storage behavior equivalent to web).
    - Scheduling features (creating, editing, viewing, and cancelling scheduled items).
    - Any other features currently available on the web that are missing or limited on Android.
  - For each relevant feature:
    - Ensure the Android UI exposes the same capabilities as the web UI.
    - Reuse existing business logic and APIs where possible to stay aligned with the web behavior.
    - Do not introduce breaking changes to existing web flows.
- Configuration and safety:
  - Do not hard‑code API keys or secrets in client applications. Use the existing secure configuration mechanism (environment variables, backend‑side secrets, or configuration service).
  - Ensure that disabling a third‑party TTS provider (e.g., due to missing keys, quota, or admin configuration) automatically hides it from the dropdown or marks it as unavailable, while keeping Device Built-in fully functional.
  - Add any necessary error handling so that if a third‑party TTS call fails, the app shows a clear error message and does not crash.

Acceptance criteria:
- On a clean install/log‑in on both web and Android:
  - Device Built-in (free) TTS is pre‑selected as the default provider.
  - The dropdown shows Device Built-in, OpenAI, Camb AI, and ElevenLabs (subject to configuration).
  - Switching providers updates TTS behavior immediately without requiring an app restart.
- On Android, all web‑available features (including TTS, voice notes, scheduling, and any others) are accessible and behave consistently with the web app.
- No secrets are exposed in client code, and all existing authentication and rate‑limit protections remain intact.
