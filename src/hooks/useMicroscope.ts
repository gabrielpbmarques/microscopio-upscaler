import { useEffect, useRef, useState } from 'react';

export interface WebGLParameters {
  brightness: number; // -0.5 to 0.5
  contrast: number; // 0.5 to 2.0
  sharpenIntensity: number; // 0.0 to 5.0
  edgeThreshold: number; // 0.0 to 0.5
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
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const requestRef = useRef<number>(0);
  const sessionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // WebGL Uniform Locations
  const uniformLocations = useRef<{
    u_image: WebGLUniformLocation | null;
    u_texSize: WebGLUniformLocation | null;
    u_brightness: WebGLUniformLocation | null;
    u_contrast: WebGLUniformLocation | null;
    u_sharpenIntensity: WebGLUniformLocation | null;
    u_edgeThreshold: WebGLUniformLocation | null;
  }>({
    u_image: null,
    u_texSize: null,
    u_brightness: null,
    u_contrast: null,
    u_sharpenIntensity: null,
    u_edgeThreshold: null,
  });

  const [params, setParams] = useState<WebGLParameters>({
    brightness: 0.0,
    contrast: 1.0,
    sharpenIntensity: 1.2,
    edgeThreshold: 0.1,
  });

  const lastTimeRef = useRef(0);
  const frameCountRef = useRef(0);

  const vsSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
    }
  `;

  const fsSource = `
    precision highp float;
    varying vec2 v_texCoord;
    uniform sampler2D u_image;
    uniform vec2 u_texSize;
    
    uniform float u_brightness;
    uniform float u_contrast;
    uniform float u_sharpenIntensity;
    uniform float u_edgeThreshold;

    float luma(vec3 color) {
        return dot(color, vec3(0.299, 0.587, 0.114));
    }

    void main() {
        vec2 texel = vec2(1.0, 1.0) / u_texSize;
        
        vec4 c00 = texture2D(u_image, v_texCoord + vec2(-texel.x, -texel.y));
        vec4 c10 = texture2D(u_image, v_texCoord + vec2( 0.0,     -texel.y));
        vec4 c20 = texture2D(u_image, v_texCoord + vec2( texel.x, -texel.y));
        
        vec4 c01 = texture2D(u_image, v_texCoord + vec2(-texel.x,  0.0));
        vec4 c11 = texture2D(u_image, v_texCoord); // Centro
        vec4 c21 = texture2D(u_image, v_texCoord + vec2( texel.x,  0.0));
        
        vec4 c02 = texture2D(u_image, v_texCoord + vec2(-texel.x,  texel.y));
        vec4 c12 = texture2D(u_image, v_texCoord + vec2( 0.0,      texel.y));
        vec4 c22 = texture2D(u_image, v_texCoord + vec2( texel.x,  texel.y));
        
        // Deteção de Bordas (Sobel)
        float lx = luma(c20.rgb + 2.0*c21.rgb + c22.rgb) - luma(c00.rgb + 2.0*c01.rgb + c02.rgb);
        float ly = luma(c02.rgb + 2.0*c12.rgb + c22.rgb) - luma(c00.rgb + 2.0*c10.rgb + c20.rgb);
        float edge = sqrt(lx*lx + ly*ly);
        
        // Máscara
        float edgeMask = smoothstep(u_edgeThreshold - 0.05, u_edgeThreshold + 0.15, edge);
        
        // Laplaciano
        vec4 laplacian = c11 * 8.0 - (c00 + c10 + c20 + c01 + c21 + c02 + c12 + c22);
        
        // Nitidez
        vec4 finalColor = c11 + laplacian * u_sharpenIntensity * edgeMask;
        
        // Brilho
        finalColor.rgb += u_brightness;
        
        // Contraste
        finalColor.rgb = (finalColor.rgb - 0.5) * u_contrast + 0.5;
        
        gl_FragColor = vec4(clamp(finalColor.rgb, 0.0, 1.0), 1.0);
    }
  `;

  function initWebGL() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const gl = canvas.getContext('webgl');
    if (!gl) return null;
    glRef.current = gl;

    function compileShader(type: number, source: string) {
      const shader = gl!.createShader(type);
      if (!shader) return null;
      gl!.shaderSource(shader, source);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
        console.error(gl!.getShaderInfoLog(shader));
        gl!.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vs = compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    if (!program || !vs || !fs) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return null;
    }

    gl.useProgram(program);

    const positions = new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]);
    const texCoords = new Float32Array([
      0, 1, 1, 1, 0, 0,
      0, 0, 1, 1, 1, 0,
    ]);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const aPosition = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const texBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    const aTexCoord = gl.getAttribLocation(program, "a_texCoord");
    gl.enableVertexAttribArray(aTexCoord);
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    textureRef.current = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    uniformLocations.current = {
      u_image: gl.getUniformLocation(program, "u_image"),
      u_texSize: gl.getUniformLocation(program, "u_texSize"),
      u_brightness: gl.getUniformLocation(program, "u_brightness"),
      u_contrast: gl.getUniformLocation(program, "u_contrast"),
      u_sharpenIntensity: gl.getUniformLocation(program, "u_sharpenIntensity"),
      u_edgeThreshold: gl.getUniformLocation(program, "u_edgeThreshold"),
    };

    return program;
  }

  // Ref params for render loop to access latest state without re-triggering the loop
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  function renderLoop(program: WebGLProgram, timestamp: number) {
    const gl = glRef.current;
    const video = videoRef.current;
    if (!gl || !video || !isPowerOnRef.current) return;

    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      if (textureRef.current) {
        gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      }
      
      const canvas = gl.canvas as HTMLCanvasElement;
      gl.uniform2f(uniformLocations.current.u_texSize, canvas.width, canvas.height);
      
      // Pass params
      gl.uniform1f(uniformLocations.current.u_brightness, paramsRef.current.brightness);
      gl.uniform1f(uniformLocations.current.u_contrast, paramsRef.current.contrast);
      gl.uniform1f(uniformLocations.current.u_sharpenIntensity, paramsRef.current.sharpenIntensity);
      gl.uniform1f(uniformLocations.current.u_edgeThreshold, paramsRef.current.edgeThreshold);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // FPS tracking
      frameCountRef.current++;
      if (timestamp - lastTimeRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastTimeRef.current = timestamp;
      }
    }

    if (isPowerOnRef.current) {
      requestRef.current = requestAnimationFrame((ts) => renderLoop(program, ts));
    }
  }

  const togglePower = async () => {
    if (!isPowerOn) {
      setSignalStatus("CONECTANDO...");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current!.play();
            if (canvasRef.current && videoRef.current) {
              canvasRef.current.width = videoRef.current.videoWidth * 2;
              canvasRef.current.height = videoRef.current.videoHeight * 2;
              if (glRef.current) {
                glRef.current.viewport(0, 0, canvasRef.current.width, canvasRef.current.height);
              }
            }

            if (!programRef.current) {
              programRef.current = initWebGL();
            }

            isPowerOnRef.current = true;
            setIsPowerOn(true);
            setSignalStatus("ESTÁVEL");

            sessionIntervalRef.current = setInterval(() => {
              setSessionSeconds(s => s + 1);
            }, 1000);

            if (programRef.current) {
              requestAnimationFrame((ts) => renderLoop(programRef.current!, ts));
            }
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
