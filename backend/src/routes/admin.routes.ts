import { Router } from 'express';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  serviceSchema,
  solutionSchema,
  industrySchema,
  portfolioSchema,
  blogSchema,
  blogCategorySchema,
  landingPageSchema,
  settingsSchema,
  contactStatusSchema,
  trainingStatusSchema,
  careerStatusSchema,
  contactListQuerySchema,
  trainingListQuerySchema,
  careerListQuerySchema,
  faqSchema,
  faqUpdateSchema,
  faqIdParam,
  faqListQuerySchema,
} from '../validators';
import {
  serviceCtrl,
  solutionCtrl,
  industryCtrl,
  portfolioCtrl,
  blogCtrl,
} from '../controllers/content.instances';
import { dashboardStats } from '../controllers/admin.controller';
import { getSettings, updateSettings } from '../controllers/settings.controller';
import {
  listContacts,
  updateContactStatus,
  deleteContact,
} from '../controllers/contact.controller';
import {
  listTraining,
  updateTrainingStatus,
  deleteTraining,
} from '../controllers/training.controller';
import {
  listCareers,
  updateCareerStatus,
  deleteCareer,
} from '../controllers/career.controller';
import { listSubscribers, deleteSubscriber } from '../controllers/newsletter.controller';
import { createFaq, deleteFaq, listFaqsAdmin, updateFaq } from '../controllers/faq.controller';
import type { AnyZodObject } from 'zod';
import * as cms from '../controllers/cms.controller';

const router = Router();

// Everything under /admin requires a signed-in user. Website content (CMS) needs cms.manage
// (ADMIN and EDITOR); leads, applications, newsletter and site settings stay ADMIN-only.
router.use(requireAuth);
const cmsOnly = requirePermission('cms.manage');
// Editorial approval: editors (cms.manage) write drafts; going live, taking down or archiving needs cms.publish (ADMIN, or a granted user).
const publisherOnly = requirePermission('cms.manage', 'cms.publish');

type ContentController = typeof serviceCtrl;

/** Registers standard list/get/create/update/delete routes for a content type. */
function registerCrud(path: string, ctrl: ContentController, schema: AnyZodObject, archivable = false) {
  router.get(`/${path}`, cmsOnly, ctrl.listAll);
  router.get(`/${path}/slug-available`, cmsOnly, ctrl.slugAvailable);
  router.get(`/${path}/:id`, cmsOnly, ctrl.getOne);
  router.post(`/${path}`, cmsOnly, validate(schema), ctrl.create);
  router.put(`/${path}/:id`, cmsOnly, validate(schema.partial()), ctrl.update);
  router.patch(`/${path}/:id/publish`, publisherOnly, ctrl.publish);
  router.patch(`/${path}/:id/unpublish`, publisherOnly, ctrl.unpublish);
  if (archivable) {
    router.patch(`/${path}/:id/archive`, publisherOnly, ctrl.archive);
    router.patch(`/${path}/:id/restore`, publisherOnly, ctrl.restore);
  }
  router.delete(`/${path}/:id`, cmsOnly, ctrl.remove);
}

registerCrud('services', serviceCtrl, serviceSchema);
registerCrud('solutions', solutionCtrl, solutionSchema);
registerCrud('industries', industryCtrl, industrySchema);
registerCrud('portfolio', portfolioCtrl, portfolioSchema, true);
registerCrud('blog', blogCtrl, blogSchema, true);

// Blog categories
router.get('/blog-categories', cmsOnly, cms.listCategories);
router.post('/blog-categories', cmsOnly, validate(blogCategorySchema), cms.createCategory);
router.put('/blog-categories/:id', cmsOnly, validate(faqIdParam, 'params'), validate(blogCategorySchema), cms.updateCategory);
router.delete('/blog-categories/:id', cmsOnly, validate(faqIdParam, 'params'), cms.deleteCategory);

// Campaign landing pages (/lp/[slug])
router.get('/landing-pages', cmsOnly, cms.listLandingPages);
router.get('/landing-pages/:id', cmsOnly, validate(faqIdParam, 'params'), cms.getLandingPage);
router.post('/landing-pages', cmsOnly, validate(landingPageSchema), cms.createLandingPage);
router.put('/landing-pages/:id', cmsOnly, validate(faqIdParam, 'params'), validate(landingPageSchema.partial()), cms.updateLandingPage);
router.patch('/landing-pages/:id/archive', publisherOnly, validate(faqIdParam, 'params'), cms.archiveLandingPage);
router.delete('/landing-pages/:id', cmsOnly, validate(faqIdParam, 'params'), cms.deleteLandingPage);

// Everything below: ADMIN only (as before).
router.use(requireAdmin);
router.get('/dashboard', dashboardStats);

// Leads
router.get('/contacts', validate(contactListQuerySchema, 'query'), listContacts);
router.put('/contacts/:id', validate(contactStatusSchema), updateContactStatus);
router.delete('/contacts/:id', deleteContact);

router.get('/training', validate(trainingListQuerySchema, 'query'), listTraining);
router.put('/training/:id', validate(trainingStatusSchema), updateTrainingStatus);
router.delete('/training/:id', deleteTraining);

router.get('/careers', validate(careerListQuerySchema, 'query'), listCareers);
router.put('/careers/:id', validate(careerStatusSchema), updateCareerStatus);
router.delete('/careers/:id', deleteCareer);

router.get('/newsletter', listSubscribers);
router.delete('/newsletter/:id', deleteSubscriber);

// FAQs
router.get('/faqs', validate(faqListQuerySchema, 'query'), listFaqsAdmin);
router.post('/faqs', validate(faqSchema), createFaq);
router.put('/faqs/:id', validate(faqIdParam, 'params'), validate(faqUpdateSchema), updateFaq);
router.delete('/faqs/:id', validate(faqIdParam, 'params'), deleteFaq);

// Settings
router.get('/settings', getSettings);
router.put('/settings', validate(settingsSchema), updateSettings);

export default router;
