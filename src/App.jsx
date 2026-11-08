/* global __app_id, __initial_auth_token */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Circle,
  Copy,
  Download,
  Eraser,
  FileText,
  GripVertical,
  Image as ImageIcon,
  Lock,
  LogOut,
  MessageSquare,
  Minus,
  Moon,
  MousePointer2,
  Move,
  Paintbrush,
  Pencil,
  Plus,
  Redo2,
  Send,
  Sparkles,
  Square,
  Sun,
  Type,
  Undo2,
  Users,
  Wand2,
} from 'lucide-react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { initializeApp } from 'firebase/app';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCustomToken,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);
const appId =
  import.meta.env.VITE_APP_ID ||
  (typeof __app_id !== 'undefined' ? __app_id : 'collab-whiteboard-v2');

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;

const DEFAULT_STROKE = '#000000';
const DEFAULT_STROKE_WIDTH = 2;
const DEFAULT_BACKGROUND = '#ffffff';
const MOBILE_BREAKPOINT = 768;
const DESKTOP_PANEL_BREAKPOINT = 1024;

const TOOL = {
  SELECT: 'select',
  HAND: 'hand',
  DRAW: 'draw',
  RECT: 'rectangle',
  CIRCLE: 'circle',
  LINE: 'line',
  ARROW: 'arrow',
  TEXT: 'text',
  IMAGE: 'image',
  ERASER: 'eraser',
};

const BG_SWATCHES = [
  '#ffffff',
  '#f3f4f6',
  '#111827',
  '#fde68a',
  '#bfdbfe',
  '#d1fae5',
  '#fecdd3',
  '#e9d5ff',
];

const createCursor = (svg, x, y) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, auto`;

const ERASER_CURSOR = createCursor(
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><path d="M9 21 3.5 15.5a2.5 2.5 0 0 1 0-3.5L12 3.5a2.5 2.5 0 0 1 3.5 0l9 9a2.5 2.5 0 0 1 0 3.5L18.5 21H9Z" fill="%23f8fafc" stroke="%230f172a" stroke-width="1.5"/><path d="M11.5 21 20 12.5" stroke="%23ef4444" stroke-width="1.5" stroke-linecap="round"/><path d="M7.5 24.5h14" stroke="%2394a3b8" stroke-width="1.5" stroke-linecap="round"/></svg>',
  6,
  22,
);

const COLLAB_PANEL_WIDTH = 320;
const TOOLBAR_MAX_WIDTH = 720;

// Width left for the floating toolbar (tablet/desktop) so it never covers the
// collaboration panel.
const getToolbarAvailableWidth = (viewportWidth, isPanelOpen) =>
  isPanelOpen ? viewportWidth - COLLAB_PANEL_WIDTH - 36 : viewportWidth;

const getDefaultToolbarPosition = (viewportWidth, isPanelOpen) => {
  const available = getToolbarAvailableWidth(viewportWidth, isPanelOpen);
  const estimatedToolbarWidth = Math.min(TOOLBAR_MAX_WIDTH, available - 24);

  return {
    x: Math.max(12, Math.round((available - estimatedToolbarWidth) / 2)),
    y: 70,
  };
};

// Mouse events carry clientX/Y directly; touch events keep them on the touch.
const getClientPoint = (event) => event?.touches?.[0] || event?.changedTouches?.[0] || event;

const isCoarsePointer = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

const getCanvasCursor = (tool) => {
  if (tool === TOOL.ERASER) return ERASER_CURSOR;
  if (tool === TOOL.HAND) return 'grab';
  return 'crosshair';
};

const getBoardSessionId = () => {
  const key = 'cb-board-session-id';
  const existing = window.sessionStorage.getItem(key);

  if (existing) return existing;

  const nextId = `session-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  window.sessionStorage.setItem(key, nextId);
  return nextId;
};

const generateRoomId = () => Math.random().toString(36).slice(2, 9).toUpperCase();

const copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }

  const area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand('copy');
    document.body.removeChild(area);
    return true;
  } catch {
    document.body.removeChild(area);
    return false;
  }
};

