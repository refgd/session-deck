export function setupImportResult(data = {}) {
  const imported = Number(data.imported) || 0;
  if (imported > 0) {
    return {
      nextStep: 2,
      toastType: 'success',
      message: `Imported ${imported} hosts from SSH config`,
    };
  }
  return {
    nextStep: null,
    toastType: 'info',
    message: 'No hosts found in SSH config. Add hosts manually.',
  };
}

export function setupErrorMessage(prefix, error) {
  return `${prefix}: ${error?.message || 'Unknown error'}`;
}
