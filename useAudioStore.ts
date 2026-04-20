// frontend/store/useAudioStore.ts
"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

/* ─── Types ─────────────────────────────────────────────────── */
export type StemType = "vocals" | "drums" | "bass" | "other";

export interface Track {
  id: string;
  name: string;
  url: string;
  buffer?: AudioBuffer;
  volume: number;
  muted: boolean;
  solo: boolean;
  stems?: Partial<Record<StemType, string>>;
  color: string;
}

export interface AudioState {
  tracks: Track[];
  activeTrackId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  masterVolume: number;
  bpm: number;
  pitch: number;
  eqBands: number[];
  reverb: number;
  delay: number;
  compression: { threshold: number; ratio: number; knee: number };
  isProcessing: boolean;
  processingLabel: string;

  loadTrack:         (file: File) => Promise<void>;
  addTrackFromUrl:   (name: string, url: string) => void;
  removeTrack:       (id: string) => void;
  setActiveTrack:    (id: string) => void;
  updateTrackUrl:    (id: string, url: string) => void;
  updateTrackVolume: (id: string, vol: number) => void;
  toggleMute:        (id: string) => void;
  toggleSolo:        (id: string) => void;
  togglePlayback:    () => Promise<void>;
  stop:              () => Promise<void>;
  seek:              (time: number) => Promise<void>;
  setCurrentTime:    (t: number) => void;
  setDuration:       (d: number) => void;
  setMasterVolume:   (v: number) => void;
  setBpm:            (bpm: number) => void;
  setPitch:          (st: number) => void;
  setEqBand:         (index: number, gainDb: number) => void;
  setReverb:         (v: number) => void;
  setDelay:          (v: number) => void;
  setCompression:    (c: Partial<AudioState["compression"]>) => void;
  separateTrack:     (id: string) => Promise<void>;
  _setProcessing:    (label: string) => void;
  _clearProcessing:  () => void;
}

/* ─── Track Color Palette ───────────────────────────────────── */
const TRACK_COLORS = [
  "#00FFFF", "#FF003C", "#FFB800", "#7B2FFF",
  "#00FF88", "#FF6B00", "#0088FF", "#FF00AA",
];
let colorIdx = 0;
const nextColor = () => TRACK_COLORS[colorIdx++ % TRACK_COLORS.length];

/* ─── Tone.js Engine (lazy, client-only) ─────────────────────── */
interface ToneEngine {
  player:      any;
  pitchShift:  any;
  eq:          any;
  reverb:      any;
  delay:       any;
  compressor:  any;
  volume:      any;
}

let toneEngine: ToneEngine | null = null;
let toneInitPromise: Promise<ToneEngine> | null = null;

async function getToneEngine(): Promise<ToneEngine> {
  if (toneEngine) return toneEngine;
  if (toneInitPromise) return toneInitPromise;

  toneInitPromise = (async () => {
    const Tone = await import("tone");

    // Tone v14 API (stable)
    const volume     = new Tone.Volume(0).toDestination();
    const compressor = new Tone.Compressor(-24, 4).connect(volume);
    const reverb     = new Tone.Reverb({ decay: 2.5, wet: 0 }).connect(compressor);
    const delay      = new Tone.FeedbackDelay("8n", 0.3).connect(compressor);
    const eq         = new Tone.EQ3(-3, 0, 3).connect(reverb);
    const pitchShift = new Tone.PitchShift(0).connect(eq);
    const player     = new Tone.Player().connect(pitchShift);

    // Ensure wet values are 0 at init
    delay.wet.value = 0;

    toneEngine = { player, pitchShift, eq, reverb, delay, compressor, volume };

    // Expose to window for EffectsRack direct access
    if (typeof window !== "undefined") {
      (window as any).__toneEngine = toneEngine;
    }

    return toneEngine;
  })();

  return toneInitPromise;
}

/* ─── Backend API URL ────────────────────────────────────────── */
const API_URL =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
    : "http://localhost:8000";

/* ─── Time Tracking ──────────────────────────────────────────── */
let timeInterval: ReturnType<typeof setInterval> | null = null;
let playbackStartTime = 0;
let playbackStartOffset = 0;

