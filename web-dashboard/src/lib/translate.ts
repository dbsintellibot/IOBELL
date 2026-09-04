/**
 * Google Translate (free) helper for AutoBell TTS.
 * Uses the unofficial gtx endpoint – same one behind translate.google.com.
 */

const TRANSLATE_BASE = 'https://translate.googleapis.com/translate_a/single'

/**
 * Detects whether a string is predominantly Latin/English characters.
 * Returns true if >60% of alpha characters are Latin.
 */
export function isLikelyEnglish(text: string): boolean {
  const alphaChars = text.replace(/[^a-zA-Z\u0600-\u06FF\u0750-\u077F\u0980-\u09FF\u0A00-\u0A7F\u0600-\u06FF]/g, '')
  if (alphaChars.length === 0) return false
  const latinChars = alphaChars.replace(/[^a-zA-Z]/g, '')
  return latinChars.length / alphaChars.length > 0.6
}

/**
 * Translates text using Google Translate free API.
 * @param text - The source text to translate
 * @param targetLang - Target language code ('ur' for Urdu, 'ar' for Arabic)
 * @param sourceLang - Source language code (default: 'en')
 * @returns Translated text string
 */
export async function translateText(
  text: string,
  targetLang: string,
  sourceLang: string = 'en'
): Promise<string> {
  if (!text.trim()) return text
  if (targetLang === sourceLang || targetLang === 'en') return text

  const url = new URL(TRANSLATE_BASE)
  url.searchParams.set('client', 'gtx')
  url.searchParams.set('sl', sourceLang)
  url.searchParams.set('tl', targetLang)
  url.searchParams.set('dt', 't')
  url.searchParams.set('q', text)

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`Translation failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // Response format: [[["translated text","source text",null,null,confidence],...]]
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0]
      .filter((segment: any) => Array.isArray(segment) && segment[0])
      .map((segment: any) => segment[0])
      .join('')
  }

  throw new Error('Unexpected translation response format')
}
