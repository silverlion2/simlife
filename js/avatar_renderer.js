// ============================================================
// SimLife - Layered Avatar Renderer
// ============================================================
window.Game = window.Game || {};

Game.AvatarRenderer = (function() {
  function create(scene) {
    return {
      scene,
      container: null,
      layerMap: new Map(),
      layers: [],
      lastSignature: '',
      layerCount: 0,
    };
  }

  function getSignature(layers, direction) {
    return JSON.stringify({
      direction,
      layers: layers.map(layer => ({
        id: layer.id,
        slot: layer.slot,
        order: layer.order,
        textureKey: layer.textureKey,
      })),
    });
  }

  function resolveColor(value) {
    if (!value || typeof value !== 'string') return null;
    const catalog = Game.AvatarCatalog || {};
    const resolved = (catalog.COLOR_VALUES && catalog.COLOR_VALUES[value]) || value;
    if (!/^#[0-9a-f]{6}$/i.test(resolved)) return null;
    return parseInt(resolved.slice(1), 16);
  }

  function getLayerTint(layer) {
    if (!layer || !layer.colors || !Array.isArray(layer.colorChannels)) return null;
    for (const channel of layer.colorChannels) {
      if (layer.colors[channel] === undefined) continue;
      const color = resolveColor(layer.colors[channel]);
      if (color !== null) return color;
    }
    return null;
  }

  function applyLayerColor(image, layer) {
    if (!image) return;
    const tint = getLayerTint(layer);
    if (tint === null) {
      if (image.clearTint) image.clearTint();
      image._avatarTint = null;
      return;
    }
    if (image.setTint) image.setTint(tint);
    image._avatarTint = tint;
  }

  function reset(instance) {
    if (!instance) return;
    if (instance.container) {
      instance.container.destroy();
      instance.container = null;
    }
    if (instance.layerMap) instance.layerMap.clear();
    instance.layers = [];
    instance.lastSignature = '';
    instance.layerCount = 0;
  }

  function sync(instance, character, x, y, direction) {
    if (!instance || !instance.scene || !character || !Game.Appearance) return null;

    const appearance = character.appearance || Game.Appearance.fromLegacy(character);
    const layers = Game.Appearance.getRenderLayers(appearance, direction)
      .slice()
      .sort((a, b) => a.order - b.order);
    const missingLayers = layers.filter(layer => !layer.textureKey || !instance.scene.textures.exists(layer.textureKey));
    if (!layers.length || missingLayers.length) {
      reset(instance);
      instance.missingTextureKeys = missingLayers.map(layer => layer.textureKey || layer.id || layer.slot);
      return null;
    }

    const signature = getSignature(layers, direction);

    if (!instance.container) {
      instance.container = instance.scene.add.container(x, y);
    } else {
      instance.container.setPosition(x, y);
    }

    if (signature !== instance.lastSignature) {
      instance.container.removeAll(true);
      instance.layerMap.clear();

      for (const layer of layers) {
        const image = instance.scene.add.image(0, 0, layer.textureKey);
        image.setOrigin(0.5, 0.9);
        image.setScale(1);
        applyLayerColor(image, layer);
        image._avatarOrder = layer.order;
        instance.container.add(image);
        instance.layerMap.set(layer.slot, image);
      }

      instance.container.sort('_avatarOrder');
      instance.lastSignature = signature;
    } else {
      for (const layer of layers) {
        applyLayerColor(instance.layerMap.get(layer.slot), layer);
      }
    }

    instance.layers = layers;
    instance.layerCount = instance.container.list.length;
    instance.missingTextureKeys = [];
    return instance.container;
  }

  function destroy(instance) {
    reset(instance);
  }

  return { create, sync, destroy };
})();
