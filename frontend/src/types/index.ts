export type Role = 'manager' | 'leader' | 'employee';
export type ProjectType = 'internal' | 'cross';
export type ProjectStatus = 'preparing' | 'active' | 'closed';
export type AlertType = 'W01' | 'W02';
export type AlertStatus = 'active' | 'resolved';
export type NotificationType = 'member_added' | 'member_removed' | 'system';

export interface User {
  id: number;
  username: string;
  real_name: string;
  role: Role;
  group_id: number | null;
  group_name?: string;
  is_active: boolean;
}

export interface Group {
  id: number;
  name: string;
  room?: string | null;
}

export interface Project {
  id: number;
  task_code?: string | null;
  name: string;
  description: string | null;
  type: ProjectType;
  status: ProjectStatus;
  owner_user_id: number;
  owner_real_name?: string;
  group_id?: number | null;
  group_name?: string | null;
  member_count?: number;
  target_man_days?: number;
  actual_man_days?: number;
  progress?: number;
  st_progress?: number;
  uat_progress?: number;
  start_date?: string;
  end_date?: string;
}

export interface ProjectMember {
  id: number;
  project_id: number;
  user_id: number;
  joined_at: string;
  real_name?: string;
  username?: string;
  group_name?: string;
}

export interface WeeklyPlan {
  id: number;
  user_id: number;
  project_id: number;
  week_start_date: string;
  planned_man_days: number;
  user_real_name?: string;
  project_name?: string;
}

export interface ActualEffort {
  id: number;
  user_id: number;
  project_id: number;
  week_start_date: string;
  actual_man_days: number;
  created_by: number;
  username?: string;
  user_real_name?: string;
  role?: string;
  group_name?: string | null;
  project_name?: string;
  created_by_real_name?: string;
  week_label?: string;
}

export interface Alert {
  id: number;
  alert_type: string;
  alert_level?: string;
  related_entity_type: string;
  related_entity_id: number;
  message: string;
  status: AlertStatus;
  resolved_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Notification {
  id: number;
  user_id: number;
  type: NotificationType;
  title: string;
  content: string;
  related_entity_type: string | null;
  related_entity_id: number | null;
  is_read: boolean;
  created_at?: string;
}

export interface DashboardData {
  total_planned_this_week: number;
  total_actual_this_week: number;
  group_overview: {
    group_id: number;
    group_name: string;
    planned: number;
    actual: number;
  }[];
  alerts_unread_count: number;
  top_overloaded: {
    user_id: number;
    user_real_name: string;
    planned_man_days: number;
  }[];
}

export interface PlanBatchItem {
  id?: number;
  user_id: number;
  project_id: number;
  week_start_date: string;
  planned_man_days: number;
}

export interface EffortBatchItem {
  user_id: number;
  project_id: number;
  week_start_date: string;
  actual_man_days: number;
}

// ========== 人力报备 ==========
export interface ManpowerRegistration {
  id: number;
  project_id: number;
  team_id: number;
  registered_man_days: number;
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  applicant_id: number;
  applicant_name?: string;
  project_name?: string;
  team_name?: string;
  created_at?: string;
  updated_at?: string;
}

// ========== 增强的 Dashboard 接口 ==========
export interface DashboardSummary {
  projects: {
    total: number;
    internal: number;
    cross: number;
  };
  alerts: {
    total: number;
    by_level: Record<string, number>;
  };
  this_week: {
    planned: number;
    actual: number;
    variance: number;
  };
}

export interface ProjectHealth {
  id: number;
  name: string;
  type: string;
  target_man_days: number;
  actual_man_days: number;
  progress: { st: number; uat: number };
  health_status: 'green' | 'yellow' | 'red';
}

export interface ProjectVariance {
  project_id: number;
  project_name: string;
  weekly: {
    week_start: string;
    week_label: string;
    planned: number;
    actual: number;
    variance: number;
    variance_pct: number | null;
    status: 'over' | 'under' | 'on_track';
  }[];
  summary: {
    total_planned: number;
    total_actual: number;
    total_variance: number;
    total_variance_pct: number | null;
  };
}

// ========== 周计划增强 ==========
export interface WeeklyPlan {
  id: number;
  user_id: number;
  project_id: number;
  week_start_date: string;
  planned_man_days: number;
  status?: 'draft' | 'submitted' | 'approved' | 'rejected';
  user_real_name?: string;
  project_name?: string;
  team_id?: number;
  team_name?: string;
}

export const roleLabels: Record<Role, string> = {
  manager: '室经理',
  leader: '组长',
  employee: '员工',
};

export const rolePermissions = {
  manager: {
    canManageGroups: true,
    canManageUsers: true,
    canManageProjects: true,
    canManagePlans: true,
    canManageEfforts: true,
    canViewAll: true,
  },
  leader: {
    canManageGroups: false,
    canManageUsers: false,
    canManageProjects: true,
    canManagePlans: true,
    canManageEfforts: true,
    canViewAll: false,
  },
  employee: {
    canManageGroups: false,
    canManageUsers: false,
    canManageProjects: false,
    canManagePlans: false,
    canManageEfforts: false,
    canViewAll: false,
  },
};
