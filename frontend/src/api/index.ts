import axiosInstance from './axios';
import type {
  User, Group, Project, ProjectMember,
  WeeklyPlan, ActualEffort, Alert, Notification, DashboardData,
  PlanBatchItem, EffortBatchItem, ManpowerRegistration,
  DashboardSummary, ProjectHealth, ProjectVariance,
} from '../types';

const BASE = '';

// ========== 认证 ==========
export const login = async (username: string, password: string) => {
  const resp = await axiosInstance.post<{ access_token: string }>(`${BASE}/auth/login`, {
    username,
    password,
  });
  return resp.data;
};
export const getMe = async (): Promise<User> => {
  const resp = await axiosInstance.get<User>(`${BASE}/auth/me`);
  return resp.data;
};

// ========== 组 ==========
export const getGroups = async (): Promise<Group[]> => {
  const resp = await axiosInstance.get<Group[]>(`${BASE}/groups`);
  return resp.data;
};
export const createGroup = async (data: { name: string; room?: string | null }): Promise<Group> => {
  const resp = await axiosInstance.post<Group>(`${BASE}/groups`, data);
  return resp.data;
};
export const updateGroup = async (id: number, data: { name?: string; room?: string | null }): Promise<Group> => {
  const resp = await axiosInstance.put<Group>(`${BASE}/groups/${id}`, data);
  return resp.data;
};
export const deleteGroup = async (id: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/groups/${id}`);
};

// ========== 用户 ==========
export const getUsers = async (params?: { group_id?: number }): Promise<User[]> => {
  const resp = await axiosInstance.get<User[]>(`${BASE}/users`, { params });
  return resp.data;
};
export const createUser = async (data: {
  username: string; password?: string; real_name: string; role: string; group_id?: number | null;
}): Promise<User> => {
  const resp = await axiosInstance.post<User>(`${BASE}/users`, data);
  return resp.data;
};
export const updateUser = async (id: number, data: {
  real_name?: string; role?: string; group_id?: number | null;
}): Promise<User> => {
  const resp = await axiosInstance.put<User>(`${BASE}/users/${id}`, data);
  return resp.data;
};
export const deleteUser = async (id: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/users/${id}`);
};

// ========== 项目 ==========
export const getProjects = async (params?: { status?: string }): Promise<Project[]> => {
  const resp = await axiosInstance.get<Project[]>(`${BASE}/projects`, { params });
  return resp.data;
};
export const createProject = async (data: {
  name: string; description?: string; type: string;
  owner_user_id: number; start_date: string; end_date: string; status?: string;
}): Promise<Project> => {
  const resp = await axiosInstance.post<Project>(`${BASE}/projects`, data);
  return resp.data;
};
export const updateProject = async (id: number, data: Partial<Project>): Promise<Project> => {
  const resp = await axiosInstance.put<Project>(`${BASE}/projects/${id}`, data);
  return resp.data;
};
export const deleteProject = async (id: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/projects/${id}`);
};
export const mergeProjects = async (sourceProjectId: number, targetProjectId: number): Promise<{ message: string }> => {
  const resp = await axiosInstance.post(`${BASE}/projects/merge`, {
    source_project_id: sourceProjectId,
    target_project_id: targetProjectId,
  });
  return resp.data;
};

export interface MergePreview {
  source_project_name: string;
  target_project_name: string;
  members_count: number;
  plans_count: number;
  duplicate_plans_count: number;
  registrations_count: number;
  duplicate_registrations_count: number;
  efforts_count: number;
}

export const getMergePreview = async (sourceProjectId: number, targetProjectId: number): Promise<MergePreview> => {
  const resp = await axiosInstance.get<MergePreview>(`${BASE}/projects/merge/preview`, {
    params: { source_project_id: sourceProjectId, target_project_id: targetProjectId },
  });
  return resp.data;
};

export interface OperationLog {
  id: number;
  operator_id: number;
  operator_name: string | null;
  action: string;
  entity_type: string;
  entity_id: number;
  detail: string | null;
  created_at: string;
}

export const getOperationLogs = async (params?: { limit?: number; offset?: number; action?: string; entity_type?: string }): Promise<OperationLog[]> => {
  const resp = await axiosInstance.get<OperationLog[]>(`${BASE}/operations/logs`, { params });
  return resp.data;
};

// ========== 项目成员 ==========
export const getProjectMembers = async (projectId: number): Promise<ProjectMember[]> => {
  const resp = await axiosInstance.get<ProjectMember[]>(`${BASE}/projects/${projectId}/members`);
  return resp.data;
};
export const addProjectMember = async (projectId: number, userId: number): Promise<void> => {
  await axiosInstance.post(`${BASE}/projects/${projectId}/members`, { user_id: userId });
};
export const removeProjectMember = async (projectId: number, userId: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/projects/${projectId}/members/${userId}`);
};

// ========== 周计划 ==========
export const getPlans = async (params?: {
  week_start_date?: string; user_id?: number; project_id?: number; group_id?: number;
}): Promise<WeeklyPlan[]> => {
  const resp = await axiosInstance.get<WeeklyPlan[]>(`${BASE}/plans`, { params });
  return resp.data;
};
export const batchUpdatePlans = async (items: PlanBatchItem[]): Promise<void> => {
  await axiosInstance.post(`${BASE}/plans/batch`, { plans: items });
};

