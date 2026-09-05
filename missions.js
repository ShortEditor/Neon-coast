import * as THREE from 'three';
import { clamp, distance } from './world.js';

export const JOBS = [
  {
    title: 'MIDNIGHT DELIVERY',
    subtitle: 'At first, it was only a job.',
    reward: 1000,
    limit: 720,
    vehicle: 'van',
    briefing:
      'INEZ: Marked van on the boulevard. Marlin Exchange, south door. ' +
      'Collect a sealed case and bring it west. No questions. On time.',
    steps: [
      {
        kind: 'enter',
        text: 'Enter the marked delivery van.'
      },
      {
        kind: 'drive',
        x: 90, z: -68, radius: 18,
        text: 'Drive to Marlin Exchange. Stop at the south entrance.'
      },
      {
        kind: 'exit',
        x: 90, z: -72, radius: 25,
        text: 'Park and exit the delivery van.'
      },
      {
        kind: 'interact',
        id: 'case',
        x: 90, z: -92,
        text: 'Open the depot door. Go inside and collect the sealed case.',
        heat: 0.8,
        line:
          'The label reads: TIDE CONTROL / DO NOT ERASE. ' +
          'Patrols are looking for this van.'
      },
      {
        kind: 'enter',
        text: 'Return to the marked delivery van.'
      },
      {
        kind: 'drive',
        x: -120, z: 105, radius: 14,
        clear: true,
        text:
          'Lose your Heat. Drive west and stop at the transfer point.'
      },
      {
        kind: 'choice',
        id: 'recorder',
        text: 'Decide what happens to the tide recorder.'
      }
    ]
  },
  {
    title: 'FLOODLIGHTS',
    subtitle: 'Everybody needs a way home.',
    reward: 850,
    limit: 600,
    vehicle: 'taxi',
    briefing:
      'INEZ: Nell maintained the city flood sensors. Now someone wants ' +
      'her quiet. Take the marked taxi and collect her on the boulevard.',
    steps: [
      {
        kind: 'enter',
        text: 'Enter the marked taxi.'
      },
      {
        kind: 'drive',
        x: 3, z: -44, radius: 11,
        board: true,
        text: 'Collect Nell from the east sidewalk. Stop beside her.'
      },
      {
        kind: 'choice',
        id: 'passenger',
        text: 'Choose where to take Nell.'
      },
      {
        kind: 'drive',
        route: true,
        clear: true,
        text: 'Take Nell to the chosen destination and stop.'
      }
    ]
  },
  {
    title: 'DEAD AIR',
    subtitle: 'The truth travels better above the street.',
    reward: 1100,
    limit: 600,
    briefing:
      'INEZ: The recorder points to Sol Terrace. A rooftop transmitter ' +
      'still holds the original flood forecasts. Reach it before the logs vanish.',
    steps: [
      {
        kind: 'reach',
        x: -73.5, z: 45, radius: 8,
        onFoot: true,
        text: 'Go on foot to the stairs on the east side of Sol Terrace.'
      },
      {
        kind: 'interact',
        id: 'transmitter',
        x: -94, y: 4.25, z: 30,
        text: 'Climb the stairs and access the rooftop transmitter.',
        heat: 1.2,
        line:
          'The forecasts were accurate. The evacuation orders were not. ' +
          'Someone chose which neighborhoods would be warned.'
      },
      {
        kind: 'clear',
        x: -94, y: 4.25, z: 30,
        text:
          'Stay out of patrol sight until your Heat clears. ' +
          'The rooftop offers cover.'
      },
      {
        kind: 'choice',
        id: 'broadcast',
        text: 'Choose what to do with the recovered forecasts.'
      }
    ]
  },
  {
    title: 'HIGH WATER',
    subtitle: 'A city is the people who answer.',
    reward: 1500,
    limit: 720,
    briefing:
      'INEZ: Another storm is coming. Marlin can power the emergency relay. ' +
      'Get its backup online, reach Paloma Park, and decide who receives the warning.',
    steps: [
      {
        kind: 'interact',
        id: 'power',
        x: 102, z: -82,
        text:
          'Return to Marlin Exchange. Enter the depot and activate its backup power.',
        heat: 0.7,
        line:
          'Marlin’s backup is online. The Paloma relay has enough power for one transmission.'
      },
      {
        kind: 'interact',
        id: 'community',
        x: -90, y: 0, z: 99,
        text: 'Reach the community relay in Paloma Park and use it.',
        line: 'The channel is open. The coast is listening.'
      },
      {
        kind: 'choice',
        id: 'final',
        text: 'Choose the final transmission.'
      },
      {
        kind: 'reach',
        x: 145, z: 132, radius: 12,
        vehicleAny: true,
        clear: true,
        stopped: true,
        text:
          'Take any vehicle to the southern coast road. Clear your Heat and stop.'
      }
    ]
  }
];

