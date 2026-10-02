'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const storage = require('./storage');

const PORT = Number(process.env.PORT || 10000);

const WORLD = { w: 6000, h: 4400 };
const MAX_PLAYERS = 16;
const SAFE_ZONE = { x: 3000, y: 2200, r: 300 };

const SERVER_VERSION = '20261001-124';

const AMMO_PACK_SIZE = 50;
const AMMO_PACK_COST = 50;
const MAX_AMMO = 120;

const SHOP_NPC = { x: 3600, y: 2200, r: 30 };
const SHOP_INTERACTION_RADIUS = 80;
const BANK_NPC = { x: 3000, y: 1800, r: 24 };
const BANK_INTERACTION_RADIUS = 95;

const WEAPONS = {
  blaster: { name: 'BLASTER', cost: 0, damage: 25, fireRate: 350 },
  pulse: { name: 'PULSE', cost: 150, damage: 18, fireRate: 170 },
  cannon: { name: 'CANNON', cost: 300, damage: 65, fireRate: 700 }
};

const HP_REGEN_PER_SEC = 3;
const WORLD_WALL_COUNT = 55;
const WORLD_WALL_SEED = 739281;
const AUTOSAVE_MS = 5000;
const DEATH_HP_LOSS = 0.10;
const DEATH_DAMAGE_LOSS = 0.05;
const DEATH_DEFENSE_LOSS = 0.05;
const DEATH_GOLD_LOSS = 0.10;
const DEATH_XP_LOSS = 0.10;
const TICK_MS = 100;
const ENEMY_SYNC_MS = 120;
const ENEMY_ATTACK_COOLDOWN_MS = 700;

const SERVER_STARTED_AT = Date.now();

const clients = new Map();
const savedPlayers = new Map();

const rooms = new Map();
const roomEnemies = new Map();
const roomWalls = new Map();

const PUBLIC_ROOMS = ['12345', '67890'];

rooms.set('OPEN', new Set());
roomEnemies.set('OPEN', []);
roomWalls.set('OPEN', []);

