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

  private canvasWidth: number = 0;
  private canvasHeight: number = 0;
  private videoWidth: number = 0;
  private videoHeight: number = 0;

  constructor(device: GPUDevice, context: GPUCanvasContext) {
    this.device = device;
    this.context = context;
  }

  async initialize(videoWidth: number, videoHeight: number, canvasWidth: number, canvasHeight: number) {
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

    // 2. Uniforms Buffer (Params)
    this.uniformBuffer = this.device.createBuffer({
      size: 16, // brightness, contrast, sharpen, denoiseThreshold
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // 3. Shaders
    const shaderModule = this.device.createShaderModule({
      code: `
        struct Params {
          brightness: f32,
          contrast: f32,
          sharpen: f32,
          denoiseThreshold: f32,
        };

        @group(0) @binding(0) var<uniform> params: Params;

        // Denoise (Bilateral-like approximation)
        @group(0) @binding(1) var inputTex: texture_2d<f32>;
        @group(0) @binding(2) var outputDenoise: texture_storage_2d<rgba8unorm, write>;

        fn luma(color: vec3<f32>) -> f32 {
            return dot(color, vec3<f32>(0.299, 0.587, 0.114));
        }

        @compute @workgroup_size(8, 8)
        fn computeDenoise(@builtin(global_invocation_id) id: vec3<u32>) {
            let dim = textureDimensions(inputTex);
            if (id.x >= dim.x || id.y >= dim.y) { return; }

            let center = textureLoad(inputTex, vec2<i32>(id.xy), 0).rgb;
            var colorSum = vec3<f32>(0.0, 0.0, 0.0);
            var weightSum = 0.0;

            let threshold = params.denoiseThreshold;
            
            // 3x3 simple bilateral
            for (var y: i32 = -1; y <= 1; y++) {
                for (var x: i32 = -1; x <= 1; x++) {
                    let pos = vec2<i32>(id.xy) + vec2<i32>(x, y);
                    let sample = textureLoad(inputTex, clamp(pos, vec2<i32>(0, 0), vec2<i32>(dim) - vec2<i32>(1, 1)), 0).rgb;
                    
                    let diff = length(sample - center);
                    let w = exp(-(diff * diff) / (2.0 * max(0.001, threshold * threshold) + 0.001)); // color weight
                    let distSq = f32(x*x + y*y);
                    let spatialW = exp(-distSq / 2.0);

                    let totalW = w * spatialW;
                    colorSum += sample * totalW;
                    weightSum += totalW;
                }
            }

            textureStore(outputDenoise, vec2<i32>(id.xy), vec4<f32>(colorSum / weightSum, 1.0));
        }

        // EASU (Edge Adaptive Spatial Upsampling Approximation)
        @group(0) @binding(3) var texDenoised: texture_2d<f32>;
        @group(0) @binding(4) var outputEASU: texture_storage_2d<rgba8unorm, write>;
        @group(0) @binding(5) var samp: sampler;

        @compute @workgroup_size(8, 8)
        fn computeEASU(@builtin(global_invocation_id) id: vec3<u32>) {
            let dimOut = textureDimensions(outputEASU);
            if (id.x >= dimOut.x || id.y >= dimOut.y) { return; }

            // Simplification: Using hardware bilinear filter for now instead of full Lanczos kernel to save WGSL complexity
            let uv = (vec2<f32>(id.xy) + vec2<f32>(0.5, 0.5)) / vec2<f32>(dimOut);
            
            let color = textureSampleLevel(texDenoised, samp, uv, 0.0).rgb;
            textureStore(outputEASU, vec2<i32>(id.xy), vec4<f32>(color, 1.0));
        }

        // RCAS (Robust Contrast Adaptive Sharpening) + Adjustments
        @group(0) @binding(6) var texUpscaled: texture_2d<f32>;
        @group(0) @binding(7) var outputFinal: texture_storage_2d<rgba8unorm, write>;

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

            let min_c = min(c, min(min(n, s), min(w, e)));
            let max_c = max(c, max(max(n, s), max(w, e)));

            // RCAS calculation
            let limit = min(min_c, vec3<f32>(1.0, 1.0, 1.0) - max_c);
            let limit_luma = luma(limit);
            let c_luma = luma(c);
            
            // Calculate sharpening amount based on parameters (converted from stops)
            // scale 0.0 -> 2.0 (FSR stops).
            let sharpness = exp2(-params.sharpen); 
            
            var a = limit_luma / (max(c_luma, 0.0001));
            a = min(a, 1.0) * sharpness;

            let weight = a;
            let finalColor = (c + weight * (n + s + w + e)) / (1.0 + 4.0 * weight);

            // Apply Brightness & Contrast
            var adjColor = finalColor + vec3<f32>(params.brightness, params.brightness, params.brightness);
            adjColor = (adjColor - vec3<f32>(0.5, 0.5, 0.5)) * params.contrast + vec3<f32>(0.5, 0.5, 0.5);
            adjColor = clamp(adjColor, vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 1.0, 1.0));

            textureStore(outputFinal, pos, vec4<f32>(adjColor, 1.0));
        }

        // Draw Fullscreen Triangle
        @vertex
        fn vs_main(@builtin(vertex_index) VertexIndex : u32) -> @builtin(position) vec4<f32> {
            var pos = array<vec2<f32>, 3>(
                vec2<f32>(-1.0, -1.0),
                vec2<f32>(3.0, -1.0),
                vec2<f32>(-1.0, 3.0)
            );
            return vec4<f32>(pos[VertexIndex], 0.0, 1.0);
        }

        @group(0) @binding(8) var texFinalView: texture_2d<f32>;
        @group(0) @binding(9) var sampDraw: sampler;

        @fragment
        fn fs_main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
            let dim = textureDimensions(texFinalView);
            let uv = pos.xy / vec2<f32>(dim);
            return textureSample(texFinalView, sampDraw, uv);
        }
      `
    });

    const samplerLinear = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    // 4. Create Pipelines
    this.pipelineDenoise = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'computeDenoise' }
    });

    this.pipelineEASU = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'computeEASU' }
    });

    this.pipelineRCAS = this.device.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'computeRCAS' }
    });

    this.pipelineDraw = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
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
        { binding: 3, resource: this.textureDenoised.createView() },
        { binding: 4, resource: this.textureUpscaled.createView() },
        { binding: 5, resource: samplerLinear },
      ]
    });

    this.bindGroupRCAS = this.device.createBindGroup({
      layout: this.pipelineRCAS.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 6, resource: this.textureUpscaled.createView() },
        { binding: 7, resource: this.textureFinal.createView() },
      ]
    });

    this.bindGroupDraw = this.device.createBindGroup({
      layout: this.pipelineDraw.getBindGroupLayout(0),
      entries: [
        { binding: 8, resource: this.textureFinal.createView() },
        { binding: 9, resource: samplerLinear },
      ]
    });
  }

  updateParams(brightness: number, contrast: number, sharpen: number, denoiseThreshold: number) {
    const data = new Float32Array([
      brightness, contrast, sharpen, denoiseThreshold
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  render(video: HTMLVideoElement) {
    // Copy video frame to input texture
    this.device.queue.copyExternalImageToTexture(
      { source: video },
      { texture: this.textureInput },
      [this.videoWidth, this.videoHeight]
    );

    const commandEncoder = this.device.createCommandEncoder();

    // Denoise Pass
    const passDenoise = commandEncoder.beginComputePass();
    passDenoise.setPipeline(this.pipelineDenoise);
    passDenoise.setBindGroup(0, this.bindGroupDenoise);
    passDenoise.dispatchWorkgroups(Math.ceil(this.videoWidth / 8), Math.ceil(this.videoHeight / 8));
    passDenoise.end();

    // EASU Pass
    const passEASU = commandEncoder.beginComputePass();
    passEASU.setPipeline(this.pipelineEASU);
    passEASU.setBindGroup(0, this.bindGroupEASU);
    passEASU.dispatchWorkgroups(Math.ceil(this.canvasWidth / 8), Math.ceil(this.canvasHeight / 8));
    passEASU.end();

    // RCAS Pass
    const passRCAS = commandEncoder.beginComputePass();
    passRCAS.setPipeline(this.pipelineRCAS);
    passRCAS.setBindGroup(0, this.bindGroupRCAS);
    passRCAS.dispatchWorkgroups(Math.ceil(this.canvasWidth / 8), Math.ceil(this.canvasHeight / 8));
    passRCAS.end();

    // Draw to Canvas
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
