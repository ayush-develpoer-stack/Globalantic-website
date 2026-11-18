/** Public configuration only (NEXT_PUBLIC_*). Never put secrets here. */
export const TRAINING_URL = (process.env.NEXT_PUBLIC_TRAINING_URL || (process.env.NODE_ENV === 'production' ? 'https://training.globalantic.com' : 'http://localhost:3001')).replace(/\/+$/, '');
