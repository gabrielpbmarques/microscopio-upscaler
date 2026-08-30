"use client";

import { useState } from "react";
import { useMicroscope } from "@/hooks/useMicroscope";

export default function Home() {
  const {
    videoRef,
    canvasRef,
    isPowerOn,
    isUpscaledMode,
    signalStatus,
    fps,
    sessionSeconds,
    params,
    setParams,
    applyParams,
    resetParams,
    togglePower,
    toggleMode
  } = useMicroscope();

  const [appliedFeedback, setAppliedFeedback] = useState(false);

  const handleApply = () => {
    applyParams();
    setAppliedFeedback(true);
    setTimeout(() => setAppliedFeedback(false), 2000);
  };

  const handleReset = () => {
    resetParams();
    setAppliedFeedback(true);
    setTimeout(() => setAppliedFeedback(false), 2000);
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const setPreset = (preset: '4x' | '10x' | '40x' | '100x') => {
    switch (preset) {
      case '4x':
        applyParams({ brightness: 0.0, contrast: 1.1, sharpenIntensity: 0.35, edgeThreshold: 0.02 });
        break;
      case '10x':
        applyParams({ brightness: 0.0, contrast: 1.2, sharpenIntensity: 0.55, edgeThreshold: 0.05 });
        break;
      case '40x':
        applyParams({ brightness: 0.05, contrast: 1.3, sharpenIntensity: 0.75, edgeThreshold: 0.10 });
        break;
      case '100x':
        applyParams({ brightness: 0.1, contrast: 1.4, sharpenIntensity: 0.95, edgeThreshold: 0.15 });
        break;
    }
    setAppliedFeedback(true);
    setTimeout(() => setAppliedFeedback(false), 2000);
  };

  return (
    <>
      <main className="relative flex-1 bg-black">
        {/* Synthetic Feed (when off) */}
        <div
          className={`absolute inset-0 z-[0] opacity-40 bg-[url('https://lh3.googleusercontent.com/aida-public/AB6AXuBYzwSopVfwNChzz99pbbfJKLV-pkvlNfg_DvLjA0C6El0M5oeU4a63PLW5smow1ycNF1Ke2meXvFTayPyrQKofC9ICFNQwmjt6klWlxnIEl3L3cPhiwed7oQVC56iOdrCSNYjMU9M3od0RiIuv01xvi-txZyfWdQV5seC7OgYpTHSFTsOM3YEjLDFy59Ia9rZIfUXZeCeKxnQnjIc6UU2z-_qrmbyv5lhudyhHEcGdOllspfmercxa')] bg-cover bg-center transition-opacity duration-700 ${isPowerOn ? 'hidden' : 'block'}`}
        />

        {/* Video & Canvas */}
        <video ref={videoRef} className={`w-full h-full object-cover ${(!isPowerOn || isUpscaledMode) ? 'hidden' : 'block'}`} />
        <canvas ref={canvasRef} className={`w-full h-full object-cover ${(!isPowerOn || !isUpscaledMode) ? 'hidden' : 'block'}`} />

        {/* HUD Overlays */}
        <div className="absolute inset-0 scanlines z-10"></div>
        <div className="absolute inset-0 vignette z-20"></div>

        <div className="fixed inset-0 pointer-events-none z-30 flex items-center justify-center">
          <div className="absolute top-1/2 left-0 w-full h-[0.5px] bg-primary-fixed-dim/30"></div>
          <div className="absolute top-0 left-1/2 w-[0.5px] h-full bg-primary-fixed-dim/30"></div>
          
          <div className="absolute w-[120px] h-[120px] rounded-full border border-primary-fixed-dim/30"></div>
          <div className="absolute w-[8px] h-[8px] rounded-full bg-primary-fixed-dim/50 shadow-[0_0_8px_#00e0b3]"></div>
        </div>

        {/* TopNavBar */}
        <header className="fixed top-0 left-0 w-full flex items-start justify-between p-edge-margin z-40 pointer-events-none">
          <div className="flex flex-col gap-1">
            <h1 className="font-headline-md tracking-tight text-primary-fixed drop-shadow-[0_0_8px_rgba(36,255,205,0.4)] m-0">
              Micro-Lens AI
            </h1>
            <div className="font-label-caps text-on-surface-variant flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isPowerOn ? 'bg-primary-fixed animate-pulse' : 'bg-error'}`}></span>
              Sinal: <span>{signalStatus}</span>
            </div>
            <div className="font-data-mono text-[10px] text-on-surface-variant uppercase mt-1">
              MODO: <span className="text-primary-fixed">{isUpscaledMode ? "ALTA RESOLUÇÃO" : "VISÃO DIRETA"}</span>
            </div>
          </div>
        </header>

        {/* SideNavBar - Controls */}
        <aside className="hidden md:flex fixed right-0 top-0 h-full w-[340px] bg-surface/80 backdrop-blur-xl border-l border-outline-variant shadow-2xl flex-col items-start py-8 px-edge-margin gap-6 z-40 overflow-y-auto pointer-events-auto">
          <div className="w-full">
            <p className="font-data-mono text-data-mono text-on-surface-variant">
              Sessão Ativa: <span>{formatTime(sessionSeconds)}</span>
            </p>
          </div>

          <div className="w-full mt-4 flex flex-col gap-4">
            <h2 className="font-label-caps text-primary-fixed text-[14px]">Predefinições de Lente</h2>
            <div className="grid grid-cols-2 gap-2">
              {(['4x', '10x', '40x', '100x'] as const).map(preset => (
                <button
                  key={preset}
                  onClick={() => setPreset(preset)}
                  className="bg-surface-variant hover:bg-surface-bright text-on-surface-variant hover:text-primary-fixed font-data-mono text-[12px] py-2 rounded-md transition-colors border border-outline-variant"
                >
                  {preset} {preset === '100x' && '(Oil)'}
                </button>
              ))}
            </div>
          </div>

          <div className="w-full flex flex-col gap-5 mt-4">
            <div className="flex items-center justify-between">
              <h2 className="font-label-caps text-primary-fixed text-[14px]">Ajustes Manuais</h2>
              <span className="font-data-mono text-[9px] text-primary-fixed bg-primary-fixed/10 px-2 py-0.5 rounded border border-primary-fixed/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed animate-pulse"></span>
                TEMPO REAL
              </span>
            </div>
            
            {/* Brilho */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between font-data-mono text-[12px] text-on-surface-variant">
                <span>Brilho</span>
                <span className="text-on-surface">{params.brightness.toFixed(2)}</span>
              </div>
              <input type="range" min="-0.5" max="0.5" step="0.01" value={params.brightness} onChange={(e) => setParams({...params, brightness: parseFloat(e.target.value)})} className="w-full accent-primary-fixed cursor-pointer" />
            </div>

            {/* Contraste */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between font-data-mono text-[12px] text-on-surface-variant">
                <span>Contraste</span>
                <span className="text-on-surface">{params.contrast.toFixed(2)}</span>
              </div>
              <input type="range" min="0.0" max="3.0" step="0.05" value={params.contrast} onChange={(e) => setParams({...params, contrast: parseFloat(e.target.value)})} className="w-full accent-primary-fixed cursor-pointer" />
            </div>

            {/* Nitidez */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between font-data-mono text-[12px] text-on-surface-variant">
                <span>Nitidez (RCAS)</span>
                <span className="text-primary-fixed font-bold">{params.sharpenIntensity.toFixed(2)}</span>
              </div>
              <input type="range" min="0.0" max="1.0" step="0.01" value={params.sharpenIntensity} onChange={(e) => setParams({...params, sharpenIntensity: parseFloat(e.target.value)})} className="w-full accent-primary-fixed cursor-pointer" />
            </div>

            {/* Limiar de Ruído */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between font-data-mono text-[12px] text-on-surface-variant">
                <span>Limiar (Ruído)</span>
                <span className="text-on-surface">{params.edgeThreshold.toFixed(2)}</span>
              </div>
              <input type="range" min="0.0" max="0.5" step="0.01" value={params.edgeThreshold} onChange={(e) => setParams({...params, edgeThreshold: parseFloat(e.target.value)})} className="w-full accent-primary-fixed cursor-pointer" />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleApply}
                className={`w-full flex items-center justify-center gap-2 font-data-mono text-[12px] font-semibold py-2.5 px-4 rounded-md transition-all cursor-pointer ${
                  appliedFeedback 
                    ? 'bg-primary-fixed text-on-primary-fixed shadow-[0_0_18px_rgba(36,255,205,0.7)]' 
                    : 'bg-primary-fixed text-on-primary-fixed shadow-[0_0_10px_rgba(36,255,205,0.3)] hover:shadow-[0_0_16px_rgba(36,255,205,0.5)] active:scale-95'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {appliedFeedback ? "check_circle" : "tune"}
                </span>
                <span>{appliedFeedback ? "ALTERAÇÕES APLICADAS!" : "APLICAR ALTERAÇÕES"}</span>
              </button>

              <button
                onClick={handleReset}
                className="w-full flex items-center justify-center gap-2 bg-surface-variant hover:bg-surface-bright text-on-surface-variant hover:text-on-surface font-data-mono text-[11px] py-2 px-4 rounded-md transition-colors border border-outline-variant cursor-pointer active:scale-95"
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                <span>Restaurar Padrões</span>
              </button>
            </div>
          </div>

          <div className="w-full mt-auto pt-6 border-t border-outline-variant/50">
            <div className="flex justify-between items-center w-full text-data-mono font-data-mono">
              <span className="text-on-surface-variant">FPS</span>
              <span className="text-primary-fixed">{fps}</span>
            </div>
          </div>
        </aside>

        {/* BottomNavBar */}
        <nav className="fixed bottom-viewport-safe-area left-1/2 -translate-x-1/2 flex items-center gap-panel-gap z-50 bg-surface-container-lowest/80 backdrop-blur-md border border-outline-variant shadow-[0_0_20px_rgba(0,0,0,0.5)] rounded-full px-6 py-3 pointer-events-auto">
          <button
            onClick={togglePower}
            className={`flex flex-col items-center justify-center gap-1 w-16 h-16 rounded-full transition-all cursor-pointer ${isPowerOn ? 'bg-primary-fixed text-on-primary-fixed shadow-[0_0_15px_#00e0b3]' : 'bg-surface-variant text-on-surface-variant hover:text-primary-fixed hover:bg-surface-variant/90 active:scale-90'}`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>power_settings_new</span>
            <span className="font-label-caps text-[9px] uppercase tracking-wider sr-only md:not-sr-only md:text-[10px]">Energia</span>
          </button>

          <button
            onClick={toggleMode}
            className="flex flex-col items-center justify-center gap-1 w-16 h-16 rounded-full hover:bg-surface-variant/50 active:scale-90 transition-all cursor-pointer"
          >
            <span className={`material-symbols-outlined ${isUpscaledMode ? 'text-primary-fixed glow-hover' : 'text-secondary-fixed-dim'}`} style={{ fontSize: '28px' }}>
              {isUpscaledMode ? "visibility" : "visibility_off"}
            </span>
            <span className="font-label-caps text-[9px] uppercase tracking-wider text-secondary-fixed-dim sr-only md:not-sr-only md:text-[10px]">
              Modo de Visão
            </span>
          </button>
        </nav>
      </main>
    </>
  );
}
