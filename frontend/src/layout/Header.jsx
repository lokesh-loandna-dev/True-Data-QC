import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/loandna_logo_dark.png';

const Header = () => {
  const { user, logout } = useAuth();
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

  const isSuperAdmin = (role) => {
    const lower = (role || '').toLowerCase();
    return lower === 'super admin' || lower === 'super_admin' || lower === 'admin';
  };

  if (isSuperAdmin(user?.role)) {
    navLinks.push({ name: 'User Management', path: '/users' });
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
    <header className="w-full h-[60px] bg-white border-b border-[#e8e8e8] shadow-sm flex items-center px-4 sm:px-6 justify-between z-50 fixed top-0 left-0">
      {/* Left Side: Logo & Navigation */}
      <div className="flex items-center space-x-3 sm:space-x-6 lg:space-x-8 h-full flex-1 min-w-0 mr-4">
        {/* Logo area */}
        <div className="flex items-center pr-4 sm:pr-6 lg:pr-8 border-r border-gray-100 h-full cursor-pointer flex-shrink-0">
          <Link to="/dashboard">
            <img
              src={logo}
              alt="LoanDNA Logo"
              className="h-[32px] sm:h-[35px] w-auto flex-shrink-0"
              onError={(e) => {
                e.target.style.display = 'none';
                if (e.target.parentElement) {
                  const h2 = document.createElement('h2');
                  h2.style.color = '#1e9bd8';
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
                className={`flex items-center px-3 sm:px-4 lg:px-6 h-full cursor-pointer transition-colors relative text-[13px] sm:text-[14px] lg:text-[15px] whitespace-nowrap font-creato flex-shrink-0 ${isActive
                    ? 'text-[#1e9bd8] font-bold'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50 font-normal'
                  }`}
              >
                <span>{link.name}</span>
                {/* Active Bottom Border */}
                {isActive && (
                  <div className="absolute bottom-0 left-0 w-full h-[3px] bg-[#3ba5d8] rounded-t-sm" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Right Side: User Profile & Role Info */}
      <div className="flex items-center space-x-4 flex-shrink-0">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center space-x-3 p-1.5 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-[#1e9bd8] text-white flex items-center justify-center font-bold text-sm shadow-sm font-creato">
              {(user?.username || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="hidden md:flex flex-col text-left">
              <span className="text-[15px] font-semibold text-gray-800 leading-tight font-creato">
                {user?.username || 'User'}
              </span>
              <span className="text-[13px] text-gray-400 capitalize font-creato">
                {formatRole(user?.role)}
              </span>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''
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
            <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50 animate-fadeIn font-creato">
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="text-xs text-gray-400">Signed in as</p>
                <p className="text-sm font-bold text-gray-800 truncate">{user?.username || 'User'}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email || ''}</p>
              </div>

              <div className="pt-2 px-2">
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    logout();
                    navigate('/login', { replace: true });
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
