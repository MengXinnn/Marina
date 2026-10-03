/// <reference types="vite/client" />
import { expect } from 'vitest';
import { replay } from '../src/index';
import type { Scenario } from '../src/index';

export const fixtures = Object.values(
  import.meta.glob<Scenario>('../fixtures/*.json', { eager: true, import: 'default' }),
);

export function assertFixtures(): void {
  expect(fixtures.length).toBeGreaterThanOrEqual(4);
  for (const fixture of fixtures) {
    const result = replay(fixture.config, fixture.actions);
    expect(result, fixture.name).toEqual(replay(fixture.config, fixture.actions));
    for (const [path, expected] of Object.entries(fixture.expect ?? {})) {
      const actual = path
        .split('.')
        .reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], result.state);
      if (expected !== null && typeof expected === 'object')
        expect(actual, `${fixture.name}: ${path}`).toMatchObject(expected);
      else expect(actual, `${fixture.name}: ${path}`).toEqual(expected);
    }
  }
}
