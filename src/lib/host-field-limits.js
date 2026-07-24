export const MAX_HOST_NAME_LENGTH = 80;
export const MAX_HOSTNAME_LENGTH = 253;
export const MAX_HOST_USER_LENGTH = 128;
export const MAX_HOST_GROUP_LENGTH = 64;
export const MAX_IDENTITY_FILE_LENGTH = 4096;

export function isTooLong(value, maxLength) {
  return typeof value === 'string' && value.length > maxLength;
}
