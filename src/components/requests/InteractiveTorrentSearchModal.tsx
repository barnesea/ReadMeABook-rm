/**
 * Component: Interactive Torrent Search Modal
 * Documentation: documentation/phase3/prowlarr.md
 */

'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { TorrentResult, RankedTorrent } from '@/lib/utils/ranking-algorithm';
import { useInteractiveSearch, useSelectTorrent, useSearchTorrents, useRequestWithTorrent } from '@/lib/hooks/useRequests';
import { Audiobook } from '@/lib/hooks/useAudiobooks';

interface InteractiveTorrentSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId?: string; // Optional - only provided when called from existing request
  audiobook: {
    title: string;
    author: string;
  };
  fullAudiobook?: Audiobook; // Optional - only provided when called from details modal
  onSuccess?: () => void;
}

export function InteractiveTorrentSearchModal({
  isOpen,
  onClose,
  requestId,
  audiobook,
  fullAudiobook,
  onSuccess,
}: InteractiveTorrentSearchModalProps) {
  // Hooks for existing request flow
  const { searchTorrents: searchByRequestId, isLoading: isSearchingByRequest, error: searchByRequestError } = useInteractiveSearch();
  const { selectTorrent, isLoading: isSelectingTorrent, error: selectTorrentError } = useSelectTorrent();

  // Hooks for new audiobook flow
  const { searchTorrents: searchByAudiobook, isLoading: isSearchingByAudiobook, error: searchByAudiobookError } = useSearchTorrents();
  const { requestWithTorrent, isLoading: isRequestingWithTorrent, error: requestWithTorrentError } = useRequestWithTorrent();

  const [results, setResults] = useState<(RankedTorrent & { qualityScore?: number })[]>([]);
  const [confirmTorrent, setConfirmTorrent] = useState<TorrentResult | null>(null);
  const [searchTitle, setSearchTitle] = useState(audiobook.title);

  // Determine which mode we're in
  const hasRequestId = !!requestId;
  const isSearching = hasRequestId ? isSearchingByRequest : isSearchingByAudiobook;
  const isDownloading = hasRequestId ? isSelectingTorrent : isRequestingWithTorrent;
  const error = hasRequestId
    ? (searchByRequestError || selectTorrentError)
    : (searchByAudiobookError || requestWithTorrentError);

  // Reset search title when modal opens/closes or audiobook changes
  React.useEffect(() => {
    setSearchTitle(audiobook.title);
    setResults([]);
  }, [isOpen, audiobook.title]);

  // Perform search when modal opens
  React.useEffect(() => {
    if (isOpen && results.length === 0) {
      performSearch();
    }
  }, [isOpen]);

  const performSearch = async () => {
    // Clear existing results while searching
    setResults([]);

    try {
      let data;
      if (hasRequestId) {
        // Existing flow: search by requestId with optional custom title
        const customTitle = searchTitle !== audiobook.title ? searchTitle : undefined;
        data = await searchByRequestId(requestId, customTitle);
      } else {
        // New flow: search by custom title + original author
        data = await searchByAudiobook(searchTitle, audiobook.author);
      }
      setResults(data || []);
    } catch (err) {
      // Error already handled by hook
      console.error('Search failed:', err);
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  };

  const handleDownloadClick = (torrent: TorrentResult) => {
    setConfirmTorrent(torrent);
  };

  const handleConfirmDownload = async () => {
    if (!confirmTorrent) return;

    try {
      if (hasRequestId) {
        // Existing flow: select torrent for existing request
        await selectTorrent(requestId, confirmTorrent);
      } else {
        // New flow: create request with torrent
        if (!fullAudiobook) {
          throw new Error('Audiobook data required to create request');
        }
        await requestWithTorrent(fullAudiobook, confirmTorrent);
      }
      // Notify parent of successful selection
      onSuccess?.();
      // Close modals on success
      setConfirmTorrent(null);
      onClose();
      // Request list will auto-refresh via SWR
    } catch (err) {
      // Error already handled by hook
      console.error('Failed to download torrent:', err);
      setConfirmTorrent(null);
    }
  };

  const formatSize = (bytes: number) => {
    const gb = bytes / (1024 ** 3);
    const mb = bytes / (1024 ** 2);
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
  };

  const getQualityBadgeColor = (score: number) => {
    if (score >= 90) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (score >= 70) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    if (score >= 50) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Select Torrent" size="full">
        <div className="space-y-4">
          {/* Search customization - editable for ALL modes */}
          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Search Title
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchTitle}
                onChange={(e) => setSearchTitle(e.target.value)}
                onKeyPress={handleSearchKeyPress}
                placeholder="Enter book title to search..."
                disabled={isSearching}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
              />
              <Button
                onClick={performSearch}
                disabled={isSearching || !searchTitle.trim()}
                variant="primary"
                size="sm"
              >
                Search
              </Button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">By {audiobook.author}</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Loading state */}
          {isSearching && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full"></div>
              <span className="ml-3 text-gray-600 dark:text-gray-400">Searching for torrents...</span>
            </div>
          )}

          {/* No results */}
          {!isSearching && results.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">No torrents found</p>
              <Button onClick={performSearch} variant="outline" className="mt-4">
                Try Again
              </Button>
            </div>
          )}

          {/* Results table */}
          {!isSearching && results.length > 0 && (
            <div className="overflow-x-auto -mx-6">
              <div className="inline-block min-w-full align-middle px-6">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-12">
                        #
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Title
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell w-24">
                        Size
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-16" title="Base quality score (0-100): Title/Author match (50) + Format (25) + Seeders (15) + Size (10)">
                        Score
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-16" title="Bonus points from indexer priority and other modifiers">
                        Bonus
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell w-20">
                        Seeds
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell w-32">
                        Indexer
                      </th>
                      <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-24">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {results.map((result) => (
                      <tr key={result.guid} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-2 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          {result.rank}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                          <div className="truncate">
                            <a
                              href={result.guid}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
                              title={result.title}
                            >
                              {result.title}
                            </a>
                          </div>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {result.format && (
                              <span className="inline-block px-2 py-0.5 text-xs bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded">
                                {result.format}
                              </span>
                            )}
                            <span className="sm:hidden inline-block px-2 py-0.5 text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 rounded">
                              {formatSize(result.size)}
                            </span>
                            <span className="md:hidden inline-block px-2 py-0.5 text-xs bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400 rounded">
                              {result.seeders} seeds
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                          {formatSize(result.size)}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-sm">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getQualityBadgeColor(Math.round(result.score))}`}>
                            {Math.round(result.score)}
                          </span>
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {result.bonusPoints > 0 ? `+${Math.round(result.bonusPoints)}` : '—'}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
                            </svg>
                            {result.seeders}
                          </span>
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                          {result.indexer}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-right text-sm">
                          <Button
                            onClick={() => handleDownloadClick(result)}
                            disabled={isDownloading}
                            size="sm"
                            variant="primary"
                          >
                            Download
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer with result count */}
          {!isSearching && results.length > 0 && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Found {results.length} torrent{results.length !== 1 ? 's' : ''}
              </p>
              <Button onClick={performSearch} variant="outline" size="sm">
                Refresh Results
              </Button>
            </div>
          )}
        </div>
      </Modal>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={!!confirmTorrent}
        onClose={() => setConfirmTorrent(null)}
        onConfirm={handleConfirmDownload}
        title="Download Torrent"
        message={`Download "${confirmTorrent?.title}"?`}
        confirmText="Download"
        isLoading={isDownloading}
        variant="primary"
      />
    </>
  );
}