for (const code of PUBLIC_ROOMS) {
  rooms.set(code, new Set());
  roomEnemies.set(code, []);
  roomWalls.set(code, []);
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function maxHpForLevel(level) {
  return 100 + Math.max(0, Number(level || 1) - 1) * 15;
}

function speedForLevel(level) {
  return 205 + Math.max(0, Number(level || 1) - 1) * 4;
}

function xpToNextLevel(level) {
  return 100 * Math.max(1, Number(level) || 1);
}

function masteryXpToNextLevel(level) {
  return 100 * Math.max(1, Number(level) || 1);
}

function masteryLevelFromXp(xp) {
  let level = 1;
  let remaining = Math.max(0, Number(xp) || 0);

  while (level < 1000 && remaining >= masteryXpToNextLevel(level)) {
    remaining -= masteryXpToNextLevel(level);
    level += 1;
  }

  return level;
}

function masteryXpIntoLevel(xp) {
  let level = 1;
  let remaining = Math.max(0, Number(xp) || 0);

  while (level < 1000 && remaining >= masteryXpToNextLevel(level)) {
    remaining -= masteryXpToNextLevel(level);
    level += 1;
  }

  return remaining;
}

function inSafeZone(x, y, pad = 0) {
  return Math.hypot(x - SAFE_ZONE.x, y - SAFE_ZONE.y) <= SAFE_ZONE.r + pad;
}

function makeCode() {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

function send(ws, message) {
  if (!ws || ws.readyState !== 1) return false;
  try {
    ws.send(JSON.stringify(message));
    return true;
  } catch (error) {
    console.error('[WS SEND]', error?.message || error);
    return false;
  }
}

function roomPlayers(room) {
  return [...(room || [])].map((ws) => clients.get(ws)).filter(Boolean);
}

function publicPlayer(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    angle: p.angle,
    hp: p.hp,
    maxHp: maxHpForLevel(p.level),
    alive: p.alive,
    level: p.level,
    score: p.score,
    kills: p.kills,
    xp: p.xp,
    pvpKills: p.pvpKills,
    damage: p.damage,
    defense: p.defense,
    damageXp: p.damageXp,
    defenseXp: p.defenseXp,
    fireRate: p.fireRate,
    speed: p.speed,
    color: p.color,
    weapon: p.weapon
  };
}

function publicPlayers(room) {
  return roomPlayers(room).map(publicPlayer);
}

function sendPlayerList(code) {
  const room = rooms.get(code);
  if (!room) return;
  broadcastRoom(code, {
    type: 'player_list',
    players: publicPlayers(room)
  });
}

function sendStats(p) {
  if (!p?.ws) return;
  const nextKills = p.kills % 5 === 0 ? 5 : 5 - (p.kills % 5);

  send(p.ws, {
    type: 'server_stats',
    kills: p.kills,
    pvpKills: p.pvpKills,
    score: p.score,
    xp: p.xp,
    level: p.level,
    damage: p.damage,
    defense: p.defense,
    fireRate: p.fireRate,
    speed: p.speed,
    maxHp: maxHpForLevel(p.level),
    xpNeed: xpToNextLevel(p.level),
    damageXp: p.damageXp,
    damageXpNeed: masteryXpToNextLevel(masteryLevelFromXp(p.damageXp)),
    damageLevel: masteryLevelFromXp(p.damageXp),
    defenseXp: p.defenseXp,
    defenseXpNeed: masteryXpToNextLevel(masteryLevelFromXp(p.defenseXp)),
    defenseLevel: masteryLevelFromXp(p.defenseXp),
    killsToLevel: nextKills,
    gold: p.gold || 0,
    diamonds: p.diamonds || 0,
    ammo: p.ammo ?? 0,
    maxAmmo: MAX_AMMO,
    weapon: p.weapon,
    shopNpc: SHOP_NPC,
    bankNpc: BANK_NPC,
    bankedGold: p.bankedGold || 0,
    bankedDiamonds: p.bankedDiamonds || 0
  });
}

function capturePlayerData(p) {
  return {
    name: p.name,
    level: p.level,
    hp: p.hp,
    damage: p.damage,
    defense: p.defense,
    fireRate: p.fireRate,
    speed: p.speed,
    score: p.score,
    kills: p.kills,
    xp: p.xp,
    pvpKills: p.pvpKills,
    gold: p.gold || 0,
    diamonds: p.diamonds || 0,
    ammo: clamp(Number(p.ammo) || 0, 0, MAX_AMMO),
    weapon: WEAPONS[p.weapon] ? p.weapon : 'blaster',
    bankedGold: Math.max(0, Number(p.bankedGold) || 0),
    bankedDiamonds: Math.max(0, Number(p.bankedDiamonds) || 0),
    damageXp: Math.max(0, Number(p.damageXp) || 0),
    defenseXp: Math.max(0, Number(p.defenseXp) || 0),
    damagePenalty: Math.max(0, Number(p.damagePenalty) || 0),
    defensePenalty: Math.max(0, Number(p.defensePenalty) || 0)
  };
}

function persistPlayer(p) {
  if (!p?.saveKey) return Promise.resolve(null);

  const write = async () => {
    const data = capturePlayerData(p);
    savedPlayers.set(p.saveKey, data);

    try {
      await storage.ready;
      await storage.savePlayerData(p.saveKey, data);
    } catch (error) {
      console.error('[STORAGE SAVE]', error?.message || error);
    }

    p.lastPersistAt = Date.now();
    return data;
  };

  p.persistChain = (p.persistChain || Promise.resolve()).then(write, write);
  return p.persistChain;
}

async function loadSavedPlayer(saveKey) {
  if (!saveKey) return null;
  const cached = savedPlayers.get(saveKey);
  if (cached) return { ...cached };

  try {
    await storage.ready;
    const data = await storage.loadPlayerData(saveKey);
    if (data) {
      savedPlayers.set(saveKey, data);
      return { ...data };
    }
  } catch (error) {
    console.error('[STORAGE LOAD]', error?.message || error);
  }

  return null;
}

function applyCombatStats(p) {
  const item = WEAPONS[p.weapon] || WEAPONS.blaster;
  p.weapon = WEAPONS[p.weapon] ? p.weapon : 'blaster';

  const damageMasteryLevel = masteryLevelFromXp(p.damageXp);
  const defenseMasteryLevel = masteryLevelFromXp(p.defenseXp);

  const baseDamage = item.damage + Math.max(0, p.level - 1) * 5;
  const masteryDamage = Math.max(0, damageMasteryLevel - 1) * 3;
  const baseDefense = Math.max(0, p.level - 1) * 2;
  const masteryDefense = Math.max(0, defenseMasteryLevel - 1);

  p.damage = Math.max(
    5,
    Math.round(baseDamage + masteryDamage - (Number(p.damagePenalty) || 0))
  );
  p.fireRate = Math.max(100, item.fireRate - Math.max(0, p.level - 1) * 4);
  p.defense = Math.max(
    0,
    Math.round(baseDefense + masteryDefense - (Number(p.defensePenalty) || 0))
  );
  p.speed = speedForLevel(p.level);
}

function addDamageXp(p, amount) {
  p.damageXp = Math.max(0, Number(p.damageXp) || 0) + Math.max(0, Number(amount) || 0);
  applyCombatStats(p);
}

function addDefenseXp(p, amount) {
  p.defenseXp = Math.max(0, Number(p.defenseXp) || 0) + Math.max(0, Number(amount) || 0);
  applyCombatStats(p);
}

function applyMasteryDeathLoss(p) {
  // La muerte quita una parte del progreso de daño y defensa.
  // Si el progreso perdido cruza un nivel de maestría, el atributo baja.
  const damageLevel = masteryLevelFromXp(p.damageXp);
  const defenseLevel = masteryLevelFromXp(p.defenseXp);
  const damageIntoLevel = masteryXpIntoLevel(p.damageXp);
  const defenseIntoLevel = masteryXpIntoLevel(p.defenseXp);

  const damageLoss = Math.max(1, Math.floor(masteryXpToNextLevel(damageLevel) * DEATH_DAMAGE_LOSS));
  const defenseLoss = Math.max(1, Math.floor(masteryXpToNextLevel(defenseLevel) * DEATH_DEFENSE_LOSS));

  p.damageXp = Math.max(0, Number(p.damageXp || 0) - damageLoss);
  p.defenseXp = Math.max(0, Number(p.defenseXp || 0) - defenseLoss);

  // Si estaba en el nivel 1 de maestría, nunca baja por debajo de 1.
  // Si pierde el progreso que tenía dentro de su nivel, vuelve al nivel anterior
  // y conserva el progreso restante desde 0 de ese nivel.
  if (damageLevel > 1 && damageIntoLevel < damageLoss) {
    p.damageXp = Math.max(0, p.damageXp);
  }
  if (defenseLevel > 1 && defenseIntoLevel < defenseLoss) {
    p.defenseXp = Math.max(0, p.defenseXp);
  }

  applyCombatStats(p);
}

function applyDeathPenalty(p) {
  // La muerte conserva ataque/defensa y solo baja progreso.
  // Se pierde 10% del XP necesario para el nivel actual.
  // Si el XP no alcanza, se pierde exactamente 1 nivel (sin bajar de nivel 1).
  let level = clamp(Number(p.level) || 1, 1, 1000);
  let xp = Math.max(0, Number(p.xp) || 0);
  const xpLoss = Math.max(1, Math.floor(xpToNextLevel(level) * DEATH_XP_LOSS));

  xp -= xpLoss;

  if (xp < 0) {
    level = Math.max(1, level - 1);
    xp = 0;
  }

  p.level = level;
  p.xp = xp;

  applyMasteryDeathLoss(p);

  const maxHp = maxHpForLevel(level);
  p.hp = Math.max(1, Math.floor(maxHp * (1 - DEATH_HP_LOSS)));
  p.gold = Math.max(0, Math.floor((Number(p.gold) || 0) * (1 - DEATH_GOLD_LOSS)));

  // Nunca acumular penalizaciones de ataque/defensa por morir.
  p.damagePenalty = 0;
  p.defensePenalty = 0;
  applyCombatStats(p);
}

function respawnAfterDeath(p) {
  if (!p?.room) return;
  const spawn = spawnPosition(p.room);
  p.x = spawn.x;
  p.y = spawn.y;
  p.angle = 0;
  p.alive = true;
  p.frozen = false;
  p.lastShot = 0;
  p.lastStateAt = Date.now();
  p.stateViolations = 0;
  applyCombatStats(p);
}

function levelUpIfNeeded(p) {
  let changed = false;

  while (p.level < 1000 && p.xp >= xpToNextLevel(p.level)) {
    p.xp -= xpToNextLevel(p.level);
    p.level += 1;
    changed = true;
  }

  if (changed) {
    p.hp = Math.min(maxHpForLevel(p.level), Math.max(1, p.hp));
    applyCombatStats(p);
  }
}

function seededRandomFactory(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createWorldWalls() {
  const random = seededRandomFactory(WORLD_WALL_SEED);
  const walls = [];

  for (let i = 0; i < WORLD_WALL_COUNT; i++) {
    let created = null;

    for (let attempt = 0; attempt < 80 && !created; attempt++) {
      const w = Math.round(45 + random() * 85);
      const h = Math.round(45 + random() * 85);
      const x = Math.round(120 + random() * (WORLD.w - 240));
      const y = Math.round(120 + random() * (WORLD.h - 240));

      if (Math.hypot(x - SAFE_ZONE.x, y - SAFE_ZONE.y) < SAFE_ZONE.r + 120) {
        continue;
      }

      let overlaps = false;
      for (const wall of walls) {
        const overlapX = Math.abs(x - wall.x) < (w + wall.w) / 2 + 12;
        const overlapY = Math.abs(y - wall.y) < (h + wall.h) / 2 + 12;
        if (overlapX && overlapY) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        created = {
          id: 'w' + (i + 1),
          x,
          y,
          w,
          h,
          hp: 100,
          maxHp: 100
        };
      }
    }

    if (created) walls.push(created);
  }

  // B121: estructuras iniciales alrededor de la zona segura para que el
  // jugador tenga cobertura y referencias visibles desde el spawn.
  const starterStructures = [
    { x: 3000, y: 1650, w: 110, h: 70 },
    { x: 3000, y: 2750, w: 110, h: 70 },
    { x: 2450, y: 2200, w: 90, h: 120 },
    { x: 3550, y: 2200, w: 90, h: 120 },
    { x: 2620, y: 1800, w: 120, h: 80 },
    { x: 3380, y: 1800, w: 120, h: 80 },
    { x: 2620, y: 2600, w: 120, h: 80 },
    { x: 3380, y: 2600, w: 120, h: 80 }
  ];
  for (const structure of starterStructures) {
    if (!walls.some(w => w.x === structure.x && w.y === structure.y)) {
      walls.push({
        id: 'starter_' + (walls.length + 1),
        ...structure,
        hp: 100,
        maxHp: 100
      });
    }
  }

  return walls;
}

const WORLD_WALLS = createWorldWalls();

function ensureRoomWalls(code) {
  if (!roomWalls.has(code) || !roomWalls.get(code)?.length) {
    roomWalls.set(
      code,
      WORLD_WALLS.map((wall) => ({ ...wall }))
    );
  }
  return roomWalls.get(code);
}

function sendWallState(code) {
  broadcastRoom(code, {
    type: 'wall_state',
    walls: ensureRoomWalls(code)
  });
}

function collidesWithWall(x, y, radius, walls) {
  for (const wall of walls || []) {
    const closestX = clamp(x, wall.x - wall.w / 2, wall.x + wall.w / 2);
    const closestY = clamp(y, wall.y - wall.h / 2, wall.y + wall.h / 2);
    if (Math.hypot(x - closestX, y - closestY) < radius + 2) return wall;
  }
  return null;
}

function hasLineOfSight(x1, y1, x2, y2, walls) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy);
  if (distance <= 1) return true;
  const dirX = dx / distance;
  const dirY = dy / distance;
  for (const wall of walls || []) {
    const hit = rayAabbDistance(x1, y1, dirX, dirY, wall);
    if (hit >= 0 && hit < distance - 12) return false;
  }
  return true;
}

