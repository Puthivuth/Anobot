/// <reference types="vite/client" />
const API_BASE = import.meta.env.VITE_API_URL || '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // sends and receives httpOnly session cookie
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.error?.message || data?.detail || 'Request failed';
    const errorCode = data?.error?.code || 'error';
    const error = new Error(errorMsg) as Error & { code?: string; status?: number };
    error.code = errorCode;
    error.status = response.status;
    throw error;
  }

  return data as T;
}

export interface User {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'user';
  is_active: boolean;
  last_login_at?: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  type: 'detect' | 'classify' | 'segment' | 'keypoint' | 'obb';
  is_public: boolean;
  keypoint_schema: Record<string, any>;
  images_count: number;
  annotated_count: number;
  classes_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectClass {
  id: string;
  project_id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

export interface ImageItem {
  id: string;
  project_id: string;
  filename: string;
  width: number;
  height: number;
  phash: string;
  split_hint?: string | null;
  annotations_count: number;
  created_at: string;
}

export interface AnnotationItem {
  id: string;
  image_id: string;
  class_id: string;
  kind: 'box' | 'polygon' | 'keypoints' | 'obb' | 'tag';
  geometry: any;
  source: string;
  created_at: string;
  updated_at: string;
}

export const api = {
  // Auth
  getAuthStatus: () => request<{ needs_setup: boolean }>('/api/v1/auth/status'),
  setupAdmin: (data: { name: string; username: string; password: string }) =>
    request<User>('/api/v1/auth/setup', { method: 'POST', body: JSON.stringify(data) }),
  login: (username: string, password: string) =>
    request<User>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ status: string }>('/api/v1/auth/logout', { method: 'POST' }),
  getMe: () => request<User>('/api/v1/auth/me'),
  changePassword: (current_password: string, new_password: string) =>
    request<{ status: string }>('/api/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),

  // Users & Admin
  getUsers: () => request<User[]>('/api/v1/users'),
  createUser: (data: { name: string; username: string; role: string; password: string }) =>
    request<User>('/api/v1/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: Partial<{ name: string; role: string; is_active: boolean; password: string }>) =>
    request<User>(`/api/v1/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request<{ status: string }>(`/api/v1/users/${id}`, { method: 'DELETE' }),
  getAuditLogs: (params?: { username?: string; action?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.username) query.set('username', params.username);
    if (params?.action) query.set('action', params.action);
    if (params?.limit) query.set('limit', String(params.limit));
    return request<{ total: number; items: any[] }>(`/api/v1/admin/audit?${query.toString()}`);
  },
  clearAuditLogs: () => request<{ status: string }>('/api/v1/admin/audit', { method: 'DELETE' }),

  // Projects
  getProjects: () => request<Project[]>('/api/v1/projects'),
  createProject: (data: { name: string; type: string; is_public?: boolean; keypoint_schema?: any }) =>
    request<Project>('/api/v1/projects', { method: 'POST', body: JSON.stringify(data) }),
  getProject: (id: string) => request<Project>(`/api/v1/projects/${id}`),
  updateProject: (id: string, data: Partial<{ name: string; type: string; is_public: boolean; keypoint_schema: any }>) =>
    request<Project>(`/api/v1/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProject: (id: string) => request<{ status: string; message: string }>(`/api/v1/projects/${id}`, { method: 'DELETE' }),

  // Classes
  getClasses: (projectId: string) => request<ProjectClass[]>(`/api/v1/projects/${projectId}/classes`),
  createClass: (projectId: string, data: { name: string; color?: string; position?: number }) =>
    request<ProjectClass>(`/api/v1/projects/${projectId}/classes`, { method: 'POST', body: JSON.stringify(data) }),
  updateClass: (classId: string, data: Partial<{ name: string; color: string; position: number }>) =>
    request<ProjectClass>(`/api/v1/classes/${classId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteClass: (classId: string) => request<{ status: string; message: string }>(`/api/v1/classes/${classId}`, { method: 'DELETE' }),

  // Images
  uploadImages: (projectId: string, files: File[]) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    return request<{ uploaded_count: number; duplicate_warnings: any[]; images: ImageItem[] }>(
      `/api/v1/projects/${projectId}/images`,
      { method: 'POST', body: formData }
    );
  },
  getImages: (projectId: string, params?: { filter?: string; class_id?: string; page?: number; page_size?: number }) => {
    const query = new URLSearchParams();
    if (params?.filter) query.set('filter', params.filter);
    if (params?.class_id) query.set('class_id', params.class_id);
    if (params?.page) query.set('page', String(params.page));
    if (params?.page_size) query.set('page_size', String(params.page_size));
    return request<{ total: number; page: number; page_size: number; items: ImageItem[] }>(
      `/api/v1/projects/${projectId}/images?${query.toString()}`
    );
  },
  getImageFileUrl: (projectId: string, imageId: string, type: 'thumb' | 'preview' | 'original' = 'thumb') => {
    return `${API_BASE}/api/v1/projects/${projectId}/images/${imageId}/file?type=${type}`;
  },
  getImageUrl: (projectId: string, imageId: string, type: 'thumb' | 'preview' | 'original' = 'thumb') => {
    return `${API_BASE}/api/v1/projects/${projectId}/images/${imageId}/file?type=${type}`;
  },
  deleteImage: (imageId: string) => request<{ status: string; message: string }>(`/api/v1/images/${imageId}`, { method: 'DELETE' }),

  // Annotations
  getImageAnnotations: (projectId: string, imageId: string) =>
    request<AnnotationItem[]>(`/api/v1/projects/${projectId}/images/${imageId}/annotations`),
  createAnnotation: (
    projectId: string,
    imageId: string,
    data: { class_id: string; kind: string; geometry: any; source?: string }
  ) =>
    request<AnnotationItem>(`/api/v1/projects/${projectId}/images/${imageId}/annotations`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  batchSaveAnnotations: (
    projectId: string,
    imageId: string,
    annotations: Array<{ class_id: string; kind: string; geometry: any; source?: string }>
  ) =>
    request<AnnotationItem[]>(`/api/v1/projects/${projectId}/images/${imageId}/annotations`, {
      method: 'PUT',
      body: JSON.stringify({ annotations }),
    }),
  deleteAnnotation: (annotationId: string) =>
    request<{ status: string; message: string }>(`/api/v1/annotations/${annotationId}`, { method: 'DELETE' }),

  // Dataset Versions
  getVersions: (projectId: string) => request<DatasetVersion[]>(`/api/v1/projects/${projectId}/versions`),
  createVersion: (
    projectId: string,
    data: { name?: string; splits?: Record<string, number>; format?: string; preprocessing?: any; augmentations?: any }
  ) =>
    request<DatasetVersion>(`/api/v1/projects/${projectId}/versions`, { method: 'POST', body: JSON.stringify(data) }),
  getVersionDownloadUrl: (projectId: string, versionId: string) =>
    `${API_BASE}/api/v1/projects/${projectId}/versions/${versionId}/download`,
  deleteVersion: (versionId: string) =>
    request<{ status: string; message: string }>(`/api/v1/versions/${versionId}`, { method: 'DELETE' }),

  // Training
  getTrainingJobs: (projectId: string) => request<TrainingJob[]>(`/api/v1/projects/${projectId}/training/jobs`),
  startTraining: (
    projectId: string,
    data: { version_id?: string; model_name: string; epochs: number; batch_size: number; img_size: number; device?: string }
  ) =>
    request<TrainingJob>(`/api/v1/projects/${projectId}/train`, { method: 'POST', body: JSON.stringify(data) }),
  getTrainingJob: (jobId: string) => request<TrainingJob>(`/api/v1/training/jobs/${jobId}`),
  cancelTrainingJob: (jobId: string) =>
    request<{ status: string; message: string }>(`/api/v1/training/jobs/${jobId}/cancel`, { method: 'POST' }),

  // Admin API Keys
  getApiKeys: () => request<ApiKey[]>('/api/v1/admin/api-keys'),
  createApiKey: (data: { name: string; service: string; value: string }) =>
    request<ApiKey>('/api/v1/admin/api-keys', { method: 'POST', body: JSON.stringify(data) }),
  deleteApiKey: (keyId: string) => request<{ status: string; message: string }>(`/api/v1/admin/api-keys/${keyId}`, { method: 'DELETE' }),
  testGeminiKey: (value?: string) =>
    request<{ status: string; message: string }>('/api/v1/admin/api-keys/test', {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),

  // AI Assisted Labeling
  geminiAssistLabeling: (projectId: string, imageId: string) =>
    request<AnnotationItem[]>(`/api/v1/projects/${projectId}/images/${imageId}/gemini-assist`, { method: 'POST' }),

  // Deploy Keys
  getDeployKeys: (projectId: string) => request<DeployKey[]>(`/api/v1/projects/${projectId}/deploy-keys`),
  createDeployKey: (projectId: string, name: string) =>
    request<DeployKey>(`/api/v1/projects/${projectId}/deploy-keys`, { method: 'POST', body: JSON.stringify({ name }) }),
  revokeDeployKey: (keyId: string) =>
    request<{ status: string; message: string }>(`/api/v1/deploy-keys/${keyId}`, { method: 'DELETE' }),

  // Inference & Model Weights
  runInference: async (modelId: string, imageFile: File, conf = 0.25, iou = 0.45) => {
    const fd = new FormData();
    fd.append('file', imageFile);
    fd.append('confidence', String(conf));
    fd.append('iou', String(iou));
    const res = await fetch(`${API_BASE}/api/v1/infer/${modelId}`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || err.detail || 'Inference failed');
    }
    return res.json();
  },
  getModelWeightsUrl: (modelId: string, format = 'pt') =>
    `${API_BASE}/api/v1/models/${modelId}/weights?format=${format}`,

  // Universe
  getUniverseDatasets: (params?: { type?: string; q?: string }) => {
    const qp = new URLSearchParams();
    if (params?.type) qp.set('type', params.type);
    if (params?.q) qp.set('q', params.q);
    return request<UniverseDataset[]>(`/api/v1/universe?${qp.toString()}`);
  },
  forkUniverseDataset: (id: string) =>
    request<{ status: string; message: string; project: { id: string; name: string; type: string } }>(
      `/api/v1/universe/${id}/fork`,
      { method: 'POST' }
    ),

  // Workflows
  getWorkflows: (projectId: string) => request<WorkflowItem[]>(`/api/v1/projects/${projectId}/workflows`),
  createWorkflow: (projectId: string, data: { name: string; blocks: any[]; is_api_enabled: boolean }) =>
    request<WorkflowItem>(`/api/v1/projects/${projectId}/workflows`, { method: 'POST', body: JSON.stringify(data) }),
  deleteWorkflow: (workflowId: string) =>
    request<{ status: string; message: string }>(`/api/v1/workflows/${workflowId}`, { method: 'DELETE' }),
  runWorkflow: async (workflowId: string, imageFile: File) => {
    const fd = new FormData();
    fd.append('file', imageFile);
    const res = await fetch(`${API_BASE}/api/v1/workflows/${workflowId}/run`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Workflow execution failed');
    return res.json();
  },

  // Admin Settings & Backup
  getAdminSettings: () => request<Record<string, any>>('/api/v1/admin/settings'),
  updateAdminSettings: (settings: Record<string, any>) =>
    request<{ status: string; message: string }>('/api/v1/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    }),
  getBackupDownloadUrl: () => `${API_BASE}/api/v1/admin/backup`,
  restoreBackup: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE}/api/v1/admin/restore`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to restore backup');
    return res.json();
  },
};

export interface DatasetVersion {
  id: string;
  project_id: string;
  version_number: number;
  name?: string;
  splits: { train: number; val: number; test: number };
  preprocessing: Record<string, any>;
  augmentations: Record<string, any>;
  image_count: number;
  created_at: string;
}

export interface TrainingJob {
  id: string;
  project_id: string;
  version_id?: string | null;
  model_name: string;
  task: string;
  epochs: number;
  batch_size: number;
  img_size: number;
  device: string;
  status: 'queued' | 'training' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_epoch: number;
  metrics: Record<string, any>;
  weights_key?: string | null;
  onnx_key?: string | null;
  error_message?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface ApiKey {
  id: string;
  name: string;
  service: string;
  masked_value: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeployKey {
  id: string;
  project_id: string;
  name: string;
  last4: string;
  revoked_at?: string | null;
  created_at: string;
  raw_key?: string | null;
}

export interface UniverseDataset {
  id: string;
  source_project_id?: string | null;
  title: string;
  description: string;
  license: string;
  tags: string[];
  image_count: number;
  project_type: string;
  created_at: string;
}

export interface WorkflowItem {
  id: string;
  project_id: string;
  name: string;
  blocks: any[];
  is_api_enabled: boolean;
  created_at: string;
  updated_at: string;
}

