// src/App.jsx
import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import Login from './pages/Login';
import Todos from './pages/Todos';
import TodoPage from './pages/TodoPage';
import Feedback from './pages/Feedback';
import Account from './pages/Account';
import Footer from './components/Footer';
import Sidebar from './components/Sidebar';
import { isAuthenticated, removeAuthToken } from './lib/auth';
import './App.css';

function ProtectedRoute({ children }) {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const location = useLocation();

  React.useEffect(() => {
    const auth = isAuthenticated();
    setAuthenticated(auth);
    setAuthChecked(true);
  }, [location.pathname]);

  if (!authChecked) {
    return <div>Loading...</div>;
  }

  return authenticated ? children : <Navigate to="/login" state={{ from: location }} replace />;
}

function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const authenticated = isAuthenticated();

  const handleLogout = () => {
    removeAuthToken();
    navigate('/login');
  };

  if (location.pathname === '/login') {
    return null;
  }

  if (!authenticated) {
    return null;
  }

  return (
    <nav className="main-nav">
      <div className="nav-container">
        <div className="nav-links">
          <Link to="/todos" className={location.pathname === '/todos' ? 'active' : ''}>
            My Todos
          </Link>
          <Link to="/account" className={location.pathname === '/account' ? 'active' : ''}>
            My Account
          </Link>
          <Link to="/feedback" className={location.pathname === '/feedback' ? 'active' : ''}>
            Feedback
          </Link>
        </div>
        
        <div className="nav-title">
          <span className="nav-title-white">Work</span>
          <span className="nav-title-pink">Rhythmn</span>
        </div>
        
        <button onClick={handleLogout} className="logout-btn">
          Logout
        </button>
      </div>
    </nav>
  );
}

function AppContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState('all');
  const [urgentCount, setUrgentCount] = useState(0);
  const location = useLocation();
  
  const showSidebar = location.pathname !== '/login';

  React.useEffect(() => {
    const handleUrgentCountUpdate = (event) => {
      setUrgentCount(event.detail);
    };
    window.addEventListener('urgentCountUpdate', handleUrgentCountUpdate);
    return () => window.removeEventListener('urgentCountUpdate', handleUrgentCountUpdate);
  }, []);

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {showSidebar && (
        <Sidebar 
          isCollapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          activeFilter={sidebarFilter}
          onFilterChange={(filter) => {
            setSidebarFilter(filter);
            window.dispatchEvent(new CustomEvent('filterChange', { detail: filter }));
          }}
          urgentCount={urgentCount}
        />
      )}
      <div className="main-content">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/todos" element={<ProtectedRoute><Todos /></ProtectedRoute>} />
          <Route path="/todos/:id" element={<ProtectedRoute><TodoPage /></ProtectedRoute>} />
          <Route path="/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
          <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/todos" replace />} />
          <Route path="*" element={<Navigate to="/todos" replace />} />
        </Routes>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Navigation />
      <AppContent />
      <Footer />
    </BrowserRouter>
  );
}

export default App;