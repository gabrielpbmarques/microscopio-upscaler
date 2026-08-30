export class WebGPUFSR {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private pipelineDenoise!: GPUComputePipeline;
  private pipelineEASU!: GPUComputePipeline;
  private pipelineRCAS!: GPUComputePipeline;
  private pipelineDraw!: GPURenderPipeline;

  private textureInput!: GPUTexture;
  private textureDenoised!: GPUTexture;
  private textureUpscaled!: GPUTexture;
  private textureFinal!: GPUTexture;

  private bindGroupDenoise!: GPUBindGroup;
  private bindGroupEASU!: GPUBindGroup;
  private bindGroupRCAS!: GPUBindGroup;
  private bindGroupDraw!: GPUBindGroup;

  private uniformBuffer!: GPUBuffer;
  private samplerLinear!: GPUSampler;

  private canvasWidth: number = 0;
  private canvasHeight: number = 0;
  private videoWidth: number = 0;
  private videoHeight: number = 0;

  constructor(device: GPUDevice, context: GPUCanvasContext) {
    this.device = device;
    this.context = context;
  }

  async initialize(videoWidth: number, videoHeight: number, canvasWidth: number, canvasHeight: number) {
    if (videoWidth <= 0 || videoHeight <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
      return;
    }

    // Destroy old textures if reinitializing
    if (this.textureInput) this.textureInput.destroy();
    if (this.textureDenoised) this.textureDenoised.destroy();
    if (this.textureUpscaled) this.textureUpscaled.destroy();
    if (this.textureFinal) this.textureFinal.destroy();
    if (this.uniformBuffer) this.uniformBuffer.destroy();

    this.videoWidth = videoWidth;
    this.videoHeight = videoHeight;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;

    // 1. Create Textures
    this.textureInput = this.device.createTexture({
      size: [videoWidth, videoHeight, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.textureDenoised = this.device.createTexture({
      size: [videoWidth, videoHeight, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    });

    this.textureUpscaled = this.device.createTexture({
      size: [canvasWidth, canvasHeight, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    });

    this.textureFinal = this.device.createTexture({
      size: [canvasWidth, canvasHeight, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
    });

    // 2. Uniforms Buffer (Params: brightness, contrast, sharpen, denoiseThreshold)
    this.uniformBuffer = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // 3. Shaders Modules (Separate modules to avoid WGSL duplicate binding conflicts)

    // Module 1: Denoise
    const shaderDenoise = this.device.createShaderModule({
      code: `
        struct Params {
          brightness: f32,
          contrast: f32,
          sharpen: f32,
          denoiseThreshold: f32,
        };

        @group(0) @binding(0) var<uniform> params: Params;
        @group(0) @binding(1) var inputTex: texture_2d<f32>;
        @group(0) @binding(2) var outputDenoise: texture_storage_2d<rgba8unorm, write>;

        @compute @workgroup_size(8, 8)
        fn computeDenoise(@builtin(global_invocation_id) id: vec3<u32>) {
            let dim = textureDimensions(inputTex);
            if (id.x >= dim.x || id.y >= dim.y) { return; }

            let center = textureLoad(inputTex, vec2<i32>(id.xy), 0).rgb;
            let threshold = params.denoiseThreshold;
            
            if (threshold <= 0.005) {
                textureStore(outputDenoise, vec2<i32>(id.xy), vec4<f32>(center, 1.0));
                return;
            }

            var colorSum = vec3<f32>(0.0, 0.0, 0.0);
            var weightSum = 0.0;
            let sigmaColor = threshold * 0.35;
            let invSigmaSq = 1.0 / (2.0 * sigmaColor * sigmaColor + 1e-5);

            for (var y: i32 = -1; y <= 1; y++) {
                for (var x: i32 = -1; x <= 1; x++) {
                    let pos = clamp(vec2<i32>(id.xy) + vec2<i32>(x, y), vec2<i32>(0, 0), vec2<i32>(dim) - vec2<i32>(1, 1));
                    let sample = textureLoad(inputTex, pos, 0).rgb;
                    
                    let diff = length(sample - center);
                    let colorW = exp(-diff * diff * invSigmaSq);
                    let distSq = f32(x * x + y * y);
                    let spatialW = exp(-distSq * 0.5);

                    let totalW = colorW * spatialW;
                    colorSum += sample * totalW;
                    weightSum += totalW;
                }
            }

            textureStore(outputDenoise, vec2<i32>(id.xy), vec4<f32>(colorSum / max(weightSum, 0.001), 1.0));
        }
      `
    });

    // Module 2: EASU (AMD FSR 1.0 Edge-Adaptive Spatial Upsampling)
    const shaderEASU = this.device.createShaderModule({
      code: `
        @group(0) @binding(0) var texDenoised: texture_2d<f32>;
        @group(0) @binding(1) var outputEASU: texture_storage_2d<rgba8unorm, write>;

        fn luma(color: vec3<f32>) -> f32 {
            return dot(color, vec3<f32>(0.299, 0.587, 0.114));
        }

        fn fetchTexDenoised(pos: vec2<i32>, dim: vec2<i32>) -> vec3<f32> {
            let p = clamp(pos, vec2<i32>(0, 0), dim - vec2<i32>(1, 1));
            return textureLoad(texDenoised, p, 0).rgb;
        }

        fn fsrLanczosWeight(d: f32) -> f32 {
            if (d >= 2.0) { return 0.0; }
            if (d < 1e-4) { return 1.0; }
            let pi = 3.141592653589793;
            let pix = pi * d;
            return (sin(pix) / pix) * (sin(pix * 0.5) / (pix * 0.5));
        }

        @compute @workgroup_size(8, 8)
        fn computeEASU(@builtin(global_invocation_id) id: vec3<u32>) {
            let dimOut = textureDimensions(outputEASU);
            let dimIn = textureDimensions(texDenoised);
            if (id.x >= dimOut.x || id.y >= dimOut.y) { return; }

            let pp = (vec2<f32>(id.xy) + vec2<f32>(0.5, 0.5)) * (vec2<f32>(dimIn) / vec2<f32>(dimOut)) - vec2<f32>(0.5, 0.5);
            let basePos = vec2<i32>(floor(pp));
            let f = pp - floor(pp);

            let b = fetchTexDenoised(basePos + vec2<i32>(0, -1), vec2<i32>(dimIn));
            let c = fetchTexDenoised(basePos + vec2<i32>(1, -1), vec2<i32>(dimIn));
            let d = fetchTexDenoised(basePos + vec2<i32>(-1, 0), vec2<i32>(dimIn));
            let e = fetchTexDenoised(basePos + vec2<i32>(0, 0), vec2<i32>(dimIn));
            let f_pix = fetchTexDenoised(basePos + vec2<i32>(1, 0), vec2<i32>(dimIn));
            let g = fetchTexDenoised(basePos + vec2<i32>(2, 0), vec2<i32>(dimIn));
            let h = fetchTexDenoised(basePos + vec2<i32>(-1, 1), vec2<i32>(dimIn));
            let i_pix = fetchTexDenoised(basePos + vec2<i32>(0, 1), vec2<i32>(dimIn));
            let j = fetchTexDenoised(basePos + vec2<i32>(1, 1), vec2<i32>(dimIn));
            let k = fetchTexDenoised(basePos + vec2<i32>(2, 1), vec2<i32>(dimIn));
            let l = fetchTexDenoised(basePos + vec2<i32>(0, 2), vec2<i32>(dimIn));
            let m = fetchTexDenoised(basePos + vec2<i32>(1, 2), vec2<i32>(dimIn));

            let b_l = luma(b);
            let c_l = luma(c);
            let d_l = luma(d);
            let e_l = luma(e);
            let f_l = luma(f_pix);
            let g_l = luma(g);
            let h_l = luma(h);
            let i_l = luma(i_pix);
            let j_l = luma(j);
            let k_l = luma(k);
            let l_l = luma(l);
            let m_l = luma(m);

            let dir0 = vec2<f32>(f_l - d_l, i_l - b_l);
            let dir1 = vec2<f32>(g_l - e_l, j_l - c_l);
            let dir2 = vec2<f32>(j_l - h_l, l_l - e_l);
            let dir3 = vec2<f32>(k_l - i_l, m_l - f_l);

            let w0 = (1.0 - f.x) * (1.0 - f.y);
            let w1 = f.x * (1.0 - f.y);
            let w2 = (1.0 - f.x) * f.y;
            let w3 = f.x * f.y;

            var dir = dir0 * w0 + dir1 * w1 + dir2 * w2 + dir3 * w3;
            let dirLenSq = dot(dir, dir);
            var stretch = 1.0;
            var normDir = vec2<f32>(1.0, 0.0);

            if (dirLenSq > 1e-6) {
                let invLen = inverseSqrt(dirLenSq);
                normDir = dir * invLen;
                stretch = clamp(1.0 + sqrt(dirLenSq) * 3.0, 1.0, 2.5);
            }

            let perpDir = vec2<f32>(-normDir.y, normDir.x);

            var colorSum = vec3<f32>(0.0);
            var weightSum = 0.0;

            let offsets = array<vec2<f32>, 12>(
                vec2<f32>(0.0, -1.0),
                vec2<f32>(1.0, -1.0),
                vec2<f32>(-1.0, 0.0),
                vec2<f32>(0.0, 0.0),
                vec2<f32>(1.0, 0.0),
                vec2<f32>(2.0, 0.0),
                vec2<f32>(-1.0, 1.0),
                vec2<f32>(0.0, 1.0),
                vec2<f32>(1.0, 1.0),
                vec2<f32>(2.0, 1.0),
                vec2<f32>(0.0, 2.0),
                vec2<f32>(1.0, 2.0)
            );

            let samples = array<vec3<f32>, 12>(
                b, c, d, e, f_pix, g, h, i_pix, j, k, l, m
            );

            for (var idx: i32 = 0; idx < 12; idx++) {
                let v = offsets[idx] - f;
                let u = dot(v, normDir);
                let t = dot(v, perpDir) * stretch;
                let dist = sqrt(u * u + t * t);
                let wt = fsrLanczosWeight(dist);
                colorSum += samples[idx] * wt;
                weightSum += wt;
            }

            var upscaled = colorSum / max(weightSum, 1e-4);

            let minColor = min(min(e, f_pix), min(i_pix, j));
            let maxColor = max(max(e, f_pix), max(i_pix, j));
            upscaled = clamp(upscaled, minColor, maxColor);

            textureStore(outputEASU, vec2<i32>(id.xy), vec4<f32>(upscaled, 1.0));
        }
      `
    });

    // Module 3: RCAS (AMD FSR 1.0 Robust Contrast-Adaptive Sharpening)
    const shaderRCAS = this.device.createShaderModule({
      code: `
        struct Params {
          brightness: f32,
          contrast: f32,
          sharpen: f32,
          denoiseThreshold: f32,
        };

        @group(0) @binding(0) var<uniform> params: Params;
        @group(0) @binding(1) var texUpscaled: texture_2d<f32>;
        @group(0) @binding(2) var outputFinal: texture_storage_2d<rgba8unorm, write>;

        @compute @workgroup_size(8, 8)
        fn computeRCAS(@builtin(global_invocation_id) id: vec3<u32>) {
            let dimOut = textureDimensions(outputFinal);
            if (id.x >= dimOut.x || id.y >= dimOut.y) { return; }
            let pos = vec2<i32>(id.xy);

            let c = textureLoad(texUpscaled, pos, 0).rgb;
            let n = textureLoad(texUpscaled, clamp(pos + vec2<i32>(0, -1), vec2<i32>(0, 0), vec2<i32>(dimOut) - vec2<i32>(1, 1)), 0).rgb;
            let s = textureLoad(texUpscaled, clamp(pos + vec2<i32>(0, 1), vec2<i32>(0, 0), vec2<i32>(dimOut) - vec2<i32>(1, 1)), 0).rgb;
            let w = textureLoad(texUpscaled, clamp(pos + vec2<i32>(-1, 0), vec2<i32>(0, 0), vec2<i32>(dimOut) - vec2<i32>(1, 1)), 0).rgb;
            let e = textureLoad(texUpscaled, clamp(pos + vec2<i32>(1, 0), vec2<i32>(0, 0), vec2<i32>(dimOut) - vec2<i32>(1, 1)), 0).rgb;

            let minRGB = min(c, min(min(n, s), min(w, e)));
            let maxRGB = max(c, max(max(n, s), max(w, e)));

            let minVal = min(minRGB.r, min(minRGB.g, minRGB.b));
            let maxVal = max(maxRGB.r, max(maxRGB.g, maxRGB.b));

            let hitMin = minVal;
            let hitMax = 1.0 - maxVal;
            let headroom = min(hitMin, hitMax);

            let sharpFactor = params.sharpen * 0.18;
            let lobe = -clamp(sqrt(max(headroom, 0.0) / max(maxVal, 0.001)) * sharpFactor, 0.0, 0.23);

            let denom = 1.0 + 4.0 * lobe;
            let sharpened = (c + lobe * (n + s + w + e)) / max(denom, 0.001);
            var color = clamp(sharpened, vec3<f32>(0.0), vec3<f32>(1.0));

            color = color + vec3<f32>(params.brightness, params.brightness, params.brightness);
            color = (color - vec3<f32>(0.5, 0.5, 0.5)) * params.contrast + vec3<f32>(0.5, 0.5, 0.5);
            color = clamp(color, vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 1.0, 1.0));

            textureStore(outputFinal, pos, vec4<f32>(color, 1.0));
        }
      `
    });

    // Module 4: Draw to Canvas
    const shaderDraw = this.device.createShaderModule({
      code: `
        struct VertexOutput {
          @builtin(position) position: vec4<f32>,
          @location(0) uv: vec2<f32>,
        };

        @vertex
        fn vs_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
            var pos = array<vec2<f32>, 3>(
                vec2<f32>(-1.0, -1.0),
                vec2<f32>(3.0, -1.0),
                vec2<f32>(-1.0, 3.0)
            );
            var uvs = array<vec2<f32>, 3>(
                vec2<f32>(0.0, 1.0),
                vec2<f32>(2.0, 1.0),
                vec2<f32>(0.0, -1.0)
            );
            var out: VertexOutput;
            out.position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
            out.uv = uvs[VertexIndex];
            return out;
        }

        @group(0) @binding(0) var texFinalView: texture_2d<f32>;
        @group(0) @binding(1) var sampDraw: sampler;

        @fragment
        fn fs_main(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
            return textureSample(texFinalView, sampDraw, uv);
        }
      `
    });

    this.samplerLinear = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    // 4. Create Pipelines
    this.pipelineDenoise = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderDenoise, entryPoint: 'computeDenoise' }
    });

    this.pipelineEASU = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderEASU, entryPoint: 'computeEASU' }
    });

    this.pipelineRCAS = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderRCAS, entryPoint: 'computeRCAS' }
    });

    this.pipelineDraw = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: shaderDraw, entryPoint: 'vs_main' },
      fragment: {
        module: shaderDraw,
        entryPoint: 'fs_main',
        targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }]
      }
    });

    // 5. Create Bind Groups
    this.bindGroupDenoise = this.device.createBindGroup({
      layout: this.pipelineDenoise.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.textureInput.createView() },
        { binding: 2, resource: this.textureDenoised.createView() },
      ]
    });

    this.bindGroupEASU = this.device.createBindGroup({
      layout: this.pipelineEASU.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.textureDenoised.createView() },
        { binding: 1, resource: this.textureUpscaled.createView() },
      ]
    });

    this.bindGroupRCAS = this.device.createBindGroup({
      layout: this.pipelineRCAS.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.textureUpscaled.createView() },
        { binding: 2, resource: this.textureFinal.createView() },
      ]
    });

    this.bindGroupDraw = this.device.createBindGroup({
      layout: this.pipelineDraw.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.textureFinal.createView() },
        { binding: 1, resource: this.samplerLinear },
      ]
    });
  }

  updateParams(brightness: number, contrast: number, sharpen: number, denoiseThreshold: number) {
    if (!this.uniformBuffer) return;
    const data = new Float32Array([
      brightness, contrast, sharpen, denoiseThreshold
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  render(video: HTMLVideoElement) {
    if (!this.textureInput || !this.pipelineDenoise) return;

    // Copy video frame to input texture
    this.device.queue.copyExternalImageToTexture(
      { source: video },
      { texture: this.textureInput },
      [this.videoWidth, this.videoHeight]
    );

    const commandEncoder = this.device.createCommandEncoder();

    // 1. Denoise Pass
    const passDenoise = commandEncoder.beginComputePass();
    passDenoise.setPipeline(this.pipelineDenoise);
    passDenoise.setBindGroup(0, this.bindGroupDenoise);
    passDenoise.dispatchWorkgroups(Math.ceil(this.videoWidth / 8), Math.ceil(this.videoHeight / 8));
    passDenoise.end();

    // 2. EASU Pass (Upscaling to canvas size)
    const passEASU = commandEncoder.beginComputePass();
    passEASU.setPipeline(this.pipelineEASU);
    passEASU.setBindGroup(0, this.bindGroupEASU);
    passEASU.dispatchWorkgroups(Math.ceil(this.canvasWidth / 8), Math.ceil(this.canvasHeight / 8));
    passEASU.end();

    // 3. RCAS Pass (Contrast-Adaptive Sharpening & Color adjustments)
    const passRCAS = commandEncoder.beginComputePass();
    passRCAS.setPipeline(this.pipelineRCAS);
    passRCAS.setBindGroup(0, this.bindGroupRCAS);
    passRCAS.dispatchWorkgroups(Math.ceil(this.canvasWidth / 8), Math.ceil(this.canvasHeight / 8));
    passRCAS.end();

    // 4. Draw to Canvas
    const textureView = this.context.getCurrentTexture().createView();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }]
    });
    renderPass.setPipeline(this.pipelineDraw);
    renderPass.setBindGroup(0, this.bindGroupDraw);
    renderPass.draw(3);
    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }
}
