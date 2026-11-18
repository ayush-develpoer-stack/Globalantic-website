/**
 * Central API client for every Globalantic portal.
 *
 * - The ONLY place portals call `fetch` against the backend.
 * - Sends the httpOnly session cookie (`credentials: 'include'`); tokens are
 *   never stored in JS.
 * - Converts the backend envelope into data or a typed ApiError.
 * - Contains no business rules: amounts, statuses and permissions are decided
 *   by the server.
 */
import type {
  Announcement,
  AttendanceRecord,
  AuthUser,
  CertificateStatusRow,
  CertificateVerification,
  CourseDetail,
  CourseList,
  FieldError,
  Invoice,
  LearningMaterial,
  Notification,
  Paged,
  PaymentOrder,
  Progress,
  PublicBatch,
  ReferralDashboard,
  ReferralProgram,
  StudentApplication,
  StudentAssignment,
  StudentDashboard,
  StudentProfile,
  StudentResult,
  StoredFileMeta,
  FilePurpose,
  SupportRequest,
  TimetableSlot,
  ExamAnswerInput,
  ExamAttemptSummary,
  StudentExam,
  StudentExamAttempt,
  StudentExamResult,
} from '@globalantic/types';

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldError[];
  constructor(message: string, status: number, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** Human-readable message for anything thrown by the client. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Field errors as a { field: message } map for forms. */
export function fieldErrorMap(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError)) return {};
  return Object.fromEntries(err.fieldErrors.map((e) => [e.field, e.message]));
}

type Query = Record<string, string | number | boolean | undefined | null>;
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** Next.js fetch cache hint for server components (public pages). */
  revalidate?: number;
  signal?: AbortSignal;
  /** Forward a Cookie header when calling from a server component. */
  cookie?: string;
  /** Abort after this many ms (default 15000) so a hung API never hangs a page. */
  timeoutMs?: number;
}

export interface Http {
  request<T>(method: Method, path: string, opts?: RequestOptions): Promise<{ data: T; message: string }>;
}

export function createHttp(baseUrl: string): Http {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    async request<T>(method: Method, path: string, opts: RequestOptions = {}) {
      if (!base) {
        // Misconfigured deployment: say so plainly instead of calling a wrong host.
        console.error('[api] NEXT_PUBLIC_API_URL is not set for this build');
        throw new ApiError('The application is not configured to reach the server (NEXT_PUBLIC_API_URL missing).', 0);
      }
      let url = base + path;
      if (opts.query) {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(opts.query)) {
          if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
        }
        const s = qs.toString();
        if (s) url += `?${s}`;
      }
      // Timeout + caller signal, without AbortSignal.any (wider browser support).
      const attempt = async (): Promise<Response> => {
        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, opts.timeoutMs ?? 15_000);
        const onAbort = () => controller.abort();
        opts.signal?.addEventListener('abort', onAbort);
        try {
          return await fetch(url, {
            method,
            credentials: 'include',
            headers: {
              Accept: 'application/json',
              ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
              ...(opts.cookie ? { Cookie: opts.cookie } : {}),
            },
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
            signal: controller.signal,
            ...(opts.revalidate !== undefined ? ({ next: { revalidate: opts.revalidate } } as RequestInit) : { cache: 'no-store' as RequestCache }),
          });
        } catch (err) {
          if (timedOut) throw new ApiError('The server took too long to respond. Please try again.', 0);
          if ((err as Error)?.name === 'AbortError') throw err;
          throw new ApiError('Network error. Please check your connection and try again.', 0);
        } finally {
          clearTimeout(timer);
          opts.signal?.removeEventListener('abort', onAbort);
        }
      };
      // Safe retry: only idempotent GETs, once, on a network failure or a transient 502/503/504.
      // Writes (payments, submissions, ...) are never retried automatically.
      let res: Response;
      if (method === 'GET') {
        const transient = (s: number) => s === 502 || s === 503 || s === 504;
        try {
          res = await attempt();
          if (transient(res.status) && !opts.signal?.aborted) {
            await new Promise((r) => setTimeout(r, 600));
            res = await attempt();
          }
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== 0 || /too long/.test(err.message) || opts.signal?.aborted) throw err;
          await new Promise((r) => setTimeout(r, 600));
          res = await attempt();
        }
      } else {
        res = await attempt();
      }
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; message?: string; data?: T; errors?: { field?: string; message: string }[] }
        | null;
      if (!json) throw new ApiError(res.status === 429 ? 'Too many requests. Please wait a moment.' : 'Unexpected server response.', res.status);
      if (!res.ok || !json.success) {
        const fields = (json.errors ?? []).filter((e): e is FieldError => typeof e.field === 'string');
        throw new ApiError(json.message || 'Request failed.', res.status, fields);
      }
      return { data: json.data as T, message: json.message ?? '' };
    },
  };
}

