'use strict';

const SKINS = Object.freeze({
  core_default: { id:'core_default', name:'NÚCLEO ORIGINAL', rarity:'Común', type:'skin', priceGold:0, priceDiamonds:0, priceUsd:0, style:'core', defenseBonus:0 },
  pixel_cyan: { id:'pixel_cyan', name:'PIXEL CYAN', rarity:'Raro', type:'skin', priceGold:5000, priceDiamonds:0, priceUsd:0, style:'pixel', defenseBonus:0 },
  rust_core: { id:'rust_core', name:'NÚCLEO OXIDADO', rarity:'Raro', type:'skin', priceGold:1500, priceDiamonds:0, priceUsd:0, style:'rust', defenseBonus:0 },
  toxic_orb: { id:'toxic_orb', name:'ORBE TÓXICO', rarity:'Épico', type:'skin', priceGold:12000, priceDiamonds:0, priceUsd:0, style:'toxic', defenseBonus:0 },
  plasma_violet: { id:'plasma_violet', name:'PLASMA VIOLETA', rarity:'Mítico', type:'skin', priceGold:60000, priceDiamonds:0, priceUsd:0, style:'plasma', defenseBonus:0 },
  aurora: { id:'aurora', name:'AURORA', rarity:'Épico', type:'skin', priceGold:0, priceDiamonds:250, priceUsd:0, style:'aurora', defenseBonus:0 },
  nebula_prism: { id:'nebula_prism', name:'NEBULOSA PRISMA', rarity:'Mítico', type:'skin', priceGold:0, priceDiamonds:4500, priceUsd:0, style:'nebula', defenseBonus:0 },
  eclipse_gold: { id:'eclipse_gold', name:'ECLIPSE DORADO', rarity:'Legendario', type:'skin', priceGold:0, priceDiamonds:2000, priceUsd:0, style:'eclipse', defenseBonus:0 },
  celestial: { id:'celestial', name:'CIELO CELESTE', rarity:'Legendario', type:'skin', priceGold:0, priceDiamonds:7500, priceUsd:0, style:'celestial', defenseBonus:0 },
  angel_seraph: { id:'angel_seraph', name:'ÁNGEL SERAFÍN', rarity:'Legendario', type:'skin', priceGold:0, priceDiamonds:12000, priceUsd:0, style:'angel', defenseBonus:0 },
  demon_infernal: { id:'demon_infernal', name:'DEMONIO INFERNAL', rarity:'Supremo', type:'skin', priceGold:0, priceDiamonds:25000, priceUsd:0, style:'demon', defenseBonus:0 },
  eternal_void: { id:'eternal_void', name:'VACÍO ETERNO', rarity:'Supremo', type:'skin', priceGold:0, priceDiamonds:30000, priceUsd:0, style:'void', defenseBonus:0 },
  gm_core: { id:'gm_core', name:'SOBERANO DEL NÚCLEO', rarity:'Supremo', type:'skin', priceGold:0, priceDiamonds:50000, priceUsd:0, style:'gm', defenseBonus:0 }
});

const WEAPON_SKINS = Object.freeze({});

const REAL_MONEY_OFFERS = Object.freeze([
  { sku:'gm_core_usd', name:'SOBERANO DEL NÚCLEO', description:'Skin premium individual.', priceUsd:1, skinId:'gm_core', enabled:false }
]);

