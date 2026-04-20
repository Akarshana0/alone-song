"use client";
// frontend/components/AudioEditor.tsx

import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useAudioStore } from "@/store/useAudioStore";

type RegionData = { id: string; start: number; end: number };

const ZOOM_MIN = 1;
const ZOOM_MAX = 200;

export default function AudioEditor() {
  const containerRef  = useRef<HTMLDivElement>(null);
  const timelineRef   = useRef<HTMLDivElement>(null);
  const wsRef         = useRef<any>(null);
  const regPluginRef  = useRef<any>(null);

  const [zoom, setZoom]                     = useState(1);
  const [wsReady, setWsReady]               = useState(false);
  const [regions, setRegions]               = useState<RegionData[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [fadeType, setFadeType]             = useState<"in" | "out">("in");

  const activeTrackId = useAudioStore((s) => s.activeTrackId);
  const tracks        = useAudioStore((s) => s.tracks);
  const isPlaying     = useAudioStore((s) => s.isPlaying);
  const setDuration   = useAudioStore((s) => s.setDuration);
  const setCurrentTime = useAudioStore((s) => s.setCurrentTime);

  const activeTrack = tracks.find((t) => t.id === activeTrackId);

  /* ── Init WaveSurfer (browser-only) ─────────────────────── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!containerRef.current) return;

    let cancelled = false;

    const initWS = async () => {
      // Dynamically import to avoid SSR
      const WS             = (await import("wavesurfer.js")).default;
      const RegionsPlugin  = (await import("wavesurfer.js/dist/plugins/regions.esm.js")).default;
      const TimelinePlugin = (await import("wavesurfer.js/dist/plugins/timeline.esm.js")).default;
      const MinimapPlugin  = (await import("wavesurfer.js/dist/plugins/minimap.esm.js")).default;

      if (cancelled) return;

      wsRef.current?.destroy();
      regPluginRef.current = null;

      const regPlugin = RegionsPlugin.create();
      regPluginRef.current = regPlugin;

      const ws = WS.create({
        container:     containerRef.current!,
        waveColor:     "rgba(0,180,180,0.6)",
        progressColor: "rgba(0,255,255,0.9)",
        cursorColor:   "#00ffff",
        cursorWidth:   2,
        height:        120,
        normalize:     true,
        barWidth:      2,
        barGap:        1,
        barRadius:     2,
        plugins: [
          regPlugin,
          TimelinePlugin.create({ container: timelineRef.current! }),
          MinimapPlugin.create({
            height:        24,
            waveColor:     "rgba(0,100,100,0.5)",
            progressColor: "rgba(0,255,255,0.5)",
          }),
        ],
      });

      ws.on("ready", (dur: number) => {
        if (cancelled) return;
        setDuration(dur);
        setWsReady(true);
      });

      ws.on("timeupdate", (t: number) => {
        if (!cancelled) setCurrentTime(t);
      });

      // Sync WaveSurfer seek clicks back to Tone.js
      ws.on("seeking", (t: number) => {
        if (cancelled) return;
        const store = useAudioStore.getState();
        store.setCurrentTime(t);
        // If playing, restart Tone player from new position
        if (store.isPlaying) {
          try {
            const engine = (window as any).__toneEngine;
            if (engine?.player) {
              engine.player.stop();
              engine.player.start(undefined, t);
            }
          } catch (_) { /* ignore */ }
        }
      });

      // Some WaveSurfer versions fire "decode" instead of "ready"
      ws.on("decode", (dur: number) => {
        if (!cancelled) {
          if (dur) setDuration(dur);
          setWsReady(true);
        }
      });

      // Handle finish event to update isPlaying state
      ws.on("finish", () => {
        if (!cancelled) {
          useAudioStore.getState().stop();
        }
      });

      regPlugin.on("region-created", (r: any) => {
        if (cancelled) return;
        setRegions((prev) => [...prev, { id: r.id, start: r.start, end: r.end }]);
      });

      regPlugin.on("region-updated", (r: any) => {
        if (cancelled) return;
        setRegions((prev) =>
          prev.map((x) => (x.id === r.id ? { ...x, start: r.start, end: r.end } : x))
        );
      });

      regPlugin.on("region-clicked", (r: any, e: MouseEvent) => {
        e.stopPropagation();
        if (!cancelled) setSelectedRegion(r.id);
      });

      wsRef.current = ws;
    };

    initWS().catch(console.error);

    return () => {
      cancelled = true;
      wsRef.current?.destroy();
      wsRef.current     = null;
      regPluginRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Load audio on track change ─────────────────────────── */
  useEffect(() => {
    if (!wsRef.current || !activeTrack?.url) return;
    setWsReady(false);
    setRegions([]);
    setSelectedRegion(null);
    wsRef.current.load(activeTrack.url);
  }, [activeTrack?.url]);

  /* ── Sync play/pause with WaveSurfer ────────────────────── */
  useEffect(() => {
    if (!wsRef.current || !wsReady) return;
    const ws = wsRef.current;
    if (isPlaying) {
      if (!ws.isPlaying()) ws.play();
    } else {
      if (ws.isPlaying()) ws.pause();
    }
  }, [isPlaying, wsReady]);

  /* ── Zoom ───────────────────────────────────────────────── */
  const handleZoom = useCallback((v: number) => {
    setZoom(v);
    wsRef.current?.zoom(v);
  }, []);

  /* ── Trim ───────────────────────────────────────────────── */
  const handleTrim = useCallback(async () => {
    if (!selectedRegion || !wsRef.current || !activeTrackId) return;

    const allRegions: any[] = regPluginRef.current?.getRegions() ?? [];
    const region = allRegions.find((r: any) => r.id === selectedRegion);
    if (!region) return;

    const buffer = wsRef.current.getDecodedData() as AudioBuffer | null;
    if (!buffer) return;

    const { start, end } = region;
    const audioCtx   = new AudioContext();
    const sampleRate = buffer.sampleRate;
    const startSamp  = Math.floor(start * sampleRate);
    const endSamp    = Math.floor(end   * sampleRate);
    const length     = endSamp - startSamp;
    if (length <= 0) {
      await audioCtx.close();
      return;
    }

    const trimmed = audioCtx.createBuffer(buffer.numberOfChannels, length, sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch).slice(startSamp, endSamp);
      trimmed.copyToChannel(src, ch);
    }

    const blob = await audioBufferToWavBlob(trimmed);
    const url  = URL.createObjectURL(blob);
    useAudioStore.getState().updateTrackUrl(activeTrackId, url);
    wsRef.current.load(url);
    await audioCtx.close();
  }, [selectedRegion, activeTrackId]);

  /* ── Fade ───────────────────────────────────────────────── */
  const handleFade = useCallback(async () => {
    if (!wsRef.current || !activeTrackId) return;
    const buffer = wsRef.current.getDecodedData() as AudioBuffer | null;
    if (!buffer) return;

    const audioCtx    = new AudioContext();
    const fadeSamples = Math.floor(2 * buffer.sampleRate);
    const total       = buffer.length;

    const out = audioCtx.createBuffer(buffer.numberOfChannels, total, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch).slice();
      if (fadeType === "in") {
        for (let i = 0; i < fadeSamples && i < total; i++) data[i] *= i / fadeSamples;
      } else {
        for (let i = 0; i < fadeSamples; i++) {
          const idx = total - fadeSamples + i;
          if (idx >= 0 && idx < total) data[idx] *= (fadeSamples - i) / fadeSamples;
        }
      }
      out.copyToChannel(data, ch);
    }

    const blob = await audioBufferToWavBlob(out);
    const url  = URL.createObjectURL(blob);
    useAudioStore.getState().updateTrackUrl(activeTrackId, url);
    wsRef.current.load(url);
    await audioCtx.close();
  }, [fadeType, activeTrackId]);

  /* ── Add Region ─────────────────────────────────────────── */
  const handleAddRegion = useCallback(() => {
    if (!regPluginRef.current || !wsRef.current) return;
    const dur = wsRef.current.getDuration() ?? 10;
    regPluginRef.current.addRegion({
      start:  dur * 0.2,
      end:    dur * 0.6,
      color:  "rgba(0, 255, 255, 0.12)",
      drag:   true,
      resize: true,
    });
  }, []);

  /* ── Delete Region ──────────────────────────────────────── */
  const handleDeleteRegion = useCallback(() => {
    if (!selectedRegion || !regPluginRef.current) return;
    const allRegions: any[] = regPluginRef.current.getRegions() ?? [];
    allRegions.find((r: any) => r.id === selectedRegion)?.remove();
    setRegions((prev) => prev.filter((r) => r.id !== selectedRegion));
    setSelectedRegion(null);
  }, [selectedRegion]);

  const tools = [
    { label: "ADD REGION",     icon: "⬚", action: handleAddRegion,   disabled: !wsReady },
    { label: "TRIM TO REGION", icon: "✂", action: handleTrim,         disabled: !selectedRegion },
    { label: "DELETE REGION",  icon: "✕", action: handleDeleteRegion, disabled: !selectedRegion },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-[0.2em] text-cyan-400" style={{ fontFamily: "var(--font-display)" }}>
            WAVEFORM EDITOR
          </h2>
          <p className="text-[10px] font-mono text-gray-500 mt-0.5">
            {activeTrack ? activeTrack.name : "No track loaded — use LOAD TRACK to begin"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-gray-500">ZOOM</span>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            value={zoom}
            onChange={(e) => handleZoom(Number(e.target.value))}
            className="w-24"
            style={{ "--value": `${((zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100}%` } as React.CSSProperties}
          />
          <span className="text-[9px] font-mono text-cyan-400 w-6">{zoom}x</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {tools.map((t) => (
          <button
            key={t.label}
            onClick={t.action}
            disabled={t.disabled}
            className="btn-cyber text-[9px] py-1.5 px-3 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {t.icon} {t.label}
          </button>
        ))}

        {/* Fade controls */}
        <div className="flex items-center gap-1 border border-cyan-500/20 p-1 rounded">
          {(["in", "out"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFadeType(f)}
              className={`text-[9px] font-mono px-2 py-1 rounded transition-all ${
                fadeType === f ? "bg-cyan-500/20 text-cyan-400" : "text-gray-500"
              }`}
            >
              FADE {f.toUpperCase()}
            </button>
          ))}
          <button
            onClick={handleFade}
            disabled={!wsReady}
            className="btn-cyber text-[9px] py-1 px-2 disabled:opacity-30"
          >
            APPLY
          </button>
        </div>
      </div>

      {/* Waveform */}
      <div className="panel flex-1 relative overflow-hidden p-3">
        {!activeTrack && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            <div className="w-16 h-16 border border-cyan-500/20 flex items-center justify-center">
              <span className="text-2xl text-cyan-500/30">⊿</span>
            </div>
            <p className="text-[10px] font-mono text-gray-600 tracking-widest">AWAITING AUDIO INPUT</p>
          </div>
        )}
        {!wsReady && activeTrack && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
            <div className="flex items-center gap-3">
              <div className="loader-cyber w-6 h-6" />
              <span className="text-xs font-mono text-cyan-400 tracking-widest">DECODING AUDIO...</span>
            </div>
          </div>
        )}
        <div ref={containerRef} className="wavesurfer-container" />
        <div ref={timelineRef} className="mt-1 opacity-50" />
      </div>

      {/* Region list */}
      {regions.length > 0 && (
        <div className="panel p-3">
          <p className="text-[9px] font-mono text-gray-500 tracking-widest mb-2">REGIONS</p>
          <div className="flex flex-wrap gap-2">
            {regions.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedRegion(r.id)}
                className={`text-[9px] font-mono px-2 py-1 border rounded transition-all ${
                  selectedRegion === r.id
                    ? "border-cyan-400 text-cyan-400 bg-cyan-500/10"
                    : "border-gray-700 text-gray-500"
                }`}
              >
                {r.start.toFixed(1)}s → {r.end.toFixed(1)}s
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── AudioBuffer → WAV Blob ────────────────────────────────── */
function audioBufferToWavBlob(buffer: AudioBuffer): Promise<Blob> {
  return new Promise((resolve) => {
    const numChannels = buffer.numberOfChannels;
    const length      = buffer.length * numChannels * 2;
    const ab          = new ArrayBuffer(44 + length);
    const view        = new DataView(ab);

    const ws   = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    const wu32 = (o: number, v: number) => view.setUint32(o, v, true);
    const wu16 = (o: number, v: number) => view.setUint16(o, v, true);

    ws(0,  "RIFF"); wu32(4,  36 + length);
    ws(8,  "WAVE"); ws(12,  "fmt ");
    wu32(16, 16);   wu16(20, 1);
    wu16(22, numChannels);
    wu32(24, buffer.sampleRate);
    wu32(28, buffer.sampleRate * numChannels * 2);
    wu16(32, numChannels * 2); wu16(34, 16);
    ws(36, "data"); wu32(40, length);

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }

    resolve(new Blob([ab], { type: "audio/wav" }));
  });
}
