/**
 * Component: Narrator Selection Modal
 * Documentation: plans/narrator-version-search.md
 *
 * Modal to select preferred narrator/version for an audiobook
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchTorrents } from '@/lib/hooks/useRequests';
import { InteractiveTorrentSearchModal } from '@/components/requests/InteractiveTorrentSearchModal';

interface Version {
  asin: string;
  title: string;
  author: string;
  narrator: string;
  coverArtUrl?: string;
  durationMinutes?: number;
}

interface NarratorSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  versions: Version[];
  baseTitle: string;
  baseAuthor: string;
  onSelect: (version: Version) => void;
}

// Format duration
const formatDuration = (minutes?: number): string | null => {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
};

// Format cover art with fallback
const getCoverUrl = (coverArtUrl?: string): string => {
  if (!coverArtUrl) return '';
  return coverArtUrl.replace(/\._.*_\./, '._SL500_.');
};

export function NarratorSelectionModal({
  isOpen,
  onClose,
  versions,
  baseTitle,
  baseAuthor,
  onSelect,
}: NarratorSelectionModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [showInteractiveSearch, setShowInteractiveSearch] = useState(false);

  // Mount tracking for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // ESC key and body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handleSelect = (version: Version) => {
    onSelect(version);
  };

  const handleInteractiveSearch = (version: Version) => {
    setSelectedVersion(version);
    setShowInteractiveSearch(true);
  };

  const handleInteractiveSearchClose = () => {
    setShowInteractiveSearch(false);
    setSelectedVersion(null);
  };

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      style={{ height: '100dvh' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
        style={{
          maxHeight: 'calc(100dvh - 2rem)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Select Narrator Version
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              "{baseTitle}" by {baseAuthor}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {versions.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </div>
              <p className="text-gray-900 dark:text-white font-medium">No versions found</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Please try searching for a different title</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Select your preferred narrator version:
              </p>
              <div className="space-y-3">
                {versions.map((version, index) => (
                  <div
                    key={version.asin}
                    className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border border-gray-200 dark:border-gray-700/50"
                  >
                    {/* Cover Art */}
                    <div className="flex-shrink-0 w-16 h-24 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700">
                      {version.coverArtUrl ? (
                        <img
                          src={getCoverUrl(version.coverArtUrl)}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Version Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                            {version.title}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                            {version.author}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSelect(version)}
                            className="flex-shrink-0 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all rounded-lg whitespace-nowrap"
                          >
                            Select
                          </button>
                          <button
                            onClick={() => handleInteractiveSearch(version)}
                            className="flex-shrink-0 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 active:scale-95 transition-all rounded-lg whitespace-nowrap"
                            title="Interactive search with this narrator"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Narrator and Duration */}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                          </svg>
                          Narrated by {version.narrator}
                        </span>
                        {version.durationMinutes && (
                          <>
                            <span className="text-gray-300 dark:text-gray-600 select-none">&middot;</span>
                            <span className="flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {formatDuration(version.durationMinutes)}
                            </span>
                          </>
                        )}
                      </div>

                      {/* ASIN (hidden by default, can be shown for debugging) */}
                      <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                        ASIN: {version.asin}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-t border-gray-200/50 dark:border-gray-700/50">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Showing {versions.length} version{versions.length !== 1 ? 's' : ''} found
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(modalContent, document.body)}
      {showInteractiveSearch && selectedVersion && (
        <InteractiveSearchModal
          isOpen={showInteractiveSearch}
          onClose={handleInteractiveSearchClose}
          version={selectedVersion}
          baseTitle={baseTitle}
          baseAuthor={baseAuthor}
        />
      )}
    </>
  );
}

// Helper component to render the interactive search modal
function InteractiveSearchModal({
  isOpen,
  onClose,
  version,
  baseTitle,
  baseAuthor,
}: {
  isOpen: boolean;
  onClose: () => void;
  version: Version;
  baseTitle: string;
  baseAuthor: string;
}) {
  // Build search query with narrator
  const searchTitle = version.narrator
    ? `${version.title} ${version.narrator}`
    : version.title;

  return (
    <InteractiveTorrentSearchModal
      isOpen={isOpen}
      onClose={onClose}
      audiobook={{
        title: searchTitle,
        author: version.author,
      }}
      fullAudiobook={{
        asin: version.asin,
        title: version.title,
        author: version.author,
        narrator: version.narrator,
        coverArtUrl: version.coverArtUrl,
        durationMinutes: version.durationMinutes,
      }}
      onSuccess={onClose}
    />
  );
}