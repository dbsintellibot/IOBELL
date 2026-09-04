import { useState, useRef, useEffect } from 'react'
import '@/lib/lame-polyfill'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { generateTTS, generateCambAITTS, generateElevenLabsTTS, generateGoogleFreeTTS } from '@/lib/tts'
import { translateText } from '@/lib/translate'
import { Mic, Square, Play, Send, Type, Radio, CloudSun, Newspaper, RefreshCw, Languages } from 'lucide-react'
import { DeviceSelector, type DeviceOption } from '@/components/DeviceSelector'
// @ts-expect-error mic-recorder-to-mp3 has no types
import MicRecorder from 'mic-recorder-to-mp3'

type Mp3Recorder = {
  start: () => Promise<void> | void
  stop: () => {
    getMp3: () => Promise<[unknown, Blob]>
  }
}

type TtsProvider = 'openai' | 'cambai' | 'elevenlabs' | 'google-free' | 'topmediai'
type GoogleFreeVoiceGender = 'female' | 'male'

const predefinedAnnouncements = [
  {
    id: "morning_assembly",
    titleEn: "Morning Assembly",
    titleUr: "صبح کی اسمبلی",
    titleAr: "الجمعية الصباحية",
    en: "Attention all students and teachers, the morning assembly is about to begin. Please proceed to the assembly ground immediately.",
    ur: "تمام طلبہ اور اساتذہ توجہ فرمائیں۔ صبح کی اسمبلی شروع ہونے والی ہے۔ براہ کرم فوراً اسمبلی گراؤنڈ میں تشریف لائیں۔",
    ar: "انتباه لجميع الطلاب والمعلمين، الجمعية الصباحية على وشك البدء. يرجى التوجه إلى ساحة الجمعية فوراً."
  },
  {
    id: "first_period",
    titleEn: "First Period Start",
    titleUr: "پہلے پیریڈ کا آغاز",
    titleAr: "بداية الحصة الأولى",
    en: "The first period is starting now. Teachers, please check attendance. Students, please open your books.",
    ur: "پہلا پیریڈ اب شروع ہو رہا ہے۔ اساتذہ براہ کرم حاضری چیک کریں۔ طلبہ اپنی کتابیں کھولیں۔",
    ar: "الحصة الأولى تبدأ الآن. المعلمون، يرجى التحقق من الحضور. الطلاب، يرجى فتح كتبكم."
  },
  {
    id: "recess_start",
    titleEn: "Recess Start",
    titleUr: "تفریح کا آغاز",
    titleAr: "بداية الاستراحة",
    en: "It is now recess time. Please leave the classrooms in an orderly fashion and enjoy your break.",
    ur: "اب تفریح کا وقت ہو گیا ہے۔ براہ کرم کلاس رومز سے ترتیب وار باہر نکلیں اور اپنے وقفے کا لطف اٹھائیں۔",
    ar: "حان وقت الاستراحة الآن. يرجى مغادرة الفصول الدراسية بطريقة منظمة والاستمتاع بالاستراحة."
  },
  {
    id: "recess_end",
    titleEn: "Recess End",
    titleUr: "تفریح کا اختتام",
    titleAr: "نهاية الاستراحة",
    en: "The recess period has ended. All students must return to their classrooms immediately. Silence in the corridors.",
    ur: "تفریح کا وقت ختم ہو گیا ہے۔ تمام طلبہ فوراً اپنے کلاس رومز میں واپس جائیں۔ راہداریوں میں خاموشی اختیار کریں۔",
    ar: "انتهت فترة الاستراحة. يجب على جميع الطلاب العودة إلى فصولهم الدراسية فوراً. الهدوء في الممرات."
  },
  {
    id: "lunch_break",
    titleEn: "Lunch Break",
    titleUr: "دوپہر کے کھانے کا وقفہ",
    titleAr: "استراحة الغداء",
    en: "It is lunch time. Please wash your hands before eating and maintain silence in the dining area.",
    ur: "یہ دوپہر کے کھانے کا وقت ہے۔ براہ کرم کھانے سے پہلے اپنے ہاتھ دھوئیں اور کھانے کے علاقے میں خاموشی برقرار رکھیں۔",
    ar: "حان وقت الغداء. يرجى غسل اليدين قبل تناول الطعام والحفاظ على الهدوء في منطقة تناول الطعام."
  },
  {
    id: "dispersal_end",
    titleEn: "Dispersal / End",
    titleUr: "چھٹی / اختتام",
    titleAr: "الانصراف / نهاية اليوم",
    en: "School is closed for the day. Please pack your bags and exit the building quietly. Have a safe journey home.",
    ur: "آج کے لیے اسکول ختم ہو چکا ہے۔ براہ کرم اپنے بستے تیار کریں اور خاموشی سے عمارت سے باہر نکلیں۔ گھر واپسی کا سفر محفوظ ہو۔",
    ar: "انتهى اليوم الدراسي. يرجى حزم حقائبكم ومغادرة المبنى بهدوء. نتمنى لكم رحلة آمنة إلى المنزل."
  },
  {
    id: "exam_start",
    titleEn: "Exam Start",
    titleUr: "امتحان کا آغاز",
    titleAr: "بداية الامتحان",
    en: "The examination is about to begin. No communication is allowed. Good luck to everyone.",
    ur: "امتحان شروع ہونے والا ہے۔ کسی قسم کی بات چیت کی اجازت نہیں ہے۔ سب کے لیے نیک خواہشات۔",
    ar: "الامتحان على وشك البدء. غير مسموح بالتواصل. بالتوفيق للجميع."
  },
  {
    id: "emergency_drill",
    titleEn: "Emergency Drill",
    titleUr: "ہنگامی مشق",
    titleAr: "تدريب طوارئ",
    en: "Attention! This is an emergency evacuation drill. Please walk to the nearest assembly point immediately.",
    ur: "توجہ فرمائیں! یہ ہنگامی انخلا کی مشق ہے۔ براہ کرم فوراً قریبی اسمبلی پوائنٹ کی طرف چلیں۔",
    ar: "انتباه! هذا تدريب على الإخلاء في حالات الطوارئ. يرجى المشي إلى أقرب نقطة تجمع فوراً."
  },
  {
    id: "classes_resume",
    titleEn: "Classes Resume",
    titleUr: "کلاسوں کا دوبارہ آغاز",
    titleAr: "استئناف الدروس",
    en: "Attention all students, classes are resuming now. Please head back to your respective classrooms immediately.",
    ur: "تمام طلبہ توجہ فرمائیں، کلاسیں اب دوبارہ شروع ہو رہی ہیں۔ براہ کرم فوراً اپنے متعلقہ کلاس رومز میں واپس جائیں۔",
    ar: "انتباه لجميع الطلاب، تستأنف الدروس الآن. يرجى العودة إلى فصولكم الدراسية فوراً."
  },
  {
    id: "silence_period",
    titleEn: "Silence Period",
    titleUr: "خاموشی کا وقت",
    titleAr: "فترة الهدوء",
    en: "Please maintain strict silence in the corridors and library. Study hours are currently in progress.",
    ur: "راہداریوں اور لائبریری میں مکمل خاموشی اختیار کریں۔ پڑھائی کے اوقات جاری ہیں۔",
    ar: "يرجى الحفاظ على الهدوء التام في الممرات والمكتبة. ساعات الدراسة جارية حالياً."
  },
  {
    id: "parent_teacher_meeting",
    titleEn: "Parent Teacher Meeting",
    titleUr: "پیرنٹ ٹیچر میٹنگ",
    titleAr: "اجتماع الآباء والمعلمين",
    en: "Dear parents and guardians, welcome. The parent teacher meeting has officially started. Please visit the classrooms.",
    ur: "محترم والدین اور سرپرست، خوش آمدید۔ پیرنٹ ٹیچر میٹنگ کا باقاعدہ آغاز ہو گیا ہے۔ براہ کرم کلاس رومز کا دورہ کریں۔",
    ar: "أولياء الأمور الكرام، مرحباً بكم. لقد بدأ اجتماع الآباء والمعلمين رسمياً. يرجى زيارة الفصول الدراسية."
  },
  {
    id: "sports_event",
    titleEn: "Sports Event",
    titleUr: "کھیلوں کی سرگرمی",
    titleAr: "الحدث الرياضي",
    en: "The sports activities are starting on the main field. All participating students should report to their coaches.",
    ur: "مین گراؤنڈ پر کھیلوں کی سرگرمیاں شروع ہو رہی ہیں۔ تمام حصہ لینے والے طلبہ اپنے کوچز کو رپورٹ کریں۔",
    ar: "بدأت الأنشطة الرياضية في الملعب الرئيسي. يجب على جميع الطلاب المشاركين إبلاغ مدربيهم."
  },
  {
    id: "library_hour",
    titleEn: "Library Hour",
    titleUr: "لائبریری کا گھنٹہ",
    titleAr: "ساعة المكتبة",
    en: "It is now library hour. Students who have library periods should proceed to the library and read quietly.",
    ur: "یہ اب لائبریری کا گھنٹہ ہے۔ جن طلبہ کا لائبریری پیریڈ ہے وہ لائبریری جائیں اور خاموشی سے مطالعہ کریں۔",
    ar: "حان وقت المكتبة الآن. يجب على الطلاب الذين لديهم حصة مكتبة التوجه إلى المكتبة والقراءة بهدوء."
  },
  {
    id: "cleanliness_reminder",
    titleEn: "Cleanliness Reminder",
    titleUr: "صفائی کی یاد دہانی",
    titleAr: "تذكير بالنظافة",
    en: "Keep your school clean. Please do not litter and throw all waste in the nearest dustbin.",
    ur: "اپنے اسکول کو صاف ستھرا رکھیں۔ براہ کرم کچرا مت پھیلائیں اور تمام فضلہ قریبی ڈسٹ بن میں ڈالیں۔",
    ar: "حافظ على نظافة مدرستك. يرجى عدم رمي النفايات وإلقاء جميع المخلفات في أقرب سلة مهملات."
  },
  {
    id: "bell_system_testing",
    titleEn: "Bell System Testing",
    titleUr: "گھنٹی کے نظام کی جانچ",
    titleAr: "اختبار نظام الجرس",
    en: "Attention, we are currently testing the automatic bell system. Please ignore any temporary bell rings or chimes.",
    ur: "توجہ فرمائیں، ہم اس وقت خودکار گھنٹی کے نظام کی جانچ کر رہے ہیں۔ براہ کرم کسی بھی عارضی گھنٹی کی آواز کو نظر انداز کریں۔",
    ar: "انتباه، نحن نقوم حالياً باختبار نظام الجرس التلقائي. يرجى تجاهل أي رنين مؤقت للجرس."
  }
];

