import { isMockMode } from '@/lib/api/config';
import { ServiceError } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { getMockStore } from '@/lib/mock/store';
import { clone, failIfErrorScenario, simulateLatency } from '@/lib/mock/runtime';
import { settingsSchema, validate, type SettingsInput } from '@/lib/validation/admin';
import type { AdminSettings } from '@/types';

/** Site-wide settings (single record). */

const emptyToNull = (v: string | undefined) => (v === undefined || v === '' ? null : v);

// MOCK MODE: one in-memory settings record.
const mock = {
  async get(): Promise<AdminSettings> {
    await simulateLatency();
    failIfErrorScenario();
    return clone(getMockStore().settings);
  },
  async update(input: SettingsInput): Promise<AdminSettings> {
    const result = validate(settingsSchema, input);
    if (!result.ok) throw new ServiceError('Validation failed', 422, result.errors);
    await simulateLatency();
    const d = result.data;
    const store = getMockStore();
    store.settings = {
      ...store.settings,
      ...d,
      logoUrl: emptyToNull(d.logoUrl),
      phone: d.phone ?? '',
      whatsapp: d.whatsapp ?? '',
      address: d.address ?? '',
      facebookUrl: emptyToNull(d.facebookUrl),
      instagramUrl: emptyToNull(d.instagramUrl),
      linkedinUrl: emptyToNull(d.linkedinUrl),
      twitterUrl: emptyToNull(d.twitterUrl),
      youtubeUrl: emptyToNull(d.youtubeUrl),
      footerDescription: d.footerDescription ?? '',
      defaultSeoDesc: d.defaultSeoDesc ?? '',
      mapUrl: emptyToNull(d.mapUrl),
      mapEmbedUrl: emptyToNull(d.mapEmbedUrl),
      updatedAt: new Date().toISOString(),
    };
    return clone(store.settings);
  },
};

const api: typeof mock = {
  get: () => http.get<AdminSettings>('/admin/settings'),
  update: (input) => http.put<AdminSettings>('/admin/settings', input),
};

export const settingsService = isMockMode ? mock : api;
