import { useEffect, useRef, useState } from 'react';
import { WebGPUFSR } from '../lib/webgpu-fsr';

export interface WebGPUParameters {
  brightness: number; // -0.5 to 0.5
  contrast: number; // 0.5 to 2.0
  sharpenIntensity: number; // 0.0 to 5.0 (will map to FSR stops internally)
  edgeThreshold: number; // For denoise threshold (0.0 to 1.0)
}

export function useMicroscope() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isPowerOn, setIsPowerOn] = useState(false);
  const isPowerOnRef = useRef(false);
  const [isUpscaledMode, setIsUpscaledMode] = useState(true);
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
    sharpenIntensity: 1.2,
    edgeThreshold: 0.1, // now acts as denoise
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

  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
    if (fsrRef.current) {
      fsrRef.current.updateParams(
        params.brightness,
        params.contrast,
        params.sharpenIntensity,
        params.edgeThreshold
      );
    }
  }, [params]);

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
            if (canvasRef.current && videoRef.current) {
              canvasRef.current.width = videoRef.current.videoWidth * 2;
              canvasRef.current.height = videoRef.current.videoHeight * 2;
            }

            if (!fsrRef.current) {
              const fsr = await initWebGPU();
              if (fsr) {
                await fsr.initialize(
                  videoRef.current!.videoWidth,
                  videoRef.current!.videoHeight,
                  canvasRef.current!.width,
                  canvasRef.current!.height
                );
                fsr.updateParams(paramsRef.current.brightness, paramsRef.current.contrast, paramsRef.current.sharpenIntensity, paramsRef.current.edgeThreshold);
                fsrRef.current = fsr;
              } else {
                setSignalStatus("FALHA: WEBGPU");
                return;
              }
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

  return {
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
  };
}
