'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const AVATARS_DIR = path.resolve(__dirname, '../assets/avatars');

const MATCH_CONFIDENCE_THRESHOLD = 0.80;
const VISION_MAX_RESULTS = 20;

const GOOGLE_VISION_KEY = process.env.GOOGLE_VISION_KEY;
const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY;
const FIREWORKS_MODEL = process.env.FIREWORKS_MODEL || 'flux-1-schnell-fp8';
const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models';

// ╔══════════════════════════════════════════════════════════════════╗
// ║  SECCIÓN 1 — DICCIONARIOS DE NORMALIZACIÓN                      ║
// ╚══════════════════════════════════════════════════════════════════╝

const COLOR_SYNONYMS = {
  yellow: 'golden', gold: 'golden', blonde: 'golden', blond: 'golden', cream: 'golden',
  buff: 'golden', sandy: 'golden', honey: 'golden', wheat: 'golden', apricot: 'golden',
  brown: 'chocolate', chocolate: 'chocolate', tan: 'chocolate', liver: 'chocolate',
  chestnut: 'chocolate', mahogany: 'chocolate', espresso: 'chocolate', mocha: 'chocolate',
  black: 'black', jet: 'black', ebony: 'black', charcoal: 'black', onyx: 'black',
  white: 'white', ivory: 'white', pearl: 'white', albino: 'white',
  gray: 'gray', grey: 'gray', silver: 'gray', ash: 'gray', slate: 'gray', smoke: 'gray',
  tricolor: 'tricolor', tricolour: 'tricolor', patched: 'tricolor',
  spotted: 'spotted', merle: 'merle', brindle: 'brindle',
  tabby: 'tabby', calico: 'calico', tortoiseshell: 'tortoiseshell',
  orange: 'orange', red: 'red', ginger: 'orange', rust: 'red', copper: 'red', auburn: 'red', flame: 'orange',
  fawn: 'fawn', sable: 'sable',
};

// Labels de Vision que NO son colores del pelaje (contexto/fondo)
const COLOR_CONTEXT_BLOCKLIST = new Set([
  'snow', 'winter', 'grass', 'sky', 'sunset', 'sunrise', 'water', 'ocean', 'sea',
  'fur', 'hair', 'wood', 'floor', 'carpet', 'sand', 'dirt', 'mud', 'rock', 'stone',
  'cloud', 'leaf', 'flower', 'tree', 'garden', 'park', 'field', 'forest',
  'blanket', 'towel', 'pillow', 'couch', 'sofa', 'bed', 'chair',
]);

const SPECIES_MAP = {
  dog: 'dog', puppy: 'dog', canine: 'dog', hound: 'dog',
  cat: 'cat', kitten: 'cat', feline: 'cat', kitty: 'cat', tomcat: 'cat',
  rabbit: 'rabbit', bunny: 'rabbit', hamster: 'hamster',
  guinea: 'guinea_pig', 'guinea pig': 'guinea_pig',
  bird: 'bird', parrot: 'bird', fish: 'fish', turtle: 'turtle', tortoise: 'turtle',
  ferret: 'ferret',
};

const STAGE_MAP = {
  puppy: 'puppy', kitten: 'kitten', baby: 'puppy', young: 'young',
  adult: 'adult', senior: 'senior', old: 'senior', elderly: 'senior',
};

// ── BREED_MAP: mapea labels de Google Vision → nombre canónico de archivo ────

