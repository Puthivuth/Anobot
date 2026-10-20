import { useState, useEffect, type ReactNode } from 'react';
import {
  Activity, ArrowUpRight, Box, ChevronDown, CircleHelp, CloudUpload, Code2,
  Database, FileImage, FolderKanban, GitBranch, Layers3, LayoutDashboard,
  LockKeyhole, Play, ScanLine, Settings, Sparkles, Users, WandSparkles,
  ShieldAlert, RefreshCw
} from 'lucide-react';
import { api, type User, type Project, type ProjectClass, type ImageItem } from './api/client';
import { ProjectModal } from './components/ProjectModal';
import { UploadAndGallery } from './components/UploadAndGallery';
import { AnnotationCanvas } from './components/AnnotationCanvas';
import { VersionsAndTrain } from './components/VersionsAndTrain';
import { AdminApiKeys } from './components/AdminApiKeys';
import { ModelVisualize } from './components/ModelVisualize';
import { DeploymentsView } from './components/DeploymentsView';
import { WorkflowsView } from './components/WorkflowsView';
import { UniverseView } from './components/UniverseView';
import { SettingsView } from './components/SettingsView';

type NavItem = { label: string; icon: typeof Box; group: string; adminOnly?: boolean };
const nav: NavItem[] = [
  { group: 'Project', label: 'Overview', icon: LayoutDashboard },
  { group: 'Project', label: 'Upload Data', icon: CloudUpload },
  { group: 'Project', label: 'Annotate', icon: ScanLine },
  { group: 'Project', label: 'Versions', icon: Layers3 },
  { group: 'Project', label: 'Health Check', icon: Activity },
  { group: 'Models', label: 'Train', icon: Play },
  { group: 'Models', label: 'Visualize', icon: Sparkles },
  { group: 'Models', label: 'Video', icon: FileImage },
  { group: 'Deploy', label: 'Deployments', icon: Code2 },
  { group: 'Deploy', label: 'Workflows', icon: GitBranch },
  { group: 'Deploy', label: 'Export Dataset', icon: Database },
  { group: 'Admin', label: 'Users', icon: Users, adminOnly: true },
  { group: 'Admin', label: 'API Keys', icon: LockKeyhole, adminOnly: true },
  { group: 'Admin', label: 'Activity Log', icon: Activity, adminOnly: true },
  { group: 'Admin', label: 'Settings', icon: Settings, adminOnly: true },
  { group: 'Explore', label: 'Universe', icon: FolderKanban },
];