function rayAabbDistance(originX, originY, dirX, dirY, wall) {
  const minX = wall.x - wall.w / 2;
  const maxX = wall.x + wall.w / 2;
  const minY = wall.y - wall.h / 2;
  const maxY = wall.y + wall.h / 2;

  let txMin = -Infinity;
  let txMax = Infinity;
  let tyMin = -Infinity;
  let tyMax = Infinity;

  if (Math.abs(dirX) < 1e-9) {
    if (originX < minX || originX > maxX) return Infinity;
  } else {
    const tx1 = (minX - originX) / dirX;
    const tx2 = (maxX - originX) / dirX;
    txMin = Math.min(tx1, tx2);
    txMax = Math.max(tx1, tx2);
  }

  if (Math.abs(dirY) < 1e-9) {
    if (originY < minY || originY > maxY) return Infinity;
  } else {
    const ty1 = (minY - originY) / dirY;
    const ty2 = (maxY - originY) / dirY;
    tyMin = Math.min(ty1, ty2);
    tyMax = Math.max(ty1, ty2);
  }

  const entry = Math.max(txMin, tyMin);
  const exit = Math.min(txMax, tyMax);

  if (exit < 0 || entry > exit) return Infinity;
  return entry >= 0 ? entry : exit >= 0 ? 0 : Infinity;
}

function makeEnemy() {
  const elite = Math.random() < 0.2;
  const r = elite ? 27 : 21;
  const shapes = ['square', 'triangle', 'hex'];

  let x = 0;
  let y = 0;

  do {
    const angle = Math.random() * Math.PI * 2;
    const distance = 450 + Math.random() * 500;
    x = clamp(SAFE_ZONE.x + Math.cos(angle) * distance, 100, WORLD.w - 100);
    y = clamp(SAFE_ZONE.y + Math.sin(angle) * distance, 100, WORLD.h - 100);
  } while (
    inSafeZone(x, y, 60) ||
    collidesWithWall(x, y, r, WORLD_WALLS)
  );

  return {
    id: Math.random().toString(36).slice(2, 10),
    x,
    y,
    r,
    hp: elite ? 85 : 50,
    maxHp: elite ? 85 : 50,
    speed: elite ? 55 : 75,
    damage: elite ? 14 : 9,
    lastAttackAt: 0,
    kind: elite ? 'elite' : 'drone',
    shape: shapes[Math.floor(Math.random() * shapes.length)]
  };
}

function ensureRoomEnemies(code) {
  if (!roomEnemies.has(code)) {
    roomEnemies.set(code, []);
  }

  const list = roomEnemies.get(code);
  while (list.length < 18) list.push(makeEnemy());
  return list;
}

function sendEnemyState(code) {
  const room = rooms.get(code);
  if (!room || !room.size) return;
  broadcastRoom(code, {
    type: 'enemy_state',
    enemies: ensureRoomEnemies(code)
  });
}

function broadcastRoom(code, message, except = null) {
  const room = rooms.get(code);
  if (!room || !room.size) return;

  const data = JSON.stringify(message);

  for (const ws of room) {
    if (ws === except || ws.readyState !== 1) continue;
    try {
      ws.send(data);
    } catch (error) {
      console.error('[WS BROADCAST]', error?.message || error);
    }
  }
}

async function leaveRoom(ws) {
  const p = clients.get(ws);
  if (!p || !p.room) {
    if (p?.saveKey) void persistPlayer(p);
    return;
  }

  const code = p.room;

  if (p.saveKey) {
    await persistPlayer(p);
  }

  const room = rooms.get(code);
  if (room) {
    room.delete(ws);

    if (room.size === 0 && code !== 'OPEN' && !PUBLIC_ROOMS.includes(code)) {
      rooms.delete(code);
      roomEnemies.delete(code);
      roomWalls.delete(code);
    } else {
      broadcastRoom(code, {
        type: 'player_leave',
        id: p.id
      });
      sendPlayerList(code);
    }
  }

  p.room = '';
}

