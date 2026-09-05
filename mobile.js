export class MobileControls {
  static supported() {
    const forced = new URLSearchParams(location.search).get('touch');

    if (forced === '1') return true;
    if (forced === '0') return false;

    return (
      window.matchMedia('(pointer: coarse)').matches ||
      window.matchMedia('(any-pointer: coarse)').matches ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (
        navigator.maxTouchPoints > 1 &&
        /Macintosh/i.test(navigator.userAgent)
      )
    );
  }

  static applyDefaults(settings) {
    const key = 'neon-coast-touch-preset-v1';

    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {}

    settings.quality = 'low';
    settings.reducedMotion = true;
  }

  constructor(game) {
    this.game = game;
    this.enabled = MobileControls.supported();

    this.sources = new Map();
    this.held = new Set();
    this.cancelHandlers = [];

    this.vehicleMode = null;
    this.visible = false;

    game.touchDevice = this.enabled;

    if (!this.enabled) return;

    document.documentElement.classList.add('nc-mobile');

    this.build();
    this.bind();

    window.addEventListener('blur', () => this.reset());
    window.addEventListener('resize', () => this.reset());

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
  }

  build() {
    const style = document.createElement('style');

    style.textContent = `
      .nc-mobile body {
        overscroll-behavior: none;
      }

      .nc-mobile #game {
        touch-action: none;
      }

      #ncTouch {
        position: fixed;
        inset: 0;
        z-index: 4;
        pointer-events: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        -webkit-tap-highlight-color: transparent;

        --bottom: env(safe-area-inset-bottom, 0px);
        --left: env(safe-area-inset-left, 0px);
        --right: env(safe-area-inset-right, 0px);
        --top: env(safe-area-inset-top, 0px);
      }

      #ncTouch[hidden],
      #ncTouch [hidden] {
        display: none !important;
      }

      #ncTouch button,
      #ncStick,
      #ncLook {
        pointer-events: auto;
        touch-action: none;
      }

      #ncTouch button {
        min-width: 48px;
        min-height: 48px;
        margin: 0;
        padding: 5px;
        border: 2px solid #c6ecdd99;
        border-radius: 14px;
        background: #112637da;
        color: white;
        font: 700 11px system-ui, sans-serif;
        box-shadow: 0 4px 12px #0005;
        text-shadow: 0 1px 3px #000;
      }

      #ncTouch button.down {
        background: #438e78ed;
        border-color: #e0ffef;
      }

      #ncLook {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 38%;
        right: 0;
      }

      #ncLookHint {
        position: absolute;
        right: 16%;
        top: 48%;
        color: #ffffff65;
        font: 10px system-ui;
        letter-spacing: .12em;
        pointer-events: none;
      }

      #ncStick {
        position: absolute;
        left: calc(20px + var(--left));
        bottom: calc(24px + var(--bottom));
        width: 138px;
        height: 138px;
        border: 3px solid #d1f4e19c;
        border-radius: 50%;
        background:
          radial-gradient(circle, #517f7960, #10283dce);
        box-shadow:
          0 6px 22px #0005,
          inset 0 0 24px #0005;
      }

      #ncKnob {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 54px;
        height: 54px;
        border-radius: 50%;
        border: 2px solid #e0fff0;
        background: #90cbbac7;
        transform: translate(-50%, -50%);
        box-shadow: 0 3px 10px #0006;
        pointer-events: none;
      }

      #ncStickLabel {
        position: absolute;
        bottom: 8px;
        left: 0;
        right: 0;
        text-align: center;
        color: #e1faee;
        font: 9px system-ui;
        letter-spacing: .18em;
        pointer-events: none;
      }

      #ncToolbar {
        position: absolute;
        top: calc(76px + var(--top));
        right: calc(12px + var(--right));
        display: flex;
        gap: 7px;
      }

      #ncToolbar button {
        width: 52px;
      }

      #ncPhoneTabs {
        position: absolute;
        top: calc(133px + var(--top));
        right: calc(12px + var(--right));
        display: flex;
        gap: 5px;
      }

      #ncPhoneTabs button {
        min-width: 41px;
        width: 41px;
        min-height: 43px;
        font-size: 9px;
      }

      #ncActions {
        position: absolute;
        right: calc(16px + var(--right));
        bottom: calc(22px + var(--bottom));
        display: grid;
        grid-template-columns: repeat(2, 61px);
        gap: 8px;
      }

      #ncActions button {
        height: 55px;
      }

      #ncUse {
        background: #76506ce8 !important;
        border-color: #f2bdd4 !important;
      }

      #ncUse.down {
        background: #b4719ee8 !important;
      }

      #ncPedals {
        position: absolute;
        left: 50%;
        bottom: calc(22px + var(--bottom));
        transform: translateX(-50%);
        display: flex;
        gap: 10px;
      }

      #ncPedals button {
        width: 65px;
        height: 76px;
      }

      #ncGas {
        background: #285c48eb !important;
        border-color: #beefd2 !important;
      }

      #ncBrake {
        background: #603c4deb !important;
        border-color: #eec0cf !important;
      }

      .nc-mobile #brand {
        top: calc(12px + env(safe-area-inset-top, 0px));
        left: calc(12px + env(safe-area-inset-left, 0px));
        font-size: 8px;
        letter-spacing: .1em;
      }

      .nc-mobile #objective {
        top: calc(34px + env(safe-area-inset-top, 0px));
        left: calc(12px + env(safe-area-inset-left, 0px));
        right: calc(190px + env(safe-area-inset-right, 0px));
        max-width: 390px;
        max-height: 106px;
        overflow: hidden;
        padding: 7px;
        font-size: 10px;
        line-height: 1.4;
      }

      .nc-mobile #heat {
        top: calc(10px + env(safe-area-inset-top, 0px));
        right: calc(12px + env(safe-area-inset-right, 0px));
        font-size: 18px;
      }

      .nc-mobile #clock {
        top: calc(36px + env(safe-area-inset-top, 0px));
        right: calc(12px + env(safe-area-inset-right, 0px));
        font-size: 8px;
      }

      .nc-mobile #mini {
        left: calc(14px + env(safe-area-inset-left, 0px));
        bottom: calc(178px + env(safe-area-inset-bottom, 0px));
        width: 72px;
        height: 72px;
      }

      .nc-mobile #stats {
        left: calc(97px + env(safe-area-inset-left, 0px));
        bottom: calc(178px + env(safe-area-inset-bottom, 0px));
        font-size: 8px;
      }

      .nc-mobile #stats .bar {
        width: 72px;
        height: 4px;
        margin: 4px 0 7px;
      }

      .nc-mobile #speed {
        right: calc(18px + env(safe-area-inset-right, 0px));
        bottom: calc(219px + env(safe-area-inset-bottom, 0px));
        font-size: 26px;
      }

      .nc-mobile #radio {
        display: none;
      }

      .nc-mobile #prompt {
        bottom: calc(126px + env(safe-area-inset-bottom, 0px));
        max-width: calc(100% - 350px);
        padding: 6px 8px;
        font-size: 10px;
      }

      .nc-mobile #toast {
        top: 20%;
        max-width: 84vw;
        padding: 9px 12px;
        font-size: 11px;
      }

      .nc-mobile .panel {
        max-height: 92vh;
        max-height: 92dvh;
        padding: 20px;
        -webkit-overflow-scrolling: touch;
      }

      .nc-mobile .panel button {
        min-height: 46px;
      }

      @media (orientation: portrait) {
        #ncPedals {
          left: auto;
          right: calc(16px + var(--right));
          bottom: calc(218px + var(--bottom));
          transform: none;
        }

        .nc-mobile #objective {
          right: 135px;
        }

        .nc-mobile #prompt {
          bottom: calc(315px + env(safe-area-inset-bottom, 0px));
          max-width: calc(100% - 30px);
        }

        .nc-mobile #speed {
          bottom: calc(302px + env(safe-area-inset-bottom, 0px));
        }

        #ncLookHint {
          right: 10%;
          top: 43%;
        }
      }

      @media (max-height: 380px) and (orientation: landscape) {
        .nc-mobile #mini,
        .nc-mobile #stats {
          display: none;
        }
      }
    `;

    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.id = 'ncTouch';
    this.root.hidden = true;

    this.root.innerHTML = `
      <div id="ncLook" aria-label="Swipe to look"></div>
      <span id="ncLookHint">SWIPE TO LOOK</span>

      <div id="ncStick" aria-label="Movement joystick">
        <div id="ncKnob"></div>
        <span id="ncStickLabel">MOVE</span>
      </div>

      <div id="ncToolbar">
        <button type="button" id="ncPhone">PHONE</button>
        <button type="button" id="ncMap">MAP</button>
        <button type="button" id="ncPause">PAUSE</button>
      </div>

      <div id="ncPhoneTabs" hidden>
        <button type="button" data-tab="1">JOBS</button>
        <button type="button" data-tab="2">MAP</button>
        <button type="button" data-tab="3">PEOPLE</button>
        <button type="button" data-tab="4">SYSTEM</button>
      </div>

      <div id="ncActions">
        <button type="button" id="ncUse">USE</button>
        <button type="button" id="ncJump">JUMP</button>
        <button type="button" id="ncRun">RUN</button>
        <button type="button" id="ncCrouch">CROUCH</button>
        <button type="button" id="ncLights" hidden>LIGHTS</button>
        <button type="button" id="ncRadio" hidden>RADIO</button>
      </div>

      <div id="ncPedals" hidden>
        <button type="button" id="ncBrake">BRAKE<br>REVERSE</button>
        <button type="button" id="ncGas">GAS</button>
      </div>
    `;

    document.body.appendChild(this.root);

    this.elements = {};

    for (const element of this.root.querySelectorAll('[id]')) {
      this.elements[element.id] = element;
    }

    this.root.addEventListener('contextmenu', event => {
      event.preventDefault();
    });
  }

  consume(event) {
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
  }

  track(element, handlers) {
    let pointer = null;

    const finish = () => {
      if (pointer === null) return;

      const oldPointer = pointer;
      pointer = null;

      element.classList.remove('down');
      handlers.end?.();

      try {
        if (element.hasPointerCapture(oldPointer)) {
          element.releasePointerCapture(oldPointer);
        }
      } catch {}
    };

    element.addEventListener('pointerdown', event => {
      if (
        !this.game.running ||
        pointer !== null ||
        event.button !== 0
      ) return;

      this.consume(event);
      pointer = event.pointerId;

      element.classList.add('down');

      try {
        element.setPointerCapture(pointer);
      } catch {}

      handlers.start?.(event);
    }, { passive: false });

    element.addEventListener('pointermove', event => {
      if (event.pointerId !== pointer) return;

      this.consume(event);
      handlers.move?.(event);
    }, { passive: false });

    for (const type of ['pointerup', 'pointercancel']) {
      element.addEventListener(type, event => {
        if (event.pointerId !== pointer) return;

        this.consume(event);
        finish();
      }, { passive: false });
    }

    element.addEventListener('lostpointercapture', event => {
      if (event.pointerId === pointer) finish();
    });

    this.cancelHandlers.push(finish);
  }

  setHeld(source, keys) {
    if (keys.length) this.sources.set(source, keys);
    else this.sources.delete(source);

    const next = new Set();

    for (const list of this.sources.values()) {
      for (const key of list) next.add(key);
    }

    for (const key of this.held) {
      if (!next.has(key)) this.game.input.keys.delete(key);
    }

    for (const key of next) {
      this.game.input.keys.add(key);
    }

    this.held = next;
  }

  button(element, action) {
    const source = `button:${element.id || element.dataset.tab}`;

    this.track(element, {
      start: () => {
        const command = action();

        if (command.hold) {
          this.setHeld(source, [command.key]);
        } else if (command.key) {
          this.game.input.pressed.add(command.key);
        }

        command.run?.();
      },

      end: () => this.setHeld(source, [])
    });
  }

  bind() {
    const e = this.elements;
    const game = this.game;

    this.button(e.ncPhone, () => ({ key: 'KeyP' }));
    this.button(e.ncMap, () => ({ key: 'KeyM' }));
    this.button(e.ncUse, () => ({ key: 'KeyE' }));
    this.button(e.ncJump, () => ({ key: 'Space' }));

    this.button(e.ncRun, () => ({
      key: 'ShiftLeft',
      hold: true
    }));

    this.button(e.ncCrouch, () => ({
      key: 'KeyC',
      hold: true
    }));

    this.button(e.ncLights, () => ({ key: 'KeyH' }));
    this.button(e.ncRadio, () => ({ key: 'KeyR' }));

    this.button(e.ncGas, () => ({
      key: 'KeyW',
      hold: true
    }));

    this.button(e.ncBrake, () => ({
      key: 'KeyS',
      hold: true
    }));

    this.button(e.ncPause, () => ({
      run: () => game.ui.pauseMenu()
    }));

    for (const button of e.ncPhoneTabs.querySelectorAll('button')) {
      this.button(button, () => ({
        key: `Digit${button.dataset.tab}`
      }));
    }

    const moveStick = event => {
      const rect = e.ncStick.getBoundingClientRect();
      const radius = rect.width * 0.31;

      let dx = event.clientX - rect.left - rect.width / 2;
      let dy = event.clientY - rect.top - rect.height / 2;

      const length = Math.hypot(dx, dy);

      if (length > radius) {
        dx *= radius / length;
        dy *= radius / length;
      }

      e.ncKnob.style.transform =
        `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;

      const x = dx / radius;
      const y = dy / radius;
      const keys = [];
      const deadzone = 0.26;

      if (x < -deadzone) keys.push('KeyA');
      if (x > deadzone) keys.push('KeyD');

      if (!game.player.vehicle) {
        if (y < -deadzone) keys.push('KeyW');
        if (y > deadzone) keys.push('KeyS');
      }

      this.setHeld('joystick', keys);
    };

    this.track(e.ncStick, {
      start: moveStick,
      move: moveStick,

      end: () => {
        this.setHeld('joystick', []);
        e.ncKnob.style.transform = 'translate(-50%, -50%)';
      }
    });

    let lastX = 0;
    let lastY = 0;

    this.track(e.ncLook, {
      start: event => {
        lastX = event.clientX;
        lastY = event.clientY;
      },

      move: event => {
        const dx = Math.max(-90, Math.min(90, event.clientX - lastX));
        const dy = Math.max(-90, Math.min(90, event.clientY - lastY));

        lastX = event.clientX;
        lastY = event.clientY;

        game.player.look(dx * 1.75, dy * 1.5);
      }
    });
  }

  reset() {
    if (!this.enabled) return;

    for (const cancel of this.cancelHandlers) cancel();

    this.sources.clear();

    for (const key of this.held) {
      this.game.input.keys.delete(key);
    }

    this.held.clear();
  }

  update() {
    if (!this.enabled) return;

    const game = this.game;
    const e = this.elements;
    const running = game.running;

    this.root.hidden = !running;

    if (!running) {
      if (this.visible) this.reset();
      this.visible = false;
      return;
    }

    this.visible = true;

    const driving = !!game.player.vehicle;

    if (driving !== this.vehicleMode) {
      this.reset();
      this.vehicleMode = driving;

      e.ncStickLabel.textContent = driving ? 'STEER' : 'MOVE';
      e.ncJump.textContent = driving ? 'HORN' : 'JUMP';
      e.ncRun.textContent = driving ? 'HANDBRAKE' : 'RUN';

      e.ncCrouch.hidden = driving;
      e.ncLights.hidden = !driving;
      e.ncRadio.hidden = !driving;
      e.ncPedals.hidden = !driving;
    }

    const phone = game.player.phone;

    e.ncPhone.textContent = phone ? 'CLOSE' : 'PHONE';
    e.ncPhoneTabs.hidden = !phone;

    e.ncUse.textContent = phone
      ? 'CONFIRM'
      : driving
        ? 'EXIT'
        : game.player.target?.type === 'vehicle'
          ? 'ENTER'
          : 'USE';

    // Keep the physical phone within the portrait camera view.
    const portrait = innerHeight > innerWidth;

    game.player.phoneGroup.position.x = portrait ? 0.03 : 0.27;
    game.player.phoneGroup.position.z = portrait ? -0.7 : -0.59;
  }
}
