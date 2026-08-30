"use client";

import { useState } from "react";
import { useMicroscope } from "@/hooks/useMicroscope";

export default function Home() {
  const {
    videoRef,
    canvasRef,
    isPowerOn,
    isUpscaledMode,
    upscaleTarget,
    changeUpscaleTarget,
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showHUDOverlay, setShowHUDOverlay] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const setPreset = (preset: '4x' | '10x' | '40x' | '100x') => {
    switch (preset) {
      case '4x':
        applyParams({
          brightness: 0.0,
          contrast: 1.1,
          sharpenIntensity: 0.45,
          edgeThreshold: 0.02,
          gamma: 1.0,
          saturation: 1.0,
          localContrast: 0.15,
          edgeReconstruction: 1.8,
          detailBoost: 0.2,
          defringe: 0.0,
        });
        break;
      case '10x':
        applyParams({
          brightness: 0.0,
          contrast: 1.2,
          sharpenIntensity: 0.65,
          edgeThreshold: 0.04,
          gamma: 1.0,
          saturation: 1.05,
          localContrast: 0.25,
          edgeReconstruction: 2.2,
          detailBoost: 0.35,
          defringe: 0.1,
        });
        break;
      case '40x':
        applyParams({
          brightness: 0.05,
          contrast: 1.3,
          sharpenIntensity: 0.8,
          edgeThreshold: 0.08,
          gamma: 1.05,
          saturation: 1.1,
          localContrast: 0.4,
          edgeReconstruction: 3.0,
          detailBoost: 0.55,
          defringe: 0.25,
        });
        break;
      case '100x':
        applyParams({
          brightness: 0.1,
          contrast: 1.4,
          sharpenIntensity: 0.95,
          edgeThreshold: 0.12,
          gamma: 1.1,
          saturation: 1.15,
          localContrast: 0.55,
          edgeReconstruction: 4.0,
          detailBoost: 0.75,
          defringe: 0.4,
        });
        break;
    }
    setAppliedFeedback(true);
    setTimeout(() => setAppliedFeedback(false), 2000);
  };

  return (
    <>
      <main className="relative w-screen h-screen bg-black overflow-hidden select-none">
        {/* Synthetic Feed (when off) */}
        <div
          className={`absolute inset-0 z-[0] opacity-40 bg-[url('https://lh3.googleusercontent.com/aida-public/AB6AXuBYzwSopVfwNChzz99pbbfJKLV-pkvlNfg_DvLjA0C6El0M5oeU4a63PLW5smow1ycNF1Ke2meXvFTayPyrQKofC9ICFNQwmjt6klWlxnIEl3L3cPhiwed7oQVC56iOdrCSNYjMU9M3od0RiIuv01xvi-txZyfWdQV5seC7OgYpTHSFTsOM3YEjLDFy59Ia9rZIfUXZeCeKxnQnjIc6UU2z-_qrmbyv5lhudyhHEcGdOllspfmercxa')] bg-cover bg-center transition-opacity duration-700 ${isPowerOn ? 'hidden' : 'block'}`}
        />

        {/* Video & Canvas (True Clean Full-Screen Display) */}
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <video ref={videoRef} className={`w-full h-full object-contain ${(!isPowerOn || isUpscaledMode) ? 'hidden' : 'block'}`} />
          <canvas ref={canvasRef} className={`w-full h-full object-contain ${(!isPowerOn || !isUpscaledMode) ? 'hidden' : 'block'}`} />
        </div>

        {/* Optional Scientific HUD Overlays (Clean by default) */}
        {showHUDOverlay && (
          <>
            <div className="absolute inset-0 vignette z-20 pointer-events-none"></div>
            <div className="fixed inset-0 pointer-events-none z-30 flex items-center justify-center">
              <div className="absolute top-1/2 left-0 w-full h-[0.5px] bg-primary-fixed-dim/20"></div>
              <div className="absolute top-0 left-1/2 w-[0.5px] h-full bg-primary-fixed-dim/20"></div>
              <div className="absolute w-[120px] h-[120px] rounded-full border border-primary-fixed-dim/20"></div>
              <div className="absolute w-[6px] h-[6px] rounded-full bg-primary-fixed-dim/40 shadow-[0_0_6px_#00e0b3]"></div>
            </div>
          </>
        )}

        {/* TopNavBar */}
        <header className="fixed top-0 left-0 p-edge-margin z-40 pointer-events-none">
          <div className="flex flex-col gap-1">
            <h1 className="font-headline-md tracking-tight text-primary-fixed drop-shadow-[0_0_8px_rgba(36,255,205,0.4)] m-0">
              Micro-Lens AI
            </h1>
            <div className="font-label-caps text-on-surface-variant flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isPowerOn ? 'bg-primary-fixed animate-pulse' : 'bg-error'}`}></span>
              Sinal: <span>{signalStatus}</span>
            </div>
            <div className="font-data-mono text-[10px] text-on-surface-variant uppercase mt-1">
              MODO: <span className="text-primary-fixed">{isUpscaledMode ? `FSR ${upscaleTarget.toUpperCase()} ULTRA` : "VISÃO DIRETA"}</span>
            </div>
          </div>
        </header>

        {/* Floating Toggle Button for Side Menu */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`fixed top-6 z-50 p-2.5 rounded-full backdrop-blur-md border border-outline-variant shadow-2xl transition-all duration-300 cursor-pointer flex items-center justify-center ${
            isSidebarOpen 
              ? 'right-[380px] bg-surface-container-lowest/90 text-on-surface-variant hover:text-primary-fixed hover:bg-surface-bright' 
              : 'right-6 bg-primary-fixed text-on-primary-fixed shadow-[0_0_18px_rgba(36,255,205,0.6)] hover:scale-105 active:scale-95'
          }`}
          title={isSidebarOpen ? "Ocultar Painel (Tela Cheia)" : "Abrir Painel de Ajustes"}
        >
          <span className="material-symbols-outlined text-[22px]">
            {isSidebarOpen ? "chevron_right" : "tune"}
          </span>
        </button>

        {/* Retractable SideNavBar - Controls */}
        <aside
          className={`fixed right-0 top-0 h-full w-[360px] bg-surface/90 backdrop-blur-2xl border-l border-outline-variant shadow-2xl flex flex-col items-start py-6 px-edge-margin gap-5 z-40 overflow-y-auto pointer-events-auto custom-scrollbar transition-transform duration-300 ease-in-out ${
            isSidebarOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="w-full flex justify-between items-center pb-2 border-b border-outline-variant/40">
            <p className="font-data-mono text-[12px] text-on-surface-variant">
              Sessão: <span className="text-primary-fixed">{formatTime(sessionSeconds)}</span>
            </p>
            <div className="flex items-center gap-1.5 font-data-mono text-[11px] text-primary-fixed bg-primary-fixed/10 px-2 py-0.5 rounded border border-primary-fixed/30">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed animate-pulse"></span>
              GPU {fps} FPS
            </div>
          </div>

          {/* Upscaling Resolution Engine */}
          <div className="w-full flex flex-col gap-2">
            <h2 className="font-label-caps text-primary-fixed text-[13px] flex items-center justify-between">
              <span>Resolução de Upscaling</span>
              <span className="text-[10px] text-on-surface-variant font-normal uppercase">EASU FSR 1.0</span>
            </h2>
            <div className="grid grid-cols-3 gap-1.5">
              {(['2x', '4k', '4x'] as const).map(target => (
                <button
                  key={target}
                  onClick={() => changeUpscaleTarget(target)}
                  className={`font-data-mono text-[11px] py-1.5 px-1 rounded transition-all border cursor-pointer uppercase ${
                    upscaleTarget === target
                      ? 'bg-primary-fixed text-on-primary-fixed border-primary-fixed font-bold shadow-[0_0_10px_rgba(36,255,205,0.4)]'
                      : 'bg-surface-variant hover:bg-surface-bright text-on-surface-variant border-outline-variant'
                  }`}
                >
                  {target === '4k' ? '4K Nativo' : `${target.toUpperCase()} UHD`}
                </button>
              ))}
            </div>
          </div>

          {/* Scientific Color Modes */}
          <div className="w-full flex flex-col gap-2">
            <h2 className="font-label-caps text-primary-fixed text-[13px]">Coloração Científica</h2>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 0, label: 'Padrão' },
                { id: 1, label: 'DAPI Azul' },
                { id: 2, label: 'GFP Verde' },
                { id: 3, label: 'H&E Rosa' },
                { id: 4, label: 'Contraste Fase' },
              ].map(mode => (
                <button
                  key={mode.id}
                  onClick={() => applyParams({ colorMode: mode.id })}
                  className={`font-data-mono text-[10px] py-1.5 px-1 rounded transition-all border cursor-pointer ${
                    params.colorMode === mode.id
                      ? 'bg-primary-fixed text-on-primary-fixed border-primary-fixed font-bold shadow-[0_0_8px_rgba(36,255,205,0.3)]'
                      : 'bg-surface-variant hover:bg-surface-bright text-on-surface-variant border-outline-variant'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lens Presets */}
          <div className="w-full flex flex-col gap-2">
            <h2 className="font-label-caps text-primary-fixed text-[13px]">Predefinições de Lente</h2>
            <div className="grid grid-cols-4 gap-1.5">
              {(['4x', '10x', '40x', '100x'] as const).map(preset => (
                <button
                  key={preset}
                  onClick={() => setPreset(preset)}
                  className="bg-surface-variant hover:bg-surface-bright text-on-surface-variant hover:text-primary-fixed font-data-mono text-[11px] py-1.5 rounded transition-colors border border-outline-variant cursor-pointer text-center"
                >
                  {preset} {preset === '100x' && 'Oil'}
                </button>
              ))}
            </div>
          </div>

          {/* Manual Controls */}
          <div className="w-full flex flex-col gap-4 mt-1">
            {/* Section 1: Super Resolution & Detail */}
            <div className="flex flex-col gap-3 p-3 rounded-lg bg-surface-container-lowest/60 border border-outline-variant/50">
              <h3 className="font-label-caps text-primary-fixed-dim text-[11px] uppercase tracking-wider flex items-center justify-between">
                <span>Super Resolução & Nitidez</span>
                <span className="material-symbols-outlined text-[15px]">auto_fix_high</span>
              </h3>

              {/* Nitidez RCAS */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between font-data-mono text-[11px] text-on-surface-variant">
                  <span>Nitidez FSR (RCAS)</span>
                  <span className="text-primary-fixed font-bold">{params.sharpenIntensity.toFixed(2)}</span>
                </div>
                <input type="range" min="0.0" max="1.0" step="0.01" value={params.sharpenIntensity} onChange={(e) => setParams({...params, sharpenIntensity: parseFloat(e.target.value)})} className="w-full accent-primary-fixed cursor-pointer" />
              </div>

              {/* Injeção de Microdetalhes */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between font-data-mono text-[11px] text-on-surface-variant">
                  <span>Injeção de Microdetalhes</span>
                  <span className="text-primary-fixed font-bold">{params.detailBoost.toFixed(2)}</span>
                </div>
                <input type="range" min="0.0" max="1.0" step="0.01" value={params.detailBoost} onChange={(e) => setParams({...params, detailBoost: parseFloat(e.target.value)})} className="w-full accent-primary-fixed cursor-pointer" />
              </div>

              {/* Agressividade EASU */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between font-data-mono text-[11px] text-on-surface-variant">
                  <span>Agressividade de Borda (EASU)</span>
                  <span className="text-primary-fixed font-bold">{params.edgeReconstruction.toFixed(1)}x</span>
                </div>
                <input type="range" min="1.0" max="5.0" step="0.1" value={params.edgeReconstruction} onChange={(e) => setParams({...params, edgeReconstruction: parseFloat(e.target.value)})} className="w-full accent-primary-fixed cursor-pointer" />
              </div>

              {/* Microcontraste Local */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between font-data-mono text-[11px] text-on-surface-variant">
                  <span>Microcontraste Celular</span>
                  <span className="text-primary-fixed font-bold">{params.localContrast.toFixed(2)}</span>
                </div>
                <input type="range" min="0.0" max="1.0" step="0.01" value={params.localContrast} onChange={(e) => setParams({...params, localContrast: parseFloat(e.target.value)})} className="w-full accent-primary-fixed cursor-pointer" />
              </div>
            </div>

            {/* Section 2: Tonalidade & Claridade */}
            <div className="flex flex-col gap-3 p-3 rounded-lg bg-surface-container-lowest/60 border border-outline-variant/50">
              <h3 className="font-label-caps text-primary-fixed-dim text-[11px] uppercase tracking-wider flex items-center justify-between">
                <span>Tonalidade & Contraste</span>
                <span className="material-symbols-outlined text-[15px]">contrast</span>
              </h3>

              {/* Contraste */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between font-data-mono text-[11px] text-on-surface-variant">
                  <span>Contraste Global</span>
                  <span className="text-on-surface">{params.contrast.toFixed(2)}</span>
                </div>
                <input type="range" min="0.0" max="3.0" step="0.05" value={params.contrast} onChange={(e) => setParams({...params, contrast: parseFloat(e.target.value)})} className="w-full accent-primary-fixed cursor-pointer" />
              </div>

              {/* Brilho */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between font-data-mono text-[11px] text-on-surface-variant">
                  <span>Brilho</span>
                  <span className="text-on-surface">{params.brightness.toFixed(2)}</span>
                </div>
                <input type="range" min="-0.5" max="0.5" step="0.01" value={params.brightness} onChange={(e) => setParams({...params, brightness: parseFloat(e.target.value)})} className="w-full accent-primary-fixed cursor-pointer" />
              </div>

              {/* Curva Gamma */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between font-data-mono text-[11px] text-on-surface-variant">
                  <span>Curva Gamma</span>
                  <span className="text-on-surface">{params.gamma.toFixed(2)}</span>
                </div>
                <input type="range" min="0.5" max="2.5" step="0.05" value={params.gamma} onChange={(e) => setParams({...params, gamma: parseFloat(e.target.value)})} className="w-full accent-primary-fixed cursor-pointer" />
              </div>

              {/* Saturação */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between font-data-mono text-[11px] text-on-surface-variant">
                  <span>Saturação Cromática</span>
                  <span className="text-on-surface">{params.saturation.toFixed(2)}</span>
                </div>
                <input type="range" min="0.0" max="2.5" step="0.05" value={params.saturation} onChange={(e) => setParams({...params, saturation: parseFloat(e.target.value)})} className="w-full accent-primary-fixed cursor-pointer" />
              </div>
            </div>

            {/* Section 3: Limpeza Óptica & Sensor */}
            <div className="flex flex-col gap-3 p-3 rounded-lg bg-surface-container-lowest/60 border border-outline-variant/50">
              <h3 className="font-label-caps text-primary-fixed-dim text-[11px] uppercase tracking-wider flex items-center justify-between">
                <span>Limpeza Óptica & Sensor</span>
                <span className="material-symbols-outlined text-[15px]">lens</span>
              </h3>

              {/* Limiar de Ruído */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between font-data-mono text-[11px] text-on-surface-variant">
                  <span>Limiar Ruído (Denoise)</span>
                  <span className="text-on-surface">{params.edgeThreshold.toFixed(2)}</span>
                </div>
                <input type="range" min="0.0" max="0.5" step="0.01" value={params.edgeThreshold} onChange={(e) => setParams({...params, edgeThreshold: parseFloat(e.target.value)})} className="w-full accent-primary-fixed cursor-pointer" />
              </div>

              {/* Correção Cromática Defringe */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between font-data-mono text-[11px] text-on-surface-variant">
                  <span>Correção Cromática (Defringe)</span>
                  <span className="text-on-surface">{params.defringe.toFixed(2)}</span>
                </div>
                <input type="range" min="0.0" max="1.0" step="0.01" value={params.defringe} onChange={(e) => setParams({...params, defringe: parseFloat(e.target.value)})} className="w-full accent-primary-fixed cursor-pointer" />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 pt-1">
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
        </aside>

        {/* BottomNavBar */}
        <nav className="fixed bottom-viewport-safe-area left-1/2 -translate-x-1/2 flex items-center gap-4 z-50 bg-surface-container-lowest/85 backdrop-blur-xl border border-outline-variant shadow-[0_0_25px_rgba(0,0,0,0.6)] rounded-full px-5 py-2.5 pointer-events-auto">
          {/* Power Button */}
          <button
            onClick={togglePower}
            className={`flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-full transition-all cursor-pointer ${isPowerOn ? 'bg-primary-fixed text-on-primary-fixed shadow-[0_0_15px_#00e0b3]' : 'bg-surface-variant text-on-surface-variant hover:text-primary-fixed hover:bg-surface-variant/90 active:scale-90'}`}
            title="Ligar/Desligar Câmera"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>power_settings_new</span>
            <span className="font-label-caps text-[8px] uppercase tracking-wider">Energia</span>
          </button>

          {/* Upscale / Direct View Toggle */}
          <button
            onClick={toggleMode}
            className="flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-full hover:bg-surface-variant/50 active:scale-90 transition-all cursor-pointer"
            title="Alternar entre FSR Upscaled e Visão Direta"
          >
            <span className={`material-symbols-outlined ${isUpscaledMode ? 'text-primary-fixed drop-shadow-[0_0_6px_rgba(36,255,205,0.6)]' : 'text-secondary-fixed-dim'}`} style={{ fontSize: '24px' }}>
              {isUpscaledMode ? "visibility" : "visibility_off"}
            </span>
            <span className="font-label-caps text-[8px] uppercase tracking-wider text-secondary-fixed-dim">
              {isUpscaledMode ? "FSR 4K" : "Direto"}
            </span>
          </button>

          {/* Scientific HUD Overlay Toggle */}
          <button
            onClick={() => setShowHUDOverlay(!showHUDOverlay)}
            className={`flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-full hover:bg-surface-variant/50 active:scale-90 transition-all cursor-pointer ${showHUDOverlay ? 'text-primary-fixed' : 'text-on-surface-variant'}`}
            title="Ativar/Desativar Mira e Vinheta HUD"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
              {showHUDOverlay ? "filter_center_focus" : "center_focus_weak"}
            </span>
            <span className="font-label-caps text-[8px] uppercase tracking-wider text-secondary-fixed-dim">
              Mira HUD
            </span>
          </button>

          {/* Sidebar Toggle */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-full hover:bg-surface-variant/50 active:scale-90 transition-all cursor-pointer ${isSidebarOpen ? 'text-primary-fixed' : 'text-on-surface-variant'}`}
            title="Abrir/Fechar Painel de Ajustes"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
              {isSidebarOpen ? "dock_to_right" : "vertical_split"}
            </span>
            <span className="font-label-caps text-[8px] uppercase tracking-wider text-secondary-fixed-dim">
              Painel
            </span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="flex flex-col items-center justify-center gap-0.5 w-14 h-14 rounded-full hover:bg-surface-variant/50 active:scale-90 transition-all cursor-pointer text-on-surface-variant hover:text-primary-fixed"
            title="Alternar Tela Cheia"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
              {isFullscreen ? "fullscreen_exit" : "fullscreen"}
            </span>
            <span className="font-label-caps text-[8px] uppercase tracking-wider text-secondary-fixed-dim">
              {isFullscreen ? "Sair" : "Cheia"}
            </span>
          </button>
        </nav>
      </main>
    </>
  );
}
