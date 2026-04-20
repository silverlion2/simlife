// ============================================================
// SimLife — Game Configuration (All Data)
// ============================================================
window.Game = window.Game || {};

Game.Config = {
  // ----------------------------------------------------------
  // Time Settings
  // ----------------------------------------------------------
  TIME: {
    START_HOUR: 6,
    MINUTES_PER_SECOND: 1,    // 1 game minute = 1 real second at 1x
    SPEEDS: [0, 1, 2, 3],
    DAY_LENGTH: 24,            // hours
    YOUNG_ADULT_DAYS: 30,
    ADULT_DAYS: 70,
    ELDER_DAYS: 100,
  },

  // ----------------------------------------------------------
  // Seasons & Weather
  // ----------------------------------------------------------
  SEASONS: {
    spring: { label: 'Spring', icon: '🌸', cropGrowthMult: 1.0, weatherChance: { clear: 0.6, rain: 0.3, storm: 0.1 } },
    summer: { label: 'Summer', icon: '☀️', cropGrowthMult: 1.3, weatherChance: { clear: 0.7, rain: 0.2, storm: 0.1 } },
    autumn: { label: 'Autumn', icon: '🍂', cropGrowthMult: 0.8, weatherChance: { clear: 0.5, rain: 0.3, wind: 0.2 } },
    winter: { label: 'Winter', icon: '❄️', cropGrowthMult: 0.0, weatherChance: { clear: 0.4, snow: 0.4, wind: 0.2 } },
  },
  SEASON_ORDER: ['spring', 'summer', 'autumn', 'winter'],
  DAYS_PER_SEASON: 28,

  // ----------------------------------------------------------
  // Need Definitions
  // ----------------------------------------------------------
  NEEDS: {
    hunger:  { label: 'Hunger',  icon: '🍔', decayPerHour: 3.0,  color: '#FF6B6B', criticalThreshold: 15 },
    energy:  { label: 'Energy',  icon: '⚡', decayPerHour: 4.0,  color: '#FFD93D', criticalThreshold: 10 },
    hygiene: { label: 'Hygiene', icon: '🚿', decayPerHour: 2.0,  color: '#4ECDC4', criticalThreshold: 20 },
    fun:     { label: 'Fun',     icon: '😊', decayPerHour: 2.5,  color: '#A78BFA', criticalThreshold: 15 },
    social:  { label: 'Social',  icon: '💬', decayPerHour: 1.5,  color: '#F472B6', criticalThreshold: 20 },
    comfort: { label: 'Comfort', icon: '🛋️', decayPerHour: 1.0, color: '#FB923C', criticalThreshold: 25 },
    bladder: { label: 'Bladder', icon: '🚽', decayPerHour: 4.5,  color: '#FEF08A', criticalThreshold: 20 },
  },

  // ----------------------------------------------------------
  // Mood Thresholds
  // ----------------------------------------------------------
  MOODS: [
    { min: 90, label: 'Ecstatic',  emoji: '🤩', color: '#22C55E', workBonus: 1.3, skillBonus: 1.4 },
    { min: 70, label: 'Happy',     emoji: '😊', color: '#4ADE80', workBonus: 1.1, skillBonus: 1.2 },
    { min: 50, label: 'Fine',      emoji: '😐', color: '#FACC15', workBonus: 1.0, skillBonus: 1.0 },
    { min: 30, label: 'Tense',     emoji: '😤', color: '#FB923C', workBonus: 0.7, skillBonus: 0.7 },
    { min: 0,  label: 'Miserable', emoji: '😫', color: '#EF4444', workBonus: 0.4, skillBonus: 0.4 },
  ],

  // ----------------------------------------------------------
  // Character Traits
  // ----------------------------------------------------------
  TRAITS: {
    neat:      { label: 'Neat',      icon: '✨', desc: 'Hygiene decays slower, cleaning is faster', effects: { hygieneDecay: -0.3, cleanSpeed: 1.5 } },
    clumsy:    { label: 'Clumsy',    icon: '🤕', desc: 'Furniture breaks more often', effects: { breakMult: 2.0 } },
    creative:  { label: 'Creative',  icon: '🎨', desc: '+30% creativity XP, moodlets last longer', effects: { creativityXP: 1.3, moodletDuration: 1.3 } },
    lazy:      { label: 'Lazy',      icon: '😴', desc: 'Energy decays faster, naps restore more', effects: { energyDecay: 1.3, napBonus: 1.5 } },
    genius:    { label: 'Genius',    icon: '🧠', desc: '+25% logic and tech XP', effects: { logicXP: 1.25, techXP: 1.25 } },
    athletic:  { label: 'Athletic',  icon: '🏃', desc: '+25% fitness XP, less energy cost', effects: { fitnessXP: 1.25, energyCostMult: 0.75 } },
    charming:  { label: 'Charming',  icon: '💋', desc: '+30% relationship gain', effects: { relGainMult: 1.3 } },
    glutton:   { label: 'Glutton',   icon: '🍕', desc: 'Hunger decays faster, cooking XP +20%', effects: { hungerDecay: 1.4, cookingXP: 1.2 } },
  },

  // ----------------------------------------------------------
  // Skills
  // ----------------------------------------------------------
  SKILLS: {
    cooking:   { label: 'Cooking',   icon: '🍳', maxLevel: 10, xpPerLevel: 100 },
    fitness:   { label: 'Fitness',   icon: '💪', maxLevel: 10, xpPerLevel: 120 },
    charisma:  { label: 'Charisma',  icon: '💬', maxLevel: 10, xpPerLevel: 110 },
    tech:      { label: 'Tech',      icon: '💻', maxLevel: 10, xpPerLevel: 130 },
    creativity:{ label: 'Creativity',icon: '🎨', maxLevel: 10, xpPerLevel: 115 },
    logic:     { label: 'Logic',     icon: '📚', maxLevel: 10, xpPerLevel: 125 },
    gardening: { label: 'Gardening', icon: '🌿', maxLevel: 10, xpPerLevel: 90  },
    handiness: { label: 'Handiness', icon: '🔧', maxLevel: 10, xpPerLevel: 100 },
    language:  { label: 'Chinese (HSK)', icon: '🗣️', maxLevel: 6, xpPerLevel: 250 },
  },

  // ----------------------------------------------------------
  // Room Types
  // ----------------------------------------------------------
  ROOMS: {
    bedroom:    { label: 'Bedroom',    icon: '🛏️', minW: 2, minH: 2, maxW: 4, maxH: 4, baseCost: 800,  floorColor: '#C9B496', wallColor: '#8B7355' },
    kitchen:    { label: 'Kitchen',    icon: '🍳', minW: 2, minH: 2, maxW: 3, maxH: 3, baseCost: 1000, floorColor: '#D4C5A9', wallColor: '#9B8B6B' },
    bathroom:   { label: 'Bathroom',   icon: '🚿', minW: 2, minH: 2, maxW: 3, maxH: 3, baseCost: 900,  floorColor: '#B8C4D0', wallColor: '#7A8B9A' },
    living:     { label: 'Living Room',icon: '🛋️', minW: 3, minH: 2, maxW: 5, maxH: 4, baseCost: 1200, floorColor: '#D4A574', wallColor: '#9B7B55' },
    study:      { label: 'Study',      icon: '💼', minW: 2, minH: 2, maxW: 3, maxH: 3, baseCost: 1100, floorColor: '#A0896C', wallColor: '#6B5D4A' },
    garden:     { label: 'Garden',     icon: '🌿', minW: 2, minH: 2, maxW: 4, maxH: 4, baseCost: 500,  floorColor: '#7CB342', wallColor: '#558B2F' },
    gym:        { label: 'Gym',        icon: '🏋️', minW: 2, minH: 2, maxW: 3, maxH: 3, baseCost: 1500, floorColor: '#90A4AE', wallColor: '#607D8B' },
    gameroom:   { label: 'Game Room',  icon: '🎮', minW: 2, minH: 2, maxW: 3, maxH: 3, baseCost: 1300, floorColor: '#9575CD', wallColor: '#7E57C2' },
    nursery:    { label: 'Nursery',    icon: '👶', minW: 2, minH: 2, maxW: 3, maxH: 3, baseCost: 1000, floorColor: '#FFCC80', wallColor: '#FFB74D' },
    dining:     { label: 'Dining Room',icon: '🍽️', minW: 2, minH: 2, maxW: 4, maxH: 3, baseCost: 1000, floorColor: '#BCAAA4', wallColor: '#8D6E63' },
    library:    { label: 'Library',    icon: '🏛️', minW: 2, minH: 2, maxW: 4, maxH: 4, baseCost: 1400, floorColor: '#8D6E63', wallColor: '#5D4037' },
    patio:      { label: 'Patio',      icon: '☀️', minW: 2, minH: 2, maxW: 5, maxH: 5, baseCost: 600,  floorColor: '#B0BEC5', wallColor: '#90A4AE' },
    workshop:   { label: 'Workshop',   icon: '🛠️', minW: 2, minH: 2, maxW: 4, maxH: 4, baseCost: 1200, floorColor: '#9E9E9E', wallColor: '#616161' },
    subway:     { label: 'Subway Station', icon: '🚇', minW: 3, minH: 3, maxW: 5, maxH: 5, baseCost: 0, floorColor: '#B0BEC5', wallColor: '#546E7A' },
  },

  // ----------------------------------------------------------
  // Furniture Items
  // ----------------------------------------------------------
  FURNITURE: {
    // Bedroom
    basic_bed:     { label: 'Simple Bed',     icon: '🛏️', room: 'bedroom', cost: 150,  quality: 1, needBonus: { energy: 8 },  comfort: 1, w: 1, h: 2 },
    good_bed:      { label: 'Comfy Bed',      icon: '🛏️', room: 'bedroom', cost: 400,  quality: 2, needBonus: { energy: 12 }, comfort: 3, w: 1, h: 2 },
    luxury_bed:    { label: 'Luxury Bed',     icon: '🛏️', room: 'bedroom', cost: 1200, quality: 3, needBonus: { energy: 18 }, comfort: 6, w: 2, h: 2 },
    dresser:       { label: 'Dresser',        icon: '🗄️', room: 'bedroom', cost: 100,  quality: 1, needBonus: {},             comfort: 1, w: 1, h: 1 },
    lamp:          { label: 'Lamp',           icon: '💡', room: 'bedroom', cost: 50,   quality: 1, needBonus: {},             comfort: 2, w: 1, h: 1 },
    wardrobe:      { label: 'Wardrobe',       icon: '🚪', room: 'bedroom', cost: 250,  quality: 1, needBonus: {},             comfort: 0, w: 2, h: 1 },
    vanity:        { label: 'Vanity',         icon: '🎀', room: 'bedroom', cost: 180,  quality: 2, needBonus: { fun: 5 },     comfort: 1, w: 1, h: 1 },

    // Kitchen
    basic_stove:   { label: 'Basic Stove',    icon: '🔥', room: 'kitchen', cost: 200,  quality: 1, needBonus: { hunger: 20 }, comfort: 0, w: 1, h: 1, skill: 'cooking', breakChance: 0.08 },
    good_stove:    { label: 'Gas Range',      icon: '🔥', room: 'kitchen', cost: 600,  quality: 2, needBonus: { hunger: 30 }, comfort: 0, w: 1, h: 1, skill: 'cooking', breakChance: 0.04 },
    smart_stove:   { label: 'Smart Oven',     icon: '🔥', room: 'kitchen', cost: 1800, quality: 3, needBonus: { hunger: 40 }, comfort: 0, w: 1, h: 1, skill: 'cooking', breakChance: 0.01 },
    fridge:        { label: 'Refrigerator',   icon: '🧊', room: 'kitchen', cost: 300,  quality: 1, needBonus: { hunger: 5 },  comfort: 1, w: 1, h: 1, breakChance: 0.03 },
    smart_fridge:  { label: 'Smart Fridge',   icon: '🧊', room: 'kitchen', cost: 1400, quality: 3, needBonus: { hunger: 15 }, comfort: 2, w: 1, h: 1, breakChance: 0.01 },
    counter:       { label: 'Counter',        icon: '🔲', room: 'kitchen', cost: 100,  quality: 1, needBonus: {},             comfort: 0, w: 1, h: 1 },
    sink_k:        { label: 'Kitchen Sink',   icon: '🚰', room: 'kitchen', cost: 120,  quality: 1, needBonus: { hygiene: 5 }, comfort: 0, w: 1, h: 1, breakChance: 0.05 },
    microwave:     { label: 'Microwave',      icon: '🍱', room: 'kitchen', cost: 150,  quality: 1, needBonus: { hunger: 15 }, comfort: 0, w: 1, h: 1, breakChance: 0.06 },
    espresso:      { label: 'Espresso Machine',icon:'☕', room: 'kitchen', cost: 400,  quality: 2, needBonus: { energy: 25 }, comfort: 0, w: 1, h: 1, breakChance: 0.05 },
    dishwasher:    { label: 'Dishwasher',     icon: '🍽️', room: 'kitchen', cost: 500,  quality: 2, needBonus: { hygiene: 20 },comfort: 0, w: 1, h: 1, breakChance: 0.06 },

    // Bathroom
    toilet:        { label: 'Toilet',         icon: '🚽', room: 'bathroom', cost: 150,  quality: 1, needBonus: { hygiene: 10 }, comfort: 0, w: 1, h: 1, breakChance: 0.05 },
    basic_shower:  { label: 'Shower',         icon: '🚿', room: 'bathroom', cost: 250,  quality: 1, needBonus: { hygiene: 35 }, comfort: 1, w: 1, h: 1, breakChance: 0.04 },
    bathtub:       { label: 'Bathtub',        icon: '🛁', room: 'bathroom', cost: 600,  quality: 2, needBonus: { hygiene: 50, fun: 10 }, comfort: 3, w: 1, h: 2, breakChance: 0.03 },
    sink_b:        { label: 'Bathroom Sink',  icon: '🚰', room: 'bathroom', cost: 80,   quality: 1, needBonus: { hygiene: 8 },  comfort: 0, w: 1, h: 1, breakChance: 0.05 },

    // Living Room
    basic_sofa:    { label: 'Basic Sofa',     icon: '🛋️', room: 'living', cost: 200,  quality: 1, needBonus: { comfort: 10, fun: 5 }, comfort: 3,  w: 2, h: 1 },
    nice_sofa:     { label: 'Sectional Sofa', icon: '🛋️', room: 'living', cost: 800,  quality: 2, needBonus: { comfort: 18, fun: 8 }, comfort: 6,  w: 2, h: 1 },
    cushion:       { label: 'Floor Cushion',  icon: '🟣', room: 'living', cost: 50,   quality: 1, needBonus: { comfort: 8, fun: 2 },  comfort: 2, w: 1, h: 1 },
    basic_tv:      { label: 'Small TV',       icon: '📺', room: 'living', cost: 250,  quality: 1, needBonus: { fun: 15 },              comfort: 0,  w: 1, h: 1 },
    big_tv:        { label: 'Flat Screen TV', icon: '📺', room: 'living', cost: 900,  quality: 2, needBonus: { fun: 25 },              comfort: 0,  w: 2, h: 1 },
    bookshelf:     { label: 'Bookshelf',      icon: '📚', room: 'living', cost: 150,  quality: 1, needBonus: { fun: 8 },               comfort: 1,  w: 1, h: 1, skill: 'logic' },
    wide_bookcase: { label: 'Wide Bookcase',  icon: '🏛️', room: 'living', cost: 600,  quality: 2, needBonus: { fun: 15 },              comfort: 0,  w: 3, h: 1, skill: 'logic' },
    coffee_table:  { label: 'Coffee Table',   icon: '☕', room: 'living', cost: 80,   quality: 1, needBonus: {},                       comfort: 2,  w: 1, h: 1 },
    stereo:        { label: 'Stereo System',  icon: '📻', room: 'living', cost: 350,  quality: 1, needBonus: { fun: 20 },              comfort: 0,  w: 1, h: 1 },
    decorated_table:{ label: 'Decorated Table',icon: '🕯️', room: 'living', cost: 400,  quality: 2, needBonus: { comfort: 10 },          comfort: 2,  w: 2, h: 1 },
    grand_piano:   { label: 'Grand Piano',    icon: '🎹', room: 'living', cost: 2500, quality: 3, needBonus: { fun: 45, social: 10 },  comfort: 0,  w: 2, h: 2, texture: 'grandPiano_se' },
    fireplace:     { label: 'Fireplace',      icon: '🔥', room: 'living', cost: 1200, quality: 3, needBonus: { comfort: 15 },          comfort: 5,  w: 2, h: 1 },
    recliner:      { label: 'Recliner',       icon: '💺', room: 'living', cost: 450,  quality: 2, needBonus: { comfort: 12, energy: 5},comfort: 5,  w: 1, h: 1 },

    // Study
    basic_desk:    { label: 'Basic Desk',     icon: '🪑', room: 'study', cost: 200,  quality: 1, needBonus: {},             comfort: 1, w: 1, h: 1 },
    computer:      { label: 'Computer',       icon: '💻', room: 'study', cost: 500,  quality: 1, needBonus: { fun: 10 },    comfort: 0, w: 1, h: 1, skill: 'tech' },
    good_computer: { label: 'Gaming PC',      icon: '💻', room: 'study', cost: 1500, quality: 2, needBonus: { fun: 20 },    comfort: 0, w: 1, h: 1, skill: 'tech' },
    candle_stand:  { label: 'Candle Stand',   icon: '🕯️', room: 'study', cost: 130,  quality: 2, needBonus: { comfort: 12 },comfort: 0, w: 1, h: 1 },
    study_shelf:   { label: 'Study Bookshelf',icon: '📚', room: 'study', cost: 180,  quality: 1, needBonus: {},             comfort: 1, w: 1, h: 1, skill: 'logic' },
    globe:         { label: 'Globe',          icon: '🌍', room: 'library', cost: 150,  quality: 2, needBonus: {},             comfort: 0, w: 1, h: 1, skill: 'logic' },
    drafting_table:{ label: 'Drafting Table', icon: '📐', room: 'library', cost: 220,  quality: 2, needBonus: { fun: 10 },    comfort: 0, w: 2, h: 1, skill: 'creativity' },

    // Gym
    treadmill:     { label: 'Treadmill',      icon: '🏃', room: 'gym', cost: 400,  quality: 1, needBonus: { fun: 5 },  comfort: 0, w: 1, h: 2, skill: 'fitness' },
    weights:       { label: 'Weight Bench',   icon: '🏋️', room: 'gym', cost: 350,  quality: 1, needBonus: {},          comfort: 0, w: 1, h: 1, skill: 'fitness' },
    yoga_mat:      { label: 'Yoga Mat',       icon: '🧘', room: 'gym', cost: 50,   quality: 1, needBonus: { fun: 8 },  comfort: 0, w: 1, h: 1, skill: 'fitness' },

    // Game Room / Hobby
    game_console:  { label: 'Game Console',   icon: '🎮', room: 'gameroom', cost: 400,  quality: 1, needBonus: { fun: 25 },            comfort: 0, w: 1, h: 1 },
    arcade_machine: { label: 'Arcade Machine', icon: '🕹️', room: 'gameroom', cost: 1200, quality: 3, needBonus: { fun: 35 }, comfort: 0, w: 1, h: 2, texture: 'arcadeMachine_se' },
    display_case:  { label: 'Display Case',   icon: '💎', room: 'gameroom', cost: 800,  quality: 2, needBonus: { fun: 15 },            comfort: 0, w: 1, h: 2 },
    pool_table:    { label: 'Pool Table',     icon: '🎱', room: 'gameroom', cost: 700,  quality: 2, needBonus: { fun: 20, social: 10 }, comfort: 0, w: 2, h: 1 },
    dartboard:     { label: 'Dartboard',      icon: '🎯', room: 'gameroom', cost: 80,   quality: 1, needBonus: { fun: 12 },            comfort: 0, w: 1, h: 1 },

    // Garden
    garden_plot:   { label: 'Garden Plot',    icon: '🌱', room: 'garden', cost: 50,  quality: 1, needBonus: {},          comfort: 0, w: 1, h: 1, skill: 'gardening' },
    bonsai_shrine: { label: 'Bonsai Shrine',  icon: '⛩️', room: 'garden', cost: 800, quality: 3, needBonus: { comfort: 15, fun: 10 }, comfort: 0, w: 1, h: 1, texture: 'bonsaiShrine_se' },
    garden_bench:  { label: 'Garden Bench',   icon: '🪑', room: 'garden', cost: 100, quality: 1, needBonus: { comfort: 8, fun: 5 }, comfort: 3, w: 2, h: 1 },
    fountain:      { label: 'Fountain',       icon: '⛲', room: 'garden', cost: 500, quality: 2, needBonus: { comfort: 15 },       comfort: 5, w: 1, h: 1 },
    bbq_grill:     { label: 'BBQ Grill',      icon: '🥓', room: 'patio',  cost: 400, quality: 2, needBonus: { hunger: 25, fun: 5}, comfort: 0, w: 1, h: 1, skill: 'cooking' },
    hot_tub:       { label: 'Hot Tub',        icon: '🛁', room: 'patio',  cost: 1500,quality: 3, needBonus: { hygiene: 10, fun: 20, comfort: 15 }, comfort: 5, w: 2, h: 2 },
    hammock:       { label: 'Hammock',        icon: '🏕️', room: 'patio',  cost: 250, quality: 1, needBonus: { energy: 10, comfort: 10 }, comfort: 4, w: 2, h: 1 },
    telescope:     { label: 'Telescope',      icon: '🔭', room: 'patio',  cost: 800, quality: 2, needBonus: { fun: 15 },       comfort: 0, w: 1, h: 1, skill: 'logic' },

    // Workshop
    workbench:     { label: 'Workbench',      icon: '🧰', room: 'workshop', cost: 300, quality: 1, needBonus: { fun: 10 },     comfort: 0, w: 2, h: 1, skill: 'handiness' },
    printer_3d:    { label: '3D Printer',     icon: '🖨️', room: 'workshop', cost: 1200,quality: 2, needBonus: { fun: 25 },     comfort: 0, w: 1, h: 1, skill: 'tech' },

    // Dining
    dining_table:  { label: 'Dining Table',   icon: '🍽️', room: 'dining', cost: 300,  quality: 1, needBonus: { social: 10, comfort: 5 }, comfort: 2, w: 2, h: 1 },
    dining_chairs: { label: 'Dining Chairs',  icon: '🪑', room: 'dining', cost: 120,  quality: 1, needBonus: {},                        comfort: 1, w: 1, h: 1 },
    china_cabinet: { label: 'China Cabinet',  icon: '🏺', room: 'dining', cost: 400,  quality: 2, needBonus: { comfort: 8 },            comfort: 3, w: 1, h: 1 },

    // Multi-room decorations
    plant:         { label: 'House Plant',    icon: '🪴', room: '*', cost: 30,  quality: 1, needBonus: { comfort: 3 }, comfort: 2, w: 1, h: 1 },
    rug:           { label: 'Area Rug',       icon: '🟫', room: '*', cost: 80,  quality: 1, needBonus: { comfort: 5 }, comfort: 3, w: 2, h: 2 },
    painting:      { label: 'Wall Painting',  icon: '🖼️', room: '*', cost: 120, quality: 1, needBonus: { comfort: 4, fun: 2 }, comfort: 2, w: 1, h: 1 },
    aquarium:      { label: 'Aquarium',       icon: '🐠', room: '*', cost: 600, quality: 2, needBonus: { fun: 10, comfort: 5 },comfort: 0, w: 2, h: 1 },
    mirror:        { label: 'Standing Mirror',icon: '🪞', room: '*', cost: 150, quality: 1, needBonus: {},                     comfort: 0, w: 1, h: 1, skill: 'charisma' },
    indoor_tree:   { label: 'Indoor Tree',    icon: '🌲', room: '*', cost: 100, quality: 1, needBonus: { comfort: 4 },           comfort: 1, w: 1, h: 2 },
    map_portal:    { label: 'Door / Portal',  icon: '🚪', room: '*', cost: 0,   quality: 1, needBonus: {},                     comfort: 0, w: 1, h: 1 },

    // City & Specialized
    subway_gate:   { label: 'Subway Gate',    icon: '🚇', room: '*', cost: 0,   quality: 1, needBonus: {}, comfort: 0, w: 1, h: 1 },
    language_book: { label: 'HSK Textbook',   icon: '📘', room: '*', cost: 80,  quality: 1, needBonus: { fun: -5 }, comfort: 0, w: 1, h: 1, skill: 'language' },
    display_shelf: { label: 'Souvenir Shelf', icon: '🪆', room: '*', cost: 200, quality: 1, needBonus: { fun: 5 }, comfort: 0, w: 1, h: 1 },

    // Pets & Cultivation Rewards
    pet_bowl:      { label: 'Pet Bowl',       icon: '🥣', room: '*', cost: 40,  quality: 1, needBonus: {}, comfort: 0, w: 1, h: 1 },
    potted_flower: { label: 'Potted Flower',  icon: '🌷', room: '*', cost: 200, quality: 3, needBonus: { comfort: 10, fun: 5 }, comfort: 5, w: 1, h: 1 },
  },

  // ----------------------------------------------------------
  // Careers
  // ----------------------------------------------------------
  CAREERS: {
    business: {
      label: 'Business', icon: '💼', keySkill: 'charisma',
      levels: [
        { title: 'Mail Room Clerk',   salary: 60,  scheduleStart: 9, scheduleEnd: 17, skillReq: 0 },
        { title: 'Office Assistant',   salary: 100, scheduleStart: 9, scheduleEnd: 17, skillReq: 2 },
        { title: 'Account Manager',    salary: 180, scheduleStart: 9, scheduleEnd: 17, skillReq: 4 },
        { title: 'Department Head',    salary: 280, scheduleStart: 9, scheduleEnd: 17, skillReq: 6 },
        { title: 'Vice President',     salary: 450, scheduleStart: 9, scheduleEnd: 17, skillReq: 8 },
      ],
    },
    tech: {
      label: 'Tech', icon: '💻', keySkill: 'tech',
      levels: [
        { title: 'QA Tester',         salary: 70,  scheduleStart: 10, scheduleEnd: 18, skillReq: 0 },
        { title: 'Junior Developer',   salary: 120, scheduleStart: 10, scheduleEnd: 18, skillReq: 2 },
        { title: 'Senior Developer',   salary: 220, scheduleStart: 10, scheduleEnd: 18, skillReq: 4 },
        { title: 'Tech Lead',          salary: 350, scheduleStart: 10, scheduleEnd: 18, skillReq: 6 },
        { title: 'CTO',               salary: 500, scheduleStart: 10, scheduleEnd: 18, skillReq: 8 },
      ],
    },
    culinary: {
      label: 'Culinary', icon: '🍳', keySkill: 'cooking',
      levels: [
        { title: 'Dishwasher',        salary: 45,  scheduleStart: 8, scheduleEnd: 15, skillReq: 0 },
        { title: 'Line Cook',          salary: 80,  scheduleStart: 8, scheduleEnd: 15, skillReq: 2 },
        { title: 'Sous Chef',          salary: 150, scheduleStart: 8, scheduleEnd: 15, skillReq: 4 },
        { title: 'Head Chef',          salary: 250, scheduleStart: 8, scheduleEnd: 15, skillReq: 6 },
        { title: 'Executive Chef',     salary: 400, scheduleStart: 8, scheduleEnd: 15, skillReq: 8 },
      ],
    },
    science: {
      label: 'Science', icon: '🔬', keySkill: 'logic',
      levels: [
        { title: 'Lab Assistant',      salary: 65,  scheduleStart: 8, scheduleEnd: 16, skillReq: 0 },
        { title: 'Research Associate',  salary: 110, scheduleStart: 8, scheduleEnd: 16, skillReq: 2 },
        { title: 'Scientist',          salary: 200, scheduleStart: 8, scheduleEnd: 16, skillReq: 4 },
        { title: 'Lead Researcher',    salary: 320, scheduleStart: 8, scheduleEnd: 16, skillReq: 6 },
        { title: 'Department Chair',   salary: 480, scheduleStart: 8, scheduleEnd: 16, skillReq: 8 },
      ],
    },
    creative: {
      label: 'Creative', icon: '🎨', keySkill: 'creativity',
      levels: [
        { title: 'Freelance Artist',   salary: 40,  scheduleStart: 10, scheduleEnd: 16, skillReq: 0 },
        { title: 'Graphic Designer',   salary: 90,  scheduleStart: 10, scheduleEnd: 16, skillReq: 2 },
        { title: 'Art Director',       salary: 170, scheduleStart: 10, scheduleEnd: 16, skillReq: 4 },
        { title: 'Creative Director',  salary: 300, scheduleStart: 10, scheduleEnd: 16, skillReq: 6 },
        { title: 'Studio Owner',       salary: 550, scheduleStart: 10, scheduleEnd: 16, skillReq: 8 },
      ],
    },
    medicine: {
      label: 'Medicine', icon: '🩺', keySkill: 'logic',
      levels: [
        { title: 'Orderly',            salary: 50,  scheduleStart: 8, scheduleEnd: 18, skillReq: 0 },
        { title: 'EMT',                salary: 100, scheduleStart: 8, scheduleEnd: 18, skillReq: 2 },
        { title: 'Nurse',              salary: 190, scheduleStart: 8, scheduleEnd: 18, skillReq: 4 },
        { title: 'Doctor',             salary: 320, scheduleStart: 8, scheduleEnd: 18, skillReq: 6 },
        { title: 'Surgeon',            salary: 550, scheduleStart: 8, scheduleEnd: 18, skillReq: 8 },
      ],
    },
    entertainment: {
      label: 'Entertainment', icon: '🎤', keySkill: 'charisma',
      levels: [
        { title: 'Open Mic Comic',     salary: 30,  scheduleStart: 18, scheduleEnd: 23, skillReq: 0 },
        { title: 'Standup Regular',    salary: 80,  scheduleStart: 18, scheduleEnd: 23, skillReq: 2 },
        { title: 'Sitcom Star',        salary: 200, scheduleStart: 10, scheduleEnd: 18, skillReq: 4 },
        { title: 'Movie Star',         salary: 450, scheduleStart: 8,  scheduleEnd: 20, skillReq: 6 },
        { title: 'Global Icon',        salary: 800, scheduleStart: 12, scheduleEnd: 16, skillReq: 8 },
      ],
    },
    education: {
      label: 'Education', icon: '🍎', keySkill: 'logic',
      levels: [
        { title: 'Substitute Teacher', salary: 40,  scheduleStart: 8, scheduleEnd: 15, skillReq: 0 },
        { title: 'Teacher',            salary: 90,  scheduleStart: 8, scheduleEnd: 15, skillReq: 2 },
        { title: 'Vice Principal',     salary: 160, scheduleStart: 8, scheduleEnd: 16, skillReq: 4 },
        { title: 'Principal',          salary: 260, scheduleStart: 8, scheduleEnd: 16, skillReq: 6 },
        { title: 'Superintendent',     salary: 420, scheduleStart: 9, scheduleEnd: 17, skillReq: 8 },
      ],
    },
  },

  // ----------------------------------------------------------
  // NPCs
  // ----------------------------------------------------------
  NPCS: [
    { id: 'npc_alex',   name: 'Alex Chen',     personality: 'friendly',   interests: ['tech', 'games'],     avatar: '👨', color: '#4FC3F7' },
    { id: 'npc_maya',   name: 'Maya Santos',    personality: 'creative',   interests: ['art', 'cooking'],    avatar: '👩', color: '#F06292' },
    { id: 'npc_jordan', name: 'Jordan Park',    personality: 'ambitious',  interests: ['fitness', 'career'], avatar: '🧑', color: '#81C784' },
    { id: 'npc_sam',    name: 'Sam Williams',   personality: 'chill',      interests: ['music', 'garden'],   avatar: '👤', color: '#FFB74D' },
    { id: 'npc_riley',  name: 'Riley Zhang',    personality: 'intellectual', interests: ['books', 'science'], avatar: '👩‍🔬', color: '#CE93D8' },
    { id: 'npc_casey',  name: 'Casey Martinez', personality: 'romantic',   interests: ['cooking', 'movies'], avatar: '🧑‍🎨', color: '#EF5350' },
    { id: 'npc_morgan', name: 'Morgan Frost',   personality: 'grumpy',     interests: ['logic', 'handiness'], avatar: '🙎', color: '#BDBDBD' },
    { id: 'npc_taylor', name: 'Taylor Quinn',   personality: 'outgoing',   interests: ['charisma', 'fitness'], avatar: '🏃', color: '#FFA726' },
  ],

  // ----------------------------------------------------------
  // Social Interactions
  // ----------------------------------------------------------
  INTERACTIONS: {
    small_talk:    { label: 'Small Talk',       relGain: [2, 5],   socialGain: 5,   time: 15, minRel: 0,  charismaReq: 0 },
    tell_joke:     { label: 'Tell Joke',        relGain: [3, 8],   socialGain: 8,   time: 10, minRel: 0,  charismaReq: 1 },
    deep_talk:     { label: 'Deep Conversation',relGain: [5, 10],  socialGain: 15,  time: 30, minRel: 40, charismaReq: 2 },
    compliment:    { label: 'Compliment',       relGain: [4, 8],   socialGain: 6,   time: 5,  minRel: 0,  charismaReq: 0 },
    give_gift:     { label: 'Give Gift ($50)',   relGain: [10, 20], socialGain: 5,   time: 10, minRel: 20, charismaReq: 0, cost: 50 },
    cook_together: { label: 'Cook Together',    relGain: [8, 12],  socialGain: 12,  time: 45, minRel: 40, charismaReq: 1, needRoom: 'kitchen' },
    work_out:      { label: 'Work Out Together',relGain: [6, 10],  socialGain: 10,  time: 60, minRel: 30, charismaReq: 0, needRoom: 'gym' },
    flirt:         { label: 'Flirt',            relGain: [5, 15],  socialGain: 10,  time: 15, minRel: 30, charismaReq: 3, romantic: true },
    propose:       { label: 'Propose! 💍',      relGain: [30, 30], socialGain: 30,  time: 30, minRel: 80, charismaReq: 5, romantic: true, cost: 500, marriage: true },
  },

  // ----------------------------------------------------------
  // Events
  // ----------------------------------------------------------
  EVENTS: [
    { 
      id: 'study_abroad_arrival', 
      type: 'story', 
      title: '🛫 Arrival at Pudong Airport', 
      visual: '🛬',
      dialogue: [
        "Visa Officer: Welcome to Shanghai. Purpose of your visit?",
        "You: I'm here for my Master's Degree.",
        "Visa Officer: Excellent. Ensure you register at the local police station within 24 hours."
      ],
      description: 'You stepped off the plane holding your admission letter tightly. The humid Shanghai air hits you instantly. Your multi-epoch journey as an international student in China has just begun.', 
      choices: [
        { label: 'Take the Maglev Train ($8)', effects: { money: -8, fun: 20, energy: -5 } },
        { label: 'Take a Taxi ($30)', effects: { money: -30, comfort: 20, energy: -2 } },
        { label: 'Take the Metro ($1)', effects: { money: -1, energy: -15 } },
      ]
    },
    { id: 'neighbor_cookies', type: 'opportunity', title: '🍪 Neighbor Visit', desc: 'Your neighbor brought homemade cookies!', choices: [
      { label: 'Accept warmly', effects: { hunger: 15, social: 10, fun: 5 } },
      { label: 'Invite them in', effects: { social: 20, fun: 10 }, relBoost: { random: 5 } },
    ]},
    { id: 'pipe_leak', type: 'disaster', title: '🔧 Pipe Leak!', desc: 'A pipe burst in your house!', choices: [
      { label: 'Call plumber ($100)', effects: { money: -100 } },
      { label: 'Fix it yourself', effects: {}, skillCheck: { handiness: 3, failCost: -150 } },
    ]},
    { id: 'job_opportunity', type: 'opportunity', title: '💼 Job Offer', desc: 'A recruiter noticed your work. Bonus opportunity!', choices: [
      { label: 'Work extra hard', effects: { energy: -20 }, careerBoost: 0.5 },
      { label: 'Play it cool', effects: { fun: 10 } },
    ]},
    { id: 'yard_sale', type: 'opportunity', title: '🏷️ Yard Sale Nearby', desc: 'A neighbor is having a yard sale with great deals.', choices: [
      { label: 'Browse ($30)', effects: { money: -30, fun: 15 } },
      { label: 'Buy furniture ($80)', effects: { money: -80, comfort: 20 } },
      { label: 'Skip it', effects: {} },
    ]},
    { id: 'storm', type: 'disaster', title: '⛈️ Big Storm', desc: 'A heavy storm hits the area. Stay inside!', choices: [
      { label: 'Cozy up inside', effects: { comfort: 10, fun: 5 } },
      { label: 'Check for damage', effects: { energy: -10 }, preventDamage: true },
    ]},
    { id: 'found_money', type: 'discovery', title: '💰 Lucky Find!', desc: 'You found some money in your old coat pocket!', choices: [
      { label: 'Sweet!', effects: { money: 50, fun: 10 } },
    ]},
    { id: 'party_invite', type: 'social', title: '🎉 Party Invitation', desc: 'You\'ve been invited to a neighborhood party!', choices: [
      { label: 'Go and mingle', effects: { social: 25, fun: 15, energy: -15 } },
      { label: 'Stay home', effects: { comfort: 10 } },
    ]},
    { id: 'power_outage', type: 'disaster', title: '🔌 Power Outage', desc: 'The neighborhood lost power for a few hours.', choices: [
      { label: 'Light candles', effects: { comfort: -5, fun: 5 } },
      { label: 'Go out for dinner ($40)', effects: { money: -40, fun: 15, hunger: 25 } },
    ]},
    { id: 'stray_cat', type: 'opportunity', title: '🐱 Stray Cat', desc: 'A friendly stray cat appeared at your door.', choices: [
      { label: 'Feed it ($10)', effects: { money: -10, fun: 15, social: 5 } },
      { label: 'Shoo it away', effects: {} },
    ]},
    { id: 'cooking_fire', type: 'disaster', title: '🔥 Kitchen Fire!', desc: 'Smoke is coming from the stove!', choices: [
      { label: 'Grab extinguisher', effects: { energy: -10 }, skillCheck: { cooking: 2, failCost: -200 } },
      { label: 'Call fire dept ($150)', effects: { money: -150 } },
    ]},
    { id: 'freelance_gig', type: 'opportunity', title: '💻 Freelance Gig', desc: 'Someone needs help with a small project.', choices: [
      { label: 'Take the gig', effects: { energy: -20, money: 80 }, skillCheck: { tech: 2 } },
      { label: 'Too busy', effects: {} },
    ]},
    { id: 'book_club', type: 'social', title: '📖 Book Club', desc: 'A local book club is meeting tonight.', choices: [
      { label: 'Join in', effects: { social: 15, fun: 10 }, skillGain: { logic: 15 } },
      { label: 'Not interested', effects: {} },
    ]},
    { id: 'lottery_win', type: 'discovery', title: '🍀 Lottery Win!', desc: 'You bought a scratch-off ticket and won!', choices: [
      { label: 'Claim Prize', effects: { money: 1000, fun: 30 } },
    ]},
    { id: 'burglary', type: 'disaster', title: '🦹 Burglary!', desc: 'Someone broke in while you were sleeping!', choices: [
      { label: 'Call Police', effects: { money: -300, comfort: -20, energy: -10 } },
    ]},
    { id: 'sick_day', type: 'disaster', title: '🤧 Sick Day', desc: 'You woke up feeling terrible with a cold.', choices: [
      { label: 'Rest in bed', effects: { energy: -30, comfort: -15, fun: -10 } },
      { label: 'Buy medicine ($50)', effects: { money: -50, energy: -10 } },
    ]},
    { id: 'alien_abduction', type: 'discovery', title: '🛸 Alien Abduction!', desc: 'You were beamed up to a saucer and probed.', choices: [
      { label: 'Whoa...', effects: { energy: -40, fun: -20 }, skillGain: { logic: 50 } },
    ]},
    { id: 'secret_admirer', type: 'social', title: '💌 Secret Admirer', desc: 'You found an anonymous love letter and a gift.', choices: [
      { label: 'Read it', effects: { social: 25, fun: 15 } },
    ]},
  ],

  // ----------------------------------------------------------
  // Crop Market
  // ----------------------------------------------------------
  CROPS: {
    tomato: { label: 'Tomato', cost: 5, sellPrice: 24, growthTime: 360, icon: '🍅' }, // ~6 hours
    corn: { label: 'Corn', cost: 15, sellPrice: 70, growthTime: 720, icon: '🌽' },     // ~12 hours
    pumpkin: { label: 'Pumpkin', cost: 50, sellPrice: 260, growthTime: 1440, icon: '🎃' }, // ~24 hours
  },

  // ----------------------------------------------------------
  // Activities (things you can do with furniture/rooms)
  // ----------------------------------------------------------
  ACTIVITIES: {
    sleep:        { label: 'Sleep',          duration: 480, needs: { energy: 80 },  room: 'bedroom',  furniture: 'bed',    icon: '💤', moodlet: { name: 'Well Rested', value: 8, duration: 240, icon: '😴' } },
    nap:          { label: 'Take a Nap',     duration: 120, needs: { energy: 30 },  room: 'bedroom',  furniture: 'bed',    icon: '😴', moodlet: { name: 'Refreshed', value: 4, duration: 120, icon: '💤' } },
    cook:         { label: 'Cook a Meal',    duration: 30,  needs: { hunger: 25 },  room: 'kitchen',  furniture: 'stove',  icon: '🍳', skill: 'cooking', xp: 15, moodlet: { name: 'Home Cooked', value: 6, duration: 180, icon: '🍳' } },
    gourmet_feast:{ label: 'Gourmet Feast',  duration: 60,  needs: { hunger: 100, fun: 15 }, room: 'kitchen', furniture: 'smart_stove', icon: '🍲', skill: 'cooking', xp: 40, moodlet: { name: 'Culinary Masterpiece', value: 12, duration: 400, icon: '✨' }, requires: { skill: 'cooking', level: 5 } },
    eat:          { label: 'Eat',            duration: 20,  needs: { hunger: 20 },  room: 'kitchen',  furniture: null,     icon: '🍽️', moodlet: { name: 'Satisfied', value: 3, duration: 120, icon: '🍽️' } },
    shower:       { label: 'Shower',         duration: 20,  needs: { hygiene: 40 }, room: 'bathroom', furniture: 'shower', icon: '🚿', moodlet: { name: 'Squeaky Clean', value: 5, duration: 180, icon: '✨' } },
    bath:         { label: 'Take a Bath',    duration: 45,  needs: { hygiene: 50, fun: 10 }, room: 'bathroom', furniture: 'bathtub', icon: '🛁', moodlet: { name: 'Pampered', value: 8, duration: 240, icon: '🛁' } },
    use_toilet:   { label: 'Use Bathroom',   duration: 10,  needs: { bladder: 100, hygiene: -10 }, room: 'bathroom', furniture: 'toilet', icon: '🚽', moodlet: { name: 'Relieved', value: 2, duration: 60, icon: '🚽' } },
    watch_tv:     { label: 'Watch TV',       duration: 30,  needs: { fun: 20 },     room: 'living',   furniture: 'tv',     icon: '📺', moodlet: { name: 'Entertained', value: 4, duration: 120, icon: '📺' } },
    read:         { label: 'Read a Book',    duration: 45,  needs: { fun: 12 },     room: 'living',   furniture: 'bookshelf', icon: '📚', skill: 'logic', xp: 12, moodlet: { name: 'Inspired', value: 5, duration: 180, icon: '📖' } },
    read_wide:    { label: 'Deep Study',     duration: 90,  needs: { fun: 20 },     room: 'living',   furniture: 'wide_bookcase', icon: '🏛️', skill: 'logic', xp: 40, moodlet: { name: 'Enlightened', value: 8, duration: 300, icon: '💡' }, requires: { skill: 'logic', level: 3 } },
    use_computer: { label: 'Use Computer',   duration: 60,  needs: { fun: 15 },     room: 'study',    furniture: 'computer', icon: '💻', skill: 'tech', xp: 15, moodlet: { name: 'Plugged In', value: 4, duration: 120, icon: '💻' } },
    light_candle: { label: 'Meditate',       duration: 45,  needs: { comfort: 30, energy: 10 }, room: 'study', furniture: 'candle_stand', icon: '🕯️', moodlet: { name: 'Zen', value: 10, duration: 240, icon: '🧘' } },
    admire_case:  { label: 'Admire Display', duration: 20,  needs: { fun: 15 },     room: 'gameroom', furniture: 'display_case', icon: '💎', moodlet: { name: 'Impressed', value: 5, duration: 120, icon: '🤩' } },
    exercise:     { label: 'Exercise',       duration: 60,  needs: { fun: 8 },      room: 'gym',      furniture: null,     icon: '🏋️', skill: 'fitness', xp: 18, energyCost: 15, moodlet: { name: 'Pumped Up', value: 6, duration: 180, icon: '💪' } },
    play_games:   { label: 'Play Games',     duration: 45,  needs: { fun: 25 },     room: 'gameroom', furniture: 'game_console', icon: '🎮', moodlet: { name: 'Having a Blast', value: 7, duration: 150, icon: '🎮' } },
    plant_tomato: { label: 'Plant Tomato ($5)',  duration: 15,  needs: { fun: 5 },      room: 'garden',   furniture: 'garden_plot', icon: '🍅', skill: 'gardening', xp: 5, energyCost: 5, cost: 5 },
    plant_corn:   { label: 'Plant Corn ($15)',   duration: 15,  needs: { fun: 5 },      room: 'garden',   furniture: 'garden_plot', icon: '🌽', skill: 'gardening', xp: 8, energyCost: 8, cost: 15 },
    plant_pumpkin:{ label: 'Plant Pumpkin ($50)',duration: 15,  needs: { fun: 5 },      room: 'garden',   furniture: 'garden_plot', icon: '🎃', skill: 'gardening', xp: 15, energyCost: 15, cost: 50 },
    water_crop:   { label: 'Water Crop',         duration: 10,  needs: { fun: 2 },      room: 'garden',   furniture: 'garden_plot', icon: '💧', skill: 'gardening', xp: 5, energyCost: 2 },
    harvest_crop: { label: 'Harvest Crop',       duration: 20,  needs: { fun: 15 },     room: 'garden',   furniture: 'garden_plot', icon: '🌾', skill: 'gardening', xp: 20, moodlet: { name: 'Bountiful Harvest', value: 5, duration: 180, icon: '🥕' } },
    paint:        { label: 'Paint',          duration: 60,  needs: { fun: 15 },     room: 'study',    furniture: null,     icon: '🎨', skill: 'creativity', xp: 15, moodlet: { name: 'Creatively Fulfilled', value: 6, duration: 180, icon: '🎨' } },
    relax_sofa:   { label: 'Relax on Sofa',  duration: 30,  needs: { comfort: 20, fun: 8 }, room: 'living', furniture: 'sofa', icon: '🛋️', moodlet: { name: 'Cozy', value: 4, duration: 120, icon: '🛋️' } },
    sit_garden:   { label: 'Enjoy Garden',   duration: 20,  needs: { fun: 12, comfort: 8 }, room: 'garden', furniture: 'garden_bench', icon: '🌸', moodlet: { name: 'At Peace', value: 5, duration: 150, icon: '🌸' } },
    stargaze:     { label: 'Stargaze',       duration: 45,  needs: { fun: 15 },             room: 'patio',  furniture: 'telescope',    icon: '🔭', skill: 'logic', xp: 15, moodlet: { name: 'Starstruck', value: 5, duration: 180, icon: '✨' } },
    make_coffee:  { label: 'Make Espresso',  duration: 10,  needs: { energy: 25 },          room: 'kitchen',furniture: 'espresso',     icon: '☕', moodlet: { name: 'Caffeinated', value: 6, duration: 180, icon: '⚡' } },
    listen_music: { label: 'Listen to Music',duration: 30,  needs: { fun: 20 },             room: 'living', furniture: 'stereo',       icon: '📻', moodlet: { name: 'Jamming Out', value: 5, duration: 120, icon: '🎵' } },
    grill_food:   { label: 'Grill Food',     duration: 40,  needs: { hunger: 30 },          room: 'patio',  furniture: 'bbq_grill',    icon: '🥓', skill: 'cooking', xp: 20, moodlet: { name: 'BBQ Master', value: 6, duration: 180, icon: '🍔' } },
    tinker:       { label: 'Tinker',         duration: 60,  needs: { fun: 15 },             room: 'workshop',furniture: 'workbench',   icon: '🧰', skill: 'handiness', xp: 25, moodlet: { name: 'Productive', value: 5, duration: 180, icon: '🔧' } },
    use_hottub:   { label: 'Relax in Tub',   duration: 45,  needs: { hygiene: 20, fun: 15, comfort: 20 }, room: 'patio', furniture: 'hot_tub', icon: '🛁', moodlet: { name: 'Steamy', value: 8, duration: 240, icon: '🫧' } },
    practice_speech:{ label:'Practice Speech',duration: 30, needs: { fun: 5 },              room: 'bedroom', furniture: 'mirror',      icon: '🪞', skill: 'charisma', xp: 15, moodlet: { name: 'Confident', value: 5, duration: 180, icon: '😎' } },
    repair:        { label: 'Repair',         duration: 30, needs: {},                       room: null,      furniture: null,           icon: '🔧', skill: 'handiness', xp: 25, moodlet: { name: 'Handy', value: 4, duration: 120, icon: '🔧' } },
    invite_over:   { label: 'Invite Friend',  duration: 60, needs: { social: 30, fun: 15 },  room: 'living',  furniture: null,           icon: '🏠', moodlet: { name: 'Good Company', value: 7, duration: 240, icon: '👥' } },
    travel:        { label: 'Travel',         duration: 1,  needs: {},                       room: '*',       furniture: 'map_portal',   icon: '🚶' },
    take_subway:   { label: 'Take Subway',    duration: 15, needs: { energy: 5 },            room: '*',       furniture: 'subway_gate',  icon: '🚇', cost: 5 },
    fill_bowl:     { label: 'Fill Pet Bowl',  duration: 10,  needs: { fun: 5 },              room: '*',       furniture: 'pet_bowl',     icon: '🐟', cost: 10, moodlet: { name: 'Caring Provider', value: 3, duration: 120, icon: '❤️' } },
    study_language:{ label: 'Study Chinese',  duration: 45,  needs: { energy: 10, fun: -5 }, room: '*',       furniture: 'language_book',icon: '📖', skill: 'language', xp: 20, moodlet: { name: 'Mind Expanded', value: 4, duration: 120, icon: '🧠' } },
    buy_souvenir:  { label: 'Buy Souvenir',   duration: 15,  needs: { fun: 10 },             room: '*',       furniture: 'display_shelf',icon: '🛍️', cost: 150, moodlet: { name: 'Shopper', value: 5, duration: 180, icon: '🎁' } },
  },

  // ----------------------------------------------------------
  // Autonomy Need → Activity Mapping
  // ----------------------------------------------------------
  AUTONOMY_MAP: [
    { need: 'energy',  threshold: 25, activity: 'sleep',   priority: 10 },
    { need: 'energy',  threshold: 50, activity: 'nap',     priority: 5 },
    { need: 'hunger',  threshold: 30, activity: 'cook',    priority: 9 },
    { need: 'hunger',  threshold: 50, activity: 'eat',     priority: 4 },
    { need: 'hygiene', threshold: 30, activity: 'shower',  priority: 8 },
    { need: 'hygiene', threshold: 50, activity: 'bath',    priority: 3 },
    { need: 'bladder', threshold: 40, activity: 'use_toilet', priority: 15 },
    { need: 'fun',     threshold: 35, activity: 'watch_tv',priority: 6 },
    { need: 'fun',     threshold: 50, activity: 'play_games', priority: 3 },
    { need: 'comfort', threshold: 35, activity: 'relax_sofa', priority: 4 },
    { need: 'social',  threshold: 35, activity: 'invite_over', priority: 2 },
  ],

  // ----------------------------------------------------------
  // Prestige Upgrades
  // ----------------------------------------------------------
  PRESTIGE: {
    family_home:    { label: 'Family Home',    icon: '🏠', cost: 10, maxLevel: 1, desc: 'Keep 50% of house layout',      effect: { keepHouse: 0.5 } },
    inheritance:    { label: 'Inheritance',     icon: '💰', cost: 8,  maxLevel: 3, desc: 'Start with 30% of savings/lvl', effect: { keepMoney: 0.3 } },
    family_wisdom:  { label: 'Family Wisdom',   icon: '📚', cost: 12, maxLevel: 5, desc: '+15% skill gain/lvl',          effect: { skillBonus: 0.15 } },
    connections:    { label: 'Connections',      icon: '💼', cost: 15, maxLevel: 3, desc: 'Start at career level +1/lvl', effect: { careerStart: 1 } },
    good_genes:     { label: 'Good Genes',       icon: '🧬', cost: 20, maxLevel: 3, desc: '-10% need decay/lvl',          effect: { needDecay: -0.10 } },
    bigger_lot:     { label: 'Bigger Lot',       icon: '🏡', cost: 25, maxLevel: 2, desc: '+2 lot size/lvl',              effect: { lotSize: 2 } },
    family_values:  { label: 'Family Values',    icon: '👨‍👩‍👧', cost: 18, maxLevel: 3, desc: '+20% relationship gain/lvl',  effect: { relBonus: 0.20 } },
    prodigy:        { label: 'Prodigy',          icon: '🌟', cost: 50, maxLevel: 1, desc: 'Heir starts with top skill @3', effect: { inheritSkill: 3 } },
  },

  // ----------------------------------------------------------
  // Achievements
  // ----------------------------------------------------------
  ACHIEVEMENTS: {
    first_friend:  { id: 'first_friend', label: 'First Friend', icon: '🤝', desc: 'Make your first friend in China.', rewardText: 'Social Confidence' },
    hsk_master:    { id: 'hsk_master',   label: 'HSK Master',   icon: '🎓', desc: 'Reach Chinese HSK level 6.', rewardText: '+20% Social Gain' },
    millionaire:   { id: 'millionaire',  label: 'Millionaire',  icon: '💰', desc: 'Accumulate $1,000,000.', rewardText: 'Financial Freedom' },
    globe_trotter: { id: 'globe_trotter',label: 'Globe Trotter',icon: '🧭', desc: 'Travel to every major city location.', rewardText: 'Cultural Insight' },
  },

  // ----------------------------------------------------------
  // Collections (Souvenirs)
  // ----------------------------------------------------------
  COLLECTIONS: {
    panda_plushie:           { id: 'panda_plushie',           label: 'Panda Plushie',           icon: '🐼', rarity: 'common' },
    terracotta_figurine:     { id: 'terracotta_figurine',     label: 'Terracotta Figurine',     icon: '🏺', rarity: 'uncommon' },
    silk_fan:                { id: 'silk_fan',                label: 'Silk Fan',                icon: '🪭', rarity: 'common' },
    jade_dragon:             { id: 'jade_dragon',             label: 'Jade Dragon',             icon: '🐉', rarity: 'rare' },
    opera_mask:              { id: 'opera_mask',              label: 'Peking Opera Mask',       icon: '🎭', rarity: 'uncommon' },
  },

  // ----------------------------------------------------------
  // Starting State
  // ----------------------------------------------------------
  STARTING_STATE: {
    money: 500,
    lotWidth: 64,
    lotHeight: 64,
  },
};
