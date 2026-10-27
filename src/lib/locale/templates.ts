// src/lib/locale/templates.ts
import { Dialect } from './detector';

export interface BookingSlotParams {
  date: string;
  timeWindow: string;
  slots: string;
}

export interface BookingConfirmedParams {
  id: string;
  service: string;
  date: string;
  time: string;
  location: string;
}

export interface UnavailableParams {
  date: string;
}

export interface MedicalHoldingParams {
  emergencyPhone: string;
}

export interface NeedsHumanParams {
  emergencyPhone: string;
}

export function formatHumanDate(dateInput: string, dialect: Dialect = 'en'): string {
  if (!dateInput) return dateInput;
  const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateInput;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);

  const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const dayOfWeek = d.getUTCDay();

  const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const daysKn = ['ಭಾನು', 'ಸೋಮ', 'ಮಂಗಳ', 'ಬುಧ', 'ಗುರು', 'ಶುಕ್ರ', 'ಶನಿ'];
  const monthsKn = ['ಜನ', 'ಫೆಬ್ರ', 'ಮಾರ್ಚ್', 'ಏಪ್ರಿ', 'ಮೇ', 'ಜೂನ್', 'ಜುಲೈ', 'ಆಗ', 'ಸೆಪ್ಟೆಂ', 'ಅಕ್ಟೋ', 'ನವೆಂ', 'ಡಿಸೆಂ'];

  const daysHi = ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'];
  const monthsHi = ['जन', 'फ़र', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अग', 'सित', 'अक्तू', 'नव', 'दिस'];

  if (dialect === 'kn') {
    return `${daysKn[dayOfWeek]}, ${day} ${monthsKn[month]}`;
  } else if (dialect === 'hi') {
    return `${daysHi[dayOfWeek]}, ${day} ${monthsHi[month]}`;
  } else {
    // en, hi_latin, kn_latin
    return `${daysEn[dayOfWeek]}, ${day} ${monthsEn[month]}`;
  }
}

