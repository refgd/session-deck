import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appSettingValidators,
  validateAccentColor,
  validateBooleanSetting,
  validateAppSetting,
} from '../src/lib/app-setting-validation.js';

test('validateAccentColor accepts only #RRGGBB colors', () => {
  assert.equal(validateAccentColor('#123abc'), '#123abc');
  assert.throws(
    () => validateAccentColor('red'),
    Object.assign(/accent_color must be a #RRGGBB color/, { statusCode: 400 })
  );
});

test('appSettingValidators exposes the supported app settings whitelist', () => {
  assert.deepEqual(Object.keys(appSettingValidators), ['accent_color', 'mobile_read_only_default']);
});

test('validateAppSetting returns stable errors for unknown or invalid settings', () => {
  assert.deepEqual(validateAppSetting('accent_color', '#abcdef'), { value: '#abcdef' });
  assert.deepEqual(validateAppSetting('mobile_read_only_default', true), { value: 'true' });
  assert.deepEqual(validateAppSetting('mobile_read_only_default', 'false'), { value: 'false' });
  assert.deepEqual(validateAppSetting('accent_color', 'blue'), {
    error: 'accent_color must be a #RRGGBB color',
    statusCode: 400,
  });
  assert.deepEqual(validateAppSetting('mobile_read_only_default', 'yes'), {
    error: 'mobile_read_only_default must be true or false',
    statusCode: 400,
  });
  assert.deepEqual(validateAppSetting('unsupported_secret', 'value'), {
    error: 'Unknown setting',
  });
});

test('validateBooleanSetting stores booleans as stable strings', () => {
  assert.equal(validateBooleanSetting('x', true), 'true');
  assert.equal(validateBooleanSetting('x', 'true'), 'true');
  assert.equal(validateBooleanSetting('x', false), 'false');
  assert.equal(validateBooleanSetting('x', 'false'), 'false');
  assert.throws(() => validateBooleanSetting('x', '1'), /x must be true or false/);
});
