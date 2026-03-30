/**
 * Pending Command Service - API calls for pending command management
 */
import apiClient from './api';
import commandSettingsService from './commandSettingsService';

const normalizeListParams = (paramsOrStatusFilter = {}, assessmentId = null) => {
  if (typeof paramsOrStatusFilter === 'string' || paramsOrStatusFilter === null) {
    return {
      ...(paramsOrStatusFilter ? { status_filter: paramsOrStatusFilter } : {}),
      ...(assessmentId !== null ? { assessment_id: assessmentId } : {})
    };
  }

  return paramsOrStatusFilter;
};

/**
 * Get pending command count
 * @returns {Promise<{pending_count: number}>}
 */
export const getPendingCount = async () => {
  const response = await apiClient.get('/pending-commands/count');
  return response.data;
};

/**
 * Explicitly mark expired pending commands as timed out
 * @returns {Promise<{timed_out: number}>}
 */
export const sweepExpiredCommands = async () => {
  const response = await apiClient.post('/pending-commands/sweep-timeouts');
  return response.data;
};

/**
 * List pending commands
 * @param {Object|string|null} paramsOrStatusFilter - Either params object or legacy status filter
 * @param {number|null} assessmentId - Optional legacy assessment filter
 * @returns {Promise<Object>}
 */
export const listPendingCommands = async (paramsOrStatusFilter = {}, assessmentId = null) => {
  const response = await apiClient.get('/pending-commands', {
    params: normalizeListParams(paramsOrStatusFilter, assessmentId)
  });
  return response.data;
};

/**
 * Get a specific pending command
 * @param {number} commandId
 * @returns {Promise<Object>}
 */
export const getPendingCommand = async (commandId) => {
  const response = await apiClient.get(`/pending-commands/${commandId}`);
  return response.data;
};

/**
 * Approve and execute a pending command
 * @param {number} commandId
 * @param {string} approvedBy
 * @returns {Promise<Object>}
 */
export const approvePendingCommand = async (commandId, approvedBy = 'admin') => {
  const response = await apiClient.post(`/pending-commands/${commandId}/approve`, {
    approved_by: approvedBy
  });
  return response.data;
};

export const approveCommand = approvePendingCommand;

/**
 * Reject a pending command
 * @param {number} commandId
 * @param {string} rejectedBy
 * @param {string} reason
 * @returns {Promise<Object>}
 */
export const rejectPendingCommand = async (commandId, rejectedBy = 'admin', reason = '') => {
  const response = await apiClient.post(`/pending-commands/${commandId}/reject`, {
    rejected_by: rejectedBy,
    rejection_reason: reason
  });
  return response.data;
};

export const rejectCommand = rejectPendingCommand;

/**
 * Delete a pending command
 * @param {number} commandId
 * @returns {Promise<void>}
 */
export const deletePendingCommand = async (commandId) => {
  await apiClient.delete(`/pending-commands/${commandId}`);
};

export const getCommandSettings = commandSettingsService.getCommandSettings;
export const updateCommandSettings = commandSettingsService.updateCommandSettings;
export const addKeyword = commandSettingsService.addKeyword;
export const removeKeyword = commandSettingsService.removeKeyword;
export const updateHttpMethodRules = commandSettingsService.updateHttpMethodRules;

export default {
  getPendingCount,
  sweepExpiredCommands,
  listPendingCommands,
  getPendingCommand,
  approvePendingCommand,
  rejectPendingCommand,
  approveCommand,
  rejectCommand,
  deletePendingCommand,
  getCommandSettings,
  updateCommandSettings,
  addKeyword,
  removeKeyword,
  updateHttpMethodRules
};

