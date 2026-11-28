// Uitzicht van de troepen: de smidse bepaalt de uitrusting (leer en brons, ijzer en maliën, plaatharnas),
// het onderzoek in de Academie geeft herkenbare details (groot schild, pluim, vuurpijlen, lange boog, kleed, lans, ...).
// Gedeeld door de stad (town.js) en het slagveld (siegeview.js).
import { gearOf, techTier } from '../shared/rules.js';

const HELM = ['#b0803a', '#9aa3ad', '#dfe4ea']; // brons, ijzer, staal

// look = { gear: 0-2, inf: 0-3, rng: 0-3, cav: 0-3 } uit het niveau van de smidse en het onderzoek
export function lookOf(smithy, tech) {
  return { gear: gearOf(smithy || 0), inf: techTier(tech, 'inf'), rng: techTier(tech, 'rng'), cav: techTier(tech, 'cav') };
}

const INF_KIT = ['', 'S', 'SP', 'SPG'];
const RNG_KIT = ['', 'F', 'FL', 'FLQ'];
const CAV_KIT = ['', 'B', 'BN', 'BNH'];

// opties voor A.person / A.horseman, of null als het geen gewone soldaat is
export function soldierOpts(kind, look) {
  const L = look || { gear: 0, inf: 0, rng: 0, cav: 0 };
  const g = L.gear;
  const plate = g >= 2 ? 1 : undefined;
  switch (kind) {
    case 'spear': return { fig: 'p', body: '#7b5a3a', helmet: HELM[g], armor: g >= 1, plate, weapon: 'spear', kit: INF_KIT[L.inf] || undefined };
    case 'sword': return { fig: 'p', body: '#5b6b85', helmet: HELM[Math.max(1, g)], armor: true, plate, weapon: 'sword', kit: INF_KIT[L.inf] || undefined };
    case 'archer': return { fig: 'p', body: '#4f7a3a', hat: ['#3f5a2a', '#6d7680', '#a7afb9'][g], armor: g >= 2, plate, weapon: 'bow', kit: RNG_KIT[L.rng] || undefined };
    case 'scout': return { fig: 'h', s: 0.8, body: '#8a6a43', horse: '#a0703c', hat: '#6b4a2b', kit: L.cav ? 'B' : undefined };
    case 'rider': return { fig: 'h', s: 0.85, body: '#7a2b2b', helmet: HELM[g], armor: g >= 1, plate, weapon: L.cav >= 2 ? 'lance' : 'spear', horse: '#7b4f2c', kit: CAV_KIT[L.cav] || undefined };
    case 'knight': return { fig: 'h', s: 0.9, body: '#9aa1ab', helmet: g >= 2 ? '#e8ecf0' : '#c9ced6', armor: true, plate, weapon: L.cav >= 2 ? 'lance' : 'spear', horse: '#3d3530', kit: CAV_KIT[L.cav] || undefined };
    case 'noble': return { fig: 'h', s: 0.92, body: '#5b2a7a', look: 'noble', armor: g >= 1, horse: '#efe6d6', kit: 'B' };
    default: return null;
  }
}
