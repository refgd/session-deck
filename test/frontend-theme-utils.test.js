import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accentVariables,
  applyAccentVariables,
  isValidHexColor,
  lightenHex,
} from '../frontend/src/lib/theme-utils.js';

test('isValidHexColor accepts only six-digit hex colors', () => {
  assert.equal(isValidHexColor('#F97316'), true);
  assert.equal(isValidHexColor('#f97316'), true);
  assert.equal(isValidHexColor('F97316'), false);
  assert.equal(isValidHexColor('#fff'), false);
  assert.equal(isValidHexColor('#zzzzzz'), false);
  assert.equal(isValidHexColor(null), false);
});

test('lightenHex brightens and clamps each channel', () => {
  assert.equal(lightenHex('#000000', 25), '#191919');
  assert.equal(lightenHex('#f8f0fe', 25), '#ffffff');
  assert.equal(lightenHex('bad', 25), null);
});

test('accentVariables derives all theme CSS variables', () => {
  assert.deepEqual(accentVariables('#010203'), {
    '--accent': '#010203',
    '--accent-hover': '#1a1b1c',
    '--accent-bg': 'rgba(1,2,3,0.08)',
    '--accent-bg-med': 'rgba(1,2,3,0.1)',
    '--accent-bg-strong': 'rgba(1,2,3,0.15)',
    '--accent-border': 'rgba(1,2,3,0.2)',
    '--accent-border-strong': 'rgba(1,2,3,0.3)',
  });
  assert.equal(accentVariables('#123'), null);
});

test('applyAccentVariables writes variables to an element style', () => {
  const written = {};
  const element = {
    style: {
      setProperty(name, value) {
        written[name] = value;
      },
    },
  };

  assert.equal(applyAccentVariables(element, '#010203'), true);
  assert.equal(written['--accent'], '#010203');
  assert.equal(written['--accent-border-strong'], 'rgba(1,2,3,0.3)');
  assert.equal(applyAccentVariables(element, 'bad'), false);
  assert.equal(applyAccentVariables(null, '#010203'), false);
});