const REDEEM_CODES = Object.freeze({
  // enabled:true  -> el código se puede canjear.
  // enabled:false -> queda bloqueado sin borrar el código.
  // repeatable:true -> se puede volver a ejecutar para pruebas.
  NEONCORE_TEST_ALL: {
    enabled:true,
    repeatable:true,
    allSkins:true,
    allWeapons:true,
    message:'TEST ALL: desbloqueaste todas las armas y todas las skins.'
  },

  WEAPON_BLASTER: { enabled:true, weaponId:'blaster', message:'Código válido: desbloqueaste BLASTER · NEONSTORM.' },
  WEAPON_PULSE: { enabled:true, weaponId:'pulse', message:'Código válido: desbloqueaste PULSE · PRISMA.' },
  WEAPON_CANNON: { enabled:true, weaponId:'cannon', message:'Código válido: desbloqueaste CANNON · SOLARIS.' },
  WEAPON_RAILGUN: { enabled:true, weaponId:'railgun', message:'Código válido: desbloqueaste RAILGUN · ECLIPSE.' },
  WEAPON_NOVA: { enabled:true, weaponId:'nova', message:'Código válido: desbloqueaste NOVA · SUPERNOVA.' },
  WEAPON_PLASMA: { enabled:true, weaponId:'plasma', message:'Código válido: desbloqueaste PLASMA · INFERNO.' },
  WEAPON_VORTEX: { enabled:true, weaponId:'vortex', message:'Código válido: desbloqueaste VORTEX · SHARD.' },
  WEAPON_QUASAR: { enabled:true, weaponId:'quasar', message:'Código válido: desbloqueaste QUASAR · RAY.' },
  WEAPON_SINGULARITY: { enabled:true, weaponId:'singularity', message:'Código válido: desbloqueaste SINGULARITY · CORE.' },
  WEAPON_OMEGA: { enabled:true, weaponId:'omega', message:'Código válido: desbloqueaste OMEGA · ASCENSION.' },

  SKIN_PIXEL_CYAN: { enabled:true, skinId:'pixel_cyan', message:'Código válido: desbloqueaste PIXEL CYAN.' },
  SKIN_RUST_CORE: { enabled:true, skinId:'rust_core', message:'Código válido: desbloqueaste NÚCLEO OXIDADO.' },
  SKIN_TOXIC_ORB: { enabled:true, skinId:'toxic_orb', message:'Código válido: desbloqueaste ORBE TÓXICO.' },
  SKIN_PLASMA_VIOLET: { enabled:true, skinId:'plasma_violet', message:'Código válido: desbloqueaste PLASMA VIOLETA.' },
  SKIN_AURORA: { enabled:true, skinId:'aurora', message:'Código válido: desbloqueaste AURORA.' },
  SKIN_NEBULA_PRISM: { enabled:true, skinId:'nebula_prism', message:'Código válido: desbloqueaste NEBULOSA PRISMA.' },
  SKIN_ECLIPSE_GOLD: { enabled:true, skinId:'eclipse_gold', message:'Código válido: desbloqueaste ECLIPSE DORADO.' },
  SKIN_CELESTIAL: { enabled:true, skinId:'celestial', message:'Código válido: desbloqueaste CIELO CELESTE.' },
  SKIN_ANGEL_SERAPH: { enabled:true, skinId:'angel_seraph', message:'Código válido: desbloqueaste ÁNGEL SERAFÍN.' },
  SKIN_DEMON_INFERNAL: { enabled:true, skinId:'demon_infernal', message:'Código válido: desbloqueaste DEMONIO INFERNAL.' },
  SKIN_ETERNAL_VOID: { enabled:true, skinId:'eternal_void', message:'Código válido: desbloqueaste VACÍO ETERNO.' },
  SKIN_GM_CORE: { enabled:true, skinId:'gm_core', message:'Código válido: desbloqueaste SOBERANO DEL NÚCLEO.' },

  // Códigos antiguos conservados como alias.
  NEONSTART: { enabled:true, skinId:'pixel_cyan', message:'Código válido: desbloqueaste PIXEL CYAN.' },
  STARFORGE: { enabled:true, weaponId:'pulse', message:'Código válido: desbloqueaste PULSE · PRISMA.' },
  NEONARMORY: { enabled:true, weaponId:'plasma', message:'Código válido: desbloqueaste PLASMA · INFERNO.' },
  SOBERANO2026: { enabled:true, skinId:'gm_core', message:'Código válido: desbloqueaste SOBERANO DEL NÚCLEO.' }
});

function getSkin(id) { return SKINS[String(id || '')]; }
function getWeaponSkin(id) { return WEAPON_SKINS[String(id || '')]; }

function normalizeOwnedSkins(value) {
  const input = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const id = String(raw || '');
    if (!SKINS[id] || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (!seen.has('core_default')) out.unshift('core_default');
  return out;
}

function normalizeOwnedWeaponSkins(value) {
  const input = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const id = String(raw || '');
    if (!WEAPON_SKINS[id] || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function normalizeRedeemedCodes(value) {
  const input = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const code = String(raw || '').trim().toUpperCase().slice(0,32);
    if (!code || !REDEEM_CODES[code] || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

function publicCatalog() {
  return Object.values(SKINS).map(skin => ({
    id:skin.id, name:skin.name, rarity:skin.rarity, type:skin.type,
    priceGold:skin.priceGold, priceDiamonds:skin.priceDiamonds, priceUsd:skin.priceUsd,
    style:skin.style, defenseBonus:skin.defenseBonus, realMoney:!!skin.realMoney,
    redeemable:Object.values(REDEEM_CODES).some(x=>x.skinId===skin.id || x.allSkins)
  }));
}

function publicWeaponCatalog() {
  return [];
}

function publicRealMoneyOffers() { return REAL_MONEY_OFFERS.map(offer => ({...offer})); }

module.exports = {
  SKINS, WEAPON_SKINS, REAL_MONEY_OFFERS, REDEEM_CODES,
  getSkin, getWeaponSkin, normalizeOwnedSkins, normalizeOwnedWeaponSkins,
  normalizeRedeemedCodes, publicCatalog, publicWeaponCatalog, publicRealMoneyOffers
};