export default function Broadcast() {
  const { schoolId, ttsEnabled, user } = useAuth()
  const [activeTab, setActiveTab] = useState<'text' | 'voice' | 'stream'>('text')
  
  // Selective Device Targeting State
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([])

  const { data: devices = [], isLoading: loadingDevices } = useQuery<DeviceOption[]>({
    queryKey: ['devices_broadcast', schoolId],
    queryFn: async () => {
      if (!schoolId) return []
      const { data, error } = await supabase
        .from('bell_devices')
        .select('id, name, mac_address, status, last_heartbeat, location_area, location_city, profile_id, bell_profiles(name)')
        .eq('school_id', schoolId)
        .order('name')

      if (error) throw error
      return (data || []).map((d: any) => ({
        id: d.id,
        name: d.name,
        mac_address: d.mac_address,
        status: d.status,
        last_heartbeat: d.last_heartbeat,
        location_area: d.location_area,
        location_city: d.location_city,
        profile_id: d.profile_id,
        profile_name: d.bell_profiles?.name || 'School Active Profile'
      }))
    },
    enabled: !!schoolId
  })

  // Select all devices by default when devices load initially
  useEffect(() => {
    if (devices.length > 0 && selectedDeviceIds.length === 0) {
      setSelectedDeviceIds(devices.map(d => d.id))
    }
  }, [devices])

  // TTS State
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>('google-free')
  const [text, setText] = useState('')
  const [ttsLanguage, setTtsLanguage] = useState('en')
  const [isTranslating, setIsTranslating] = useState(false)

  // Selected Predefined Announcement State
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(null)
  const [selectedAnnouncementLang, setSelectedAnnouncementLang] = useState<'en' | 'ur' | 'ar' | null>(null)

  const handleSelectAnnouncement = (id: string, lang: 'en' | 'ur' | 'ar') => {
    if (!id) {
      setSelectedAnnouncementId(null)
      setSelectedAnnouncementLang(null)
      return
    }
    const found = predefinedAnnouncements.find(a => a.id === id)
    if (found) {
      setText(found[lang])
      setTtsLanguage(lang)
      setSelectedAnnouncementId(id)
      setSelectedAnnouncementLang(lang)
    }
  }

  // Weather & News Add-ons state
  const [includeWeather, setIncludeWeather] = useState(false)
  const [weatherCity, setWeatherCity] = useState('')
  const [fetchedWeather, setFetchedWeather] = useState<string | null>(null)
  const [isFetchingWeather, setIsFetchingWeather] = useState(false)
  const [weatherError, setWeatherError] = useState<string | null>(null)

  const [selectedNewsCategory, setSelectedNewsCategory] = useState<'none' | 'business' | 'education' | 'tech'>('none')
  const [newsArticles, setNewsArticles] = useState<Array<{ title: string, source: string, link: string }>>([])
  const [selectedNewsHeadline, setSelectedNewsHeadline] = useState<string | null>(null)
  const [isFetchingNews, setIsFetchingNews] = useState(false)
  const [newsError, setNewsError] = useState<string | null>(null)

  // Auto-populate weatherCity based on target devices
  useEffect(() => {
    if (devices.length > 0 && !weatherCity) {
      const devWithCity = devices.find(d => d.location_city);
      if (devWithCity && devWithCity.location_city) {
        setWeatherCity(devWithCity.location_city);
      } else {
        setWeatherCity('Islamabad'); // default fallback
      }
    }
  }, [devices, weatherCity])

  const handleFetchWeather = async (cityToFetch: string) => {
    const loc = cityToFetch.trim();
    if (!loc) return;
    setIsFetchingWeather(true);
    setWeatherError(null);
    try {
      const url = `https://wttr.in/${encodeURIComponent(loc)}?format=j1`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      const current = data?.current_condition?.[0];
      if (!current) throw new Error('No current weather condition data found');
      const tempC = current.temp_C || '--';
      const desc = current.weatherDesc?.[0]?.value || 'Unknown';
      const humidity = current.humidity || '--';
      const feelsLikeC = current.FeelsLikeC || tempC;
      const weatherString = `Today's weather in ${loc}: ${tempC} degrees Celsius, ${desc}, Humidity ${humidity} percent, Feels like ${feelsLikeC} degrees.`;
      setFetchedWeather(weatherString);
    } catch (err: any) {
      console.error('Weather fetch failed:', err);
      setWeatherError(err.message || 'Failed to fetch weather');
      setFetchedWeather(null);
    } finally {
      setIsFetchingWeather(false);
    }
  };

  const handleFetchNews = async (category: 'business' | 'education' | 'tech') => {
    setIsFetchingNews(true);
    setNewsError(null);
    setNewsArticles([]);
    setSelectedNewsHeadline(null);
    try {
      if (category === 'business' || category === 'tech') {
        const res = await fetch('https://ok.surf/api/v1/cors/news-feed');
        if (!res.ok) throw new Error(`Failed to fetch news feed (status ${res.status})`);
        const data = await res.json();
        const key = category === 'business' ? 'Business' : 'Technology';
        const articles = data[key] || [];
        const mapped = articles.slice(0, 5).map((a: any) => ({
          title: a.title,
          source: a.source || 'Google News',
          link: a.link
        }));
        setNewsArticles(mapped);
      } else {
        // Education news via NYT
        const res = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://rss.nytimes.com/services/xml/rss/nyt/Education.xml');
        if (!res.ok) throw new Error(`Failed to fetch education news (status ${res.status})`);
        const data = await res.json();
        const items = data.items || [];
        const mapped = items.slice(0, 5).map((item: any) => ({
          title: item.title,
          source: 'New York Times',
          link: item.link
        }));
        setNewsArticles(mapped);
      }
    } catch (err: any) {
      console.error('News fetch failed:', err);
      setNewsError(err.message || 'Failed to fetch news updates');
    } finally {
      setIsFetchingNews(false);
    }
  };

  // Fetch when includeWeather is toggled
  useEffect(() => {
    if (includeWeather && weatherCity && !fetchedWeather) {
      handleFetchWeather(weatherCity);
    }
  }, [includeWeather]);

  // Fetch news when category changes
  useEffect(() => {
    if (selectedNewsCategory !== 'none') {
      handleFetchNews(selectedNewsCategory);
    } else {
      setNewsArticles([]);
      setSelectedNewsHeadline(null);
    }
  }, [selectedNewsCategory]);

  const getSpokenTextPreview = () => {
    const parts = [];
    if (includeWeather && fetchedWeather) {
      parts.push(`Good morning. Here is today's weather update. ${fetchedWeather}`);
    }
    if (selectedNewsCategory !== 'none' && selectedNewsHeadline) {
      const categoryName = selectedNewsCategory === 'tech' ? 'technology' : selectedNewsCategory;
      parts.push(`Here is a news update. In ${categoryName} news: ${selectedNewsHeadline}`);
    }
    if (text.trim()) {
      parts.push(text.trim());
    }
    return parts.join(' ');
  };

  const [googleFreeVoiceGender, setGoogleFreeVoiceGender] = useState<GoogleFreeVoiceGender>(() => {
    const saved = localStorage.getItem('google_free_voice_gender')
    return saved === 'male' || saved === 'female' ? saved : 'female'
  })
  const [streamUrl, setStreamUrl] = useState(() => localStorage.getItem('broadcast_stream_url') || '')
  const [streamBypassOtherAudio, setStreamBypassOtherAudio] = useState(() => localStorage.getItem('broadcast_stream_bypass_other_audio') === 'true')
  const [streamIsActive, setStreamIsActive] = useState(false)
  
  // TopMediai State
  const [topMediaiKey, setTopMediaiKey] = useState('')
  const [topMediaiSpeaker, setTopMediaiSpeaker] = useState(localStorage.getItem('topmediai_speaker') || '00151554-3826-11ee-a861-00163e2ac61b')
  const [topMediaiEmotion, setTopMediaiEmotion] = useState(localStorage.getItem('topmediai_emotion') || 'Neutral')

  // OpenAI State
  const [apiKey, setApiKey] = useState('')
  
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem('openai_base_url') || 'https://api.openai.com/v1')
  const [model, setModel] = useState(localStorage.getItem('openai_model') || 'tts-1')
  const [voice, setVoice] = useState(localStorage.getItem('openai_voice') || 'alloy')

  // ElevenLabs State
  const [elevenLabsKey, setElevenLabsKey] = useState('')
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState(localStorage.getItem('elevenlabs_voice_id') || '21m00Tcm4TlvDq8ikWAM')

  // Camb.ai State
  const [cambAiKey, setCambAiKey] = useState('')
  const [cambAiVoiceId, setCambAiVoiceId] = useState(Number(localStorage.getItem('cambai_voice_id')) || 147320)
  const [cambAiLanguage, setCambAiLanguage] = useState(Number(localStorage.getItem('cambai_language')) || 1)
  const [cambAiGender, setCambAiGender] = useState(Number(localStorage.getItem('cambai_gender')) || 1)
  const [cambAiAge, setCambAiAge] = useState(Number(localStorage.getItem('cambai_age')) || 30)
  
  // Load API keys securely from Supabase
  useEffect(() => {
    const loadSecureKeys = async () => {
      const { data, error } = await supabase.from('user_api_keys').select('provider');
      if (error) {
        console.error('Failed to load secure keys', error);
        return;
      }
      data?.forEach((row: any) => {
        if (row.provider === 'openai') setApiKey('********-hidden-********');
        if (row.provider === 'elevenlabs') setElevenLabsKey('********-hidden-********');
        if (row.provider === 'cambai') setCambAiKey('********-hidden-********');
        if (row.provider === 'topmediai') setTopMediaiKey('********-hidden-********');
      });
    };
    loadSecureKeys();
  }, []);

  const saveSecureKey = async (provider: string, secret: string) => {
    if (secret === '********-hidden-********') return;
    if (!secret) return;
    try {
      const { error } = await supabase.rpc('set_user_api_key', { p_provider: provider, p_secret: secret });
      if (error) throw error;
      console.log(`${provider} API Key saved securely.`);
    } catch (e: any) {
      console.error(`Failed to save ${provider} key: ${e.message}`);
    }
  };

  // Pre-Announcement State
  const [schoolPreAnnouncementUrl, setSchoolPreAnnouncementUrl] = useState<string | null>(null)
  const [schoolPreAnnouncementDelay, setSchoolPreAnnouncementDelay] = useState<number>(3)
  const [playPreAnnouncementTTS, setPlayPreAnnouncementTTS] = useState<boolean>(true)
  const [playPreAnnouncementVoice, setPlayPreAnnouncementVoice] = useState<boolean>(true)
  const [playPreAnnouncementStream, setPlayPreAnnouncementStream] = useState<boolean>(true)

  // Voice Note State
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const recorderRef = useRef<Mp3Recorder | null>(null)
  
  // General State
  const [isSending, setIsSending] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  useEffect(() => {
    const fetchSchoolPreAnnouncementConfig = async () => {
      if (!schoolId) return
      const { data: school, error } = await supabase
        .from('schools')
        .select('pre_announcement_enabled, default_pre_announcement_id, pre_announcement_delay_seconds')
        .eq('id', schoolId)
        .single()

      if (!error && school) {
        setSchoolPreAnnouncementDelay(school.pre_announcement_delay_seconds || 3)
        let foundUrl: string | null = null

        if (school.default_pre_announcement_id) {
          const { data: sound } = await supabase
            .from('pre_announcement_sounds')
            .select('file_url')
            .eq('id', school.default_pre_announcement_id)
            .single()

          if (sound?.file_url) {
            foundUrl = sound.file_url
          }
        }

        // Fallback 1: Sound #10
        if (!foundUrl) {
          const { data: sound10 } = await supabase
            .from('pre_announcement_sounds')
            .select('file_url')
            .eq('is_active', true)
            .order('created_at', { ascending: true })
            .range(9, 9)
          if (sound10 && sound10.length > 0 && sound10[0].file_url) {
            foundUrl = sound10[0].file_url
          }
        }

        // Fallback 2: Sound #1
        if (!foundUrl) {
          const { data: sound1 } = await supabase
            .from('pre_announcement_sounds')
            .select('file_url')
            .eq('is_active', true)
            .order('created_at', { ascending: true })
            .limit(1)
          if (sound1 && sound1.length > 0 && sound1[0].file_url) {
            foundUrl = sound1[0].file_url
          }
        }

        if (foundUrl) {
          setSchoolPreAnnouncementUrl(foundUrl)
        }
      }
    }

    fetchSchoolPreAnnouncementConfig()
  }, [schoolId])

  useEffect(() => {
    const loadTtsProviderPreference = async () => {
      if (!user) return

      try {
        const { data, error } = await supabase
          .from('users')
          .select('tts_provider')
          .eq('id', user.id)
          .single()

        if (error) {
          console.error('Error loading TTS provider preference:', error)
          return
        }

        const provider = data?.tts_provider as TtsProvider | null
        if (
          provider === 'openai' ||
          provider === 'cambai' ||
          provider === 'elevenlabs' ||
          provider === 'google-free' ||
          provider === 'topmediai'
        ) {
          setTtsProvider(provider)
        } else {
          setTtsProvider('google-free')
        }
      } catch (error) {
        console.error('Unexpected error loading TTS provider preference:', error)
      }
    }

    loadTtsProviderPreference()
  }, [user])

  const startRecording = async () => {
    try {
      if (!recorderRef.current) {
        recorderRef.current = new MicRecorder({ bitRate: 128 }) as Mp3Recorder
      }

      await recorderRef.current.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Error accessing microphone:', err)
      setStatus({ type: 'error', message: 'Could not access microphone' })
    }
  }

  const stopRecording = () => {
    if (recorderRef.current && isRecording) {
      recorderRef.current
        .stop()
        .getMp3()
        .then(([, blob]: [unknown, Blob]) => {
          setAudioBlob(blob)
          setAudioUrl(URL.createObjectURL(blob))
          setIsRecording(false)
        })
        .catch((error: unknown) => {
          console.error('Error stopping recording:', error)
          setIsRecording(false)
        })
    }
  }

  const playPreview = () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl)
      audio.play()
    }
  }

  const broadcastVoice = async () => {
    if (!audioBlob || !schoolId) return

    setIsSending(true)
    setStatus(null)

    try {
      // 1. Upload to Supabase
      const fileName = `${schoolId}/${Date.now()}_voice_note.mp3`
      const { error: uploadError } = await supabase.storage
        .from('voice-notes')
        .upload(fileName, audioBlob, {
          contentType: 'audio/mpeg'
        })

      if (uploadError) throw uploadError

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('voice-notes')
        .getPublicUrl(fileName)

      if (selectedDeviceIds.length === 0) {
        throw new Error('Please select at least one target bell device.')
      }

      const targetDevices = devices.filter(d => selectedDeviceIds.includes(d.id))
      if (targetDevices.length === 0) {
        throw new Error('No selected target devices found for broadcast.')
      }

      const commands = targetDevices.map(d => ({
        device_id: d.id,
        command: 'VOICE_NOTE',
        payload: {
          url: publicUrl,
          play_pre_announcement: playPreAnnouncementVoice,
          pre_announcement_url: schoolPreAnnouncementUrl || '',
          pre_announcement_delay_seconds: schoolPreAnnouncementDelay || 3
        },
        status: 'pending'
      }))

      const { error: cmdError } = await supabase
        .from('command_queue')
        .insert(commands)

      if (cmdError) throw cmdError

      setStatus({ type: 'success', message: 'Voice note queued successfully! (In Queue - check notification bar when device executes it)' })
      setAudioBlob(null)
      setAudioUrl(null)
    } catch (error) {
      console.error('Broadcast failed:', error)
      if (error instanceof Error) {
        setStatus({ type: 'error', message: error.message })
      } else {
        setStatus({ type: 'error', message: 'Failed to broadcast' })
      }
    } finally {
      setIsSending(false)
    }
  }

  const broadcastText = async () => {
    const finalSpokenText = getSpokenTextPreview()
    if (!finalSpokenText.trim() || !schoolId) return

    if (ttsProvider === 'openai' && !apiKey) {
      setStatus({ type: 'error', message: 'OpenAI API Key required.' })
      return
    }

    if (ttsProvider === 'cambai' && !cambAiKey) {
      setStatus({ type: 'error', message: 'Camb.ai API Key required.' })
      return
    }

    if (ttsProvider === 'elevenlabs' && !elevenLabsKey) {
      setStatus({ type: 'error', message: 'ElevenLabs API Key required.' })
      return
    }

    if (ttsProvider === 'topmediai' && !topMediaiKey) {
      setStatus({ type: 'error', message: 'TopMediai API Key required.' })
      return
    }

    setIsSending(true)
    setStatus(null)

    try {
      const commandType = 'PLAY_URL';
      let audioBlob: Blob;
      
      if (ttsProvider === 'google-free') {
        audioBlob = await generateGoogleFreeTTS(finalSpokenText, ttsLanguage, googleFreeVoiceGender)
      } else if (ttsProvider === 'cambai') {
        audioBlob = await generateCambAITTS(finalSpokenText, cambAiKey, cambAiVoiceId, cambAiLanguage, cambAiGender, cambAiAge)
      } else if (ttsProvider === 'elevenlabs') {
        audioBlob = await generateElevenLabsTTS(finalSpokenText, elevenLabsKey, elevenLabsVoiceId)
      } else {
        audioBlob = await generateTTS(finalSpokenText, apiKey, baseUrl, model, voice)
      }
      
      // Upload to Supabase storage
      const fileName = `${schoolId}/${Date.now()}_tts.mp3`
      const { error: uploadError } = await supabase.storage
        .from('voice-notes')
        .upload(fileName, audioBlob, {
          contentType: 'audio/mpeg'
        })

      if (uploadError) throw uploadError

      // Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('voice-notes')
        .getPublicUrl(fileName)
        
      const commandPayload = {
        url: publicUrl,
        play_pre_announcement: playPreAnnouncementTTS,
        pre_announcement_url: schoolPreAnnouncementUrl || '',
        pre_announcement_delay_seconds: schoolPreAnnouncementDelay || 3
      };

      if (selectedDeviceIds.length === 0) {
        throw new Error('Please select at least one target bell device.')
      }

      const targetDevices = devices.filter(d => selectedDeviceIds.includes(d.id))
      if (targetDevices.length === 0) {
        throw new Error('No selected target devices found for broadcast.')
      }

      const commands = targetDevices.map(d => ({
        device_id: d.id,
        command: commandType,
        payload: commandPayload,
        status: 'pending'
      }))

      const { error: cmdError } = await supabase
        .from('command_queue')
        .insert(commands)

      if (cmdError) throw cmdError

      setStatus({ type: 'success', message: 'Announcement queued successfully! (In Queue - check notification bar when device executes it)' })
      setText('')
      setIncludeWeather(false)
      setSelectedNewsCategory('none')
      setSelectedNewsHeadline(null)
    } catch (error) {
      console.error('Broadcast failed:', error)
      if (error instanceof Error) {
        setStatus({ type: 'error', message: error.message })
      } else {
        setStatus({ type: 'error', message: 'Failed to broadcast' })
      }
    } finally {
      setIsSending(false)
    }
  }

  const normalizeStreamUrl = (rawUrl: string) => {
    const trimmed = rawUrl.trim()
    if (!trimmed) return ''

    const candidates = trimmed.includes('://') ? [trimmed] : [`http://${trimmed}`, trimmed]

    for (const candidate of candidates) {
      try {
        const parsed = new URL(candidate)
        const isRoot = parsed.pathname === '/' && !parsed.search && !parsed.hash
        if (isRoot) return `${parsed.origin}/;`
        return parsed.toString()
      } catch {
        continue
      }
    }

    return trimmed
  }

  const startStream = async () => {
    if (!streamUrl || !schoolId) return

    setIsSending(true)
    setStatus(null)

    try {
      if (selectedDeviceIds.length === 0) {
        throw new Error('Please select at least one target bell device.')
      }

      const targetDevices = devices.filter(d => selectedDeviceIds.includes(d.id))
      if (targetDevices.length === 0) {
        throw new Error('No selected target devices found for stream.')
      }

      const normalizedUrl = normalizeStreamUrl(streamUrl)
      setStreamUrl(normalizedUrl)
      localStorage.setItem('broadcast_stream_url', normalizedUrl)
      localStorage.setItem('broadcast_stream_bypass_other_audio', String(streamBypassOtherAudio))

      // Route stream through Supabase Edge Function proxy to handle redirects/headers
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hjlwzkwiweocnfztshmy.supabase.co'
      const proxyUrl = `${supabaseUrl}/functions/v1/stream-proxy?url=${encodeURIComponent(normalizedUrl)}`

      const commands = targetDevices.map(d => ({
        device_id: d.id,
        command: 'STREAM_START',
        payload: {
          url: proxyUrl,
          bypass_other_audio: streamBypassOtherAudio,
          play_pre_announcement: playPreAnnouncementStream,
          pre_announcement_url: schoolPreAnnouncementUrl || '',
          pre_announcement_delay_seconds: schoolPreAnnouncementDelay || 3
        },
        status: 'pending'
      }))

      const { error: cmdError } = await supabase
        .from('command_queue')
        .insert(commands)

      if (cmdError) throw cmdError

      setStreamIsActive(true)
      setStatus({ type: 'success', message: 'Stream start queued! (In Queue - check notification bar when device starts playing)' })
    } catch (error) {
      console.error('Start stream failed:', error)
      if (error instanceof Error) {
        setStatus({ type: 'error', message: error.message })
      } else {
        setStatus({ type: 'error', message: 'Failed to start stream' })
      }
    } finally {
      setIsSending(false)
    }
  }

  const stopStream = async () => {
    if (!schoolId) return

    setIsSending(true)
    setStatus(null)

    try {
      if (selectedDeviceIds.length === 0) {
        throw new Error('Please select at least one target bell device.')
      }

      const targetDevices = devices.filter(d => selectedDeviceIds.includes(d.id))
      if (targetDevices.length === 0) {
        throw new Error('No selected target devices found for stream.')
      }

      const commands = targetDevices.map(d => ({
        device_id: d.id,
        command: 'STREAM_STOP',
        payload: {},
        status: 'pending'
      }))

      const { error: cmdError } = await supabase
        .from('command_queue')
        .insert(commands)

      if (cmdError) throw cmdError

      setStreamIsActive(false)
      setStatus({ type: 'success', message: 'Stream stop queued! (In Queue - check notification bar when device stops)' })
    } catch (error) {
      console.error('Stop stream failed:', error)
      if (error instanceof Error) {
        setStatus({ type: 'error', message: error.message })
      } else {
        setStatus({ type: 'error', message: 'Failed to stop stream' })
      }
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Broadcast</h1>
          <p className="text-xs text-muted-foreground">Live announcements, text-to-speech, voice notes, and internet radio streaming.</p>
        </div>
      </div>

      {/* Target Device Checkbox Selector */}
      <DeviceSelector
        devices={devices}
        selectedDeviceIds={selectedDeviceIds}
        onChange={setSelectedDeviceIds}
        isLoading={loadingDevices}
      />

      {!ttsEnabled && (
        <div className="rounded-md bg-amber-500/10 p-4 border border-amber-500/20">
          <div className="flex">
            <div className="flex-shrink-0">
              <Radio className="h-5 w-5 text-amber-500" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-amber-700 dark:text-amber-400">Feature Disabled</h3>
              <div className="mt-2 text-sm text-amber-600 dark:text-amber-500">
                <p>
                  The Text-to-Speech and Voice Note feature is currently disabled for your account.
                  Please contact the Super Admin to enable it.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {status && (
        <div className={`p-4 rounded-md ${status.type === 'success' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive dark:text-red-400'}`}>
          {status.message}
        </div>
      )}

      <div className="bg-card text-foreground shadow rounded-lg overflow-hidden border border-border">
        <div className="border-b border-border">
          <nav className="-mb-px flex" aria-label="Broadcast Mode Selector">
            <button
              onClick={() => setActiveTab('text')}
              aria-selected={activeTab === 'text'}
              aria-label="Text to Speech Mode"
              className={`${
                activeTab === 'text'
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
              } w-1/3 py-4 px-1 text-center border-b-2 font-medium text-sm flex items-center justify-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-primary`}
            >
              <Type className="w-4 h-4" />
              Text to Speech
            </button>
            <button
              onClick={() => setActiveTab('voice')}
              aria-selected={activeTab === 'voice'}
              aria-label="Voice Note Recording Mode"
              className={`${
                activeTab === 'voice'
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
              } w-1/3 py-4 px-1 text-center border-b-2 font-medium text-sm flex items-center justify-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-primary`}
            >
              <Mic className="w-4 h-4" />
              Voice Note
            </button>
            <button
              onClick={() => setActiveTab('stream')}
              aria-selected={activeTab === 'stream'}
              aria-label="Online Web Stream Mode"
              className={`${
                activeTab === 'stream'
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
              } w-1/3 py-4 px-1 text-center border-b-2 font-medium text-sm flex items-center justify-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-primary`}
            >
              <Radio className="w-4 h-4" />
              Online Stream
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'text' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground">Message</label>
                <textarea
                  rows={4}
                  className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                  placeholder="Type your announcement here..."
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value)
                    setSelectedAnnouncementId(null)
                    setSelectedAnnouncementLang(null)
                  }}
                  dir={ttsLanguage === 'ar' || ttsLanguage === 'ur' ? 'rtl' : 'ltr'}
                />
                {ttsLanguage !== 'en' && text.trim() && (
                  <button
                    type="button"
                    disabled={isTranslating}
                    onClick={async () => {
                      setIsTranslating(true)
                      try {
                        const translated = await translateText(text, ttsLanguage)
                        setText(translated)
                      } catch (err) {
                        console.error('Translation error:', err)
                      } finally {
                        setIsTranslating(false)
                      }
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Languages className="h-3.5 w-3.5" />
                    {isTranslating ? 'Translating...' : `Translate to ${ttsLanguage === 'ur' ? 'Urdu' : 'Arabic'}`}
                  </button>
                )}
              </div>

              {/* Predefined School Announcements Section */}
              <div className="mt-2 p-4 bg-muted/30 rounded-md border border-border">
                <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <span>📢</span> Predefined School Announcements (15 Total)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* English Dropdown */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      English Announcements
                    </label>
                    <select
                      value={selectedAnnouncementLang === 'en' ? (selectedAnnouncementId || '') : ''}
                      onChange={(e) => handleSelectAnnouncement(e.target.value, 'en')}
                      className="w-full rounded-md border border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary text-xs p-2 cursor-pointer"
                    >
                      <option value="">-- Select English --</option>
                      {predefinedAnnouncements.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.titleEn}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Urdu Dropdown */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      Urdu Announcements (اردو)
                    </label>
                    <select
                      value={selectedAnnouncementLang === 'ur' ? (selectedAnnouncementId || '') : ''}
                      onChange={(e) => handleSelectAnnouncement(e.target.value, 'ur')}
                      className="w-full rounded-md border border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary text-xs p-2 cursor-pointer"
                      dir="rtl"
                    >
                      <option value="" className="text-right">-- منتخب کریں --</option>
                      {predefinedAnnouncements.map((tpl) => (
                        <option key={tpl.id} value={tpl.id} className="text-right">
                          {tpl.titleUr} ({tpl.titleEn})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Arabic Dropdown */}
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      Arabic Announcements (العربية)
                    </label>
                    <select
                      value={selectedAnnouncementLang === 'ar' ? (selectedAnnouncementId || '') : ''}
                      onChange={(e) => handleSelectAnnouncement(e.target.value, 'ar')}
                      className="w-full rounded-md border border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary text-xs p-2 cursor-pointer"
                      dir="rtl"
                    >
                      <option value="" className="text-right">-- اختر إعلان --</option>
                      {predefinedAnnouncements.map((tpl) => (
                        <option key={tpl.id} value={tpl.id} className="text-right">
                          {tpl.titleAr} ({tpl.titleEn})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Live Broadcast Add-ons (Optional) */}
              <div className="mt-4 p-4 rounded-lg bg-card border border-border shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <span className="text-lg">⚡</span>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Live Broadcast Add-ons (Optional)</h4>
                    <p className="text-[10px] text-muted-foreground">Incorporate real-time information into your broadcast voice announcement.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Weather Forecast Panel */}
                  <div className="p-3 rounded-md bg-muted/20 border border-border/50 flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 font-medium text-xs text-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={includeWeather}
                          onChange={(e) => setIncludeWeather(e.target.checked)}
                          className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer bg-background"
                        />
                        <CloudSun className="w-4 h-4 text-sky-500" />
                        Include Weather Forecast
                      </label>
                      {includeWeather && fetchedWeather && (
                        <button
                          type="button"
                          onClick={() => handleFetchWeather(weatherCity)}
                          disabled={isFetchingWeather}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-50 transition-colors"
                          title="Refresh weather data"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isFetchingWeather ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                    </div>

                    {includeWeather && (
                      <div className="space-y-2 mt-1">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={weatherCity}
                            onChange={(e) => setWeatherCity(e.target.value)}
                            onBlur={() => handleFetchWeather(weatherCity)}
                            placeholder="Enter city (e.g. Islamabad)"
                            className="flex-1 rounded border border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary text-xs px-2 py-1"
                          />
                          <button
                            type="button"
                            onClick={() => handleFetchWeather(weatherCity)}
                            disabled={isFetchingWeather || !weatherCity.trim()}
                            className="bg-muted hover:bg-muted/80 text-[10px] font-medium px-2 py-1 rounded transition-colors text-foreground"
                          >
                            Set
                          </button>
                        </div>

                        <div className="text-[11px] p-2 bg-background/50 rounded border border-border/40 min-h-[48px] flex items-center justify-center">
                          {isFetchingWeather ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Fetching weather...
                            </div>
                          ) : weatherError ? (
                            <span className="text-destructive font-medium">{weatherError}</span>
                          ) : fetchedWeather ? (
                            <span className="text-muted-foreground">{fetchedWeather}</span>
                          ) : (
                            <span className="text-muted-foreground italic">No weather data fetched.</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* News Update Panel */}
                  <div className="p-3 rounded-md bg-muted/20 border border-border/50 flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 font-medium text-xs text-foreground">
                        <Newspaper className="w-4 h-4 text-emerald-500" />
                        Include News Update
                      </label>
                      {selectedNewsCategory !== 'none' && (
                        <button
                          type="button"
                          onClick={() => handleFetchNews(selectedNewsCategory)}
                          disabled={isFetchingNews}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/80 disabled:opacity-50 transition-colors"
                          title="Refresh news data"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isFetchingNews ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                    </div>

                    <div className="space-y-2 mt-1">
                      <select
                        value={selectedNewsCategory}
                        onChange={(e) => setSelectedNewsCategory(e.target.value as any)}
                        className="w-full rounded border border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary text-xs px-2 py-1 cursor-pointer"
                      >
                        <option value="none">-- Select News Category --</option>
                        <option value="business">📈 Business News</option>
                        <option value="education">🎓 Education News</option>
                        <option value="tech">💻 Technology News</option>
                      </select>

                      {selectedNewsCategory !== 'none' && (
                        <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                          {isFetchingNews ? (
                            <div className="text-[11px] p-4 text-center text-muted-foreground flex items-center justify-center gap-2">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Fetching latest news...
                            </div>
                          ) : newsError ? (
                            <div className="text-[11px] text-destructive p-2 text-center">{newsError}</div>
                          ) : newsArticles.length === 0 ? (
                            <div className="text-[11px] text-muted-foreground p-2 text-center italic">No news articles found.</div>
                          ) : (
                            <div className="space-y-1.5">
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Select one headline to speak:</p>
                              {newsArticles.map((art, idx) => {
                                const isSelected = selectedNewsHeadline === art.title;
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setSelectedNewsHeadline(isSelected ? null : art.title)}
                                    className={`w-full text-left p-1.5 rounded border text-[10px] transition-all flex flex-col gap-0.5 ${
                                      isSelected
                                        ? 'bg-primary/10 border-primary text-primary font-medium shadow-sm'
                                        : 'bg-background hover:bg-muted/50 border-border text-foreground'
                                    }`}
                                  >
                                    <span className="line-clamp-2">{art.title}</span>
                                    <span className="text-[8px] text-muted-foreground text-right">Source: {art.source}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Spoken Text Realtime Preview */}
                <div className="p-3 rounded-md bg-sky-500/5 border border-sky-500/10 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-sky-600 dark:text-sky-400">📢 Live Spoken Text Preview</span>
                    <span className="text-[9px] text-muted-foreground">This is exactly what the speakers will read out.</span>
                  </div>
                  <div className="p-2.5 bg-background/80 rounded border border-border/80 text-xs text-foreground min-h-[50px] whitespace-pre-wrap leading-relaxed shadow-inner">
                    {getSpokenTextPreview().trim() ? (
                      getSpokenTextPreview()
                    ) : (
                      <span className="text-muted-foreground italic">Add weather, select news, or write a custom message to preview the spoken announcement.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Provider Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground">TTS Provider</label>
                <select
                  value={ttsProvider}
                  onChange={async (e) => {
                    const provider = e.target.value as TtsProvider
                    setTtsProvider(provider)

                    if (user) {
                      try {
                        const { error } = await supabase
                          .from('users')
                          .update({ tts_provider: provider })
                          .eq('id', user.id)

                        if (error) {
                          console.error('Failed to save TTS provider preference:', error)
                        }
                      } catch (error) {
                        console.error('Unexpected error saving TTS provider preference:', error)
                      }
                    }
                  }}
                  className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                >
                  <option value="google-free">Device Built-in (Free – Recommended)</option>
                  <option value="openai">OpenAI</option>
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="cambai">Camb.ai</option>
                </select>
                {ttsProvider === 'google-free' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Uses the device's internal Google Translate integration. No API key required.
                  </p>
                )}
              </div>

              {ttsProvider === 'google-free' && (
                <div>
                  <label className="block text-sm font-medium text-foreground">Voice</label>
                  <div className="mt-2 flex items-center gap-6">
                    <label className="inline-flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="radio"
                        name="google-free-voice-gender"
                        value="female"
                        checked={googleFreeVoiceGender === 'female'}
                        onChange={() => {
                          setGoogleFreeVoiceGender('female')
                          localStorage.setItem('google_free_voice_gender', 'female')
                        }}
                      />
                      Female
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="radio"
                        name="google-free-voice-gender"
                        value="male"
                        checked={googleFreeVoiceGender === 'male'}
                        onChange={() => {
                          setGoogleFreeVoiceGender('male')
                          localStorage.setItem('google_free_voice_gender', 'male')
                        }}
                      />
                      Male
                    </label>
                  </div>
                </div>
              )}

              {/* TTS Language Selector — visible for google-free and openai */}
              {(ttsProvider === 'google-free' || ttsProvider === 'openai') && (
                <div>
                  <label className="block text-sm font-medium text-foreground">TTS Language</label>
                  <select
                    value={ttsLanguage}
                    onChange={(e) => {
                      setTtsLanguage(e.target.value)
                      setSelectedAnnouncementId(null)
                      setSelectedAnnouncementLang(null)
                    }}
                    className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                  >
                    <option value="en">English</option>
                    <option value="ur">Urdu (اردو)</option>
                    <option value="ar">Arabic (العربية)</option>
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ttsProvider === 'openai'
                      ? 'OpenAI auto-detects language from your text. This is a hint only.'
                      : 'Google Translate TTS will speak in the selected language.'}
                  </p>
                </div>
              )}

              {ttsProvider === 'topmediai' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground">TopMediai API Key</label>
                    <input
                      type="password"
                      value={topMediaiKey}
                      onChange={(e) => setTopMediaiKey(e.target.value)}
                      onBlur={() => saveSecureKey('topmediai', topMediaiKey)}
                      className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                      placeholder="Enter your API Key"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Speaker ID</label>
                    <input
                      type="text"
                      value={topMediaiSpeaker}
                      onChange={(e) => {
                        setTopMediaiSpeaker(e.target.value)
                        localStorage.setItem('topmediai_speaker', e.target.value)
                      }}
                      className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                      placeholder="00151554-3826-11ee-a861-00163e2ac61b"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Emotion</label>
                    <input
                      type="text"
                      value={topMediaiEmotion}
                      onChange={(e) => {
                        setTopMediaiEmotion(e.target.value)
                        localStorage.setItem('topmediai_emotion', e.target.value)
                      }}
                      className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                      placeholder="Neutral"
                    />
                  </div>
                </div>
              )}

              {ttsProvider === 'elevenlabs' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground">ElevenLabs API Key</label>
                    <input
                      type="password"
                      value={elevenLabsKey}
                      onChange={(e) => setElevenLabsKey(e.target.value)}
                      onBlur={() => saveSecureKey('elevenlabs', elevenLabsKey)}
                      className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                      placeholder="xi-..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Voice ID</label>
                    <input
                      type="text"
                      value={elevenLabsVoiceId}
                      onChange={(e) => {
                        setElevenLabsVoiceId(e.target.value)
                        localStorage.setItem('elevenlabs_voice_id', e.target.value)
                      }}
                      className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                      placeholder="21m00Tcm4TlvDq8ikWAM"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Default: Rachel</p>
                  </div>
                </div>
              )}

              {ttsProvider === 'openai' && (
                <>

                  {!apiKey && (
                    <div>
                      <label className="block text-sm font-medium text-destructive dark:text-red-400">OpenAI API Key (Required)</label>
                      <input 
                        type="password" 
                        className="mt-1 block w-full rounded-md border-destructive bg-background text-foreground shadow-sm focus:border-destructive focus:ring-destructive sm:text-sm p-2 border" 
                        placeholder="sk-..."
                        onChange={(e) => {
                          setApiKey(e.target.value)
                          localStorage.setItem('openai_api_key', e.target.value)
                        }}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">Your key is stored locally in your browser.</p>
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
                    >
                      {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
                    </button>
                    
                    {showAdvanced && (
                      <div className="mt-4 space-y-4 p-4 bg-muted/50 rounded-md border border-border">
                        <div>
                          <label className="block text-sm font-medium text-foreground">API Base URL</label>
                          <input 
                            type="text" 
                            value={baseUrl}
                            className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                            placeholder="https://api.openai.com/v1"
                            onChange={(e) => {
                              setBaseUrl(e.target.value)
                              localStorage.setItem('openai_base_url', e.target.value)
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-foreground">Model</label>
                          <input 
                            type="text" 
                            value={model}
                            className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                            placeholder="tts-1"
                            onChange={(e) => {
                              setModel(e.target.value)
                              localStorage.setItem('openai_model', e.target.value)
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-foreground">Voice</label>
                          <input 
                            type="text" 
                            value={voice}
                            className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                            placeholder="alloy"
                            onChange={(e) => {
                              setVoice(e.target.value)
                              localStorage.setItem('openai_voice', e.target.value)
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {ttsProvider === 'cambai' && (
                <div className="space-y-4 p-4 bg-muted/50 rounded-md border border-border">
                   <div>
                      <label className="block text-sm font-medium text-foreground">Camb.ai API Key</label>
                      <input 
                        type="password" 
                        value={cambAiKey}
                        className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                        placeholder="x-api-key"
                        onChange={(e) => {
                          setCambAiKey(e.target.value)
                          localStorage.setItem('cambai_api_key', e.target.value)
                        }}
                      />
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-foreground">Voice ID</label>
                        <input 
                          type="number" 
                          value={cambAiVoiceId}
                          className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                          onChange={(e) => {
                            setCambAiVoiceId(Number(e.target.value))
                            localStorage.setItem('cambai_voice_id', e.target.value)
                          }}
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-foreground">Language ID</label>
                        <input 
                          type="number" 
                          value={cambAiLanguage}
                          className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                          onChange={(e) => {
                            setCambAiLanguage(Number(e.target.value))
                            localStorage.setItem('cambai_language', e.target.value)
                          }}
                        />
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-foreground">Gender (1=M, 0=F)</label>
                        <select 
                          value={cambAiGender}
                          className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                          onChange={(e) => {
                            setCambAiGender(Number(e.target.value))
                            localStorage.setItem('cambai_gender', e.target.value)
                          }}
                        >
                          <option value={1}>Male</option>
                          <option value={0}>Female</option>
                        </select>
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-foreground">Age</label>
                        <input 
                          type="number" 
                          value={cambAiAge}
                          className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border" 
                          onChange={(e) => {
                            setCambAiAge(Number(e.target.value))
                            localStorage.setItem('cambai_age', e.target.value)
                          }}
                        />
                     </div>
                   </div>
                </div>
              )}

              <div className="flex items-center gap-2 mt-4 p-3 bg-muted/30 rounded-md border border-border">
                <input
                  id="tts-pre-announcement"
                  type="checkbox"
                  checked={playPreAnnouncementTTS}
                  onChange={(e) => setPlayPreAnnouncementTTS(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
                />
                <label htmlFor="tts-pre-announcement" className="text-sm font-medium text-foreground cursor-pointer">
                  🔔 Play Pre-Announcement Sound before broadcast (Default 3s delay)
                </label>
              </div>

              <button
                onClick={broadcastText}
                disabled={!getSpokenTextPreview().trim() || isSending}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none disabled:opacity-50"
              >
                <Send className="w-4 h-4 mr-2" />
                {isSending ? 'Broadcasting...' : 'Broadcast Announcement'}
              </button>
            </div>
          ) : activeTab === 'voice' ? (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="p-6 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    <Mic className="w-12 h-12" />
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="p-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors animate-pulse"
                  >
                    <Square className="w-12 h-12" />
                  </button>
                )}
              </div>
              
              <p className="text-sm text-muted-foreground">
                {isRecording ? 'Recording... Tap to stop' : 'Tap microphone to start recording'}
              </p>

              {audioUrl && !isRecording && (
                <div className="bg-muted/50 p-4 rounded-md space-y-4">
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={playPreview}
                      className="inline-flex items-center px-3 py-2 border border-input shadow-sm text-sm leading-4 font-medium rounded-md text-foreground bg-background hover:bg-accent hover:text-accent-foreground focus:outline-none"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Play Preview
                    </button>
                    <button
                      onClick={() => { setAudioBlob(null); setAudioUrl(null); }}
                      className="text-destructive text-sm hover:text-destructive/80"
                    >
                      Delete
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-2 p-3 bg-muted/30 rounded-md border border-border text-left">
                    <input
                      id="voice-pre-announcement"
                      type="checkbox"
                      checked={playPreAnnouncementVoice}
                      onChange={(e) => setPlayPreAnnouncementVoice(e.target.checked)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
                    />
                    <label htmlFor="voice-pre-announcement" className="text-sm font-medium text-foreground cursor-pointer">
                      🔔 Play Pre-Announcement Sound before voice note (Default 3s delay)
                    </label>
                  </div>
                  
                  <button
                    onClick={broadcastVoice}
                    disabled={isSending}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none disabled:opacity-50"
                  >
                    <Radio className="w-4 h-4 mr-2" />
                    {isSending ? 'Broadcasting...' : 'Broadcast Voice Note'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground">Stream URL</label>
                <input
                  type="text"
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="https://example.com/stream.mp3"
                  className="mt-1 block w-full rounded-md border-input bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary sm:text-sm p-2 border"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Paste a direct radio/audio stream URL. For Shoutcast server links like http://ip:port, use http://ip:port/;
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="bypass-other-audio"
                  type="checkbox"
                  checked={streamBypassOtherAudio}
                  onChange={(e) => {
                    setStreamBypassOtherAudio(e.target.checked)
                    localStorage.setItem('broadcast_stream_bypass_other_audio', String(e.target.checked))
                  }}
                  className="h-4 w-4"
                />
                <label htmlFor="bypass-other-audio" className="text-sm text-foreground">
                  Bypass scheduled bells, TTS, and voice notes while streaming
                </label>
              </div>

              <div className="flex items-center gap-2 mt-4 p-3 bg-muted/30 rounded-md border border-border">
                <input
                  id="stream-pre-announcement"
                  type="checkbox"
                  checked={playPreAnnouncementStream}
                  onChange={(e) => setPlayPreAnnouncementStream(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
                />
                <label htmlFor="stream-pre-announcement" className="text-sm font-medium text-foreground cursor-pointer">
                  🔔 Play Pre-Announcement Sound before stream starts (Default 3s delay)
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={startStream}
                  disabled={!streamUrl || isSending}
                  className="inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none disabled:opacity-50"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {isSending ? 'Starting...' : streamIsActive ? 'Restart Stream' : 'Play Stream'}
                </button>
                <button
                  onClick={stopStream}
                  disabled={isSending}
                  className="inline-flex justify-center items-center px-4 py-2 border border-input text-sm font-medium rounded-md shadow-sm text-foreground bg-background hover:bg-accent hover:text-accent-foreground focus:outline-none disabled:opacity-50"
                >
                  <Square className="w-4 h-4 mr-2" />
                  {isSending ? 'Stopping...' : 'Stop Stream'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
