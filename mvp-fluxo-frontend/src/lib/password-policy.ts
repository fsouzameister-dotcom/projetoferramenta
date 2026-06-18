export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_POLICY_MESSAGE =
  "A senha deve ter no mínimo 8 caracteres, incluindo letras, um maiúsculo, um número e um caractere especial.";

const HAS_LETTER = /[A-Za-z]/;
const HAS_UPPERCASE = /[A-Z]/;
const HAS_DIGIT = /\d/;
const HAS_SPECIAL = /[^A-Za-z0-9]/;

export function getPasswordPolicyError(password: string): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return PASSWORD_POLICY_MESSAGE;
  }
  if (!HAS_LETTER.test(password)) {
    return PASSWORD_POLICY_MESSAGE;
  }
  if (!HAS_UPPERCASE.test(password)) {
    return PASSWORD_POLICY_MESSAGE;
  }
  if (!HAS_DIGIT.test(password)) {
    return PASSWORD_POLICY_MESSAGE;
  }
  if (!HAS_SPECIAL.test(password)) {
    return PASSWORD_POLICY_MESSAGE;
  }
  return null;
}

export function isPasswordValid(password: string): boolean {
  return getPasswordPolicyError(password) === null;
}
