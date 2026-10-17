# Certificate Program, Payment Receipts & Business Documents

Written 2026-10-16. Covers migration `20261020090000_certificate_program_and_documents`.

## 1. Certificate program (₹999, separate module)

It has its own tables (`certificate_programs`, `program_lessons`, `program_questions`, `program_enrollments`,
`program_lesson_progress`, `program_attempts`, `program_certificates`) and its own API under `/api/programs`.
Nothing is shared with courses, internships or intern exams, except two things:
- the **payment ledger**: `payments` / `invoices` rows have `programEnrollmentId` instead of `applicationId`, with a CHECK constraint that exactly one is set;
- the **public certificate verification** endpoint.

Flow: register → `PENDING_PAYMENT` → Razorpay order (amount from the enrollment's fee snapshot) →
signature + provider re-fetch, or a signed webhook → `ACTIVE` → lessons → final assessment → certificate → `COMPLETED`.

**Certificate rule.** All three conditions are checked again inside the issuing transaction:
1. a PAID, non-refunded payment for the enrollment;
2. every required lesson completed (each lesson has `minMinutes` between first opening and completion);
3. a submitted assessment attempt with a score of at least `passPercent`. Questions are drawn on the server, answer keys never leave it, and late submissions score 0.

The certificate is issued automatically when the passing attempt is submitted. Payment alone never issues one.
Staff can issue manually only when the same rule holds.

- The fee is set per program by `programs.manage` (ADMIN). A change applies to new registrations only, and every change is audited.
- Refunds before completion set the enrollment to `REFUNDED` and close access. A refund after the certificate was issued notifies admins; the certificate is not revoked automatically.
- Program payments **do not** take part in the referral program.
- The certificate PDF says the certificate is not an academic degree or a government or university accreditation.

## 2. Payment receipts and emails (course fees and program fees)

The verified-payment transaction (`payment.service.markPaidTx`, unchanged as the single path) creates the
`Invoice` (receipt) row. **After commit**:
1. the receipt PDF is rendered from the DB records and stored privately (`StoredFile` purpose `GENERATED_DOCUMENT`, needs `UPLOAD_DIR`);
2. the student gets a confirmation (course/program, amount, transaction reference, date, next steps) with the PDF attached;
3. `ADMIN_EMAIL` gets an alert, and ADMIN users get an in-app notification.

Every email is recorded in `email_logs` (SENT / FAILED / SKIPPED). Staff can resend from the payment screen.
Webhook retries are idempotent (event id + row lock + PAID check), so they produce no duplicate receipts or emails.
Disputes (`payment.dispute.*`) set `payments.disputeStatus` and alert admins; the money status is not changed.

Receipts say **"This is a receipt for fees paid. It is not a tax invoice."** Tax invoices come only from the document generator,
and only when GST is configured (below).

## 3. Business documents (admin → Documents)

Types: QUOTATION, PROPOSAL, AGREEMENT, INVOICE, RECEIPT.

Lifecycle: DRAFT (editable, preview with a DRAFT watermark) → ISSUED → SENT (email with the PDF attached), then:
- quotations and proposals: ACCEPTED or DECLINED, then convert to an agreement or invoice;
- agreements: SIGNED, **only by uploading the signed copy** (no e-signature provider is configured);
- invoices: PARTIALLY_PAID or PAID, by recording payments; each payment issues a numbered receipt.

VOID needs a reason, and the number is never reused. A revision gets the same number with `-R2`, and the old document becomes SUPERSEDED.

- **Company details** (Settings): start empty and are printed only when filled in. GST applies only if *GST registered* is on, a valid 15-character GSTIN is saved, both state codes are set, and the document opts in. Then intra-state supply uses CGST + SGST and inter-state supply uses IGST.
- **Numbering**: configurable prefix, optional Indian financial year (`QTN/2026-27/0001`) and zero-padding, with a gap-free counter per prefix and period.
- **Issued documents** freeze a snapshot (company, party, lines, taxes). The PDF is stored privately and re-rendered from the snapshot if the file is missing. VOID and SUPERSEDED copies are watermarked.
- **CRM**: clients can be created from a lead, and documents linked to a lead write to its timeline. Sending a quotation or proposal moves the lead to *Proposal sent*, acceptance moves it to *Negotiation*, and a signed agreement moves it to *Won*. A lead never moves backwards.
- **Permissions**:

  | Permission | What it allows |
  |---|---|
  | `documents.read` | view documents |
  | `documents.manage` | quotations, proposals, agreements (SALES has this; SALES sees only its own documents and those of its assigned leads) |
  | `documents.finance` | invoices and receipts (FINANCE has this and sees all documents) |
  | `documents.settings` | company details, numbering, templates (ADMIN only, not grantable) |

## 4. Configuration

| Variable | Needed for |
|---|---|
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | program payments (same as course payments); also subscribe the webhook to `payment.dispute.*` |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_EMAIL` | receipts, certificates, document emails (skipped and logged as SKIPPED when unset) |
| `UPLOAD_DIR` | stored PDFs and signed copies (without it, PDFs are rendered on demand and signed copies cannot be uploaded) |
| `TRAINING_URL`, `INTERN_PORTAL_URL`, `ADMIN_PORTAL_URL` | links in PDFs and emails |

Fonts (Plus Jakarta Sans, Noto Sans Devanagari, OFL) come from npm packages. The logo is `backend/assets/logo.svg`,
a byte-identical copy that `frontend/tests/logo.test.ts` checks.

## 5. Deploy order

Run `npm run prisma:deploy` **before** deploying this backend. The receipt code writes the new columns.

The migration is additive: two columns become nullable, and new tables and enum values are added. Rehearse it first with `backend/scripts/migration-rehearsal.ts`.
To preview the layout: `npx tsx scripts/pdf-samples.ts <dir>` (backend) renders SAMPLE-marked PDFs.
