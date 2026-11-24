import './AuthLayout.css';
import { useTheme } from '../context/ThemeContext';
import logoDark from '../assets/loandna_logo_dark.png';
import logoLight from '../assets/loandna_logo_light.png';

const AuthLayout = ({ children, title = "", subtitle }) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="auth-background flex items-center justify-center font-creato py-4 sm:py-10 px-3 sm:px-0 relative min-h-[100dvh]">
      {/* Top right theme toggle for Auth screens */}
      <div className="absolute top-4 right-4 z-20">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all cursor-pointer border border-white/20 shadow-md focus:outline-none"
        >
          {isDark ? (
            <svg className="w-4 h-4 text-sky-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>
      </div>

      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="auth-circle auth-circle-left"></div>
        <div className="auth-circle auth-circle-right"></div>
        <div className="auth-bottom-curve"></div>
      </div>

      {/* Content card */}
      <div className="relative z-10 w-full max-w-md px-2 sm:px-0 my-auto">
        <div className="bg-[var(--bg-surface)] backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden p-5 sm:p-8 w-full border border-[var(--border)] transition-colors duration-200">
          <div className="flex justify-center mb-6">
            <img
              src={isDark ? logoLight : logoDark}
              alt="LoanDNA Logo"
              className="h-[48px] object-contain transition-opacity duration-200"
            />
          </div>
          
          <h2 className={`text-center text-xl font-medium text-[var(--text-primary)] ${subtitle ? '' : 'mb-6'}`}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-center text-sm text-[var(--text-secondary)] mt-1 mb-6">
              {subtitle}
            </p>
          )}

          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