async function joinRoom(ws, requestedCode, create = false) {
  const p = clients.get(ws);
  if (!p) return;

  let code = String(requestedCode || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);

  if (create || !code) {
    code = makeCode();
    rooms.set(code, new Set());
    roomEnemies.set(code, []);
    roomWalls.set(code, WORLD_WALLS.map((wall) => ({ ...wall })));
  }

  const room = rooms.get(code);

  if (!room) {
    send(ws, { type: 'room_error', message: 'Sala no encontrada' });
    return;
  }

  if (room.size >= MAX_PLAYERS) {
    send(ws, { type: 'room_error', message: 'Sala llena' });
    return;
  }

  await leaveRoom(ws);

  room.add(ws);
  ensureRoomEnemies(code);
  ensureRoomWalls(code);

  p.room = code;

  const spawn = spawnPosition(code);

  // Cada entrada a una sala inicia en la zona segura, sin importar la posición anterior.
  p.x = spawn.x;
  p.y = spawn.y;
  p.hp = maxHpForLevel(p.level);

  p.angle = 0;
  p.alive = true;
  p.hasSaved = false;
  p.lastStateAt = Date.now();
  p.stateViolations = 0;
  p.lastShot = 0;

  p.x = clamp(p.x, 35, WORLD.w - 35);
  p.y = clamp(p.y, 35, WORLD.h - 35);
  p.hp = clamp(Number(p.hp) || maxHpForLevel(p.level), 1, maxHpForLevel(p.level));
  applyCombatStats(p);

  send(ws, {
    type: 'room_joined',
    code,
    players: publicPlayers(room),
    enemies: ensureRoomEnemies(code),
    walls: ensureRoomWalls(code),
    safeZone: SAFE_ZONE,
    spawnProtectionMs: 5000
  });

  sendStats(p);

  broadcastRoom(
    code,
    {
      type: 'player_join',
      player: publicPlayer(p)
    },
    ws
  );

  sendPlayerList(code);
}

function spawnPosition(code) {
  const room = rooms.get(code) || new Set();
  const index = room.size;

  const spots = [
    [3000, 2200],
    [2900, 2200],
    [3100, 2200],
    [3000, 2100],
    [2750, 2200],
    [3250, 2200],
    [3000, 1900],
    [3000, 2500],
    [2700, 1900],
    [3300, 1900],
    [2700, 2500],
    [3300, 2500],
    [2850, 1850],
    [3150, 1850],
    [2850, 2550],
    [3150, 2550]
  ];

  const spot = spots[index % spots.length];
  return { x: spot[0], y: spot[1] };
}

function findPlayer(id, room) {
  for (const ws of room || []) {
    const p = clients.get(ws);
    if (p && p.id === id) return { ws, p };
  }
  return null;
}

function shopBuy(ws, requestedWeapon) {
  const p = clients.get(ws);
  if (!p) return;

  const weapon = String(requestedWeapon || '').toLowerCase();
  const item = WEAPONS[weapon];

  if (!p.room) {
    send(ws, { type: 'shop_result', ok: false, message: 'No estás dentro de una sala.' });
    return;
  }

  if (!p.alive) {
    send(ws, { type: 'shop_result', ok: false, message: 'No puedes comprar estando destruido.' });
    return;
  }

  if (Math.hypot(p.x - SHOP_NPC.x, p.y - SHOP_NPC.y) > SHOP_INTERACTION_RADIUS) {
    send(ws, { type: 'shop_result', ok: false, message: 'Acércate al vendedor de munición.' });
    return;
  }

  if (!item) {
    send(ws, { type: 'shop_result', ok: false, message: 'Arma no disponible.' });
    return;
  }

  if (p.weapon === weapon) {
    send(ws, {
      type: 'shop_result',
      ok: false,
      message: 'Ya tienes equipada ' + item.name + '.',
      weapon: p.weapon
    });
    return;
  }

  const gold = Math.max(0, Number(p.gold) || 0);

  if (gold < item.cost) {
    send(ws, {
      type: 'shop_result',
      ok: false,
      message: 'Necesitas ' + item.cost + ' de oro para ' + item.name + '.'
    });
    return;
  }

  p.gold = gold - item.cost;
  p.weapon = weapon;
  applyCombatStats(p);

  void persistPlayer(p);

  send(ws, {
    type: 'shop_result',
    ok: true,
    message: 'Equipada ' + item.name + '.',
    weapon: p.weapon,
    gold: p.gold,
    damage: p.damage,
    defense: p.defense,
    fireRate: p.fireRate,
    speed: p.speed
  });

  sendStats(p);
  sendPlayerList(p.room);
}

async function depositBank(ws) {
  const p = clients.get(ws);
  if (!p) return;
  if (!p.room || !p.alive) {
    send(ws, { type: 'bank_result', ok: false, message: 'No puedes usar el banco ahora.' });
    return;
  }
  if (Math.hypot(p.x - BANK_NPC.x, p.y - BANK_NPC.y) > BANK_INTERACTION_RADIUS) {
    send(ws, { type: 'bank_result', ok: false, message: 'Acércate al BANCO NEON.' });
    return;
  }
  const gold = Math.max(0, Number(p.gold) || 0);
  const diamonds = Math.max(0, Number(p.diamonds) || 0);
  if (gold <= 0 && diamonds <= 0) {
    send(ws, { type: 'bank_result', ok: false, message: 'No tienes recursos en la bolsa.' });
    return;
  }
  p.gold = 0;
  p.diamonds = 0;
  p.bankedGold = Math.max(0, Number(p.bankedGold) || 0) + gold;
  p.bankedDiamonds = Math.max(0, Number(p.bankedDiamonds) || 0) + diamonds;
  await persistPlayer(p);
  send(ws, { type: 'bank_result', ok: true, message: 'Recursos guardados en el banco.', gold: p.gold, diamonds: p.diamonds, bankedGold: p.bankedGold, bankedDiamonds: p.bankedDiamonds });
  sendStats(p);
}

async function withdrawBank(ws) {
  const p = clients.get(ws);
  if (!p) return;
  if (!p.room || !p.alive) {
    send(ws, { type: 'bank_result', ok: false, message: 'No puedes usar el banco ahora.' });
    return;
  }
  if (Math.hypot(p.x - BANK_NPC.x, p.y - BANK_NPC.y) > BANK_INTERACTION_RADIUS) {
    send(ws, { type: 'bank_result', ok: false, message: 'Acércate al BANCO NEON.' });
    return;
  }
  p.gold = Math.max(0, Number(p.gold) || 0) + Math.max(0, Number(p.bankedGold) || 0);
  p.diamonds = Math.max(0, Number(p.diamonds) || 0) + Math.max(0, Number(p.bankedDiamonds) || 0);
  p.bankedGold = 0;
  p.bankedDiamonds = 0;
  await persistPlayer(p);
  send(ws, { type: 'bank_result', ok: true, message: 'Recursos retirados del banco.', gold: p.gold, diamonds: p.diamonds, bankedGold: 0, bankedDiamonds: 0 });
  sendStats(p);
}

