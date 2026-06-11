# Trois Sampler

A browser-based audio sampler for chopping, playing, and processing samples from any audio file. Upload a track, drop markers on the waveform, trigger up to 16 pads with your keyboard, add effects, and export trimmed recordings — all in the browser using the Web Audio API.

<div align="center">
  <img width="1200" height="475" alt="Trois Sampler" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

## Features

### Sample chopping

- **Upload any audio file** — decoded locally via the Web Audio API (no server upload).
- **Interactive waveform** — canvas-rendered waveform with horizontal zoom (1×–15×) for precise editing.
- **Up to 16 sample markers** — click the waveform or use **Add Marker** to place chop points.
- **Drag to reposition** — move markers along the waveform; each marker has an adjustable sample length (default 1.5 s).
- **16-pad grid** — visual pad layout mapped to keyboard keys for live triggering.

### Playback controls

| Control | Range | Description |
|---------|-------|-------------|
| Volume | 0–100% | Master output level |
| Tempo | 0.5×–2.0× | Playback speed per trigger |
| Pitch | −12 to +12 st | Semitone shift via detune |
| Zoom | 1×–15× | Waveform horizontal magnification |

### Built-in effects

Samples route through a real-time effects chain before reaching the output:

1. **Mutron (Auto-Wah)** — envelope-following low-pass filter with adjustable sensitivity and depth.
2. **LFO Filter** — sine-wave modulated low-pass filter with rate (Hz) and depth controls.

Both effects can be toggled independently and bypass cleanly when disabled.

### Layout persistence

- **Save Layout** — export marker positions and sample durations as JSON, tied to the source filename.
- **Load Layout** — restore a saved layout when the matching source file is loaded.

### Record & export

- **Record Output** — capture the processed audio stream (including active effects) via `MediaRecorder`.
- **Trim recorded takes** — set start/end points on the recorded waveform with draggable markers or sliders.
- **Save as WAV** — export the trimmed selection as a 16-bit PCM `.wav` file.

## Keyboard shortcuts

Pads map to two rows of keys (up to 16 markers):

| Pad | Key | Pad | Key |
|-----|-----|-----|-----|
| 1 | Q | 9 | A |
| 2 | W | 10 | S |
| 3 | E | 11 | D |
| 4 | R | 12 | F |
| 5 | T | 13 | G |
| 6 | Y | 14 | H |
| 7 | U | 15 | J |
| 8 | I | 16 | K |

Press a key to select and play the corresponding marker. Click a pad in the grid to trigger it with the mouse.

## Quick start

**Prerequisites:** [Node.js](https://nodejs.org/) 18+

```bash
# Install dependencies
npm install

# Start the dev server (http://localhost:3000)
npm run dev
```

No API keys or backend services are required — all audio processing runs client-side.

### Build for production

```bash
npm run build
npm run preview   # preview the production build locally
```

## How to use

1. **Upload** an audio file (WAV, MP3, OGG, etc.).
2. **Click the waveform** to add markers at chop points, or use **Add Marker** for a default position.
3. **Drag markers** to fine-tune start positions; select a marker to adjust its **Length**.
4. **Trigger samples** with the keyboard or pad grid.
5. **Dial in effects** — toggle Mutron and/or LFO Filter and tweak their parameters.
6. **Adjust tempo and pitch** globally for all triggered samples.
7. **Save your layout** to revisit the same chop map later.
8. **Record Output** to capture a performance with effects, then **trim and export** as WAV.

## Tech stack

- **React 19** + **TypeScript**
- **Vite 6** — dev server and bundler
- **Web Audio API** — decoding, playback, effects, and recording
- **Canvas** — waveform visualization (`WaveformDisplay`)
- **Tailwind CSS** — styling via CDN

## Project structure

```
├── App.tsx                    # Main UI, state, and audio routing
├── components/
│   └── WaveformDisplay.tsx    # Canvas waveform + draggable markers
├── services/
│   └── audioService.ts        # Web Audio helpers, effects, WAV export
├── types.ts                   # Marker interface
├── index.tsx                  # React entry point
└── vite.config.ts             # Vite config (dev server on port 3000)
```

## Browser support

Requires a modern browser with Web Audio API and `MediaRecorder` support (Chrome, Firefox, Safari, Edge). Audio playback may require a user gesture to resume a suspended `AudioContext` — click anywhere in the app after loading if you hear no sound.
