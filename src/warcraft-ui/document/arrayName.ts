export const defaultArrayName = 'ui';
const reserved = new Set(['and', 'array', 'boolean', 'call', 'code', 'constant', 'debug', 'else', 'elseif',
  'endfunction', 'endglobals', 'endif', 'endloop', 'exitwhen', 'extends', 'false', 'function', 'globals',
  'handle', 'if', 'integer', 'local', 'loop', 'native', 'not', 'nothing', 'null', 'or', 'real', 'return',
  'returns', 'set', 'string', 'takes', 'then', 'true', 'type']);

export function validateArrayName(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,98}$/.test(value) || reserved.has(value.toLowerCase())) {
    throw new Error('数组名须以英文字母开头，仅含字母、数字、下划线，最多 99 字符，且不能是 JASS 关键字。');
  }
  if (value.startsWith('udg_')) throw new Error('填写触发编辑器中的变量名，无需 udg_ 前缀。');
  return value;
}
