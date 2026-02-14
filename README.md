# Whiteboard — Real-time Collaborative Whiteboard

A responsive real-time multi-user whiteboard built with Vite + React and Firebase Realtime Database. Draw on the canvas, choose brush color and size, use the eraser, and watch strokes sync live to everyone in the same room. Made for the GitHub Copilot CLI Challenge to explore rapid prototyping.

## Demo

Live demo: https://coop-whiteboard.netlify.app

<video controls src="./demo.mp4" style="max-width:100%;height:auto"></video>

## Features

- Real-time syncing using Firebase Realtime Database
- Multiple rooms (share the URL to invite others)
- Brush color and size, eraser, undo, clear board, copy room link
- No authentication required by default (suitable for demos)

## Quickstart

1. Copy `.env.example` to `.env` and fill in your Firebase project values:

   ```bash
   cp .env.example .env
   # edit .env and paste your Firebase config values
   ```

2. Install dependencies and start the dev server:

   ```bash
   npm install
   npm run dev
   ```

3. Open the app in your browser, for example:

   ```
   http://localhost:5173/?room=your-room-id
   ```

   Leave the room field blank and click Join to create a new room; share the URL to collaborate.

## Firebase (Realtime Database)

- Enable Realtime Database in your Firebase project and set the `VITE_FIREBASE_DATABASE_URL` value in `.env`.
- For quick testing, the database rules can be permissive (not recommended for production):

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

- In production you should lock down rules and require authenticated writes or room tokens.

## Usage

- Use the toolbar to pick a color, adjust brush size, toggle the eraser, undo your last stroke, clear the board for everyone, or copy the room link to invite collaborators.
- Strokes are saved to `rooms/{roomId}/strokes` in the Realtime Database and are streamed to connected clients.

## Troubleshooting

- If strokes are not syncing, confirm your `.env` values and that Realtime Database is enabled and reachable and rules allow reads/writes.
- Check the browser console for errors related to Firebase initialization or database access.

## Deploy

Build and deploy to your preferred static host (Vercel, Netlify, Firebase Hosting). Provide the same Firebase env values in the deployment settings.

---