const CHOICES = {
  recorder: {
    title: 'THE SEALED CASE',
    body:
      'The transfer contact offers an extra payment if the recorder remains sealed. ' +
      'Its maintenance port would also let you keep a copy.',
    options: [
      {
        id: 'copy',
        label: 'Keep a copy · community trust',
        description: 'Deliver the recorder, but preserve its records.'
      },
      {
        id: 'sealed',
        label: 'Deliver it sealed · +$300',
        description: 'Take the clean handoff and ask no questions.'
      }
    ]
  },
  passenger: {
    title: 'A PASSENGER, NOT A PACKAGE',
    body:
      'NELL: My neighbors are sheltering near Paloma Park. ' +
      'The investor’s office will pay you to bring me there instead. Your call.',
    options: [
      {
        id: 'clinic',
        label: 'Paloma shelter · community trust',
        description: 'Take Nell to the people who need her.'
      },
      {
        id: 'tower',
        label: 'Investor’s office · +$600',
        description: 'Accept the private escort contract.'
      }
    ]
  },
  broadcast: {
    title: 'WHO OWNS TOMORROW?',
    body:
      'The transmitter contains proof that public flood warnings were withheld. ' +
      'A private buyer wants the archive. The neighborhood relay can publish it.',
    options: [
      {
        id: 'share',
        label: 'Publish the archive · community trust',
        description: 'Give the neighborhoods the information.'
      },
      {
        id: 'sell',
        label: 'Sell the archive · +$1,200',
        description: 'Trade the evidence for a private payment.'
      }
    ]
  },
  final: {
    title: 'ONE LAST TRANSMISSION',
    body:
      'The storm front is approaching. You can send a public warning, ' +
      'hand control to the private operator, or take the records and leave.',
    options: [
      {
        id: 'warn',
        label: 'Warn the entire coast',
        description: 'Your earlier choices determine how many people answer.'
      },
      {
        id: 'control',
        label: 'Sell relay control · +$2,500',
        description: 'The operator decides who gets the warning.'
      },
      {
        id: 'leave',
        label: 'Keep the records and leave',
        description: 'Find another way to get the story out.'
      }
    ]
  }
};

export class Missions {
  constructor(game) {
    this.createContact(game);
    this.reset(game);
  }

