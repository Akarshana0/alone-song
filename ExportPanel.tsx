"use client";
// frontend/components/ExportPanel.tsx

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useAudioStore } from "@/store/useAudioStore";

type Format  = "wav" | "mp3";
type Quality = "128" | "192" | "320";

export default function ExportPanel() {
  const tracks        = useAudioStore((s) => s.tracks);
  const activeTrackId = useAudioStore((s) => s.activeTrackId);

  const [format,    setFormat]    = useState<Format>("wav");
  const [quality,   setQuality]   = useState<Quality>("320");
  const [exporting, setExporting] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const activeTrack = tracks.find((t) => t.id === activeTrackId);

  const handleExport = useCallback(async () => {
    if (!activeTrack?.url) return;
    setExporting(true);
    setDone(false);
    setError(null);
    setProgress(0);

    try {
      const resp = await fetch(activeTrack.url);
      if (!resp.ok) throw new Error("Failed to read audio data");
      const blob = await resp.blob();

      if (format === "wav") {
        await simulateProgress(setProgress);
        downloadBlob(blob, `${stripExt(activeTrack.name)}_ALONE_export.wav`, "audio/wav");
      } else {
        await simulateProgress(setProgress);
        const mp3Blob = await encodeToMp3(blob, Number(quality) as 128 | 192 | 320);
        downloadBlob(mp3Blob, `${stripExt(activeTrack.name)}_ALONE_export.mp3`, "audio/mpeg");
      }

      setDone(true);
    } catch (err) {
      console.error("Export error:", err);
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [activeTrack, format, quality]);

  return (
    <div className="flex flex-col gap-6 h-full">
      <div>
        <h2 className="text-sm font-bold tracking-[0.2em] text-cyan-400" style={{ fontFamily: "var(--font-display)" }}>
          EXPORT
        </h2>
        <p className="text-[10px] font-mono text-gray-500 mt-0.5">Mixdown & download high-quality audio</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Export settings */}
        <div className="panel p-5 flex flex-col gap-5">
          <p className="text-[10px] font-mono text-gray-400 tracking-widest uppercase">Export Settings</p>

          {/* Format */}
          <div className="flex flex-col gap-2">
            <p className="text-[9px] font-mono text-gray-500">FORMAT</p>
            <div className="flex gap-2">
              {(["wav", "mp3"] as Format[]).map((f) => (
                <button
                  key={f}
                  onClick={() => { setFormat(f); setDone(false); setError(null); }}
                  className={`flex-1 py-2 text-[10px] font-mono tracking-widest border transition-all ${
                    format === f
                      ? "border-cyan-400 text-cyan-400 bg-cyan-500/15"
                      : "border-gray-700 text-gray-500 hover:border-gray-500"
                  }`}
                >
                  .{f.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="text-[8px] font-mono text-gray-600">
              {format === "wav" ? "Lossless · PCM 16-bit · Full quality" : "Compressed · Lossy · Smaller file size"}
            </p>
          </div>

          {/* Quality (MP3 only) */}
          {format === "mp3" && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2">
              <p className="text-[9px] font-mono text-gray-500">BITRATE</p>
              <div className="flex gap-2">
                {(["128", "192", "320"] as Quality[]).map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    className={`flex-1 py-2 text-[9px] font-mono tracking-widest border transition-all ${
                      quality === q
                        ? "border-cyan-400 text-cyan-400 bg-cyan-500/15"
                        : "border-gray-700 text-gray-500 hover:border-gray-500"
                    }`}
                  >
                    {q}k
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-[9px] font-mono text-gray-500">SAMPLE RATE</p>
            <p className="text-[10px] font-mono text-gray-300">44,100 Hz (44.1 kHz)</p>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-[9px] font-mono text-gray-500">SOURCE</p>
            <p className="text-[10px] font-mono text-cyan-400 truncate">
              {activeTrack?.name ?? "No track selected"}
            </p>
          </div>

          <button
            onClick={handleExport}
            disabled={!activeTrack || exporting}
            className="btn-cyber-solid text-xs py-3 w-full disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {exporting ? "PROCESSING…" : `⇡ EXPORT ${format.toUpperCase()}`}
          </button>

          {exporting && (
            <div>
              <div className="progress-cyber h-1.5">
                <motion.div
                  className="progress-cyber-fill"
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: "linear" }}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[8px] font-mono text-gray-500 mt-1 text-right">{progress}%</p>
            </div>
          )}

          {done && !exporting && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-[10px] font-mono text-cyan-400 tracking-widest text-center">
              ✓ EXPORT COMPLETE — CHECK DOWNLOADS
            </motion.p>
          )}

          {error && (
            <p className="text-[10px] font-mono text-red-400 text-center break-words">{error}</p>
          )}
        </div>

        {/* Stems export */}
        <div className="panel p-5 flex flex-col gap-4">
          <p className="text-[10px] font-mono text-gray-400 tracking-widest uppercase">Stem Exports</p>
          {activeTrack?.stems ? (
            <div className="flex flex-col gap-2">
              {Object.entries(activeTrack.stems).map(([stem, url]) => (
                <div key={stem} className="flex items-center justify-between border border-gray-800 p-2 rounded">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span className="text-[10px] font-mono text-gray-300 uppercase tracking-widest">{stem}</span>
                  </div>
                  {/* Use button instead of anchor to avoid COEP issues with blob URLs */}
                  <button
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = url!;
                      a.download = `${stem}.wav`;
                      a.click();
                    }}
                    className="btn-cyber text-[8px] py-1 px-2"
                  >
                    ⇡ DL
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
              <p className="text-3xl text-gray-800">◈</p>
              <p className="text-[9px] font-mono text-gray-600 tracking-widest">NO STEMS AVAILABLE</p>
              <p className="text-[8px] font-mono text-gray-700">Run AI Separator on a track first</p>
            </div>
          )}
        </div>
      </div>

      {/* All tracks list */}
      {tracks.length > 1 && (
        <div className="panel p-4 flex flex-col gap-3">
          <p className="text-[9px] font-mono text-gray-500 tracking-widest">ALL TRACKS</p>
          <div className="flex flex-col gap-2">
            {tracks.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-[9px] font-mono">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-sm" style={{ background: t.color }} />
                  <span className="text-gray-400 truncate max-w-xs">{t.name}</span>
                </div>
                <button
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = t.url;
                    a.download = t.name;
                    a.click();
                  }}
                  className="text-cyan-400 hover:text-cyan-300"
                >
                  ⇡ WAV
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Utilities ─────────────────────────────────────────────── */
const stripExt = (name: string) => name.replace(/\.[^.]+$/, "");

function downloadBlob(blob: Blob, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([blob], { type }));
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function simulateProgress(setProgress: (v: number) => void): Promise<void> {
  return new Promise((resolve) => {
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 18 + 4;
      if (p >= 100) {
        clearInterval(iv);
        setProgress(100);
        setTimeout(resolve, 150);
      } else {
        setProgress(Math.round(p));
      }
    }, 100);
  });
}

async function encodeToMp3(wavBlob: Blob, bitrate: 128 | 192 | 320): Promise<Blob> {
  const arrayBuffer = await wavBlob.arrayBuffer();
  const audioCtx    = new AudioContext();
  let buffer: AudioBuffer;

  try {
    buffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    await audioCtx.close();
  }

  try {
    // Dynamic import for lamejs
    const lamejs     = await import("lamejs");
    const Mp3Encoder = (lamejs as any).default?.Mp3Encoder ?? (lamejs as any).Mp3Encoder;
    if (!Mp3Encoder) throw new Error("lamejs not available");

    const isMono     = buffer!.numberOfChannels === 1;
    const channels   = isMono ? 1 : 2;
    const mp3encoder = new Mp3Encoder(channels, buffer!.sampleRate, bitrate);

    const left  = buffer!.getChannelData(0);
    const right = isMono ? null : buffer!.getChannelData(1);

    const toInt16 = (f: Float32Array) =>
      Int16Array.from(f, (s) => Math.max(-32768, Math.min(32767, s * 32768)));

    const BLOCK   = 1152;
    const mp3Data: Uint8Array[] = [];

    for (let i = 0; i < left.length; i += BLOCK) {
      const l   = toInt16(left.slice(i, i + BLOCK));
      let enc: Int8Array;
      if (isMono) {
        enc = mp3encoder.encodeBuffer(l);
      } else {
        const r = toInt16(right!.slice(i, i + BLOCK));
        enc = mp3encoder.encodeBuffer(l, r);
      }
      if (enc.length > 0) mp3Data.push(new Uint8Array(enc.buffer, enc.byteOffset, enc.byteLength));
    }
    const flush = mp3encoder.flush();
    if (flush.length > 0) mp3Data.push(new Uint8Array(flush.buffer, flush.byteOffset, flush.byteLength));

    return new Blob(mp3Data, { type: "audio/mpeg" });
  } catch (e) {
    console.warn("lamejs encode failed, falling back to WAV:", e);
    return wavBlob;
  }
}
