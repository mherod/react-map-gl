import type {PointLike} from '../types/common';

/**
 * Compare two points
 * @param a
 * @param b
 * @returns true if the points are equal
 */
export function arePointsEqual(a?: PointLike, b?: PointLike): boolean {
  const ax = Array.isArray(a) ? a[0] : a ? a.x : 0;
  const ay = Array.isArray(a) ? a[1] : a ? a.y : 0;
  const bx = Array.isArray(b) ? b[0] : b ? b.x : 0;
  const by = Array.isArray(b) ? b[1] : b ? b.y : 0;
  return ax === bx && ay === by;
}

interface DeepEqualOptions {
  maxDepth?: number;
  strictTypeChecking?: boolean;
  customComparators?: Map<string, (a: unknown, b: unknown) => boolean>;
}

interface DeepEqualContext {
  visitedA: WeakSet<object>;
  visitedB: WeakSet<object>;
  depth: number;
  options: DeepEqualOptions;
}

/**
 * Enhanced deep equality comparison with circular reference protection
 * @param a First value to compare
 * @param b Second value to compare  
 * @param options Configuration options
 * @returns true if the values are deeply equal
 */
export function deepEqual(
  a: unknown, 
  b: unknown, 
  options: DeepEqualOptions = {}
): boolean {
  const context: DeepEqualContext = {
    visitedA: new WeakSet(),
    visitedB: new WeakSet(),
    depth: 0,
    options
  };
  return deepEqualWithTracking(a, b, context);
}

function deepEqualWithTracking(
  a: unknown,
  b: unknown,
  context: DeepEqualContext
): boolean {
  const { maxDepth = 100, strictTypeChecking = false, customComparators } = context.options;
  const { visitedA, visitedB, depth } = context;

  // Prevent infinite recursion
  if (depth > maxDepth) {
    return false;
  }

  // Strict equality check (handles primitives, null, undefined, NaN)
  if (Object.is(a, b)) {
    return true;
  }

  // Type mismatch for strict checking
  if (strictTypeChecking && typeof a !== typeof b) {
    return false;
  }

  // Null/undefined checks
  if (a === null || a === undefined || b === null || b === undefined) {
    return a === b;
  }

  // Handle special number cases
  if (typeof a === 'number' && typeof b === 'number') {
    // Both NaN
    if (Number.isNaN(a) && Number.isNaN(b)) {
      return true;
    }
    // Infinity cases
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return a === b;
    }
  }

  // Date comparison
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // RegExp comparison
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.toString() === b.toString();
  }

  // Custom comparators
  if (customComparators) {
    const aType = Object.prototype.toString.call(a);
    const comparator = customComparators.get(aType);
    if (comparator) {
      return comparator(a, b);
    }
  }

  // Only continue for objects and arrays
  if (typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  // Circular reference detection
  if (visitedA.has(a)) {
    return visitedB.has(b);
  }
  if (visitedB.has(b)) {
    return false;
  }

  // Add to visited sets
  visitedA.add(a);
  visitedB.add(b);

  try {
    // Array comparison
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) {
        return false;
      }
      for (let i = 0; i < a.length; i++) {
        if (!deepEqualWithTracking(a[i], b[i], { ...context, depth: depth + 1 })) {
          return false;
        }
      }
      return true;
    }

    if (Array.isArray(b)) {
      return false;
    }

    // Object comparison
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    
    if (aKeys.length !== bKeys.length) {
      return false;
    }

    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) {
        return false;
      }
      if (!deepEqualWithTracking(
        (a as Record<string, unknown>)[key], 
        (b as Record<string, unknown>)[key], 
        { ...context, depth: depth + 1 }
      )) {
        return false;
      }
    }

    return true;
  } finally {
    // Clean up visited sets
    visitedA.delete(a);
    visitedB.delete(b);
  }
}

/**
 * Shallow equality comparison for performance-critical scenarios
 * @param a First value
 * @param b Second value
 * @returns true if values are shallowly equal
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || 
        !Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }

  return true;
}
