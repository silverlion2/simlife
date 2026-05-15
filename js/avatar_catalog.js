// ============================================================
// SimLife - Avatar Customization Catalog
// ============================================================
window.Game = window.Game || {};

Game.AvatarCatalog = (function() {
  const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S'];

  const FORM_SLOTS = {
    human: ['body', 'hair', 'top', 'bottom', 'shoes', 'hat', 'accessory'],
    witch: ['body', 'hair', 'top', 'bottom', 'shoes', 'hat', 'accessory'],
    robot: ['chassis', 'headModule', 'torsoTrim', 'legTrim', 'face', 'accessory'],
    cat: ['coat', 'ears', 'face', 'collar', 'hat', 'accessory'],
    banana: ['peel', 'face', 'hat', 'accessory'],
  };

  const FORMS = {
    human: { label: 'Human', family: 'humanoid', slots: FORM_SLOTS.human, defaultDirection: 'S' },
    witch: { label: 'Witch', family: 'humanoid', slots: FORM_SLOTS.witch, defaultDirection: 'S' },
    robot: { label: 'Robot', family: 'robot', slots: FORM_SLOTS.robot, defaultDirection: 'S' },
    cat: { label: 'Cat', family: 'cat', slots: FORM_SLOTS.cat, defaultDirection: 'S' },
    banana: { label: 'Banana', family: 'banana', slots: FORM_SLOTS.banana, defaultDirection: 'S' },
  };

  const SLOT_ORDER = {
    coat: 5,
    chassis: 5,
    peel: 5,
    body: 10,
    legTrim: 20,
    bottom: 20,
    shoes: 30,
    torsoTrim: 40,
    top: 40,
    collar: 45,
    hair: 55,
    ears: 57,
    headModule: 60,
    face: 65,
    hat: 70,
    accessory: 80,
  };

  const PALETTES = {
    skin: ['warm_light', 'warm_medium', 'warm_deep', 'cool_light', 'cool_medium', 'cool_deep'],
    hair: ['black', 'dark_brown', 'chestnut', 'blonde', 'silver', 'rose'],
    clothing: ['sky_denim', 'forest_gold', 'charcoal_red', 'cream_navy', 'plum_teal', 'mint_coral', 'rust_blue', 'black_white', 'pink_gray', 'green_black', 'yellow_violet', 'white_gold'],
    robot: ['steel_blue', 'white_orange', 'black_lime', 'navy_cyan', 'red_gold', 'gray_purple', 'green_silver', 'copper_teal'],
    cat: ['tabby', 'tuxedo', 'calico', 'ginger', 'gray', 'cream', 'black', 'white'],
    banana: ['classic', 'ripe_spots', 'green_tip', 'golden', 'sunset', 'neon', 'chocolate', 'stickered'],
  };

  const COLOR_VALUES = {
    warm_light: '#e8b58a', warm_medium: '#c78b62', warm_deep: '#8f563b',
    cool_light: '#dfb39c', cool_medium: '#a96f5e', cool_deep: '#6f423a',
    black: '#1b1715', dark_brown: '#2c1c14', chestnut: '#6e3b22', blonde: '#d8b65a', silver: '#c6c8c7', rose: '#b45c75',
    sky_denim: '#3f7fb8', forest_gold: '#2f6f52', charcoal_red: '#26313a', cream_navy: '#e8dcc3',
    plum_teal: '#6c4a8d', mint_coral: '#65b8a6', rust_blue: '#a55232', black_white: '#1b1f24',
    pink_gray: '#d77fa1', green_black: '#396b45', yellow_violet: '#d7b83f', white_gold: '#f2ede0',
    steel_blue: '#6f8798', white_orange: '#f3efe6', black_lime: '#202820', navy_cyan: '#20395d',
    red_gold: '#9f3e35', gray_purple: '#6e687b', green_silver: '#54745f', copper_teal: '#a7653d',
    tabby: '#b57942', tuxedo: '#1f252b', calico: '#d09255', ginger: '#d98034', gray: '#888f96', cream: '#ead6ae', white: '#f4f1e7',
    classic: '#f0cf4f', ripe_spots: '#d8ad35', green_tip: '#b4c84f', golden: '#f4b83b',
    sunset: '#e27a3f', neon: '#dfff50', chocolate: '#6f4428', stickered: '#f2d84b',
  };

  const ITEM_GROUPS = {
    human: {
      body: ['average', 'slim', 'strong', 'soft'],
      hair: ['short_side_part', 'bob', 'curly', 'ponytail', 'buzz', 'long_wave', 'bun', 'spiky'],
      top: ['hoodie', 'jacket', 'tee', 'sweater', 'vest', 'dress_shirt', 'overalls', 'sport_top', 'kimono_top', 'coat'],
      bottom: ['jeans', 'skirt', 'shorts', 'slacks', 'cargo', 'leggings', 'wide_pants', 'overalls_bottom'],
      shoes: ['sneakers', 'boots', 'flats', 'loafers', 'sandals', 'high_tops'],
      hat: ['none', 'beanie', 'cap', 'wide_hat', 'headband', 'beret', 'visor', 'flower'],
      accessory: ['none', 'glasses', 'scarf', 'satchel', 'necklace', 'watch', 'backpack', 'earrings'],
    },
    witch: {
      body: ['classic', 'slim', 'strong', 'soft'],
      hair: ['short_side_part', 'bob', 'curly', 'ponytail', 'buzz', 'long_wave', 'bun', 'spiky'],
      top: ['robe', 'hoodie', 'jacket', 'tee', 'sweater', 'vest', 'dress_shirt', 'coat', 'moon_cloak', 'star_tunic'],
      bottom: ['jeans', 'skirt', 'shorts', 'slacks', 'cargo', 'leggings', 'wide_pants', 'robe_bottom'],
      shoes: ['sneakers', 'boots', 'flats', 'loafers', 'sandals', 'high_tops'],
      hat: ['witch_hat', 'none', 'beanie', 'cap', 'wide_hat', 'headband', 'beret', 'flower'],
      accessory: ['none', 'glasses', 'scarf', 'satchel', 'necklace', 'watch', 'backpack', 'moon_pin'],
    },
    robot: {
      chassis: ['round', 'boxy', 'tall', 'compact', 'retro'],
      headModule: ['visor', 'antenna', 'screen', 'dome', 'single_eye', 'twin_eye'],
      torsoTrim: ['stripe', 'panel', 'battery', 'vents', 'badge', 'core'],
      legTrim: ['boots', 'wheels', 'springs', 'treads', 'hover', 'feet'],
      face: ['neutral', 'happy', 'sleepy', 'focus', 'spark', 'blush'],
      accessory: ['none', 'toolpack', 'bowtie', 'scanner', 'tiny_cape', 'side_lamp'],
    },
    cat: {
      coat: ['tabby', 'tuxedo', 'calico', 'ginger', 'gray', 'cream'],
      ears: ['round', 'pointed', 'tufted', 'folded', 'tall'],
      face: ['neutral', 'happy', 'sleepy', 'curious', 'grumpy'],
      collar: ['none', 'red_bell', 'blue_tag', 'green_band', 'bow', 'stars'],
      hat: ['none', 'tiny_cap', 'flower', 'wizard', 'sunhat', 'ribbon'],
      accessory: ['none', 'backpack', 'fish_charm', 'cape', 'glasses', 'scarf'],
    },
    banana: {
      peel: ['classic', 'ripe_spots', 'green_tip', 'golden', 'sunset'],
      face: ['smile', 'cool', 'sleepy', 'surprised', 'focus', 'wink'],
      hat: ['none', 'cap', 'beanie', 'sunhat', 'crown', 'flower', 'wizard', 'bandana'],
      accessory: ['none', 'sticker', 'sunglasses', 'scarf', 'satchel', 'tiny_cape', 'bowtie', 'badge'],
    },
  };

  function textureFor(form, slot, value, direction) {
    return `avatar_${form}_${slot}_${value}_${direction}`;
  }

  function makeItem(form, slot, value) {
    const textures = {};
    for (const dir of DIRECTIONS) textures[dir] = textureFor(form, slot, value, dir);
    return {
      id: `${form}_${slot}_${value}`,
      label: value.split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' '),
      form,
      slot,
      value,
      order: SLOT_ORDER[slot] || 50,
      textures,
      colorChannels: colorChannelsFor(form, slot),
    };
  }

  function colorChannelsFor(form, slot) {
    if (slot === 'body') return ['skin'];
    if (slot === 'hair') return ['hair'];
    if (slot === 'top' || slot === 'bottom' || slot === 'shoes' || slot === 'hat' || slot === 'accessory') return ['primary', 'secondary', 'accent'];
    if (form === 'robot') return ['metal', 'primary', 'accent'];
    if (form === 'cat') return ['fur', 'secondary', 'accent'];
    if (form === 'banana') return ['peel', 'secondary', 'accent'];
    return ['primary'];
  }

  const ITEMS = {};
  for (const [form, slots] of Object.entries(ITEM_GROUPS)) {
    for (const [slot, values] of Object.entries(slots)) {
      for (const value of values) {
        const item = makeItem(form, slot, value);
        ITEMS[item.id] = item;
      }
    }
  }

  const DEFAULTS = {
    human: {
      slots: { body: 'human_body_average', hair: 'human_hair_short_side_part', top: 'human_top_hoodie', bottom: 'human_bottom_jeans', shoes: 'human_shoes_sneakers', hat: 'human_hat_none', accessory: 'human_accessory_none' },
      colors: { skin: 'warm_medium', hair: 'dark_brown', primary: '#3f7fb8', secondary: '#202935', accent: '#f3c24f' },
    },
    witch: {
      slots: { body: 'witch_body_classic', hair: 'witch_hair_long_wave', top: 'witch_top_robe', bottom: 'witch_bottom_robe_bottom', shoes: 'witch_shoes_boots', hat: 'witch_hat_witch_hat', accessory: 'witch_accessory_none' },
      colors: { skin: 'warm_medium', hair: 'dark_brown', primary: '#6c4a8d', secondary: '#202935', accent: '#f3c24f' },
    },
    robot: {
      slots: { chassis: 'robot_chassis_round', headModule: 'robot_headModule_visor', torsoTrim: 'robot_torsoTrim_stripe', legTrim: 'robot_legTrim_boots', face: 'robot_face_neutral', accessory: 'robot_accessory_none' },
      colors: { metal: '#9aa7b0', primary: '#3f7fb8', secondary: '#202935', accent: '#f3c24f' },
    },
    cat: {
      slots: { coat: 'cat_coat_tabby', ears: 'cat_ears_pointed', face: 'cat_face_neutral', collar: 'cat_collar_red_bell', hat: 'cat_hat_none', accessory: 'cat_accessory_none' },
      colors: { fur: '#b57942', primary: '#d64a4a', secondary: '#ffffff', accent: '#f3c24f' },
    },
    banana: {
      slots: { peel: 'banana_peel_classic', face: 'banana_face_smile', hat: 'banana_hat_none', accessory: 'banana_accessory_none' },
      colors: { peel: '#f0cf4f', primary: '#f0cf4f', secondary: '#6b8f3a', accent: '#2b1f12' },
    },
  };

  return { DIRECTIONS, FORMS, FORM_SLOTS, SLOT_ORDER, PALETTES, COLOR_VALUES, ITEM_GROUPS, ITEMS, DEFAULTS };
})();