  createContact(game) {
    const group = this.contact = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: 0xe0b18a });
    const skin = new THREE.MeshStandardMaterial({ color: 0xa9765c });
    const trousers = new THREE.MeshStandardMaterial({ color: 0x29454f });

    const part = (geometry, material, x, y, z) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      group.add(mesh);
    };

    part(new THREE.BoxGeometry(0.46, 0.64, 0.27), shirt, 0, 1.04, 0);
    part(new THREE.SphereGeometry(0.18, 10, 8), skin, 0, 1.55, 0);

    for (const side of [-1, 1]) {
      part(
        new THREE.BoxGeometry(0.17, 0.74, 0.2),
        trousers, side * 0.13, 0.38, 0
      );
      part(
        new THREE.BoxGeometry(0.12, 0.58, 0.13),
        skin, side * 0.3, 1.02, 0
      );
    }

    group.position.set(10.5, 0, -44);
    group.rotation.y = -Math.PI / 2;
    game.scene.add(group);

    game.world.sign(
      'NELL / PICKUP',
      10.5, 2.6, -44,
      '#e4c69c', 3.5
    );
  }

  reset(game) {
    this.chapter = 0;
    this.stage = 0;
    this.active = false;
    this.finished = false;
    this.timeLeft = 0;
    this.support = 0;
    this.evidence = false;
    this.caseTaken = false;
    this.passenger = false;
    this.route = 'clinic';
    this.disclosure = 'none';
    this.finalIntent = 'warn';
    this.choices = {};
    this.results = [];
    this._choosing = false;
    this.sync(game);
  }

  job() {
    return JOBS[this.chapter] || null;
  }

  requiredVehicle(game) {
    const type = this.job()?.vehicle;
    if (type === 'van') return game.actors.delivery;
    if (type === 'taxi') return game.actors.taxi;
    return null;
  }

  step(game) {
    const original = this.job()?.steps[this.stage];
    if (!original) return null;

    if (original.route) {
      return {
        ...original,
        ...(this.route === 'clinic'
          ? {
              x: -120, z: 90, radius: 13,
              text: 'Take Nell to the Paloma shelter. Clear your Heat and stop.'
            }
          : {
              x: -60, z: -105, radius: 13,
              text: 'Take Nell to the investor’s office. Clear your Heat and stop.'
            })
      };
    }

    return original;
  }

  objective(game) {
    if (this.finished) {
      return 'Story complete. Explore the coast, use its services, or start a new story.';
    }

    if (!this.active) {
      return `Open your phone with P, then press E to accept: ${this.job().title}.`;
    }

    return this.step(game)?.text || 'Listen for instructions.';
  }

  target(game) {
    if (this.finished) return null;

    if (!this.active) {
      return { x: 10, y: 0, z: 23, label: 'PAYPHONE' };
    }

    const step = this.step(game);
    if (!step) return null;

    if (step.kind === 'enter') {
      const vehicle = this.requiredVehicle(game);
      return vehicle
        ? { x: vehicle.x, y: 0, z: vehicle.z, label: 'MARKED VEHICLE' }
        : null;
    }

    if (step.x !== undefined) {
      return {
        x: step.x,
        y: step.y ?? game.world.floor(step.x, step.z),
        z: step.z,
        label: 'OBJECTIVE'
      };
    }

    return null;
  }

  accept(game) {
    if (this.active || this.finished) return;

    const job = this.job();
    this.active = true;
    this.stage = 0;
    this.timeLeft = job.limit;
    this._choosing = false;
    game.player.phone = false;

    if (this.chapter === 3) {
      game.weather.kind = 2;
      game.weather.timer = 220;
      if (game.time.hours > 6 && game.time.hours < 18.7) {
        game.time.hours = 19.3;
      }
    }

    this.sync(game);
    game.ui.chapter(job.title, job.subtitle);
    game.ui.toast(job.briefing, 12);
    game.checkpoint();
  }

  update(dt, game) {
    if (!this.active || this.finished) return;

    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 0) {
      game.fail('The job window closed. Restore your checkpoint and try again.');
      return;
    }

    const step = this.step(game);
    if (!step) return;

    const player = game.player;
    const required = this.requiredVehicle(game);

    switch (step.kind) {
      case 'enter':
        if (player.vehicle && player.vehicle === required) {
          this.advance(game);
        }
        break;

      case 'exit':
        if (!player.vehicle && distance(player, step) <= step.radius) {
          this.advance(game);
        }
        break;

      case 'drive':
        if (
          player.vehicle &&
          (!required || player.vehicle === required) &&
          distance(player, step) <= step.radius &&
          Math.abs(player.vehicle.speed) < 1.7 &&
          (!step.clear || game.actors.heat <= 0.01)
        ) {
          this.advance(game);
        }
        break;

      case 'reach':
        if (
          distance(player, step) <= step.radius &&
          (!step.onFoot || !player.vehicle) &&
          (!step.vehicleAny || !!player.vehicle) &&
          (!step.stopped ||
            !player.vehicle ||
            Math.abs(player.vehicle.speed) < 1.7) &&
          (!step.clear || game.actors.heat <= 0.01)
        ) {
          this.advance(game);
        }
        break;

      case 'clear':
        if (game.actors.heat <= 0.01) this.advance(game);
        break;

      case 'choice':
        if (!this._choosing) this.openChoice(step.id, game);
        break;
    }
  }

  interact(object, game) {
    if (!this.active || this.finished) return false;

    const step = this.step(game);
    if (
      !step ||
      step.kind !== 'interact' ||
      object.id !== step.id ||
      game.player.vehicle
    ) {
      return false;
    }

    if (step.id === 'case') this.caseTaken = true;
    if (step.id === 'power') {
      game.world.interiorLight.intensity = 75;
    }

    if (step.id === 'transmitter') {
      game.sound.tone(740, 0.18, 0.045, 'triangle');
    } else {
      game.sound.tone(440, 0.1, 0.045);
    }

    if (step.heat) game.actors.crime(step.heat, game);
    if (step.line) game.ui.toast(step.line, 10);

    this.advance(game);
    return true;
  }

  advance(game) {
    const previous = this.step(game);
    if (previous?.board) {
      this.passenger = true;
      game.ui.toast(
        'Nell gets in. “Thanks for stopping. We need to talk about where we’re going.”',
        8
      );
    }

    this.stage++;
    if (this.stage >= this.job().steps.length) {
      this.complete(game);
      return;
    }

    this.sync(game);
    game.checkpoint();
  }

  openChoice(id, game) {
    const choice = CHOICES[id];
    if (!choice) return;

    this._choosing = true;
    game.ui.choice(
      choice.title,
      choice.body,
      choice.options.map(option => ({
        label: option.label,
        description: option.description,
        action: () => this.resolveChoice(id, option.id, game)
      }))
    );
  }

  resolveChoice(id, value, game) {
    if (!this.active || this.step(game)?.id !== id) return;

    this.choices[id] = value;
    this._choosing = false;

    switch (id) {
      case 'recorder':
        if (value === 'copy') {
          this.evidence = true;
          this.support++;
          game.ui.toast('Archive copied. Someone may need this later.', 6);
        } else {
          game.player.cash += 300;
          game.ui.toast('Sealed handoff complete. Additional payment: $300.', 6);
        }
        break;

      case 'passenger':
        this.route = value;
        if (value === 'clinic') {
          this.support++;
          game.ui.toast('NELL: Paloma Park. Thank you.', 6);
        } else {
          game.player.cash += 600;
          game.ui.toast('Private escort payment received: $600.', 6);
        }
        break;

      case 'broadcast':
        this.disclosure = value;
        if (value === 'share') {
          this.support += 2;
          game.ui.toast('The archive is public. Neighborhood radios begin answering.', 8);
        } else {
          this.support--;
          game.player.cash += 1200;
          game.ui.toast('The private buyer confirms receipt. Payment: $1,200.', 8);
        }
        break;

      case 'final':
        this.finalIntent = value;
        if (value === 'warn') {
          this.support++;
          game.actors.crime(0.6, game);
          game.ui.toast('Emergency warning transmitted across the coast.', 8);
        } else if (value === 'control') {
          game.player.cash += 2500;
          game.ui.toast('Relay control transferred. Payment: $2,500.', 8);
        } else {
          game.ui.toast('You disconnect with the surviving records. Time to leave.', 8);
        }
        break;
    }

    this.advance(game);
  }

  complete(game) {
    const job = this.job();
    game.player.cash += job.reward;
    this.results.push({
      title: job.title,
      reward: job.reward,
      remaining: Math.round(this.timeLeft)
    });

    this.passenger = false;
    this.active = false;
    this.stage = 0;
    this.chapter++;
    this._choosing = false;
    this.finished = this.chapter >= JOBS.length;

    this.sync(game);
    game.checkpoint();

    game.sound.tone(660, 0.2, 0.06, 'triangle');
    game.sound.tone(880, 0.35, 0.04, 'sine');

    if (this.finished) {
      game.ui.ending(this.ending());
    } else {
      game.ui.chapter('JOB COMPLETE', `${job.title} / +$${job.reward}`);
      game.ui.toast(
        `Payment received: $${job.reward}. Check your phone for the next job.`,
        8
      );
    }
  }

  ending() {
    if (this.finalIntent === 'control') {
      return {
        title: 'A QUIET CITY',
        text:
          'The private operator restores service first to its paying districts. ' +
          'Your account is full. The public channel is silent. ' +
          'By morning, the coast has learned who owns its warning lights.'
      };
    }

    if (this.finalIntent === 'leave') {
      return this.evidence || this.disclosure === 'share'
        ? {
            title: 'THE LONG WAY OUT',
            text:
              'You leave with proof that cannot be erased. Copies travel farther ' +
              'than the patrol cars can follow. The coast has not heard the last of you.'
          }
        : {
            title: 'LOW TIDE',
            text:
              'The city falls behind you, neon trembling in the rain. ' +
              'You survived the job, but the story remains unfinished.'
          };
    }

    if (this.support >= 4 && this.disclosure === 'share') {
      return {
        title: 'THE COAST ANSWERS',
        text:
          'Nell’s neighbors open their doors. Marlin keeps its lights on. ' +
          'The warning moves from radio to radio until the entire coast is listening. ' +
          'This time, the neighborhoods decide their own future.'
      };
    }

    return {
      title: 'ONE LIGHT STAYS ON',
      text:
        'The warning reaches the air, but trust arrives more slowly. ' +
        'Some people answer. Some do not. At Marlin Exchange, one light stays on ' +
        'for everyone still trying to find a way home.'
    };
  }

  sync(game) {
    if (!game?.world) return;
    if (game.world.caseMesh) {
      game.world.caseMesh.visible = !this.caseTaken;
    }
    if (this.contact) {
      this.contact.visible =
        this.chapter < 1 ||
        (this.chapter === 1 && !this.passenger && this.stage <= 1);
    }
  }

  snapshot() {
    return {
      chapter: this.chapter,
      stage: this.stage,
      active: this.active,
      finished: this.finished,
      timeLeft: this.timeLeft,
      support: this.support,
      evidence: this.evidence,
      caseTaken: this.caseTaken,
      passenger: this.passenger,
      route: this.route,
      disclosure: this.disclosure,
      finalIntent: this.finalIntent,
      choices: { ...this.choices },
      results: this.results.map(result => ({ ...result }))
    };
  }

  restore(state = {}, game) {
    this.reset(game);
    this.chapter = clamp(Math.floor(state.chapter || 0), 0, JOBS.length);
    this.finished = this.chapter === JOBS.length;
    this.active = !!state.active && !this.finished;

    const job = this.job();
    this.stage = job
      ? clamp(Math.floor(state.stage || 0), 0, job.steps.length - 1)
      : 0;

    this.timeLeft = Number.isFinite(state.timeLeft)
      ? clamp(state.timeLeft, 0, job?.limit || 720)
      : job?.limit || 0;

    this.support = Number.isFinite(state.support)
      ? clamp(state.support, -10, 10)
      : 0;

    this.evidence = !!state.evidence;
    this.caseTaken = !!state.caseTaken;
    this.passenger = !!state.passenger;
    this.route = state.route === 'tower' ? 'tower' : 'clinic';
    this.disclosure = ['none', 'share', 'sell'].includes(state.disclosure)
      ? state.disclosure
      : 'none';
    this.finalIntent = ['warn', 'control', 'leave'].includes(state.finalIntent)
      ? state.finalIntent
      : 'warn';

    this.choices = {};
    for (const id of Object.keys(CHOICES)) {
      const value = state.choices?.[id];
      if (CHOICES[id].options.some(option => option.id === value)) {
        this.choices[id] = value;
      }
    }

    this.results = Array.isArray(state.results)
      ? state.results.slice(0, JOBS.length).map((result, i) => ({
          title: JOBS[i].title,
          reward: JOBS[i].reward,
          remaining: Number.isFinite(result?.remaining) ? result.remaining : 0
        }))
      : [];

    this._choosing = false;
    this.sync(game);
  }
}
