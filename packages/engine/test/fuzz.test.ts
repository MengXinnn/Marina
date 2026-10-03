import { it } from 'vitest';
import { runPlayouts } from './playouts';

it('R1–R10 random legal games terminate, balance bank cash flows, and survive JSON/replay', () => {
  runPlayouts([2, 3, 5, 11, 23, 42, 99, 123, 2026, 4294967295]);
}, 30000);
