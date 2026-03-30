import { X } from '../icons';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * UnifiedModal - Modal component for Add/Edit operations
 *
 * @param {boolean} isOpen - Whether the modal is open
 * @param {function} onClose - Callback when modal is closed
 * @param {string} title - Modal title (e.g., "Add Credential", "Edit Endpoint")
 * @param {ReactNode} children - Form content
 * @param {function} onSubmit - Callback when form is submitted
 * @param {boolean} isSubmitting - Whether form is currently submitting
 * @param {string} submitLabel - Label for submit button (default: "Save")
 * @param {string} size - Modal size: 'sm', 'md', 'lg', 'xl' (default: 'md')
 */
const UnifiedModal = ({
  isOpen,
  onClose,
  title,
  children,
  onSubmit,
  isSubmitting = false,
  submitLabel = 'Save',
  size = 'md'
}) => {
  const { isOperator } = useTheme();

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(e);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm ${isOperator ? 'bg-slate-950/72' : 'bg-black/50'}`}
      onClick={handleBackdropClick}
    >
      <div className={`w-full ${sizeClasses[size]} mx-4 max-h-[90vh] flex flex-col rounded-lg ${isOperator
        ? 'border border-cyan-500/20 bg-[linear-gradient(180deg,rgba(8,15,36,0.96),rgba(2,6,23,0.92))] shadow-[0_28px_80px_rgba(2,6,23,0.7),0_0_0_1px_rgba(34,211,238,0.08)]'
        : 'bg-white dark:bg-neutral-800 shadow-xl'
        }`}>
        <div className={`flex items-center justify-between px-6 py-4 ${isOperator ? 'border-b border-cyan-500/20' : 'border-b border-neutral-200 dark:border-neutral-700'}`}>
          <h3 className={`text-lg font-semibold ${isOperator ? 'text-slate-50' : 'text-neutral-900 dark:text-neutral-100'}`}>{title}</h3>
          <button
            onClick={onClose}
            className={`rounded p-1 transition-colors ${isOperator
              ? 'text-slate-500 hover:bg-cyan-500/10 hover:text-cyan-100'
              : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-300'
              }`}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className={`px-6 py-4 ${isOperator ? 'text-slate-200' : ''}`}>
            {children}
          </div>

          <div className={`flex items-center justify-end gap-3 px-6 py-4 ${isOperator
            ? 'border-t border-cyan-500/20 bg-slate-950/50'
            : 'border-t border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900'
            }`}>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${isOperator
                ? 'border border-slate-700 bg-slate-900/80 text-slate-300 hover:border-cyan-500/20 hover:bg-slate-800 hover:text-slate-100'
                : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700'
                }`}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isOperator
                ? 'bg-primary-600 shadow-[0_10px_24px_rgba(8,145,178,0.28)] hover:bg-primary-500'
                : 'bg-primary-600 dark:bg-primary-700 hover:bg-primary-700 dark:hover:bg-primary-600'
                }`}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </span>
              ) : (
                submitLabel
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UnifiedModal;
