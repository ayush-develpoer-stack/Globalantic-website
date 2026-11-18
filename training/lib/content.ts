/**
 * Static explanatory copy (process and policy only). Course, batch, fee and
 * referral numbers are never written here — they always come from the API.
 */

export const ADMISSION_STEPS = [
  { title: 'Choose a course', text: 'Browse courses and read the syllabus, eligibility and fee.' },
  { title: 'Pick a batch', text: 'Select a batch whose dates, timings and mode suit you.' },
  { title: 'Create your account', text: 'Register and verify your email address.' },
  { title: 'Apply', text: 'Submit a short application for the batch you selected.' },
  { title: 'Approval', text: 'Our admissions team reviews your application and notifies you.' },
  { title: 'Pay the fee', text: 'Pay securely online. A receipt is issued once the payment is verified.' },
  { title: 'Start learning', text: 'Your enrollment is confirmed and the student portal unlocks.' },
] as const;

export const FAQS: { q: string; a: string }[] = [
  {
    q: 'Who can apply?',
    a: 'Each course lists its own eligibility on the course page. Read it before applying; the admissions team checks it during review.',
  },
  {
    q: 'Are classes online or offline?',
    a: 'Each batch is marked Online, Offline or Hybrid. Offline and hybrid batches show the venue on the batch page.',
  },
  {
    q: 'When do I pay the fee?',
    a: 'Only after your application is approved. The amount payable is shown on the course and batch pages, and the server always uses the fee stored for that batch.',
  },
  {
    q: 'How do I pay?',
    a: 'Online through Razorpay (UPI, cards, net banking and wallets, depending on what Razorpay offers you). Your enrollment is confirmed only after the payment is verified on our servers.',
  },
  {
    q: 'Will I get a receipt?',
    a: 'Yes. A receipt is generated automatically after a verified payment and is available in the student portal.',
  },
  {
    q: 'Can I apply to more than one batch of the same course?',
    a: 'No. You can hold one active application per course. You can withdraw an application before paying and apply again.',
  },
  {
    q: 'Do I get a certificate?',
    a: 'A certificate is issued when you complete the course, meet the attendance requirement shown on the course page and pass any final assessment. Every certificate can be verified online.',
  },
  {
    q: 'How does the referral programme work?',
    a: 'Enrolled students get a personal referral link. When someone registers through it and completes a verified admission payment, the referrer earns a reward after the refund window. See the referral page for the current amount and rules.',
  },
];
