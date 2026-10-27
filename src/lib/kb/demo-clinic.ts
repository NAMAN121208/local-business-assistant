// src/lib/kb/demo-clinic.ts
import { Business, KnowledgeBaseContent, KnowledgeBaseVersion } from '../db/types';

export const DEMO_CLINIC_ID = 'clinic_cityhealth_001';

export const demoClinicBusiness: Business = {
  id: DEMO_CLINIC_ID,
  name: 'City Health Clinic',
  type: 'Neighbourhood Clinic',
  address: '42 1st Main, 7th Cross, Indiranagar, Bengaluru, Karnataka 560038',
  phone: '+91 98765 43210',
  emergency_phone: '+91 98765 99999',
  timezone: 'Asia/Kolkata',
  languages: ['en', 'hi', 'kn'],
  tone: 'polite, professional, reassuring and concise',
  created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
};

export const demoClinicKBContent: KnowledgeBaseContent = {
  facts: {
    name: 'City Health Clinic',
    type: 'Family health and paediatric outpatient clinic',
    address: '42 1st Main, 7th Cross, Indiranagar, Bengaluru, Karnataka 560038',
    landmark: 'Opposite BDA Complex, 200m from Indiranagar Metro Station (Metro Pillar 142)',
    phone: '+91 98765 43210',
    emergency_phone: '+91 98765 99999',
    hours: {
      Monday: '09:00 AM - 01:00 PM, 04:00 PM - 08:00 PM',
      Tuesday: '09:00 AM - 01:00 PM, 04:00 PM - 08:00 PM',
      Wednesday: '09:00 AM - 01:00 PM, 04:00 PM - 08:00 PM',
      Thursday: '09:00 AM - 01:00 PM, 04:00 PM - 08:00 PM',
      Friday: '09:00 AM - 01:00 PM, 04:00 PM - 08:00 PM',
      Saturday: '09:00 AM - 01:00 PM, 04:00 PM - 08:00 PM',
      Sunday: 'Closed for routine OPD. Emergencies on-call at +91 98765 99999',
    },
    consulting_doctors: [
      'Dr. Sneha Rao (Senior General Physician, MBBS, MD - Internal Medicine)',
      'Dr. Arvind Kumar (Consultant Paediatrician, MBBS, DCH)',
    ],
    specialties: ['General Medicine', 'Paediatrics & Child Health', 'Preventive Health', 'Vaccinations'],
    payment_methods: 'Cash, UPI (GPay/PhonePe/Paytm), and all major Credit/Debit cards.',
    parking: 'Dedicated two-wheeler parking in front; street four-wheeler parking available along 7th Cross.',
  },
  services: [
    {
      id: 'srv_gen_consult',
      name: 'General Physician Consultation',
      duration_mins: 30,
      price: 500,
      description: 'Comprehensive evaluation for adults and teens by Dr. Sneha Rao.',
    },
    {
      id: 'srv_paed_consult',
      name: 'Paediatric Consultation',
      duration_mins: 30,
      price: 600,
      description: 'Child health, infant nutrition, developmental evaluation by Dr. Arvind Kumar.',
    },
    {
      id: 'srv_health_check',
      name: 'Basic Health & Vital Screening',
      duration_mins: 20,
      price: 350,
      description: 'Blood pressure, random blood glucose, pulse oximetry, BMI, and vital review.',
    },
    {
      id: 'srv_vaccination',
      name: 'Vaccination & Immunisation Service',
      duration_mins: 15,
      price: 250,
      description: 'Administration of childhood and adult vaccines (cost of vaccine separate).',
    },
  ],
  faqs: [
    {
      id: 'faq_hours',
      question: 'What are the clinic timings?',
      answer:
        'The clinic is open Monday to Saturday from 09:00 AM to 01:00 PM (Morning OPD) and 04:00 PM to 08:00 PM (Evening OPD). Sunday is closed for routine appointments.',
      category: 'timings',
      keywords: ['hours', 'timings', 'time', 'open', 'close', 'sunday', 'morning', 'evening'],
    },
    {
      id: 'faq_location',
      question: 'Where is the clinic located?',
      answer:
        'We are at 42 1st Main, 7th Cross, Indiranagar, Bengaluru 560038, opposite the BDA Complex and 200m from Indiranagar Metro Station.',
      category: 'location',
      keywords: ['location', 'address', 'where', 'directions', 'reach', 'landmark', 'metro'],
    },
    {
      id: 'faq_doctors',
      question: 'Which doctors are available at the clinic?',
      answer:
        'Dr. Sneha Rao (General Physician) and Dr. Arvind Kumar (Paediatrician) are available Monday through Saturday during OPD hours.',
      category: 'doctors',
      keywords: ['doctor', 'physician', 'paediatrician', 'specialist', 'dr sneha', 'dr arvind'],
    },
    {
      id: 'faq_fees',
      question: 'What is the consultation fee?',
      answer:
        'General Physician consultation is ₹500, Paediatric consultation is ₹600, Health checkup screening is ₹350, and Vaccination administration is ₹250.',
      category: 'fees',
      keywords: ['fee', 'fees', 'charges', 'cost', 'price', 'rate'],
    },
    {
      id: 'faq_booking',
      question: 'How do I book an appointment?',
      answer:
        'You can book directly right here in this chat! Just let me know the service you need, your preferred day/time, and your name and phone number.',
      category: 'booking',
      keywords: ['book', 'appointment', 'slot', 'schedule', 'reserve'],
    },
    {
      id: 'faq_walkin',
      question: 'Do you accept walk-in patients without an appointment?',
      answer:
        'Yes, walk-ins are accepted based on doctor availability, but pre-booked appointments are prioritized to minimize wait times.',
      category: 'policy',
      keywords: ['walkin', 'walk-in', 'without appointment', 'direct visit'],
    },
    {
      id: 'faq_blood_tests',
      question: 'Do you have lab and blood test facilities?',
      answer:
        'Yes, diagnostic sample collection is available every morning between 07:30 AM and 11:00 AM from Monday to Saturday.',
      category: 'services',
      keywords: ['blood test', 'lab', 'sample', 'diagnostics', 'sugar test', 'thyroid test'],
    },
    {
      id: 'faq_emergency',
      question: 'What should I do in case of a medical emergency?',
      answer:
        'For urgent medical attention or emergencies, call our 24/7 on-call emergency line at +91 98765 99999 or proceed immediately to the nearest hospital casualty.',
      category: 'emergency',
      keywords: ['emergency', 'urgent', 'serious', 'casualty', 'immediate'],
    },
    {
      id: 'faq_wheelchair',
      question: 'Is the clinic wheelchair accessible?',
      answer:
        'Yes, the clinic is on the ground floor with wheelchair ramp access and staff available to assist senior citizens and differently-abled patients.',
      category: 'facilities',
      keywords: ['wheelchair', 'ramp', 'accessible', 'handicapped', 'senior citizen'],
    },
    {
      id: 'faq_cancellation',
      question: 'What is your appointment cancellation or rescheduling policy?',
      answer:
        'You may reschedule or cancel your appointment free of charge up to 2 hours before the scheduled time by messaging us here.',
      category: 'policy',
      keywords: ['cancel', 'cancellation', 'reschedule', 'change time', 'postpone'],
    },
  ],
  booking_rules: {
    slot_length_mins: 30,
    capacity_per_slot: 1,
    working_days: [1, 2, 3, 4, 5, 6], // Mon-Sat
    working_hours: {
      start: '09:00',
      end: '20:00',
      break_start: '13:00',
      break_end: '16:00',
    },
    lead_time_hours: 1,
    cancel_lead_hours: 2,
    cancellation_policy: 'Free cancellation or rescheduling up to 2 hours before the appointment.',
  },
  escalation_rules: [
    'Patient expresses complaints regarding doctor or clinic staff conduct',
    'Customer requests custom discounts or price negotiations',
    'Customer describes acute or emergency symptoms (chest pain, breathing difficulty, severe trauma)',
    'Customer explicitly asks to talk to human staff or owner',
    'Queries not answered or covered in knowledge base',
  ],
  never_answer: [
    'Medical diagnosis, diagnostic opinions, or clinical judgments',
    'Prescribing medicines, changing dosages, or recommending pharmaceutical drugs',
    'Treatment advice for acute symptoms or medical emergencies (fever medicine dosage, chest pain advice)',
    'Legal or liability claims',
  ],
  holidays: ['2026-11-01', '2026-12-25', '2026-01-26'],
};

export const demoClinicKBVersion: KnowledgeBaseVersion = {
  id: 'kb_cityhealth_v1',
  business_id: DEMO_CLINIC_ID,
  version: 1,
  content: demoClinicKBContent,
  raw_source_text:
    'City Health Clinic is a neighbourhood family clinic in Indiranagar Bengaluru. Open Mon-Sat 9am-1pm and 4pm-8pm. Closed Sundays. Services: General Physician Consultation (30m, 500), Paediatric Consultation (30m, 600), Vital Screening (20m, 350), Vaccination (15m, 250). Never give medical advice or prescribe medicine.',
  approved_by_owner: true,
  created_at: new Date('2026-10-01T00:00:00Z').toISOString(),
};
