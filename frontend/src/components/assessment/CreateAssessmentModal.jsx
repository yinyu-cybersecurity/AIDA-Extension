import { useState } from 'react';
import { X } from '../icons/index';
import apiClient from '../../services/api';

const CreateAssessmentModal = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    client_name: '',
    scope: '',
    limitations: '',
    target_domains: '',
    ip_scopes: '',
    start_date: '',
    end_date: '',
    category: '',
    environment: 'non_specifie',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Transform comma-separated strings to arrays
      const payload = {
        ...formData,
        target_domains: formData.target_domains
          .split(',')
          .map(d => d.trim())
          .filter(Boolean),
        ip_scopes: formData.ip_scopes
          .split(',')
          .map(ip => ip.trim())
          .filter(Boolean),
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        category: formData.category || null, // Ensure category is included
      };

      const response = await apiClient.post('/assessments', payload);
      onSuccess(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create assessment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/70 backdrop-blur-sm z-50 animate-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white dark:bg-neutral-800 rounded-xl shadow-strong animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Create New Assessment</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
            >
              <X className="w-5 h-5 text-neutral-500 dark:text-neutral-400" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[calc(100vh-200px)] overflow-y-auto">
            {error && (
              <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Assessment Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Q4 2025 Pentest"
                className="input"
              />
            </div>

            {/* Client */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Client Name
              </label>
              <input
                type="text"
                value={formData.client_name}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                placeholder="Acme Corporation"
                className="input"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="input"
              >
                <option value="">Select category</option>
                <option value="API">API</option>
                <option value="Website">Website</option>
                <option value="External Infra">External Infra</option>
                <option value="Mobile">Mobile</option>
                <option value="Cloud">Cloud</option>
                <option value="General">General</option>
              </select>
            </div>

            {/* Environment */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Environment
              </label>
              <select
                value={formData.environment}
                onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
                className="input"
              >
                <option value="non_specifie">Non spécifié</option>
                <option value="production">Production</option>
                <option value="dev">Dev</option>
              </select>
            </div>

            {/* Scope */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Scope
              </label>
              <textarea
                value={formData.scope}
                onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                placeholder="*.example.com, web applications, API endpoints..."
                rows={3}
                className="input resize-none"
              />
            </div>

            {/* Limitations */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Limitations
              </label>
              <textarea
                value={formData.limitations}
                onChange={(e) => setFormData({ ...formData, limitations: e.target.value })}
                placeholder="No DoS attacks, no social engineering, testing only between 9am-5pm EST..."
                rows={2}
                className="input resize-none"
              />
            </div>

            {/* Target Domains */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Target Domains
              </label>
              <input
                type="text"
                value={formData.target_domains}
                onChange={(e) => setFormData({ ...formData, target_domains: e.target.value })}
                placeholder="example.com, app.example.com, api.example.com"
                className="input"
              />
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Comma-separated list</p>
            </div>

            {/* IP Scopes */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                IP Scopes
              </label>
              <input
                type="text"
                value={formData.ip_scopes}
                onChange={(e) => setFormData({ ...formData, ip_scopes: e.target.value })}
                placeholder="192.168.1.0/24, 10.0.0.0/16"
                className="input"
              />
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Comma-separated list</p>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="input"
                />
              </div>
            </div>
          </form>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Assessment'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default CreateAssessmentModal;

