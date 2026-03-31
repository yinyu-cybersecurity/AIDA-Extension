import { useState } from 'react';
import {
  Folder,
  FolderOpen,
  Clock,
  CheckCircle,
  Archive,
  FolderPlus,
  MoreVertical,
  Edit3
} from '../icons';
import { useTheme } from '../../contexts/ThemeContext';

const FolderSidebar = ({
  folders = [],
  allAssessments = [],
  activeView,
  onViewChange,
  onCreateFolder,
  onEditFolder,
  className = ""
}) => {
  const { isOperator } = useTheme();
  const [contextMenuFolder, setContextMenuFolder] = useState(null);

  // Calculate counts for status views
  const getStatusCount = (status) => {
    return allAssessments.filter(a => a.status === status).length;
  };

  // Status views configuration (3 fixed tabs)
  const statusViews = [
    {
      id: 'active',
      name: 'Active',
      icon: Clock,
      count: getStatusCount('active'),
      color: 'text-blue-600'
    },
    {
      id: 'completed',
      name: 'Completed',
      icon: CheckCircle,
      count: getStatusCount('completed'),
      color: 'text-green-600'
    },
    {
      id: 'archived',
      name: 'Archived',
      icon: Archive,
      count: getStatusCount('archived'),
      color: 'text-neutral-500'
    }
  ];

  // Custom folders (all folders are custom now, no system folders)
  const customFolders = folders.map(folder => ({
    id: folder.id.toString(),
    name: folder.name,
    icon: FolderOpen,
    count: folder.assessment_count || 0,
    color: folder.color || '#06b6d4', // Use folder's actual color
    folder: folder
  }));

  return (
    <div className={`relative w-64 border-r h-full flex flex-col ${isOperator ? 'bg-[rgba(8,15,36,0.96)] border-cyan-500/20' : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700'} ${className}`}>
      {/* Subtle separator from main sidebar */}
      <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-neutral-300 dark:via-neutral-600 to-transparent opacity-50" />

      {/* Header */}
      <div className={`p-4 border-b ${isOperator ? 'border-cyan-500/20' : 'border-neutral-200 dark:border-neutral-700'}`}>
        <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Views</h2>
      </div>

      {/* Status Views and Folders */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {/* Status Views: Active / Completed / Archived */}
          <div className="space-y-1">
            {statusViews.map((view) => {
              const Icon = view.icon;
              const isActive = activeView === view.id;

              return (
                <button
                  key={view.id}
                  onClick={() => onViewChange(view.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${isActive
                    ? (isOperator ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20' : 'bg-primary-100/50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 border border-primary-200 dark:border-primary-700')
                    : (isOperator ? 'text-slate-300 hover:bg-cyan-500/5' : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700')
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${view.color} dark:opacity-80`} />
                    <span className="font-medium">{view.name}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${isActive
                    ? (isOperator ? 'bg-cyan-500/10 text-cyan-300' : 'bg-primary-100/50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300')
                    : (isOperator ? 'bg-slate-800 text-slate-400' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300')
                    }`}>
                    {view.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom Folders Section */}
          {customFolders.length > 0 && (
            <div className="mt-6">
              {/* Section Header */}
              <div className="flex items-center justify-between px-3 py-2 mb-2">
                <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  My Folders
                </h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${isOperator ? 'bg-slate-800 text-slate-400' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'}`}>
                  {customFolders.length}
                </span>
              </div>

              {/* Folders List */}
              <div className="space-y-1">
                {customFolders.map((folder) => {
                  const Icon = folder.icon;
                  const isActive = activeView === folder.id;

                  return (
                    <div key={folder.id} className="relative group">
                      <div className="relative flex items-center">
                        <button
                          onClick={() => onViewChange(folder.id)}
                          className={`flex-1 flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${isActive
                            ? (isOperator ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20' : 'bg-primary-100/50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 border border-primary-200 dark:border-primary-700')
                            : (isOperator ? 'text-slate-300 hover:bg-cyan-500/5' : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700')
                            }`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" style={{ color: folder.color }} />
                          <span className="font-medium truncate flex-1" title={folder.name}>
                            {folder.name}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${isActive
                            ? (isOperator ? 'bg-cyan-500/10 text-cyan-300' : 'bg-primary-100/50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300')
                            : (isOperator ? 'bg-slate-800 text-slate-400' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300')
                            }`}>
                            {folder.count}
                          </span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setContextMenuFolder(contextMenuFolder === folder.id ? null : folder.id);
                          }}
                          className={`absolute right-1 p-1.5 opacity-0 group-hover:opacity-100 rounded transition-all z-10 ${isOperator ? 'hover:bg-cyan-500/10' : 'hover:bg-neutral-200 dark:hover:bg-neutral-600'}`}
                          title="Folder options"
                        >
                          <MoreVertical className="w-3 h-3 text-neutral-500 dark:text-neutral-400" />
                        </button>
                      </div>

                      {/* Context Menu */}
                      {contextMenuFolder === folder.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setContextMenuFolder(null)}
                          />
                          <div className={`absolute top-full right-0 mt-1 w-48 border rounded-md shadow-lg z-20 ${isOperator ? 'bg-slate-900 border-cyan-500/20' : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-600'}`}>
                            <button
                              onClick={() => {
                                onEditFolder(folder.folder);
                                setContextMenuFolder(null);
                              }}
                              className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left rounded-md transition-colors ${isOperator ? 'text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-200' : 'text-neutral-900 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-700'}`}
                            >
                              <Edit3 className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                              <span>Edit Folder</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className={`p-4 border-t ${isOperator ? 'border-cyan-500/20' : 'border-neutral-200 dark:border-neutral-700'}`}>
        <button
          onClick={onCreateFolder}
          className="w-full btn btn-ghost btn-sm justify-start"
        >
          <FolderPlus className="w-4 h-4" />
          <span>New Folder</span>
        </button>
      </div>
    </div>
  );
};

export default FolderSidebar;
