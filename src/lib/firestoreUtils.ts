/**
 * Utility functions for Firestore data operations.
 */

/**
 * Recursively cleans an object by removing any properties with value `undefined`.
 * Firestore throws a fatal error if any field is `undefined`:
 * "Function setDoc() called with invalid data. Unsupported field value: undefined"
 */
export function cleanForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => cleanForFirestore(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    // Preserve special Firestore objects (FieldValue like deleteField(), serverTimestamp(), Date, etc.)
    if (
      data instanceof Date ||
      (data as any)?._methodName ||
      (data as any)?.constructor?.name === 'FieldValue' ||
      (data as any)?._delegate
    ) {
      return data;
    }

    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(data as Record<string, any>)) {
      if (val !== undefined) {
        cleaned[key] = cleanForFirestore(val);
      }
    }
    return cleaned as T;
  }

  return data;
}
