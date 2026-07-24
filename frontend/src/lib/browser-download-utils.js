export function triggerBrowserDownload(href, filename = '', { documentRef = document } = {}) {
  const link = documentRef.createElement('a');
  link.href = href;
  link.download = filename;
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
}

export function downloadJson(data, filename, { documentRef = document, urlRef = URL, blobRef = Blob } = {}) {
  const blob = new blobRef([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = urlRef.createObjectURL(blob);

  try {
    triggerBrowserDownload(url, filename, { documentRef });
  } finally {
    urlRef.revokeObjectURL(url);
  }
}
