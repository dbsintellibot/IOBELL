import { AlertTriangle, ExternalLink, X } from 'lucide-react'

interface AudioCompressionModalProps {
  isOpen: boolean
  onClose: () => void
  fileSizeKb: number
}

export function AudioCompressionModal({ isOpen, onClose, fileSizeKb }: AudioCompressionModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-xl border border-amber-500/30 bg-background p-6 shadow-2xl space-y-6">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/50 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">File Size Exceeds 70 KB</h3>
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 dir-rtl font-sans">
                فائل سائز کی حد 70KB سے زیادہ ہے
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Notice Info */}
        <div className="rounded-lg bg-amber-500/10 p-3.5 text-sm text-amber-700 dark:text-amber-300 space-y-1">
          <p className="font-medium">
            Your file is <strong className="underline">{fileSizeKb.toFixed(1)} KB</strong>. Maximum allowed size for bell MP3 files is <strong>70 KB</strong>.
          </p>
          <p className="dir-rtl text-xs leading-relaxed">
            آپ کی فائل کا سائز <strong>{fileSizeKb.toFixed(1)} KB</strong> ہے۔ آلہ پر آف لائن مطابقت پذیری کے لیے فائل <strong>70 KB</strong> سے کم ہونی چاہیے۔
          </p>
        </div>

        {/* English Instructions */}
        <div className="space-y-2 text-sm text-foreground">
          <h4 className="font-semibold text-primary flex items-center gap-2">
            <span>🇬🇧 How to Compress MP3 (Under 70 KB)</span>
          </h4>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs leading-relaxed pl-1">
            <li>Open <a href="https://www.mp3smaller.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5">MP3Smaller.com <ExternalLink className="h-3 w-3" /></a> or <a href="https://online-audio-converter.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5">Online-Audio-Converter.com <ExternalLink className="h-3 w-3" /></a></li>
            <li>Select and upload your MP3 file.</li>
            <li>Set audio bitrate to <strong>32 kbps</strong> or <strong>48 kbps Mono</strong>.</li>
            <li>Download the compressed file (under 70 KB) and upload it here.</li>
          </ol>
        </div>

        {/* Urdu Instructions */}
        <div className="space-y-2 text-sm text-foreground border-t border-border/50 pt-4 dir-rtl text-right">
          <h4 className="font-semibold text-primary flex items-center justify-end gap-2">
            <span>فائل کو کمپریس کرنے کا طریقہ 🇵🇰</span>
          </h4>
          <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground text-xs leading-relaxed pr-1 font-sans">
            <li>ویب سائٹ <a href="https://www.mp3smaller.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5 dir-ltr">MP3Smaller.com <ExternalLink className="h-3 w-3" /></a> یا <a href="https://online-audio-converter.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5 dir-ltr">Online-Audio-Converter.com <ExternalLink className="h-3 w-3" /></a> کھولیں۔</li>
            <li>اپنی MP3 فائل منتخب کر کے اپ لوڈ کریں۔</li>
            <li>آڈیو کی کوالٹی یا بٹ ریٹ کو <strong>32 kbps</strong> یا <strong>48 kbps Mono</strong> پر سیٹ کریں۔</li>
            <li>کمپریس شدہ فائل (70 KB سے کم) ڈاؤن لوڈ کریں اور یہاں اپ لوڈ کریں۔</li>
          </ol>
        </div>

        {/* Footer Button */}
        <div className="flex justify-end border-t border-border/50 pt-4">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
          >
            I Understand / میں سمجھ گیا
          </button>
        </div>

      </div>
    </div>
  )
}