// Builds a one-page PDF that contains a single JPEG image. Written by hand so
// the app needs no extra PDF library.
const buildPdfFromJpeg = (jpegBinary, imageWidth, imageHeight) => {
  const pageWidth = Math.round(imageWidth * 0.75);
  const pageHeight = Math.round(imageHeight * 0.75);
  const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBinary.length} >>\nstream\n${jpegBinary}\nendstream`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n%\u00ff\u00ff\u00ff\u00ff\n';
  const offsets = objects.map((body, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) {
    bytes[i] = pdf.charCodeAt(i) & 0xff;
  }
  return new Blob([bytes], { type: 'application/pdf' });
};

const toolButtonClass = (active) =>
  `h-10 w-10 shrink-0 rounded-xl border transition-all flex items-center justify-center ${
    active
      ? 'bg-slate-900 text-white border-slate-900 shadow-md dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
      : 'bg-white/90 text-slate-600 border-slate-200 hover:bg-slate-100 dark:bg-slate-900/90 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800'
  }`;

function App() {
  const sessionIdRef = useRef(getBoardSessionId());
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [notification, setNotification] = useState(null);
  const [isFabricLoaded, setIsFabricLoaded] = useState(() => Boolean(window.fabric));
  const [isBoardLoading, setIsBoardLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('cb-theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('cb-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (window.fabric) return;

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js';
    script.async = true;
    script.onload = () => setIsFabricLoaded(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!auth) return;

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error('Authentication failed', err);
      }
    };

    initAuth();
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  const notificationTimerRef = useRef(null);
  const showNotification = (message) => {
    setNotification(message);
    window.clearTimeout(notificationTimerRef.current);
    notificationTimerRef.current = window.setTimeout(() => setNotification(null), 3000);
  };

  const createRoom = async () => {
    if (!db) return showNotification('Firebase config missing. Check your .env.');
    if (!user) return showNotification('Please wait, authentication in progress...');
    if (!username.trim()) return showNotification('Enter your name first.');

    const newRoom = generateRoomId();
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', newRoom);

    try {
      await setDoc(roomRef, {
        roomId: newRoom,
        hostId: user.uid,
        hostSessionId: sessionIdRef.current,
        hostName: username.trim(),
        createdAt: Date.now(),
        isLocked: false,
        canvasData: JSON.stringify({ objects: [], version: '5.3.0' }),
        canvasSettings: {
          backgroundColor: DEFAULT_BACKGROUND,
        },
        lastUpdatedAt: Date.now(),
        lastUpdatedByClient: null,
        participants: [{ uid: user.uid, name: username.trim() }],
      });
    } catch (err) {
      console.error('Creating room failed', err);
      return showNotification('Could not create the board. Please try again.');
    }

    setRoomId(newRoom);
    setIsBoardLoading(true);
    setView('board');
  };

  const joinRoom = async (e) => {
    e?.preventDefault();

    if (!db) return showNotification('Firebase config missing. Check your .env.');
    if (!user) return showNotification('Please wait, authentication in progress...');
    if (!roomId.trim() || !username.trim()) {
      return showNotification('Enter room ID and your name.');
    }

    const normalized = roomId.trim().toUpperCase();
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', normalized);
    try {
      const snap = await getDoc(roomRef);

      if (!snap.exists()) {
        return showNotification('Room not found.');
      }

      await updateDoc(roomRef, {
        participants: arrayUnion({ uid: user.uid, name: username.trim() }),
      });
    } catch (err) {
      console.error('Joining room failed', err);
      return showNotification('Could not join the board. Please try again.');
    }

    setRoomId(normalized);
    setIsBoardLoading(true);
    setView('board');
  };

  if (!isFabricLoaded) {
    return (
      <LoaderScreen
        title="Booting canvas engine"
        subtitle="Preparing your collaborative workspace..."
      />
    );
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-100 dark:bg-slate-950 p-6">
        <div className="max-w-lg w-full rounded-3xl p-8 border bg-white border-amber-200 shadow-xl dark:bg-slate-900 dark:border-amber-800">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Configuration required</h1>
          <p className="mt-3 text-slate-600 dark:text-slate-300">Firebase variables are missing from your environment.</p>
          <p className="mt-2 text-slate-600 dark:text-slate-300">Create a .env file and restart the app.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <AnimatePresence>
        {notification && (
          <Motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] rounded-full px-5 py-2 text-sm bg-slate-900 text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
          >
            {notification}
          </Motion.div>
        )}
      </AnimatePresence>

      {view === 'landing' && (
        <LandingPage
          username={username}
          roomId={roomId}
          setUsername={setUsername}
          setRoomId={setRoomId}
          createRoom={createRoom}
          joinRoom={joinRoom}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((v) => !v)}
          showNotification={showNotification}
        />
      )}

      {view === 'board' && (
        <>
          {isBoardLoading && (
            <LoaderScreen
              title="Loading your collaborative board..."
              subtitle="Syncing participants, canvas, and session state"
            />
          )}
          <WhiteboardInterface
            user={user}
            roomId={roomId}
            username={username}
            sessionId={sessionIdRef.current}
            darkMode={darkMode}
            onExit={() => {
              setView('landing');
              setIsBoardLoading(false);
            }}
            onReady={() => setIsBoardLoading(false)}
            onToggleDark={() => setDarkMode((v) => !v)}
            showNotification={showNotification}
          />
        </>
      )}
    </div>
  );
}

function LoaderScreen({ title, subtitle }) {
  return (
    <div className="fixed inset-0 z-[90] bg-white/85 dark:bg-slate-950/90 backdrop-blur-sm grid place-items-center">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 rounded-full border-4 border-slate-300 border-t-slate-700 dark:border-slate-700 dark:border-t-slate-100 animate-spin" />
        <p className="mt-4 text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

function LandingPage({
  username,
  roomId,
  setUsername,
  setRoomId,
  createRoom,
  joinRoom,
  darkMode,
  onToggleDark,
  showNotification,
}) {
  const nameInputRef = useRef(null);
  const roomInputRef = useRef(null);

  const focusField = (ref) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => ref.current?.focus({ preventScroll: true }), 250);
  };

  // Hero buttons guide people to the form instead of failing silently.
  const handleHeroCreate = () => {
    if (!username.trim()) {
      focusField(nameInputRef);
      showNotification('Enter your name to create a board.');
      return;
    }
    createRoom();
  };

  const handleHeroJoin = () => {
    if (username.trim() && roomId.trim()) {
      joinRoom();
      return;
    }
    focusField(username.trim() ? roomInputRef : nameInputRef);
    showNotification(username.trim() ? 'Enter the room ID you were given.' : 'Enter your name and the room ID to join.');
  };

  const floating = [
    { left: '6%', top: '14%', delay: 0, color: 'bg-amber-200' },
    { left: '14%', top: '76%', delay: 0.25, color: 'bg-rose-200' },
    { left: '84%', top: '20%', delay: 0.35, color: 'bg-sky-200' },
    { left: '78%', top: '78%', delay: 0.55, color: 'bg-emerald-200' },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f6fb] dark:bg-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,#fff9e8_0%,#edf4ff_45%,#eefcf4_100%)] dark:bg-[linear-gradient(130deg,#0f172a_0%,#111827_55%,#0b1220_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(#94a3b8_0.6px,transparent_0.6px)] [background-size:26px_26px] dark:opacity-10" />

      {floating.map((dot, idx) => (
        <Motion.div
          key={idx}
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: [-2, 8, -2], opacity: 0.65 }}
          transition={{ duration: 4.2, repeat: Infinity, delay: dot.delay }}
          className={`pointer-events-none absolute hidden lg:block h-12 w-12 rounded-2xl blur-[0.5px] ${dot.color} dark:opacity-30`}
          style={{ left: dot.left, top: dot.top }}
        />
      ))}

      <header className="relative z-20 pointer-events-auto mx-auto max-w-6xl px-6 pt-6 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/75 border border-slate-200 shadow-sm backdrop-blur dark:bg-slate-900/70 dark:border-slate-700">
          <Wand2 size={16} />
          <span className="text-sm font-semibold tracking-wide">CollabBoard</span>
        </div>

        <button onClick={onToggleDark} className="h-10 w-10 rounded-xl border grid place-items-center bg-white/80 border-slate-200 shadow-sm dark:bg-slate-900/80 dark:border-slate-700">
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <main className="relative z-20 pointer-events-auto mx-auto max-w-6xl px-4 sm:px-6 py-8 lg:py-16 grid lg:grid-cols-[1.05fr_0.95fr] gap-8 lg:gap-x-10 items-start">
        <section className="pt-2 lg:col-start-1 lg:row-start-1">
          <Motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="inline-flex items-center gap-2 rounded-full border border-amber-300/80 bg-amber-50/90 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <Sparkles size={12} />
            Realtime team whiteboard
          </Motion.p>

          <Motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.96]"
          >
            Collaborate. Draw. Think visually.
          </Motion.h1>

          <Motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mt-5 text-lg text-slate-600 dark:text-slate-300 max-w-2xl"
          >
            A real-time collaborative whiteboard for teams and creators.
          </Motion.p>

          <Motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.2 }}
            className="mt-8 flex flex-wrap gap-3"
          >
            <button
              onClick={handleHeroCreate}
              className="flex-1 sm:flex-none whitespace-nowrap text-sm sm:text-base px-4 sm:px-6 py-3 rounded-xl bg-gradient-to-r from-slate-900 to-slate-700 text-white font-semibold hover:from-slate-800 hover:to-slate-700 shadow-lg shadow-slate-300/70 dark:from-slate-100 dark:to-slate-300 dark:text-slate-900 dark:shadow-slate-900/40"
            >
              Create New Board
            </button>
            <button
              onClick={handleHeroJoin}
              className="flex-1 sm:flex-none whitespace-nowrap text-sm sm:text-base px-4 sm:px-6 py-3 rounded-xl bg-white/90 border border-slate-300 text-slate-800 font-semibold hover:bg-white shadow-sm dark:bg-slate-900/80 dark:border-slate-700 dark:text-slate-100"
            >
              Join Existing Board
            </button>
          </Motion.div>
        </section>

        <section className="space-y-4 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <Motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="hidden sm:block rounded-3xl p-5 bg-white/75 border border-white/95 shadow-xl backdrop-blur dark:bg-slate-900/70 dark:border-slate-700"
          >
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-gradient-to-br from-white to-slate-100 dark:from-slate-900 dark:to-slate-800">
              <div className="h-44 relative">
                <Motion.div
                  className="absolute left-8 top-8 h-12 w-28 border-2 border-cyan-500 rounded-lg"
                  animate={{ rotate: [0, 2, -2, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity }}
                />
                <Motion.div
                  className="absolute left-20 top-24 h-12 w-12 rounded-full border-2 border-rose-500"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 2.2, repeat: Infinity }}
                />
                <Motion.div
                  className="absolute right-10 top-14 h-1 w-24 bg-slate-700 dark:bg-slate-100"
                  animate={{ scaleX: [0.6, 1, 0.7] }}
                  transition={{ duration: 2.7, repeat: Infinity }}
                />
                <Motion.div
                  className="absolute right-10 top-20 px-2 py-1 rounded bg-amber-200 text-[10px] font-semibold text-amber-900"
                  animate={{ opacity: [0.5, 1, 0.6] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                >
                  Brainstorm
                </Motion.div>
                <Motion.div
                  className="absolute left-1/2 -translate-x-1/2 bottom-4 rounded-full bg-white/80 px-3 py-1 text-[10px] font-semibold border border-slate-300 text-slate-700"
                  animate={{ y: [0, -2, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  Shared board preview
                </Motion.div>
              </div>
            </div>
          </Motion.div>

          <Motion.form
            onSubmit={joinRoom}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.3 }}
            className="rounded-3xl p-5 bg-white/80 border border-white/95 shadow-xl backdrop-blur space-y-3 dark:bg-slate-900/80 dark:border-slate-700"
          >
            <p className="text-sm font-semibold">Jump into a room</p>
            <input
              ref={nameInputRef}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your name"
              className="w-full h-11 rounded-xl px-4 border border-slate-300 bg-white/90 outline-none focus:ring-2 focus:ring-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:focus:ring-slate-100"
            />
            <div className="flex gap-2">
              <input
                ref={roomInputRef}
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Room ID"
                autoCapitalize="characters"
                className="min-w-0 flex-1 h-11 rounded-xl px-4 border border-slate-300 bg-white/90 outline-none focus:ring-2 focus:ring-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:focus:ring-slate-100"
              />
              <button type="submit" className="h-11 px-4 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                Join
              </button>
            </div>
            <button
              type="button"
              onClick={createRoom}
              className="w-full h-11 rounded-xl border border-slate-300 bg-white/90 hover:bg-white dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Create Room
            </button>
          </Motion.form>
        </section>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:col-start-1 lg:row-start-2">
            {[
              ['Real-time collaboration', 'Draw together and see each other\'s changes appear instantly.'],
              ['AI whiteboard summary', 'Generate quick summaries of ideas and next steps.'],
              ['Undo & redo', 'Step back and forward through your changes while you work.'],
              ['Export to PNG or PDF', 'Download snapshots for documentation and handoff.'],
              ['Live chat', 'Keep board discussion in context.'],
              ['Live cursors', 'See where everyone is pointing on the board.', true],
              ['Version history', 'Return to earlier versions of a board anytime.', true],
            ].map(([title, text, comingSoon]) => (
              <Motion.div
                key={title}
                whileHover={{ y: -3 }}
                className={`rounded-2xl p-4 bg-white/65 border border-white/90 shadow-md backdrop-blur dark:bg-slate-900/60 dark:border-slate-700 ${comingSoon ? 'opacity-75' : ''}`}
              >
                <p className="font-semibold text-sm flex flex-wrap items-center gap-2">
                  {title}
                  {comingSoon && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-200">
                      Coming soon
                    </span>
                  )}
                </p>
                <p className="text-xs mt-2 text-slate-600 dark:text-slate-300">{text}</p>
              </Motion.div>
            ))}
        </div>
      </main>
    </div>
  );
}

function WhiteboardInterface({
  user,
  roomId,
  username,
  sessionId,
  darkMode,
  onExit,
  onReady,
  onToggleDark,
  showNotification,
}) {
  const canvasRef = useRef(null);
  const imageInputRef = useRef(null);
  const toolbarRef = useRef(null);
  const clientIdRef = useRef(`client-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`);
  const toolbarMovedRef = useRef(false);
  const toolbarDragRef = useRef({
    pointerId: null,
    offsetX: 0,
    offsetY: 0,
  });

  const [fCanvas, setFCanvas] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [activeTool, setActiveTool] = useState(TOOL.DRAW);
  const [strokeColor, setStrokeColor] = useState(DEFAULT_STROKE);
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND);
  const [showBgModal, setShowBgModal] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [showPanHint, setShowPanHint] = useState(true);
  const [messages, setMessages] = useState([]);
  const [chatMsg, setChatMsg] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activePanel, setActivePanel] = useState('chat');
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const isMobile = viewport.width < MOBILE_BREAKPOINT;
  const [isCollaborationOpen, setIsCollaborationOpen] = useState(
    () => window.innerWidth >= DESKTOP_PANEL_BREAKPOINT,
  );
  const [toolbarPosition, setToolbarPosition] = useState(() =>
    getDefaultToolbarPosition(window.innerWidth, window.innerWidth >= DESKTOP_PANEL_BREAKPOINT),
  );
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef(null);

  // Close the export menu when tapping or clicking anywhere else.
  useEffect(() => {
    if (!showExportMenu) return undefined;
    const onPointerDown = (event) => {
      if (!exportMenuRef.current?.contains(event.target)) setShowExportMenu(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setShowExportMenu(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showExportMenu]);
  const [isTouchDevice] = useState(isCoarsePointer);
  const toolbarAvailableWidth = getToolbarAvailableWidth(viewport.width, isCollaborationOpen && !isMobile);
  const isMobileSheetOpen = isMobile && isCollaborationOpen;

  const isApplyingRemoteRef = useRef(false);
  const isApplyingHistoryRef = useRef(false);
  const hostSessionSyncRef = useRef(false);
  const pendingShapeRef = useRef(null);
  const remoteVersionRef = useRef(null);
  const panRef = useRef({
    isDragging: false,
    lastX: 0,
    lastY: 0,
    prevSelection: true,
    prevDrawingMode: false,
  });

  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  const clampToolbarPosition = (position) => {
    const toolbarWidth = toolbarRef.current?.offsetWidth || Math.min(viewport.width - 24, 620);
    const toolbarHeight = toolbarRef.current?.offsetHeight || 64;

    return {
      x: Math.min(Math.max(12, position.x), Math.max(12, viewport.width - toolbarWidth - 12)),
      y: Math.min(Math.max(12, position.y), Math.max(12, viewport.height - toolbarHeight - 12)),
    };
  };

  const roomRef = useMemo(
    () => doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId),
    [roomId],
  );

  const isCurrentHost = roomData?.hostSessionId
    ? roomData.hostSessionId === sessionId
    : roomData?.hostId === user?.uid;

  const isBoardLockedForMe = Boolean(roomData?.isLocked && !isCurrentHost);

  // Refs let canvas event handlers (registered once) see the latest values.
  const isLockedRef = useRef(false);
  const activeToolRef = useRef(TOOL.DRAW);
  isLockedRef.current = isBoardLockedForMe;
  activeToolRef.current = activeTool;

  const applyObjectInteractivity = () => {
    if (!fCanvas) return;
    const selectable = !isLockedRef.current && activeToolRef.current === TOOL.SELECT;
    fCanvas.forEachObject((obj) => {
      obj.selectable = selectable;
      obj.evented = !isLockedRef.current;
    });
  };

  const lastLockToastRef = useRef(0);
  const notifyBoardLocked = () => {
    const now = Date.now();
    if (now - lastLockToastRef.current < 3000) return;
    lastLockToastRef.current = now;
    showNotification('The host has locked this board. You can look around, but not edit.');
  };

  const serializeSnapshot = () =>
    JSON.stringify({
      canvasData: fCanvas?.toJSON(['id']) || { objects: [], version: '5.3.0' },
      backgroundColor,
    });

  const applySnapshot = (snapshotString) => {
    if (!fCanvas || !window.fabric || !snapshotString) return;
    const parsed = JSON.parse(snapshotString);
    const nextCanvasData = parsed.canvasData || { objects: [], version: '5.3.0' };
    const nextBackground = parsed.backgroundColor || DEFAULT_BACKGROUND;

    isApplyingRemoteRef.current = true;
    fCanvas.loadFromJSON(nextCanvasData, () => {
      setBackgroundColor(nextBackground);
      fCanvas.backgroundColor = nextBackground;
      applyObjectInteractivity();
      fCanvas.renderAll();
      isApplyingRemoteRef.current = false;
    });
  };

  const pushHistory = () => {
    if (!fCanvas) return;
    const snapshot = serializeSnapshot();
    const undo = undoStackRef.current;
    if (undo[undo.length - 1] === snapshot) return;
    undo.push(snapshot);
    if (undo.length > 80) undo.shift();
    redoStackRef.current = [];
  };

  const syncRoomCanvas = async () => {
    if (!fCanvas || !db || isApplyingRemoteRef.current || isLockedRef.current) return;
    const payload = JSON.stringify(fCanvas.toJSON(['id']));

    await updateDoc(roomRef, {
      canvasData: payload,
      canvasSettings: {
        backgroundColor,
      },
      lastUpdatedAt: Date.now(),
      lastUpdatedByClient: clientIdRef.current,
      lastUpdatedByUser: user.uid,
    });
  };

  useEffect(() => {
    const onResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (viewport.width < MOBILE_BREAKPOINT) {
      setIsCollaborationOpen(false);
    }
  }, [viewport.width]);

  useEffect(() => {
    setToolbarPosition((current) => {
      if (!toolbarMovedRef.current) {
        return clampToolbarPosition(
          getDefaultToolbarPosition(viewport.width, isCollaborationOpen && !isMobile),
        );
      }

      return clampToolbarPosition(current);
    });
  }, [isCollaborationOpen, isMobile, viewport.height, viewport.width]);

  useEffect(() => {
    const onPointerMove = (event) => {
      if (toolbarDragRef.current.pointerId !== event.pointerId) return;

      setToolbarPosition(
        clampToolbarPosition({
          x: event.clientX - toolbarDragRef.current.offsetX,
          y: event.clientY - toolbarDragRef.current.offsetY,
        }),
      );
    };

    const stopDragging = (event) => {
      if (toolbarDragRef.current.pointerId !== event.pointerId) return;
      toolbarDragRef.current.pointerId = null;
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      document.body.style.userSelect = '';
    };
  }, [viewport.height, viewport.width]);

  useEffect(() => {
    if (!window.fabric) return;
    const fabric = window.fabric;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: DEFAULT_BACKGROUND,
      isDrawingMode: true,
      selection: false,
      preserveObjectStacking: true,
    });

    canvas.includeDefaultValues = false;
    canvas.freeDrawingBrush.color = DEFAULT_STROKE;
    canvas.freeDrawingBrush.width = DEFAULT_STROKE_WIDTH;
    setFCanvas(canvas);

    const onResize = () => {
      canvas.setDimensions({ width: window.innerWidth, height: window.innerHeight });
      canvas.renderAll();
    };

    window.addEventListener('resize', onResize);
    return () => {
      canvas.dispose();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useEffect(() => {
    if (!fCanvas || !db || !user) return;

    let readyEmitted = false;

    const unsubRoom = onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) return;

      const data = snap.data();
      setRoomData(data);

      const nextBg = data.canvasSettings?.backgroundColor || DEFAULT_BACKGROUND;
      setBackgroundColor(nextBg);
      fCanvas.backgroundColor = nextBg;

      const remoteVersion = `${data.lastUpdatedAt || 0}-${data.lastUpdatedByClient || 'none'}`;
      const isNewVersion = remoteVersionRef.current !== remoteVersion;
      remoteVersionRef.current = remoteVersion;

      const fromOtherClient = data.lastUpdatedByClient !== clientIdRef.current;

      if ((fCanvas.getObjects().length === 0 && data.canvasData) || (isNewVersion && fromOtherClient && data.canvasData)) {
        isApplyingRemoteRef.current = true;
        fCanvas.loadFromJSON(data.canvasData, () => {
          fCanvas.backgroundColor = nextBg;
          applyObjectInteractivity();
          fCanvas.renderAll();
          isApplyingRemoteRef.current = false;
          if (undoStackRef.current.length === 0) {
            undoStackRef.current.push(serializeSnapshot());
          }
        });
      }

      if (!readyEmitted) {
        readyEmitted = true;
        onReady();
      }
    });

    const chatCol = collection(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId, 'chat');
    const chatQuery = query(chatCol, orderBy('timestamp', 'asc'));
    const unsubChat = onSnapshot(chatQuery, (snap) => {
      setMessages(snap.docs.map((d) => d.data()));
    });

    return () => {
      unsubRoom();
      unsubChat();
    };
  }, [db, fCanvas, onReady, roomId, roomRef, user]);

  useEffect(() => {
    if (!db || !roomData || !user || roomData.hostSessionId || hostSessionSyncRef.current) return;
    if (roomData.hostId !== user.uid) return;

    hostSessionSyncRef.current = true;
    void updateDoc(roomRef, { hostSessionId: sessionId }).catch(() => {
      hostSessionSyncRef.current = false;
    });
  }, [db, roomData, roomRef, sessionId, user]);

  useEffect(() => {
    if (!fCanvas) return;

    const assignId = (obj) => {
      if (!obj?.id) {
        obj.id = `obj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      }
    };

    const trackChange = async () => {
      if (isApplyingRemoteRef.current || isApplyingHistoryRef.current) return;
      pushHistory();
      await syncRoomCanvas();
    };

    const onAdded = (e) => {
      if (!e.target || isApplyingRemoteRef.current) return;
      assignId(e.target);
      void trackChange();
    };

    const onModified = () => {
      void trackChange();
    };

    const onRemoved = () => {
      void trackChange();
    };

    fCanvas.on('object:added', onAdded);
    fCanvas.on('object:modified', onModified);
    fCanvas.on('object:removed', onRemoved);
    fCanvas.on('text:changed', onModified);

    return () => {
      fCanvas.off('object:added', onAdded);
      fCanvas.off('object:modified', onModified);
      fCanvas.off('object:removed', onRemoved);
      fCanvas.off('text:changed', onModified);
    };
  }, [fCanvas, backgroundColor]);

  // Zoom/pan gestures: pinch + two-finger drag on touch screens,
  // Ctrl/Cmd + wheel (or trackpad pinch) to zoom and wheel to pan on desktop.
  useEffect(() => {
    if (!fCanvas || !window.fabric) return;
    const fabric = window.fabric;
    const el = fCanvas.upperCanvasEl;
    if (!el) return;

    const clampZoom = (value) => Math.max(0.2, Math.min(3, value));
    const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const midpoint = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
    let gesture = null;

    const onTouchStart = (e) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      // Drop any stroke the first finger started before the second one landed.
      if (fCanvas._isCurrentlyDrawing) {
        fCanvas._isCurrentlyDrawing = false;
        fCanvas.clearContext(fCanvas.contextTop);
      }
      gesture = {
        startDistance: distance(e.touches[0], e.touches[1]) || 1,
        startZoom: fCanvas.getZoom(),
        lastMid: midpoint(e.touches[0], e.touches[1]),
        prevDrawingMode: fCanvas.isDrawingMode,
        prevSelection: fCanvas.selection,
      };
      fCanvas.isDrawingMode = false;
      fCanvas.selection = false;
    };

    const onTouchMove = (e) => {
      if (!gesture || e.touches.length !== 2) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mid = midpoint(e.touches[0], e.touches[1]);
      const nextZoom = clampZoom(gesture.startZoom * (distance(e.touches[0], e.touches[1]) / gesture.startDistance));
      fCanvas.zoomToPoint(new fabric.Point(mid.x - rect.left, mid.y - rect.top), nextZoom);
      fCanvas.relativePan(new fabric.Point(mid.x - gesture.lastMid.x, mid.y - gesture.lastMid.y));
      gesture.lastMid = mid;
      setZoom(Number(nextZoom.toFixed(2)));
    };

    const onTouchEnd = (e) => {
      if (!gesture || e.touches.length > 0) return;
      fCanvas.isDrawingMode = gesture.prevDrawingMode;
      fCanvas.selection = gesture.prevSelection;
      gesture = null;
    };

    const onWheel = (opt) => {
      const e = opt.e;
      e.preventDefault();
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        const nextZoom = clampZoom(fCanvas.getZoom() * 0.99 ** e.deltaY);
        fCanvas.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), nextZoom);
        setZoom(Number(nextZoom.toFixed(2)));
      } else {
        fCanvas.relativePan(new fabric.Point(-e.deltaX, -e.deltaY));
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    fCanvas.on('mouse:wheel', onWheel);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      fCanvas.off('mouse:wheel', onWheel);
    };
  }, [fCanvas]);

  useEffect(() => {
    if (!fCanvas) return;
    fCanvas.freeDrawingBrush.color = strokeColor;
    fCanvas.freeDrawingBrush.width = strokeWidth;
  }, [fCanvas, strokeColor, strokeWidth]);

  useEffect(() => {
    if (!fCanvas) return;

    const canvas = fCanvas;
    const canEdit = !isBoardLockedForMe;
    canvas.isDrawingMode = canEdit && activeTool === TOOL.DRAW;
    canvas.selection = canEdit && activeTool === TOOL.SELECT;
    canvas.defaultCursor = canEdit ? getCanvasCursor(activeTool) : 'default';
    canvas.hoverCursor = canEdit && activeTool === TOOL.SELECT ? 'move' : canvas.defaultCursor;
    canvas.moveCursor = 'move';

    if (canvas.upperCanvasEl) {
      canvas.upperCanvasEl.style.cursor = canvas.defaultCursor;
    }

    applyObjectInteractivity();
    canvas.renderAll();
  }, [activeTool, fCanvas, isBoardLockedForMe]);

  useEffect(() => {
    if (!fCanvas || activeTool === TOOL.SELECT || activeTool === TOOL.DRAW || activeTool === TOOL.HAND || activeTool === TOOL.ERASER || activeTool === TOOL.IMAGE) {
      return;
    }

    pendingShapeRef.current = activeTool;
  }, [activeTool, fCanvas]);

  useEffect(() => {
    if (!fCanvas || !window.fabric) return;
    const fabric = window.fabric;

    const createArrowGroup = (x, y) => {
      const line = new fabric.Line([x, y, x + 140, y], {
        stroke: strokeColor,
        strokeWidth,
      });
      const head = new fabric.Triangle({
        left: x + 140,
        top: y,
        originX: 'center',
        originY: 'center',
        angle: 90,
        width: 14,
        height: 16,
        fill: strokeColor,
      });

      return new fabric.Group([line, head], {
        left: x,
        top: y,
      });
    };

    const onMouseDown = async (opt) => {
      const event = opt.e;
      const isMiddleMouse = event.button === 1;
      const handLikePan = isSpacePressed || activeTool === TOOL.HAND || isMiddleMouse;

      if (isBoardLockedForMe && !handLikePan) {
        notifyBoardLocked();
        return;
      }

      if (handLikePan) {
        panRef.current.isDragging = true;
        const point = getClientPoint(event);
        panRef.current.lastX = point.clientX;
        panRef.current.lastY = point.clientY;
        panRef.current.prevSelection = fCanvas.selection;
        panRef.current.prevDrawingMode = fCanvas.isDrawingMode;
        fCanvas.selection = false;
        fCanvas.isDrawingMode = false;
        fCanvas.defaultCursor = 'grabbing';
        return;
      }

      if (activeTool === TOOL.ERASER && opt.target) {
        fCanvas.remove(opt.target);
        fCanvas.renderAll();
        await syncRoomCanvas();
        return;
      }

      const pointer = fCanvas.getPointer(event);

      if (pendingShapeRef.current === TOOL.RECT) {
        const shape = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          width: 160,
          height: 100,
          fill: 'transparent',
          stroke: strokeColor,
          strokeWidth,
        });
        fCanvas.add(shape);
        setActiveTool(TOOL.SELECT);
        pendingShapeRef.current = null;
      } else if (pendingShapeRef.current === TOOL.CIRCLE) {
        const shape = new fabric.Circle({
          left: pointer.x,
          top: pointer.y,
          radius: 55,
          fill: 'transparent',
          stroke: strokeColor,
          strokeWidth,
        });
        fCanvas.add(shape);
        setActiveTool(TOOL.SELECT);
        pendingShapeRef.current = null;
      } else if (pendingShapeRef.current === TOOL.LINE) {
        const line = new fabric.Line([pointer.x, pointer.y, pointer.x + 160, pointer.y], {
          stroke: strokeColor,
          strokeWidth,
        });
        fCanvas.add(line);
        setActiveTool(TOOL.SELECT);
        pendingShapeRef.current = null;
      } else if (pendingShapeRef.current === TOOL.ARROW) {
        const arrow = createArrowGroup(pointer.x, pointer.y);
        fCanvas.add(arrow);
        setActiveTool(TOOL.SELECT);
        pendingShapeRef.current = null;
      } else if (pendingShapeRef.current === TOOL.TEXT) {
        const text = new fabric.IText('Type here', {
          left: pointer.x,
          top: pointer.y,
          fill: strokeColor,
          fontSize: 24,
        });
        fCanvas.add(text);
        fCanvas.setActiveObject(text);
        text.enterEditing();
        setActiveTool(TOOL.SELECT);
        pendingShapeRef.current = null;
      }
    };

    const onMouseMove = (opt) => {
      if (!panRef.current.isDragging) return;
      const e = getClientPoint(opt.e);
      const vpt = fCanvas.viewportTransform;
      vpt[4] += e.clientX - panRef.current.lastX;
      vpt[5] += e.clientY - panRef.current.lastY;
      fCanvas.requestRenderAll();
      panRef.current.lastX = e.clientX;
      panRef.current.lastY = e.clientY;
    };

    const onMouseUp = () => {
      if (!panRef.current.isDragging) return;
      panRef.current.isDragging = false;
      fCanvas.selection = panRef.current.prevSelection;
      fCanvas.isDrawingMode = panRef.current.prevDrawingMode;
      fCanvas.defaultCursor = getCanvasCursor(activeTool);
      if (fCanvas.upperCanvasEl) {
        fCanvas.upperCanvasEl.style.cursor = getCanvasCursor(activeTool);
      }
    };

    fCanvas.on('mouse:down', onMouseDown);
    fCanvas.on('mouse:move', onMouseMove);
    fCanvas.on('mouse:up', onMouseUp);

    const isTypingTarget = (target) =>
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

    const onKeyDown = (e) => {
      if (e.code !== 'Space') return;
      // Let people type spaces in chat, inputs, and canvas text boxes.
      if (isTypingTarget(e.target) || fCanvas.getActiveObject()?.isEditing) return;
      e.preventDefault();
      setIsSpacePressed(true);
    };

    const onKeyUp = (e) => {
      if (e.code === 'Space') setIsSpacePressed(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      fCanvas.off('mouse:down', onMouseDown);
      fCanvas.off('mouse:move', onMouseMove);
      fCanvas.off('mouse:up', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [activeTool, fCanvas, isBoardLockedForMe, isSpacePressed, strokeColor, strokeWidth]);

  const handleUndo = async () => {
    if (!fCanvas) return;
    if (isBoardLockedForMe) return notifyBoardLocked();
    if (undoStackRef.current.length <= 1) return;

    const current = undoStackRef.current.pop();
    redoStackRef.current.push(current);
    const previous = undoStackRef.current[undoStackRef.current.length - 1];

    isApplyingHistoryRef.current = true;
    applySnapshot(previous);
    isApplyingHistoryRef.current = false;
    await syncRoomCanvas();
  };

  const handleRedo = async () => {
    if (!fCanvas) return;
    if (isBoardLockedForMe) return notifyBoardLocked();
    if (!redoStackRef.current.length) return;

    const next = redoStackRef.current.pop();
    undoStackRef.current.push(next);

    isApplyingHistoryRef.current = true;
    applySnapshot(next);
    isApplyingHistoryRef.current = false;
    await syncRoomCanvas();
  };

  const setZoomLevel = (nextZoom) => {
    if (!fCanvas) return;

    const clamped = Math.max(0.2, Math.min(3, Number(nextZoom.toFixed(2))));
    const center = new window.fabric.Point(fCanvas.getWidth() / 2, fCanvas.getHeight() / 2);
    fCanvas.zoomToPoint(center, clamped);
    setZoom(clamped);
  };

  const resetZoom = () => {
    if (!fCanvas) return;
    fCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    setZoom(1);
  };

  const handleUploadImage = () => imageInputRef.current?.click();

  const onImagePicked = (e) => {
    if (!fCanvas || !window.fabric) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      window.fabric.Image.fromURL(reader.result, (img) => {
        const maxWidth = Math.min(420, fCanvas.getWidth() * 0.7);
        if (img.width > maxWidth) {
          img.scale(maxWidth / img.width);
        }
        img.set({ left: 140, top: 140 });
        fCanvas.add(img);
        fCanvas.setActiveObject(img);
      });
    };
    reader.readAsDataURL(file);

    e.target.value = '';
    setActiveTool(TOOL.SELECT);
  };

  const changeBackgroundColor = async (color) => {
    if (!fCanvas || isBoardLockedForMe) return;
    setBackgroundColor(color);
    fCanvas.backgroundColor = color;
    fCanvas.renderAll();
    pushHistory();
    await syncRoomCanvas();
  };

  const handleCopyRoomId = async () => {
    const ok = await copyToClipboard(roomId);
    showNotification(ok ? 'Room ID copied.' : 'Could not copy room ID.');
  };

  const exportCanvasPng = () => {
    if (!fCanvas) return;
    const dataUrl = fCanvas.toDataURL({ format: 'png', quality: 1 });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `board-${roomId}.png`;
    a.click();
  };

  const exportCanvasPdf = () => {
    if (!fCanvas) return;
    try {
      const snapshot = fCanvas.toCanvasElement();
      const jpegDataUrl = snapshot.toDataURL('image/jpeg', 0.92);
      const blob = buildPdfFromJpeg(atob(jpegDataUrl.split(',')[1]), snapshot.width, snapshot.height);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `board-${roomId}.pdf`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('PDF export failed', err);
      showNotification('Could not export PDF.');
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!db || !chatMsg.trim()) return;

    const text = chatMsg.trim().slice(0, 1000);
    const chatCol = collection(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId, 'chat');
    try {
      await setDoc(doc(chatCol), {
        sender: username || 'Guest',
        senderId: user.uid,
        text,
        timestamp: Date.now(),
      });
      setChatMsg('');
    } catch (err) {
      console.error('Sending chat message failed', err);
      showNotification(
        err?.code === 'permission-denied'
          ? 'Chat is blocked by the database rules. Ask the board owner to update them.'
          : 'Message not sent. Check your connection and try again.',
      );
    }
  };

  const generateSummary = async () => {
    setIsAiLoading(true);
    try {
      const objects = fCanvas?.getObjects() || [];
      const text = objects
        .filter((obj) => obj.type === 'text' || obj.type === 'i-text')
        .map((obj) => obj.text)
        .join(', ');
      const counts = objects.reduce((acc, obj) => {
        acc[obj.type] = (acc[obj.type] || 0) + 1;
        return acc;
      }, {});

      const res = await fetch('/.netlify/functions/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, counts }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setAiSummary(data.error || 'Failed to generate summary.');
        return;
      }

      setAiSummary(data.summary || 'No summary generated.');
    } catch {
      setAiSummary('Failed to generate summary. Check your connection and try again.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const toggleLock = async () => {
    if (!isCurrentHost) return;
    await updateDoc(roomRef, { isLocked: !roomData.isLocked });
  };

  const startToolbarDrag = (event) => {
    const toolbarRect = toolbarRef.current?.getBoundingClientRect();
    if (!toolbarRect) return;

    toolbarMovedRef.current = true;
    toolbarDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - toolbarRect.left,
      offsetY: event.clientY - toolbarRect.top,
    };
    document.body.style.userSelect = 'none';
  };

  const toolItems = [
    { id: TOOL.SELECT, icon: <MousePointer2 size={16} />, label: 'Select' },
    { id: TOOL.HAND, icon: <Move size={16} />, label: 'Hand' },
    { id: TOOL.RECT, icon: <Square size={16} />, label: 'Rectangle' },
    { id: TOOL.CIRCLE, icon: <Circle size={16} />, label: 'Circle' },
    { id: TOOL.ARROW, icon: <ArrowRight size={16} />, label: 'Arrow' },
    { id: TOOL.LINE, icon: <Minus size={16} />, label: 'Line' },
    { id: TOOL.DRAW, icon: <Pencil size={16} />, label: 'Draw' },
    { id: TOOL.TEXT, icon: <Type size={16} />, label: 'Text' },
    { id: TOOL.IMAGE, icon: <ImageIcon size={16} />, label: 'Image' },
    { id: TOOL.ERASER, icon: <Eraser size={16} />, label: 'Eraser' },
  ];

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-slate-100 dark:bg-slate-950">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onImagePicked}
      />

      <main className="absolute inset-0">
        <canvas ref={canvasRef} />
      </main>

      <div className="absolute top-3 left-3 right-3 sm:left-6 sm:right-auto z-50 rounded-2xl border border-slate-200 bg-white/90 dark:bg-slate-900/90 dark:border-slate-700 backdrop-blur px-2 sm:px-3 py-2 flex items-center gap-1 sm:gap-2 shadow-md">
        <button onClick={onExit} className="h-9 w-9 shrink-0 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="Exit board" aria-label="Exit board">
          <LogOut size={16} />
        </button>
        <div className="h-6 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
        <div className="min-w-0 flex-1 sm:flex-none px-1">
          <p className="text-xs font-semibold whitespace-nowrap truncate">Room {roomId}</p>
          <p className="text-[11px] whitespace-nowrap text-slate-500 dark:text-slate-400">{roomData?.participants?.length || 1} joined</p>
        </div>
        <button onClick={handleCopyRoomId} className="h-9 w-9 shrink-0 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="Copy room ID" aria-label="Copy room ID">
          <Copy size={15} />
        </button>
        <div className="relative shrink-0" ref={exportMenuRef}>
          <button
            onClick={() => setShowExportMenu((open) => !open)}
            className="h-9 w-9 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Export board"
            aria-label="Export board"
            aria-expanded={showExportMenu}
          >
            <Download size={15} />
          </button>
          {showExportMenu && (
            <>
              <div className="absolute right-0 sm:left-0 sm:right-auto top-11 z-20 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    exportCanvasPng();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ImageIcon size={15} /> PNG image
                </button>
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    exportCanvasPdf();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <FileText size={15} /> PDF document
                </button>
              </div>
            </>
          )}
        </div>
        <button onClick={onToggleDark} className="h-9 w-9 shrink-0 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="Toggle theme" aria-label="Toggle theme">
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button
          onClick={() => setIsCollaborationOpen((current) => !current)}
          className={`h-9 shrink-0 rounded-lg border px-2 text-xs font-medium flex items-center gap-1.5 ${
            isCollaborationOpen
              ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
              : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'
          }`}
          title={isCollaborationOpen ? 'Hide chat & people' : 'Show chat & people'}
          aria-label={isCollaborationOpen ? 'Hide chat and people' : 'Show chat and people'}
        >
          <MessageSquare size={14} />
          <span className="hidden sm:inline">{isCollaborationOpen ? 'Hide chat' : 'Chat & people'}</span>
        </button>
        {isCurrentHost && (
          <button
            onClick={toggleLock}
            className={`h-9 shrink-0 px-2 rounded-lg border text-xs flex items-center gap-1.5 ${
              roomData?.isLocked
                ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                : 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'
            }`}
            title={roomData?.isLocked ? 'Unlock the board for collaborators' : 'Lock the board so only the host can edit'}
            aria-label={roomData?.isLocked ? 'Unlock board' : 'Lock board'}
          >
            <Lock size={14} />
            <span className="hidden sm:inline">{roomData?.isLocked ? 'Unlock' : 'Lock'}</span>
          </button>
        )}
        {roomData?.isLocked && !isCurrentHost && (
          <Lock size={14} className="shrink-0 text-amber-500" title="Board is locked by the host" />
        )}
      </div>

      {!isMobileSheetOpen && (
        <div
          className={isMobile ? 'absolute left-3 right-3 bottom-3 z-[60]' : 'absolute z-[60] pointer-events-none'}
          style={isMobile ? undefined : { left: toolbarPosition.x, top: toolbarPosition.y }}
        >
          <Motion.div
            ref={toolbarRef}
            initial={{ opacity: 0, y: isMobile ? 8 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-auto rounded-2xl border border-slate-300 bg-white/95 dark:bg-slate-900/95 dark:border-slate-600 backdrop-blur p-2 shadow-2xl"
            style={isMobile ? undefined : { width: 'max-content', maxWidth: Math.min(TOOLBAR_MAX_WIDTH, toolbarAvailableWidth - 24) }}
          >
            <div className={`flex items-center gap-1.5 ${isMobile ? 'overflow-x-auto' : 'flex-wrap'}`}>
              {!isMobile && (
                <button
                  type="button"
                  onPointerDown={startToolbarDrag}
                  className="h-10 w-6 shrink-0 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing touch-none"
                  title="Drag to move the toolbar"
                  aria-label="Drag to move the toolbar"
                >
                  <GripVertical size={16} />
                </button>
              )}
              {toolItems.map((tool) => (
                <Motion.button
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.96 }}
                  key={tool.id}
                  className={toolButtonClass(activeTool === tool.id)}
                  onClick={() => {
                    if (isBoardLockedForMe && tool.id !== TOOL.HAND && tool.id !== TOOL.SELECT) {
                      notifyBoardLocked();
                      return;
                    }
                    if (tool.id === TOOL.IMAGE) {
                      handleUploadImage();
                      return;
                    }
                    setActiveTool(tool.id);
                  }}
                  title={tool.label}
                  aria-label={tool.label}
                  aria-pressed={activeTool === tool.id}
                >
                  {tool.icon}
                </Motion.button>
              ))}

              <div className="h-8 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />

              <button className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-white/90 dark:bg-slate-900/90 dark:border-slate-700 grid place-items-center" onClick={() => (isBoardLockedForMe ? notifyBoardLocked() : setShowBgModal(true))} title="Canvas background" aria-label="Canvas background">
                <Paintbrush size={16} />
              </button>

              <input
                type="color"
                value={strokeColor}
                onChange={(e) => setStrokeColor(e.target.value)}
                className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent p-1"
                title="Stroke color"
                aria-label="Stroke color"
              />

              <select
                className="h-10 shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                title="Stroke width"
                aria-label="Stroke width"
              >
                {[1, 2, 3, 4, 6, 8].map((w) => (
                  <option key={w} value={w}>{w}px</option>
                ))}
              </select>
            </div>
          </Motion.div>
        </div>
      )}

      <div className="hidden sm:block absolute left-6 top-1/2 -translate-y-1/2 z-50">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 backdrop-blur p-2 flex flex-col gap-2 shadow-xl">
          <Motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }} onClick={handleUndo} className={toolButtonClass(false)} title="Undo" aria-label="Undo">
            <Undo2 size={16} />
          </Motion.button>
          <Motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }} onClick={handleRedo} className={toolButtonClass(false)} title="Redo" aria-label="Redo">
            <Redo2 size={16} />
          </Motion.button>
        </div>
      </div>

      {!isMobileSheetOpen && (
        <div className="absolute left-3 bottom-[84px] sm:left-6 sm:bottom-6 z-50 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-900/85 backdrop-blur px-2 py-1.5 shadow-xl flex items-center gap-1">
          <button onClick={handleUndo} className="sm:hidden h-9 w-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 grid place-items-center" title="Undo" aria-label="Undo">
            <Undo2 size={15} />
          </button>
          <button onClick={handleRedo} className="sm:hidden h-9 w-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 grid place-items-center" title="Redo" aria-label="Redo">
            <Redo2 size={15} />
          </button>
          <div className="sm:hidden h-6 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />
          <button onClick={() => setZoomLevel(zoom - 0.1)} className="h-9 w-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 grid place-items-center" title="Zoom out" aria-label="Zoom out">
            <Minus size={14} />
          </button>
          <button onClick={resetZoom} className="px-2 h-8 min-w-[52px] rounded-lg text-xs border border-slate-300 dark:border-slate-600" title="Reset zoom" aria-label="Reset zoom">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => setZoomLevel(zoom + 0.1)} className="h-9 w-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 grid place-items-center" title="Zoom in" aria-label="Zoom in">
            <Plus size={14} />
          </button>
        </div>
      )}

      <AnimatePresence>
        {showBgModal && (
          <Motion.div className="absolute inset-0 z-[70] grid place-items-center bg-black/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className="w-[320px] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold">Canvas Background</p>
                <button onClick={() => setShowBgModal(false)} className="text-sm text-slate-500">Close</button>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                {BG_SWATCHES.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      void changeBackgroundColor(color);
                      setShowBgModal(false);
                    }}
                    className="h-10 rounded-lg border border-slate-300"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>

              <div className="mt-4">
                <p className="text-xs text-slate-500 mb-2">Custom color</p>
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => void changeBackgroundColor(e.target.value)}
                  className="w-full h-11 rounded-lg border border-slate-300 dark:border-slate-700"
                />
              </div>
            </Motion.div>
          </Motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPanHint && !isMobileSheetOpen && (
          <Motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={`absolute z-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-900/85 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 backdrop-blur ${
              isMobile ? 'left-3 right-3 top-[68px] flex items-center justify-between' : 'left-6 bottom-[76px] max-w-[min(420px,calc(100vw-3rem))]'
            }`}
          >
            {isTouchDevice
              ? 'Pinch to zoom. Use two fingers to move around.'
              : 'To move the canvas, hold Space while dragging. Ctrl + scroll to zoom.'}
            <button onClick={() => setShowPanHint(false)} className="ml-2 font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-100">Got it</button>
          </Motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCollaborationOpen && (
          <Motion.aside
            initial={isMobile ? { opacity: 0, y: 24 } : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={isMobile ? { opacity: 0, y: 24 } : { opacity: 0, x: 24 }}
            className={`absolute z-[70] overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/80 ${
              isMobile
                ? 'left-3 right-3 bottom-3 h-[min(65vh,460px)]'
                : 'top-[76px] right-3 bottom-3 w-[320px] max-w-[90vw] sm:right-6 sm:bottom-6'
            } flex flex-col`}
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Collaboration</p>
                <p className="hidden sm:block text-[11px] text-slate-500 dark:text-slate-400">Chat, participants, and AI summary.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActivePanel('chat')}
                  className={`h-8 w-8 rounded-lg grid place-items-center ${activePanel === 'chat' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  title="Chat"
                >
                  <MessageSquare size={14} />
                </button>
                <button
                  onClick={() => setActivePanel('users')}
                  className={`h-8 w-8 rounded-lg grid place-items-center ${activePanel === 'users' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  title="Users"
                >
                  <Users size={14} />
                </button>
                <button
                  onClick={() => setActivePanel('ai')}
                  className={`h-8 w-8 rounded-lg grid place-items-center ${activePanel === 'ai' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  title="AI summary"
                >
                  <Sparkles size={14} />
                </button>
                <button
                  onClick={() => setIsCollaborationOpen(false)}
                  className="h-8 rounded-lg border border-slate-300 px-2 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                  title="Close collaboration panel"
                >
                  Hide
                </button>
              </div>
            </div>

            {activePanel === 'chat' && (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {messages.map((m, idx) => (
                    <Motion.div
                      key={`${m.timestamp || idx}-${idx}`}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                        m.senderId === user.uid
                          ? 'ml-auto bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100'
                      }`}
                    >
                      <p className="text-[10px] opacity-70 mb-1">{m.sender}</p>
                      {m.text}
                    </Motion.div>
                  ))}
                </div>

                <form onSubmit={sendMessage} className="p-3 border-t border-slate-200 dark:border-slate-700 flex gap-2">
                  <input
                    value={chatMsg}
                    onChange={(e) => setChatMsg(e.target.value)}
                    placeholder="Live chat"
                    className="flex-1 h-10 rounded-xl border border-slate-300 dark:border-slate-700 px-3 bg-white/80 dark:bg-slate-900"
                  />
                  <Motion.button
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    className="h-10 w-10 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 grid place-items-center"
                  >
                    <Send size={15} />
                  </Motion.button>
                </form>
              </>
            )}

            {activePanel === 'users' && (
              <div className="p-4 space-y-2 overflow-y-auto">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Participants</p>
                {(roomData?.participants || []).map((p, idx) => (
                  <div key={`${p.uid}-${idx}`} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/70 dark:bg-slate-950/50">
                    <p className="text-sm font-medium">{p.name}{p.uid === user.uid ? ' (You)' : ''}</p>
                    <p className="text-[11px] text-slate-500">{p.uid === roomData?.hostId ? 'Host' : 'Collaborator'}</p>
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'ai' && (
              <div className="p-4 overflow-y-auto">
                <button
                  onClick={generateSummary}
                  disabled={isAiLoading}
                  className="w-full h-10 rounded-xl bg-slate-900 text-white text-sm font-semibold dark:bg-slate-100 dark:text-slate-900"
                >
                  {isAiLoading ? 'Generating...' : 'AI Whiteboard Summary'}
                </button>
                {aiSummary && (
                  <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-950/70 p-3 text-xs leading-relaxed">
                    {aiSummary}
                  </div>
                )}
              </div>
            )}
          </Motion.aside>
        )}
      </AnimatePresence>

      {isBoardLockedForMe && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-amber-100 text-amber-700 text-xs border border-amber-200">
          Board is locked by host. You can view but not edit.
        </div>
      )}
    </div>
  );
}

export default App;

