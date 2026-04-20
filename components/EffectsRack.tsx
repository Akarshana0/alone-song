"use client";
// frontend/components/EffectsRack.tsx

import { useState, useCallback } from "react";
import { useAudioStore } from "@/store/useAudioStore";

export default function EffectsRack() {
  const reverb      = useAudioStore((s) => s.reverb);
  const delay       = useAudioStore((s) => s.delay);
  const compression = useAudioStore((s) => s.compression);
  const setReverb      = useAudioStore((s) => s.setReverb);
  const setDelay       = useAudioStore((s) => s.setDelay);
  const setCompression = useAudioStore((s) => s.setCompression);

  // Local state for FX params not in global store (Tone.js nodes controlled directly)
  const [reverbDecay,    setReverbDecay]    = useState(2.5);
  const [reverbPreDelay, setReverbPreDelay] = useState(10);
  const [delayTime,      setDelayTime]      = useState(250);
  const [delayFeedback,  setDelayFeedback]  = useState(30);

  const handleReverbDecay = useCallback(async (v: number) => {
    setReverbDecay(v);
    try {
      const engine = (window as any).__toneEngine as any;
      if (engine?.reverb) engine.reverb.decay = v;
    } catch (_) {}
  }, []);

  const handleReverbPreDelay = useCallback(async (v: number) => {
    setReverbPreDelay(v);
    try {
      const engine = (window as any).__toneEngine as any;
      if (engine?.reverb) engine.reverb.preDelay = v / 1000;
    } catch (_) {}
  }, []);

  const handleDelayTime = useCallback(async (v: number) => {
    setDelayTime(v);
    try {
      const engine = (window as any).__toneEngine as any;
      if (engine?.delay) engine.delay.delayTime.value = v / 1000;
    } catch (_) {}
  }, []);

  const handleDelayFeedback = useCallback(async (v: number) => {
    setDelayFeedback(v);
    try {
      const engine = (window as any).__toneEngine as any;
      if (engine?.delay) engine.delay.feedback.value = v / 100;
    } catch (_) {}
  }, []);

  return (
    <div className="flex flex-col gap-6 h-full">
      <div>
        <h2 className="text-sm font-bold tracking-[0.2em] text-cyan-400" style={{ fontFamily: "var(--font-display)" }}>
          FX RACK
        </h2>
        <p className="text-[10px] font-mono text-gray-500 mt-0.5">Tone.js nodes · Real-time signal chain</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* REVERB */}
        <FXModule title="REVERB" color="#00FFFF" description="Convolution Reverb">
          <FXKnob label="WET"       value={reverb * 100}  min={0}   max={100} unit="%" onChange={(v) => setReverb(v / 100)} />
          <FXKnob label="DECAY"     value={reverbDecay}   min={0.1} max={10}  unit="s" onChange={handleReverbDecay} />
          <FXKnob label="PRE-DELAY" value={reverbPreDelay} min={0}  max={100} unit="ms" onChange={handleReverbPreDelay} />
        </FXModule>

        {/* DELAY */}
        <FXModule title="DELAY" color="#FFB800" description="Feedback Delay">
          <FXKnob label="WET"      value={delay * 100}  min={0}  max={100}  unit="%" onChange={(v) => setDelay(v / 100)} />
          <FXKnob label="TIME"     value={delayTime}    min={10} max={2000} unit="ms" onChange={handleDelayTime} />
          <FXKnob label="FEEDBACK" value={delayFeedback} min={0} max={95}   unit="%" onChange={handleDelayFeedback} />
        </FXModule>

        {/* COMPRESSOR */}
        <FXModule title="COMPRESSOR" color="#7B2FFF" description="Dynamic Compressor">
          <FXKnob label="THRESHOLD" value={compression.threshold} min={-60} max={0}  unit="dB" onChange={(v) => setCompression({ threshold: v })} />
          <FXKnob label="RATIO"     value={compression.ratio}     min={1}   max={20} unit=":1" onChange={(v) => setCompression({ ratio: v })} />
          <FXKnob label="KNEE"      value={compression.knee}      min={0}   max={40} unit="dB" onChange={(v) => setCompression({ knee: v })} />
        </FXModule>
      </div>

      {/* Signal chain visualizer */}
      <div className="panel p-4">
        <p className="text-[9px] font-mono text-gray-500 tracking-widest mb-4">SIGNAL CHAIN</p>
        <div className="flex items-center gap-2 flex-wrap">
          {["INPUT", "PITCH SHIFT", "EQ (10-band)", "REVERB", "DELAY", "COMPRESSOR", "MASTER VOL", "OUTPUT"].map(
            (node, i, arr) => (
              <div key={node} className="flex items-center gap-2">
                <div className="text-[8px] font-mono border border-cyan-500/30 px-2 py-1 text-cyan-400 bg-cyan-500/5 rounded">
                  {node}
                </div>
                {i < arr.length - 1 && <span className="text-cyan-500/30 text-xs">→</span>}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function FXModule({
  title, color, description, children,
}: {
  title: string; color: string; description: string; children: React.ReactNode;
}) {
  return (
    <div className="panel p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold tracking-widest" style={{ color, fontFamily: "var(--font-display)" }}>
            {title}
          </h3>
          <p className="text-[8px] font-mono text-gray-600">{description}</p>
        </div>
        <div className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      </div>
      <div className="flex justify-around gap-2">{children}</div>
    </div>
  );
}

function FXKnob({
  label, value, min, max, unit, onChange,
}: {
  label: string; value: number; min: number; max: number; unit: string;
  onChange: (v: number) => void;
}) {
  // Use parent value as source of truth (fixes sync bug with store)
  const clampedValue = Math.max(min, Math.min(max, value));
  const pct = ((clampedValue - min) / (max - min)) * 100;

  const handleChange = useCallback((v: number) => {
    onChange(v);
  }, [onChange]);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* SVG knob (visual only) */}
      <div className="relative w-12 h-12 pointer-events-none">
        <svg viewBox="0 0 48 48" className="w-full h-full">
          <circle cx="24" cy="24" r="20" fill="none" stroke="#1a1a1a" strokeWidth="4" />
          <circle
            cx="24" cy="24" r="20"
            fill="none" stroke="#00FFFF" strokeWidth="4"
            strokeDasharray={`${pct * 1.257} 125.7`}
            strokeLinecap="round"
            transform="rotate(-90 24 24)"
            style={{ filter: "drop-shadow(0 0 3px rgba(0,255,255,0.6))" }}
          />
          <circle cx="24" cy="24" r="8" fill="#0f0f0f" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[8px] font-mono text-cyan-400">{clampedValue.toFixed(0)}</span>
        </div>
      </div>

      {/* Functional range slider */}
      <input
        type="range"
        min={min}
        max={max}
        step={(max - min) / 100}
        value={clampedValue}
        onChange={(e) => handleChange(Number(e.target.value))}
        className="w-12"
        style={{ "--value": `${pct}%` } as React.CSSProperties}
      />

      <div className="text-center">
        <p className="text-[8px] font-mono text-gray-500">{label}</p>
        <p className="text-[7px] font-mono text-gray-600">{unit}</p>
      </div>
    </div>
  );
}
