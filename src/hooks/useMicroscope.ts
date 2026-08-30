import { useEffect, useRef, useState } from 'react';
import { WebGPUFSR } from '../lib/webgpu-fsr';

export interface WebGPUParameters {
  brightness: number; // -0.5 a 0.5
  contrast: number; // 0.0 a 3.0
  sharpenIntensity: number; // 0.0 a 1.0 (RCAS)
  edgeThreshold: number; // 0.0 a 0.5 (Denoise)
  gamma: number; // 0.5 a 2.5 (Gamma Curve)
  saturation: number; // 0.0 a 2.5 (Saturação)
  localContrast: number; // 0.0 a 1.0 (Microcontraste)
  edgeReconstruction: number; // 1.0 a 5.0 (Agressividade EASU)
  detailBoost: number; // 0.0 a 1.0 (Laplaciano de Microdetalhes)
  defringe: number; // 0.0 a 1.0 (Correção de Aberração)
  colorMode: number; // 0=Normal, 1=DAPI, 2=GFP, 3=H&E, 4=Fase/Invertido
}

export type UpscaleTarget = 'ultra_quality' | 'quality' | 'balanced' | 'performance' | '4k';

export function useMicroscope() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isPowerOn, setIsPowerOn] = useState(false);
  const isPowerOnRef = useRef(false);
  const [isUpscaledMode, setIsUpscaledMode] = useState(true);
  const [upscaleTarget, setUpscaleTarget] = useState<UpscaleTarget>('ultra_quality');
  const [signalStatus, setSignalStatus] = useState("AGUARDANDO");
  const [fps, setFps] = useState(0);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const fsrRef = useRef<WebGPUFSR | null>(null);
  const requestRef = useRef<number>(0);
  const sessionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [params, setParams] = useState<WebGPUParameters>({
    brightness: 0.0,
    contrast: 1.0,
    sharpenIntensity: 0.65,
    edgeThreshold: 0.04,
    gamma: 1.0,
    saturation: 1.0,
    localContrast: 0.2,
    edgeReconstruction: 2.0,
    detailBoost: 0.3,
    defringe: 0.0,
    colorMode: 0,
  });

  const lastTimeRef = useRef(0);
  const frameCountRef = useRef(0);

  async function initWebGPU() {
    if (!navigator.gpu) {
      console.error("WebGPU not supported on this browser.");
      return null;
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance'
    });
    if (!adapter) {
      console.error("No appropriate GPUAdapter found.");
      return null;
    }

    const device = await adapter.requestDevice();
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!context) {
      console.error("WebGPU context could not be created.");
      return null;
    }

    context.configure({
      device: device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: 'premultiplied'
    });

    const fsr = new WebGPUFSR(device, context);
    return fsr;
  }

  const getTargetDimensions = (videoWidth: number, videoHeight: number, target: UpscaleTarget) => {
    const aspect = videoHeight > 0 ? videoWidth / videoHeight : 16 / 9;
    switch (target) {
      case 'ultra_quality': // 1.3x AMD FidelityFX FSR Ultra Quality Mode
        return { width: Math.round(videoWidth * 1.3), height: Math.round(videoHeight * 1.3) };
      case 'quality': // 1.5x AMD FidelityFX FSR Quality Mode
        return { width: Math.round(videoWidth * 1.5), height: Math.round(videoHeight * 1.5) };
      case 'balanced': // 1.7x AMD FidelityFX FSR Balanced Mode
        return { width: Math.round(videoWidth * 1.7), height: Math.round(videoHeight * 1.7) };
      case 'performance': // 2.0x AMD FidelityFX FSR Performance Mode
        return { width: Math.round(videoWidth * 2.0), height: Math.round(videoHeight * 2.0) };
      case '4k': // 4K Native Target (3840x2160)
        const targetW = 3840;
        const targetH = Math.round(targetW / aspect);
        return { width: targetW, height: targetH };
      default:
        return { width: Math.round(videoWidth * 1.3), height: Math.round(videoHeight * 1.3) };
    }
  };

  const reinitPipelines = async (target: UpscaleTarget) => {
    if (!videoRef.current || !canvasRef.current || !fsrRef.current) return;
    const { videoWidth, videoHeight } = videoRef.current;
    if (videoWidth <= 0 || videoHeight <= 0) return;

    const dims = getTargetDimensions(videoWidth, videoHeight, target);
    canvasRef.current.width = dims.width;
    canvasRef.current.height = dims.height;

    await fsrRef.current.initialize(videoWidth, videoHeight, dims.width, dims.height);
    fsrRef.current.updateParams(
      paramsRef.current.brightness,
      paramsRef.current.contrast,
      paramsRef.current.sharpenIntensity,
      paramsRef.current.edgeThreshold,
      paramsRef.current.gamma,
      paramsRef.current.saturation,
      paramsRef.current.localContrast,
      paramsRef.current.edgeReconstruction,
      paramsRef.current.detailBoost,
      paramsRef.current.defringe,
      paramsRef.current.colorMode
    );
  };

  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
    if (fsrRef.current) {
      fsrRef.current.updateParams(
        params.brightness,
        params.contrast,
        params.sharpenIntensity,
        params.edgeThreshold,
        params.gamma,
        params.saturation,
        params.localContrast,
        params.edgeReconstruction,
        params.detailBoost,
        params.defringe,
        params.colorMode
      );
    }
  }, [params]);

  const changeUpscaleTarget = async (target: UpscaleTarget) => {
    setUpscaleTarget(target);
    await reinitPipelines(target);
  };

  function renderLoop(timestamp: number) {
    const video = videoRef.current;
    const fsr = fsrRef.current;

    if (!fsr || !video || !isPowerOnRef.current) return;

    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      fsr.render(video);

      // FPS tracking
      frameCountRef.current++;
      if (timestamp - lastTimeRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastTimeRef.current = timestamp;
      }
    }

    if (isPowerOnRef.current) {
      requestRef.current = requestAnimationFrame(renderLoop);
    }
  }

  const togglePower = async () => {
    if (!isPowerOn) {
      setSignalStatus("CONECTANDO...");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 3840 }, height: { ideal: 2160 } }
        });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = async () => {
            videoRef.current!.play();
            const { videoWidth, videoHeight } = videoRef.current!;
            
            if (canvasRef.current) {
              const dims = getTargetDimensions(videoWidth, videoHeight, upscaleTarget);
              canvasRef.current.width = dims.width;
              canvasRef.current.height = dims.height;
            }

            if (!fsrRef.current) {
              const fsr = await initWebGPU();
              if (fsr) {
                fsrRef.current = fsr;
              } else {
                setSignalStatus("FALHA: WEBGPU");
                return;
              }
            }

            if (fsrRef.current && videoRef.current && canvasRef.current) {
              await fsrRef.current.initialize(
                videoWidth,
                videoHeight,
                canvasRef.current.width,
                canvasRef.current.height
              );
              fsrRef.current.updateParams(
                paramsRef.current.brightness,
                paramsRef.current.contrast,
                paramsRef.current.sharpenIntensity,
                paramsRef.current.edgeThreshold,
                paramsRef.current.gamma,
                paramsRef.current.saturation,
                paramsRef.current.localContrast,
                paramsRef.current.edgeReconstruction,
                paramsRef.current.detailBoost,
                paramsRef.current.defringe,
                paramsRef.current.colorMode
              );
            }

            isPowerOnRef.current = true;
            setIsPowerOn(true);
            setSignalStatus("ESTÁVEL");

            sessionIntervalRef.current = setInterval(() => {
              setSessionSeconds(s => s + 1);
            }, 1000);

            requestRef.current = requestAnimationFrame(renderLoop);
          };
        }
      } catch (err) {
        console.error(err);
        setSignalStatus("FALHA");
      }
    } else {
      isPowerOnRef.current = false;
      setIsPowerOn(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (sessionIntervalRef.current) {
        clearInterval(sessionIntervalRef.current);
      }
      cancelAnimationFrame(requestRef.current);
      setSessionSeconds(0);
      setFps(0);
      setSignalStatus("AGUARDANDO");
    }
  };

  const toggleMode = () => {
    setIsUpscaledMode(!isUpscaledMode);
  };

  const applyParams = (customParams?: Partial<WebGPUParameters>) => {
    const target = { ...params, ...(customParams || {}) };
    setParams(target);
    if (fsrRef.current) {
      fsrRef.current.updateParams(
        target.brightness,
        target.contrast,
        target.sharpenIntensity,
        target.edgeThreshold,
        target.gamma,
        target.saturation,
        target.localContrast,
        target.edgeReconstruction,
        target.detailBoost,
        target.defringe,
        target.colorMode
      );
    }
  };

  const resetParams = () => {
    const defaultParams: WebGPUParameters = {
      brightness: 0.0,
      contrast: 1.0,
      sharpenIntensity: 0.65,
      edgeThreshold: 0.04,
      gamma: 1.0,
      saturation: 1.0,
      localContrast: 0.2,
      edgeReconstruction: 2.0,
      detailBoost: 0.3,
      defringe: 0.0,
      colorMode: 0,
    };
    applyParams(defaultParams);
  };

  return {
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
  };
}
