declare module 'fast-formula-parser' {
  interface Reference { sheet?: string; row: number; col: number }
  interface Range { sheet?: string; from: Reference; to: Reference }
  export default class FormulaParser {
    constructor(config: { onCell: (ref: Reference) => unknown; onRange: (ref: Range) => unknown[][] });
    parse(formula: string, position: Reference): unknown;
  }
}
declare module 'excel-formula-tokenizer' {
  export interface Token { value: string; type: string; subtype: string }
  export function tokenize(formula: string): Token[];
}
