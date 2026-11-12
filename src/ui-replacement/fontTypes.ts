export interface ConsoleFontSnapshot {
  skin: number[] | null;
  stored: number[] | null;
  preview: number[] | null;
}
export const fontLayerId = 'map-font';
export const isFontTarget = (id: string) => ['gold-quantity', 'lumber-quantity', 'human-healthbar-fill', 'human-manabar-fill'].includes(id);
export const defaultConsoleFont = 'Microsoft YaHei, sans-serif';
