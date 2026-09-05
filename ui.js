import * as THREE from 'three';
import { ROADS, clamp, distance } from './world.js';

const $ = id => document.getElementById(id);

const escapeHTML = value =>
  String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));

const money = amount => Math.round(amount).toLocaleString('en-US');

function duration(seconds) {
  seconds = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function clock(hours) {
  const total = Math.floor((((hours % 24) + 24) % 24) * 60);
  return (
    `${String(Math.floor(total / 60)).padStart(2, '0')}:` +
    `${String(total % 60).padStart(2, '0')}`
  );
}

function wrap(ctx, text, x, y, width, lineHeight) {
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > width && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.screen = 'main';
    this.toastTimer = 0;
    this.damageTimer = 0;
    this.chapterTimer = 0;
    this.mapTimer = 0;
    this.miniContext = $('mini').getContext('2d');
    this.mapContext = $('map').getContext('2d');
    $('objective').style.whiteSpace = 'pre-line';
    $('clock').style.whiteSpace = 'pre-line';
    this.position = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.relative = new THREE.Vector3();
  }

  menu(screen, title, body, buttons, foot = '') {
    this.game.pause();
    this.screen = screen;
    $('overlay').style.display = 'flex';
    $('menuTitle').textContent = title;
    $('menuBody').innerHTML = body;
    $('menuFoot').textContent = foot;
    $('map').style.display = 'none';

    const container = $('buttons');
    container.replaceChildren();
    for (const entry of buttons) {
      const button = document.createElement('button');
      button.textContent = entry.label;
      button.disabled = !!entry.disabled;
      button.addEventListener('click', entry.action);
      container.appendChild(button);
    }
  }

  hide() {
    this.screen = 'game';
    $('overlay').style.display = 'none';
    $('hud').style.display = 'block';
  }

  mainMenu() {
    const saved = this.game.save.read();
    this.menu(
      'main',
      'AFTER THE FLOOD',
      `
      <p>A courier job. A missing warning. A coast that remembers.</p>
      <p>
        Explore an original coastal city on foot or behind the wheel.
        Complete four connected jobs, escape patrols, and decide who
        gets the truth.
      </p>
      <p class="muted">
        Procedural scenery, simplified traffic and physics.
        Best played on a desktop with a keyboard and mouse.
      </p>
      `,
      [
        {
          label: 'New story',
          action: () => this.game.newGame()
        },
        {
          label: 'Continue saved game',
          disabled: !saved,
          action: () => this.game.loadSaved()
        },
        {
          label: 'Settings',
          action: () => this.settingsMenu(() => this.mainMenu())
        },
        {
          label: 'Controls',
          action: () => this.controlsMenu(() => this.mainMenu())
        }
      ],
      'Click Play, then allow mouse capture. If capture is unavailable, hold the left mouse button to look.'
    );
  }

  pauseMenu() {
    this.menu(
      'pause',
      'PAUSED',
      `<p>${escapeHTML(this.game.missions.objective(this.game))}</p>`,
      [
        {
          label: 'Resume',
          action: () => this.game.resume()
        },
        {
          label: 'City map',
          action: () => this.mapMenu()
        },
        {
          label: 'Settings',
          action: () => this.settingsMenu(() => this.pauseMenu())
        },
        {
          label: 'Save game',
          action: () => {
            this.game.saveManual();
            $('menuFoot').textContent =
              'Save requested. Check the notification above.';
          }
        },
        {
          label: 'Load saved game',
          disabled: !this.game.save.read(),
          action: () => this.confirmLoad()
        },
        {
          label: 'Restore checkpoint',
          disabled: !this.game.checkpointState,
          action: () => this.game.retry()
        },
        {
          label: 'Controls',
          action: () => this.controlsMenu(() => this.pauseMenu())
        }
      ],
      'Esc resumes. F6 saves. F9 loads. Checkpoints are saved after mission progress.'
    );
  }

  controlsMenu(back) {
    this.menu(
      'controls',
      'CONTROLS',
      `
      <p>
        <b>On foot:</b> WASD move · Mouse look · Shift sprint ·
        Space jump · Hold C crouch · E interact
      </p>
      <p>
        <b>Driving:</b> W accelerate · S brake/reverse · A/D steer ·
        Shift handbrake · Space horn · H headlights · E exit
      </p>
      <p>
        <b>Phone:</b> P open/close · 1–4 switch apps · E accept the next job
        or review the current objective
      </p>
      <p>
        <b>Interface:</b> M or Tab city map · Esc pause · R radio ·
        F6 save · F9 load
      </p>
      <p class="muted">
        Look toward nearby doors, vehicles, people, and terminals to interact.
        Stop below 18 km/h before leaving a vehicle.
        Mission arrivals require a near-complete stop.
        Patrol Heat fades after you stay out of sight.
      </p>
      `,
      [{ label: 'Back', action: back }]
    );
  }

  settingsMenu(back) {
    const game = this.game;
    const settings = game.settings;
    this.menu(
      'settings',
      'SETTINGS',
      `
      <label class="setting">
        Graphics quality
        <select id="qualitySetting">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <label class="setting">
        Field of view <output id="fovValue"></output>
        <input id="fovSetting" type="range" min="60" max="100" step="1">
      </label>
      <label class="setting">
        Look sensitivity <output id="sensitivityValue"></output>
        <input id="sensitivitySetting" type="range"
          min="0.3" max="2.5" step="0.05">
      </label>
      <label class="setting">
        Audio volume <output id="volumeValue"></output>
        <input id="volumeSetting" type="range" min="0" max="1" step="0.01">
      </label>
      <label class="setting">
        Reduced camera motion
        <input id="motionSetting" type="checkbox">
      </label>
      <label class="setting">
        In-car radio
        <input id="radioSetting" type="checkbox">
      </label>
      ${
        game.started
          ? `
      <label class="setting">
        Weather
        <select id="weatherSetting">
          <option value="0">Clear</option>
          <option value="1">Overcast</option>
          <option value="2">Rain</option>
        </select>
      </label>
      `
          : ''
      }
      `,
      [{ label: 'Back', action: back }],
      'Settings are stored on this browser. Weather transitions gradually.'
    );

    $('qualitySetting').value = settings.quality;
    $('fovSetting').value = settings.fov;
    $('sensitivitySetting').value = settings.sensitivity;
    $('volumeSetting').value = settings.volume;
    $('motionSetting').checked = settings.reducedMotion;
    $('radioSetting').checked = game.sound.radio;

    const refresh = () => {
      $('fovValue').textContent = `${Math.round(game.settings.fov)}°`;
      $('sensitivityValue').textContent = `${game.settings.sensitivity.toFixed(2)}×`;
      $('volumeValue').textContent = `${Math.round(game.settings.volume * 100)}%`;
    };

    $('qualitySetting').onchange = event => {
      game.settings.quality = event.target.value;
      game.applySettings();
    };

    for (const [id, key] of [
      ['fovSetting', 'fov'],
      ['sensitivitySetting', 'sensitivity'],
      ['volumeSetting', 'volume']
    ]) {
      $(id).oninput = event => {
        game.settings[key] = Number(event.target.value);
        game.applySettings();
        refresh();
      };
    }

    $('motionSetting').onchange = event => {
      game.settings.reducedMotion = event.target.checked;
      game.applySettings();
    };

    $('radioSetting').onchange = event => {
      game.sound.radio = event.target.checked;
      game.settings.radio = event.target.checked;
      game.applySettings();
    };

    if (game.started) {
      $('weatherSetting').value = game.weather.kind;
      $('weatherSetting').onchange = event => {
        game.weather.kind = Number(event.target.value);
        game.weather.timer = 180;
      };
    }

    refresh();
  }

  mapMenu() {
    this.menu(
      'map',
      'CITY MAP',
      '<p class="muted">North is up. Mint: destination. Pink: you. Blue: patrol.</p>',
      [
        {
          label: 'Resume',
          action: () => this.game.resume()
        },
        {
          label: 'Pause menu',
          action: () => this.pauseMenu()
        }
      ],
      'The dashed line is a destination guide, not a road-by-road route.'
    );
    $('map').style.display = 'block';
    this.drawMap(this.mapContext, this.game, 760, 560, false);
  }

  choice(title, body, choices) {
    this.menu(
      'choice',
      title,
      `<p>${escapeHTML(body)}</p>` +
        choices
          .map(
            choice =>
              `<p class="muted"><b>${escapeHTML(choice.label)}</b><br>` +
              `${escapeHTML(choice.description)}</p>`
          )
          .join(''),
      choices.map(choice => ({
        label: choice.label,
        action: () => {
          choice.action();
          if (this.screen === 'choice') this.game.resume();
        }
      })),
      'The mission timer is paused while you decide. Your choice is checkpointed.'
    );
  }

  confirmLoad() {
    this.menu(
      'confirm',
      'LOAD SAVED GAME?',
      '<p>Progress since the last save will be replaced.</p>',
      [
        {
          label: 'Load save',
          action: () => this.game.loadSaved()
        },
        {
          label: 'Cancel',
          action: () => this.pauseMenu()
        }
      ]
    );
  }

  failure(reason) {
    this.menu(
      'failure',
      'THE COAST DOES NOT FORGET',
      `<p>${escapeHTML(reason)}</p>`,
      [
        {
          label: 'Restore checkpoint',
          disabled: !this.game.checkpointState,
          action: () => this.game.retry()
        },
        {
          label: 'Load saved game',
          disabled: !this.game.save.read(),
          action: () => this.game.loadSaved()
        },
        {
          label: 'New story',
          action: () => this.game.newGame()
        }
      ],
      'A checkpoint is created at the beginning of each job and after completed steps.'
    );
  }

  ending(ending) {
    const missions = this.game.missions;
    this.menu(
      'ending',
      ending.title,
      `
      <p>${escapeHTML(ending.text)}</p>
      <p class="muted">
        Jobs completed: ${missions.results.length}/4<br>
        Community trust: ${missions.support}<br>
        Cash: $${money(this.game.player.cash)}
      </p>
      <p>
        The coast remains open. You can keep exploring, change vehicles,
        visit services, and return for another ending.
      </p>
      `,
      [
        {
          label: 'Continue free roam',
          action: () => this.game.resume()
        },
        {
          label: 'Start another story',
          action: () => this.game.newGame()
        }
      ],
      'NEON COAST — original procedural browser game'
    );
  }

  toast(text, seconds = 5) {
    $('toast').textContent = text;
    $('toast').style.display = 'block';
    this.toastTimer = seconds;
  }

  chapter(title, subtitle) {
    const element = $('chapter');
    element.querySelector('strong').textContent = title;
    element.querySelector('span').textContent = subtitle;
    element.style.opacity = '1';
    const height = this.game.settings.reducedMotion ? '0' : '6vh';
    $('topbar').style.height = height;
    $('bottombar').style.height = height;
    this.chapterTimer = 5;
  }

  clearEffects() {
    this.toastTimer = 0;
    this.damageTimer = 0;
    this.chapterTimer = 0;
    $('toast').style.display = 'none';
    $('chapter').style.opacity = '0';
    $('damage').style.opacity = '0';
    $('topbar').style.height = '0';
    $('bottombar').style.height = '0';
  }

  update(dt) {
    const game = this.game;
    if (!game.started) return;

    const player = game.player;
    const missions = game.missions;
    const vehicle = player.vehicle;
    const job = missions.job();

    $('objective').textContent =
      (missions.active && job
        ? `${job.title} · ${duration(missions.timeLeft)}\n`
        : '') + missions.objective(game);

    $('health').style.width = `${clamp(player.health, 0, 100)}%`;
    $('stamina').style.width = `${clamp(player.stamina, 0, 100)}%`;
    $('cash').textContent = `$${money(player.cash)}`;

    const stars = Math.ceil(game.actors.heat);
    $('heat').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);

    let status =
      game.actors.heat > 0
        ? game.actors.detected
          ? 'PATROL HAS VISUAL'
          : 'HIDING FROM PATROL'
        : 'COASTAL DISTRICT';

    if (game.actors.bust > 0) {
      status = `DETENTION IN ${Math.max(0, 7 - game.actors.bust).toFixed(1)}s`;
    }

    $('clock').textContent =
      `${clock(game.time.hours)} / ${game.weather.names[game.weather.kind]}\n${status}`;

    $('speed').innerHTML = vehicle
      ? `${Math.round(Math.abs(vehicle.speed) * 3.6)} <small>KM/H</small>`
      : '';

    $('radio').innerHTML = vehicle
      ? `${game.sound.radio ? 'PALM STATIC / 103.8' : 'RADIO OFF'}<br>` +
        `${vehicle.type.toUpperCase()} · CONDITION ${Math.round(vehicle.health)}%`
      : '';

    $('reticle').style.display = vehicle ? 'none' : 'block';

    let prompt = '';
    if (player.phone) {
      prompt =
        '[1–4] Phone apps · [P] Close · [E] ' +
        (!missions.active && !missions.finished
          ? 'Accept next job'
          : 'Review objective');
    } else if (player.target) {
      prompt = `[E] ${player.target.label}`;
    }
    $('prompt').textContent = prompt;
    $('prompt').style.display = prompt ? 'block' : 'none';

    this.updateMarker();

    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.1;
      this.drawMap(this.miniContext, game, 328, 328, true);
    }

    this.toastTimer = Math.max(0, this.toastTimer - dt);
    if (this.toastTimer === 0) $('toast').style.display = 'none';

    this.damageTimer = Math.max(0, this.damageTimer - dt);
    $('damage').style.opacity = Math.min(0.65, this.damageTimer * 1.8);

    this.chapterTimer = Math.max(0, this.chapterTimer - dt);
    if (this.chapterTimer === 0) {
      $('chapter').style.opacity = '0';
      $('topbar').style.height = '0';
      $('bottombar').style.height = '0';
    }
  }

  updateMarker() {
    const game = this.game;
    const goal = game.missions.target(game);
    const marker = $('marker');
    if (!goal) {
      marker.style.display = 'none';
      return;
    }

    this.position.set(goal.x, (goal.y || 0) + 2.8, goal.z);
    this.relative.copy(this.position).sub(game.camera.position);
    game.camera.getWorldDirection(this.direction);

    if (this.relative.dot(this.direction) <= 0) {
      marker.style.display = 'none';
      return;
    }

    this.position.project(game.camera);
    const visible =
      this.position.z >= -1 &&
      this.position.z <= 1 &&
      Math.abs(this.position.x) < 0.96 &&
      Math.abs(this.position.y) < 0.9;

    marker.style.display = visible ? 'block' : 'none';
    if (visible) {
      marker.style.left = `${(this.position.x * 0.5 + 0.5) * innerWidth}px`;
      marker.style.top = `${(-this.position.y * 0.5 + 0.5) * innerHeight}px`;
      marker.innerHTML = `<b>◇</b>${Math.round(distance(goal, game.player))} m`;
    }
  }

  drawMap(ctx, game, width, height, mini) {
    const player = game.player;
    const centerX = mini ? player.x : 10;
    const centerZ = mini ? player.z : 0;
    const scale = mini
      ? width / 115
      : Math.min(width / 370, height / 342);

    const x = value => width / 2 + (value - centerX) * scale;
    const z = value => height / 2 + (value - centerZ) * scale;

    ctx.save();
    ctx.beginPath();
    if (mini) ctx.arc(width / 2, height / 2, width / 2, 0, Math.PI * 2);
    else ctx.rect(0, 0, width, height);
    ctx.clip();

    ctx.fillStyle = '#173744';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#172b30';
    ctx.fillRect(x(-154), z(-154), 330 * scale, 308 * scale);

    ctx.fillStyle = '#6f6850';
    ctx.fillRect(x(151), z(-154), 27 * scale, 308 * scale);

    ctx.fillStyle = '#294638';
    ctx.fillRect(x(-112), z(68), 44 * scale, 44 * scale);

    ctx.strokeStyle = '#41545a';
    ctx.lineWidth = 14 * scale;
    for (const road of [...ROADS, -145, 145]) {
      ctx.beginPath();
      ctx.moveTo(x(road), z(-153));
      ctx.lineTo(x(road), z(153));
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x(-153), z(road));
      ctx.lineTo(x(153), z(road));
      ctx.stroke();
    }

    ctx.fillStyle = '#8b8088';
    for (const building of game.world.mapBuildings) {
      ctx.fillRect(
        x(building.x - building.w / 2),
        z(building.z - building.d / 2),
        building.w * scale,
        building.d * scale
      );
    }

    const goal = game.missions.target(game);
    if (goal) {
      ctx.strokeStyle = '#b5e8d388';
      ctx.lineWidth = mini ? 2 : 2.5;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(x(player.x), z(player.z));
      ctx.lineTo(x(goal.x), z(goal.z));
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = '#b5e8d3';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x(goal.x), z(goal.z), mini ? 8 : 9, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const vehicle of game.actors.vehicles) {
      if (mini && distance(vehicle, player) > 85) continue;
      ctx.fillStyle =
        vehicle.type === 'police'
          ? '#83baff'
          : vehicle === game.actors.delivery || vehicle === game.actors.taxi
            ? '#e4cc8e'
            : '#d1d0bc';

      const radius = mini ? 2.5 : 2.8;
      ctx.fillRect(
        x(vehicle.x) - radius,
        z(vehicle.z) - radius,
        radius * 2,
        radius * 2
      );
    }

    ctx.save();
    ctx.translate(x(player.x), z(player.z));
    ctx.rotate(-player.viewYaw);
    ctx.fillStyle = '#f0a7c2';
    ctx.strokeStyle = '#172330';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(-6, -6);
    ctx.lineTo(0, -3);
    ctx.lineTo(6, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (!mini) {
      ctx.font = `${width < 500 ? 10 : 12}px system-ui`;
      ctx.fillStyle = '#e3e6d7';
      ctx.textAlign = 'center';
      for (const [name, xx, zz] of [
        ['MARLIN EXCHANGE', 90, -108],
        ['SOL TERRACE', -90, 13],
        ['PALOMA PARK', -90, 118],
        ['TIDAL FUEL', 90, 73],
        ['EAST DOCKS', 90, -49],
        ['BOULEVARD', 0, 137]
      ]) {
        ctx.fillText(name, x(xx), z(zz));
      }
    }

    ctx.fillStyle = '#d3e9df';
    ctx.font = `${mini ? 18 : 16}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('N', width / 2, mini ? 27 : 24);

    ctx.restore();
  }

  drawPhone(ctx, game) {
    const width = 360;
    const height = 640;
    const tab = game.player.phoneTab;

    ctx.fillStyle = '#0c1b28';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#b5e8d3';
    ctx.font = 'bold 22px system-ui';
    ctx.fillText('COASTLINE', 22, 36);

    ctx.textAlign = 'right';
    ctx.font = '18px system-ui';
    ctx.fillText(clock(game.time.hours), width - 22, 35);
    ctx.textAlign = 'left';

    const tabs = ['JOBS', 'MAP', 'CONTACTS', 'SYSTEM'];
    for (let i = 0; i < tabs.length; i++) {
      ctx.fillStyle = i === tab ? '#b5e8d3' : '#6f8a97';
      ctx.fillRect(12 + i * 86, 55, 80, 3);
      ctx.font = 'bold 11px system-ui';
      ctx.fillText(`${i + 1} ${tabs[i]}`, 17 + i * 86, 78);
    }

    ctx.fillStyle = '#e5e9df';

    if (tab === 0) {
      const job = game.missions.job();
      ctx.font = 'bold 21px system-ui';
      let y = wrap(
        ctx,
        job?.title || 'THE COAST IS YOURS',
        22,
        120,
        316,
        29
      );
      ctx.font = '18px system-ui';
      y = wrap(ctx, game.missions.objective(game), 22, y + 24, 316, 27);

      if (job) {
        ctx.fillStyle = '#a6bac1';
        ctx.font = '16px system-ui';
        y = wrap(
          ctx,
          game.missions.active
            ? `Time remaining: ${duration(game.missions.timeLeft)}`
            : job.briefing,
          22,
          y + 26,
          316,
          25
        );
        ctx.fillStyle = '#e6c5a0';
        ctx.fillText(`Payment: $${money(job.reward)}`, 22, Math.min(y + 25, 540));
      }
    }

    if (tab === 1) {
      ctx.save();
      ctx.translate(12, 105);
      this.drawMap(ctx, game, 336, 405, false);
      ctx.restore();
      ctx.fillStyle = '#a6bac1';
      ctx.font = '17px system-ui';
      ctx.fillText('M opens the full city map.', 22, 548);
    }

    if (tab === 2) {
      ctx.font = 'bold 22px system-ui';
      ctx.fillText('INEZ / DISPATCH', 22, 126);
      ctx.font = '18px system-ui';
      wrap(
        ctx,
        game.missions.finished
          ? 'You made your choice. The coast will remember it.'
          : 'Keep moving. Keep the engine running. Call when you are ready for the next job.',
        22,
        163,
        316,
        29
      );

      ctx.fillStyle = '#e7b5c7';
      ctx.font = 'bold 20px system-ui';
      ctx.fillText('NELL / MAINTENANCE', 22, 332);
      ctx.fillStyle = '#d7e0db';
      ctx.font = '18px system-ui';
      wrap(
        ctx,
        game.missions.support >= 3
          ? 'People are answering the relay. That means more than you know.'
          : 'The flood line is not a theory. Look at the buildings.',
        22,
        369,
        316,
        29
      );
    }

    if (tab === 3) {
      ctx.font = 'bold 23px system-ui';
      ctx.fillText('SESSION', 22, 128);
      ctx.font = '19px system-ui';
      const lines = [
        `Funds: $${money(game.player.cash)}`,
        `Health: ${Math.round(game.player.health)}%`,
        `Community trust: ${game.missions.support}`,
        `Jobs completed: ${game.missions.results.length}/4`,
        '',
        'F6 — Save game',
        'F9 — Load game',
        'Esc — Settings and pause',
        'R — In-car radio'
      ];
      lines.forEach((line, i) => ctx.fillText(line, 22, 173 + i * 36));
    }

    ctx.fillStyle = '#223947';
    ctx.fillRect(0, 586, width, 54);
    ctx.fillStyle = '#c6ddd3';
    ctx.font = '16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('P CLOSE E JOB / OBJECTIVE', width / 2, 619);
    ctx.textAlign = 'left';
  }
}
