import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logoDark from '../assets/loandna_logo_dark.png';
import logoLight from '../assets/loandna_logo_light.png';

const Header = () => {
  const { user, logout } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close desktop dropdown when clicking outside
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

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // Close menus on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
        setIsDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  const navLinks = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'Ingest Data',
      path: '/upload',
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      ),
    },
    {
      name: 'Data Dictionary',
      path: '/data-dictionary',
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
  ];

  if (canAccessUserManagement(user?.role)) {
    navLinks.push({
      name: 'User Management',
      path: '/users',
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    });
  }

  if (canAccessProhance(user?.role)) {
    navLinks.push({
      name: 'Prohance',
      path: '/prohance',
      icon: (
        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    });
  }

  const renderLogo = (imgClassName) => (
    <Link to="/dashboard" aria-label="Go to Dashboard" className="flex items-center">
      <img
        src={isDark ? logoLight : logoDark}
        alt="LoanDNA Logo"
        className={imgClassName}
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
  );

  return (
    <>
      <header className="w-full h-[60px] bg-[var(--bg-header)] border-b border-[var(--border)] shadow-sm flex items-center px-3 sm:px-6 justify-between z-40 fixed top-0 left-0 transition-colors duration-200">
        {/* Left Side: Brand Logo & Desktop Navigation */}
        <div className="flex items-center space-x-3 sm:space-x-6 lg:space-x-8 h-full flex-1 min-w-0 mr-2 sm:mr-4">
          {/* Logo area */}
          <div className="flex items-center pr-3 sm:pr-6 lg:pr-8 md:border-r border-[var(--border)] h-full cursor-pointer flex-shrink-0">
            {renderLogo("h-[28px] sm:h-[35px] w-auto flex-shrink-0 transition-opacity duration-200")}
          </div>

          {/* Desktop Navigation Tabs (Hidden on mobile) */}
          <nav className="hidden md:flex flex-1 h-full items-center overflow-x-auto no-scrollbar">
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

        {/* Right Side: Theme Toggle, User Profile & Mobile Menu Toggle */}
        <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
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

          {/* Desktop User Profile Dropdown */}
          <div className="relative hidden sm:block" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center space-x-2 sm:space-x-3 p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors focus:outline-none cursor-pointer"
              aria-label="User account menu"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-bold text-sm shadow-sm font-creato">
                {(user?.username || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span className="text-[14px] lg:text-[15px] font-semibold text-[var(--text-primary)] leading-tight font-creato">
                  {user?.username || 'User'}
                </span>
                <span className="text-[12px] lg:text-[13px] text-[var(--text-secondary)] capitalize font-creato">
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

            {/* Desktop User Dropdown Menu */}
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

          {/* Mobile Menu Toggle Button (Visible only on < md screens) */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
            aria-expanded={isMobileMenuOpen}
            className="md:hidden p-2 rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border)] transition-colors cursor-pointer flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]/25"
          >
            {isMobileMenuOpen ? (
              <svg className="w-5 h-5 text-[var(--text-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-[var(--text-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer & Backdrop (Rendered on < md screens) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex justify-end">
          {/* Backdrop overlay with blur */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-backdropFadeIn transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <aside
            className="relative w-[290px] max-w-[85vw] h-full bg-[var(--bg-surface)] border-l border-[var(--border)] shadow-2xl flex flex-col justify-between z-10 animate-slideDrawerIn font-creato overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Menu"
          >
            {/* Top Section: Header & User Details */}
            <div className="flex flex-col">
              {/* Drawer Top Bar */}
              <div className="h-[60px] px-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-header)] shrink-0">
                <div className="flex items-center">
                  {renderLogo("h-[26px] w-auto")}
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border)] transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* User Profile Card in Drawer */}
              <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-elevated)]/40 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                  {(user?.username || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                    {user?.username || 'User'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/20">
                      {formatRole(user?.role)}
                    </span>
                  </div>
                  {user?.email && (
                    <p className="text-xs text-[var(--text-secondary)] truncate mt-1">
                      {user.email}
                    </p>
                  )}
                </div>
              </div>

              {/* Navigation Links */}
              <div className="py-3 px-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-disabled)] px-3 mb-2">
                  Navigation
                </p>
                <nav className="space-y-1">
                  {navLinks.map((link) => {
                    const isActive = location.pathname === link.path || location.pathname.startsWith(link.path + '/');
                    return (
                      <Link
                        key={link.name}
                        to={link.path}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                          isActive
                            ? 'bg-[var(--primary-soft)] text-[var(--primary)] font-bold border-l-4 border-[var(--primary)] shadow-2xs'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                        }`}
                      >
                        <span className={isActive ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'}>
                          {link.icon}
                        </span>
                        <span>{link.name}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </div>

            {/* Bottom Section: Theme & Sign Out */}
            <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-header)]/60 space-y-3 shrink-0">
              {/* Theme toggle row */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-medium text-[var(--text-secondary)]">Appearance</span>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                >
                  {isDark ? (
                    <>
                      <svg className="w-3.5 h-3.5 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      Dark
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                      Light
                    </>
                  )}
                </button>
              </div>

              {/* Sign Out Button */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  logout();
                  navigate('/login', { replace: true });
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold text-[var(--error)] bg-[var(--error-bg)] hover:opacity-90 rounded-xl transition-all cursor-pointer border border-[var(--error)]/20"
              >
                <svg className="w-4 h-4 text-[var(--error)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};

export default Header;
