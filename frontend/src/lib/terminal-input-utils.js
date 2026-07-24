export function canSendTerminalInput({ readOnly = false, wsReady = false } = {}) {
  return !readOnly && !!wsReady;
}

export function terminalInputModeLabel(t, readOnly = false) {
  return readOnly ? t('readOnly') : t('inputEnabled');
}
