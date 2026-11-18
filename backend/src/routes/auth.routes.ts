import { Router } from 'express';
import {
  changePasswordHandler,
  forgot,
  login,
  logout,
  me,
  register,
  resend,
  reset,
  verify,
} from '../controllers/auth.controller';
import { validate } from '../middleware/validate.middleware';
import { loginSchema } from '../validators';
import { changePasswordSchema, forgotSchema, registerSchema, resetSchema, tokenSchema } from '../validators/training';
import { requireAuth } from '../middleware/auth.middleware';
import { authFlowLimiter, loginAccountLimiter, loginLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

router.post('/login', loginLimiter, validate(loginSchema), loginAccountLimiter, login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

// Student self-service
router.post('/register', authFlowLimiter, validate(registerSchema), register);
router.post('/verify-email', authFlowLimiter, validate(tokenSchema), verify);
router.post('/resend-verification', authFlowLimiter, requireAuth, resend);
router.post('/forgot-password', authFlowLimiter, validate(forgotSchema), forgot);
router.post('/reset-password', authFlowLimiter, validate(resetSchema), reset);
router.post('/change-password', authFlowLimiter, requireAuth, validate(changePasswordSchema), changePasswordHandler);

export default router;
