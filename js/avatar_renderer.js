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

  function sync(instance, character, x, y, direction) {
    if (!instance || !instance.scene || !character || !Game.Appearance) return null;

    const appearance = character.appearance || Game.Appearance.fromLegacy(character);
    const layers = Game.Appearance.getRenderLayers(appearance, direction)
      .slice()
      .sort((a, b) => a.order - b.order);
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
        if (!layer.textureKey || !instance.scene.textures.exists(layer.textureKey)) continue;
        const image = instance.scene.add.image(0, 0, layer.textureKey);
        image.setOrigin(0.5, 0.9);
        image.setScale(1);
        image._avatarOrder = layer.order;
        instance.container.add(image);
        instance.layerMap.set(layer.slot, image);
      }

      instance.container.sort('_avatarOrder');
      instance.lastSignature = signature;
    }

    instance.layers = layers;
    instance.layerCount = instance.container.list.length;
    return instance.container;
  }

  function destroy(instance) {
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

  return { create, sync, destroy };
})();
