"use client";

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
    togglePower,
    toggleMode
  } = useMicroscope();

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const setPreset = (preset: '4x' | '10x' | '40x' | '100x') => {
    switch (preset) {
      case '4x':
        setParams({ brightness: 0.0, contrast: 1.2, sharpenIntensity: 0.8, edgeThreshold: 0.05 });
        break;
      case '10x':
        setParams({ brightness: 0.0, contrast: 1.0, sharpenIntensity: 1.5, edgeThreshold: 0.1 });
        break;
      case '40x':
        setParams({ brightness: 0.1, contrast: 1.1, sharpenIntensity: 3.0, edgeThreshold: 0.2 });
        break;
      case '100x':
        setParams({ brightness: 0.25, contrast: 1.4, sharpenIntensity: 1.2, edgeThreshold: 0.35 });
        break;
    }
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

          <div className="w-full flex flex-col gap-6 mt-4">
            <h2 className="font-label-caps text-primary-fixed text-[14px]">Ajustes Manuais</h2>
            
            {/* Brilho */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between font-data-mono text-[12px] text-on-surface-variant">
                <span>Brilho</span>
                <span>{params.brightness.toFixed(2)}</span>
              </div>
              <input type="range" min="-0.5" max="0.5" step="0.05" value={params.brightness} onChange={(e) => setParams({...params, brightness: parseFloat(e.target.value)})} className="w-full accent-primary-fixed" />
            </div>

            {/* Contraste */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between font-data-mono text-[12px] text-on-surface-variant">
                <span>Contraste</span>
                <span>{params.contrast.toFixed(2)}</span>
              </div>
              <input type="range" min="0.5" max="2.0" step="0.1" value={params.contrast} onChange={(e) => setParams({...params, contrast: parseFloat(e.target.value)})} className="w-full accent-primary-fixed" />
            </div>

            {/* Nitidez */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between font-data-mono text-[12px] text-on-surface-variant">
                <span>Nitidez</span>
                <span>{params.sharpenIntensity.toFixed(1)}</span>
              </div>
              <input type="range" min="0.0" max="5.0" step="0.1" value={params.sharpenIntensity} onChange={(e) => setParams({...params, sharpenIntensity: parseFloat(e.target.value)})} className="w-full accent-primary-fixed" />
            </div>

            {/* Limiar de Ruído */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between font-data-mono text-[12px] text-on-surface-variant">
                <span>Limiar (Ruído)</span>
                <span>{params.edgeThreshold.toFixed(2)}</span>
              </div>
              <input type="range" min="0.0" max="0.5" step="0.05" value={params.edgeThreshold} onChange={(e) => setParams({...params, edgeThreshold: parseFloat(e.target.value)})} className="w-full accent-primary-fixed" />
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
