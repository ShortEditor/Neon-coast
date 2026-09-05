import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

export class Graphics {
  constructor(game) {
    this.game = game;
    this.textures = [];
    this.bufferSize = new THREE.Vector2();
    this.transform = new THREE.Object3D();

    this.environmentTimer = 0;
    this.lastEnvironment = null;

    this.waterTime = { value: 0 };

    this.makeSurfaceTextures();
    this.upgradeWindows();
    this.upgradeVehicles();
    this.upgradeWater();
    this.upgradeSky();
    this.makeContactShadows();

    // FXAA belongs after the existing OutputPass.
    this.fxaa = new ShaderPass(FXAAShader);
    this.fxaa.material.depthTest = false;
    this.fxaa.material.depthWrite = false;
    game.composer.addPass(this.fxaa);
  }

  canvasTexture(canvas) {
    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;

    this.textures.push(texture);
    return texture;
  }

  makeNoiseTexture(kind, size = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;

    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(size, size);

    let seed = 84621;

    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;

        const u = x / size * Math.PI * 2;
        const v = y / size * Math.PI * 2;

        const broad =
          Math.sin(u * 3 + Math.sin(v * 2)) * 3 +
          Math.cos(v * 4 - u * 2) * 2;

        let value = 242 + broad + (random() - 0.5) * 14;

        if (kind === 'asphalt') {
          value = 216 + broad + (random() - 0.5) * 48;

          const stone = random();
          if (stone > 0.978) value += 28;
          if (stone < 0.025) value -= 35;
        }

        if (kind === 'pavement') {
          value = 236 + broad + (random() - 0.5) * 14;

          // Repeating paving joints.
          const gx = x % 64;
          const gy = y % 64;

          if (gx < 2 || gy < 2) value *= 0.68;
          else if (gx < 4 || gy < 4) value *= 0.9;
        }

        if (kind === 'sand') {
          value =
              235 +
              Math.sin(u * 7 + Math.sin(v * 2)) * 5 +
              (random() - 0.5) * 18;
        }

        if (kind === 'grass') {
          value =
              217 +
              broad * 2 +
              (random() - 0.5) * 44;

          if (random() > 0.96) value -= 24;
        }

        if (kind === 'wall') {
          value = 246 + broad * 0.3 + (random() - 0.5) * 10;
        }

        value = THREE.MathUtils.clamp(value, 0, 255);

        image.data[i] = value;
        image.data[i + 1] = value;
        image.data[i + 2] = value;
        image.data[i + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);

    return this.canvasTexture(canvas);
  }

