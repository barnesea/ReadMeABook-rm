/**
 * Component: Admin Users Management Page
 * Documentation: documentation/admin-dashboard.md
 */

'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { authenticatedFetcher, fetchJSON } from '@/lib/utils/api';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface User {
  id: string;
  plexId: string;
  plexUsername: string;
  plexEmail: string;
  role: 'user' | 'admin';
  isSetupAdmin: boolean;
  authProvider: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  autoApproveRequests: boolean | null;
  requestLimitEnabled: boolean;
  requestLimitCount: number;
  requestLimitPeriod: number;
  interactiveSearchAccess: boolean | null;
  _count: {
    requests: number;
  };
}

interface PendingUser {
  id: string;
  plexUsername: string;
  plexEmail: string | null;
  authProvider: string;
  createdAt: string;
}

function AdminUsersPageContent() {
  const { data, error, mutate } = useSWR('/api/admin/users', authenticatedFetcher);
  const { data: pendingData, error: pendingError, mutate: mutatePending } = useSWR(
    '/api/admin/users/pending',
    authenticatedFetcher
  );
  const { data: globalAutoApproveData, error: globalAutoApproveError, mutate: mutateGlobalAutoApprove } = useSWR(
    '/api/admin/settings/auto-approve',
    authenticatedFetcher
  );
  const [editDialog, setEditDialog] = useState<{
    isOpen: boolean;
    user: User | null;
  }>({ isOpen: false, user: null });
  const [editRole, setEditRole] = useState<'user' | 'admin'>('user');
  const [editRequestLimitEnabled, setEditRequestLimitEnabled] = useState(false);
  const [editRequestLimitCount, setEditRequestLimitCount] = useState(5);
  const [editRequestLimitPeriod, setEditRequestLimitPeriod] = useState(7);
  const [saving, setSaving] = useState(false);
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'approve' | 'reject' | null;
    user: PendingUser | null;
  }>({ isOpen: false, type: null, user: null });
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    user: User | null;
  }>({ isOpen: false, user: null });
  const [deleting, setDeleting] = useState(false);
  const [globalAutoApprove, setGlobalAutoApprove] = useState<boolean>(false);
  const toast = useToast();

  const isLoading = !data && !error;
  const pendingUsers: PendingUser[] = pendingData?.users || [];

  // Sync global auto-approve state (default to true if not set)
  useEffect(() => {
    if (globalAutoApproveData?.autoApproveRequests !== undefined) {
      setGlobalAutoApprove(globalAutoApproveData.autoApproveRequests);
    } else if (globalAutoApproveData !== undefined && globalAutoApproveData.autoApproveRequests === undefined) {
      // API returned but no value - default to true
      setGlobalAutoApprove(true);
    }
  }, [globalAutoApproveData]);

  const handleGlobalAutoApproveToggle = async (newValue: boolean) => {
    // Optimistic update
    setGlobalAutoApprove(newValue);

    try {
      await fetchJSON('/api/admin/settings/auto-approve', {
        method: 'PATCH',
        body: JSON.stringify({ autoApproveRequests: newValue }),
      });
      toast.success(`Global auto-approve ${newValue ? 'enabled' : 'disabled'}`);
      mutateGlobalAutoApprove();
      mutate(); // Refresh users list to show updated state
    } catch (err) {
      // Revert on error
      setGlobalAutoApprove(!newValue);
      const errorMsg = err instanceof Error ? err.message : 'Failed to update auto-approve setting';
      toast.error(errorMsg);
      console.error(err);
    }
  };

  const handleUserAutoApproveToggle = async (user: User, newValue: boolean) => {
    console.log('[AutoApprove] Toggle clicked:', { userId: user.id, username: user.plexUsername, newValue });

    // Optimistic update
    const previousUsers = data?.users || [];
    const optimisticUsers = previousUsers.map((u: User) =>
      u.id === user.id ? { ...u, autoApproveRequests: newValue } : u
    );
    console.log('[AutoApprove] Applying optimistic update');
    mutate({ users: optimisticUsers }, false);

    try {
      console.log('[AutoApprove] Sending API request...');
      const response = await fetchJSON(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          role: user.role,
          autoApproveRequests: newValue
        }),
      });
      console.log('[AutoApprove] API response received:', response);
      toast.success(`Auto-approve ${newValue ? 'enabled' : 'disabled'} for ${user.plexUsername}`);
      console.log('[AutoApprove] Triggering cache revalidation...');
      mutate(); // Refresh users list
    } catch (err) {
      // Revert on error
      console.error('[AutoApprove] Error occurred, reverting:', err);
      mutate({ users: previousUsers }, false);
      const errorMsg = err instanceof Error ? err.message : 'Failed to update user auto-approve setting';
      toast.error(errorMsg);
      console.error(err);
    }
  };

  const showEditDialog = (user: User) => {
    setEditRole(user.role);
    setEditRequestLimitEnabled(user.requestLimitEnabled);
    setEditRequestLimitCount(user.requestLimitCount);
    setEditRequestLimitPeriod(user.requestLimitPeriod);
    setEditDialog({ isOpen: true, user });
  };

  const hideEditDialog = () => {
    setEditDialog({ isOpen: false, user: null });
  };

  const saveUserSettings = async () => {
    if (!editDialog.user) return;

    try {
      setSaving(true);
      await fetchJSON(`/api/admin/users/${editDialog.user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          role: editRole,
          requestLimitEnabled: editRequestLimitEnabled,
          requestLimitCount: editRequestLimitCount,
          requestLimitPeriod: editRequestLimitPeriod,
        }),
      });
      toast.success(`User "${editDialog.user.plexUsername}" updated successfully`);
      hideEditDialog();
      mutate(); // Refresh users list
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to update user';
      toast.error(errorMsg);
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const showApproveDialog = (user: PendingUser) => {
    setConfirmDialog({ isOpen: true, type: 'approve', user });
  };

  const showRejectDialog = (user: PendingUser) => {
    setConfirmDialog({ isOpen: true, type: 'reject', user });
  };

  const closeConfirmDialog = () => {
    if (processingUserId) return; // Don't close while processing
    setConfirmDialog({ isOpen: false, type: null, user: null });
  };

  const handleConfirmAction = async () => {
    if (!confirmDialog.user) return;

    const isApprove = confirmDialog.type === 'approve';
    try {
      setProcessingUserId(confirmDialog.user.id);
      await fetchJSON(`/api/admin/users/${confirmDialog.user.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approve: isApprove }),
      });
      toast.success(
        isApprove
          ? `User "${confirmDialog.user.plexUsername}" has been approved`
          : `User "${confirmDialog.user.plexUsername}" has been rejected`
      );
      mutatePending(); // Refresh pending users list
      if (isApprove) mutate(); // Refresh approved users list
      closeConfirmDialog();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : `Failed to ${isApprove ? 'approve' : 'reject'} user`;
      toast.error(errorMsg);
      console.error(err);
    } finally {
      setProcessingUserId(null);
    }
  };

  const showDeleteDialog = (user: User) => {
    setDeleteDialog({ isOpen: true, user });
  };

  const closeDeleteDialog = () => {
    if (deleting) return; // Don't close while processing
    setDeleteDialog({ isOpen: false, user: null });
  };

  const handleDeleteUser = async () => {
    if (!deleteDialog.user) return;

    try {
      setDeleting(true);
      const response = await fetchJSON(`/api/admin/users/${deleteDialog.user.id}`, {
        method: 'DELETE',
      });
      toast.success(response.message || `User "${deleteDialog.user.plexUsername}" has been deleted`);
      mutate(); // Refresh users list
      closeDeleteDialog();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete user';
      toast.error(errorMsg);
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      toast.error('Failed to copy to clipboard');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
              Error Loading Users
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              {error?.message || 'Failed to load users'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const users: User[] = data?.users || [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="sticky top-0 z-10 mb-8 flex items-center justify-between bg-gray-50 dark:bg-gray-900 py-4 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              User Management
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Manage user roles and permissions
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Dashboard</span>
          </Link>
        </div>

        {/* Global Auto-Approve Toggle */}
        <div className="mb-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <button
              onClick={() => handleGlobalAutoApproveToggle(!globalAutoApprove)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 mt-0.5"
              style={{ backgroundColor: globalAutoApprove ? '#3b82f6' : '#d1d5db' }}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${globalAutoApprove ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
            <div className="flex-1">
              <label
                onClick={() => handleGlobalAutoApproveToggle(!globalAutoApprove)}
                className="block text-base font-semibold text-gray-900 dark:text-gray-100 cursor-pointer"
              >
                Auto-Approve All Requests
              </label>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                When enabled, all user requests are automatically processed. When disabled, you can set per-user approval settings below.
              </p>
            </div>
          </div>
        </div>

        {/* Pending Users Section */}
        {pendingUsers.length > 0 && (
          <div className="mb-8">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
              <h2 className="text-lg font-semibold text-yellow-900 dark:text-yellow-200 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Pending Registrations ({pendingUsers.length})
              </h2>
              <p className="text-sm text-yellow-800 dark:text-yellow-300 mb-4">
                The following users are awaiting approval to access the system.
              </p>
              <div className="space-y-3">
                {pendingUsers.map((user) => (
                  <div
                    key={user.id}
                    className="bg-white dark:bg-gray-800 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {user.plexUsername}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {user.plexEmail || 'No email'}
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Registered: {new Date(user.createdAt).toLocaleString()} •
                            Provider: {user.authProvider}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => showApproveDialog(user)}
                        disabled={processingUserId === user.id}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {processingUserId === user.id ? 'Processing...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => showRejectDialog(user)}
                        disabled={processingUserId === user.id}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        {processingUserId === user.id ? 'Processing...' : 'Reject'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Auto-Approve
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Request Limits
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Requests
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {user.avatarUrl && (
                        <img
                          src={user.avatarUrl}
                          alt={user.plexUsername}
                          className="h-10 w-10 rounded-full mr-3"
                        />
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {user.plexUsername}
                        </div>
                        <div
                          className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                          title={`Click to copy: ${user.plexId}`}
                          onClick={() => copyToClipboard(user.plexId, 'User ID')}
                        >
                          <span className="inline-flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            ID: {user.plexId.length > 12 ? `${user.plexId.substring(0, 12)}...` : user.plexId}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      {user.plexEmail || 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          user.role === 'admin'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {user.role.toUpperCase()}
                      </span>
                      {user.isSetupAdmin && (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                          SETUP ADMIN
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {user.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          Always On
                        </span>
                      ) : globalAutoApprove ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Global Setting
                        </span>
                      ) : (
                        <button
                          onClick={() => handleUserAutoApproveToggle(user, !(user.autoApproveRequests ?? false))}
                          className="relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
                          style={{ backgroundColor: (user.autoApproveRequests ?? false) ? '#3b82f6' : '#d1d5db' }}
                          title={`Toggle auto-approve for ${user.plexUsername}`}
                        >
                          <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${(user.autoApproveRequests ?? false) ? 'translate-x-6' : 'translate-x-1'}`}
                          />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {user.requestLimitEnabled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          {user.requestLimitCount} / {user.requestLimitPeriod}d
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                          Global
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {user._count.requests}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-3">
                      {user.isSetupAdmin ? (
                        <span className="inline-flex items-center gap-1 text-gray-400 dark:text-gray-600 cursor-not-allowed" title="Setup admin role cannot be changed">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <span>Protected</span>
                        </span>
                      ) : user.authProvider === 'oidc' ? (
                        <button
                          onClick={() => showEditDialog(user)}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          title="Edit user settings (request limits)"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>Edit Settings</span>
                        </button>
                      ) : user.authProvider === 'plex' ? (
                        <button
                          onClick={() => showEditDialog(user)}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>Edit Role</span>
                        </button>
                      ) : user.authProvider === 'local' ? (
                        <>
                          <button
                            onClick={() => showEditDialog(user)}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            <span>Edit Role</span>
                          </button>
                          <button
                            onClick={() => showDeleteDialog(user)}
                            className="inline-flex items-center gap-1 text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                            title="Delete user and all their requests"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span>Delete</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => showEditDialog(user)}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>Edit Role</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">No users found</p>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
            About User Management
          </h3>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>• <strong>User:</strong> Can request audiobooks, view own requests, and search the catalog</li>
            <li>• <strong>Admin:</strong> Full system access including settings, user management, and all requests</li>
            <li>• <strong>Setup Admin:</strong> The initial admin account created during setup - this account is protected and cannot be changed or deleted</li>
            <li>• <strong>Auto-Approve:</strong> When the global setting is enabled, all requests are automatically processed. When disabled, you can control auto-approval per user. Admin requests are always auto-approved.</li>
            <li>• <strong>OIDC Users:</strong> Role management is handled by the identity provider (use admin role mapping in settings). Cannot be deleted as access is managed externally. Request limits can still be configured.</li>
            <li>• <strong>Plex Users:</strong> Can have their roles changed, but cannot be deleted as access is managed by Plex.</li>
            <li>• <strong>Local Users:</strong> Can be freely assigned user or admin roles (except setup admin). Can be deleted (their requests are preserved for historical records).</li>
            <li>• You cannot change your own role or delete yourself for security reasons</li>
          </ul>
        </div>

        {/* Edit User Dialog */}
        {editDialog.isOpen && editDialog.user && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Edit User Settings
              </h3>
              <div className="space-y-4 mb-6">
                {/* User Info */}
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  {editDialog.user.avatarUrl && (
                    <img
                      src={editDialog.user.avatarUrl}
                      alt={editDialog.user.plexUsername}
                      className="h-12 w-12 rounded-full"
                    />
                  )}
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {editDialog.user.plexUsername}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {editDialog.user.plexEmail || 'No email'}
                    </div>
                  </div>
                </div>

                {/* Role Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Role
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="role"
                        value="user"
                        checked={editRole === 'user'}
                        onChange={(e) => setEditRole(e.target.value as 'user' | 'admin')}
                        className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          User
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Can request audiobooks and view own requests
                        </div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="role"
                        value="admin"
                        checked={editRole === 'admin'}
                        onChange={(e) => setEditRole(e.target.value as 'user' | 'admin')}
                        className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          Admin
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Full system access including settings and user management
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Request Limit Settings */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Request Limits
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editRequestLimitEnabled}
                        onChange={(e) => setEditRequestLimitEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  {editRequestLimitEnabled && (
                    <div className="space-y-3 ml-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Max Requests
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          value={editRequestLimitCount}
                          onChange={(e) => setEditRequestLimitCount(parseInt(e.target.value, 10) || 1)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Maximum number of requests allowed per period
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Period (Days)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={editRequestLimitPeriod}
                          onChange={(e) => setEditRequestLimitPeriod(parseInt(e.target.value, 10) || 1)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Time period in days for the limit to reset
                        </p>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Configure per-user request limits. When disabled, uses server-wide defaults.
                  </p>
                </div>

                {/* Reset Request Limit Button */}
                {editRequestLimitEnabled && (
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <button
                      onClick={async () => {
                        if (!editDialog.user) return;
                        try {
                          await fetchJSON(`/api/admin/users/${editDialog.user.id}/reset-request-limit`, {
                            method: 'POST',
                          });
                          toast.success(`Request limit reset for ${editDialog.user.plexUsername}`);
                          // Refresh user data
                          mutate();
                        } catch (err) {
                          const errorMsg = err instanceof Error ? err.message : 'Failed to reset request limit';
                          toast.error(errorMsg);
                          console.error(err);
                        }
                      }}
                      className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Reset Request Limit
                    </button>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                      Resets the current request count and period timer for this user
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={hideEditDialog}
                  disabled={saving}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={saveUserSettings}
                  disabled={saving}
                  className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Approve/Reject Dialog */}
        <ConfirmModal
          isOpen={confirmDialog.isOpen}
          onClose={closeConfirmDialog}
          onConfirm={handleConfirmAction}
          title={confirmDialog.type === 'approve' ? 'Approve Registration' : 'Reject Registration'}
          message={
            confirmDialog.type === 'approve'
              ? `Are you sure you want to approve the registration for "${confirmDialog.user?.plexUsername}"? They will be able to log in immediately.`
              : `Are you sure you want to reject and delete the registration for "${confirmDialog.user?.plexUsername}"? This action cannot be undone.`
          }
          confirmText={confirmDialog.type === 'approve' ? 'Approve' : 'Reject'}
          cancelText="Cancel"
          isLoading={processingUserId !== null}
          variant={confirmDialog.type === 'reject' ? 'danger' : 'primary'}
        />

        {/* Delete User Dialog */}
        <ConfirmModal
          isOpen={deleteDialog.isOpen}
          onClose={closeDeleteDialog}
          onConfirm={handleDeleteUser}
          title="Delete User"
          message={
            deleteDialog.user
              ? `Are you sure you want to delete "${deleteDialog.user.plexUsername}"? The user will be permanently deleted, but their ${deleteDialog.user._count.requests} request(s) will be preserved for historical records. This action cannot be undone.`
              : ''
          }
          confirmText="Delete User"
          cancelText="Cancel"
          isLoading={deleting}
          variant="danger"
        />
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <ToastProvider>
      <AdminUsersPageContent />
    </ToastProvider>
  );
}
