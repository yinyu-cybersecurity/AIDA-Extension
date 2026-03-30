import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import GlobalSearch from '../common/GlobalSearch';
import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

const MainLayout = () => {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const { isOperator } = useTheme();

  return (
    <div className={`min-h-screen ${isOperator ? 'bg-transparent text-slate-100' : 'bg-neutral-50 dark:bg-neutral-900'}`}>
      {isOperator && (
        <>
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_26%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_28%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(2,6,23,0.9))]" />
          <div className="pointer-events-none fixed inset-y-0 left-0 w-px bg-cyan-400/15" />
        </>
      )}

      <div className="fixed left-0 top-0 bottom-0 z-50">
        <Sidebar onToggle={setSidebarExpanded} />
      </div>

      <div className={`relative transition-all duration-300 ${sidebarExpanded ? 'pl-64' : 'pl-16'}`}>
        <header className={`sticky top-0 z-40 flex h-14 items-center justify-between px-6 ${isOperator
          ? 'border-b border-cyan-500/20 bg-slate-950/72 shadow-[0_18px_44px_rgba(2,6,23,0.42)] backdrop-blur-xl'
          : 'border-b border-neutral-200 bg-white/95 backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-800/95'
          }`}>
          <div className="flex-1 max-w-2xl">
            <GlobalSearch />
          </div>

          <div className="flex items-center gap-3">
            <button className={`rounded-md px-2 py-1 text-xs transition-colors ${isOperator
              ? 'border border-transparent text-slate-400 hover:border-cyan-500/20 hover:bg-cyan-500/10 hover:text-cyan-100'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200'
              }`}>
              ⌘K to search
            </button>
          </div>
        </header>

        <main className="relative p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;

