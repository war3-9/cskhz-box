import { hudTexts, nativeLayers } from './native';

// Source tile's inner frame is x=19..296, y=220..497 (lower UV starts at row 160).
export const minimap = { x: 22.8, y: 817.2, width: 333.6, height: 250.2, fill: '#806746' };
export const consoleGlow = '#59d9f5';
export const replacementHints: Record<string, string> = {
  minimap: '更换小地图贴图', console: '更换控制台贴图',
  'human-console-buttonstates2': '更换四个菜单按钮贴图',
  ResourceGold: '更换金币贴图', ResourceLumber: '更换木材贴图',
  'infocard-heroattributes-str': '更换力量贴图',
  'infocard-heroattributes-agi': '更换敏捷贴图',
  'infocard-heroattributes-int': '更换智力贴图',
  BTNMove: '更换移动贴图', BTNStop: '更换停止贴图',
  BTNHoldPosition: '更换保持位置贴图', BTNAttack: '更换攻击贴图',
  'gold-quantity': '更换地图全局字体', 'lumber-quantity': '更换地图全局字体',
  'human-healthbar-fill': '更换地图全局字体', 'human-manabar-fill': '更换地图全局字体',
};
const colors: Record<string, string> = {
  'human-console-buttonstates2': '#ff3636', ResourceGold: '#ffc42e', ResourceLumber: '#20c85a',
  'infocard-heroattributes-str': '#ff66ad', 'infocard-heroattributes-agi': '#b9f52c',
  'infocard-heroattributes-int': '#b57cff', 'human-healthbar-fill': '#35e6bd',
  'human-manabar-fill': '#4285ff',
  BTNMove: '#00b7ff', BTNStop: '#ffffff', BTNHoldPosition: '#b57a4b', BTNAttack: '#ff1b76',
};
export const hoverParts = [
  { id: 'minimap', ...minimap, color: '#ff942f' },
  ...nativeLayers.slice(5).map(layer => ({ id: layer.id, x: layer.x, y: layer.y,
    width: layer.width, height: layer.height, color: colors[layer.id] })),
  ...hudTexts.filter(item => item.id === 'gold' || item.id === 'lumber').map(item => ({
    id: `${item.id}-quantity`, x: item.x, y: item.y, width: item.width, height: item.height,
    color: item.id === 'gold' ? '#ffdc80' : '#80e4a8',
  })),
];
