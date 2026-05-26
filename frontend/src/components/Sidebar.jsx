// src/components/Sidebar.jsx
import React from 'react';

export default function Sidebar({ 
  isCollapsed, 
  onToggle, 
  activeFilter, 
  onFilterChange,
  urgentCount 
}) {

  const handleFilterClick = (filter) => {
    onFilterChange(filter);
  };

  return (
    <>
      <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <span>Menu</span>
        </div>
        
        <div className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">TASKS</div>
            
            <div 
              className={`sidebar-link ${activeFilter === 'all' ? 'active' : ''}`}
              onClick={() => handleFilterClick('all')}
            >
              <div className="sidebar-icon">▸</div>
              <span>All Tasks</span>
            </div>
            
            <div 
              className={`sidebar-link ${activeFilter === 'completed' ? 'active' : ''}`}
              onClick={() => handleFilterClick('completed')}
            >
              <div className="sidebar-icon">✓</div>
              <span>Completed</span>
            </div>
            
            <div 
              className={`sidebar-link ${activeFilter === 'doitnow' ? 'active' : ''}`}
              onClick={() => handleFilterClick('doitnow')}
            >
              <div className="sidebar-icon">!</div>
              <span>Do it now</span>
              {urgentCount > 0 && (
                <div className="sidebar-badge">{urgentCount}</div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Toggle button is outside the sidebar now */}
      <div className="sidebar-toggle" onClick={onToggle}>
        <span className="toggle-icon">{isCollapsed ? '»' : '«'}</span>
      </div>
    </>
  );
}