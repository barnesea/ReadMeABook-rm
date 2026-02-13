/**
 * Component: Add Goodreads Shelf Modal
 * Documentation: documentation/frontend/components.md
 */

'use client';

import React, { useState } from 'react';
import { Modal } from './Modal';
import { Input } from './Input';
import { Button } from './Button';
import { useAddGoodreadsShelf } from '@/lib/hooks/useGoodreadsShelves';

interface AddGoodreadsShelfModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GOODREADS_RSS_PATTERN = /goodreads\.com\/review\/list_rss\//;

export function AddGoodreadsShelfModal({ isOpen, onClose }: AddGoodreadsShelfModalProps) {
  const [rssUrl, setRssUrl] = useState('');
  const [validationError, setValidationError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const { addShelf, isLoading, error } = useAddGoodreadsShelf();

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) {
      setValidationError('RSS URL is required');
      return false;
    }
    if (!GOODREADS_RSS_PATTERN.test(url)) {
      setValidationError('Must be a Goodreads shelf RSS URL (goodreads.com/review/list_rss/...)');
      return false;
    }
    setValidationError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateUrl(rssUrl)) return;

    try {
      const shelf = await addShelf(rssUrl);
      setSuccess(true);
      setSuccessMessage(`Added shelf "${shelf.name}" successfully!`);
      setRssUrl('');

      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch {
      // Error is handled by the hook
    }
  };

  const handleClose = () => {
    setRssUrl('');
    setValidationError('');
    setSuccess(false);
    setSuccessMessage('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Goodreads Shelf" size="sm">
      <div className="space-y-5">
        {/* Visual header */}
        <div className="flex items-center gap-4 pb-4 border-b border-gray-100 dark:border-gray-700/50">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 flex items-center justify-center ring-1 ring-amber-200/50 dark:ring-amber-500/10 flex-shrink-0">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.556a4.5 4.5 0 00-6.364-6.364L4.5 8.257a4.5 4.5 0 007.244 1.242" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Paste your Goodreads shelf RSS URL. Books will be automatically requested as audiobooks during each sync.
            </p>
          </div>
        </div>

        {/* Success alert */}
        {success && (
          <div className="flex items-center gap-3 p-3.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{successMessage}</p>
          </div>
        )}

        {/* Error alert */}
        {error && (
          <div className="flex items-center gap-3 p-3.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl">
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Input
              type="url"
              label="Goodreads RSS URL"
              value={rssUrl}
              onChange={(e) => {
                setRssUrl(e.target.value);
                if (validationError) setValidationError('');
              }}
              placeholder="https://www.goodreads.com/review/list_rss/..."
              error={validationError}
              disabled={isLoading || success}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
              Find it on Goodreads: My Books &rarr; select a shelf &rarr; RSS link at the bottom of the page.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isLoading || success}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isLoading}
              disabled={isLoading || success}
            >
              Add Shelf
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
