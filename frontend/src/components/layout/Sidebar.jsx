import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Logo, LayoutDashboard, FileText, Terminal, Settings, ChevronLeft, ChevronRight } from '../icons';
import { usePendingCommands } from '../../contexts/PendingCommandsContext';
import { useTheme } from '../../contexts/ThemeContext';

const Sidebar = ({ onToggle }) => {
  const { isDark, isOperator } = useTheme();
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const { pendingCount } = usePendingCommands();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Assessments', href: '/assessments', icon: FileText },
    { name: 'Commands', href: '/commands', icon: Terminal, showBadge: true },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const shouldShowExpanded = isExpanded || isHovered;
  const isAssessmentsPage = location.pathname.startsWith('/assessments');

  React.useEffect(() => {
    if (onToggle) {
      onToggle(shouldShowExpanded);
    }
  }, [shouldShowExpanded, onToggle]);

  return (
    <aside
      className={`relative flex h-screen flex-col transition-all duration-300 ${shouldShowExpanded ? 'w-64' : 'w-16'} ${isOperator
        ? `bg-slate-950/88 backdrop-blur-xl ${isAssessmentsPage ? '' : 'border-r border-cyan-500/20'} shadow-[24px_0_60px_rgba(2,6,23,0.45)]`
        : `bg-white dark:bg-neutral-800 ${isAssessmentsPage ? '' : 'border-r border-neutral-200 dark:border-neutral-700'}`
        }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isOperator && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-cyan-400/10 via-cyan-400/4 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/5" />
        </>
      )}

      <div className="absolute -right-3 top-4 z-50">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-all ${isOperator
            ? 'border-cyan-500/30 bg-slate-900 text-slate-200 hover:border-cyan-400/50 hover:bg-slate-800 hover:shadow-[0_0_18px_rgba(34,211,238,0.22)]'
            : 'border-neutral-200 bg-white hover:shadow-md dark:border-neutral-600 dark:bg-neutral-700'
            }`}
        >
          {shouldShowExpanded ? (
            <ChevronLeft className={`h-3 w-3 ${isOperator ? 'text-cyan-200' : 'text-neutral-600 dark:text-neutral-300'}`} />
          ) : (
            <ChevronRight className={`h-3 w-3 ${isOperator ? 'text-cyan-200' : 'text-neutral-600 dark:text-neutral-300'}`} />
          )}
        </button>
      </div>

      <div className={`relative h-14 flex items-center gap-2 px-4 ${isOperator ? 'border-b border-cyan-500/20' : 'border-b border-neutral-200 dark:border-neutral-700'}`}>
        <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
          <img
            src="/assets/aida-logo.png"
            alt="AIDA Logo"
            className={`object-contain ${isOperator ? 'h-9 w-9 drop-shadow-[0_0_10px_rgba(103,232,249,0.25)]' : 'w-8 h-8'}`}
            style={{ filter: isDark ? 'invert(1)' : 'none' }}
          />
        </div>
        {shouldShowExpanded && (
          <div className="min-w-0">
            <h1 className={`text-sm font-bold ${isOperator ? 'text-slate-50' : 'text-neutral-900 dark:text-neutral-100'}`}>AIDA</h1>
            <p className={`text-xs ${isOperator ? 'text-slate-400' : 'text-neutral-500 dark:text-neutral-400'}`}>AI-Driven Security Assessment</p>
          </div>
        )}
      </div>

      <nav className="relative flex-1 px-2 py-4 space-y-1.5">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={({ isActive }) =>
              `group flex items-center gap-2 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-all ${isOperator
                ? (isActive
                  ? 'border border-cyan-400/30 bg-cyan-400/12 text-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.12),0_10px_28px_rgba(2,132,199,0.18)]'
                  : 'border border-transparent text-slate-300 hover:border-cyan-500/15 hover:bg-white/[0.045] hover:text-slate-50')
                : (isActive
                  ? 'bg-primary-100/50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-neutral-100')
                }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="relative flex-shrink-0">
                  <item.icon className={`w-5 h-5 ${isOperator
                    ? (isActive ? 'text-cyan-300' : 'text-slate-500 group-hover:text-slate-200')
                    : (isActive ? 'text-primary-500 dark:text-primary-400' : 'text-neutral-400')
                    }`} />
                  {item.showBadge && pendingCount > 0 && (
                    <span className={`absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white ${isOperator
                      ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                      : 'bg-amber-500 animate-pulse'
                      }`}>
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                </div>
                {shouldShowExpanded && <span className="truncate flex-1">{item.name}</span>}
                {shouldShowExpanded && item.showBadge && pendingCount > 0 && (
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${isOperator
                    ? 'border border-amber-400/30 bg-amber-500/15 text-amber-200'
                    : 'bg-amber-500 text-white'
                    }`}>
                    {pendingCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {shouldShowExpanded && (
        <div className={`relative p-3 ${isOperator ? 'border-t border-cyan-500/20' : 'border-t border-neutral-200 dark:border-neutral-700'}`}>
          <div className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${isOperator ? 'bg-white/[0.03] ring-1 ring-inset ring-white/5' : ''}`}>
            <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
              <img
                src="/assets/aida-logo.png"
                alt="AIDA Logo"
                className="w-6 h-6 object-contain"
                style={{ filter: isDark ? 'invert(1)' : 'none' }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate ${isOperator ? 'text-slate-100' : 'text-neutral-900 dark:text-neutral-100'}`}>AIDA</p>
              <p className={`text-xs ${isOperator ? 'text-slate-500' : 'text-neutral-500 dark:text-neutral-400'}`}>v1.0.0 Beta</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
