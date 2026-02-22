export function checkAuthHeader(authHeader: string | null): boolean {
  const expected = process.env.INGEST_API_KEY;
  if (!expected) {
    return true;
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice('Bearer '.length);
  return token === expected;
}
