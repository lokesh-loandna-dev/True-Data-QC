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
    focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]/25
  `;

  // primary: --primary with white text, hover --primary-hover
  // outline: --border-strong border and --text-primary text
  // success and danger: status tokens
  const variantClasses = {
    primary:
      'bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-hover)] text-white cursor-pointer disabled:bg-[var(--bg-muted)] disabled:text-[var(--text-disabled)] disabled:border disabled:border-[var(--border)] disabled:cursor-not-allowed shadow-sm',
    outline:
      'bg-transparent border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--primary-soft)] hover:border-[var(--primary)] active:bg-[var(--primary-soft)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
    secondary:
      'bg-[var(--bg-elevated)] hover:bg-[var(--bg-muted)] border border-[var(--border)] text-[var(--text-primary)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
    success:
      'bg-[var(--success)] hover:opacity-90 active:opacity-95 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm',
    danger:
      'bg-[var(--error)] hover:opacity-90 active:opacity-95 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm',
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
