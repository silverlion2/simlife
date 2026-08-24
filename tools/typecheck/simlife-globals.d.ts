declare var Game: any;
declare var Phaser: any;
declare var EasyStar: any;
declare var rexstatemanagerplugin: any;
declare var RexPlugins: any;

interface Window {
  Game: any;
  SIM_ASSETS: Record<string, string>;
  SIM_AVATAR_ASSETS: Record<string, string>;
  SIM_PRELOADED_IMAGES: Record<string, HTMLImageElement>;
  SIM_PRELOADED_AVATAR_IMAGES: Record<string, HTMLImageElement>;
  Phaser: any;
  webkitAudioContext?: typeof AudioContext;
}
