# Prompt: Refresh AutoBell Interfaces With Vibrant, Safe UX

**Goal:** Make the AutoBell Web Dashboard and Mobile App feel modern, vibrant, and clear about the impact of every action, while keeping them safe to use in real school environments.

---

## Visual Style Direction

- Use a bright, confident palette built around the existing theme system:
  - Primary accents: saturated blues, greens, and violets for normal actions.
  - Warning/destructive accents: saturated orange and red for risky actions.
- Prefer subtle gradients for key surfaces:
  - Headers, hero sections, and emergency areas can use top-left to bottom-right gradients.
  - Keep backgrounds light and neutral so data tables stay readable.
- Elevate key cards:
  - Use soft shadows, rounded corners, and slight scale/hover transitions.
  - Important metrics (next bell, active profile, device health) should stand out visually.
- Typography:
  - Use clear hierarchy: bold titles, medium-weight labels, and lighter helper text.
  - Ensure contrast ratios are accessible on all backgrounds.

---

## Buttons And Actions (Web + Mobile, Admin + Super Admin)

**Principle:** Every action that changes devices, schedules, or school-wide behavior must clearly explain its effect and offer a safe way to cancel.

- Classify buttons into three categories:
  - Primary actions (blue/green): safe, reversible, or low-impact (e.g., navigation, opening dialogs).
  - Warning actions (orange): noisy but non-destructive tests (e.g., buzzer/audio tests).
  - Destructive actions (red): permanent or disruptive changes (e.g., emergency stop, reboot devices, retire/unassign devices, delete profiles).
- For all warning or destructive actions:
  - Show a confirmation dialog with:
    - A short title that names the action (e.g., “Reboot Device”, “Retire Device”, “Emergency Stop All Bells”).
    - A clear, one-sentence explanation of what will happen.
    - A secondary line describing scope (e.g., “This will affect ALL devices in this school.”).
  - Provide two buttons:
    - **Cancel**: neutral styling (gray), always the first or left button.
    - **Continue**: colored according to the action:
      - Orange for tests or noisy-but-safe operations (“Continue Test”).
      - Red for destructive or school-wide actions (“Continue And Stop All Bells”, “Continue And Retire Device”).
  - Button text must describe the effect, not just “OK”:
    - Web: “Continue And Reboot Device”, “Continue And Unassign Device”.
    - Mobile: “Continue And Broadcast Alarm”, “Continue And Run Buzzer Test”.
- For emergency flows:
  - Use bold red backgrounds, strong icons (AlertTriangle), and pulsing animations to signal danger.
  - Include explicit warnings about scope: “ALL devices”, “entire school”, “cannot be undone”.

---

## Online/Offline School Status — Animated Logos

**Objective:** Make it immediately obvious which schools are online or offline using animated, color-coded logos.

- Represent each school with a circular logo badge:
  - If the school has `logo_url`, show the logo inside the circle.
  - Otherwise, show the first letter of the school name in a stylized letter badge.
- Status rules:
  - A school is “online” if any of its devices has:
    - `status = 'online'`, or
    - A recent heartbeat within the last 5 minutes.
  - Otherwise, treat it as “offline”.
- Web Dashboard (Super Admin):
  - In school lists, show a circular logo with an animated ring:
    - Online:
      - Outer ring: green (`bg-green-100`, `ring-2 ring-green-500`).
      - Small status dot: solid green with a gentle `animate-ping`.
      - Optional slow `animate-pulse` on the ring to give a “live” feel.
    - Offline:
      - Outer ring: red (`bg-red-100`, `ring-2 ring-red-500`).
      - Small status dot: solid red with `animate-ping`.
  - Next to the logo, show a compact “Online” / “Offline” pill badge with matching colors.
- Mobile App:
  - Use a similar concept in school or device context:
    - Online: green circular badge with subtle pulse.
    - Offline: red circular badge with subtle pulse.
  - Keep animations light to avoid battery drain and motion sickness.

---

## Device Status And Tests

- Device status indicators:
  - For devices, use color-coded badges:
    - Online: green pill with an icon and “ONLINE”.
    - Offline: gray or red pill with “OFFLINE” or “NO HEARTBEAT”.
  - Where space allows, include the last seen timestamp in muted text.
- For test buttons (buzzer, test audio, reboot):
  - Style as compact, high-contrast buttons (orange/green/red).
  - Wrap each test in a warning confirmation with:
    - A short description (e.g., “This will briefly ring the buzzer in this location.”).
    - “Cancel” and “Continue Test” buttons with appropriate colors.

---

## Consistency Across Web And Mobile

- Use the same concepts and wording on both platforms:
  - “Emergency Stop”, “Manual Trigger”, “Active Profile”, “Online/Offline”.
  - Align confirmation text so admins/operators understand behavior regardless of device.
- On web (React + Tailwind + shadcn):
  - Use modal dialogs for confirmations with clear headings, descriptive text, and two-button layouts.
  - Apply Tailwind animation utilities (`animate-pulse`, `animate-ping`) for live status rings and dots.
- On mobile (React Native):
  - Use `Alert.alert` for confirmations with explicit button labels (“Cancel”, “Continue And Reboot Device”).
  - Use `react-native-reanimated` or built-in animations for subtle pulsing status indicators where appropriate.

---

## Accessibility And Safety

- Ensure all text meets WCAG contrast guidelines against its background.
- Never rely solely on color:
  - Pair green/red with clear labels: “ONLINE”, “OFFLINE”, “EMERGENCY”.
- Always provide a clear, safe exit:
  - “Cancel” should never perform side effects.
  - Destructive actions should require explicit confirmation every time.