// Loosely-typed admin/trainer payloads: the UI reads fields it renders.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export function createApi(baseUrl: string) {
  const http = createHttp(baseUrl);
  const get = <T>(p: string, query?: Query, extra?: Omit<RequestOptions, 'query'>) => http.request<T>('GET', p, { query, ...extra }).then((r) => r.data);
  const send = <T>(m: Method, p: string, body?: unknown) => http.request<T>(m, p, { body: body ?? {} });
  const post = <T>(p: string, body?: unknown) => send<T>('POST', p, body).then((r) => r.data);
  const put = <T>(p: string, body?: unknown) => send<T>('PUT', p, body).then((r) => r.data);
  const patch = <T>(p: string, body?: unknown) => send<T>('PATCH', p, body).then((r) => r.data);
  const del = <T>(p: string) => http.request<T>('DELETE', p).then((r) => r.data);
  /** For actions whose server message should be shown to the user. */
  const postMsg = <T>(p: string, body?: unknown) => send<T>('POST', p, body);
  const base = baseUrl.replace(/\/+$/, '');
  const S = '/training/student';
  const T = '/training/trainer';
  const A = '/training/admin';
  const X = '/exams/student';
  const XA = '/exams/admin';
  const PS = '/programs/student';
  const PA = '/programs/admin';
  const D = '/documents';

  return {
    http,

    auth: {
      login: (email: string, password: string) => post<{ user: AuthUser }>('/auth/login', { email, password }),
      logout: () => post<null>('/auth/logout'),
      /** Resolves null when not signed in (401). */
      me: async (opts?: { cookie?: string }) => {
        try {
          return (await http.request<{ user: AuthUser }>('GET', '/auth/me', { cookie: opts?.cookie })).data.user;
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) return null;
          throw err;
        }
      },
      register: (input: { fullName: string; email: string; phone: string; password: string; city?: string; dateOfBirth?: string; referralCode?: string; consent: boolean }) =>
        postMsg<null>('/auth/register', input),
      verifyEmail: (token: string) => postMsg<null>('/auth/verify-email', { token }),
      resendVerification: () => postMsg<null>('/auth/resend-verification'),
      forgotPassword: (email: string) => postMsg<null>('/auth/forgot-password', { email }),
      resetPassword: (token: string, password: string) => postMsg<null>('/auth/reset-password', { token, password }),
      changePassword: (currentPassword: string, newPassword: string) => postMsg<null>('/auth/change-password', { currentPassword, newPassword }),
    },

    catalog: {
      courses: (q: { search?: string; category?: string; mode?: string; level?: string; programType?: string; page?: number; pageSize?: number } = {}, opts?: { revalidate?: number }) =>
        get<CourseList>('/training/courses', q, opts),
      course: (slug: string, opts?: { revalidate?: number }) => get<CourseDetail>(`/training/courses/${encodeURIComponent(slug)}`, undefined, opts),
      batches: (q: { courseId?: string; mode?: string; status?: string; page?: number; pageSize?: number } = {}, opts?: { revalidate?: number }) =>
        get<Paged<PublicBatch>>('/training/batches', q, opts),
      batch: (id: string, opts?: { revalidate?: number }) => get<PublicBatch>(`/training/batches/${encodeURIComponent(id)}`, undefined, opts),
      referralProgram: (opts?: { revalidate?: number }) => get<ReferralProgram>('/training/referrals/program', undefined, opts),
      trackReferralClick: (code: string) => post<{ valid: boolean }>('/training/referrals/click', { code }),
      validateReferral: (code: string) => get<{ valid: boolean }>(`/training/referrals/validate/${encodeURIComponent(code)}`),
      verifyCertificate: (code: string) => get<CertificateVerification>(`/training/certificates/verify/${encodeURIComponent(code)}`),
      /** Existing public enquiry endpoint (stored as a contact lead). */
      enquiry: (input: { name: string; email: string; phone?: string; message: string; service?: string }) =>
        postMsg<{ id: string }>('/contact', { ...input, service: input.service ?? 'Training enquiry' }),
    },

    student: {
      dashboard: () => get<StudentDashboard>(`${S}/dashboard`),
      profile: () => get<StudentProfile>(`${S}/profile`),
      updateProfile: (input: Partial<{ name: string; city: string; dateOfBirth: string; qualification: string; institution: string; graduationYear: number }>) =>
        put<StudentProfile>(`${S}/profile`, input),
      applications: () => get<StudentApplication[]>(`${S}/applications`),
      application: (id: string) => get<StudentApplication>(`${S}/applications/${id}`),
      apply: (input: { batchId: string; qualification: string; institution?: string; graduationYear?: number; statement?: string; referralCode?: string; documentFileId?: string }) =>
        post<StudentApplication>(`${S}/applications`, input),
      respondToInfoRequest: (id: string, input: { message: string; documentFileId?: string }) => post<StudentApplication>(S + '/applications/' + id + '/respond', input),
      withdraw: (id: string) => post<{ id: string; status: string }>(`${S}/applications/${id}/withdraw`),
      enrollments: () => get<Row[]>(`${S}/enrollments`),
      enrollment: (id: string) => get<Row & { progress: Progress }>(`${S}/enrollments/${id}`),
      attendance: (enrollmentId: string) => get<{ percent: number | null; counts: Record<string, number>; records: AttendanceRecord[] }>(`${S}/enrollments/${enrollmentId}/attendance`),
      timetable: () => get<TimetableSlot[]>(`${S}/timetable`),
      materials: () => get<LearningMaterial[]>(`${S}/materials`),
      assignments: () => get<StudentAssignment[]>(`${S}/assignments`),
      assignment: (id: string) => get<StudentAssignment>(`${S}/assignments/${id}`),
      submit: (id: string, input: { content?: string; linkUrl?: string; fileId?: string }) => post<{ id: string; status: string; submittedAt: string }>(`${S}/assignments/${id}/submission`, input),
      assessments: () => get<Row[]>(`${S}/assessments`),
      results: () => get<StudentResult[]>(`${S}/results`),
      feedback: () => get<Row[]>(`${S}/feedback`),
      announcements: () => get<Announcement[]>(`${S}/announcements`),
      notifications: (q: { unread?: boolean; page?: number; pageSize?: number } = {}) =>
        get<{ items: Notification[]; total: number; unread: number }>(`${S}/notifications`, { ...q, unread: q.unread ? 'true' : undefined }),
      markNotificationsRead: (ids: string[] | 'all') => post<{ updated: number }>(`${S}/notifications/read`, { ids }),
      createOrder: (applicationId: string) => post<PaymentOrder>(`${S}/payments/order`, { applicationId }),
      verifyPayment: (input: { orderId: string; paymentId: string; signature: string }) => post<{ status: string; paymentId: string }>(`${S}/payments/verify`, input),
      reportPaymentFailure: (orderId: string, reason: string) => post<{ status: string }>(`${S}/payments/failure`, { orderId, reason }),
      payments: () => get<Row[]>(`${S}/payments`),
      invoices: () => get<Invoice[]>(`${S}/invoices`),
      invoice: (id: string) => get<Invoice>(`${S}/invoices/${id}`),
      /** Receipt PDF (own receipts only; the browser sends the session cookie). */
      invoicePdfUrl: (id: string) => `${base}${S}/invoices/${encodeURIComponent(id)}/pdf`,
      certificates: () => get<CertificateStatusRow[]>(`${S}/certificates`),
      certificate: (id: string) => get<Row>(`${S}/certificates/${id}`),
      supportRequests: () => get<SupportRequest[]>(`${S}/support`),
      createSupportRequest: (input: { subject: string; message: string }) => post<SupportRequest>(`${S}/support`, input),
      referrals: () => get<ReferralDashboard>(`${S}/referrals`),
    },

    trainer: {
      dashboard: () => get<Row>(`${T}/dashboard`),
      batch: (batchId: string) => get<Row>(`${T}/batches/${batchId}`),
      roster: (batchId: string) => get<Row[]>(`${T}/batches/${batchId}/students`),
      report: (batchId: string) => get<Row>(`${T}/batches/${batchId}/report`),
      attendance: (batchId: string, date: string) => get<Row[]>(`${T}/batches/${batchId}/attendance`, { date }),
      attendanceHistory: (batchId: string) => get<{ date: string; counts: Record<string, number> }[]>(`${T}/batches/${batchId}/attendance/history`),
      markAttendance: (batchId: string, input: { date: string; records: { enrollmentId: string; status: string; remarks?: string }[] }) =>
        put<{ date: string; created: number; updated: number }>(`${T}/batches/${batchId}/attendance`, input),
      assignments: (batchId: string) => get<Row[]>(`${T}/batches/${batchId}/assignments`),
      createAssignment: (batchId: string, input: Row) => post<Row>(`${T}/batches/${batchId}/assignments`, input),
      assignment: (id: string) => get<Row>(`${T}/assignments/${id}`),
      updateAssignment: (id: string, input: Row) => put<Row>(`${T}/assignments/${id}`, input),
      grade: (submissionId: string, input: { marks: number; feedback?: string; returnForResubmission?: boolean }) => post<Row>(`${T}/submissions/${submissionId}/grade`, input),
      materials: (batchId: string) => get<LearningMaterial[]>(`${T}/batches/${batchId}/materials`),
      /** A link (url) or an uploaded file (fileId from files.upload(…, 'LEARNING_MATERIAL')). */
      addMaterial: (batchId: string, input: { title: string; description?: string; type: string; url?: string; fileId?: string }) => post<LearningMaterial>(`${T}/batches/${batchId}/materials`, input),
      removeMaterial: (id: string) => del<{ id: string }>(`${T}/materials/${id}`),
      announcements: (batchId: string) => get<Announcement[]>(`${T}/batches/${batchId}/announcements`),
      postAnnouncement: (batchId: string, input: { title: string; body: string }) => post<Announcement>(`${T}/batches/${batchId}/announcements`, input),
      assessments: (batchId: string) => get<Row[]>(`${T}/batches/${batchId}/assessments`),
      createAssessment: (batchId: string, input: Row) => post<Row>(`${T}/batches/${batchId}/assessments`, input),
      results: (assessmentId: string) => get<Row>(`${T}/assessments/${assessmentId}/results`),
      saveResults: (assessmentId: string, rows: { enrollmentId: string; marks: number; remarks?: string }[]) => put<{ saved: number }>(`${T}/assessments/${assessmentId}/results`, { rows }),
      publishResults: (assessmentId: string) => post<Row>(`${T}/assessments/${assessmentId}/publish`),
      progress: (enrollmentId: string) => get<Row>(`${T}/enrollments/${enrollmentId}/progress`),
      feedback: (enrollmentId: string, input: { content: string; rating?: number }) => post<Row>(`${T}/enrollments/${enrollmentId}/feedback`, input),
    },

    admin: {
      permissions: () => get<{ role: string; permissions: string[] }>(`${A}/me/permissions`),
      dashboard: () => get<Row>(`${A}/dashboard`),
      courses: (q: Query = {}) => get<Paged<Row>>(`${A}/courses`, q),
      course: (id: string) => get<Row>(`${A}/courses/${id}`),
      createCourse: (input: Row) => post<Row>(`${A}/courses`, input),
      updateCourse: (id: string, input: Row) => put<Row>(`${A}/courses/${id}`, input),
      setCourseStatus: (id: string, status: string) => patch<Row>(`${A}/courses/${id}/status`, { status }),
      setModules: (id: string, modules: Row[]) => put<Row[]>(`${A}/courses/${id}/modules`, { modules }),
      batches: (q: Query = {}) => get<Paged<Row>>(`${A}/batches`, q),
      batch: (id: string) => get<Row>(`${A}/batches/${id}`),
      createBatch: (input: Row) => post<Row>(`${A}/batches`, input),
      updateBatch: (id: string, input: Row) => put<Row>(`${A}/batches/${id}`, input),
      setBatchStatus: (id: string, status: string, reason?: string) => patch<Row>(`${A}/batches/${id}/status`, { status, reason }),
      setSchedules: (id: string, schedules: Row[]) => put<Row[]>(`${A}/batches/${id}/schedules`, { schedules }),
      assignTrainer: (id: string, trainerId: string, role: 'LEAD' | 'ASSISTANT') => post<Row>(`${A}/batches/${id}/trainers`, { trainerId, role }),
      removeTrainer: (id: string, trainerId: string) => del<Row>(`${A}/batches/${id}/trainers/${trainerId}`),
      batchReport: (id: string) => get<Row>(`${A}/batches/${id}/report`),
      trainers: () => get<Row[]>(`${A}/trainers`),
      staff: () => get<Row[]>(`${A}/staff`),
      createStaff: (input: { name: string; email: string; phone?: string; role: 'TRAINER' | 'FINANCE' | 'EDITOR' }) => post<Row>(`${A}/staff`, input),
      setUserStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED', reason: string) => patch<Row>(`${A}/users/${id}/status`, { status, reason }),
      applications: (q: Query = {}) => get<Paged<Row> & { statusCounts: Record<string, number> }>(`${A}/applications`, q),
      application: (id: string) => get<Row>(`${A}/applications/${id}`),
      reviewApplication: (id: string, action: 'UNDER_REVIEW' | 'APPROVE' | 'REJECT' | 'REQUEST_INFO', reason?: string) => post<Row>(`${A}/applications/${id}/review`, { action, reason }),
      verifyDocuments: (id: string) => post<Row>(`${A}/applications/${id}/verify-documents`),
      confirmEnrollment: (id: string) => post<Row>(`${A}/applications/${id}/confirm-enrollment`),
      transfer: (id: string, batchId: string, reason: string) => post<Row>(`${A}/applications/${id}/transfer`, { batchId, reason }),
      recordOfflinePayment: (id: string, input: { method: string; reference: string; reason: string }) => post<Row>(`${A}/applications/${id}/offline-payment`, input),
      students: (q: Query = {}) => get<Paged<Row>>(`${A}/students`, q),
      student: (id: string) => get<Row>(`${A}/students/${id}`),
      updateStudent: (id: string, input: Row & { reason: string }) => put<Row>(`${A}/students/${id}`, input),
      setEnrollmentStatus: (id: string, status: string, reason: string) => patch<Row>(`${A}/enrollments/${id}/status`, { status, reason }),
      enrollmentAttendance: (id: string) => get<Row>(`${A}/enrollments/${id}/attendance`),
      certificateEligibility: (enrollmentId: string) => get<Row>(`${A}/enrollments/${enrollmentId}/certificate-eligibility`),
      issueCertificate: (enrollmentId: string) => post<Row>(`${A}/enrollments/${enrollmentId}/certificate`),
      certificates: (q: Query = {}) => get<Paged<Row>>(`${A}/certificates`, q),
      revokeCertificate: (id: string, reason: string) => post<Row>(`${A}/certificates/${id}/revoke`, { reason }),
      payments: (q: Query = {}) => get<Paged<Row> & { totals: Record<string, { count: number; amountPaise: number }> }>(`${A}/payments`, q),
      payment: (id: string) => get<Row>(`${A}/payments/${id}`),
      reconcilePayment: (id: string) => post<Row>(`${A}/payments/${id}/reconcile`),
      recordRefund: (id: string, reason: string) => post<Row>(`${A}/payments/${id}/refund-record`, { reason }),
      paymentReceiptUrl: (id: string) => `${base}${A}/payments/${encodeURIComponent(id)}/receipt.pdf`,
      resendReceipt: (id: string) => post<{ status: 'SENT' | 'FAILED' | 'SKIPPED'; error?: string }>(`${A}/payments/${id}/receipt/resend`),
      postAnnouncement: (input: { title: string; body: string; batchId?: string }) => post<Row>(`${A}/announcements`, input),
      support: (q: Query = {}) => get<Paged<Row>>(`${A}/support`, q),
      respondSupport: (id: string, input: { status: string; response?: string }) => put<Row>(`${A}/support/${id}`, input),
      referralOverview: () => get<Row>(`${A}/referrals/overview`),
      referralSettings: () => get<Row>(`${A}/referrals/settings`),
      updateReferralSettings: (input: Row & { reason: string }) => put<Row>(`${A}/referrals/settings`, input),
      referralRegistrations: (q: Query = {}) => get<Paged<Row>>(`${A}/referrals/registrations`, q),
      referralRewards: (q: Query = {}) => get<Paged<Row>>(`${A}/referrals/rewards`, q),
      reviewReward: (id: string, decision: 'APPROVE' | 'REJECT' | 'UNDER_REVIEW', reason?: string) => post<Row>(`${A}/referrals/rewards/${id}/review`, { decision, reason }),
      recordPayout: (id: string, input: { method: string; reference: string; notes?: string }) => post<Row>(`${A}/referrals/rewards/${id}/payout`, input),
      fraudReviews: (q: Query = {}) => get<Paged<Row>>(`${A}/referrals/fraud-reviews`, q),
      resolveFraud: (id: string, outcome: 'CLEARED' | 'CONFIRMED', notes: string) => post<Row>(`${A}/referrals/fraud-reviews/${id}/resolve`, { outcome, notes }),
      setReferralCodeStatus: (id: string, status: 'ACTIVE' | 'DISABLED', reason: string) => patch<Row>(`${A}/referrals/codes/${id}/status`, { status, reason }),
      referralCodes: (q: Query = {}) => get<Paged<Row>>(A + '/referrals/codes', q),
      referralAudit: (q: Query = {}) => get<Paged<Row>>(`${A}/referrals/audit`, q),
      audit: (q: Query = {}) => get<Paged<Row>>(`${A}/audit`, q),
    },

    /**
     * Admin notification centre (staff). Live updates: open an EventSource on streamUrl()
     * with { withCredentials: true }; poll unreadCount() when a stream cannot stay open.
     */
    notifications: {
      list: (q: { category?: string; severity?: string; unread?: 'true' | 'false'; page?: number; pageSize?: number } = {}) =>
        get<Paged<AdminNotification> & { unread: number }>('/notifications', q),
      unreadCount: () => get<{ unread: number }>('/notifications/unread-count'),
      markRead: (ids: string[] | 'all') => post<{ updated: number }>('/notifications/read', { ids }),
      settings: () => get<NotificationSettingsView>('/notifications/settings'),
      saveSettings: (input: Partial<Pick<NotificationSettingsView, 'recipients' | 'emailEnabled' | 'emailMinSeverity' | 'mutedCategories' | 'retentionDays'>>) =>
        put<NotificationSettingsView>('/notifications/settings', input),
      deliveries: () => get<Row[]>('/notifications/deliveries'),
      /** Absolute SSE URL (the session cookie authenticates it). */
      streamUrl: () => (base ? `${base}/notifications/stream` : ''),
    },

    /** Private files. Upload sends the raw bytes; the server detects the real type. */
    files: {
      upload: async (file: Blob & { name?: string }, purpose: FilePurpose): Promise<StoredFileMeta> => {
        if (!base) throw new ApiError('The application is not configured to reach the server (NEXT_PUBLIC_API_URL missing).', 0);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60_000); // longer window for uploads; never retried
        let res: Response;
        try {
          res = await fetch(`${base}/files?purpose=${encodeURIComponent(purpose)}`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name ?? 'file'), Accept: 'application/json' },
            body: file,
            signal: controller.signal,
          });
        } catch {
          throw new ApiError(controller.signal.aborted ? 'The upload took too long. Please try again.' : 'Network error while uploading. Please try again.', 0);
        } finally {
          clearTimeout(timer);
        }
        const json = (await res.json().catch(() => null)) as
          | { success: boolean; message?: string; data?: StoredFileMeta; errors?: { field?: string; message: string }[] }
          | null;
        if (!json || !res.ok || !json.success || !json.data) {
          const fields = (json?.errors ?? []).filter((e): e is FieldError => typeof e.field === 'string');
          throw new ApiError(json?.message || (res.status === 413 ? 'The file is too large (max 5 MB).' : 'Upload failed.'), res.status, fields);
        }
        return json.data;
      },
      /** Authenticated download link (the browser sends the session cookie). */
      url: (id: string) => `${base}/files/${encodeURIComponent(id)}`,
    },

    employee: {
      dashboard: () => get<Row>('/employee/dashboard'),
      profile: () => get<Row>('/employee/profile'),
      updateProfile: (input: { emergencyContactName?: string | null; emergencyContactPhone?: string | null }) => put<Row>('/employee/profile', input),
      attendance: (month?: string) => get<{ records: Row[]; counts: Record<string, number> }>('/employee/attendance', { month }),
      checkIn: (status: 'PRESENT' | 'WORK_FROM_HOME' = 'PRESENT', notes?: string) => post<Row>('/employee/attendance/check-in', { status, notes }),
      checkOut: () => post<Row>('/employee/attendance/check-out'),
      leaves: () => get<Row[]>('/employee/leave'),
      applyLeave: (input: { type: string; startDate: string; endDate: string; reason: string }) => post<Row>('/employee/leave', input),
      cancelLeave: (id: string) => post<Row>(`/employee/leave/${id}/cancel`),
      projects: () => get<Row[]>('/employee/projects'),
      project: (id: string) => get<Row>(`/employee/projects/${id}`),
      tasks: (status?: string) => get<Row[]>('/employee/tasks', { status }),
      setTaskStatus: (id: string, status: string) => patch<Row>(`/employee/tasks/${id}/status`, { status }),
      workUpdates: () => get<Row[]>('/employee/work-updates'),
      addWorkUpdate: (input: { date: string; summary: string; minutes?: number; projectId?: string; taskId?: string }) => post<Row>('/employee/work-updates', input),
      documents: () => get<(Row & { file: StoredFileMeta })[]>('/employee/documents'),
      hrRequests: () => get<Row[]>('/employee/hr-requests'),
      createHrRequest: (input: { category: string; subject: string; message: string }) => post<Row>('/employee/hr-requests', input),
      announcements: () => get<Row[]>('/employee/announcements'),
    },

    hr: {
      employees: (q: Query = {}) => get<Paged<Row> & { departments: string[] }>('/hr/employees', q),
      employee: (id: string) => get<Row>(`/hr/employees/${id}`),
      createEmployee: (input: Row) => post<Row>('/hr/employees', input),
      updateEmployee: (id: string, input: Row & { reason: string }) => put<Row>(`/hr/employees/${id}`, input),
      correctAttendance: (id: string, input: { date: string; status: string; notes?: string | null; reason: string }) => put<Row>(`/hr/employees/${id}/attendance`, input),
      addDocument: (id: string, input: { title: string; category: string; fileId: string; visibleToEmployee: boolean }) => post<Row>(`/hr/employees/${id}/documents`, input),
      updateDocument: (docId: string, input: { visibleToEmployee?: boolean; remove?: boolean; reason: string }) => patch<Row>(`/hr/documents/${docId}`, input),
      leaves: (q: Query = {}) => get<Paged<Row>>('/hr/leave', q),
      reviewLeave: (id: string, decision: 'APPROVE' | 'REJECT', note?: string) => post<Row>(`/hr/leave/${id}/review`, { decision, note }),
      projects: (q: Query = {}) => get<Row[]>('/hr/projects', q),
      project: (id: string) => get<Row>(`/hr/projects/${id}`),
      createProject: (input: Row) => post<Row>('/hr/projects', input),
      updateProject: (id: string, input: Row) => put<Row>(`/hr/projects/${id}`, input),
      addMember: (id: string, userId: string, role?: string) => post<Row>(`/hr/projects/${id}/members`, { userId, role }),
      removeMember: (id: string, userId: string) => del<Row>(`/hr/projects/${id}/members/${userId}`),
      tasks: (q: Query = {}) => get<Paged<Row>>('/hr/tasks', q),
      createTask: (input: Row) => post<Row>('/hr/tasks', input),
      updateTask: (id: string, input: Row) => put<Row>(`/hr/tasks/${id}`, input),
      workUpdates: (q: Query = {}) => get<Paged<Row>>('/hr/work-updates', q),
      requests: (q: Query = {}) => get<Paged<Row>>('/hr/requests', q),
      respondRequest: (id: string, input: { status: string; response?: string }) => put<Row>(`/hr/requests/${id}`, input),
      announcements: () => get<Row[]>('/hr/announcements'),
      postAnnouncement: (input: { title: string; body: string }) => post<Row>('/hr/announcements', input),
      setEmployeeStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED', reason: string) => patch<Row>(`/hr/employees/${id}/status`, { status, reason }),
    },

    /** Legacy CMS FAQ management (ADMIN). */
    platform: {
      /** Permission-aware dashboard counts (sections the caller may not see are omitted). */
      overview: () => get<Row>('/platform/overview'),
      users: (q: Query = {}) => get<Paged<Row> & { roleCounts: Record<string, number> }>('/platform/users', q),
      user: (id: string) => get<Row>(`/platform/users/${id}`),
      updateUser: (id: string, input: { name?: string; phone?: string | null; reason: string }) => put<Row>(`/platform/users/${id}`, input),
      sendPasswordReset: (id: string, input: { revokeSessions: boolean; reason: string }) => post<Row>(`/platform/users/${id}/password-reset`, input),
      changeRole: (id: string, role: string, reason: string) => patch<Row>(`/platform/users/${id}/role`, { role, reason }),
      /** Suspend / reactivate any account the caller may manage (ADMIN accounts need a Super Admin). */
      setStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED', reason: string) => patch<Row>(`/platform/users/${id}/status`, { status, reason }),
      /**
       * Create an account (roles allowed for the caller are flagged `creatable` by roles()).
       * The user sets their own password from the emailed link; `setupLink` is returned only
       * when that email could not be sent.
       */
      createUser: (input: CreateUserInput) =>
        http.request<CreatedUser>('POST', '/platform/users', { body: input }).then((r) => ({ ...r.data, message: r.message })),
      roles: () => get<{ role: string; permissions: string[]; assignable: boolean; creatable: boolean }[]>('/platform/roles'),
      permissions: () => get<{ permission: string; grantable: boolean; reason: string | null; roles: string[] }[]>('/platform/permissions'),
      grantPermission: (id: string, permission: string, reason: string) => post<Row>(`/platform/users/${id}/permissions`, { permission, reason }),
      revokePermission: (id: string, permission: string, reason: string) =>
        http.request<Row>('DELETE', `/platform/users/${id}/permissions/${encodeURIComponent(permission)}`, { query: { reason } }).then((r) => r.data),
      notes: (id: string) => get<Row[]>(`/platform/users/${id}/notes`),
      addNote: (id: string, body: string) => post<Row>(`/platform/users/${id}/notes`, { body }),
      removeNote: (id: string, noteId: string) => del<Row>(`/platform/users/${id}/notes/${noteId}`),
      /** Typed report with server-side date filters; pass export=true when the user downloads it (audited). */
      report: (type: 'admissions' | 'payments' | 'attendance' | 'courses' | 'batches' | 'referrals' | 'students' | 'employees', q: { from?: string; to?: string; export?: boolean } = {}) =>
        get<{ type: string; from: string | null; to: string | null; rows: Row[]; truncated: boolean; limit: number }>(`/platform/reports/${type}`, { from: q.from, to: q.to, export: q.export ? 'true' : undefined }),
      reportSummary: () => get<Row>('/platform/reports/summary'),
    },

    /** Sales CRM (leads.manage). ADMIN sees all leads; other staff see their own and unassigned leads. */
    crm: {
      summary: (q: { from?: string; to?: string } = {}) => get<Row>('/crm/summary', q),
      assignees: () => get<{ id: string; name: string; email: string; role: string }[]>('/crm/assignees'),
      leads: (q: Query = {}) => get<Paged<Row>>('/crm/leads', q),
      lead: (id: string) => get<Row>(`/crm/leads/${id}`),
      update: (id: string, input: Row) => patch<Row>(`/crm/leads/${id}`, input),
      addNote: (id: string, body: string, type: 'NOTE' | 'CONSULTATION' | 'CALL' | 'EMAIL' | 'WHATSAPP' = 'NOTE') => post<Row>(`/crm/leads/${id}/notes`, { body, type }),
      create: (input: Row) => post<Row>('/crm/leads', input),
      /** Rows for a CSV download (audited on the server). */
      exportLeads: (q: Query = {}) => get<{ rows: Row[] }>('/crm/leads/export', q),
      rules: () => get<Row[]>('/crm/rules'),
      saveRules: (rules: { service: string | null; assigneeId: string; active: boolean }[]) => put<Row[]>('/crm/rules', { rules }),
      runReminders: () => post<{ leads: number }>('/crm/reminders/run'),
    },

    /**
     * Website CMS (cms.manage: ADMIN and EDITOR). kind = 'blog' | 'portfolio' | 'services' | 'solutions' | 'industries'.
     * Lists are paginated when page is given; status = draft | published | scheduled | archived (blog, portfolio).
     */
    cms: {
      list: (kind: CmsKind, q: Query = {}) => get<Paged<Row>>(`/admin/${kind}`, { page: 1, ...q }),
      faqs: (category?: string) => get<Row[]>('/admin/faqs', { category }),
      createFaq: (input: { question: string; answer: string; category?: string; order?: number }) => post<Row>('/admin/faqs', input),
      updateFaq: (id: string, input: Partial<{ question: string; answer: string; category: string; order: number }>) => put<Row>(`/admin/faqs/${id}`, input),
      deleteFaq: (id: string) => del<Row>(`/admin/faqs/${id}`),
      get: (kind: CmsKind, id: string) => get<Row>(`/admin/${kind}/${id}`),
      create: (kind: CmsKind, input: Row) => post<Row>(`/admin/${kind}`, input),
      update: (kind: CmsKind, id: string, input: Row) => put<Row>(`/admin/${kind}/${id}`, input),
      publish: (kind: CmsKind, id: string) => patch<Row>(`/admin/${kind}/${id}/publish`),
      unpublish: (kind: CmsKind, id: string) => patch<Row>(`/admin/${kind}/${id}/unpublish`),
      archive: (kind: 'blog' | 'portfolio', id: string) => patch<Row>(`/admin/${kind}/${id}/archive`),
      restore: (kind: 'blog' | 'portfolio', id: string) => patch<Row>(`/admin/${kind}/${id}/restore`),
      remove: (kind: CmsKind, id: string) => del<Row>(`/admin/${kind}/${id}`),
      slugAvailable: (kind: CmsKind, slug: string, excludeId?: string) => get<{ slug: string; available: boolean }>(`/admin/${kind}/slug-available`, { slug, excludeId }),
      categories: () => get<Row[]>('/admin/blog-categories'),
      createCategory: (input: { name: string; slug: string }) => post<Row>('/admin/blog-categories', input),
      updateCategory: (id: string, input: { name: string; slug: string }) => put<Row>(`/admin/blog-categories/${id}`, input),
      deleteCategory: (id: string) => del<Row>(`/admin/blog-categories/${id}`),
      landingPages: () => get<Row[]>('/admin/landing-pages'),
      landingPage: (id: string) => get<Row>(`/admin/landing-pages/${id}`),
      createLandingPage: (input: Row) => post<Row>('/admin/landing-pages', input),
      updateLandingPage: (id: string, input: Row) => put<Row>(`/admin/landing-pages/${id}`, input),
      archiveLandingPage: (id: string) => patch<Row>(`/admin/landing-pages/${id}/archive`),
      deleteLandingPage: (id: string) => del<Row>(`/admin/landing-pages/${id}`),
      /** Site settings (ADMIN only): contact details, socials, Google Maps link/embed. */
      settings: () => get<Row>('/admin/settings'),
      saveSettings: (input: Row) => put<Row>('/admin/settings', input),
      /** Public site base URL for "view on site" links (NEXT_PUBLIC_SITE_URL). */
      siteUrl: () => (process.env.NEXT_PUBLIC_SITE_URL || (process.env.NODE_ENV === 'production' ? 'https://globalantic.com' : 'http://localhost:3000')).replace(/\/+$/, ''),
    },

    /** Certificate program — public catalogue. */
    programs: {
      list: () => get<Row[]>('/programs'),
      get: (slug: string) => get<Row>(`/programs/${encodeURIComponent(slug)}`),
    },

    /** Certificate program — student side. Fees, scores and eligibility are decided by the server. */
    programStudent: {
      register: (slug: string) => postMsg<Row>(`${PS}/register`, { slug }).then((r) => r.data),
      enrollments: () => get<Row[]>(`${PS}/enrollments`),
      enrollment: (id: string) => get<Row>(`${PS}/enrollments/${id}`),
      createOrder: (enrollmentId: string) => post<PaymentOrder>(`${PS}/payments/order`, { enrollmentId }),
      verifyPayment: (input: { orderId: string; paymentId: string; signature: string }) => post<{ status: string; paymentId: string }>(`${PS}/payments/verify`, input),
      reportPaymentFailure: (orderId: string, reason: string) => post<{ status: string }>(`${PS}/payments/failure`, { orderId, reason }),
      lesson: (enrollmentId: string, lessonId: string) => get<Row>(`${PS}/enrollments/${enrollmentId}/lessons/${lessonId}`),
      completeLesson: (enrollmentId: string, lessonId: string) => post<{ completedAt: string }>(`${PS}/enrollments/${enrollmentId}/lessons/${lessonId}/complete`),
      startAttempt: (enrollmentId: string) => post<{ attemptId: string; resumed: boolean; deadlineAt: string; questions: { id: string; prompt: string; options: string[] }[] }>(`${PS}/enrollments/${enrollmentId}/attempts`),
      attempt: (id: string) => get<Row>(`${PS}/attempts/${id}`),
      submitAttempt: (id: string, answers: Record<string, number>) => post<Row>(`${PS}/attempts/${id}/submit`, { answers }),
      certificatePdfUrl: (enrollmentId: string) => `${base}${PS}/enrollments/${encodeURIComponent(enrollmentId)}/certificate.pdf`,
    },

    /** Certificate program — staff side (programs.read / programs.manage). */
    programAdmin: {
      programs: () => get<Row[]>(`${PA}/programs`),
      program: (id: string) => get<Row>(`${PA}/programs/${id}`),
      createProgram: (input: Row) => post<Row>(`${PA}/programs`, input),
      updateProgram: (id: string, input: Row) => patch<Row>(`${PA}/programs/${id}`, input),
      addLesson: (id: string, input: Row) => post<Row>(`${PA}/programs/${id}/lessons`, input),
      updateLesson: (id: string, lessonId: string, input: Row) => put<Row>(`${PA}/programs/${id}/lessons/${lessonId}`, input),
      archiveLesson: (id: string, lessonId: string, archived: boolean) => patch<Row>(`${PA}/programs/${id}/lessons/${lessonId}/archive`, { archived }),
      addQuestion: (id: string, input: Row) => post<Row>(`${PA}/programs/${id}/questions`, input),
      updateQuestion: (id: string, questionId: string, input: Row) => put<Row>(`${PA}/programs/${id}/questions/${questionId}`, input),
      archiveQuestion: (id: string, questionId: string, archived: boolean) => patch<Row>(`${PA}/programs/${id}/questions/${questionId}/archive`, { archived }),
      enrollments: (q: Query = {}) => get<Paged<Row>>(`${PA}/enrollments`, q),
      exportEnrollments: (q: Query = {}) => get<{ rows: Row[] }>(`${PA}/enrollments/export`, q),
      enrollment: (id: string) => get<Row>(`${PA}/enrollments/${id}`),
      grantExtraAttempt: (id: string, reason: string) => post<Row>(`${PA}/enrollments/${id}/extra-attempt`, { reason }),
      cancelEnrollment: (id: string, reason: string) => post<Row>(`${PA}/enrollments/${id}/cancel`, { reason }),
      issueCertificate: (id: string) => post<Row>(`${PA}/enrollments/${id}/certificate`),
      revokeCertificate: (id: string, reason: string) => post<Row>(`${PA}/certificates/${id}/revoke`, { reason }),
      resendCertificate: (id: string) => post<{ status: string; error?: string }>(`${PA}/certificates/${id}/resend`),
      certificatePdfUrl: (id: string) => `${base}${PA}/certificates/${encodeURIComponent(id)}/pdf`,
      report: (q: { programId?: string; from?: string; to?: string } = {}) => get<{ rows: Row[] }>(`${PA}/report`, q),
    },

    /** Business documents (documents.read / manage / finance / settings). Totals are computed by the server. */
    documents: {
      profile: () => get<Row>(`${D}/profile`),
      saveProfile: (input: Row) => put<Row>(`${D}/profile`, input),
      clients: (q: Query = {}) => get<Paged<Row>>(`${D}/clients`, q),
      client: (id: string) => get<Row>(`${D}/clients/${id}`),
      createClient: (input: Row) => post<Row>(`${D}/clients`, input),
      updateClient: (id: string, input: Row) => put<Row>(`${D}/clients/${id}`, input),
      archiveClient: (id: string, archived: boolean) => patch<Row>(`${D}/clients/${id}/archive`, { archived }),
      clientFromLead: (leadId: string) => post<Row>(`${D}/clients/from-lead`, { leadId }),
      templates: (q: Query = {}) => get<Row[]>(`${D}/templates`, q),
      createTemplate: (input: Row) => post<Row>(`${D}/templates`, input),
      updateTemplate: (id: string, input: Row) => put<Row>(`${D}/templates/${id}`, input),
      archiveTemplate: (id: string, archived: boolean) => patch<Row>(`${D}/templates/${id}/archive`, { archived }),
      emailLog: () => get<Row[]>(`${D}/email-log`),
      list: (q: Query = {}) => get<Paged<Row> & { summary: Row[] }>(`${D}`, q),
      get: (id: string) => get<Row>(`${D}/${id}`),
      create: (input: Row) => post<Row>(`${D}`, input),
      update: (id: string, input: Row) => patch<Row>(`${D}/${id}`, input),
      remove: (id: string) => del<Row>(`${D}/${id}`),
      /** Inline PDF (a draft preview carries a DRAFT watermark). */
      pdfUrl: (id: string, download = false) => `${base}${D}/${encodeURIComponent(id)}/pdf${download ? '?download=1' : ''}`,
      signedCopyUrl: (id: string) => `${base}${D}/${encodeURIComponent(id)}/signed-copy`,
      issue: (id: string) => post<Row>(`${D}/${id}/issue`),
      send: (id: string, input: { to?: string; cc?: string[]; message?: string | null }) => postMsg<{ delivery: 'SENT' | 'FAILED' | 'SKIPPED'; error?: string }>(`${D}/${id}/send`, input),
      outcome: (id: string, outcome: 'ACCEPTED' | 'DECLINED', note: string) => post<Row>(`${D}/${id}/outcome`, { outcome, note }),
      convert: (id: string, target: 'AGREEMENT' | 'INVOICE') => post<Row>(`${D}/${id}/convert`, { target }),
      revise: (id: string) => post<Row>(`${D}/${id}/revise`),
      recordSigned: (id: string, input: { fileId: string; signedOn: string; note: string }) => post<Row>(`${D}/${id}/signed`, input),
      recordPayment: (id: string, input: { amountPaise: number; method: string; reference: string; paidOn: string; note?: string | null }) => post<Row>(`${D}/${id}/payments`, input),
      void: (id: string, reason: string) => post<Row>(`${D}/${id}/void`, { reason }),
    },

    /** Intern exams — student side. Scores, keys and timing are decided by the server. */
    exams: {
      list: () => get<StudentExam[]>(`${X}/exams`),
      get: (id: string) => get<StudentExam>(`${X}/exams/${id}`),
      start: (id: string) => postMsg<{ attemptId: string; resumed: boolean }>(`${X}/exams/${id}/start`).then((r) => r.data),
      attempts: () => get<(ExamAttemptSummary & { exam: { id: string; title: string; track: string; kind: string } })[]>(`${X}/attempts`),
      attempt: (id: string) => get<StudentExamAttempt>(`${X}/attempts/${id}`),
      /** Autosave with a short timeout: the page retries a slow save, it is never silently dropped. */
      save: (id: string, answers: ExamAnswerInput[], focusLost?: number) =>
        http
          .request<{ savedAt: string; deadlineAt: string; serverNow: string }>('PUT', `${X}/attempts/${id}/answers`, { body: { answers, ...(focusLost ? { focusLost } : {}) }, timeoutMs: 10_000 })
          .then((r) => r.data),
      submit: (id: string, answers?: ExamAnswerInput[]) => post<ExamAttemptSummary>(`${X}/attempts/${id}/submit`, { answers }),
      result: (id: string) => get<StudentExamResult>(`${X}/attempts/${id}/result`),
    },

    /** Intern exams — staff side (exams.manage / exams.evaluate / exams.results.read). */
    examAdmin: {
      questions: (q: Query = {}) => get<Paged<Row>>(`${XA}/questions`, q),
      topics: () => get<{ track: string; topic: string; count: number }[]>(`${XA}/topics`),
      question: (id: string) => get<Row>(`${XA}/questions/${id}`),
      createQuestion: (input: Row) => post<Row>(`${XA}/questions`, input),
      updateQuestion: (id: string, input: Row) => put<Row>(`${XA}/questions/${id}`, input),
      archiveQuestion: (id: string, archived: boolean) => patch<Row>(`${XA}/questions/${id}/archive`, { archived }),
      exams: (q: Query = {}) => get<Paged<Row>>(`${XA}/exams`, q),
      exam: (id: string) => get<Row>(`${XA}/exams/${id}`),
      createExam: (input: Row) => post<Row>(`${XA}/exams`, input),
      updateExam: (id: string, input: Row) => put<Row>(`${XA}/exams/${id}`, input),
      setQuestions: (id: string, questionIds: string[]) => put<{ count: number }>(`${XA}/exams/${id}/questions`, { questionIds }),
      publish: (id: string) => post<Row>(`${XA}/exams/${id}/publish`),
      archive: (id: string) => post<Row>(`${XA}/exams/${id}/archive`),
      releaseResults: (id: string) => post<Row>(`${XA}/exams/${id}/release-results`),
      targets: (search?: string) => get<Row>(`${XA}/targets`, { search }),
      assign: (id: string, input: { target: string; studentId?: string; batchId?: string; courseId?: string; institution?: string }) => post<Row>(`${XA}/exams/${id}/assignments`, input),
      unassign: (id: string, assignmentId: string) => del<Row>(`${XA}/exams/${id}/assignments/${assignmentId}`),
      attempts: (id: string, q: Query = {}) => get<Paged<Row>>(`${XA}/exams/${id}/attempts`, q),
      attempt: (id: string) => get<Row>(`${XA}/attempts/${id}`),
      evaluate: (id: string, input: { marks: { questionId: string; marks: number; comment?: string | null }[]; feedback?: string | null }) => post<Row>(`${XA}/attempts/${id}/evaluate`, input),
      grantRetake: (id: string, studentId: string, reason: string) => post<Row>(`${XA}/exams/${id}/retakes`, { studentId, reason }),
      recordInterview: (id: string, input: { studentId: string; score: number; feedback?: string | null }) => post<Row>(`${XA}/exams/${id}/interview-results`, input),
      report: (id: string) => get<Row>(`${XA}/exams/${id}/report`),
      /** Rows for a CSV download (the server records the export in the audit log). */
      exportResults: (id: string) => get<{ exam: { id: string; title: string }; rows: Row[] }>(`${XA}/exams/${id}/export`),
      studentPerformance: (studentId: string) => get<Row>(`${XA}/students/${studentId}/performance`),
    },
  };
}