// ========== 实际投入 ==========
export const getEfforts = async (params?: {
  week_start_date?: string; user_id?: number; project_id?: number;
}): Promise<ActualEffort[]> => {
  const resp = await axiosInstance.get<ActualEffort[]>(`${BASE}/efforts`, { params });
  return resp.data;
};
export const batchUpdateEfforts = async (items: EffortBatchItem[]): Promise<void> => {
  await axiosInstance.post(`${BASE}/efforts/batch`, { efforts: items });
};

export const updateEffort = async (id: number, data: {
  user_id: number; project_id: number; week_start_date: string; actual_man_days: number;
}): Promise<ActualEffort> => {
  const resp = await axiosInstance.put<ActualEffort>(`${BASE}/efforts/${id}`, data);
  return resp.data;
};

export const deleteEffort = async (id: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/efforts/${id}`);
};

// ========== 预警 ==========
export const getAlerts = async (): Promise<Alert[]> => {
  const resp = await axiosInstance.get<Alert[]>(`${BASE}/alerts`);
  return resp.data;
};
export const resolveAlert = async (id: number): Promise<void> => {
  await axiosInstance.put(`${BASE}/alerts/${id}/resolve`);
};

// ========== 通知 ==========
export const getNotifications = async (): Promise<Notification[]> => {
  const resp = await axiosInstance.get<Notification[]>(`${BASE}/notifications`);
  return resp.data;
};
export const markNotificationRead = async (id: number): Promise<void> => {
  await axiosInstance.put(`${BASE}/notifications/${id}/read`);
};
export const markAllNotificationsRead = async (): Promise<void> => {
  await axiosInstance.post(`${BASE}/notifications/read-all`);
};

// ========== Dashboard ==========
export const getDashboard = async (): Promise<DashboardData> => {
  const resp = await axiosInstance.get<DashboardData>(`${BASE}/dashboard`);
  return resp.data;
};

// ========== 人力报备 ==========
export const getManpowerRegistrations = async (params?: {
  project_id?: number; team_id?: number; status?: string;
}): Promise<ManpowerRegistration[]> => {
  const resp = await axiosInstance.get<ManpowerRegistration[]>(`${BASE}/manpower`, { params });
  return resp.data;
};
export const createManpowerRegistration = async (data: {
  project_id: number; team_id: number; registered_man_days: number; note?: string;
}): Promise<ManpowerRegistration> => {
  const resp = await axiosInstance.post<ManpowerRegistration>(`${BASE}/manpower`, data);
  return resp.data;
};
export const approveManpowerRegistration = async (id: number): Promise<void> => {
  await axiosInstance.put(`${BASE}/manpower/${id}/approve`);
};
export const rejectManpowerRegistration = async (id: number): Promise<void> => {
  await axiosInstance.put(`${BASE}/manpower/${id}/reject`);
};
export const deleteManpowerRegistration = async (id: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/manpower/${id}`);
};

// ========== 增强的 Dashboard API ==========
export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  const resp = await axiosInstance.get<DashboardSummary>(`${BASE}/dashboard/summary`);
  return resp.data;
};
export const getGroupManpowerOverview = async (weeksBack?: number) => {
  const resp = await axiosInstance.get(`${BASE}/dashboard/manpower/overview`, {
    params: weeksBack ? { weeks_back: weeksBack } : {},
  });
  return resp.data;
};
export const getProjectsHealth = async (): Promise<ProjectHealth[]> => {
  const resp = await axiosInstance.get<ProjectHealth[]>(`${BASE}/dashboard/projects/health`);
  return resp.data;
};
export const getProjectVariance = async (projectId: number): Promise<ProjectVariance> => {
  const resp = await axiosInstance.get<ProjectVariance>(`${BASE}/projects/${projectId}/variance`);
  return resp.data;
};
export const batchResolveAlerts = async (alertIds: number[]): Promise<void> => {
  await axiosInstance.post(`${BASE}/alerts/batch-resolve`, alertIds);
};

// ========== 项目周计划 ==========
export const getProjectWeeklyStatus = async (params: {
  week_start_date?: string;
  group_id?: number;
}): Promise<{
  week_start_date: string;
  week_dates: string[];
  weekdays: string[];
  projects: any[];
  all_users: { id: number; real_name: string }[];
  groups: { id: number; name: string; room?: string }[];
}> => {
  const resp = await axiosInstance.get(`${BASE}/project-weekly-plan/projects/status`, { params });
  return resp.data;
};

export const saveProjectWeeklyStatus = async (data: {
  project_id: number;
  week_start_date: string;
  status: string;
  risk_desc: string;
  weekly_progress: string;
  next_week_plan: string;
  daily_allocations: Record<string, number[]>;
}): Promise<{ success: boolean; status_id: number }> => {
  const resp = await axiosInstance.post(`${BASE}/project-weekly-plan/projects/status`, data);
  return resp.data;
};

export const getProjectWeeklyDimension = async (params: {
  week_start_date?: string;
}): Promise<{
  week_start_date: string;
  summary: { total_projects: number; total_users: number; avg_projects_per_user: number };
  details: {
    user_id: number;
    user_name: string;
    project_count: number;
    total_days: number;
    ratio: number;
    project_names: string[];
  }[];
  analysis: string[];
}> => {
  const resp = await axiosInstance.get(`${BASE}/project-weekly-plan/projects/dimension`, { params });
  return resp.data;
};
