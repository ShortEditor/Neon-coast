export class MobileControls {
  static supported() {
    return (
      navigator.maxTouchPoints > 0 &&
      (
        window.matchMedia('(pointer: coarse)').matches ||
        window.matchMedia('(any-pointer: coarse)').matches
      )
    );
  }

  static applyDefaults(settings) {
    // Apply the mobile preset once, then preserve later settings changes.
    const key = 'neon-coast-touch-preset-v1';
    let firstRun = true;

    try {
      firstRun = !localStorage.getItem(key);
    } catch {}

    if (!firstRun) return;

    settings.quality = 'low';
    settings.reducedMotion = true;

    try {
      localStorage.setItem(key, '1');
    } catch {}
  }

  constructor(game) {
    this.game = game;
    this.enabled = game.touchDevice;

    this.sources = new Map();
    this.heldKeys = new Set();
    this.cancellers = [];

    this.lastScreen = '';
    this.lastVehicleMode = null;
    this.wasRunning = false;

    if (!this.enabled) return;

    document.documentElement.classList.add('nc-mobile');

    this.installStyles();
    this.buildControls();
    this.bindControls();

    window.addEventListener('blur', () => this.reset());
    window.addEventListener('resize', () => this.reset());

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
  }

  installStyles() {
    const style = document.createElement('style');

    style.textContent = `
      html.nc-mobile,
      html.nc-mobile body {
        overscroll-behavior: none;
      }

      .nc-mobile #game {
        touch-action: none;
      }

      .nc-mobile #overlay {
        touch-action: pan-y;
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

        --nc-bottom: env(safe-area-inset-bottom, 0px);
        --nc-left: env(safe-area-inset-left, 0px);
        --nc-right: env(safe-area-inset-right, 0px);
        --nc-top: env(safe-area-inset-top, 0px);
        --nc-stick: clamp(112px, 24vmin, 148px);
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

      #ncLook {
        position: absolute;
        left: 40%;
        right: 0;
        top: 0;
        bottom: 0;
      }

      #ncTouch button {
        min-width: 46px;
        min-height: 46px;
        padding: 5px;
        border: 1px solid #b5e8d36b;
        border-radius: 12px;
        background: #0b1c30a8;
        color: #edf8f0;
        font: 600 11px system-ui, sans-serif;
        box-shadow: 0 3px 12px #0003;
        text-shadow: 0 1px 3px #000;
      }

      #ncTouch button.down {
        background: #82cdb68c;
        border-color: #dcfff0;
        color: white;
      }

      #ncStick {
        position: absolute;
        left: calc(18px + var(--nc-left));
        bottom: calc(24px + var(--nc-bottom));
        width: var(--nc-stick);
        height: var(--nc-stick);
        border-radius: 50%;
        border: 1px solid #bddfcf73;
        background:
          radial-gradient(circle, #b5e8d30a 30%, #112b4266 70%);
        box-shadow: inset 0 0 25px #0003;
      }

      #ncStick::before,
      #ncStick::after {
        content: '';
        position: absolute;
        pointer-events: none;
        background: #c0e5d41f;
      }

      #ncStick::before {
        left: 50%;
        top: 13%;
        width: 1px;
        height: 74%;
      }

      #ncStick::after {
        top: 50%;
        left: 13%;
        height: 1px;
        width: 74%;
      }

      #ncKnob {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 46px;
        height: 46px;
        transform: translate(-50%, -50%);
        border-radius: 50%;
        border: 1px solid #d4fbe3b3;
        background: #a7dbc559;
        box-shadow: 0 3px 12px #0003;
        pointer-events: none;
      }

      #ncStickLabel {
        position: absolute;
        bottom: 8px;
        left: 0;
        right: 0;
        color: #e0f4e7b0;
        font: 9px system-ui, sans-serif;
        letter-spacing: .16em;
        text-align: center;
        pointer-events: none;
      }

      #ncToolbar {
        position: absolute;
        top: calc(74px + var(--nc-top));
        right: calc(12px + var(--nc-right));
        display: flex;
        gap: 7px;
      }

      #ncToolbar button {
        min-width: 48px;
        min-height: 44px;
      }

      #ncPhoneTabs {
        position: absolute;
        top: calc(126px + var(--nc-top));
        right: calc(12px + var(--nc-right));
        display: grid;
        grid-template-columns: repeat(4, 43px);
        gap: 5px;
      }

      #ncPhoneTabs button {
        min-width: 43px;
        min-height: 42px;
        font-size: 9px;
      }

      #ncActions {
        position: absolute;
        right: calc(14px + var(--nc-right));
        bottom: calc(88px + var(--nc-bottom));
        display: grid;
        grid-template-columns: repeat(3, 52px);
        gap: 8px;
      }

      #ncActions button {
        height: 52px;
      }

      #ncUse {
        position: absolute;
        right: calc(14px + var(--nc-right));
        bottom: calc(20px + var(--nc-bottom));
        width: 112px;
        height: 56px;
        border-color: #e7a3bd !important;
        background: #55374fa8 !important;
        font-size: 14px !important;
      }

      #ncUse.down {
        background: #a66589bd !important;
      }

      #ncPedals {
        position: absolute;
        right: calc(143px + var(--nc-right));
        bottom: calc(14px + var(--nc-bottom));
        display: flex;
        gap: 9px;
      }

      #ncPedals button {
        width: 65px;
        height: 65px;
      }

      #ncGas {
        border-color: #a5eacb !important;
        background: #214e419c !important;
      }

      #ncBrake {
        border-color: #e5b0bf !important;
      }

      .nc-mobile #brand {
        top: calc(12px + env(safe-area-inset-top, 0px));
        left: calc(12px + env(safe-area-inset-left, 0px));
        font-size: 8px;
        letter-spacing: .12em;
      }

      .nc-mobile #objective {
        top: calc(36px + env(safe-area-inset-top, 0px));
        left: calc(12px + env(safe-area-inset-left, 0px));
        right: calc(180px + env(safe-area-inset-right, 0px));
        max-width: 390px;
        max-height: 100px;
        overflow: hidden;
        padding: 7px 9px;
        font-size: 10px;
        line-height: 1.4;
      }

      .nc-mobile #heat {
        top: calc(10px + env(safe-area-inset-top, 0px));
        right: calc(12px + env(safe-area-inset-right, 0px));
        font-size: 18px;
        letter-spacing: 4px;
      }

      .nc-mobile #clock {
        top: calc(36px + env(safe-area-inset-top, 0px));
        right: calc(12px + env(safe-area-inset-right, 0px));
        font-size: 8px;
      }

      .nc-mobile #mini {
        width: 76px;
        height: 76px;
        left: calc(12px + env(safe-area-inset-left, 0px));
        bottom: calc(164px + env(safe-area-inset-bottom, 0px));
      }

      .nc-mobile #stats {
        left: calc(98px + env(safe-area-inset-left, 0px));
        bottom: calc(164px + env(safe-area-inset-bottom, 0px));
        font-size: 8px;
      }

      .nc-mobile #stats .bar {
        width: 76px;
        height: 4px;
        margin: 4px 0 8px;
      }

      .nc-mobile #speed {
        right: calc(14px + env(safe-area-inset-right, 0px));
        bottom: calc(151px + env(safe-area-inset-bottom, 0px));
        font-size: 26px;
      }

      .nc-mobile #radio {
        display: none;
      }

      .nc-mobile #prompt {
        bottom: calc(152px + env(safe-area-inset-bottom, 0px));
        max-width: calc(100% - 360px);
        padding: 6px 8px;
        font-size: 10px;
      }

      .nc-mobile #toast {
        top: 20%;
        padding: 9px 12px;
        font-size: 11px;
        max-width: 80vw;
      }

      .nc-mobile .panel {
        max-height: 92dvh;
        padding: 20px;
        -webkit-overflow-scrolling: touch;
      }

      .nc-mobile .panel h1 {
        font-size: clamp(30px, 8vw, 56px);
      }

      .nc-mobile .panel button {
        min-height: 46px;
      }

      .nc-mobile .setting {
        gap: 12px;
      }

      .nc-mobile .setting input[type="range"] {
        max-width: 45%;
      }

      @media (orientation: portrait) {
        .nc-mobile #objective {
          right: 140px;
          max-height: 126px;
        }

        #ncPedals {
          right: calc(14px + var(--nc-right));
          bottom: calc(162px + var(--nc-bottom));
        }

        .nc-mobile #speed {
          top: calc(177px + env(safe-area-inset-top, 0px));
          bottom: auto;
        }

        .nc-mobile #prompt {
          bottom: calc(260px + env(safe-area-inset-bottom, 0px));
          max-width: calc(100% - 28px);
        }

        .nc-mobile #chapter {
          left: 6%;
          max-width: 88%;
        }

        .nc-mobile #chapter strong {
          font-size: 28px;
        }
      }

      @media (max-height: 350px) and (orientation: landscape) {
        .nc-mobile #mini {
          display: none;
        }

        .nc-mobile #stats {
          left: 12px;
          bottom: 154px;
        }

        .nc-mobile #objective {
          left: 112px;
          max-height: 65px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  buildControls() {
    const root = this.root = document.createElement('div');
    root.id = 'ncTouch';
    root.hidden = true;

    root.innerHTML = `
      <div id="ncLook" aria-label="Swipe to look"></div>

      <div id="ncStick" role="group" aria-label="Movement joystick">
        <div id="ncKnob"></div>
        <span id="ncStickLabel">MOVE</span>
      </div>

      <div id="ncToolbar">
        <button type="button" id="ncPhone">Phone</button>
        <button type="button" id="ncMap">Map</button>
        <button type="button" id="ncPause">Pause</button>
      </div>

      <div id="ncPhoneTabs" hidden>
        <button type="button" data-tab="1">Jobs</button>
        <button type="button" data-tab="2">Map</button>
        <button type="button" data-tab="3">People</button>
        <button type="button" data-tab="4">System</button>
      </div>

      <div id="ncActions">
        <button type="button" id="ncRun">Run</button>
        <button type="button" id="ncJump">Jump</button>
        <button type="button" id="ncCrouch">Crouch</button>
      </div>

      <div id="ncPedals" hidden>
        <button type="button" id="ncBrake">Brake<br>Reverse</button>
        <button type="button" id="ncGas">Gas</button>
      </div>

      <button type="button" id="ncUse">Use</button>
    `;

    root.addEventListener('contextmenu', event => {
      event.preventDefault();
    });

    document.body.appendChild(root);

    this.elements = {};

    for (const element of root.querySelectorAll('[id]')) {
      this.elements[element.id] = element;
    }
  }

  consume(event) {
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
  }

  /*
    Each control captures its own pointer.

    This allows movement, camera dragging, and a held action button
    to work simultaneously with separate fingers.
  */
  track(element, handlers) {
    let pointer = null;

    const finish = () => {
      if (pointer === null) return;

      const previous = pointer;
      pointer = null;

      element.classList.remove('down');
      handlers.end?.();

      try {
        if (element.hasPointerCapture(previous)) {
          element.releasePointerCapture(previous);
        }
      } catch {}
    };

    element.addEventListener('pointerdown', event => {
      if (
        !this.game.running ||
        pointer !== null ||
        event.button !== 0
      ) {
        return;
      }

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

    this.cancellers.push(finish);
  }

  setKeys(source, codes) {
    if (codes.length) {
      this.sources.set(source, codes);
    } else {
      this.sources.delete(source);
    }

    const next = new Set();

    for (const keys of this.sources.values()) {
      for (const key of keys) next.add(key);
    }

    for (const key of this.heldKeys) {
      if (!next.has(key)) this.game.input.keys.delete(key);
    }

    for (const key of next) {
      this.game.input.keys.add(key);
    }

    this.heldKeys = next;
  }

  pulse(code) {
    if (this.game.running) {
      this.game.input.pressed.add(code);
    }
  }

  bindButton(element, getAction) {
    const source = `touch-button:${element.id || element.dataset.tab}`;

    this.track(element, {
      start: () => {
        const action = getAction();

        if (action.hold) {
          this.setKeys(source, [action.key]);
        } else if (action.key) {
          this.pulse(action.key);
        }

        action.run?.();
      },

      end: () => this.setKeys(source, [])
    });
  }

  bindControls() {
    const elements = this.elements;
    const game = this.game;

    this.bindButton(elements.ncPhone, () => ({ key: 'KeyP' }));
    this.bindButton(elements.ncMap, () => ({ key: 'KeyM' }));
    this.bindButton(elements.ncUse, () => ({ key: 'KeyE' }));

    this.bindButton(elements.ncPause, () => ({
      run: () => game.ui.pauseMenu()
    }));

    this.bindButton(elements.ncRun, () => ({
      key: 'ShiftLeft',
      hold: true
    }));

    this.bindButton(elements.ncJump, () => ({
      key: 'Space'
    }));

    this.bindButton(elements.ncCrouch, () => (
      game.player.vehicle
        ? { key: 'KeyH' }
        : { key: 'KeyC', hold: true }
    ));

    this.bindButton(elements.ncGas, () => ({
      key: 'KeyW',
      hold: true
    }));

    this.bindButton(elements.ncBrake, () => ({
      key: 'KeyS',
      hold: true
    }));

    for (const button of elements.ncPhoneTabs.querySelectorAll('button')) {
      this.bindButton(button, () => ({
        key: `Digit${button.dataset.tab}`
      }));
    }

    const moveStick = event => {
      const rect = elements.ncStick.getBoundingClientRect();
      const radius = rect.width * 0.34;

      let dx = event.clientX - rect.left - rect.width / 2;
      let dy = event.clientY - rect.top - rect.height / 2;

      const length = Math.hypot(dx, dy);

      if (length > radius) {
        dx *= radius / length;
        dy *= radius / length;
      }

      elements.ncKnob.style.transform =
        `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;

      const x = dx / radius;
      const y = dy / radius;
      const deadzone = 0.28;

      const keys = [];

      if (x < -deadzone) keys.push('KeyA');
      if (x > deadzone) keys.push('KeyD');

      // In a vehicle, the stick steers; pedals control acceleration.
      if (!game.player.vehicle) {
        if (y < -deadzone) keys.push('KeyW');
        if (y > deadzone) keys.push('KeyS');
      }

      this.setKeys('touch-stick', keys);
    };

    this.track(elements.ncStick, {
      start: moveStick,
      move: moveStick,

      end: () => {
        this.setKeys('touch-stick', []);
        elements.ncKnob.style.transform = 'translate(-50%, -50%)';
      }
    });

    let previousX = 0;
    let previousY = 0;

    this.track(elements.ncLook, {
      start: event => {
        previousX = event.clientX;
        previousY = event.clientY;
      },

      move: event => {
        const dx = Math.max(
          -90,
          Math.min(90, event.clientX - previousX)
        );

        const dy = Math.max(
          -90,
          Math.min(90, event.clientY - previousY)
        );

        previousX = event.clientX;
        previousY = event.clientY;

        game.player.look(dx * 1.75, dy * 1.5);
      }
    });
  }

  reset() {
    if (!this.enabled) return;

    for (const cancel of this.cancellers) cancel();

    this.sources.clear();

    for (const key of this.heldKeys) {
      this.game.input.keys.delete(key);
    }

    this.heldKeys.clear();
  }

  updateMenuHelp() {
    const screen = this.game.ui.screen;

    if (screen === this.lastScreen) return;
    this.lastScreen = screen;

    if (screen === 'main') {
      document.getElementById('menuFoot').textContent =
        'Touch controls enabled. Landscape recommended. ' +
        'Left stick moves; swipe the right side to look. ' +
        'Mobile graphics start on Low.';
    }

    if (screen === 'controls') {
      const help = document.createElement('p');

      help.innerHTML = `
        <b>TOUCH CONTROLS</b><br>
        Left stick: move or steer.<br>
        Swipe an empty area on the right: look.<br>
        Hold Run or Crouch; tap Jump or Use.<br>
        Driving: hold Gas or Brake/Reverse.
        Run becomes Handbrake, Jump becomes Horn,
        and Crouch becomes Lights.<br>
        Open Phone, choose an app, then tap Confirm to accept a job.
        Save and load are available from Pause.
      `;

      document.getElementById('menuBody').prepend(help);
    }
  }

  update() {
    if (!this.enabled) return;

    const game = this.game;
    const elements = this.elements;

    this.updateMenuHelp();

    const running = game.running;
    this.root.hidden = !running;

    if (!running) {
      if (this.wasRunning) this.reset();
      this.wasRunning = false;
      return;
    }

    this.wasRunning = true;

    const vehicleMode = !!game.player.vehicle;

    if (vehicleMode !== this.lastVehicleMode) {
      this.reset();
      this.lastVehicleMode = vehicleMode;

      elements.ncStickLabel.textContent = vehicleMode ? 'STEER' : 'MOVE';
      elements.ncRun.textContent = vehicleMode ? 'Handbrake' : 'Run';
      elements.ncJump.textContent = vehicleMode ? 'Horn' : 'Jump';
      elements.ncCrouch.textContent = vehicleMode ? 'Lights' : 'Crouch';

      elements.ncPedals.hidden = !vehicleMode;
    }

    const phoneOpen = game.player.phone;
    elements.ncPhoneTabs.hidden = !phoneOpen;
    elements.ncPhone.textContent = phoneOpen ? 'Close' : 'Phone';

    elements.ncUse.textContent = phoneOpen
      ? 'Confirm'
      : vehicleMode
        ? 'Exit'
        : game.player.target?.type === 'vehicle'
          ? 'Enter'
          : 'Use';

    // Keep the physical phone inside the narrower portrait camera view.
    const portrait = innerHeight > innerWidth;

    game.player.phoneGroup.position.x = portrait ? 0.03 : 0.27;
    game.player.phoneGroup.position.z = portrait ? -0.7 : -0.59;
  }
}
