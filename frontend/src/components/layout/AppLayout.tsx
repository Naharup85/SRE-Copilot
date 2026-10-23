import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Layers, 
  Rocket, 
  LogOut, 
  Terminal
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Terminal size={18} />
          </div>
          <div className="sidebar-logo-text">
            SRE <span>Copilot</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Overview</div>
          <NavLink 
            to="/" 
            end 
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <LayoutDashboard size={16} />
            Dashboard
          </NavLink>

          <div className="sidebar-section-label" style={{ marginTop: '16px' }}>Manage</div>
          <NavLink 
            to="/applications" 
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <Layers size={16} />
            Applications
          </NavLink>

          <NavLink 
            to="/deployments" 
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <Rocket size={16} />
            Deployments
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {userInitial}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name" title={user?.name}>
                {user?.name || 'Engineer'}
              </div>
              <div className="sidebar-user-email" title={user?.email}>
                {user?.email || 'sre@local'}
              </div>
            </div>
            <button 
              type="button" 
              className="logout-btn" 
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
