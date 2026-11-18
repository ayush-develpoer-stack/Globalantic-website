import { Router } from 'express';
import { validate } from '../middleware/validate.middleware';
import { formLimiter, trackLimiter } from '../middleware/rateLimit.middleware';
import {
  contactSchema,
  trainingSchema,
  careerSchema,
  newsletterSchema,
  faqListQuerySchema,
} from '../validators';
import {
  serviceCtrl,
  solutionCtrl,
  industryCtrl,
  portfolioCtrl,
  blogCtrl,
} from '../controllers/content.instances';
import { submitContact, trackClick } from '../controllers/contact.controller';
import { getPublicLandingPage } from '../controllers/cms.controller';
import { trackEventSchema } from '../validators';
import { submitTraining } from '../controllers/training.controller';
import { submitCareer } from '../controllers/career.controller';
import { subscribe } from '../controllers/newsletter.controller';
import {
  getPublicSettings,
  listTechnologies,
  listFaqs,
  listBlogCategories,
} from '../controllers/public.controller';

const router = Router();

// Content
router.get('/services', serviceCtrl.listPublic);
router.get('/services/:slug', serviceCtrl.getPublicBySlug);

router.get('/solutions', solutionCtrl.listPublic);
router.get('/solutions/:slug', solutionCtrl.getPublicBySlug);

router.get('/industries', industryCtrl.listPublic);
router.get('/industries/:slug', industryCtrl.getPublicBySlug);

router.get('/portfolio', portfolioCtrl.listPublic);
router.get('/portfolio/:slug', portfolioCtrl.getPublicBySlug);

router.get('/blog', blogCtrl.listPublic);
router.get('/blog/:slug', blogCtrl.getPublicBySlug);

router.get('/landing-pages/:slug', getPublicLandingPage);

// Reference data
router.get('/settings', getPublicSettings);
router.get('/technologies', listTechnologies);
router.get('/faqs', validate(faqListQuerySchema, 'query'), listFaqs);
router.get('/blog-categories', listBlogCategories);

// Lead capture (rate-limited)
router.post('/contact', formLimiter, validate(contactSchema), submitContact);
router.post('/track', trackLimiter, validate(trackEventSchema), trackClick);
router.post('/training/apply', formLimiter, validate(trainingSchema), submitTraining);
router.post('/careers/apply', formLimiter, validate(careerSchema), submitCareer);
router.post('/newsletter', formLimiter, validate(newsletterSchema), subscribe);

export default router;
