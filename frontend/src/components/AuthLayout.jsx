import React from 'react';
import './AuthLayout.css';
import loandnaLogo from '../assets/loandna_logo_dark.png';

const AuthLayout = ({ children, title = "", subtitle }) => {
  return (
    <div className="auth-background flex items-center justify-center font-creato py-6 sm:py-10">
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="auth-circle auth-circle-left"></div>
        <div className="auth-circle auth-circle-right"></div>
        <div className="auth-bottom-curve"></div>
      </div>

      {/* Content card */}
      <div className="relative z-10 w-full max-w-md px-4 sm:px-0 my-auto">
        <div className="bg-white backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden p-6 sm:p-8 w-full border border-gray-100">
          <div className="flex justify-center mb-6">
            <img src={loandnaLogo} alt="LoanDNA Logo" className="h-[48px] object-contain" />
          </div>
          
          <h2 className={`text-center text-xl font-medium text-gray-800 ${subtitle ? '' : 'mb-6'}`}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-center text-sm text-gray-500 mt-1 mb-6">
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
