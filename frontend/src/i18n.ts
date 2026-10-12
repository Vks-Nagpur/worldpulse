// Interface language. Headlines stay in their original language.
import { useSyncExternalStore } from 'react'

const HI: Record<string, string> = {
  'Today': 'आज', 'Markets': 'बाज़ार', 'Energy': 'ऊर्जा', 'Trade': 'व्यापार', 'Conflict': 'संघर्ष', 'More': 'और',
  'Trade & shipping': 'व्यापार और शिपिंग', 'Conflict & security': 'संघर्ष और सुरक्षा', 'Country risk': 'देश जोखिम', 'Countries': 'देश',
  'Signals': 'संकेत', 'Policy & elections': 'नीति और चुनाव', 'Briefings': 'ब्रीफ़िंग', 'Weekly review': 'साप्ताहिक समीक्षा', 'All news': 'सभी समाचार',
  'Ask': 'पूछें', 'Ask WorldPulse': 'WorldPulse से पूछें', 'Search': 'खोज', 'Watchlist & alerts': 'वॉचलिस्ट और अलर्ट', 'Learn': 'समझें', 'Earthquakes': 'भूकंप',
  'About & sources': 'स्रोत और जानकारी', 'Compare prices': 'कीमतों की तुलना', 'Currency watch': 'मुद्रा निगरानी',
  'Search countries, events, headlines…': 'देश, घटनाएँ, सुर्खियाँ खोजें…', 'Dark': 'डार्क', 'Light': 'लाइट',
  'What changed since yesterday': 'कल से क्या बदला', 'Key developments': 'मुख्य घटनाएँ', 'Risk signals': 'जोखिम संकेत', 'My watchlist': 'मेरी वॉचलिस्ट',
  'Where it is happening': 'कहाँ हो रहा है', 'See all': 'सभी देखें', 'Show more': 'और दिखाएँ', 'Share': 'साझा करें', 'Download': 'डाउनलोड',
  'Print / PDF': 'प्रिंट / PDF', 'Updated': 'अपडेट', 'Data collected': 'डेटा एकत्र', 'sources OK': 'स्रोत ठीक',
  'All business & risk': 'सभी व्यवसाय और जोखिम', 'Markets & economy': 'बाज़ार और अर्थव्यवस्था', 'Wars & military': 'युद्ध और सेना',
  'Sanctions & diplomacy': 'प्रतिबंध और कूटनीति', 'Cyber & tech': 'साइबर और तकनीक', 'Everything': 'सब कुछ',
  'All regions': 'सभी क्षेत्र', 'All countries': 'सभी देश', 'Last 24 hours': 'पिछले 24 घंटे', 'Last 3 days': 'पिछले 3 दिन', 'Last 7 days': 'पिछले 7 दिन',
  'Any support': 'कोई भी पुष्टि', '2+ outlets or official': '2+ स्रोत या आधिकारिक', 'Official or measured only': 'केवल आधिकारिक/मापा गया',
  'Search words…': 'शब्द खोजें…', 'Filtered by:': 'फ़िल्टर:', 'Reset all': 'सब रीसेट', 'Price moves': 'कीमतों में बदलाव',
  'New developments': 'नई घटनाएँ', 'Countries in the news': 'चर्चा में देश', 'New signals': 'नए संकेत',
  'Measured': 'मापा गया', 'Official alert': 'आधिकारिक चेतावनी', 'Official source': 'आधिकारिक स्रोत', 'Several outlets': 'कई स्रोत', 'One outlet': 'एक स्रोत',
  'Low': 'कम', 'Elevated': 'बढ़ा हुआ', 'High': 'उच्च', 'Install app': 'ऐप इंस्टॉल करें', 'Language': 'भाषा',
  'Sanctions tracker': 'प्रतिबंध ट्रैकर', 'Chokepoint watch': 'समुद्री मार्ग निगरानी', 'Supply chains': 'आपूर्ति श्रृंखला',
  'Official announcements': 'आधिकारिक घोषणाएँ', 'Central banks': 'केंद्रीय बैंक', 'Elections in the news': 'चर्चा में चुनाव', 'Corrections log': 'सुधार लॉग',
  'Timeline': 'समयरेखा', 'Sources': 'स्रोत', 'Related developments': 'संबंधित घटनाएँ', 'Why this topic': 'यह विषय क्यों',
  'Nothing matches these filters.': 'इन फ़िल्टर से कुछ नहीं मिला।', 'Change name': 'नाम बदलें', 'Loading…': 'लोड हो रहा है…',
}

type Lang = 'en' | 'hi'
const read = (): Lang => { try { return (localStorage.getItem('worldpulse.lang') as Lang) || 'en' } catch { return 'en' } }
let lang: Lang = read()
const subs = new Set<() => void>()

export function setLang(l: Lang) {
  lang = l
  try { localStorage.setItem('worldpulse.lang', l) } catch { /* storage unavailable */ }
  document.documentElement.lang = l
  subs.forEach((f) => f())
}
export function useLang(): Lang {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => lang)
}
export function t(s: string): string {
  return lang === 'hi' ? HI[s] || s : s
}
document.documentElement.lang = lang
