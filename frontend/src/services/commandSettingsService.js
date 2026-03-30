/**
 * Command Settings Service - API calls for command execution mode and keywords
 */
import apiClient from './api';

/**
 * Get current command execution settings
 * @returns {Promise<{execution_mode: string, filter_keywords: string[]}>}
 */
export const getCommandSettings = async () => {
    const response = await apiClient.get('/command-settings');
    return response.data;
};

/**
 * Update command execution settings
 * @param {Object} settings - {execution_mode?: string, filter_keywords?: string[]}
 * @returns {Promise<Object>}
 */
export const updateCommandSettings = async (settings) => {
    const response = await apiClient.put('/command-settings', settings);
    return response.data;
};

/**
 * Add a filter keyword
 * @param {string} keyword
 * @returns {Promise<Object>}
 */
export const addKeyword = async (keyword) => {
    const response = await apiClient.post('/command-settings/keywords', { keyword });
    return response.data;
};

/**
 * Remove a filter keyword
 * @param {string} keyword
 * @returns {Promise<Object>}
 */
export const removeKeyword = async (keyword) => {
    const response = await apiClient.delete(`/command-settings/keywords/${encodeURIComponent(keyword)}`);
    return response.data;
};

/**
 * Update HTTP method rules
 * @param {Object} rules - e.g. { GET: 'auto_approve', POST: 'require_approval' }
 * @returns {Promise<Object>}
 */
export const updateHttpMethodRules = async (rules) => {
    const response = await apiClient.put('/command-settings', { http_method_rules: rules });
    return response.data;
};

export default {
    getCommandSettings,
    getSettings: getCommandSettings,
    updateCommandSettings,
    addKeyword,
    removeKeyword,
    updateHttpMethodRules
};