const BREED_MAP = {
  // ═══════════════ PERROS ═══════════════
  // Retrievers & Sporting
  'golden retriever': 'golden_retriever',
  'labrador retriever': 'labrador_retriever',
  'labrador': 'labrador',
  'chesapeake bay retriever': 'chesapeake_retriever',
  'flat-coated retriever': 'flatcoated_retriever',
  'nova scotia duck tolling retriever': 'nova_scotia_retriever',
  'cocker spaniel': 'cocker_spaniel',
  'english cocker spaniel': 'cocker_spaniel',
  'english springer spaniel': 'springer_spaniel',
  'springer spaniel': 'springer_spaniel',
  'cavalier king charles spaniel': 'cavalier',
  'irish setter': 'irish_setter',
  'english setter': 'english_setter',
  'gordon setter': 'gordon_setter',
  'german shorthaired pointer': 'german_pointer',
  'weimaraner': 'weimaraner',
  'vizsla': 'vizsla',
  'brittany': 'brittany',

  // Shepherds & Herding
  'german shepherd': 'germanshepherd',
  'german shepherd dog': 'germanshepherd',
  'australian shepherd': 'australian_shepherd',
  'miniature american shepherd': 'miniature_american_shepherd',
  'border collie': 'border_collie',
  'rough collie': 'rough_collie',
  'collie': 'collie',
  'shetland sheepdog': 'sheltie',
  'sheltie': 'sheltie',
  'old english sheepdog': 'old_english_sheepdog',
  'belgian malinois': 'belgian_malinois',
  'belgian shepherd': 'belgian_shepherd',
  'australian cattle dog': 'australian_cattle_dog',
  'blue heeler': 'australian_cattle_dog',
  'pembroke welsh corgi': 'corgi',
  'cardigan welsh corgi': 'corgi',
  'corgi': 'corgi',
  'welsh corgi': 'corgi',

  // Giant & Working
  'st. bernard': 'st_bernard',
  'saint bernard': 'st_bernard',
  'bernese mountain dog': 'bernese',
  'great dane': 'great_dane',
  'newfoundland': 'newfoundland',
  'great pyrenees': 'great_pyrenees',
  'pyrenean mastiff': 'pyrenean_mastiff',
  'english mastiff': 'english_mastiff',
  'mastiff': 'mastiff',
  'bullmastiff': 'bullmastiff',
  'tibetan mastiff': 'tibetan_mastiff',
  'neapolitan mastiff': 'neapolitan_mastiff',
  'cane corso': 'cane_corso',
  'moscow watchdog': 'moscow_watchdog',
  'leonberger': 'leonberger',
  'irish wolfhound': 'irish_wolfhound',
  'scottish deerhound': 'scottish_deerhound',
  'alaskan malamute': 'malamute',
  'malamute': 'malamute',
  'siberian husky': 'husky',
  'husky': 'husky',
  'samoyed': 'samoyed',
  'akita': 'akita',
  'akita inu': 'akita',
  'rottweiler': 'rottweiler',
  'doberman pinscher': 'doberman',
  'doberman': 'doberman',
  'boxer': 'boxer',

  // Terriers
  'bull terrier': 'bull_terrier',
  'staffordshire bull terrier': 'staffordshire',
  'american pit bull terrier': 'pitbull',
  'pit bull': 'pitbull',
  'pitbull': 'pitbull',
  'jack russell terrier': 'jack_russell',
  'yorkshire terrier': 'yorkie',
  'yorkie': 'yorkie',
  'west highland white terrier': 'westie',
  'scottish terrier': 'scottish_terrier',
  'airedale terrier': 'airedale',
  'fox terrier': 'fox_terrier',
  'cairn terrier': 'cairn_terrier',
  'miniature schnauzer': 'miniature_schnauzer',
  'schnauzer': 'schnauzer',
  'giant schnauzer': 'giant_schnauzer',

  // Toy & Small
  'chihuahua': 'chihuahua',
  'pomeranian': 'pomeranian',
  'maltese': 'maltese',
  'shih tzu': 'shih_tzu',
  'lhasa apso': 'lhasa_apso',
  'pekingese': 'pekingese',
  'papillon': 'papillon',
  'havanese': 'havanese',
  'bichon frise': 'bichon_frise',
  'bichon': 'bichon_frise',
  'italian greyhound': 'italian_greyhound',
  'chinese crested': 'chinese_crested',
  'toy poodle': 'poodle',
  'miniature poodle': 'poodle',
  'standard poodle': 'poodle',
  'poodle': 'poodle',

  // Hounds
  'beagle': 'beagle',
  'basset hound': 'basset_hound',
  'bloodhound': 'bloodhound',
  'greyhound': 'greyhound',
  'whippet': 'whippet',
  'afghan hound': 'afghan_hound',
  'borzoi': 'borzoi',
  'saluki': 'saluki',
  'rhodesian ridgeback': 'rhodesian_ridgeback',
  'dachshund': 'dachshund',
  'basenji': 'basenji',
  'coonhound': 'coonhound',

  // Brachycephalic
  'pug': 'pug',
  'french bulldog': 'frenchie',
  'frenchie': 'frenchie',
  'english bulldog': 'english_bulldog',
  'bulldog': 'bulldog',
  'american bulldog': 'american_bulldog',
  'boston terrier': 'boston_terrier',

  // Spitz & Nordic
  'shiba inu': 'shiba_inu',
  'shiba': 'shiba_inu',
  'chow chow': 'chow_chow',
  'keeshond': 'keeshond',
  'finnish spitz': 'finnish_spitz',
  'american eskimo dog': 'american_eskimo',

  // Other popular
  'dalmatian': 'dalmatian',
  'coton de tulear': 'coton_de_tulear',
  'goldendoodle': 'goldendoodle',
  'labradoodle': 'labradoodle',
  'cockapoo': 'cockapoo',
  'shar pei': 'shar_pei',
  'chinese shar-pei': 'shar_pei',
  'xoloitzcuintli': 'xoloitzcuintli',
  'mexican hairless dog': 'xoloitzcuintli',

  // ═══════════════ GATOS ═══════════════
  'persian': 'persian',
  'persian cat': 'persian',
  'siamese': 'siamese',
  'siamese cat': 'siamese',
  'maine coon': 'mainecoon',
  'maine coon cat': 'mainecoon',
  'ragdoll': 'ragdoll',
  'ragdoll cat': 'ragdoll',
  'bengal': 'bengal',
  'bengal cat': 'bengal',
  'british shorthair': 'britishshorthair',
  'british longhair': 'british_longhair',
  'scottish fold': 'scottishfold',
  'abyssinian': 'abyssinian',
  'abyssinian cat': 'abyssinian',
  'birman': 'birman',
  'sphynx': 'sphynx',
  'sphynx cat': 'sphynx',
  'russian blue': 'russian_blue',
  'norwegian forest cat': 'norwegian_forest',
  'burmese': 'burmese',
  'burmese cat': 'burmese',
  'devon rex': 'devon_rex',
  'cornish rex': 'cornish_rex',
  'exotic shorthair': 'exotic_shorthair',
  'ocicat': 'ocicat',
  'savannah': 'savannah',
  'savannah cat': 'savannah',
  'tonkinese': 'tonkinese',
  'turkish angora': 'turkish_angora',
  'turkish van': 'turkish_van',
  'himalayan': 'himalayan',
  'himalayan cat': 'himalayan',
  'chartreux': 'chartreux',
  'somali': 'somali',
  'oriental shorthair': 'oriental_shorthair',
  'manx': 'manx',
  'bombay': 'bombay',
  'bombay cat': 'bombay',
  'american shorthair': 'american_shorthair',
  'balinese': 'balinese',
  'singapura': 'singapura',
  'egyptian mau': 'egyptian_mau',
  'pixie-bob': 'pixie_bob',
  'ragamuffin': 'ragamuffin',
  'siberian': 'siberian',
  'siberian cat': 'siberian',
  'nebelung': 'nebelung',

  // ═══════════════ OTROS ═══════════════
  'holland lop': 'hollandlop',
  'mini lop': 'minilop',
  'netherland dwarf': 'netherland_dwarf',
  'lionhead rabbit': 'lionhead',
  'flemish giant': 'flemish_giant',
};

