import apiClient from './api';

const attackPathService = {
  // Get all attack paths for an assessment
  getAttackPaths: async (assessmentId, statusFilter = null) => {
    const params = statusFilter ? { status_filter: statusFilter } : {};
    const response = await apiClient.get(`/assessments/${assessmentId}/attack-paths`, { params });
    return response.data;
  },

  // Create a new attack path
  createAttackPath: async (assessmentId, attackPathData) => {
    const response = await apiClient.post(`/assessments/${assessmentId}/attack-paths`, attackPathData);
    return response.data;
  },

  // Update an attack path
  updateAttackPath: async (assessmentId, pathId, updateData) => {
    const response = await apiClient.patch(`/assessments/${assessmentId}/attack-paths/${pathId}`, updateData);
    return response.data;
  },

  // Delete an attack path
  deleteAttackPath: async (assessmentId, pathId) => {
    await apiClient.delete(`/assessments/${assessmentId}/attack-paths/${pathId}`);
  },

  // Confirm a suggested attack path
  confirmAttackPath: async (assessmentId, pathId, confirmedBy = 'user') => {
    const response = await apiClient.patch(`/assessments/${assessmentId}/attack-paths/${pathId}`, {
      status: 'confirmed',
      confirmed_by: confirmedBy,
      confirmed_at: new Date().toISOString()
    });
    return response.data;
  },

  // Reject a suggested attack path
  rejectAttackPath: async (assessmentId, pathId) => {
    const response = await apiClient.patch(`/assessments/${assessmentId}/attack-paths/${pathId}`, {
      status: 'rejected'
    });
    return response.data;
  }
};

export default attackPathService;
