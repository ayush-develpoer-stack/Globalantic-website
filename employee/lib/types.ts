/** Shapes returned by /api/employee/* (dates are ISO strings). */
import type { EmployeeAttendanceStatus, LeaveStatus, LeaveType, ProjectStatus, StoredFileMeta, SupportStatus, TaskPriority, TaskStatus } from '@globalantic/types';

export interface TaskRow {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt?: string | null;
  createdAt?: string;
  project?: { id: string; name: string } | null;
}

export interface AttendanceRow {
  id: string;
  date: string;
  status: EmployeeAttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  notes: string | null;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface Dashboard {
  today: string;
  attendance: AttendanceRow | null;
  onLeaveToday: boolean;
  pendingLeaves: number;
  openTasks: TaskRow[];
  announcements: AnnouncementRow[];
  openRequests: number;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  employeeProfile: {
    employeeCode: string;
    department: string;
    designation: string;
    employmentType: string;
    joiningDate: string;
    workLocation: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    manager: { name: string; email: string } | null;
  };
}

export interface LeaveRow {
  id: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  _count?: { members: number; tasks: number };
}

export interface ProjectDetail extends ProjectRow {
  members: { role: string | null; user: { id: string; name: string } }[];
  myTasks: TaskRow[];
}

export interface WorkUpdateRow {
  id: string;
  date: string;
  summary: string;
  minutes: number | null;
  project: { id: string; name: string } | null;
  task: { id: string; title: string } | null;
  createdAt: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  category: string;
  createdAt: string;
  file: StoredFileMeta;
}

export interface HrRequestRow {
  id: string;
  category: string;
  subject: string;
  message: string;
  status: SupportStatus;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
}
