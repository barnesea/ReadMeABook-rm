/**
 * Component: Category Tree View with Toggle Switches
 * Documentation: documentation/frontend/components.md
 */

'use client';

import React, { useState, useMemo } from 'react';
import {
  TORRENT_CATEGORIES,
  getChildIds,
  areAllChildrenSelected,
  isParentCategory,
  getAllStandardCategoryIds,
} from '@/lib/utils/torrent-categories';

interface CategoryTreeViewProps {
  selectedCategories: number[];
  onChange: (categories: number[]) => void;
  defaultCategories?: number[]; // Categories to show "Default" badge for (e.g., [3030] for audiobook, [7020] for ebook)
}

export function CategoryTreeView({
  selectedCategories,
  onChange,
  defaultCategories = [3030], // Default to audiobook category for backwards compatibility
}: CategoryTreeViewProps) {
  const [customInput, setCustomInput] = useState('');
  const [customError, setCustomError] = useState('');

  const standardIds = useMemo(() => getAllStandardCategoryIds(), []);

  // Derive custom categories from selected categories that aren't in the standard tree
  const customCategories = useMemo(
    () => selectedCategories.filter((id) => !standardIds.has(id)).sort((a, b) => a - b),
    [selectedCategories, standardIds]
  );

  const isDefaultCategory = (categoryId: number) => defaultCategories.includes(categoryId);

  const handleParentToggle = (parentId: number) => {
    const childIds = getChildIds(parentId);
    const allChildrenSelected = areAllChildrenSelected(parentId, selectedCategories);

    if (allChildrenSelected) {
      // Deselect parent and all children
      onChange(
        selectedCategories.filter(
          (id) => id !== parentId && !childIds.includes(id)
        )
      );
    } else {
      // Select parent and all children
      const newSelection = new Set(selectedCategories);
      newSelection.add(parentId);
      childIds.forEach((id) => newSelection.add(id));
      onChange(Array.from(newSelection));
    }
  };

  const handleChildToggle = (childId: number) => {
    const isSelected = selectedCategories.includes(childId);

    if (isSelected) {
      // Deselect child
      onChange(selectedCategories.filter((id) => id !== childId));
    } else {
      // Select child
      onChange([...selectedCategories, childId]);
    }
  };

  const handleRemoveCustom = (categoryId: number) => {
    onChange(selectedCategories.filter((id) => id !== categoryId));
  };

  const handleAddCustom = () => {
    setCustomError('');
    const trimmed = customInput.trim();

    if (!trimmed) {
      setCustomError('Enter a category ID');
      return;
    }

    const parsed = parseInt(trimmed, 10);

    if (isNaN(parsed) || !Number.isInteger(Number(trimmed)) || String(parsed) !== trimmed) {
      setCustomError('Must be a whole number');
      return;
    }

    if (parsed <= 0) {
      setCustomError('Must be a positive number');
      return;
    }

    if (standardIds.has(parsed)) {
      setCustomError('This is a standard category — use the toggles above');
      return;
    }

    if (selectedCategories.includes(parsed)) {
      setCustomError('Already added');
      return;
    }

    onChange([...selectedCategories, parsed]);
    setCustomInput('');
  };

  const handleCustomKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustom();
    }
  };

  const isParentSelected = (parentId: number) => {
    return areAllChildrenSelected(parentId, selectedCategories);
  };

  const isChildSelected = (childId: number) => {
    return selectedCategories.includes(childId);
  };

  return (
    <div className="space-y-5">
      {/* Standard Categories */}
      {TORRENT_CATEGORIES.map((category) => (
        <div key={category.id} className="space-y-2">
          {/* Parent Category Header */}
          <div className="flex items-center justify-between px-2 py-1">
            <div className="flex items-center gap-3">
              <span className="text-base font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                {category.name}
              </span>
              <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                [{category.id}]
              </span>
              {isDefaultCategory(category.id) && (
                <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                  Default
                </span>
              )}
            </div>
            <ToggleSwitch
              checked={isParentCategory(category.id) ? isParentSelected(category.id) : isChildSelected(category.id)}
              onChange={() => {
                if (isParentCategory(category.id)) {
                  handleParentToggle(category.id);
                } else {
                  handleChildToggle(category.id);
                }
              }}
              disabled={false}
            />
          </div>

          {/* Child Categories */}
          {category.children && category.children.length > 0 && (
            <div className="ml-4 space-y-2">
              {category.children.map((child) => (
                <div
                  key={child.id}
                  className="flex items-center justify-between p-2.5 bg-white dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {child.name}
                    </span>
                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                      [{child.id}]
                    </span>
                    {isDefaultCategory(child.id) && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                        Default
                      </span>
                    )}
                  </div>
                  <ToggleSwitch
                    checked={isChildSelected(child.id)}
                    onChange={() => handleChildToggle(child.id)}
                    disabled={isParentSelected(category.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Custom Categories Section */}
      <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 px-2 py-1">
          <span className="text-base font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
            Custom
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Add custom Newznab/Torznab category IDs
          </span>
        </div>

        {/* Existing custom categories */}
        {customCategories.length > 0 && (
          <div className="ml-4 space-y-2">
            {customCategories.map((catId) => (
              <div
                key={catId}
                className="flex items-center justify-between p-2.5 bg-white dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Custom
                  </span>
                  <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                    [{catId}]
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveCustom(catId)}
                  className="text-xs px-2.5 py-1 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add custom category input */}
        <div className="ml-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={customInput}
              onChange={(e) => {
                setCustomInput(e.target.value);
                setCustomError('');
              }}
              onKeyDown={handleCustomKeyDown}
              placeholder="Category ID"
              className={`
                w-32 px-3 py-1.5 text-sm rounded-lg border bg-white dark:bg-gray-800
                text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-gray-900
                ${customError
                  ? 'border-red-300 dark:border-red-700'
                  : 'border-gray-200 dark:border-gray-700'
                }
              `}
            />
            <button
              type="button"
              onClick={handleAddCustom}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-gray-900"
            >
              Add
            </button>
          </div>
          {customError && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1.5">
              {customError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
}

function ToggleSwitch({ checked, onChange, disabled }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800
        ${
          checked
            ? 'bg-blue-600 dark:bg-blue-500'
            : 'bg-gray-200 dark:bg-gray-700'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      aria-checked={checked}
      role="switch"
    >
      <span
        className={`
          inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out shadow-lg
          ${checked ? 'translate-x-6' : 'translate-x-1'}
        `}
      />
    </button>
  );
}
