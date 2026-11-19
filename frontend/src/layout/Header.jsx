import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logoDark from '../assets/loandna_logo_dark.png';
import logoLight from '../assets/loandna_logo_light.png';

const Header = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const navLinks = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Ingest Data', path: '/upload' },
    { name: 'Data Dictionary', path: '/data-dictionary' },
  ];

  const isAnyAdmin = (role) => {
    const lower = (role || '').trim().toLowerCase();
    return (
      lower === 'super admin' ||
      lower === 'super_admin' ||
      lower === 'admin' ||
      (lower.includes('admin') && lower.includes('pre')) ||
      (lower.includes('admin') && lower.includes('junior')) ||
      lower.includes('admin')
    );
  };

  const canAccessUserManagement = (role) => isAnyAdmin(role);
  const canAccessProhance = (role) => isAnyAdmin(role);

  if (canAccessUserManagement(user?.role)) {
    navLinks.push({ name: 'User Management', path: '/users' });
  }

  if (canAccessProhance(user?.role)) {
    navLinks.push({ name: 'Prohance', path: '/prohance' });
  }

  const formatRole = (role) => {
    if (!role || role === '--selected--') return 'User';
    const lower = role.toLowerCase();
    if (lower === 'super admin' || lower === 'super_admin' || lower === 'admin') return 'Super Admin';
    if (lower.includes('admin') && lower.includes('pre')) return 'Admin (Pre-UW)';
    if (lower.includes('admin') && lower.includes('junior')) return 'Admin (Junior-UW)';
    if (lower.includes('pre')) return 'Pre Underwriter';
    if (lower.includes('junior')) return 'Junior Underwriter';
    return role;
  };

  return (
    <header className="w-full h-[60px] bg-[var(--bg-header)] border-b border-[var(--border)] shadow-sm flex items-center px-4 sm:px-6 justify-between z-50 fixed top-0 left-0 transition-colors duration-200">
      {/* Left Side: Logo & Navigation */}
      <div className="flex items-center space-x-3 sm:space-x-6 lg:space-x-8 h-full flex-1 min-w-0 mr-4">
        {/* Logo area */}
        <div className="flex items-center pr-4 sm:pr-6 lg:pr-8 border-r border-[var(--border)] h-full cursor-pointer flex-shrink-0">
          <Link to="/dashboard">
            <img
              src={isDark ? logoLight : logoDark}
              alt="LoanDNA Logo"
              className="h-[32px] sm:h-[35px] w-auto flex-shrink-0 transition-opacity duration-200"
              onError={(e) => {
                e.target.style.display = 'none';
                if (e.target.parentElement) {
                  const h2 = document.createElement('h2');
                  h2.style.color = 'var(--primary)';
                  h2.style.margin = '0';
                  h2.style.fontSize = '20px';
                  h2.style.fontWeight = 'bold';
                  h2.innerText = 'loanDNA';
                  e.target.parentElement.appendChild(h2);
                }
              }}
            />
          </Link>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex flex-1 h-full items-center overflow-x-auto no-scrollbar">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path || location.pathname.startsWith(link.path + '/');
            return (
              <Link
                key={link.name}
                to={link.path}
                className={`flex items-center px-3 sm:px-4 lg:px-6 h-full cursor-pointer transition-colors relative text-[13px] sm:text-[14px] lg:text-[15px] whitespace-nowrap font-creato flex-shrink-0 ${
                  isActive
                    ? 'text-[var(--primary)] font-bold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] font-normal'
                }`}
              >
                <span>{link.name}</span>
                {/* Active Bottom Border in --primary */}
                {isActive && (
                  <div className="absolute bottom-0 left-0 w-full h-[3px] bg-[var(--primary)] rounded-t-sm" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Right Side: Theme Toggle Button & User Profile */}
      <div className="flex items-center space-x-3 sm:space-x-4 flex-shrink-0">
        {/* Quick-Access Light/Dark Toggle in Header */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border)] transition-colors cursor-pointer flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]/25"
        >
          {isDark ? (
            <svg className="w-4 h-4 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* User Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center space-x-3 p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors focus:outline-none cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-bold text-sm shadow-sm font-creato">
              {(user?.username || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="hidden md:flex flex-col text-left">
              <span className="text-[15px] font-semibold text-[var(--text-primary)] leading-tight font-creato">
                {user?.username || 'User'}
              </span>
              <span className="text-[13px] text-[var(--text-secondary)] capitalize font-creato">
                {formatRole(user?.role)}
              </span>
            </div>
            <svg
              className={`w-4 h-4 text-[var(--text-secondary)] transition-transform ${
                isDropdownOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* User Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-60 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-xl py-2 z-50 animate-fadeIn font-creato">
              <div className="px-4 py-2 border-b border-[var(--border)]">
                <p className="text-xs text-[var(--text-disabled)]">Signed in as</p>
                <p className="text-sm font-bold text-[var(--text-primary)] truncate">{user?.username || 'User'}</p>
                <p className="text-xs text-[var(--text-secondary)] truncate">{user?.email || ''}</p>
              </div>

              <div className="pt-2 px-2">
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    logout();
                    navigate('/login', { replace: true });
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--error)] rounded-lg hover:bg-[var(--error-bg)] transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4 text-[var(--error)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
