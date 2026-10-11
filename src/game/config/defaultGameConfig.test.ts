import { expect, it } from 'vitest';
import { cloneConfig, validateConfig } from './defaultGameConfig';

it('clones curve control points and never changes the input while validating them', () => {
  const source = cloneConfig();
  const clone = cloneConfig(source);
  clone.damagePopup.velocityCurve.control1.x = 0.9;
  expect(source.damagePopup.velocityCurve.control1.x).not.toBe(0.9);

  source.damagePopup.velocityCurve.control2.x = 9;
  const validated = validateConfig(source);
  expect(validated.damagePopup.velocityCurve.control2.x).toBe(1);
  expect(source.damagePopup.velocityCurve.control2.x).toBe(9);
});
