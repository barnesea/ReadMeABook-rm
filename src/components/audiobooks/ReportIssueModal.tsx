/**
 * Component: Report Issue Modal
 * Documentation: documentation/frontend/components.md
 *
 * Sub-modal for reporting problems with available audiobooks.
 * Rendered via portal at z-[60] to layer above AudiobookDetailsModal.
 */

'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useReportIssue } from '@/lib/hooks/useReportedIssues';

interface ReportIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  asin: string;
  bookTitle: string;
  bookAuthor: string;
  coverArtUrl?: string;
}

export function ReportIssueModal({
  isOpen,
  onClose,
  onSuccess,
  asin,
  bookTitle,
  bookAuthor,
  coverArtUrl,
}: ReportIssueModalProps) {
  const { reportIssue, isLoading } = useReportIssue();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const maxChars = 250;
  const canSubmit = reason.trim().length > 0 && reason.length <= maxChars && !isLoading;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError(null);
    try {
      await reportIssue(asin, reason.trim(), {
        title: bookTitle,
        author: bookAuthor,
        coverArtUrl,
      });
      setReason('');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to report issue');
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => !isLoading && onClose()}
    >
      <div
        className="mx-5 w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-2xl shadow-black/20 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 dark:bg-orange-400/15 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white">
                Report Issue
              </h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                {bookTitle}
              </p>
            </div>
          </div>

          {/* Reason Textarea */}
          <div className="space-y-2">
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Describe the problem (e.g., corrupted audio, wrong book, missing chapters...)"
              rows={3}
              maxLength={maxChars}
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-white/[0.06] rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none focus:border-orange-500/40 focus:ring-1 focus:ring-orange-500/20 transition-all disabled:opacity-50"
            />
            <div className="flex items-center justify-between px-1">
              <div className="min-h-[1.25rem]">
                {error && (
                  <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
                )}
              </div>
              <span className={`text-xs tabular-nums ${reason.length > maxChars ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
                {reason.length}/{maxChars}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex border-t border-gray-200/80 dark:border-gray-700/50">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-3 text-[15px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors disabled:opacity-40 border-r border-gray-200/80 dark:border-gray-700/50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 px-4 py-3 text-[15px] font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-orange-300 dark:border-orange-600 border-t-orange-600 dark:border-t-orange-400 rounded-full animate-spin" />
                Submitting...
              </span>
            ) : (
              'Submit Report'
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
