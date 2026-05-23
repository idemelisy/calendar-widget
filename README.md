# Calendar Widget MVP

Apple-like Windows desktop calendar widget built with Tauri + React.

## Run

1. Install dependencies:
   - `npm install`
2. Optional Google setup:
   - Copy `.env.example` to `.env`
   - Set `VITE_GOOGLE_CLIENT_ID`
3. Web preview:
   - `npm run dev`
4. Desktop app:
   - `npm run tauri dev`

## Samsung Calendar

Samsung Calendar typically syncs through Google Calendar for cross-device access.
Use `Connect Samsung` in the widget, authenticate in the browser, and paste the `access_token` value when prompted.

If OAuth is not configured, the app falls back to demo events for UI testing.