function startTimeTracking() {
  stopTimeTracking();
  playbackStartTime = Date.now();
  playbackStartOffset = useAudioStore.getState().currentTime;
  timeInterval = setInterval(() => {
    const elapsed = (Date.now() - playbackStartTime) / 1000;
    const newTime = playbackStartOffset + elapsed;
    const { duration } = useAudioStore.getState();
    if (duration > 0 && newTime >= duration) {
      useAudioStore.getState().stop();
    } else {
      useAudioStore.getState().setCurrentTime(newTime);
    }
  }, 100);
}

function stopTimeTracking() {
  if (timeInterval) {
    clearInterval(timeInterval);
    timeInterval = null;
  }
}

/* ─── Store ─────────────────────────────────────────────────── */
export const useAudioStore = create<AudioState>()(
  subscribeWithSelector((set, get) => ({
    tracks: [],
    activeTrackId: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    masterVolume: 0.8,
    bpm: 128,
    pitch: 0,
    eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    reverb: 0,
    delay: 0,
    compression: { threshold: -24, ratio: 4, knee: 10 },
    isProcessing: false,
    processingLabel: "",

    /* ── Load File ──────────────────────────────────────────── */
    loadTrack: async (file) => {
      // Stop current playback first to avoid stale player state
      const state = get();
      if (state.isPlaying) {
        stopTimeTracking();
        try {
          const engine = await getToneEngine();
          engine.player.stop();
        } catch (_) { /* ignore */ }
        set({ isPlaying: false });
      }

      const url = URL.createObjectURL(file);
      const id  = crypto.randomUUID();
      const track: Track = {
        id,
        name: file.name,
        url,
        volume: 1,
        muted: false,
        solo: false,
        color: nextColor(),
      };
      set((s) => ({ tracks: [...s.tracks, track], activeTrackId: id, currentTime: 0, duration: 0 }));

      // Pre-load into Tone player
      try {
        const engine = await getToneEngine();
        await engine.player.load(url);
        // Set duration from player buffer
        if (engine.player.buffer?.duration) {
          set({ duration: engine.player.buffer.duration });
        }
      } catch (e) {
        console.warn("Tone.js load warn:", e);
      }
    },

    addTrackFromUrl: (name, url) => {
      const id = crypto.randomUUID();
      set((s) => ({
        tracks: [
          ...s.tracks,
          { id, name, url, volume: 1, muted: false, solo: false, color: nextColor() },
        ],
        activeTrackId: id,
      }));
    },

    removeTrack: (id) => {
      // Revoke object URL to prevent memory leaks
      const track = get().tracks.find((t) => t.id === id);
      if (track?.url?.startsWith("blob:")) URL.revokeObjectURL(track.url);

      set((s) => ({
        tracks: s.tracks.filter((t) => t.id !== id),
        activeTrackId:
          s.activeTrackId === id
            ? (s.tracks.find((t) => t.id !== id)?.id ?? null)
            : s.activeTrackId,
      }));
    },

    setActiveTrack:    (id)       => set({ activeTrackId: id }),
    updateTrackUrl:    (id, url)  =>
      set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, url } : t)) })),
    updateTrackVolume: (id, vol)  =>
      set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, volume: vol } : t)) })),
    toggleMute: (id) =>
      set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t)) })),
    toggleSolo: (id) =>
      set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, solo: !t.solo } : t)) })),

    /* ── Playback ───────────────────────────────────────────── */
    togglePlayback: async () => {
      // Must be called from a user gesture context
      if (typeof window === "undefined") return;
      const { isPlaying } = get();
      try {
        const Tone = await import("tone");
        // Resume audio context (required after user interaction)
        await Tone.start();
        const engine = await getToneEngine();

        if (isPlaying) {
          engine.player.stop();
          set({ isPlaying: false });
        } else {
          if (engine.player.loaded) {
            engine.player.start();
            // Start time tracking
            startTimeTracking();
          }
          set({ isPlaying: true });
        }
      } catch (e) {
        console.error("Playback error:", e);
        set({ isPlaying: false });
      }
    },

    stop: async () => {
      stopTimeTracking();
      try {
        const engine = await getToneEngine();
        engine.player.stop();
      } catch (_) { /* ignore if not initialised */ }
      set({ isPlaying: false, currentTime: 0 });
    },

    seek: async (time) => {
      try {
        const engine = await getToneEngine();
        if (engine.player.loaded) {
          const { isPlaying } = get();
          if (isPlaying) {
            engine.player.stop();
            engine.player.start(undefined, time);
          }
        }
      } catch (_) { /* ignore */ }
      set({ currentTime: time });
    },

    setCurrentTime: (t) => set({ currentTime: t }),
    setDuration:    (d) => set({ duration: d }),

    /* ── Global Controls ────────────────────────────────────── */
    setMasterVolume: async (v) => {
      set({ masterVolume: v });
      try {
        const Tone   = await import("tone");
        const engine = await getToneEngine();
        engine.volume.volume.value = Tone.gainToDb(Math.max(0.0001, v));
      } catch (e) { console.warn(e); }
    },

    setBpm: async (bpm) => {
      set({ bpm });
      try {
        const Tone = await import("tone");
        Tone.getTransport().bpm.value = bpm;
      } catch (e) { console.warn(e); }
    },

    setPitch: async (st) => {
      set({ pitch: st });
      try {
        const engine = await getToneEngine();
        engine.pitchShift.pitch = st;
      } catch (e) { console.warn(e); }
    },

    setEqBand: async (index, gainDb) => {
      set((s) => {
        const bands = [...s.eqBands];
        bands[index] = gainDb;
        return { eqBands: bands };
      });
      try {
        const { eqBands } = get();
        const engine = await getToneEngine();
        // Map 10 bands to Tone EQ3 (low/mid/high)
        const low  = eqBands.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
        const mid  = eqBands.slice(3, 7).reduce((a, b) => a + b, 0) / 4;
        const high = eqBands.slice(7).reduce((a, b) => a + b, 0)    / 3;
        engine.eq.low.value  = low;
        engine.eq.mid.value  = mid;
        engine.eq.high.value = high;
      } catch (e) { console.warn(e); }
    },

    setReverb: async (v) => {
      set({ reverb: v });
      try {
        const engine = await getToneEngine();
        engine.reverb.wet.value = v;
      } catch (e) { console.warn(e); }
    },

    setDelay: async (v) => {
      set({ delay: v });
      try {
        const engine = await getToneEngine();
        engine.delay.wet.value = v;
      } catch (e) { console.warn(e); }
    },

    setCompression: async (c) => {
      set((s) => ({ compression: { ...s.compression, ...c } }));
      try {
        const { compression } = get();
        const engine = await getToneEngine();
        if (c.threshold !== undefined) engine.compressor.threshold.value = compression.threshold;
        if (c.ratio     !== undefined) engine.compressor.ratio.value     = compression.ratio;
        if (c.knee      !== undefined) engine.compressor.knee.value      = compression.knee;
      } catch (e) { console.warn(e); }
    },

    /* ── AI Stem Separation ─────────────────────────────────── */
    separateTrack: async (id) => {
      const track = get().tracks.find((t) => t.id === id);
      if (!track) return;

      get()._setProcessing("AI SEPARATING STEMS — PLEASE WAIT…");

      try {
        const resp = await fetch(track.url);
        const blob = await resp.blob();

        const formData = new FormData();
        formData.append("file", blob, track.name);

        const apiResp = await fetch(`${API_URL}/api/separate`, {
          method: "POST",
          body: formData,
        });

        if (!apiResp.ok) throw new Error(await apiResp.text());

        const data = (await apiResp.json()) as {
          stems: Partial<Record<StemType, string>>;
        };

        set((s) => ({
          tracks: s.tracks.map((t) =>
            t.id === id ? { ...t, stems: data.stems } : t
          ),
        }));

        const stemNames: StemType[] = ["vocals", "drums", "bass", "other"];
        stemNames.forEach((stem) => {
          const stemUrl = data.stems[stem];
          if (stemUrl) {
            get().addTrackFromUrl(`${track.name} [${stem.toUpperCase()}]`, stemUrl);
          }
        });
      } catch (err) {
        console.error("Separation failed:", err);
        // Show error in processing label briefly
        set({ processingLabel: "⚠ SEPARATION FAILED — BACKEND REQUIRED" });
        setTimeout(() => get()._clearProcessing(), 3000);
        return;
      }
      get()._clearProcessing();
    },

    _setProcessing:   (label) => set({ isProcessing: true,  processingLabel: label }),
    _clearProcessing: ()      => set({ isProcessing: false, processingLabel: "" }),
  }))
);
