import { defaultUnits, type UnitSettings } from '../numbers/model';

export function fillUnitContext(units?: UnitSettings): { units: UnitSettings } {
  return { units: units ?? defaultUnits() };
}
