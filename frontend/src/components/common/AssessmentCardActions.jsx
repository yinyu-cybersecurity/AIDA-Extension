import { useState, useRef } from 'react';
import { MoreVertical } from 'lucide-react';
import ContextMenu from './ContextMenu';
import DuplicateAssessmentModal from '../assessment/DuplicateAssessmentModal';
import folderService from '../../services/folderService';

const AssessmentCardActions = ({
  assessment,
  folders = [],
  onAssessmentUpdate,
  onAssessmentDelete
}) => {
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const buttonRef = useRef(null);

  const handleMenuClick = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPosition({
      x: rect.right - 200, // Position menu to the left of button
      y: rect.bottom + 5
    });
    setIsContextMenuOpen(true);
  };

  const handleMoveToFolder = async (folderId) => {
    try {
      await folderService.moveAssessment(assessment.id, folderId);
      onAssessmentUpdate();
    } catch (error) {
      console.error('Failed to move assessment:', error);
    }
  };

  const handleDuplicate = () => {
    setIsContextMenuOpen(false);
    setIsDuplicateModalOpen(true);
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete "${assessment.name}"? This action cannot be undone.`)) {
      try {
        // Call the delete function passed from parent
        onAssessmentDelete(assessment.id);
      } catch (error) {
        console.error('Failed to delete assessment:', error);
      }
    }
  };

  const handleExport = () => {
    // TODO: Implement export functionality
  };

  const handleShare = () => {
    // TODO: Implement share functionality
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleMenuClick}
        className="p-1 rounded-md hover:bg-neutral-100 transition-colors opacity-0 group-hover:opacity-100"
        title="More actions"
      >
        <MoreVertical className="w-4 h-4 text-neutral-400" />
      </button>

      <ContextMenu
        isOpen={isContextMenuOpen}
        onClose={() => setIsContextMenuOpen(false)}
        position={menuPosition}
        onMoveToFolder={handleMoveToFolder}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onExport={handleExport}
        onShare={handleShare}
        folders={folders}
        assessment={assessment}
      />

      <DuplicateAssessmentModal
        assessment={assessment}
        isOpen={isDuplicateModalOpen}
        onClose={() => setIsDuplicateModalOpen(false)}
        onSuccess={onAssessmentUpdate}
      />
    </>
  );
};

export default AssessmentCardActions;
