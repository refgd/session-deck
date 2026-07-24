export async function loadCurrentUser({ fetchRef = fetch } = {}) {
  try {
    const response = await fetchRef('/auth/me');
    if (!response?.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
