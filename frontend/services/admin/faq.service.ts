import { isMockMode } from '@/lib/api/config';
import { ServiceError } from '@/lib/api/errors';
import { http } from '@/lib/api/http';
import { getMockStore } from '@/lib/mock/store';
import { clone, failIfErrorScenario, mockId, simulateLatency } from '@/lib/mock/runtime';
import { faqSchema, validate, type FaqInput } from '@/lib/validation/admin';
import type { Faq } from '@/types';

/**
 * CMS FAQs (admin). API: GET/POST /admin/faqs, PUT/DELETE /admin/faqs/:id.
 * The public site reads the same records through GET /faqs.
 */

const sortFaqs = (items: Faq[]) =>
  [...items].sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order || a.question.localeCompare(b.question));

// MOCK MODE: in-memory FAQ list seeded from the fixtures; same validation as the API.
const mock = {
  async list(): Promise<Faq[]> {
    await simulateLatency();
    failIfErrorScenario();
    return clone(sortFaqs(getMockStore().faqs));
  },
  async create(input: FaqInput): Promise<Faq> {
    const result = validate(faqSchema, input);
    if (!result.ok) throw new ServiceError('Validation failed', 422, result.errors);
    await simulateLatency();
    const faq: Faq = { id: mockId('faq'), ...result.data };
    getMockStore().faqs.push(faq);
    return clone(faq);
  },
  async update(id: string, input: FaqInput): Promise<Faq> {
    const result = validate(faqSchema, input);
    if (!result.ok) throw new ServiceError('Validation failed', 422, result.errors);
    await simulateLatency();
    const store = getMockStore();
    const index = store.faqs.findIndex((f) => f.id === id);
    if (index === -1) throw new ServiceError('FAQ not found', 404);
    store.faqs[index] = { ...store.faqs[index], ...result.data };
    return clone(store.faqs[index]);
  },
  async remove(id: string): Promise<void> {
    await simulateLatency();
    const store = getMockStore();
    const index = store.faqs.findIndex((f) => f.id === id);
    if (index === -1) throw new ServiceError('FAQ not found', 404);
    store.faqs.splice(index, 1);
  },
};

const api: typeof mock = {
  list: async () => sortFaqs(await http.get<Faq[]>('/admin/faqs')),
  create: (input) => http.post<Faq>('/admin/faqs', input),
  update: (id, input) => http.put<Faq>(`/admin/faqs/${encodeURIComponent(id)}`, input),
  async remove(id) {
    await http.delete<unknown>(`/admin/faqs/${encodeURIComponent(id)}`);
  },
};

export const faqService = isMockMode ? mock : api;
