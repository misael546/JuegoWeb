'use strict';

const SKINS = Object.freeze({
  core_default: { id:'core_default', name:'NÚCLEO ORIGINAL', rarity:'Común', type:'skin', priceGold:0, priceDiamonds:0, priceUsd:0, style:'core', defenseBonus:0 },
  pixel_cyan: { id:'pixel_cyan', name:'PIXEL CYAN', rarity:'Código', type:'skin', priceGold:0, priceDiamonds:0, priceUsd:0, style:'pixel', defenseBonus:0 },
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
  gm_core: { id:'gm_core', name:'SOBERANO DEL NÚCLEO', rarity:'Supremo', type:'skin', priceGold:0, priceDiamonds:0, priceUsd:1, style:'gm', defenseBonus:0, realMoney:true }
});

const WEAPON_SKINS = Object.freeze({
  blaster_neonstorm: { id:'blaster_neonstorm', name:'BLASTER · NEONSTORM', weaponId:'blaster', rarity:'Raro', priceGold:2500, priceDiamonds:0, attackBonus:8, defenseBonus:0, style:'neonstorm' },
  pulse_prism: { id:'pulse_prism', name:'PULSE · PRISMA', weaponId:'pulse', rarity:'Épico', priceGold:10000, priceDiamonds:0, attackBonus:15, defenseBonus:0, style:'prism' },
  cannon_solaris: { id:'cannon_solaris', name:'CANNON · SOLARIS', weaponId:'cannon', rarity:'Legendario', priceGold:0, priceDiamonds:1200, attackBonus:25, defenseBonus:0, style:'solaris' },
  railgun_eclipse: { id:'railgun_eclipse', name:'RAILGUN · ECLIPSE', weaponId:'railgun', rarity:'Supremo', priceGold:0, priceDiamonds:7000, attackBonus:40, defenseBonus:0, style:'eclipse' },
  nova_supernova: { id:'nova_supernova', name:'NOVA · SUPERNOVA', weaponId:'nova', rarity:'Supremo', priceGold:0, priceDiamonds:18000, attackBonus:65, defenseBonus:0, style:'supernova' }
});

const REAL_MONEY_OFFERS = Object.freeze([
  { sku:'gm_core_usd', name:'SOBERANO DEL NÚCLEO', description:'Skin premium individual.', priceUsd:1, skinId:'gm_core', enabled:false }
]);

const REDEEM_CODES = Object.freeze({
  NEONSTART: { skinId:'pixel_cyan', message:'Código válido: desbloqueaste PIXEL CYAN.' },
  STARFORGE: { weaponId:'pulse', message:'Código válido: desbloqueaste PULSE y quedó equipado.' },
  NEONARMORY: { weaponSkinId:'blaster_neonstorm', message:'Código válido: desbloqueaste BLASTER · NEONSTORM y quedó equipado.' },
  SOBERANO2026: { skinId:'gm_core', message:'Código de regalo válido: desbloqueaste SOBERANO DEL NÚCLEO para pruebas.' }
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
    redeemable:skin.rarity==='Código' || Object.values(REDEEM_CODES).some(x=>x.skinId===skin.id)
  }));
}

function publicWeaponCatalog() {
  return Object.values(WEAPON_SKINS).map(skin => ({
    id:skin.id, name:skin.name, weaponId:skin.weaponId, rarity:skin.rarity,
    priceGold:skin.priceGold, priceDiamonds:skin.priceDiamonds,
    attackBonus:skin.attackBonus, defenseBonus:skin.defenseBonus, style:skin.style,
    redeemable:Object.values(REDEEM_CODES).some(x=>x.weaponSkinId===skin.id)
  }));
}

function publicRealMoneyOffers() { return REAL_MONEY_OFFERS.map(offer => ({...offer})); }

module.exports = {
  SKINS, WEAPON_SKINS, REAL_MONEY_OFFERS, REDEEM_CODES,
  getSkin, getWeaponSkin, normalizeOwnedSkins, normalizeOwnedWeaponSkins,
  normalizeRedeemedCodes, publicCatalog, publicWeaponCatalog, publicRealMoneyOffers
};
