/**
 * Validates audio file size against a maximum KB limit (default 70 KB).
 * Returns size information for file size checks and bilingual warnings.
 */
export function validateAudioFileSize(file: File, maxKb: number = 70): { isOverLimit: boolean; sizeKb: number } {
  const sizeKb = file.size / 1024
  const isOverLimit = sizeKb > maxKb

  return {
    isOverLimit,
    sizeKb
  }
}
