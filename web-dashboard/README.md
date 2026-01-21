# AutoBell Web Dashboard Setup

This is a Next.js web application that serves as the control panel for your AutoBell SaaS system. It is mobile-responsive, so it acts as both your Web Portal and Mobile App.

## Prerequisites
1.  **Node.js**: Installed on your computer.
2.  **Supabase Project**: You need the URL and ANON KEY from your Supabase project settings.

## Setup Steps

1.  **Install Dependencies**
    ```bash
    cd web-dashboard
    npm install
    ```

2.  **Configure Environment Variables**
    Create a file named `.env.local` in the `web-dashboard` folder and add your keys:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
    ```

3.  **Run Locally**
    ```bash
    npm run dev
    ```
    Open `http://localhost:3000` in your browser.

## Deployment (SaaS)
To make this accessible to your users worldwide:
1.  Push this code to **GitHub**.
2.  Connect your GitHub repo to **Vercel** (vercel.com).
3.  Add the same Environment Variables in Vercel settings.
4.  Your app will be live at `https://autobell-dashboard.vercel.app`.

## Mobile App Strategy
This web app is **Responsive**.
-   **Android**: Open in Chrome -> Menu -> "Add to Home Screen". It will look and feel like an app.
-   **iOS**: Open in Safari -> Share -> "Add to Home Screen".
