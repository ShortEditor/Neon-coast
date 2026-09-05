import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { World, clamp } from './world.js';
import { Actors } from './actors.js';
import { Player } from './player.js';
import {
  Input,
  TimeSystem,
  Weather,
  Sound,
  SaveSystem,
  cinematicPass
} from './simulation.js';
import { Missions } from './missions.js';
import { UI } from './ui.js';
import { Graphics } from './graphics.js';
import { MobileControls } from './mobile.js';

const SETTINGS_KEY = 'neon-coast-settings-v2';
const DEFAULT_SETTINGS = {
  quality: 'medium',
  fov: 78,
  sensitivity: 1,
  volume: 0.45,
  reducedMotion: false,
  radio: true
};

const clone = value => JSON.parse(JSON.stringify(value));

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function readSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    saved = {};
  }
  return {
    quality: ['low', 'medium', 'high'].includes(saved.quality)
      ? saved.quality
      : DEFAULT_SETTINGS.quality,
    fov: clamp(finite(saved.fov, 78), 60, 100),
    sensitivity: clamp(finite(saved.sensitivity, 1), 0.3, 2.5),
    volume: clamp(finite(saved.volume, 0.45), 0, 1),
    reducedMotion: !!saved.reducedMotion,
    radio: saved.radio !== false
  };
}