function buyAmmo(ws) {
  const p = clients.get(ws);
  if (!p) return;

  if (!p.room) {
    send(ws, { type: 'shop_result', ok: false, message: 'No estás dentro de una sala.' });
    return;
  }

  if (!p.alive) {
    send(ws, { type: 'shop_result', ok: false, message: 'No puedes comprar estando destruido.' });
    return;
  }

  if (Math.hypot(p.x - SHOP_NPC.x, p.y - SHOP_NPC.y) > SHOP_INTERACTION_RADIUS) {
    send(ws, {
      type: 'shop_result',
      ok: false,
      message: 'Acércate al vendedor de munición.'
    });
    return;
  }

  const ammo = clamp(Number(p.ammo) || 0, 0, MAX_AMMO);
  const gold = Math.max(0, Number(p.gold) || 0);

  if (ammo >= MAX_AMMO) {
    send(ws, { type: 'shop_result', ok: false, message: 'Munición al máximo.' });
    return;
  }

  if (gold < AMMO_PACK_COST) {
    send(ws, { type: 'shop_result', ok: false, message: 'Necesitas 50 de oro.' });
    return;
  }

  const purchased = Math.min(AMMO_PACK_SIZE, MAX_AMMO - ammo);
  p.gold = gold - AMMO_PACK_COST;
  p.ammo = ammo + purchased;

  void persistPlayer(p);

  send(ws, {
    type: 'shop_result',
    ok: true,
    message: 'Compraste ' + purchased + ' balas.',
    gold: p.gold,
    ammo: p.ammo,
    maxAmmo: MAX_AMMO
  });

  sendStats(p);
}

function handleShot(ws) {
  const shooter = clients.get(ws);

  if (!shooter || !shooter.room || !shooter.alive) return;

  if (inSafeZone(shooter.x, shooter.y, 24)) {
    send(ws, { type: 'shot_result', ok: false, reason: 'safe_zone', ammo: shooter.ammo || 0 });
    return;
  }

  if ((shooter.ammo || 0) <= 0) {
    send(ws, { type: 'ammo_empty' });
    return;
  }

  const now = Date.now();
  const cooldown = Math.max(100, Math.min(1000, Number(shooter.fireRate) || 350));

  if (now - shooter.lastShot < cooldown) {
    send(ws, { type: 'shot_result', ok: false, reason: 'cooldown', ammo: shooter.ammo || 0 });
    return;
  }

  shooter.lastShot = now;

  const room = rooms.get(shooter.room);
  if (!room) return;

  const damage = clamp(Number(shooter.damage) || 25, 10, 150);
  const maxRange = 1000;

  let targetPlayer = null;
  let targetEnemy = null;
  let best = Infinity;

  const dirX = Math.cos(shooter.angle);
  const dirY = Math.sin(shooter.angle);

  for (const otherWs of room) {
    const targetPlayerData = clients.get(otherWs);

    if (
      !targetPlayerData ||
      targetPlayerData === shooter ||
      !targetPlayerData.alive ||
      inSafeZone(targetPlayerData.x, targetPlayerData.y, 24)
    ) {
      continue;
    }

    const dx = targetPlayerData.x - shooter.x;
    const dy = targetPlayerData.y - shooter.y;
    const d = Math.hypot(dx, dy);

    if (d > maxRange) continue;

    let diff = Math.atan2(dy, dx) - shooter.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));

    const hitWidth = 0.16 + 24 / Math.max(d, 60);

    if (Math.abs(diff) <= hitWidth && d < best) {
      best = d;
      targetPlayer = { ws: otherWs, p: targetPlayerData };
      targetEnemy = null;
    }
  }

  const enemies = ensureRoomEnemies(shooter.room);

  for (const enemy of enemies) {
    const dx = enemy.x - shooter.x;
    const dy = enemy.y - shooter.y;
    const d = Math.hypot(dx, dy);

    if (d > maxRange) continue;

    let diff = Math.atan2(dy, dx) - shooter.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));

    const hitWidth = 0.16 + enemy.r / Math.max(d, 60);

    if (Math.abs(diff) <= hitWidth && d < best) {
      best = d;
      targetEnemy = enemy;
      targetPlayer = null;
    }
  }

  const walls = ensureRoomWalls(shooter.room);
  let nearestWall = null;
  let nearestWallDistance = Infinity;

  for (const wall of walls) {
    const distance = rayAabbDistance(shooter.x, shooter.y, dirX, dirY, wall);
    if (distance >= 0 && distance <= maxRange && distance < nearestWallDistance) {
      nearestWallDistance = distance;
      nearestWall = wall;
    }
  }

  shooter.ammo = Math.max(0, (shooter.ammo || 0) - 1);

  send(ws, {
    type: 'shot_result',
    ok: true,
    ammo: shooter.ammo,
    x: shooter.x,
    y: shooter.y,
    angle: shooter.angle,
    damage
  });

  sendStats(shooter);

  broadcastRoom(shooter.room, {
    type: 'player_shot',
    id: shooter.id,
    x: shooter.x,
    y: shooter.y,
    angle: shooter.angle
  });

  if (nearestWall && nearestWallDistance <= best) {
    nearestWall.hp = clamp(nearestWall.hp - damage * 0.8, 0, nearestWall.maxHp);

    broadcastRoom(shooter.room, {
      type: 'wall_hit',
      id: nearestWall.id,
      hp: nearestWall.hp,
      x: nearestWall.x,
      y: nearestWall.y
    });

    if (nearestWall.hp <= 0) {
      const index = walls.findIndex((wall) => wall.id === nearestWall.id);
      if (index >= 0) walls.splice(index, 1);

      broadcastRoom(shooter.room, {
        type: 'wall_dead',
        id: nearestWall.id
      });
    }

    return;
  }

  if (targetPlayer) {
    const target = targetPlayer.p;
    const targetMaxHp = maxHpForLevel(target.level);

    const actualDamage = Math.max(1, damage - (target.defense || 0));

    target.hp = clamp(
      target.hp - actualDamage,
      0,
      targetMaxHp
    );

    addDefenseXp(target, actualDamage);

    send(targetPlayer.ws, {
      type: 'pvp_damage',
      from: shooter.id,
      amount: damage,
      hp: target.hp,
      maxHp: targetMaxHp
    });

    broadcastRoom(shooter.room, {
      type: 'pvp_hit',
      shooter: shooter.id,
      target: target.id,
      amount: actualDamage,
      hp: target.hp,
      maxHp: targetMaxHp
    });

    send(shooter.ws, {
      type: 'hit_confirm',
      kind: 'player',
      target: target.id,
      amount: actualDamage,
      x: target.x,
      y: target.y
    });

    if (target.hp <= 0) {
      target.alive = false;

      const lostScore = target.score || 0;

      applyDeathPenalty(target);
      const deathState = {
        x: spawnPosition(shooter.room).x,
        y: spawnPosition(shooter.room).y,
        hp: target.hp,
        maxHp: maxHpForLevel(target.level),
        xp: target.xp,
        gold: target.gold,
        damage: target.damage,
        defense: target.defense,
        level: target.level
      };
      respawnAfterDeath(target);
      deathState.x = target.x;
      deathState.y = target.y;

      shooter.kills = (shooter.kills || 0) + 1;
      shooter.pvpKills = (shooter.pvpKills || 0) + 1;
      shooter.score = (shooter.score || 0) + 25;
      shooter.xp = (shooter.xp || 0) + 40;
      addDamageXp(shooter, 20);

      levelUpIfNeeded(shooter);

      void persistPlayer(target);
      void persistPlayer(shooter);

      send(targetPlayer.ws, {
        type: 'pvp_dead',
        killer: shooter.name,
        lostScore,
        respawn: deathState
      });

      sendStats(target);
      sendStats(shooter);

      broadcastRoom(shooter.room, {
        type: 'pvp_kill',
        killer: shooter.id,
        target: target.id
      });

      sendPlayerList(shooter.room);
    }

    return;
  }

  if (targetEnemy) {
    targetEnemy.hp = clamp(targetEnemy.hp - damage, 0, targetEnemy.maxHp);

    broadcastRoom(shooter.room, {
      type: 'enemy_hit',
      id: targetEnemy.id,
      hp: targetEnemy.hp,
      x: targetEnemy.x,
      y: targetEnemy.y
    });

    send(shooter.ws, {
      type: 'hit_confirm',
      kind: 'enemy',
      target: targetEnemy.id,
      amount: damage,
      x: targetEnemy.x,
      y: targetEnemy.y
    });

    if (targetEnemy.hp <= 0) {
      const reward = targetEnemy.kind === 'elite' ? 30 : 12;
      const xp = targetEnemy.kind === 'elite' ? 35 : 20;

      shooter.gold = (shooter.gold || 0) + reward;

      const index = enemies.findIndex((enemy) => enemy.id === targetEnemy.id);
      if (index >= 0) enemies.splice(index, 1);

      shooter.kills = (shooter.kills || 0) + 1;
      shooter.score = (shooter.score || 0) + reward;
      shooter.xp = (shooter.xp || 0) + xp;
      addDamageXp(shooter, xp);

      levelUpIfNeeded(shooter);

      void persistPlayer(shooter);

      sendStats(shooter);

      broadcastRoom(shooter.room, {
        type: 'enemy_dead',
        id: targetEnemy.id,
        killer: shooter.id
      });
    }
  }
}

