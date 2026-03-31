import { useState } from 'react';
import { ChevronDown, ChevronRight } from '../icons/index';
import EditableField from '../common/EditableField';
import MarkdownRenderer from '../common/MarkdownRenderer';
import apiClient from '../../services/api';
import { PHASE_NAMES } from '../../utils/phases';
import { useTheme } from '../../contexts/ThemeContext';

const PhaseSection = ({ phaseNumber, assessmentId, section, onUpdate }) => {
  const { isOperator } = useTheme();
  const [isExpanded, setIsExpanded] = useState(phaseNumber <= 2); // Expand first 2 phases by default
  const [content, setContent] = useState(section?.content || '');
  const [isEditing, setIsEditing] = useState(false);

  const updateContent = async (newContent) => {
    try {
      await apiClient.post(`/assessments/${assessmentId}/sections`, {
        section_type: `phase_${phaseNumber}`,
        section_number: phaseNumber,
        title: PHASE_NAMES[phaseNumber],
        content: newContent,
      });
      setContent(newContent);
    } catch (error) {
      console.error('Failed to update phase content:', error);
    }
  };

  const hasContent = content;

  const borderClass = isOperator ? 'border-cyan-500/20' : 'border-neutral-200 dark:border-neutral-700';
  const bgClass = isOperator ? 'bg-[rgba(8,15,36,0.96)]' : 'bg-white dark:bg-neutral-800';
  const headerBgClass = isOperator ? 'bg-slate-950/60' : 'bg-neutral-50 dark:bg-neutral-900';
  const textClass = isOperator ? 'text-slate-100' : 'text-neutral-800 dark:text-neutral-100';
  const mutedClass = isOperator ? 'text-slate-400' : 'text-neutral-500 dark:text-neutral-400';
  const btnHoverClass = isOperator ? 'hover:bg-cyan-500/10 hover:text-cyan-100 text-slate-400' : 'hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200';

  return (
    <div className={`border ${borderClass} rounded ${bgClass}`}>
      {/* Header compact */}
      <div className={`px-3 py-2 border-b ${borderClass} ${headerBgClass}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={`p-1 rounded transition-colors ${btnHoverClass}`}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            <h3 className={`text-sm font-semibold ${textClass}`}>
              Phase {phaseNumber} - {PHASE_NAMES[phaseNumber]}
            </h3>
          </div>

          {!hasContent && !isExpanded && (
            <span className={`text-xs ${mutedClass}`}>
              Empty
            </span>
          )}
        </div>
      </div>

      {/* Content compact */}
      {isExpanded && (
        <div className="p-3">
          {/* Phase notes compactes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={`block text-xs font-medium ${mutedClass}`}>
                Phase Notes
              </label>
              {content && (
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className={`text-xs px-2 py-1 rounded transition-colors ${btnHoverClass}`}
                >
                  {isEditing ? 'View' : 'Edit'}
                </button>
              )}
            </div>

            {isEditing ? (
              <EditableField
                value={content}
                onSave={(newContent) => {
                  updateContent(newContent);
                  setIsEditing(false);
                }}
                multiline
                placeholder="Click to add notes for this phase..."
                className="text-neutral-700 dark:text-neutral-300 text-sm min-h-[80px] block w-full p-3 border border-neutral-200 dark:border-neutral-600 rounded bg-neutral-50 dark:bg-neutral-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            ) : content ? (
              <div className={`border ${borderClass} rounded ${isOperator ? 'bg-slate-950/40' : 'bg-white dark:bg-neutral-900'} p-3`}>
                <MarkdownRenderer content={content} />
              </div>
            ) : (
              <EditableField
                value=""
                onSave={updateContent}
                multiline
                placeholder="Click to add notes for this phase..."
                className="text-neutral-700 dark:text-neutral-300 text-sm min-h-[80px] block w-full p-3 border border-neutral-200 dark:border-neutral-600 rounded bg-neutral-50 dark:bg-neutral-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            )}
          </div>

          {/* Empty state compact */}
          {!hasContent && (
            <div className={`py-4 text-center text-xs ${mutedClass}`}>
              No content in this phase yet. Claude will add notes as the assessment progresses.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PhaseSection;
