import React from 'react';

const CustomButton = ({
  children,
  type = 'button',
  variant = 'primary',
  className = '',
  onClick,
  disabled = false,
  height = 'h-11',
  ...props
}) => {
  const baseClasses = `
    w-full ${height}
    inline-flex items-center justify-center
    rounded-lg text-base font-medium
    transition-all duration-150
    focus:outline-none
  `;

  const variantClasses = {
    primary: 'bg-[#24A1DD] hover:bg-[#1e95ce] active:bg-[#1a85b9] text-white cursor-pointer disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed',
    outline: 'bg-transparent border border-[#24A1DD] text-[#24A1DD] hover:bg-sky-50 active:bg-sky-100 cursor-pointer',
    secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700 cursor-pointer'
  };

  const effectiveClass = `${baseClasses} ${variantClasses[variant] || variantClasses.primary} ${className}`;

  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={effectiveClass}
      {...props}
    >
      <span className="flex items-center justify-center gap-2">
        {children}
      </span>
    </button>
  );
};

export default CustomButton;
