'use strict';

const SKINS = Object.freeze({
  core_default: {
    id: 'core_default',
    name: 'NÚCLEO ORIGINAL',
    rarity: 'Común',
    type: 'skin',
    priceGold: 0,
    priceDiamonds: 0,
    style: 'core'
  },
  pixel_cyan: {
    id: 'pixel_cyan',
    name: 'PIXEL CYAN',
    rarity: 'Código',
    type: 'skin',
    priceGold: 0,
    priceDiamonds: 0,
    style: 'pixel'
  },
  rust_core: {
    id: 'rust_core',
    name: 'NÚCLEO OXIDADO',
    rarity: 'Raro',
    type: 'skin',
    priceGold: 1500,
    priceDiamonds: 0,
    style: 'rust'
  },
  toxic_orb: {
    id: 'toxic_orb',
    name: 'ORBE TÓXICO',
    rarity: 'Épico',
    type: 'skin',
    priceGold: 12000,
    priceDiamonds: 0,
    style: 'toxic'
  },
  plasma_violet: {
    id: 'plasma_violet',
    name: 'PLASMA VIOLETA',
    rarity: 'Mítico',
    type: 'skin',
    priceGold: 60000,
    priceDiamonds: 0,
    style: 'plasma'
  },
  aurora: {
    id: 'aurora',
    name: 'AURORA',
    rarity: 'Épico',
    type: 'skin',
    priceGold: 0,
    priceDiamonds: 250,
    style: 'aurora'
  },
  eclipse_gold: {
    id: 'eclipse_gold',
    name: 'ECLIPSE DORADO',
    rarity: 'Legendario',
    type: 'skin',
    priceGold: 0,
    priceDiamonds: 2000,
    style: 'eclipse'
  },
  celestial: {
    id: 'celestial',
    name: 'CIELO CELESTE',
    rarity: 'Legendario',
    type: 'skin',
    priceGold: 0,
    priceDiamonds: 7500,
    style: 'celestial'
  },
  eternal_void: {
    id: 'eternal_void',
    name: 'VACÍO ETERNO',
    rarity: 'Supremo',
    type: 'skin',
    priceGold: 0,
    priceDiamonds: 30000,
    style: 'void'
  }
});

const REAL_MONEY_OFFERS = Object.freeze([
  { sku: 'skin_pack_01', name: 'PAQUETE NEON I', description: 'Cosméticos exclusivos futuros.', priceUsd: 2.99, skinId: 'plasma_violet', enabled: false },
  { sku: 'skin_pack_02', name: 'PAQUETE NEON II', description: 'Cosméticos premium futuros.', priceUsd: 7.99, skinId: 'eclipse_gold', enabled: false },
  { sku: 'skin_pack_03', name: 'COLECCIÓN ETERNA', description: 'Cosméticos premium de máxima rareza.', priceUsd: 19.99, skinId: 'eternal_void', enabled: false }
]);

const REDEEM_CODES = Object.freeze({
  NEONSTART: {
    skinId: 'pixel_cyan',
    message: 'Código válido: desbloqueaste PIXEL CYAN.'
  }
});

function getSkin(id) {
  return SKINS[String(id || '')];
}

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

function normalizeRedeemedCodes(value) {
  const input = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();

  for (const raw of input) {
    const code = String(raw || '').trim().toUpperCase().slice(0, 32);
    if (!code || !REDEEM_CODES[code] || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }

  return out;
}

function publicCatalog() {
  return Object.values(SKINS).map((skin) => ({
    id: skin.id,
    name: skin.name,
    rarity: skin.rarity,
    type: skin.type,
    priceGold: skin.priceGold,
    priceDiamonds: skin.priceDiamonds,
    style: skin.style
  }));
}

function publicRealMoneyOffers() {
  return REAL_MONEY_OFFERS.map((offer) => ({ ...offer }));
}

module.exports = {
  SKINS,
  REAL_MONEY_OFFERS,
  REDEEM_CODES,
  getSkin,
  normalizeOwnedSkins,
  normalizeRedeemedCodes,
  publicCatalog,
  publicRealMoneyOffers
};
