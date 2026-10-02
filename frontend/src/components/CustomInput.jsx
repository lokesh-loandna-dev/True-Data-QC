import React, { useState, memo } from 'react';

const CustomInput = memo(({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  onBlur,
  error,
  required = false,
  icon,
  rightIcon,
  onRightIconClick,
  className = 'mb-4 w-full',
  height = 'h-11',
  allowClear = true,
  ...props
}) => {
  const [passwordVisible, setPasswordVisible] = useState(false);

  const isPassword = type === 'password';
  const inputType = isPassword ? (passwordVisible ? 'text' : 'password') : type;

  const handleClear = (e) => {
    e.preventDefault();
    if (onChange) {
      onChange({ target: { value: '' } });
    }
  };

  return (
    <div className={`${className} font-creato`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center">
          {required && <span className="text-red-500 mr-1">*</span>}
          {label}
        </label>
      )}
      
      <div className="relative flex items-center">
        {/* Leading Icon */}
        {icon && (
          <div className="absolute left-3.5 text-gray-400 flex items-center justify-center pointer-events-none">
            {icon}
          </div>
        )}

        {/* Input Field */}
        <input
          type={inputType}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          className={`
            block w-full rounded-lg border text-base text-gray-800 placeholder-gray-400
            transition-all duration-150 bg-white
            ${height}
            ${icon ? 'pl-11' : 'pl-3.5'}
            ${(rightIcon || isPassword || (allowClear && value)) ? 'pr-11' : 'pr-3.5'}
            ${error 
              ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/25' 
              : 'border-gray-300 focus:border-[#24A1DD] focus:ring-1 focus:ring-[#24A1DD]/25'
            }
            focus:outline-none
          `}
          {...props}
        />

        {/* Action icons wrapper (right side) */}
        <div className="absolute right-3.5 flex items-center gap-1.5 text-gray-400">
          {/* Clear Button */}
          {allowClear && value && !isPassword && (
            <button
              type="button"
              onClick={handleClear}
              className="hover:text-gray-600 transition cursor-pointer flex items-center justify-center p-0.5 rounded-full hover:bg-gray-100"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Password Visibility Toggle */}
          {isPassword && (
            <button
              type="button"
              onClick={() => setPasswordVisible(!passwordVisible)}
              className="hover:text-gray-600 transition cursor-pointer flex items-center justify-center"
            >
              {passwordVisible ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532-7.532l-12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          )}

          {/* Custom Suffix Suffix Icon */}
          {rightIcon && (
            <div
              onClick={onRightIconClick}
              className={`flex items-center justify-center ${onRightIconClick ? 'cursor-pointer hover:text-gray-600' : ''}`}
            >
              {rightIcon}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
});

CustomInput.displayName = 'CustomInput';

export default CustomInput;
