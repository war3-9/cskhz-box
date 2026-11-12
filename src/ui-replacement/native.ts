import layout from './assets/layout.json';
import tile01 from './assets/HumanUITile01.png';
import tile02 from './assets/HumanUITile02.png';
import tile03 from './assets/HumanUITile03.png';
import tile04 from './assets/HumanUITile04.png';
import time from './assets/HumanUITile-TimeIndicatorFrame.png';
import cover from './assets/HumanUITile-InventoryCover.png';
import hudLayout from './assets/hud-layout.json';
import upperButtons from './assets/human-console-buttonstates2.png';
import gold from './assets/ResourceGold.png';
import lumber from './assets/ResourceLumber.png';
import strength from './assets/infocard-heroattributes-str.png';
import agility from './assets/infocard-heroattributes-agi.png';
import intelligence from './assets/infocard-heroattributes-int.png';
import health from './assets/human-healthbar-fill.png';
import mana from './assets/human-manabar-fill.png';
import move from './assets/BTNMove.png';
import stop from './assets/BTNStop.png';
import hold from './assets/BTNHoldPosition.png';
import attack from './assets/BTNAttack.png';

export const canvasSize = { width: layout.width, height: layout.height };
const images = [tile01, tile02, tile03, tile04, cover, time];
const names = ['主面板 01 · 小地图', '主面板 02 · 单位信息', '主面板 03 · 物品与命令',
  '主面板 04 · 右侧边框', '背包遮盖', '时间指示器边框'];
export const consoleTextures = layout.layers.map((layer, index) => ({
  ...layer, name: names[index], image: images[index], archivePath: `UI\\Console\\Human\\${layer.id}.blp`,
}));
const consoleLayers = consoleTextures.filter(layer => layer.id !== 'HumanUITile-InventoryCover');
const hudImages = [upperButtons, gold, lumber, strength, agility, intelligence, health, mana, move, stop, hold, attack];
export const nativeLayers = [...consoleLayers, ...hudLayout.layers.map((layer, index) => ({ ...layer, image: hudImages[index] }))];
export const allTextureLayers = [...nativeLayers, consoleTextures.find(layer => layer.id === 'HumanUITile-InventoryCover')!];
export const consoleReplacementTextures = [...consoleTextures, nativeLayers.find(layer => layer.id === 'human-console-buttonstates2')!];
export const hudTexts = hudLayout.texts;
export type NativeLayer = typeof nativeLayers[number];