export const TEMPLATES = {
  booking_slot_options: {
    en: (p: BookingSlotParams) =>
      `We have slots available for Dr. Consultation on ${formatHumanDate(p.date, 'en')} (${p.timeWindow}): ${p.slots}. Would you like to confirm one of these slots? Please reply with your preferred time and your name.`,
    hi: (p: BookingSlotParams) =>
      `हमारे पास ${formatHumanDate(p.date, 'hi')} (${p.timeWindow}) को डॉक्टर परामर्श के लिए स्लॉट उपलब्ध हैं: ${p.slots}। क्या आप इनमें से कोई स्लॉट बुक करना चाहते हैं? कृपया अपना पसंदीदा समय और नाम भेजें।`,
    hi_latin: (p: BookingSlotParams) =>
      `City Health Clinic mein ${formatHumanDate(p.date, 'hi_latin')} (${p.timeWindow}) ke liye doctor consultation ke slots available hain: ${p.slots}. Kya aap inme se koi slot book karna chahte hain? Kripya apna preferred time aur naam batayein.`,
    kn: (p: BookingSlotParams) =>
      `ನಮ್ಮಲ್ಲಿ ${formatHumanDate(p.date, 'kn')} (${p.timeWindow}) ರಂದು ವೈದ್ಯರ ಸಮಾಲೋಚನೆಗಾಗಿ ಸ್ಲಾಟ್‌ಗಳು ಲಭ್ಯವಿವೆ: ${p.slots}. ನೀವು ಈ ಸ್ಲಾಟ್‌ಗಳಲ್ಲಿ ಒಂದನ್ನು ಖಚಿತಪಡಿಸಲು ಬಯಸುವಿರಾ? ದಯವಿಟ್ಟು ನಿಮ್ಮ ಸಮಯ ಮತ್ತು ಹೆಸರನ್ನು ತಿಳಿಸಿ.`,
    kn_latin: (p: BookingSlotParams) =>
      `City Health Clinic nalli ${formatHumanDate(p.date, 'kn_latin')} (${p.timeWindow}) ge doctor consultation slots ide: ${p.slots}. Neevu ondu slot confirm madalu bayasuvira? Dayavittu nimma samaya mathu hesaru thilisi.`,
  },

  booking_confirmed: {
    en: (p: BookingConfirmedParams) =>
      `Your appointment has been confirmed!\n\nBooking ID: ${p.id}\nService: ${p.service}\nDate: ${formatHumanDate(p.date, 'en')}\nTime: ${p.time}\nLocation: ${p.location}\n\nPlease arrive 10 minutes prior to your slot. Cancellation or rescheduling is free up to 2 hours in advance.`,
    hi: (p: BookingConfirmedParams) =>
      `आपकी अपॉइंटमेंट सफलतापूर्वक कन्फर्म हो गई है!\n\nबुकिंग आईडी: ${p.id}\nसेवा: ${p.service}\nदिनांक: ${formatHumanDate(p.date, 'hi')}\nसमय: ${p.time}\nस्थान: ${p.location}\n\nकृपया अपने समय से 10 मिनट पहले पहुंचें। अपॉइंटमेंट से 2 घंटे पहले तक कैंसिलेशन निःशुल्क है।`,
    hi_latin: (p: BookingConfirmedParams) =>
      `Aapka appointment confirm ho gaya hai!\n\nBooking ID: ${p.id}\nService: ${p.service}\nDate: ${formatHumanDate(p.date, 'hi_latin')}\nTime: ${p.time}\nLocation: ${p.location}\n\nKripya apne time se 10 minute pehle pahuchein. Cancellation 2 ghante pehle tak free hai.`,
    kn: (p: BookingConfirmedParams) =>
      `ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಯಶಸ್ವಿಯಾಗಿ ದೃಢಪಟ್ಟಿದೆ!\n\nಬುಕಿಂಗ್ ಐಡಿ: ${p.id}\nಸೇವೆ: ${p.service}\nದಿನಾಂಕ: ${formatHumanDate(p.date, 'kn')}\nಸಮಯ: ${p.time}\nಸ್ಥಳ: ${p.location}\n\nದಯವಿಟ್ಟು ನಿಮ್ಮ ಸ್ಲಾಟ್‌ಗಿಂತ 10 ನಿಮಿಷಗಳ ಮೊದಲು ಆಗಮಿಸಿ. ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್‌ಗೆ 2 ಗಂಟೆಗಳ ಮೊದಲು ಉಚಿತ ರದ್ದತಿ ಲಭ್ಯವಿದೆ.`,
    kn_latin: (p: BookingConfirmedParams) =>
      `Nimma appointment confirm aagide!\n\nBooking ID: ${p.id}\nService: ${p.service}\nDate: ${formatHumanDate(p.date, 'kn_latin')}\nTime: ${p.time}\nLocation: ${p.location}\n\nDayavittu 10 nimisha munche banni. Cancellation 2 gante munche free aagide.`,
  },

  booking_unavailable: {
    en: (p: UnavailableParams) =>
      `No available slots found for ${formatHumanDate(p.date, 'en')}. Our regular OPD hours are Mon-Sat 9am-1pm and 4pm-8pm. Would you like to check the next working day?`,
    hi: (p: UnavailableParams) =>
      `${formatHumanDate(p.date, 'hi')} के लिए कोई स्लॉट उपलब्ध नहीं है। हमारे क्लिनिक का समय सोम-शनि सुबह 9 से 1 और शाम 4 से 8 बजे तक है। क्या आप अगले कार्यदिवस की जांच करना चाहते हैं?`,
    hi_latin: (p: UnavailableParams) =>
      `${formatHumanDate(p.date, 'hi_latin')} ke liye koi slot available nahi hai. Clinic ke routine OPD timings Mon-Sat subah 9am-1pm aur shaam 4pm-8pm hain. Kya aap next working day check karna chahenge?`,
    kn: (p: UnavailableParams) =>
      `${formatHumanDate(p.date, 'kn')} ರಂದು ಯಾವುದೇ ಸ್ಲಾಟ್‌ಗಳು ಲಭ್ಯವಿಲ್ಲ. ನಮ್ಮ ಕ್ಲಿನಿಕ್ ಸಮಯ ಸೋಮ-ಶನಿ ಬೆಳಿಗ್ಗೆ 9-1 ಮತ್ತು ಸಂಜೆ 4-8. ನೀವು ಮುಂದಿನ ದಿನವನ್ನು ಪರಿಶೀಲಿಸಲು ಬಯಸುವಿರಾ?`,
    kn_latin: (p: UnavailableParams) =>
      `${formatHumanDate(p.date, 'kn_latin')} ge yavude slot sigalilla. Clinic timings Mon-Sat beligge 9am-1pm mathu sanje 4pm-8pm. Neevu mundina dina check madalu bayasuvira?`,
  },

  medical_holding: {
    en: (p: MedicalHoldingParams) =>
      `City Health Clinic does not provide medical prescriptions or clinical diagnosis over chat. For urgent symptoms or emergency care, please contact our 24/7 emergency line at ${p.emergencyPhone} or visit the clinic immediately. If you would like to book a doctor consultation, I can assist you.`,
    hi: (p: MedicalHoldingParams) =>
      `सिटी हेल्थ क्लिनिक चैट पर डॉक्टरी दवा, खुराक या जांच की सलाह नहीं देता है। किसी भी आपातकालीन स्थिति के लिए कृपया हमारी 24/7 हेल्पलाइन ${p.emergencyPhone} पर कॉल करें या तुरंत क्लिनिक आएं। यदि आप डॉक्टर परामर्श बुक करना चाहते हैं, तो मैं सहायता कर सकता हूँ।`,
    hi_latin: (p: MedicalHoldingParams) =>
      `City Health Clinic chat par dawai ya medical advice provide nahi karta hai. Kisi bhi emergency ke liye kripya hamari 24/7 helpline ${p.emergencyPhone} par call karein ya turant clinic aayein. Doctor consultation book karne ke liye main aapki madad kar sakta hoon.`,
    kn: (p: MedicalHoldingParams) =>
      `ಸಿಟಿ ಹೆಲ್ತ್ ಕ್ಲಿನಿಕ್ ಚಾಟ್‌ನಲ್ಲಿ ವೈದ್ಯಕೀಯ ಚಿಕಿತ್ಸೆ ಅಥವಾ ಔಷಧಿ ಸಲಹೆಗಳನ್ನು ನೀಡುವುದಿಲ್ಲ. ತುರ್ತು ಪರಿಸ್ಥಿತಿಗಾಗಿ ದಯವಿಟ್ಟು ನಮ್ಮ 24/7 ಸಹಾಯವಾಣಿ ${p.emergencyPhone} ಗೆ ಕರೆ ಮಾಡಿ ಅಥವಾ ನೇರವಾಗಿ ಕ್ಲಿನಿಕ್‌ಗೆ ಭೇಟಿ ನೀಡಿ. ವೈದ್ಯರ ಭೇಟಿಯ ಸಮಯವನ್ನು ಕಾಯ್ದಿರಿಸಲು ನಾನು ನಿಮಗೆ ಸಹಾಯ ಮಾಡಬಹುದು.`,
    kn_latin: (p: MedicalHoldingParams) =>
      `City Health Clinic chat nalli yavude medical advice athava oushadha salahe needuvudilla. Emergency iddare dayavittu namma 24/7 helpline ${p.emergencyPhone} ge call maadi athava clinic ge banni. Doctor consultation book madalu sahaya maduththene.`,
  },

  needs_human_hold: {
    en: (p: NeedsHumanParams) =>
      `Thank you. Our clinic staff is reviewing your message and will reply shortly. For urgent care, please call ${p.emergencyPhone}.`,
    hi: (p: NeedsHumanParams) =>
      `धन्यवाद। हमारी क्लिनिक टीम आपके संदेश की समीक्षा कर रही है और जल्द ही उत्तर देगी। आपातकालीन सहायता के लिए कृपया ${p.emergencyPhone} पर कॉल करें।`,
    hi_latin: (p: NeedsHumanParams) =>
      `Dhanyawad. Hamari clinic team aapke message ko review kar rahi hai aur jaldi hi reply karegi. Urgent help ke liye kripya ${p.emergencyPhone} par call karein.`,
    kn: (p: NeedsHumanParams) =>
      `ಧನ್ಯವಾದಗಳು. ನಮ್ಮ ಕ್ಲಿನಿಕ್ ಸಿಬ್ಬಂದಿ ನಿಮ್ಮ ಸಂದೇಶವನ್ನು ಪರಿಶೀಲಿಸುತ್ತಿದ್ದು ಶೀಘ್ರದಲ್ಲೇ ಉತ್ತರಿಸಲಿದ್ದಾರೆ. ತುರ್ತು ಸಹಾಯಕ್ಕಾಗಿ ದಯವಿಟ್ಟು ${p.emergencyPhone} ಗೆ ಕರೆ ಮಾಡಿ.`,
    kn_latin: (p: NeedsHumanParams) =>
      `Dhanyavada. Namma clinic team nimma message noduthiddare, bega reply maduththeve. Urgent care ge dayavittu ${p.emergencyPhone} ge call maadi.`,
  },

  rate_limit_exceeded: {
    en: () =>
      `You are sending messages too quickly. Please wait a moment before sending another message. For urgent assistance, please call +91 98765 99999.`,
    hi: () =>
      `आप बहुत तेज़ी से संदेश भेज रहे हैं। कृपया कुछ क्षण प्रतीक्षा करें। आपातकालीन सहायता के लिए +91 98765 99999 पर कॉल करें।`,
    hi_latin: () =>
      `Aap bohot jaldi messages bhej rahe hain. Kripya thoda wait karke dobara message karein. Urgent help ke liye +91 98765 99999 par call karein.`,
    kn: () =>
      `ನೀವು ಸಂದೇಶಗಳನ್ನು ತುಂಬಾ ವೇಗವಾಗಿ ಕಳುಹಿಸುತ್ತಿದ್ದೀರಿ. ದಯವಿಟ್ಟು ಸ್ವಲ್ಪ ಸಮಯ ಕಾಯಿರಿ. ತುರ್ತು ಸಹಾಯಕ್ಕಾಗಿ +91 98765 99999 ಗೆ ಕರೆ ಮಾಡಿ.`,
    kn_latin: () =>
      `Neevu thumba bega message kallisuthtiddira. Dayavittu swalpa samaya thadiyiri. Urgent care ge +91 98765 99999 ge call maadi.`,
  },

  safe_fallback: {
    en: () =>
      `Thank you for reaching out to City Health Clinic. Our automated assistant is currently experiencing high load. A staff member has been alerted and will assist you shortly.`,
    hi: () =>
      `सिटी हेल्थ क्लिनिक से संपर्क करने के लिए धन्यवाद। हमारा स्वचालित सहायक अभी व्यस्त है। हमारी टीम को सूचित कर दिया गया है और वे जल्द ही आपकी सहायता करेंगे।`,
    hi_latin: () =>
      `City Health Clinic se contact karne ke liye dhanyawad. Hamara automated assistant abhi high load par hai. Clinic staff ko alert kar diya gaya hai aur wo jaldi hi reply karenge.`,
    kn: () =>
      `ಸಿಟಿ ಹೆಲ್ತ್ ಕ್ಲಿನಿಕ್ ಅನ್ನು ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು. ನಮ್ಮ ಸ್ವಯಂಚಾಲಿತ ಸಹಾಯಕ ಪ್ರಸ್ತುತ ಬ್ಯುಸಿಯಾಗಿದೆ. ಸಿಬ್ಬಂದಿಗೆ ತಿಳಿಸಲಾಗಿದೆ ಮತ್ತು ಶೀಘ್ರದಲ್ಲೇ ಉತ್ತರಿಸಲಿದ್ದಾರೆ.`,
    kn_latin: () =>
      `City Health Clinic contact madಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು. Automated assistant busy aagide. Namma clinic team bega reply maduththeve.`,
  },

  unanswered_holding: {
    en: () =>
      `Thank you for reaching out to City Health Clinic. I will check this with our clinic staff and have someone assist you shortly with accurate details.`,
    hi: () =>
      `सिटी हेल्थ क्लिनिक से संपर्क करने के लिए धन्यवाद। मैं हमारी क्लिनिक टीम से इसकी पुष्टि करूँगा और हमारे स्टाफ सदस्य जल्द ही आपकी सहायता करेंगे।`,
    hi_latin: () =>
      `City Health Clinic se contact karne ke liye dhanyawad. Main hamari clinic staff se check karke confirm karunga aur hamari team jaldi hi aapki madad karegi.`,
    kn: () =>
      `ಸಿಟಿ ಹೆಲ್ತ್ ಕ್ಲಿನಿಕ್ ಅನ್ನು ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು. ನಾನು ನಮ್ಮ ಕ್ಲಿನಿಕ್ ಸಿಬ್ಬಂದಿಯೊಂದಿಗೆ ಪರಿಶೀಲಿಸುತ್ತೇನೆ ಮತ್ತು ನಮ್ಮ ತಂಡವು ಶೀಘ್ರದಲ್ಲೇ ನಿಮಗೆ ನಿಖರವಾದ ವಿವರಗಳನ್ನು ನೀಡಲಿದೆ.`,
    kn_latin: () =>
      `City Health Clinic contact madಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು. Namma clinic staff jothe check madi bega reply maduththeve.`,
  },
};

export function getLocalizedTemplate<T extends keyof typeof TEMPLATES>(
  templateKey: T,
  dialect: Dialect = 'en',
  params?: any
): string {
  const templateGroup = TEMPLATES[templateKey];
  const fn = (templateGroup as any)[dialect] || (templateGroup as any)['en'];
  return fn(params);
}