  worldTexture(material, texture, metersPerTile, bumpScale) {
    material.map = texture;
    material.bumpMap = texture;
    material.bumpScale = bumpScale;

    const scale = (1 / metersPerTile).toFixed(7);

    /*
      The world geometry is merged into large batches.

      Projecting UVs from world position prevents a single texture
      from stretching across an entire road or building.
    */
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `
          #include <uv_vertex>

          vec3 ncPosition =
            (modelMatrix * vec4(position, 1.0)).xyz;

          vec3 ncNormal =
            abs(normalize(mat3(modelMatrix) * normal));

          vec2 ncUV;

          if (ncNormal.y > 0.65) {
            ncUV = ncPosition.xz;
          } else if (ncNormal.x > ncNormal.z) {
            ncUV = ncPosition.zy;
          } else {
            ncUV = ncPosition.xy;
          }

          ncUV *= ${scale};

          #ifdef USE_MAP
            vMapUv = ncUV;
          #endif

          #ifdef USE_BUMPMAP
            vBumpMapUv = ncUV;
          #endif
        `
      );
    };

    material.customProgramCacheKey = () =>
      `nc-world-texture-${scale}`;

    material.needsUpdate = true;
  }

  makeSurfaceTextures() {
    const materials = this.game.world.materials;

    const asphalt = this.makeNoiseTexture('asphalt', 512);
    const pavement = this.makeNoiseTexture('pavement', 256);
    const sand = this.makeNoiseTexture('sand', 256);
    const grass = this.makeNoiseTexture('grass', 256);
    const wall = this.makeNoiseTexture('wall', 256);

    this.worldTexture(materials.road, asphalt, 7, 0.035);
    this.worldTexture(materials.pavement, pavement, 8, 0.045);
    this.worldTexture(materials.sand, sand, 5, 0.018);
    this.worldTexture(materials.grass, grass, 5, 0.045);

    for (const name of ['pink', 'mint', 'cream', 'blue', 'white']) {
      this.worldTexture(materials[name], wall, 4, 0.012);
    }
  }

  upgradeWindows() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 192;

    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 128, 192);
    gradient.addColorStop(0, '#b3bec4');
    gradient.addColorStop(0.45, '#edf1e8');
    gradient.addColorStop(1, '#9eaab1');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 192);

    // Interior silhouette.
    ctx.fillStyle = '#57646b';
    ctx.fillRect(80, 101, 22, 77);
    ctx.fillRect(88, 83, 6, 22);

    // Venetian blinds.
    ctx.fillStyle = 'rgba(19, 31, 40, 0.24)';
    for (let y = 15; y < 182; y += 13) {
      ctx.fillRect(6, y, 116, 3);
    }

    // Frame and central mullion.
    ctx.fillStyle = '#283940';
    ctx.fillRect(0, 0, 128, 5);
    ctx.fillRect(0, 187, 128, 5);
    ctx.fillRect(0, 0, 5, 192);
    ctx.fillRect(123, 0, 5, 192);
    ctx.fillRect(62, 0, 4, 192);

    const texture = this.canvasTexture(canvas);
    const material = this.game.world.windowMaterial;

    material.map = texture;
    material.emissiveMap = texture;
    material.roughness = 0.24;
    material.metalness = 0.2;
    material.envMapIntensity = 0.75;
    material.needsUpdate = true;
  }

  upgradeVehicles() {
    for (const vehicle of this.game.actors.vehicles) {
      const original = vehicle.paint;

      const paint = new THREE.MeshPhysicalMaterial({
        color: original.color.clone(),
        metalness: 0.48,
        roughness: 0.25,
        clearcoat: 1,
        clearcoatRoughness: 0.13,
        envMapIntensity: 1.1
      });

      vehicle.group.traverse(object => {
        if (!object.isMesh) return;

        if (object.material === original) {
          object.material = paint;
        }

        const material = object.material;

        // Preserve visibility from inside the cockpit.
        if (
          material?.isMeshStandardMaterial &&
          material.transparent &&
          material.opacity < 0.3
        ) {
          material.color.setHex(0xb2cad5);
          material.opacity = 0.16;
          material.roughness = 0.07;
          material.metalness = 0.08;
          material.envMapIntensity = 0.65;
          material.needsUpdate = true;
        }
      });

      vehicle.paint = paint;
      original.dispose();
    }

    for (const pedestrian of this.game.actors.pedestrians) {
      pedestrian.group.traverse(object => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
    }
  }

  makeWaterNormals() {
    const size = 256;
    const data = new Uint8Array(size * size * 4);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size * Math.PI * 2;
        const v = y / size * Math.PI * 2;

        const a = Math.cos(4 * u + 3 * v);
        const b = Math.cos(13 * u - 7 * v);
        const c = Math.cos(23 * u + 17 * v);

        let nx = -(0.14 * a + 0.156 * b + 0.092 * c);
        let ny = -(0.105 * a - 0.084 * b + 0.068 * c);
        let nz = 1;

        const length = Math.hypot(nx, ny, nz);

        nx /= length;
        ny /= length;
        nz /= length;

        const i = (y * size + x) * 4;

        data[i] = Math.round((nx * 0.5 + 0.5) * 255);
        data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        data[i + 3] = 255;
      }
    }

    const texture = new THREE.DataTexture(
      data,
      size,
      size,
      THREE.RGBAFormat
    );

    // Normal maps contain vector data, not sRGB color.
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(30, 42);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    this.textures.push(texture);
    return texture;
  }

  upgradeWater() {
    const water = this.game.world.water;
    const original = water.material;

    const material = new THREE.MeshPhysicalMaterial({
      color: 0x277b83,
      roughness: 0.17,
      metalness: 0.08,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      normalMap: this.makeWaterNormals(),
      normalScale: new THREE.Vector2(0.85, 0.85),
      envMapIntensity: 1.2
    });

    material.onBeforeCompile = shader => {
      shader.uniforms.ncWaterTime = this.waterTime;

      shader.vertexShader =
        'varying vec3 ncWaterPosition;\n' +
        shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `
          #include <worldpos_vertex>
          ncWaterPosition =
            (modelMatrix * vec4(transformed, 1.0)).xyz;
        `
      );

      shader.fragmentShader =
        `
          uniform float ncWaterTime;
          varying vec3 ncWaterPosition;
        ` + shader.fragmentShader;

      // Two scrolling wave layers reduce obvious repetition.
      const normalChunk = THREE.ShaderChunk.normal_fragment_maps.replace(
        /texture2D\(\s*normalMap\s*,\s*vNormalMapUv\s*\)/g,
        `(
          texture2D(
            normalMap,
            vNormalMapUv +
            vec2(ncWaterTime * 0.011, ncWaterTime * 0.006)
          ) * 0.65 +
          texture2D(
            normalMap,
            vNormalMapUv * 1.73 +
            vec2(-ncWaterTime * 0.008, ncWaterTime * 0.009)
          ) * 0.35
        )`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        normalChunk
      );

      // The sea begins at world X = 178 in the existing map.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
          #include <color_fragment>

          float ncShore =
            1.0 - smoothstep(
              0.0,
              3.5,
              ncWaterPosition.x - 178.0
            );

          float ncBreaker = 0.5 + 0.5 * sin(
            ncWaterPosition.z * 0.27 +
            ncWaterTime * 1.45 +
            sin(ncWaterPosition.z * 0.071 + ncWaterTime * 0.4)
          );

          float ncFoam =
            ncShore * smoothstep(0.38, 0.92, ncBreaker);

          diffuseColor.rgb = mix(
            diffuseColor.rgb,
            vec3(0.65, 0.81, 0.75),
            ncFoam * 0.72
          );
        `
      );
    };

    material.customProgramCacheKey = () => 'nc-ocean-v1';

    water.material = material;
    original.dispose();

    this.waterMaterial = material;
    this.waterDay = new THREE.Color(0x277b83);
    this.waterNight = new THREE.Color(0x153d50);
  }

  upgradeSky() {
    const game = this.game;
    const material = game.time.skyMaterial;

    material.fragmentShader = material.fragmentShader.replace(
      'gl_FragColor=vec4(color,1.);',
      `
        float ncSunFacing = dot(d, normalize(sun));

        float ncSunDisc = smoothstep(
          cos(0.008),
          cos(0.004),
          ncSunFacing
        );

        color +=
          vec3(1.0, 0.79, 0.56) *
          ncSunDisc *
          day *
          12.0 *
          (1.0 - clouds * 0.85);

        vec3 ncMoonDirection =
          normalize(vec3(-sun.x, sun.y, -sun.z));

        float ncMoonDisc = smoothstep(
          cos(0.007),
          cos(0.0045),
          dot(d, ncMoonDirection)
        );

        color +=
          vec3(0.54, 0.68, 0.9) *
          ncMoonDisc *
          (1.0 - day) *
          1.6 *
          (1.0 - clouds);

        gl_FragColor=vec4(color,1.);
      `
    );

    material.needsUpdate = true;

    /*
      Replace the generic indoor environment with a filtered version
      of the actual procedural sky.

      These are sky reflections, not screen-space building reflections.
    */
    this.environmentScene = new THREE.Scene();

    const environmentMaterial = material.clone();
    environmentMaterial.toneMapped = false;

    this.environmentSky = new THREE.Mesh(
      game.time.sky.geometry,
      environmentMaterial
    );

    this.environmentSky.frustumCulled = false;
    this.environmentScene.add(this.environmentSky);

    this.pmrem = new THREE.PMREMGenerator(game.renderer);
  }

  refreshEnvironment() {
    const game = this.game;
    const source = game.time.skyMaterial.uniforms;
    const target = this.environmentSky.material.uniforms;

    const day = source.day.value;
    const cloud = source.cloud.value;
    const sun = source.sun.value;

    const previous = this.lastEnvironment;

    if (
      previous &&
      Math.abs(previous.day - day) < 0.045 &&
      Math.abs(previous.cloud - cloud) < 0.1 &&
      previous.sun.distanceTo(sun) < 0.08
    ) {
      return;
    }

    target.day.value = day;
    target.cloud.value = cloud;
    target.time.value = source.time.value;
    target.sun.value.copy(sun);

    const next = this.pmrem.fromScene(
      this.environmentScene,
      0.035,
      0.1,
      1000
    );

    const old = game.environmentTarget;

    game.environmentTarget = next;
    game.scene.environment = next.texture;

    if (old) old.dispose();

    this.lastEnvironment = {
      day,
      cloud,
      sun: sun.clone()
    };
  }

  makeContactShadows() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;

    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(
      64, 64, 4,
      64, 64, 63
    );

    gradient.addColorStop(0, 'rgba(0,0,0,0.65)');
    gradient.addColorStop(0.4, 'rgba(0,0,0,0.42)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = this.canvasTexture(canvas);

    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);

    this.contactMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });

    const count =
      this.game.actors.vehicles.length +
      this.game.actors.pedestrians.length;

    this.contacts = new THREE.InstancedMesh(
      geometry,
      this.contactMaterial,
      count
    );

    this.contacts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.contacts.frustumCulled = false;
    this.contacts.renderOrder = 1;

    this.game.scene.add(this.contacts);
  }

  updateContactShadows() {
    const game = this.game;
    const object = this.transform;

    let index = 0;

    for (const vehicle of game.actors.vehicles) {
      object.position.set(vehicle.x, 0.087, vehicle.z);
      object.rotation.set(0, vehicle.yaw, 0);

      const visible = vehicle.group.visible;
      const bike = vehicle.type === 'motorcycle';

      object.scale.set(
        visible ? (bike ? 1.25 : 2.8) : 0,
        1,
        visible ? (bike ? 2.8 : 5.2) : 0
      );

      object.updateMatrix();
      this.contacts.setMatrixAt(index++, object.matrix);
    }

    for (const pedestrian of game.actors.pedestrians) {
      object.position.set(pedestrian.x, 0.087, pedestrian.z);
      object.rotation.set(0, 0, 0);

      const scale = pedestrian.group.visible ? 1 : 0;
      object.scale.set(scale, 1, scale);

      object.updateMatrix();
      this.contacts.setMatrixAt(index++, object.matrix);
    }

    this.contacts.instanceMatrix.needsUpdate = true;

    this.contactMaterial.opacity =
      THREE.MathUtils.lerp(0.48, 0.25, game.time.night);
  }

  applyQuality() {
    const game = this.game;
    const quality = game.settings.quality;

    const high = quality === 'high';
    const low = quality === 'low';

    const anisotropy = Math.min(
      game.renderer.capabilities.getMaxAnisotropy(),
      high ? 8 : low ? 2 : 4
    );

    for (const texture of this.textures) {
      if (texture.anisotropy !== anisotropy) {
        texture.anisotropy = anisotropy;
        texture.needsUpdate = true;
      }
    }

    const shadow = game.time.sun.shadow;
    const size = high ? 4096 : 2048;

    if (shadow.mapSize.x !== size) {
      shadow.mapSize.set(size, size);

      if (shadow.map) {
        shadow.map.dispose();
        shadow.map = null;
      }

      if (shadow.mapPass) {
        shadow.mapPass.dispose();
        shadow.mapPass = null;
      }

      shadow.needsUpdate = true;
    }

    // Concentrate shadow detail near the player.
    const reach = high ? 78 : 88;

    Object.assign(shadow.camera, {
      left: -reach,
      right: reach,
      top: reach,
      bottom: -reach,
      near: 1,
      far: 430
    });

    shadow.camera.updateProjectionMatrix();
    shadow.normalBias = high ? 0.035 : 0.065;
    shadow.bias = -0.00006;

    game.renderer.shadowMap.enabled = !low;
    game.time.sun.castShadow = !low;

    game.bloom.enabled = !low;
    game.bloom.strength = high ? 0.23 : 0.16;
    game.bloom.radius = 0.5;
    game.bloom.threshold = 0.95;

    // Contact shadows remain useful when real shadows are disabled.
    this.contacts.visible = true;
    this.fxaa.enabled = true;

    this.environmentTimer = 30;
  }

  update(dt) {
    const game = this.game;

    this.waterTime.value = game.time.elapsed;

    this.waterMaterial.color.lerpColors(
      this.waterDay,
      this.waterNight,
      game.time.night
    );

    const waveStrength = 0.8 + game.weather.rain * 0.5;
    this.waterMaterial.normalScale.set(waveStrength, waveStrength);

    // Preserve the existing weather-driven wetness.
    game.world.materials.road.roughness =
      0.95 - game.weather.wet * 0.7;

    game.world.materials.road.metalness =
      0.035 + game.weather.wet * 0.22;

    game.renderer.toneMappingExposure =
      THREE.MathUtils.lerp(0.98, 1.08, game.time.night);

    this.updateContactShadows();

    // Match FXAA to the real render resolution, including devicePixelRatio.
    game.renderer.getDrawingBufferSize(this.bufferSize);

    this.fxaa.uniforms.resolution.value.set(
      1 / Math.max(1, this.bufferSize.x),
      1 / Math.max(1, this.bufferSize.y)
    );

    this.environmentTimer += dt;

    const source = game.time.skyMaterial.uniforms;

    const majorLightingChange =
      this.lastEnvironment &&
      (
        Math.abs(this.lastEnvironment.day - source.day.value) > 0.2 ||
        Math.abs(this.lastEnvironment.cloud - source.cloud.value) > 0.3
      );

    const interval = game.settings.quality === 'low' ? 30 : 12;

    if (
      !this.lastEnvironment ||
      majorLightingChange ||
      this.environmentTimer >= interval
    ) {
      this.environmentTimer = 0;
      this.refreshEnvironment();
    }
  }
}