function createPlayer(ws) {
  const id = Math.random().toString(36).slice(2, 10);

  const player = {
    id,
    name: 'Jugador',
    saveKey: '',
    x: SAFE_ZONE.x,
    y: SAFE_ZONE.y,
    angle: 0,
    hp: 100,
    level: 1,
    damage: 25,
    defense: 0,
    damagePenalty: 0,
    defensePenalty: 0,
    fireRate: 350,
    score: 0,
    kills: 0,
    xp: 0,
    damageXp: 0,
    defenseXp: 0,
    pvpKills: 0,
    gold: 0,
    diamonds: 0,
    bankedGold: 0,
    bankedDiamonds: 0,
    ammo: 60,
    weapon: 'blaster',
    color: '#39e7ff',
    room: '',
    alive: true,
    frozen: false,
    lastShot: 0,
    speed: 205,
    lastStateAt: Date.now(),
    stateViolations: 0,
    lastChatAt: 0,
    lastPersistAt: 0,
    lastEnemySyncAt: 0,
    persistChain: Promise.resolve(),
    hasSaved: false,
    joined: false,
    ws
  };

  return player;
}

const httpServer = http.createServer(async (req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });

    return res.end(
      JSON.stringify({
        ok: true,
        game: 'Neon Core',
        players: clients.size,
        rooms: rooms.size,
        pvp: true,
        version: SERVER_VERSION,
        startedAt: SERVER_STARTED_AT,
        storage: storage.enabled ? 'postgres' : 'memory',
        status: 'online',
        diagnostics: {
          rooms: rooms.size,
          players: clients.size,
          publicRooms: PUBLIC_ROOMS.length,
          walls: WORLD_WALLS.length,
          enemyTarget: 18,
          storageConfigured: Boolean(process.env.DATABASE_URL),
          storageReady: storage.enabled
        }
      })
    );
  }

  res.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end('Not Found');
});

const wss = new WebSocketServer({
  server: httpServer,
  path: '/ws',
  maxPayload: 16 * 1024
});