export type CmsKind = 'blog' | 'portfolio' | 'services' | 'solutions' | 'industries';

export type NotificationCategory = 'lead' | 'training' | 'admission' | 'program' | 'payment' | 'content' | 'hr' | 'system' | 'general';
export type NotificationSeverity = 'info' | 'important' | 'critical';
export interface AdminNotification {
  id: string;
  type: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  /** Admin-portal path ("/leads/…") or an absolute URL (main-site embedded admin). */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
export interface NotificationSettingsView {
  recipients: string[];
  effectiveRecipients: string[];
  envRecipients: string[];
  emailEnabled: boolean;
  emailMinSeverity: NotificationSeverity;
  mutedCategories: string[];
  retentionDays: number;
  emailProviderConfigured: boolean;
  categories: string[];
  severities: NotificationSeverity[];
  updatedAt: string;
}
export type GlobalanticApi = ReturnType<typeof createApi>;

export interface CreateUserInput {
  name: string;
  email: string;
  phone?: string;
  role: 'ADMIN' | 'EDITOR' | 'FINANCE' | 'TRAINER' | 'HR' | 'EMPLOYEE' | 'SALES' | 'STUDENT';
  employee?: { department: string; designation: string; employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN'; joiningDate: string; managerId?: string | null; workLocation?: string | null };
  student?: { city?: string | null; institution?: string | null; qualification?: string | null };
}
export interface CreatedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  inviteEmail: 'SENT' | 'SKIPPED' | 'FAILED';
  portalUrl: string | null;
  setupLink: string | null;
  message?: string;
}

/** API base URL from NEXT_PUBLIC_API_URL (public value only — never a secret). */
/**
 * API base URL from NEXT_PUBLIC_API_URL. Development falls back to the local API;
 * a production build NEVER falls back to localhost — an unset value returns ''
 * and every request fails with an explicit configuration error instead.
 */
export function apiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (raw) return raw.replace(/\/+$/, '');
  return process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000/api';
}

let shared: GlobalanticApi | null = null;
/** Lazily-created client for the configured API URL. */
export function api(): GlobalanticApi {
  shared ??= createApi(apiBaseUrl());
  return shared;
}