// Colores típicos por raza — se usan en el prompt cuando el color detectado
// por Vision es sospechoso (viene de un label contextual, no del pelaje).
const BREED_TYPICAL_COLORS = {
  // Perros
  st_bernard: 'brown and white',
  bernese: 'tricolor (black, rust, and white)',
  golden_retriever: 'golden',
  labrador: null, // puede ser negro, chocolate o cream — no asumir
  germanshepherd: 'black and tan',
  husky: 'gray and white',
  samoyed: 'pure white',
  dalmatian: 'white with black spots',
  rottweiler: 'black and tan',
  doberman: 'black and tan',
  beagle: 'tricolor (black, brown, and white)',
  boxer: 'fawn',
  pug: 'fawn',
  frenchie: null,
  bulldog: null,
  cocker_spaniel: null,
  border_collie: 'black and white',
  corgi: 'red and white',
  shiba_inu: 'red sesame',
  akita: null,
  malamute: 'gray and white',
  great_dane: null,
  chihuahua: null,
  yorkie: 'blue and tan',
  pomeranian: 'orange',
  maltese: 'white',
  shih_tzu: null,
  chow_chow: 'red',
  shar_pei: 'fawn',
  weimaraner: 'silver gray',
  vizsla: 'golden rust',
  irish_setter: 'deep red',
  basset_hound: 'tricolor',
  bloodhound: 'red and tan',
  rhodesian_ridgeback: 'wheaten',
  dachshund: 'brown',
  great_pyrenees: 'white',
  newfoundland: 'black',
  leonberger: 'lion gold',
  // Gatos
  persian: null,
  siamese: 'cream with dark points',
  mainecoon: null,
  ragdoll: 'white with blue points',
  bengal: 'spotted brown',
  britishshorthair: 'blue (gray)',
  scottishfold: null,
  sphynx: null,
  russian_blue: 'blue (silver gray)',
  bombay: 'black',
  abyssinian: 'ruddy ticked',
};

// Descripciones naturales para el prompt
const COLOR_DISPLAY = {
  golden: 'golden', chocolate: 'chocolate brown', black: 'sleek black',
  white: 'pure white', gray: 'silver gray', tricolor: 'tricolor (black, white and tan)',
  spotted: 'spotted', merle: 'merle patterned', brindle: 'brindle',
  tabby: 'tabby striped', calico: 'calico', tortoiseshell: 'tortoiseshell',
  orange: 'vibrant orange', red: 'deep red', fawn: 'fawn', sable: 'sable',
};