wss.on('connection', (ws) => {
  const player = createPlayer(ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  clients.set(ws, player);

  send(ws, {
    type: 'connected',
    id: player.id
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const p = clients.get(ws);

      if (!p || !msg || typeof msg.type !== 'string') return;

      if (msg.type === 'join') {
        if (p.joined) {
          send(ws, { type: 'room_error', message: 'Esta conexión ya está vinculada a una partida.' });
          return;
        }

        p.name = String(msg.name || 'Jugador').trim().slice(0, 20) || 'Jugador';
        p.saveKey = String(msg.saveKey || '')
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 80);

        if (p.saveKey) {
          // Una reconexión válida puede llegar antes de que el cierre de la
          // conexión anterior termine de procesarse. Reemplazamos esa sesión
          // vieja en vez de rechazar la nueva indefinidamente.
          for (const [oldWs, oldP] of clients) {
            if (oldWs === ws || !oldP?.saveKey || oldP.saveKey !== p.saveKey) continue;

            try {
              oldP.frozen = true;
            } catch {}

            try {
              if (oldP.room) {
                await leaveRoom(oldWs);
              } else if (oldP.saveKey) {
                await persistPlayer(oldP);
              }
            } catch (error) {
              console.error('[WS SESSION REPLACE]', error?.message || error);
            }

            clients.delete(oldWs);

            try {
              oldWs.close(4001, 'replaced_session');
            } catch {}
          }
        }

        const saved = await loadSavedPlayer(p.saveKey);
        p.hasSaved = !!saved;

        if (saved) {
          // La posición nunca se persiste: cada nueva conexión empieza en la zona segura.
          p.level = clamp(Number(saved.level) || 1, 1, 1000);
          const savedHp = Number(saved.hp);
          p.hp = savedHp > 0 ? savedHp : maxHpForLevel(p.level);
          p.score = Number(saved.score) || 0;
          p.kills = Number(saved.kills) || 0;
          p.xp = Number(saved.xp) || 0;
          p.damageXp = Math.max(0, Number(saved.damageXp) || 0);
          p.defenseXp = Math.max(0, Number(saved.defenseXp) || 0);
          p.pvpKills = Number(saved.pvpKills) || 0;
          p.gold = Math.max(0, Number(saved.gold) || 0);
          p.diamonds = Math.max(0, Number(saved.diamonds) || 0);
          p.ammo = clamp(Number(saved.ammo) || 0, 0, MAX_AMMO);
          if (p.ammo <= 0) p.ammo = 60;
          p.bankedGold = Math.max(0, Number(saved.bankedGold) || 0);
          p.bankedDiamonds = Math.max(0, Number(saved.bankedDiamonds) || 0);
          p.weapon = WEAPONS[saved.weapon] ? saved.weapon : 'blaster';
          p.damagePenalty = Math.max(0, Number(saved.damagePenalty) || 0);
          p.defensePenalty = Math.max(0, Number(saved.defensePenalty) || 0);
        }

        if (msg.color) {
          const color = String(msg.color);
          p.color = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#39e7ff';
        }

        applyCombatStats(p);
        p.joined = true;

        if (msg.room) {
          await joinRoom(ws, msg.room, false);
        } else if (msg.createRoom) {
          await joinRoom(ws, '', true);
        } else {
          await joinRoom(ws, 'OPEN', false);
        }

        if (p.room) {
          broadcastRoom(
            p.room,
            {
              type: 'player_update',
              player: publicPlayer(p)
            },
            ws
          );
          sendPlayerList(p.room);
        }

        return;
      }

      if (msg.type === 'chat') {
        if (!p.room || p.frozen) return;

        const now = Date.now();
        if (now - (p.lastChatAt || 0) < 700) return;

        const text = String(msg.text || '')
          .replace(/[\u0000-\u001F\u007F]/g, ' ')
          .trim()
          .slice(0, 120);

        if (!text) return;

        p.lastChatAt = now;

        broadcastRoom(p.room, {
          type: 'chat',
          id: p.id,
          name: p.name,
          text,
          at: now
        });

        return;
      }

      if (msg.type === 'create_room') {
        await joinRoom(ws, '', true);
        return;
      }

      if (msg.type === 'join_room') {
        await joinRoom(ws, msg.code, false);
        return;
      }

      if (msg.type === 'state') {
        if (!p.room || p.frozen || !p.alive) return;

        const nx = Number.isFinite(Number(msg.x)) ? Number(msg.x) : p.x;
        const ny = Number.isFinite(Number(msg.y)) ? Number(msg.y) : p.y;
        const now = Date.now();

        const elapsed = Math.max(
          0.05,
          Math.min(1, (now - p.lastStateAt) / 1000)
        );

        const distance = Math.hypot(nx - p.x, ny - p.y);
        const maxDistance = Math.max(60, p.speed * elapsed + 45);

        // El cliente puede avanzar localmente mientras un paquete tarda en llegar.
        // En vez de congelarlo o expulsarlo por una ráfaga de latencia, limitamos
        // el paso al máximo permitido y sincronizamos la posición aceptada.
        let acceptedX = nx;
        let acceptedY = ny;
        let movementClamped = false;

        if (distance > maxDistance) {
          const ratio = maxDistance / Math.max(distance, 0.0001);
          acceptedX = p.x + (nx - p.x) * ratio;
          acceptedY = p.y + (ny - p.y) * ratio;
          movementClamped = true;
        }

        const walls = ensureRoomWalls(p.room);

        // Resolver el movimiento por ejes. Si el destino completo choca con una
        // pared, conservamos el eje libre para evitar que una colisión diagonal
        // deje al jugador completamente inmóvil.
        let finalX = acceptedX;
        let finalY = acceptedY;
        let blockedX = false;
        let blockedY = false;

        if (collidesWithWall(finalX, finalY, 16, walls)) {
          if (collidesWithWall(finalX, p.y, 16, walls)) {
            finalX = p.x;
            blockedX = true;
          }
          if (collidesWithWall(finalX, finalY, 16, walls)) {
            if (collidesWithWall(p.x, finalY, 16, walls)) {
              finalY = p.y;
              blockedY = true;
            }
          }
        }

        // Si por alguna geometría el destino sigue dentro de una pared, no
        // aceptamos ese paquete, pero tampoco teletransportamos al jugador.
        if (collidesWithWall(finalX, finalY, 16, walls)) {
          finalX = p.x;
          finalY = p.y;
          blockedX = true;
          blockedY = true;
        }

        p.stateViolations = Math.max(0, p.stateViolations - 1);
        p.lastStateAt = now;
        p.x = clamp(finalX, 35, WORLD.w - 35);
        p.y = clamp(finalY, 35, WORLD.h - 35);

        const correctionDistance = Math.hypot(p.x - nx, p.y - ny);
        if (movementClamped || blockedX || blockedY || correctionDistance > 48) {
          send(ws, {
            type: 'state_sync',
            x: p.x,
            y: p.y,
            reason: blockedX || blockedY ? 'wall' : 'movement_clamped',
            serverTime: now
          });
        }

        if (Number.isFinite(Number(msg.angle))) {
          const angle = Number(msg.angle);
          if (Math.abs(angle) <= Math.PI * 4) {
            p.angle = Math.atan2(Math.sin(angle), Math.cos(angle));
          }
        }

        broadcastRoom(
          p.room,
          {
            type: 'player_update',
            player: publicPlayer(p)
          },
          ws
        );

        return;
      }

      if (msg.type === 'fire') {
        if (!p.frozen) handleShot(ws);
        return;
      }

      if (msg.type === 'deposit_bank') {
        if (!p.frozen) await depositBank(ws);
        return;
      }

      if (msg.type === 'withdraw_bank') {
        if (!p.frozen) await withdrawBank(ws);
        return;
      }

      if (msg.type === 'buy_ammo') {
        if (!p.frozen) buyAmmo(ws);
        return;
      }

      if (msg.type === 'buy_weapon') {
        if (!p.frozen) shopBuy(ws, msg.weapon);
        return;
      }

      if (msg.type === 'save_on_exit') {
        if (!p.room || !p.saveKey) return;
        p.exitSaveRequested = true;
        await persistPlayer(p);
        send(ws, { type: 'save_complete', savedAt: Date.now() });
        return;
      }

      if (msg.type === 'respawn') {
        if (!p.room || p.alive) return;

        const spawn = spawnPosition(p.room);

        p.x = spawn.x;
        p.y = spawn.y;
        p.angle = 0;
        p.alive = true;
        p.frozen = false;
        const checkpoint = null;

        if (checkpoint) {
          p.x = Number.isFinite(Number(checkpoint.x)) ? Number(checkpoint.x) : p.x;
          p.y = Number.isFinite(Number(checkpoint.y)) ? Number(checkpoint.y) : p.y;
          p.level = clamp(Number(checkpoint.level) || 1, 1, 1000);
          p.hp = Number(checkpoint.hp) > 0 ? Number(checkpoint.hp) : maxHpForLevel(p.level);
          p.score = Number(checkpoint.score) || 0;
          p.kills = Number(checkpoint.kills) || 0;
          p.xp = Number(checkpoint.xp) || 0;
          p.pvpKills = Number(checkpoint.pvpKills) || 0;
          p.gold = Math.max(0, Number(checkpoint.gold) || 0);
          p.diamonds = Math.max(0, Number(checkpoint.diamonds) || 0);
          p.ammo = clamp(Number(checkpoint.ammo) || 0, 0, MAX_AMMO);
          p.weapon = WEAPONS[checkpoint.weapon] ? checkpoint.weapon : 'blaster';
        } else {
          p.hp = maxHpForLevel(p.level);
          p.ammo = Math.max(30, clamp(Number(p.ammo) || 0, 0, MAX_AMMO));
        }

        p.lastShot = 0;
        applyCombatStats(p);

        await persistPlayer(p);

        send(ws, {
          type: 'respawn_ok',
          x: p.x,
          y: p.y,
          hp: p.hp,
          maxHp: maxHpForLevel(p.level),
          speed: p.speed,
          weapon: p.weapon,
          enemies: ensureRoomEnemies(p.room),
          walls: ensureRoomWalls(p.room),
          safeZone: SAFE_ZONE,
          spawnProtectionMs: 5000
        });

        sendStats(p);
        broadcastRoom(p.room, {
          type: 'player_update',
          player: publicPlayer(p)
        }, ws);
        sendPlayerList(p.room);
      }
    } catch (error) {
      console.error('[WS MESSAGE]', error?.stack || error);
      try {
        send(ws, {
          type: 'server_error',
          message: 'El servidor rechazó una operación inválida.'
        });
      } catch {}
    }
  });

  ws.on('close', () => {
    void (async () => {
      try {
        const current = clients.get(ws);
        if (current?.saveKey) await persistPlayer(current);
        await leaveRoom(ws);
      } catch (error) {
        console.error('[WS CLOSE]', error?.message || error);
      } finally {
        clients.delete(ws);
      }
    })();
  });

  ws.on('error', (error) => {
    console.error('[WS ERROR]', error?.message || error);
  });
});