function showFatal(error) {
  console.error(error);
  const loading = document.getElementById('loading');
  loading.style.display = 'flex';
  loading.style.letterSpacing = 'normal';
  loading.replaceChildren();

  const panel = document.createElement('div');
  panel.style.maxWidth = '720px';

  const title = document.createElement('h2');
  title.textContent = 'THE COAST COULD NOT START';

  const message = document.createElement('p');
  message.textContent = error?.message || 'An unexpected error occurred.';

  const instructions = document.createElement('p');
  instructions.textContent =
    'Use a current desktop browser with WebGL2 and hardware acceleration enabled. ' +
    'Serve these files through http://localhost:8000 rather than opening index.html directly. ' +
    'An internet connection is required for Three.js. Check the browser console for details.';

  const button = document.createElement('button');
  button.textContent = 'Reload';
  button.onclick = () => location.reload();

  panel.append(title, message, instructions, button);
  loading.appendChild(panel);
}

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.settings = readSettings();

    this.touchDevice = MobileControls.supported();

    if (this.touchDevice) {
      MobileControls.applyDefaults(this.settings);
    }
    this.started = false;
    this.paused = true;
    this.failed = false;
    this.crashed = false;
    this.dragLook = false;
    this.checkpointState = null;
    this.storageWarningShown = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      this.settings.fov,
      innerWidth / innerHeight,
      0.06,
      900
    );
    this.scene.add(this.camera);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.makeEnvironment();

    this.world = new World(this.scene);
    this.player = new Player(this.camera, this.world);
    this.actors = new Actors(this.scene, this.world);
    this.weather = new Weather(this.scene);
    this.time = new TimeSystem(this.scene, this.renderer, this.world);
    this.time.sun.shadow.camera.updateProjectionMatrix();
    this.sound = new Sound();
    this.sound.radio = this.settings.radio;
    this.input = new Input(this.canvas);
    this.save = new SaveSystem();
    this.missions = new Missions(this);
    this.ui = new UI(this);

    this.makePostprocessing();
    this.makeHeadlights();
    this.makeObjectiveBeacon();

    this.mobile = new MobileControls(this);
    this.graphics = new Graphics(this);

    this.applySettings();
    this.bindEvents();
    this.syncVisuals();
    this.ui.mainMenu();

    document.getElementById('loading').style.display = 'none';

    this.lastTime = performance.now();
    requestAnimationFrame(now => this.frame(now));
  }

  get running() {
    return this.started && !this.paused && !this.failed && !this.crashed;
  }

  makeEnvironment() {
    const generator = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environmentTarget = generator.fromScene(room, 0.04);
    this.scene.environment = this.environmentTarget.texture;
    if (typeof room.dispose === 'function') room.dispose();
    generator.dispose();
  }

  makePostprocessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight),
      0.19,
      0.45,
      0.9
    );
    this.composer.addPass(this.bloom);
    this.grade = cinematicPass();
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  makeHeadlights() {
    this.headlights = [-0.62, 0.62].map(side => {
      const light = new THREE.SpotLight(
        0xffe4b5,
        0,
        65,
        Math.PI / 7,
        0.5,
        2
      );
      const target = new THREE.Object3D();
      this.scene.add(light, target);
      light.target = target;
      return { light, target, side };
    });
  }

  updateHeadlights() {
    const vehicle = this.player.vehicle;
    const on = vehicle && (vehicle.headlights || this.time.night > 0.4);
    for (const beam of this.headlights) {
      beam.light.intensity = on ? 460 : 0;
      beam.light.visible = !!on;
      if (!on) continue;
      const sin = Math.sin(vehicle.yaw);
      const cos = Math.cos(vehicle.yaw);
      beam.light.position.set(
        vehicle.x + cos * beam.side + sin * 2.04,
        0.9,
        vehicle.z - sin * beam.side + cos * 2.04
      );
      beam.target.position.set(
        vehicle.x + cos * beam.side + sin * 35,
        0.15,
        vehicle.z - sin * beam.side + cos * 35
      );
    }
  }

  makeObjectiveBeacon() {
    this.beacon = new THREE.Group();
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xb5e8d3,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.42, 40),
      ringMaterial
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    this.beacon.add(ring);

    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.6, 4),
      new THREE.MeshBasicMaterial({
        color: 0xe7cba5,
        transparent: true,
        opacity: 0.85,
        depthWrite: false
      })
    );
    arrow.rotation.z = Math.PI;
    arrow.position.y = 2.9;
    this.beacon.add(arrow);
    this.beaconArrow = arrow;
    this.scene.add(this.beacon);
  }

  updateBeacon() {
    const goal = this.missions.target(this);
    this.beacon.visible = this.started && !!goal;
    if (!goal) return;
    this.beacon.position.set(goal.x, goal.y || 0, goal.z);
    this.beaconArrow.position.y = this.settings.reducedMotion
      ? 2.9
      : 2.9 + Math.sin(this.time.elapsed * 2.5) * 0.17;
  }

  applySettings() {
    this.player.sensitivity = this.settings.sensitivity;
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.sound.volume = this.settings.volume;
    this.sound.radio = this.settings.radio;

    const ratios = this.touchDevice
      ? { low: 0.8, medium: 1, high: 1.25 }
      : { low: 1, medium: 1.5, high: 2 };

    const ratio = Math.min(
      window.devicePixelRatio || 1,
      ratios[this.settings.quality]
    );

    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = this.settings.quality !== 'low';
    this.time.sun.castShadow = this.settings.quality !== 'low';
    this.bloom.enabled = this.settings.quality !== 'low';
    this.bloom.strength = this.settings.quality === 'high' ? 0.22 : 0.14;
    this.grade.uniforms.grain.value =
      this.settings.reducedMotion || this.settings.quality === 'low'
        ? 0
        : 0.003;
    this.graphics?.applyQuality();

    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // The game remains playable when browser storage is unavailable.
    }
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.composer.setSize(innerWidth, innerHeight);
      if (this.ui.screen === 'map') {
        this.ui.drawMap(this.ui.mapContext, this, 760, 560, false);
      }
    });

    window.addEventListener('mousemove', event => {
      if (!this.running) return;
      if (
        document.pointerLockElement === this.canvas ||
        this.dragLook
      ) {
        this.player.look(event.movementX || 0, event.movementY || 0);
      }
    });

    this.canvas.addEventListener('mousedown', event => {
      if (event.button !== 0 || !this.running) return;
      this.dragLook = true;
    });

    window.addEventListener('mouseup', () => {
      this.dragLook = false;
    });

    this.canvas.addEventListener('click', () => {
      if (this.running && document.pointerLockElement !== this.canvas) {
        this.captureMouse();
      }
    });

    this.canvas.addEventListener('contextmenu', event => event.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.dragLook = false;
      if (
        document.pointerLockElement !== this.canvas &&
        this.running
      ) {
        this.ui.pauseMenu();
      }
    });

    document.addEventListener('pointerlockerror', () => {
      if (this.running) {
        this.ui.toast(
          'Mouse capture unavailable. Hold the left mouse button and drag to look.',
          8
        );
      }
    });

    window.addEventListener('keydown', event => {
      if (['F6', 'F9'].includes(event.code)) event.preventDefault();
      if (event.code !== 'Escape' || !this.started) return;
      event.preventDefault();
      if (this.running) {
        this.ui.pauseMenu();
      } else if (['pause', 'map'].includes(this.ui.screen)) {
        this.resume();
      } else if (
        ['settings', 'controls', 'confirm'].includes(this.ui.screen) &&
        !this.failed
      ) {
        this.ui.pauseMenu();
      }
    });

    window.addEventListener('blur', () => {
      this.dragLook = false;
      if (this.running) this.ui.pauseMenu();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.running) this.ui.pauseMenu();
    });
  }

  captureMouse() {
    if (this.touchDevice) return;

    if (!this.canvas.requestPointerLock) {
      this.ui.toast('Hold the left mouse button and drag to look.', 6);
      return;
    }
    try {
      const request = this.canvas.requestPointerLock();
      if (request?.catch) {
        request.catch(() => {
          if (this.running) {
            this.ui.toast(
              'Hold the left mouse button and drag to look. Esc opens the menu.',
              7
            );
          }
        });
      }
    } catch {
      this.ui.toast('Hold the left mouse button and drag to look.', 6);
    }
  }

  pause() {
    this.paused = true;
    this.mobile?.reset();
    this.dragLook = false;
    this.input.clear();
    this.sound.pause();
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  resume() {
    if (!this.started || this.failed || this.crashed) return;
    this.input.clear();
    this.paused = false;
    this.ui.hide();
    try {
      this.sound.start();
    } catch (error) {
      console.warn('Audio could not start:', error);
    }
    this.captureMouse();
    this.lastTime = performance.now();
  }

  newGame() {
    this.pause();
    this.started = true;
    this.failed = false;
    this.ui.clearEffects();
    this.world.reset();
    this.actors.reset();
    this.player.reset();
    this.missions.reset(this);
    this.time.hours = 17.4;
    this.time.elapsed = 0;
    this.time.lightTick = 0;
    this.weather.kind = 0;
    this.weather.rain = 0;
    this.weather.cloud = 0;
    this.weather.wet = 0;
    this.weather.timer = 120;
    this.sound.musicStep = 0;
    this.sound.radio = this.settings.radio;
    this.syncVisuals();
    this.checkpoint();
    this.resume();
    this.ui.chapter('AFTER THE FLOOD', 'Every paradise has a waterline.');
    this.ui.toast(
      'WASD move · E interact · P phone · M map. Open your phone and press E to take the first job.',
      12
    );
  }

  fail(reason) {
    if (this.failed || !this.started) return;
    this.failed = true;
    this.pause();
    this.ui.failure(reason);
  }

  checkpoint(persist = true) {
    if (!this.started) return;
    const state = this.snapshot();
    this.checkpointState = clone(state);
    if (persist && !this.save.write(state) && !this.storageWarningShown) {
      this.storageWarningShown = true;
      this.ui.toast(
        'Browser storage is unavailable. Checkpoints work for this session, but will not survive closing the page.',
        9
      );
    }
  }

  saveManual() {
    if (!this.started || this.failed) return;
    const state = this.snapshot();
    this.checkpointState = clone(state);
    this.ui.toast(
      this.save.write(state)
        ? 'Game saved on this browser.'
        : 'Persistent save failed. An in-memory checkpoint was kept.',
      5
    );
  }

  loadSaved() {
    const state = this.save.read();
    if (!state) {
      this.ui.toast('No valid save was found on this browser.', 5);
      return;
    }
    try {
      this.restore(state);
      this.resume();
      this.ui.toast('Saved game restored.', 5);
    } catch (error) {
      console.error('Save restore failed:', error);
      this.pause();
      this.failed = true;
      this.ui.failure(
        'This save could not be restored. Start a new story to replace it.'
      );
    }
  }

  retry() {
    if (!this.checkpointState) return;
    try {
      const state = clone(this.checkpointState);
      this.restore(state);
      this.resume();
      this.ui.toast('Checkpoint restored.', 5);
    } catch (error) {
      console.error('Checkpoint restore failed:', error);
      this.ui.failure('The checkpoint could not be restored. Start a new story.');
    }
  }

  snapshot() {
    return {
      version: 2,
      player: this.player.snapshot(),
      actors: this.actors.snapshot(),
      missions: this.missions.snapshot(),
      world: this.world.snapshot(),
      hours: this.time.hours,
      elapsed: this.time.elapsed,
      weather: {
        kind: this.weather.kind,
        rain: this.weather.rain,
        cloud: this.weather.cloud,
        wet: this.weather.wet,
        timer: this.weather.timer
      },
      radio: this.sound.radio
    };
  }

  restore(state) {
    if (!this.save.valid(state)) {
      throw new Error('The save format is invalid.');
    }

    // Additional checks for indices used by traffic routing and vehicle restore.
    const ids = new Set();
    for (const vehicle of state.actors.vehicles) {
      if (
        !Number.isInteger(vehicle.id) ||
        vehicle.id < 0 ||
        vehicle.id >= this.actors.vehicles.length ||
        ids.has(vehicle.id) ||
        !Number.isInteger(vehicle.from) ||
        !Number.isInteger(vehicle.to) ||
        vehicle.from === vehicle.to ||
        this.actors.vehicles[vehicle.id].type !== vehicle.type
      ) {
        throw new Error('The save contains invalid vehicle data.');
      }
      ids.add(vehicle.id);
    }

    this.pause();
    this.started = true;
    this.failed = false;
    this.ui.clearEffects();
    this.world.reset();
    this.actors.reset();
    this.actors.restore(state.actors);
    this.world.restore(state.world || {});
    this.missions.restore(state.missions, this);
    this.player.restore(state.player, this);
    this.time.hours = ((state.hours % 24) + 24) % 24;
    this.time.elapsed = Math.max(0, finite(state.elapsed, 0));
    this.time.lightTick = 0;

    const weather = state.weather || {};
    this.weather.kind = clamp(Math.floor(finite(weather.kind, 0)), 0, 2);
    this.weather.rain = clamp(finite(weather.rain, 0), 0, 1);
    this.weather.cloud = clamp(finite(weather.cloud, 0), 0, 1);
    this.weather.wet = clamp(finite(weather.wet, 0), 0, 1);
    this.weather.timer = clamp(finite(weather.timer, 100), 1, 600);
    this.sound.radio = state.radio !== false;
    this.settings.radio = this.sound.radio;
    this.sound.musicStep = 0;
    this.missions.sync(this);
    this.syncVisuals();
    this.checkpointState = clone(this.snapshot());
  }

  syncVisuals() {
    this.time.update(0, this.weather, this.player, this.world);
    this.weather.update(0, this.player);
    this.world.update(0, this);
    for (const vehicle of this.actors.vehicles) {
      vehicle.visual(0, this.time.night, this.time.elapsed, this.actors.heat > 0);
      vehicle.group.visible = true;
    }
    for (const pedestrian of this.actors.pedestrians) {
      pedestrian.group.position.set(pedestrian.x, 0, pedestrian.z);
    }
    this.player.render(1, this);
    this.camera.updateMatrixWorld(true);
    this.updateHeadlights();
    this.updateBeacon();
    this.ui.mapTimer = 0;
    this.ui.update(0);
  }

  processGlobalInput(pressed) {
    if (pressed.has('KeyM') || pressed.has('Tab')) {
      this.ui.mapMenu();
      return false;
    }

    if (pressed.has('F9')) {
      if (this.save.read()) this.ui.confirmLoad();
      else this.ui.toast('No saved game was found.', 4);
      return false;
    }

    if (pressed.has('F6')) this.saveManual();

    if (pressed.has('KeyR')) {
      this.sound.radio = !this.sound.radio;
      this.settings.radio = this.sound.radio;
      this.applySettings();
      this.ui.toast(
        this.sound.radio ? 'Palm Static / 103.8' : 'Radio switched off',
        3
      );
    }

    return true;
  }

  update(dt) {
    const pressed = this.input.take();
    if (!this.processGlobalInput(pressed) || !this.running) return;

    // Substeps make collisions and steering more stable during slower frames.
    const substeps = Math.max(1, Math.ceil(dt / (1 / 60)));
    const stepTime = dt / substeps;

    for (let i = 0; i < substeps; i++) {
      const stepPressed = i === 0 ? pressed : new Set();
      this.player.update(stepTime, this, this.input.keys, stepPressed);
      if (!this.running) break;
      this.actors.update(stepTime, this);
      if (!this.running) break;
      this.missions.update(stepTime, this);
      if (!this.running) break;
      this.weather.update(stepTime, this.player);
      this.time.update(stepTime, this.weather, this.player, this.world);
      this.world.update(stepTime, this);
    }

    if (this.running) this.sound.update(dt, this);
  }

  frame(now) {
    requestAnimationFrame(next => this.frame(next));
    if (this.crashed) return;

    try {
      const dt = clamp((now - this.lastTime) / 1000, 0.001, 0.05);
      this.lastTime = now;

      this.mobile?.update();

      if (this.running) this.update(dt);
      else this.input.take();

      this.player.render(dt, this);
      this.camera.updateMatrixWorld(true);
      this.updateHeadlights();
      this.updateBeacon();
      this.ui.update(this.running ? dt : 0);
      this.graphics.update(this.running ? dt : 0);

      this.grade.uniforms.time.value = this.time.elapsed;
      this.composer.render(dt);
    } catch (error) {
      this.crashed = true;
      this.pause();
      showFatal(error);
    }
  }
}

try {
  // Useful for inspecting state from the browser developer console.
  window.neonCoast = new Game();
} catch (error) {
  showFatal(error);
}
