/**
 * Component: Flag Configuration Row
 * Documentation: documentation/phase3/ranking-algorithm.md
 *
 * Allows configuration of indexer flag bonuses/penalties with visual slider feedback
 */

'use client';

import React from 'react';
import { IndexerFlagConfig } from '@/lib/utils/ranking-algorithm';
import { TrashIcon } from '@heroicons/react/24/outline';

interface FlagConfigRowProps {
  config: IndexerFlagConfig;
  onChange: (config: IndexerFlagConfig) => void;
  onRemove: () => void;
}

export function FlagConfigRow({ config, onChange, onRemove }: FlagConfigRowProps) {
  const exampleBase = 85;
  const bonusPoints = exampleBase * (config.modifier / 100);
  const finalScore = exampleBase + bonusPoints;

  // Get color for modifier percentage display
  const getModifierColor = (modifier: number): string => {
    if (modifier < -50) return 'text-red-700 dark:text-red-400';
    if (modifier < 0) return 'text-red-600 dark:text-red-500';
    if (modifier === 0) return 'text-gray-600 dark:text-gray-400';
    if (modifier > 50) return 'text-green-700 dark:text-green-400';
    return 'text-green-600 dark:text-green-500';
  };

  // Get slider gradient based on current value
  const getSliderBackground = (modifier: number): string => {
    const normalizedPosition = ((modifier + 100) / 200) * 100; // -100 to 100 → 0% to 100%

    // Create gradient that fills from left up to current position
    // Red on left, yellow in middle, green on right
    return `linear-gradient(to right,
      #ef4444 0%,
      #ef4444 ${Math.max(0, normalizedPosition - 5)}%,
      #fbbf24 50%,
      #10b981 ${Math.min(100, normalizedPosition + 5)}%,
      #10b981 100%)`;
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
      <div className="flex items-start gap-4">
        {/* Flag Name Input */}
        <div className="flex-shrink-0 w-48">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Flag Name
          </label>
          <input
            type="text"
            value={config.name}
            onChange={(e) => onChange({ ...config, name: e.target.value })}
            placeholder="e.g. Freeleech"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>

        {/* Score Modifier Slider */}
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Score Modifier
          </label>

          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 w-12 text-right">-100%</span>

            <div className="flex-1 relative">
              <input
                type="range"
                min="-100"
                max="100"
                step="5"
                value={config.modifier}
                onChange={(e) => onChange({ ...config, modifier: parseInt(e.target.value) })}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-custom"
                style={{
                  background: getSliderBackground(config.modifier),
                }}
              />
              <style jsx>{`
                .slider-custom::-webkit-slider-thumb {
                  appearance: none;
                  width: 18px;
                  height: 18px;
                  border-radius: 50%;
                  background: white;
                  border: 2px solid #3b82f6;
                  cursor: pointer;
                  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                }
                .slider-custom::-moz-range-thumb {
                  width: 18px;
                  height: 18px;
                  border-radius: 50%;
                  background: white;
                  border: 2px solid #3b82f6;
                  cursor: pointer;
                  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                }
              `}</style>
            </div>

            <span className="text-xs text-gray-500 dark:text-gray-400 w-12">+100%</span>

            <span className={`text-sm font-bold min-w-[60px] text-right ${getModifierColor(config.modifier)}`}>
              {config.modifier > 0 ? '+' : ''}{config.modifier}%
            </span>
          </div>

          {/* Dynamic Help Text */}
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Example: Base score of {exampleBase} with "{config.name || 'this flag'}"
            {' → '}
            <span className={bonusPoints >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
              {bonusPoints >= 0 ? '+' : ''}{bonusPoints.toFixed(1)} bonus points
            </span>
            {bonusPoints < 0 && finalScore < 50 && (
              <span className="text-red-600 dark:text-red-400 font-medium">
                {' '}⚠️ Would disqualify (final: {finalScore.toFixed(1)} &lt; 50)
              </span>
            )}
          </p>
        </div>

        {/* Remove Button */}
        <button
          onClick={onRemove}
          className="flex-shrink-0 mt-7 p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
          title="Remove flag rule"
        >
          <TrashIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