const steps = [
  { n: '01', title: 'Upload images', desc: 'Bring your images into a new dataset.', icon: CloudUpload, action: 'Upload Data' },
  { n: '02', title: 'Annotate your data', desc: 'Teach your model what to recognize.', icon: ScanLine, action: 'Annotate' },
  { n: '03', title: 'Generate a version', desc: 'Configure preprocessing and augmentation.', icon: Layers3, action: 'Versions' },
  { n: '04', title: 'Train a model', desc: 'Train a model on your labeled dataset.', icon: Play, action: 'Train' },
  { n: '05', title: 'Deploy your model', desc: 'Run predictions through an API endpoint.', icon: Code2, action: 'Deployments' },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // App workspace states
  const [active, setActive] = useState('Overview');
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [classes, setClasses] = useState<ProjectClass[]>([]);
  const [projectImages, setProjectImages] = useState<ImageItem[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const loadClasses = async (projectId: string) => {
    try {
      const cls = await api.getClasses(projectId);
      setClasses(cls);
    } catch (err) {
      console.error('Failed to load classes', err);
    }
  };

  const loadProjectImages = async (projectId: string) => {
    try {
      const res = await api.getImages(projectId);
      setProjectImages(res.items);
      if (res.items.length > 0 && !selectedImage) {
        setSelectedImage(res.items[0]);
      }
    } catch (err) {
      console.error('Failed to load images', err);
    }
  };

  const loadProjects = async (selectId?: string) => {
    try {
      const list = await api.getProjects();
      setProjects(list);
      if (list.length > 0) {
        const current = selectId
          ? list.find((p) => p.id === selectId) || list[0]
          : activeProject
          ? list.find((p) => p.id === activeProject.id) || list[0]
          : list[0];
        setActiveProject(current);
        loadClasses(current.id);
        loadProjectImages(current.id);
      } else {
        const created = await api.createProject({
          name: 'Traffic Detection',
          type: 'detect',
        });
        setProjects([created]);
        setActiveProject(created);
        loadClasses(created.id);
        loadProjectImages(created.id);
      }
    } catch (err) {
      console.error('Failed to load projects', err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadProjects();
    }
  }, [currentUser]);

  const handleTypeChange = async (newType: string) => {
    if (!activeProject) return;
    try {
      const updated = await api.updateProject(activeProject.id, { type: newType as any });
      setActiveProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setNotice(`Project type updated to ${newType}.`);
      setTimeout(() => setNotice(''), 3000);
    } catch (err: any) {
      setNotice(err.message || 'Cannot change project type after annotations have been created.');
      setTimeout(() => setNotice(''), 4000);
    }
    setTypeOpen(false);
  };

  // Check auth and setup on mount
  const checkAuth = async () => {
    try {
      const status = await api.getAuthStatus();
      setNeedsSetup(status.needs_setup);
      if (!status.needs_setup) {
        try {
          const user = await api.getMe();
          setCurrentUser(user);
        } catch {
          setCurrentUser(null);
        }
      }
    } catch (err) {
      console.error('Failed to check auth status', err);
    } finally {
      setAuthChecking(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      setCurrentUser(null);
      setActive('Overview');
    }
  };

  if (authChecking) {
    return (
      <div className="auth-container">
        <div style={{ textAlign: 'center', color: '#666' }}>
          <RefreshCw className="animate-spin" size={24} style={{ margin: '0 auto 12px', color: '#6706ce' }} />
          <p>Connecting to AnoBot...</p>
        </div>
      </div>
    );
  }

  // First-run setup screen
  if (needsSetup) {
    return (
      <SetupAdminScreen
        onSuccess={(user) => {
          setCurrentUser(user);
          setNeedsSetup(false);
          setActive('Overview');
        }}
      />
    );
  }

  // Unauthenticated sign-in screen
  if (!currentUser) {
    return (
      <SignInScreen
        onSuccess={(user) => {
          setCurrentUser(user);
          setActive('Overview');
        }}
      />
    );
  }

  // Filter navigation groups by permissions (Section 6.2: A group with no visible items is hidden entirely)
  const visibleNav = nav.filter((item) => !item.adminOnly || currentUser.role === 'admin');
  const groups = [...new Set(visibleNav.map((n) => n.group))];

  return (
    <div className="app-shell">
      {notice && (
        <div className="app-notice" style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {notice}
        </div>
      )}
      <header className="topbar">
        <button className="brand" onClick={() => setActive('Overview')} aria-label="AnoBot home">
          <span className="brand-mark">◈</span>
          <span>AnoBot</span>
        </button>
        <div className="crumb">
          <span>Workspace</span>
          <span className="slash">/</span>
          <button
            className="crumb-project"
            onClick={() => setProjectModalOpen(true)}
            title="Click to switch or create project"
          >
            {activeProject ? activeProject.name : 'Loading project...'}
            <span className="edit-hint">✎</span>
          </button>
        </div>
        <div className="type-wrap">
          <button className="type-badge" onClick={() => setTypeOpen(!typeOpen)}>
            {activeProject ? activeProject.type.toUpperCase() : 'DETECT'}
            <ChevronDown size={13} />
          </button>
          {typeOpen && (
            <div className="type-menu">
              {[
                { label: 'Object Detection', val: 'detect' },
                { label: 'Classification', val: 'classify' },
                { label: 'Instance Segmentation', val: 'segment' },
                { label: 'Keypoint Detection', val: 'keypoint' },
                { label: 'Oriented Bounding Boxes', val: 'obb' },
              ].map((t) => (
                <button
                  key={t.val}
                  onClick={() => handleTypeChange(t.val)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="top-spacer" />
        <button className="user-pill">
          <span className="avatar">{currentUser.name.charAt(0).toUpperCase()}</span>
          <span>{currentUser.name}</span>
          <span className={`role-badge ${currentUser.role}`}>{currentUser.role.toUpperCase()}</span>
        </button>
        <button className="top-button" onClick={() => setActive('My account')}>
          Account
        </button>
        <button className="top-button subtle" onClick={handleLogout}>
          Sign out
        </button>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="workspace-switch">
            <div className="workspace-icon">A</div>
            <div className="workspace-meta">
              <strong>AnoBot Workspace</strong>
              <span>Personal workspace</span>
            </div>
            <ChevronDown size={15} />
          </div>
          <div className="project-label">CURRENT PROJECT</div>
          <button className="project-switch" onClick={() => setProjectModalOpen(true)}>
            <span className="project-dot" />
            {activeProject ? activeProject.name : 'Select Project'}
            <ChevronDown size={14} />
          </button>
          <nav>
            {groups.map((group) => (
              <div className="nav-group" key={group}>
                <div className="nav-heading">{group}</div>
                {visibleNav
                  .filter((n) => n.group === group)
                  .map((item) => {
                    const Icon = item.icon;
                    const isLabeling = item.label === 'Annotate';
                    const dynamicLabel = isLabeling
                      ? activeProject?.type === 'classify'
                        ? 'Classify'
                        : activeProject?.type === 'segment'
                        ? 'Polygons'
                        : activeProject?.type === 'keypoint'
                        ? 'Keypoints'
                        : activeProject?.type === 'obb'
                        ? 'Rotated Boxes'
                        : item.label
                      : item.label;

                    return (
                      <button
                        key={item.label}
                        className={`nav-item ${active === item.label ? 'active' : ''}`}
                        onClick={() => setActive(item.label)}
                      >
                        <Icon size={16} strokeWidth={1.8} />
                        <span>{dynamicLabel}</span>
                        {item.label === 'Train' && <span className="new-dot" />}
                      </button>
                    );
                  })}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <button className="help-link" onClick={() => setActive('Help & docs')}>
              <CircleHelp size={16} /> Help & docs <ArrowUpRight size={13} />
            </button>
            <div className="build-label">
              <span className="status-dot" /> Workspace ready <span>v0.1</span>
            </div>
          </div>
        </aside>

        <main className="main-content">
          <div className="content-inner">
            <div className="page-eyebrow">
              <span className="eyebrow-icon">
                <Sparkles size={13} />
              </span>{' '}
              COMPUTER VISION WORKSPACE <span className="eyebrow-line" />
            </div>
            <div className="page-title-row">
              <div>
                <h1>{active === 'Overview' ? 'Build something intelligent.' : active}</h1>
                <p className="page-subtitle">
                  {active === 'Overview'
                    ? 'Everything you need to build, train, and ship computer vision models.'
                    : `Manage ${active.toLowerCase()} for your computer vision project.`}
                </p>
              </div>
              <button className="primary-button" onClick={() => setActive('Upload Data')}>
                <CloudUpload size={16} /> Upload images
              </button>
            </div>

            {active === 'Overview' ? (
              <>
                <section className="welcome-card">
                  <div className="welcome-copy">
                    <div className="welcome-tag">
                      <span className="pulse-dot" /> YOUR WORKSPACE, READY
                    </div>
                    <h2>
                      From raw images to
                      <br />
                      <span>production-ready AI.</span>
                    </h2>
                    <p>Build a dataset, train a custom model, and deploy it to the real world — all in one place.</p>
                    <div className="welcome-actions">
                      <button className="primary-button" onClick={() => setActive('Upload Data')}>
                        Get started <ArrowUpRight size={15} />
                      </button>
                      <button className="text-button" onClick={() => setActive('Train')}>
                        Explore training <span>→</span>
                      </button>
                    </div>
                  </div>
                  <div className="welcome-graphic">
                    <div className="graphic-orbit orbit-one" />
                    <div className="graphic-orbit orbit-two" />
                    <div className="graphic-core">
                      <ScanLine size={36} />
                    </div>
                    <div className="scan-corner corner-a" />
                    <div className="scan-corner corner-b" />
                    <div className="scan-corner corner-c" />
                    <div className="scan-corner corner-d" />
                    <div className="graphic-label label-top">
                      <span /> IMAGE INPUT
                    </div>
                    <div className="graphic-label label-bottom">
                      MODEL PIPELINE <span>↗</span>
                    </div>
                    <div className="float-node node-one">
                      <Layers3 size={15} />
                    </div>
                    <div className="float-node node-two">
                      <WandSparkles size={15} />
                    </div>
                  </div>
                  <div className="welcome-index">ANOBOT / 001</div>
                </section>

                {(() => {
                  const projectCreated = Boolean(activeProject);
                  return (
                    <>
                      <div className="section-heading">
                        <div>
                          <h3>Your progress</h3>
                          <p>Five steps from dataset to deployment.</p>
                        </div>
                        <span className="progress-count">
                          {projectCreated ? '01' : '00'} <span>/ 05 COMPLETE</span>
                        </span>
                      </div>
                      <div className="progress-track">
                        <span style={{ width: projectCreated ? '20%' : '0%' }} />
                      </div>
                    </>
                  );
                })()}
                <div className="steps-grid">
                  {steps.map((step) => {
                    const Icon = step.icon;
                    return (
                      <article className="step-card" key={step.n}>
                        <div className="step-top">
                          <span className="step-number">
                            {step.n} <span>—</span>
                          </span>
                          <div className="step-icon">
                            <Icon size={17} />
                          </div>
                        </div>
                        <h4>{step.title}</h4>
                        <p>{step.desc}</p>
                        <div className="step-footer">
                          <span className="todo">
                            <span /> To do
                          </span>
                          <button onClick={() => setActive(step.action)}>
                            Start <span>↗</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="bottom-grid">
                  <section className="panel dataset-panel">
                    <div className="panel-heading">
                      <div>
                        <h3>Dataset snapshot</h3>
                        <p>A quick look at your current project.</p>
                      </div>
                      <button className="icon-button" onClick={() => setActive('Upload Data')}>
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                    {activeProject && activeProject.images_count > 0 ? (
                      <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: 650 }}>{activeProject.name}</span>
                          <span className="badge-active">{activeProject.type.toUpperCase()}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '11.5px', color: '#666' }}>
                          Dataset contains {activeProject.images_count} image(s), {activeProject.annotated_count} annotated with {classes.length} defined classes.
                        </p>
                      </div>
                    ) : (
                      <div className="empty-dataset">
                        <div className="empty-icon">
                          <FileImage size={22} />
                        </div>
                        <strong>No images yet</strong>
                        <span>Upload your first images to start building your dataset.</span>
                        <button onClick={() => setActive('Upload Data')}>
                          Upload images <span>→</span>
                        </button>
                      </div>
                    )}
                    <div className="stats-row">
                      <div>
                        <span>Images</span>
                        <strong>{activeProject?.images_count ?? 0}</strong>
                      </div>
                      <div>
                        <span>Annotated</span>
                        <strong>{activeProject?.annotated_count ?? 0}</strong>
                      </div>
                      <div>
                        <span>Classes</span>
                        <strong>{classes.length}</strong>
                      </div>
                    </div>
                  </section>
                  <section className="panel quick-panel">
                    <div className="panel-heading">
                      <div>
                        <h3>Quick access</h3>
                        <p>Jump back into your workflow.</p>
                      </div>
                      <span className="quick-spark">
                        <Sparkles size={15} />
                      </span>
                    </div>
                    {[
                      { icon: ScanLine, title: 'Annotation workspace', sub: 'Label and review your images', to: 'Annotate' },
                      { icon: Layers3, title: 'Dataset versions', sub: 'Prepare data for training', to: 'Versions' },
                      { icon: Play, title: 'Train a model', sub: 'Start a new training run', to: 'Train' },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <button className="quick-link" key={item.title} onClick={() => setActive(item.to)}>
                          <span className="quick-icon">
                            <Icon size={16} />
                          </span>
                          <span className="quick-text">
                            <strong>{item.title}</strong>
                            <small>{item.sub}</small>
                          </span>
                          <ArrowUpRight size={15} className="quick-arrow" />
                        </button>
                      );
                    })}
                  </section>
                </div>
              </>
            ) : (
              <WorkspacePage
                page={active}
                project={activeProject}
                classes={classes}
                onClassesUpdated={() => activeProject && loadClasses(activeProject.id)}
                selectedImage={selectedImage}
                onSelectImage={setSelectedImage}
                projectImages={projectImages}
                currentUser={currentUser}
                setActive={setActive}
                onProjectChanged={(id) => loadProjects(id)}
              />
            )}

            <footer>
              <span>
                ◈ AnoBot <span className="footer-sep">/</span> Computer vision, simplified.
              </span>
              <span>
                BUILT FOR YOUR NEXT BIG IDEA <span className="footer-star">✳</span>
              </span>
            </footer>
          </div>
        </main>
      </div>

      <ProjectModal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        projects={projects}
        activeProject={activeProject}
        onSelectProject={(proj) => {
          setActiveProject(proj);
          loadClasses(proj.id);
          loadProjectImages(proj.id);
        }}
        onProjectCreated={(proj) => {
          loadProjects(proj.id);
        }}
        onProjectDeleted={() => {
          loadProjects();
        }}
      />
    </div>
  );
}

// First-run Admin Setup Screen
function SetupAdminScreen({ onSuccess }: { onSuccess: (user: User) => void }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const user = await api.setupAdmin({
        name: name.trim(),
        username: username.trim().toLowerCase(),
        password,
      });
      onSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Setup failed. Please check inputs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand">
            <span className="brand-mark" style={{ color: '#6706ce' }}>◈</span>
            <span>AnoBot</span>
          </div>
          <h2 className="auth-title">Create Admin Account</h2>
          <p className="auth-subtitle">Welcome! Set up the initial administrator for this AnoBot instance.</p>
        </div>

        {error && <div className="alert-error">{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label className="app-field">
            <span>Full Name</span>
            <input
              placeholder="e.g. Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="app-field">
            <span>Username</span>
            <input
              placeholder="e.g. admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="app-field">
            <span>Password (minimum 8 characters)</span>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label className="app-field">
            <span>Confirm Password</span>
            <input
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </label>

          <button type="submit" className="primary-button" style={{ marginTop: '8px' }} disabled={loading}>
            {loading ? 'Creating account...' : 'Create Admin Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

// User Sign-in Screen
function SignInScreen({ onSuccess }: { onSuccess: (user: User) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const user = await api.login(username.trim().toLowerCase(), password);
      onSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand">
            <span className="brand-mark" style={{ color: '#6706ce' }}>◈</span>
            <span>AnoBot</span>
          </div>
          <h2 className="auth-title">Sign In</h2>
          <p className="auth-subtitle">Enter your credentials to access your computer vision workspace.</p>
        </div>

        {error && <div className="alert-error">{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <label className="app-field">
            <span>Username</span>
            <input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="app-field">
            <span>Password</span>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <button type="submit" className="primary-button" style={{ marginTop: '8px' }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

type WorkspacePageProps = {
  page: string;
  project: Project | null;
  classes: ProjectClass[];
  onClassesUpdated: () => void;
  selectedImage: ImageItem | null;
  onSelectImage: (img: ImageItem | null) => void;
  projectImages: ImageItem[];
  currentUser: User;
  setActive: (v: string) => void;
  onProjectChanged?: (projectId: string) => void;
};

function WorkspacePage({
  page,
  project,
  classes,
  onClassesUpdated,
  selectedImage,
  onSelectImage,
  projectImages,
  currentUser,
  setActive,
  onProjectChanged,
}: WorkspacePageProps) {
  const [notice, setNotice] = useState('');

  // Users management state (Admin)
  const [usersList, setUsersList] = useState<User[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'user'>('user');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [userCreatedPassword, setUserCreatedPassword] = useState<string | null>(null);
  const [userActionError, setUserActionError] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Edit user state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user');
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState('');

  // Password change state (My Account)
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwNotice, setPwNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3500);
  };

  // Fetch users when on Users page
  const loadUsers = async () => {
    if (currentUser.role !== 'admin') return;
    try {
      const data = await api.getUsers();
      setUsersList(data);
    } catch (err: any) {
      setUserActionError(err.message || 'Failed to load users');
    }
  };

  // Fetch audit logs when on Activity Log page
  const loadAuditLogs = async () => {
    if (currentUser.role !== 'admin') return;
    try {
      const data = await api.getAuditLogs({ limit: 50 });
      setAuditLogs(data.items);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (page === 'Users') loadUsers();
    if (page === 'Activity Log') loadAuditLogs();
  }, [page]);

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let res = '';
    for (let i = 0; i < 12; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewUserPassword(res);
  };

  const handleCreateUser = async () => {
    if (!newUserName.trim() || !newUserUsername.trim() || !newUserPassword) {
      setUserActionError('Please fill in Name, Username, and Password.');
      return;
    }
    setUserActionError('');
    try {
      await api.createUser({
        name: newUserName.trim(),
        username: newUserUsername.trim().toLowerCase(),
        role: newUserRole,
        password: newUserPassword,
      });
      setUserCreatedPassword(newUserPassword);
      setNewUserName('');
      setNewUserUsername('');
      setNewUserPassword('');
      loadUsers();
    } catch (err: any) {
      setUserActionError(err.message || 'Failed to create user');
    }
  };

  const handleSaveEditUser = async () => {
    if (!editingUser) return;
    setUserActionError('');
    try {
      await api.updateUser(editingUser.id, {
        name: editName.trim(),
        role: editRole,
        is_active: editActive,
        password: editPassword.trim() || undefined,
      });
      setEditingUser(null);
      loadUsers();
      notify('User updated successfully.');
    } catch (err: any) {
      setUserActionError(err.message || 'Failed to update user');
    }
  };

  const handleDeleteUser = async (id: string) => {
    setUserActionError('');
    try {
      await api.deleteUser(id);
      setDeleteConfirmId(null);
      loadUsers();
      notify('User removed successfully.');
    } catch (err: any) {
      setUserActionError(err.message || 'Failed to remove user');
      setDeleteConfirmId(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPw || !newPw) {
      setPwNotice({ type: 'error', text: 'Please fill in both current and new passwords.' });
      return;
    }
    if (newPw.length < 8) {
      setPwNotice({ type: 'error', text: 'New password must be at least 8 characters long.' });
      return;
    }
    if (newPw !== confirmPw) {
      setPwNotice({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setPwNotice(null);
    try {
      await api.changePassword(currentPw, newPw);
      setPwNotice({ type: 'success', text: 'Password updated successfully!' });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err: any) {
      setPwNotice({ type: 'error', text: err.message || 'Failed to change password.' });
    }
  };

  // Section 6.4: Role guard: users who open an admin route get a 403 screen
  const adminRoutes = ['Users', 'API Keys', 'Activity Log', 'Settings'];
  if (adminRoutes.includes(page) && currentUser.role !== 'admin') {
    return (
      <div className="workspace-page">
        <section className="panel app-panel">
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <ShieldAlert size={48} style={{ color: '#d93a52', margin: '0 auto 14px' }} />
            <h2 style={{ fontSize: '18px', margin: '0 0 8px' }}>403 – Access Forbidden</h2>
            <p className="muted" style={{ maxWidth: '400px', margin: '0 auto 16px' }}>
              You do not have administrative privileges to access this area.
            </p>
            <button className="primary-button" onClick={() => setActive('Overview')}>
              Return to Overview
            </button>
          </div>
        </section>
      </div>
    );
  }

  const card = (heading: string, body: ReactNode) => (
    <section className="panel app-panel">
      <div className="panel-heading">
        <div>
          <h3>{heading}</h3>
        </div>
      </div>
      {body}
    </section>
  );

  const field = (label: string, child: ReactNode) => (
    <label className="app-field">
      <span>{label}</span>
      {child}
    </label>
  );

  const table = (headers: string[], rows: (string | ReactNode)[][]) => (
    <div className="app-table-wrap">
      <table className="app-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!project) {
    return (
      <div className="workspace-page">
        <section className="panel app-panel">
          <p className="muted">No project selected. Create or select a project to proceed.</p>
        </section>
      </div>
    );
  }

  const handleNextImage = () => {
    if (!selectedImage || projectImages.length === 0) return;
    const idx = projectImages.findIndex((img) => img.id === selectedImage.id);
    if (idx !== -1 && idx < projectImages.length - 1) {
      onSelectImage(projectImages[idx + 1]);
    } else if (projectImages.length > 0) {
      onSelectImage(projectImages[0]);
    }
  };

  const handlePrevImage = () => {
    if (!selectedImage || projectImages.length === 0) return;
    const idx = projectImages.findIndex((img) => img.id === selectedImage.id);
    if (idx > 0) {
      onSelectImage(projectImages[idx - 1]);
    } else if (projectImages.length > 0) {
      onSelectImage(projectImages[projectImages.length - 1]);
    }
  };

  return (
    <div className="workspace-page">
      <div className="module-intro">
        <span className="module-kicker">WORKSPACE MODULE</span>
        <span className="module-project">
          {project.name} · {project.type.toUpperCase()}
        </span>
      </div>

      {notice && <div className="app-notice">{notice}</div>}

      {/* Upload Data Screen */}
      {page === 'Upload Data' && (
        <UploadAndGallery
          project={project}
          classes={classes}
          onClassesUpdated={onClassesUpdated}
          onOpenAnnotation={(img) => {
            onSelectImage(img);
            setActive('Annotate');
          }}
        />
      )}

      {/* Annotate Screen */}
      {page === 'Annotate' && (
        selectedImage ? (
          <AnnotationCanvas
            project={project}
            image={selectedImage}
            classes={classes}
            onNext={handleNextImage}
            onPrev={handlePrevImage}
            onAnnotationCountChange={() => onClassesUpdated()}
          />
        ) : (
          <section className="panel app-panel">
            <div className="annotation-empty">
              <ScanLine size={36} />
              <strong>Select an image to begin labeling</strong>
              <span>Upload images in the dataset first, then click on any image to open the labeling canvas.</span>
              <button className="primary-button" onClick={() => setActive('Upload Data')} style={{ marginTop: '12px' }}>
                Go to Upload Data
              </button>
            </div>
          </section>
        )
      )}

      {/* Versions Screen */}
      {(page === 'Versions' || page === 'Export Dataset') && (
        <VersionsAndTrain project={project} initialTab="versions" />
      )}

      {/* Health Check Screen */}
      {page === 'Health Check' && (
        <>
          {card(
            'Dataset health & distribution',
            <div className="metric-grid">
              <div className="metric-card">
                <span>Total Images</span>
                <strong>{project.images_count}</strong>
              </div>
              <div className="metric-card">
                <span>Annotated</span>
                <strong style={{ color: '#12a36b' }}>{project.annotated_count}</strong>
              </div>
              <div className="metric-card">
                <span>Unlabeled</span>
                <strong style={{ color: project.images_count - project.annotated_count > 0 ? '#d97706' : '#12a36b' }}>
                  {project.images_count - project.annotated_count}
                </strong>
              </div>
              <div className="metric-card">
                <span>Classes</span>
                <strong style={{ color: '#6706ce' }}>{classes.length}</strong>
              </div>
            </div>
          )}
          {card(
            'Recommendations',
            <p className="muted">
              {project.images_count === 0
                ? 'Upload your first images to begin model preparation.'
                : project.images_count - project.annotated_count > 0
                ? `You have ${project.images_count - project.annotated_count} unlabeled images. Annotate them before generating a dataset version.`
                : 'All images are labeled! You are ready to generate a dataset version and train your YOLOv8 model.'}
            </p>
          )}
        </>
      )}

      {/* Train Screen */}
      {page === 'Train' && (
        <VersionsAndTrain project={project} initialTab="train" />
      )}

      {/* API Keys Screen (Admin) */}
      {page === 'API Keys' && <AdminApiKeys />}

      {/* Users Screen (Admin Only) */}
      {page === 'Users' && (
        <>
          {userActionError && <div className="alert-error">{userActionError}</div>}
          {userCreatedPassword && (
            <div className="alert-success" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <strong>User created successfully!</strong> Temporary password: <code style={{ background: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{userCreatedPassword}</code>
                <span style={{ display: 'block', fontSize: '10.5px', marginTop: '2px' }}>
                  Please share this password with the user. It will not be shown again.
                </span>
              </div>
              <button className="app-button" onClick={() => setUserCreatedPassword(null)}>Dismiss</button>
            </div>
          )}

          {card(
            'Create User',
            <div className="form-grid">
              {field('Full Name', <input placeholder="e.g. Alex Smith" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />)}
              {field('Username', <input placeholder="e.g. alex" value={newUserUsername} onChange={(e) => setNewUserUsername(e.target.value)} />)}
              {field(
                'Role',
                <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'user')}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              )}
              {field(
                'Temporary Password',
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    placeholder="Temporary password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                  />
                  <button type="button" className="app-button" onClick={generateRandomPassword} title="Generate strong random password">
                    Generate
                  </button>
                </div>
              )}
              <div className="form-span">
                <button type="button" className="primary-button" onClick={handleCreateUser}>
                  Create User
                </button>
              </div>
            </div>
          )}

          {card(
            'Workspace Users',
            table(
              ['Name', 'Username', 'Role', 'Status', 'Last Sign-in', 'Actions'],
              usersList.map((u) => [
                u.name,
                u.username,
                <span key="role" className={`role-badge ${u.role}`}>{u.role.toUpperCase()}</span>,
                <span key="status" className={u.is_active ? 'badge-active' : 'badge-disabled'}>
                  {u.is_active ? 'Active' : 'Disabled'}
                </span>,
                u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never',
                <div key="act" className="table-actions">
                  <button
                    className="app-button"
                    onClick={() => {
                      setEditingUser(u);
                      setEditName(u.name);
                      setEditRole(u.role);
                      setEditActive(u.is_active);
                      setEditPassword('');
                    }}
                  >
                    Edit
                  </button>
                  {deleteConfirmId === u.id ? (
                    <button
                      className="primary-button"
                      style={{ background: '#d93a52', borderColor: '#d93a52', padding: '4px 8px', fontSize: '10px' }}
                      onClick={() => handleDeleteUser(u.id)}
                    >
                      Confirm Delete
                    </button>
                  ) : (
                    <button
                      className="app-button"
                      disabled={u.id === currentUser.id}
                      onClick={() => setDeleteConfirmId(u.id)}
                      title={u.id === currentUser.id ? 'Cannot delete own account' : 'Remove user'}
                    >
                      Remove
                    </button>
                  )}
                </div>,
              ])
            )
          )}

          {/* Edit User Modal */}
          {editingUser && (
            <div className="modal-overlay">
              <div className="modal-content">
                <h3 style={{ margin: '0 0 16px' }}>Edit User: @{editingUser.username}</h3>
                <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                  {field('Full Name', <input value={editName} onChange={(e) => setEditName(e.target.value)} />)}
                  {field(
                    'Role',
                    <select value={editRole} onChange={(e) => setEditRole(e.target.value as 'admin' | 'user')}>
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                  <label className="check-row" style={{ margin: '5px 0' }}>
                    <input
                      type="checkbox"
                      checked={editActive}
                      disabled={editingUser.id === currentUser.id}
                      onChange={(e) => setEditActive(e.target.checked)}
                    />
                    <span>Account Active {editingUser.id === currentUser.id && '(Cannot disable self)'}</span>
                  </label>
                  {field(
                    'Reset Password (leave empty to keep current)',
                    <input
                      type="password"
                      placeholder="New password (optional)"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                    />
                  )}
                </div>
                <div className="modal-actions">
                  <button className="app-button" onClick={() => setEditingUser(null)}>Cancel</button>
                  <button className="primary-button" onClick={handleSaveEditUser}>Save Changes</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Activity Log Screen (Admin Only) */}
      {page === 'Activity Log' && (
        <>
          {card(
            'Activity Log',
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <p className="muted" style={{ margin: 0 }}>Recent security and management audit events.</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="app-button" onClick={loadAuditLogs}>Refresh</button>
                  <button
                    className="app-button"
                    onClick={async () => {
                      if (confirm('Are you sure you want to clear the audit log? This action is itself logged.')) {
                        await api.clearAuditLogs();
                        loadAuditLogs();
                      }
                    }}
                  >
                    Clear Log
                  </button>
                </div>
              </div>
              {table(
                ['Time', 'User', 'Action', 'Target', 'IP'],
                auditLogs.map((log) => [
                  new Date(log.created_at).toLocaleString(),
                  log.username || 'System',
                  <strong>{log.action}</strong>,
                  log.target_type ? `${log.target_type} (${log.target_id?.slice(0, 8)}...)` : '—',
                  log.ip || '—',
                ])
              )}
            </>
          )}
        </>
      )}

      {/* My Account Screen (All Authenticated Users) */}
      {page === 'My account' && (
        <>
          {card(
            'Profile Summary',
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="metric-card">
                <span>Full Name</span>
                <strong style={{ fontSize: '15px' }}>{currentUser.name}</strong>
              </div>
              <div className="metric-card">
                <span>Username</span>
                <strong style={{ fontSize: '15px' }}>@{currentUser.username}</strong>
              </div>
              <div className="metric-card">
                <span>Role</span>
                <strong style={{ fontSize: '15px', color: '#6706ce' }}>{currentUser.role.toUpperCase()}</strong>
              </div>
              <div className="metric-card">
                <span>Last Sign-in</span>
                <strong style={{ fontSize: '13px' }}>
                  {currentUser.last_login_at ? new Date(currentUser.last_login_at).toLocaleDateString() : 'Active now'}
                </strong>
              </div>
            </div>
          )}

          {card(
            'Change Password',
            <form onSubmit={handleChangePassword} style={{ maxWidth: '520px' }}>
              {pwNotice && (
                <div className={pwNotice.type === 'error' ? 'alert-error' : 'alert-success'}>
                  {pwNotice.text}
                </div>
              )}
              <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: '12px' }}>
                {field(
                  'Current Password',
                  <input
                    type="password"
                    placeholder="Enter current password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    required
                  />
                )}
                {field(
                  'New Password (minimum 8 characters)',
                  <input
                    type="password"
                    placeholder="Enter new password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    required
                  />
                )}
                {field(
                  'Confirm New Password',
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    required
                  />
                )}
                <div style={{ marginTop: '6px' }}>
                  <button type="submit" className="primary-button">
                    Update Password
                  </button>
                </div>
              </div>
            </form>
          )}
        </>
      )}

      {/* Model Visualizer & Video Inference */}
      {(page === 'Visualize' || page === 'Video') && (
        <ModelVisualize project={project} projectImages={projectImages} />
      )}

      {/* Deployments & API Keys */}
      {page === 'Deployments' && <DeploymentsView project={project} />}

      {/* Workflows */}
      {page === 'Workflows' && <WorkflowsView project={project} />}

      {/* Admin Settings & Disaster Recovery */}
      {page === 'Settings' && <SettingsView />}

      {/* Universe Open Dataset Catalog */}
      {page === 'Universe' && (
        <UniverseView
          onForkSuccess={(newId) => {
            if (onProjectChanged) onProjectChanged(newId);
            setActive('Upload Data');
          }}
        />
      )}
    </div>
  );
}
