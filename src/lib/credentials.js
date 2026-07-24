export function validateNewCredentials(username, password, confirmPassword = password) {
  if (!username?.trim()) return 'Username is required';
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password !== confirmPassword) return 'Passwords do not match';
  return null;
}
