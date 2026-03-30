/**
 * Button component with theme variants
 */
import PropTypes from 'prop-types';
import { useTheme } from '../../contexts/ThemeContext';

const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  type = 'button',
  className = '',
  ...props
}) => {
  const { isOperator } = useTheme();

  const baseClasses = `font-medium rounded-md transition-smooth focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${isOperator ? 'focus:ring-offset-slate-950' : ''}`;

  const variants = isOperator
    ? {
      primary: 'bg-primary-600 text-white shadow-[0_10px_24px_rgba(8,145,178,0.28)] hover:bg-primary-500 hover:shadow-[0_14px_32px_rgba(8,145,178,0.38)] active:bg-primary-700',
      secondary: 'border border-cyan-500/20 bg-slate-900/85 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-cyan-400/35 hover:bg-slate-800 active:bg-slate-900',
      danger: 'bg-error-600 text-white shadow-[0_10px_24px_rgba(220,38,38,0.24)] hover:bg-error-500 active:bg-error-700',
      ghost: 'text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-100 active:bg-cyan-500/15',
    }
    : {
      primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800',
      secondary: 'bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-50 active:bg-neutral-100',
      danger: 'bg-error-600 text-white hover:bg-error-700 active:bg-error-800',
      ghost: 'text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200',
    };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

Button.propTypes = {
  children: PropTypes.node,
  variant: PropTypes.oneOf(['primary', 'secondary', 'danger', 'ghost']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  className: PropTypes.string,
};

export default Button;
