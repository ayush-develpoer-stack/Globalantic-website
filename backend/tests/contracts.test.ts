/** Shared frontend contracts must match the database / server exactly. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { $Enums } from '@prisma/client';
import * as shared from '../../packages/types/src';
import { PERMISSIONS } from '../src/lib/permissions';

const pairs: [string, readonly string[], Record<string, string>][] = [
  ['Role', shared.ROLES, $Enums.Role],
  ['DeliveryMode', shared.DELIVERY_MODES, $Enums.DeliveryMode],
  ['CourseLevel', shared.COURSE_LEVELS, $Enums.CourseLevel],
  ['ProgramType', shared.PROGRAM_TYPES, $Enums.ProgramType],
  ['CourseStatus', shared.COURSE_STATUSES, $Enums.CourseStatus],
  ['BatchStatus', shared.BATCH_STATUSES, $Enums.BatchStatus],
  ['ApplicationStatus', shared.APPLICATION_STATUSES, $Enums.ApplicationStatus],
  ['EnrollmentStatus', shared.ENROLLMENT_STATUSES, $Enums.EnrollmentStatus],
  ['AttendanceStatus', shared.ATTENDANCE_STATUSES, $Enums.AttendanceStatus],
  ['AssignmentStatus', shared.ASSIGNMENT_STATUSES, $Enums.AssignmentStatus],
  ['SubmissionStatus', shared.SUBMISSION_STATUSES, $Enums.SubmissionStatus],
  ['AssessmentType', shared.ASSESSMENT_TYPES, $Enums.AssessmentType],
  ['MaterialType', shared.MATERIAL_TYPES, $Enums.MaterialType],
  ['PaymentStatus', shared.PAYMENT_STATUSES, $Enums.PaymentStatus],
  ['SupportStatus', shared.SUPPORT_STATUSES, $Enums.SupportStatus],
  ['ReferralStage', shared.REFERRAL_STAGES, $Enums.ReferralStage],
  ['RewardStatus', shared.REWARD_STATUSES, $Enums.RewardStatus],
  ['FraudReviewStatus', shared.FRAUD_REVIEW_STATUSES, $Enums.FraudReviewStatus],
  ['PayoutMethod', shared.PAYOUT_METHODS, $Enums.PayoutMethod],
  ['FilePurpose', shared.FILE_PURPOSES, $Enums.FilePurpose],
  ['EmploymentType', shared.EMPLOYMENT_TYPES, $Enums.EmploymentType],
  ['EmployeeAttendanceStatus', shared.EMPLOYEE_ATTENDANCE_STATUSES, $Enums.EmployeeAttendanceStatus],
  ['LeaveType', shared.LEAVE_TYPES, $Enums.LeaveType],
  ['LeaveStatus', shared.LEAVE_STATUSES, $Enums.LeaveStatus],
  ['ProjectStatus', shared.PROJECT_STATUSES, $Enums.ProjectStatus],
  ['TaskStatus', shared.TASK_STATUSES, $Enums.TaskStatus],
  ['TaskPriority', shared.TASK_PRIORITIES, $Enums.TaskPriority],
  ['EmployeeDocumentCategory', shared.EMPLOYEE_DOCUMENT_CATEGORIES, $Enums.EmployeeDocumentCategory],
  ['HrRequestCategory', shared.HR_REQUEST_CATEGORIES, $Enums.HrRequestCategory],
];

for (const [name, client, db] of pairs) {
  test(`@globalantic/types ${name} matches prisma`, () => {
    assert.deepEqual([...client].sort(), Object.values(db).sort());
  });
}

test('shared Permission type lists exactly the server permissions', async () => {
  // The type union is erased at runtime; compare against the source text instead.
  const fs = await import('node:fs');
  const src = fs.readFileSync(require.resolve('../../packages/types/src/index.ts'), 'utf8');
  const block = src.slice(src.indexOf('export type Permission ='), src.indexOf(';', src.indexOf('export type Permission =')));
  const listed = [...block.matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(listed, [...PERMISSIONS].sort());
});

test('enumLabel formats status values for display', () => {
  assert.equal(shared.enumLabel('UNDER_REVIEW'), 'Under review');
  assert.equal(shared.enumLabel(null), '');
});