const storageReady = storage.initStorage().catch((error) => {
  console.error('[STORAGE INIT]', error?.stack || error);
  return false;
});

storage.ready = storageReady;

setInterval(() => {
  const now = Date.now();
  const dt = TICK_MS / 1000;

  for (const p of clients.values()) {
    if (!p.room || !p.alive || p.frozen) continue;

    const maxHp = maxHpForLevel(p.level);

    if (p.hp < maxHp) {
      p.hp = Math.min(maxHp, p.hp + HP_REGEN_PER_SEC * dt);

      send(p.ws, {
        type: 'hp_regen',
        hp: p.hp,
        maxHp
      });
    }

    if (p.saveKey && now - p.lastPersistAt >= AUTOSAVE_MS) {
      void persistPlayer(p);
    }
  }
}, TICK_MS);

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.size) continue;

    const enemies = ensureRoomEnemies(code);
    const walls = ensureRoomWalls(code);
    const players = roomPlayers(room).filter((p) => p.alive && !p.frozen);

    for (const enemy of enemies) {
      let target = null;
      let best = Infinity;

      for (const pl of players) {
        const d = Math.hypot(pl.x - enemy.x, pl.y - enemy.y);
        if (d < best) {
          best = d;
          target = pl;
        }
      }

      if (target && inSafeZone(target.x, target.y, 24)) target = null;

      if (target) {
        const distance = Math.max(best, 1);
        const dx = (target.x - enemy.x) / distance;
        const dy = (target.y - enemy.y) / distance;

        enemy.vx = dx * enemy.speed;
        enemy.vy = dy * enemy.speed;

        const nextX = clamp(enemy.x + enemy.vx * (TICK_MS / 1000), 35, WORLD.w - 35);
        const nextY = clamp(enemy.y + enemy.vy * (TICK_MS / 1000), 35, WORLD.h - 35);

        if (!collidesWithWall(nextX, nextY, enemy.r, walls)) {
          enemy.x = nextX;
          enemy.y = nextY;
        }

        if (inSafeZone(enemy.x, enemy.y, enemy.r)) {
          const dxSafe = enemy.x - SAFE_ZONE.x;
          const dySafe = enemy.y - SAFE_ZONE.y;
          const dSafe = Math.max(1, Math.hypot(dxSafe, dySafe));

          enemy.x =
            SAFE_ZONE.x + (dxSafe / dSafe) * (SAFE_ZONE.r + enemy.r + 4);
          enemy.y =
            SAFE_ZONE.y + (dySafe / dSafe) * (SAFE_ZONE.r + enemy.r + 4);
        }

        if (
          best < enemy.r + 24 &&
          now - (enemy.lastAttackAt || 0) >= ENEMY_ATTACK_COOLDOWN_MS &&
          hasLineOfSight(enemy.x, enemy.y, target.x, target.y, walls)
        ) {
          enemy.lastAttackAt = now;
          const actualDamage =
            Math.max(0.5, enemy.damage - (target.defense || 0)) *
            (TICK_MS / 1000);

          target.hp = clamp(
            target.hp - actualDamage,
            0,
            maxHpForLevel(target.level)
          );

          addDefenseXp(target, actualDamage);

          const found = findPlayer(target.id, room);
          if (found) {
            send(found.ws, {
              type: 'pve_damage',
              amount: enemy.damage * (TICK_MS / 1000),
              hp: target.hp,
              maxHp: maxHpForLevel(target.level)
            });
          }

          if (target.hp <= 0 && target.alive && !target.frozen) {
            target.alive = false;

            const lostScore = target.score || 0;

            applyDeathPenalty(target);
            respawnAfterDeath(target);
            void persistPlayer(target);

            const foundTarget = findPlayer(target.id, room);

            if (foundTarget) {
              send(foundTarget.ws, {
                type: 'pve_dead',
                lostScore,
                respawn: {
                  x: target.x,
                  y: target.y,
                  hp: target.hp,
                  maxHp: maxHpForLevel(target.level),
                  xp: target.xp,
                  gold: target.gold,
                  damage: target.damage,
                  defense: target.defense,
                  level: target.level
                }
              });
              sendStats(target);
            }

            sendPlayerList(code);
          }
        }
      }
    }

    while (enemies.length < 18) enemies.push(makeEnemy());

    broadcastRoom(code, {
      type: 'enemy_state',
      enemies
    });
  }
}, ENEMY_SYNC_MS);

process.on('SIGTERM', async () => {
  for (const p of clients.values()) {
    await persistPlayer(p);
  }
  try {
    await storage.closeStorage();
  } catch {}
  process.exit(0);
});

process.on('SIGINT', async () => {
  for (const p of clients.values()) {
    await persistPlayer(p);
  }
  try {
    await storage.closeStorage();
  } catch {}
  process.exit(0);
});

function runServerDiagnostics() {
  const problems = [];
  if (WORLD.w <= 0 || WORLD.h <= 0) problems.push('WORLD inválido');
  if (MAX_PLAYERS < 1) problems.push('MAX_PLAYERS inválido');
  if (PUBLIC_ROOMS.some((code) => !rooms.has(code))) problems.push('Sala pública ausente');
  if (WORLD_WALLS.length < 20) problems.push('Muy pocos muros');
  if (Object.keys(WEAPONS).length < 3) problems.push('Arsenal incompleto');

  if (problems.length) {
    console.error('[DIAGNOSTIC] FAIL ' + problems.join(' | '));
    return false;
  }

  console.log(
    '[DIAGNOSTIC] PASS build=' + SERVER_VERSION +
    ' rooms=' + rooms.size +
    ' walls=' + WORLD_WALLS.length +
    ' weapons=' + Object.keys(WEAPONS).length +
    ' storage=' + (storage.enabled ? 'postgres' : 'memory')
  );
  return true;
}

runServerDiagnostics();

const websocketHeartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch {}
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 30000);

httpServer.listen(PORT, () => {
  console.log(
    'Neon Core multiplayer server listening on ' +
      PORT +
      ' · version ' +
      SERVER_VERSION
  );
});