const STAGE_DISPLAY = {
  puppy: 'playful puppy', kitten: 'tiny kitten',
  young: 'young', adult: 'adult', senior: 'senior',
};

// Fondos pastel por especie (estilo Gemini)
const SPECIES_BACKGROUND = {
  dog: 'solid pastel mint green background',
  cat: 'solid pastel mint green background',
  rabbit: 'solid pastel peach background',
  bird: 'solid pastel sky blue background',
  ferret: 'solid pastel lavender background',
  default: 'solid pastel cream background',
};


// ╔══════════════════════════════════════════════════════════════════╗
// ║  SECCIÓN 2 — UTILITARIOS DE STRINGS Y FUZZY MATCHING            ║
// ╚══════════════════════════════════════════════════════════════════╝

function normalizeString(str) {
  return str.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[\s\-]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function similarityScore(a, b) {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - levenshteinDistance(a, b) / maxLen;
}

function fuzzyBestMatch(query, candidates) {
  let best = null, score = 0;
  for (const c of candidates) { const s = similarityScore(query, c); if (s > score) { score = s; best = c; } }
  return { best, score };
}


// ╔══════════════════════════════════════════════════════════════════╗
// ║  SECCIÓN 3 — INTEGRACIÓN CON GOOGLE CLOUD VISION                ║
// ╚══════════════════════════════════════════════════════════════════╝

async function detectLabels(imageBuffer) {
  const base64Image = imageBuffer.toString('base64');
  const response = await axios.post(
    `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_KEY}`,
    { requests: [{ image: { content: base64Image }, features: [{ type: 'LABEL_DETECTION', maxResults: VISION_MAX_RESULTS }] }] },
    { headers: { 'Content-Type': 'application/json' } }
  );
  return (response.data?.responses?.[0]?.labelAnnotations ?? []).map(({ description, score }) => ({ description, score }));
}

/**
 * Extrae especies, raza, color y etapa de vida a partir de los labels de Vision.
 *
 * Prioridad para raza:
 *   1. BREED_MAP  — match exacto del label completo (más confiable)
 *   2. BREED_MAP  — match parcial (label contiene nombre de raza)
 *   3. breedKeywords — match de keywords sueltos (fallback)
 *   4. 'criollo' — si nada coincide
 *
 * Para color se ignoran labels contextuales (Snow, Winter, Grass, etc.).
 * Si se detecta una raza con colores típicos conocidos y el color vino de
 * un label contextual, se usa el color típico de la raza.
 */
function extractPetAttributes(labels) {
  let species = null, breed = null, color = null, stage = null;
  let colorSourceLabel = null;  // rastrear de qué label vino el color
  const sorted = [...labels].sort((a, b) => b.score - a.score);
  const rawLabels = sorted.map(l => l.description);

  // Keywords extra como fallback (se usan solo si BREED_MAP no matcheó)
  const breedKeywords = [
    'retriever', 'labrador', 'spaniel', 'terrier', 'shepherd', 'poodle', 'bulldog', 'pug',
    'beagle', 'husky', 'malamute', 'samoyed', 'doberman', 'dalmatian', 'rottweiler', 'boxer',
    'dachshund', 'chihuahua', 'maltese', 'shih tzu', 'pomeranian', 'corgi', 'collie',
    'setter', 'pointer', 'persian', 'siamese', 'bengal', 'ragdoll', 'maine coon',
    'british shorthair', 'scottish fold', 'abyssinian', 'birman', 'sphynx',
    'american shepherd', 'frenchie', 'french bulldog', 'yorkshire', 'yorkie',
    'bernard', 'mastiff', 'pyrenees', 'dane', 'newfoundland', 'wolfhound',
    'deerhound', 'ridgeback', 'whippet', 'greyhound', 'basenji', 'akita',
    'shiba', 'chow', 'shar pei', 'weimaraner', 'vizsla', 'brittany',
    'borzoi', 'saluki', 'malinois', 'heeler', 'sheltie',
    'schnauzer', 'havanese', 'bichon', 'papillon', 'lhasa',
    'boston terrier', 'pit bull', 'pitbull', 'staffordshire',
    'leonberger', 'cane corso', 'bullmastiff',
    'russian blue', 'burmese', 'devon rex', 'cornish rex', 'savannah',
    'tonkinese', 'angora', 'himalayan', 'chartreux', 'manx', 'bombay',
    'mau', 'balinese', 'singapura', 'somali', 'nebelung', 'siberian',
  ];

  for (const { description } of sorted) {
    const lower = description.toLowerCase().trim();

    // ── Especie ──────────────────────────────────────────────────────────────
    if (!species && SPECIES_MAP[lower]) species = SPECIES_MAP[lower];

    // ── Etapa de vida ────────────────────────────────────────────────────────
    if (!stage && STAGE_MAP[lower]) stage = STAGE_MAP[lower];

    // ── RAZA: Intento 1 — match exacto en BREED_MAP ─────────────────────────
    if (!breed && BREED_MAP[lower]) {
      breed = BREED_MAP[lower];
      console.info(`[Breed] ✅ Match exacto: "${description}" → ${breed}`);
    }

    // ── RAZA: Intento 2 — el label contiene un nombre de raza de BREED_MAP ──
    if (!breed) {
      for (const [breedLabel, breedCanonical] of Object.entries(BREED_MAP)) {
        if (lower.includes(breedLabel) || breedLabel.includes(lower)) {
          // Solo matchear si el label es suficientemente específico (>3 chars)
          if (lower.length > 3 && breedLabel.length > 3) {
            breed = breedCanonical;
            console.info(`[Breed] ✅ Match parcial: "${description}" contiene "${breedLabel}" → ${breed}`);
            break;
          }
        }
      }
    }

    // ── COLOR: solo si el label NO es contextual ─────────────────────────────
    if (!color && !COLOR_CONTEXT_BLOCKLIST.has(lower)) {
      if (COLOR_SYNONYMS[lower]) {
        color = COLOR_SYNONYMS[lower];
        colorSourceLabel = lower;
      }
    }

    // ── Match palabra-por-palabra ────────────────────────────────────────────
    const words = lower.split(/[\s\-,]+/);
    for (const word of words) {
      if (!species && SPECIES_MAP[word]) species = SPECIES_MAP[word];
      if (!stage && STAGE_MAP[word]) stage = STAGE_MAP[word];
      if (!color && !COLOR_CONTEXT_BLOCKLIST.has(lower) && COLOR_SYNONYMS[word]) {
        color = COLOR_SYNONYMS[word];
        colorSourceLabel = word;
      }
    }

    // ── RAZA: Intento 3 — keyword suelto (fallback) ─────────────────────────
    if (!breed && breedKeywords.some(kw => lower.includes(kw))) {
      breed = normalizeString(lower);
      console.info(`[Breed] ⚡ Match keyword: "${description}" → ${breed}`);
    }
  }

  if (!stage) stage = 'adult';

  // ── Si no se detectó raza → criollo ────────────────────────────────────────
  if (!breed) {
    breed = 'criollo';
    console.info('[Breed] ⚠️  No se detectó raza específica → criollo');
  }

  // ── Corrección de color basada en raza ──────────────────────────────────────
  // Si tenemos una raza específica con colores típicos conocidos,
  // y el color detectado podría no ser confiable, usamos el típico.
  if (breed !== 'criollo' && BREED_TYPICAL_COLORS[breed]) {
    const typicalColor = BREED_TYPICAL_COLORS[breed];
    if (!color) {
      // No se detectó color → usar el típico de la raza
      console.info(`[Color] Usando color típico de ${breed}: ${typicalColor}`);
      // No asignamos directamente a `color` porque typicalColor es descriptivo,
      // pero lo usaremos en el prompt. Dejamos color null para que el prompt use el típico.
    }
  }

  console.info(`[Extract] species=${species}, breed=${breed}, color=${color}, stage=${stage}`);
  return { species, breed, color, stage, rawLabels };
}


// ╔══════════════════════════════════════════════════════════════════╗
// ║  SECCIÓN 4 — MATCHING CONTRA AVATARES LOCALES                   ║
// ╚══════════════════════════════════════════════════════════════════╝

function getLocalAvatarFiles() {
  if (!fs.existsSync(AVATARS_DIR)) { console.warn(`[AvatarMatch] Dir no encontrado: ${AVATARS_DIR}`); return []; }
  return fs.readdirSync(AVATARS_DIR).filter(f => f.endsWith('.png')).map(f => f.replace('.png', ''));
}

function matchLocalAvatar(attrs, avatarFiles) {
  const { species, breed, color, stage } = attrs;
  if (!avatarFiles.length) return { file: null, confidence: 0 };
  const candidates = [];
  if (species && breed && color && stage) candidates.push(`${species}_${breed}_${color}_${stage}`);
  if (species && breed && color) candidates.push(`${species}_${breed}_${color}`);
  if (species && breed && stage) candidates.push(`${species}_${breed}_${stage}`);
  if (species && color && stage) candidates.push(`${species}_${color}_${stage}`);
  if (species && breed) candidates.push(`${species}_${breed}`);
  if (species && color) candidates.push(`${species}_${color}`);
  if (species) candidates.push(species);
  let bestFile = null, bestConfidence = 0;
  for (const query of candidates) {
    const { best, score } = fuzzyBestMatch(query, avatarFiles);
    if (score > bestConfidence) { bestConfidence = score; bestFile = best; }
    if (bestConfidence >= MATCH_CONFIDENCE_THRESHOLD) break;
  }
  return { file: bestFile, confidence: bestConfidence };
}


// ╔══════════════════════════════════════════════════════════════════╗
// ║  SECCIÓN 5 — NOMBRE CANÓNICO (CACHÉ)                            ║
// ╚══════════════════════════════════════════════════════════════════╝


function buildCanonicalFileName(attrs) {
  const { species, breed, color, stage } = attrs;
  const parts = [];
  if (species) parts.push(species);
  if (breed) parts.push(breed);     // raza siempre después de especie
  if (color) parts.push(color);
  if (stage) parts.push(stage);
  return parts.join('_') || `avatar_${Date.now()}`;
}


// ╔══════════════════════════════════════════════════════════════════╗
// ║  SECCIÓN 6 — PROMPT ESTILO GEMINI/PIXAR                         ║
// ╚══════════════════════════════════════════════════════════════════╝

const ORANGE_CAT_KEYWORDS = [
  'orange', 'ginger', 'tabby', 'calico', 'tortoiseshell', 'marmalade',
  'bicolor', 'bicolour', 'bi-color', 'tawny', 'flame', 'amber', 'rust',
];

function isOrangeCatByRawLabels(rawLabels) {
  return rawLabels.some(label =>
    ORANGE_CAT_KEYWORDS.some(kw => label.toLowerCase().includes(kw))
  );
}

function buildFireworksPrompt(attrs) {
  const { species, breed, color, stage, rawLabels } = attrs;
  const stageDesc = stage ? (STAGE_DISPLAY[stage] || stage) : 'adult';

  const isOrangeCat = (
    species === 'cat' && (
      color === 'orange' ||
      color === 'calico' ||
      color === 'tortoiseshell' ||
      (rawLabels && isOrangeCatByRawLabels(rawLabels)) ||
      !color
    )
  );

  if (isOrangeCat) {
    return (
      `Professional 3D character avatar of an ${stageDesc} mixed-breed domestic (criollo) bicolor cat, male, ` +
      `inspired by the specific markings in the reference image. ` +
      `The cat has a distinct orange mask covering the top of the head and ears, ` +
      `with a complex orange spot on the left side of the muzzle (viewer's right). ` +
      `Pixar and Dreamworks animation style. ` +
      `Short-haired coat with a realistic soft-touch texture and a subtle satin sheen. ` +
      `Elegant, athletic, and slender build. ` +
      `Big expressive intelligent green-almond eyes, soft smile, and friendly endearing expression. ` +
      `Pure white fur on the chest, paws, and lower face, ` +
      `contrasting with vibrant orange and ginger patches on the back, sides and tail. ` +
      `Orange tabby-like stripe pattern on top of head, plain warm orange on back. ` +
      `NO gray, NO silver, NO blue — strictly orange and white coat only. ` +
      `NO collars, NO bells, NO tags, NO accessories of any kind. ` +
      `BACKGROUND: solid flat pastel mint green (#B2DFDB), no gradients, no noise. ` +
      `Studio lighting with soft volumetric shadows and rim lighting to define the sleek silhouette. ` +
      `8k resolution, centered composition, symmetrical masterpiece, ` +
      `high-end product render quality, ray-traced fur detail.`
    );
  }

  // ── Prompt dinámico genérico para otras especies/colores ───────────────────

  // Determinar la mejor descripción de color para el prompt:
  //   1. Si hay color detectado del pelaje → usarlo
  //   2. Si hay raza conocida con colores típicos → usar los típicos
  //   3. Si nada → dejar que Fireworks decida
  let colorDesc = '';
  const typicalColor = (breed && breed !== 'criollo') ? (BREED_TYPICAL_COLORS[breed] || null) : null;

  if (color) {
    // Tenemos color del pelaje detectado
    colorDesc = COLOR_DISPLAY[color] || color;
  } else if (typicalColor) {
    // No se detectó color pero sabemos el típico de la raza
    colorDesc = typicalColor;
    console.info(`[Prompt] Usando color típico de raza ${breed}: ${typicalColor}`);
  }

  let breedDesc = '';
  if (breed && breed !== 'criollo') {
    // Raza específica detectada (ej: st_bernard → "St. Bernard")
    const breedName = breed.replace(/_/g, ' ');
    // Agregar contexto de especie si es necesario
    if (species === 'dog') {
      breedDesc = `${breedName} dog`;
    } else if (species === 'cat') {
      breedDesc = `${breedName} cat`;
    } else {
      breedDesc = breedName;
    }
  } else {
    // Sin raza específica → criollo / mestizo
    if (species === 'cat') {
      breedDesc = 'mixed-breed domestic (criollo) cat';
    } else if (species === 'dog') {
      breedDesc = 'mixed-breed (criollo) dog';
    } else {
      breedDesc = `mixed-breed (criollo) ${species || 'pet'}`;
    }
  }
  const background = SPECIES_BACKGROUND[species || ''] || SPECIES_BACKGROUND.default;

  // Construir descripción del sujeto
  const subjectParts = [];
  if (colorDesc) subjectParts.push(colorDesc);
  subjectParts.push(breedDesc);
  const subject = subjectParts.join(' ');

  // Para razas específicas, agregar detalles morfológicos
  let breedDetails = '';
  if (breed && breed !== 'criollo' && typicalColor) {
    breedDetails = `with the breed's characteristic ${typicalColor} coat markings and typical body structure. `;
  }

  return (
    `Professional 3D character avatar of a ${subject} ${stageDesc}. ` +
    `${breedDetails}` +
    `Disney-Pixar and Dreamworks animation style. ` +
    `Big expressive eyes, soft smile, friendly and endearing expression. ` +
    `High-fidelity 3D model with perfect fur detail and smooth polished surfaces. ` +
    `BACKGROUND: ${background}, solid flat color, no gradients, no noise. ` +
    `Soft studio rim lighting with subtle volumetric shadows. ` +
    `Full body portrait, centered composition, symmetrical masterpiece. ` +
    `8k resolution, high-end product render quality, ray-traced fur detail. ` +
    `NO collars, NO bells, NO tags, NO accessories of any kind. ` +
    `No text, no watermark.`
  );
}


// ╔══════════════════════════════════════════════════════════════════╗
// ║  SECCIÓN 7 — FALLBACK FIREWORKS AI + CACHÉ EN CATÁLOGO          ║
// ╚══════════════════════════════════════════════════════════════════╝

/**
 * Genera imagen con Fireworks AI y la guarda en DOS lugares:
 *
 *   1. assets/avatars_generated/generated_TIMESTAMP.png
 *      → Historial de todas las generaciones
 *
 *   2. assets/avatars/NOMBRE_CANONICO.png
 *      → Caché: la próxima vez que llegue una mascota similar,
 *        el fuzzy matching la encontrará aquí sin llamar a Fireworks
 *
 * @param {string} prompt
 * @param {{ species, breed, color, stage }} attrs
 * @returns {Promise<string>} URL pública de la imagen
 */
async function generateAvatarFallback(prompt, attrs) {
  // ── MOCK MODE ──────────────────────────────────────────────────────────────
  if (process.env.MOCK_MODE === 'true') {
    console.info('[MOCK] Simulando generación...');
    const generatedDir = process.env.GENERATED_DIR || path.resolve(__dirname, '../assets/avatars_generated');
    if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });
    const fileName = `generated_${Date.now()}.png`;
    const testImg = path.resolve(__dirname, '../assets/avatars/dog_labrador_cream_puppy.png');
    fs.copyFileSync(testImg, path.join(generatedDir, fileName));
    const canonicalName = buildCanonicalFileName(attrs);
    const cachePath = path.join(AVATARS_DIR, `${canonicalName}.png`);
    if (!fs.existsSync(cachePath)) { fs.copyFileSync(testImg, cachePath); console.info(`[Cache] ✅ ${canonicalName}.png`); }
    return `/static/avatars_generated/${fileName}`;
  }

  // ── Generación vía Pollinations.ai (gratis, sin API key) ──────────────────
  // GET devuelve la imagen directamente en el body.
  const encodedPrompt = encodeURIComponent(prompt);
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&model=flux&nologo=true`;
  console.info(`[Pollinations] Generando...`);
  const response = await axios.get(pollinationsUrl, {
    responseType: 'arraybuffer',
    validateStatus: s => s < 500,
    timeout: 90000
  });

  if (response.status !== 200) {
    let detail = '';
    try { detail = Buffer.from(response.data).toString('utf8'); } catch (_) { }
    throw new Error(`Pollinations HTTP ${response.status}: ${detail}`);
  }

  const buffer = Buffer.from(response.data);
  console.info(`[Pollinations] Buffer: ${buffer.length} bytes`);

  // 1. Guardar en historial (avatars_generated/) con nombre descriptivo
  const generatedDir = process.env.GENERATED_DIR || path.resolve(__dirname, '../assets/avatars_generated');
  if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });
  const canonicalName = buildCanonicalFileName(attrs);
  const generatedFileName = `${canonicalName}_${Date.now()}.png`;
  const generatedFilePath = path.join(generatedDir, generatedFileName);
  fs.writeFileSync(generatedFilePath, buffer);
  console.info(`[Pollinations] ✅ Historial: ${generatedFilePath}`);

  // 2. Guardar en catálogo para caché (avatars/) — se reutiliza en próximas búsquedas similares
  const cachePath = path.join(AVATARS_DIR, `${canonicalName}.png`);
  if (!fs.existsSync(cachePath)) {
    fs.writeFileSync(cachePath, buffer);
    console.info(`[Cache] ✅ Catálogo: ${canonicalName}.png — futuras búsquedas usarán esta imagen`);
  } else {
    console.info(`[Cache] Ya existe: ${canonicalName}.png — se actualizará con la nueva generación`);
    fs.writeFileSync(cachePath, buffer);
  }

  return `/static/avatars_generated/${generatedFileName}`;
}


// ╔══════════════════════════════════════════════════════════════════╗
// ║  SECCIÓN 8 — CONTROLADOR PRINCIPAL                              ║
// ╚══════════════════════════════════════════════════════════════════╝

async function matchAvatar(req, res) {
  if (!req.file || !req.file.buffer)
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'No se recibió imagen. Usa multipart/form-data con el campo "image".' });

  const imageBuffer = req.file.buffer;

  let labels;
  try {
    labels = await detectLabels(imageBuffer);
    console.info(`[Vision] ${labels.length} etiquetas detectadas.`);
  } catch (visionError) {
    console.error('[Vision] Error:', visionError.message);
    return res.status(502).json({ error: 'VISION_API_ERROR', message: 'Error con Google Cloud Vision API.', detail: visionError.message });
  }

  if (!labels.length)
    return res.status(422).json({ error: 'NO_LABELS_DETECTED', message: 'Google Vision no detectó etiquetas.' });

  const attrs = extractPetAttributes(labels);

  if (attrs.species === 'cat' && !attrs.color) {
    const hasOrangeHint = attrs.rawLabels.some(l =>
      ['orange', 'ginger', 'tabby', 'calico', 'tortoiseshell', 'marmalade', 'bicolor', 'tawny', 'flame', 'amber', 'rust']
        .some(kw => l.toLowerCase().includes(kw))
    );
    attrs.color = hasOrangeHint ? 'orange' : 'orange'; // naranja por defecto en esta app
  }

  console.info('[Attrs]', attrs);

  const avatarFiles = getLocalAvatarFiles();
  const { file, confidence } = matchLocalAvatar(attrs, avatarFiles);
  console.info(`[Match] Mejor: ${file} (${(confidence * 100).toFixed(1)}%)`);

  if (file && confidence >= MATCH_CONFIDENCE_THRESHOLD) {
    return res.status(200).json({
      source: 'local',
      imageUrl: buildLocalUrl(req, file),
      matchedAttributes: buildAttributesObject(attrs),
      confidence: parseFloat(confidence.toFixed(4)),
    });
  }

  console.info(`[Match] Confianza insuficiente (${(confidence * 100).toFixed(1)}%). Usando Fireworks AI.`);
  const prompt = buildFireworksPrompt(attrs);
  let generatedUrl;

  try {
    generatedUrl = await generateAvatarFallback(prompt, attrs);
    console.info(`[Fireworks] URL generada: ${generatedUrl}`);
  } catch (fireworksError) {
    console.error('[Fireworks] Error:', fireworksError.message);
    return res.status(502).json({ error: 'FIREWORKS_API_ERROR', message: 'Error con Fireworks AI.', detail: fireworksError.message });
  }

  const canonicalName = buildCanonicalFileName(attrs);

  return res.status(200).json({
    source: 'generated',
    imageUrl: buildLocalUrl(req, canonicalName),
    generatedImageUrl: generatedUrl,
    matchedAttributes: buildAttributesObject(attrs),
    confidence: parseFloat(confidence.toFixed(4)),
    prompt,
  });
}

function buildLocalUrl(req, fileName) {
  const BASE_URL = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${BASE_URL}/static/avatars/${fileName}.png`;
}

function buildAttributesObject({ species, breed, color, stage }) {
  return { species: species ?? null, breed: breed ?? null, color: color ?? null, stage: stage ?? null };
}

module.exports = {
  matchAvatar,
  detectLabels,
  extractPetAttributes,
  matchLocalAvatar,
  generateAvatarFallback,
  buildFireworksPrompt,
  buildCanonicalFileName,
  normalizeString,
  similarityScore,
  COLOR_SYNONYMS,
  SPECIES_MAP,
  STAGE_MAP,
};