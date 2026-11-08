# CollabBoard — Collaborative Whiteboard

A real-time collaborative whiteboard built with React and Firebase. Create a room, share the room ID, and draw, write, and chat together.

**Live demo:** https://anand-whiteboard.netlify.app

## Screenshots

![Home page](./screenshots/whiteboard.png)
![Whiteboard](./screenshots/whiteboard2.png)

## Features

- Create or join rooms with a short room ID
- Real-time drawing synced to everyone in the room
- Tools: select, hand (pan), pencil, rectangle, circle, line, arrow, text, image upload, eraser
- Stroke colour and width, canvas background colour, zoom
- Undo and redo
- Live chat and participant list
- Host can lock the board so collaborators can view but not edit
- AI board summary (Google Gemini, called through a Netlify Function so the API key stays private)
- Export the board as PNG or PDF
- Light and dark mode, mobile-friendly layout

Coming soon: live cursors and version history.

## Tech stack

- React 19 + Vite
- Tailwind CSS, Framer Motion, Lucide icons
- Fabric.js (canvas engine, loaded from CDN)
- Firebase Authentication (anonymous) + Cloud Firestore (rooms, canvas, chat)
- Netlify hosting + Netlify Functions (AI summary)

## Getting started

```bash
git clone https://github.com/Anandkanil/collab-whiteboard.git
cd collab-whiteboard
npm install
cp .env.example .env   # then fill in your Firebase values
npm run dev
```

The app runs at http://localhost:5173.

To test the AI summary locally, use the Netlify CLI instead of `npm run dev`:

```bash
npx netlify dev
```

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_FIREBASE_*` | `.env` and Netlify | Firebase web app config (public by design) |
| `VITE_APP_ID` | `.env` and Netlify | Namespace for rooms in Firestore |
| `GEMINI_API_KEY` | Netlify only | Gemini API key for the AI summary. Never prefix with `VITE_`. |
| `GEMINI_MODEL` | Netlify (optional) | Override the Gemini model (default `gemini-flash-latest`, which always points at the current Flash model) |

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build into `dist/`
- `npm run preview` — preview the production build
- `npm run lint` — run ESLint

## Project structure

```
src/
  App.jsx        # app, landing page, and whiteboard
  main.jsx       # React entry point
  index.css      # Tailwind setup
netlify/
  functions/
    summarize.mjs  # AI summary endpoint
netlify.toml     # Netlify build settings
firestore.rules  # Firestore security rules
```

## Firebase security rules

The Firestore rules live in `firestore.rules`. Paste them into Firebase console → Firestore Database → Rules and click Publish whenever they change.

## Deployment

Pushing to `main` deploys automatically to Netlify.

## Author

[@Anandkanil](https://github.com/Anandkanil)
