import type {MapInstance} from '../types/lib';
import {LngLatLike, PointLike} from '../types/common';

import type Mapbox from './mapbox';

/** These methods may break the react binding if called directly */
const skipMethods = new Set([
  'setMaxBounds',
  'setMinZoom',
  'setMaxZoom',
  'setMinPitch',
  'setMaxPitch',
  'setRenderWorldCopies',
  'setProjection',
  'setStyle',
  'addSource',
  'removeSource',
  'addLayer',
  'removeLayer',
  'setLayerZoomRange',
  'setFilter',
  'setPaintProperty',
  'setLayoutProperty',
  'setLight',
  'setTerrain',
  'setFog',
  'remove'
] as const);

interface MapRefError extends Error {
  operation: string;
  method?: string;
  params?: unknown[];
}

function createMapRefError(operation: string, message: string, method?: string, params?: unknown[]): MapRefError {
  const error = new Error(message) as MapRefError;
  error.operation = operation;
  error.method = method;
  error.params = params;
  error.name = 'MapRefError';
  return error;
}

export type MapRef = {
  getMap(): MapInstance;
} & Omit<MapInstance, 'setMaxBounds' | 'setMinZoom' | 'setMaxZoom' | 'setMinPitch' | 'setMaxPitch' | 'setRenderWorldCopies' | 'setProjection' | 'setStyle' | 'addSource' | 'removeSource' | 'addLayer' | 'removeLayer' | 'setLayerZoomRange' | 'setFilter' | 'setPaintProperty' | 'setLayoutProperty' | 'setLight' | 'setTerrain' | 'setFog' | 'remove'>;

interface CreateRefOptions {
  onError?: (error: MapRefError) => void;
  validateMethods?: boolean;
}

export default function createRef(
  mapInstance: Mapbox, 
  options: CreateRefOptions = {}
): MapRef | null {
  const { onError, validateMethods = true } = options;

  const handleError = (error: MapRefError) => {
    onError?.(error);
  };

  if (!mapInstance) {
    const error = createMapRefError('validation', 'mapInstance is required');
    handleError(error);
    return null;
  }

  if (!mapInstance.map) {
    const error = createMapRefError('validation', 'mapInstance.map is not available');
    handleError(error);
    return null;
  }

  if (!mapInstance.transform) {
    const error = createMapRefError('validation', 'mapInstance.transform is not available');
    handleError(error);
    return null;
  }

  const map = mapInstance.map;
  
  // Create a safe transform switcher with error handling
  const withTransformSwitch = <T>(
    operation: string,
    fn: () => T,
    lnglat?: LngLatLike,
    point?: PointLike
  ): T | undefined => {
    let originalTransform: any;
    try {
      originalTransform = map.transform;
      map.transform = mapInstance.transform;
      return fn();
    } catch (error) {
      const mapError = createMapRefError(
        'transform_operation',
        `Error during ${operation}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        operation,
        [lnglat, point].filter(Boolean)
      );
      handleError(mapError);
      return undefined;
    } finally {
      try {
        if (originalTransform) {
          map.transform = originalTransform;
        }
      } catch (restoreError) {
        const mapError = createMapRefError(
          'transform_restore',
          `Error restoring transform after ${operation}: ${restoreError instanceof Error ? restoreError.message : 'Unknown error'}`,
          operation
        );
        handleError(mapError);
      }
    }
  };

  const ref: Partial<MapRef> = {
    getMap: () => map,

    // Overwrite getters to use our shadow transform with error handling
    getCenter: () => {
      try {
        return mapInstance.transform.center;
      } catch (error) {
        const mapError = createMapRefError(
          'getter',
          `Error getting center: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'getCenter'
        );
        handleError(mapError);
        return map.getCenter(); // fallback to original
      }
    },

    getZoom: () => {
      try {
        return mapInstance.transform.zoom;
      } catch (error) {
        const mapError = createMapRefError(
          'getter',
          `Error getting zoom: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'getZoom'
        );
        handleError(mapError);
        return map.getZoom(); // fallback to original
      }
    },

    getBearing: () => {
      try {
        return mapInstance.transform.bearing;
      } catch (error) {
        const mapError = createMapRefError(
          'getter',
          `Error getting bearing: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'getBearing'
        );
        handleError(mapError);
        return map.getBearing(); // fallback to original
      }
    },

    getPitch: () => {
      try {
        return mapInstance.transform.pitch;
      } catch (error) {
        const mapError = createMapRefError(
          'getter',
          `Error getting pitch: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'getPitch'
        );
        handleError(mapError);
        return map.getPitch(); // fallback to original
      }
    },

    getPadding: () => {
      try {
        return mapInstance.transform.padding;
      } catch (error) {
        const mapError = createMapRefError(
          'getter',
          `Error getting padding: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'getPadding'
        );
        handleError(mapError);
        return map.getPadding(); // fallback to original
      }
    },

    getBounds: () => {
      try {
        return mapInstance.transform.getBounds();
      } catch (error) {
        const mapError = createMapRefError(
          'getter',
          `Error getting bounds: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'getBounds'
        );
        handleError(mapError);
        return map.getBounds(); // fallback to original
      }
    },

    project: (lnglat: LngLatLike) => {
      return withTransformSwitch('project', () => map.project(lnglat), lnglat);
    },

    unproject: (point: PointLike) => {
      return withTransformSwitch('unproject', () => map.unproject(point), undefined, point);
    },

    queryTerrainElevation: (lnglat: LngLatLike, options?: any) => {
      if (!map.queryTerrainElevation) {
        const error = createMapRefError(
          'method_unavailable',
          'queryTerrainElevation is not available on this map instance',
          'queryTerrainElevation',
          [lnglat, options]
        );
        handleError(error);
        return undefined;
      }
      return withTransformSwitch('queryTerrainElevation', () => map.queryTerrainElevation(lnglat, options), lnglat);
    },

    queryRenderedFeatures: (geometry?: any, options?: any) => {
      return withTransformSwitch('queryRenderedFeatures', () => map.queryRenderedFeatures(geometry, options)) as any;
    }
  };

  // Dynamically bind remaining methods with error handling
  try {
    const methodNames = getMethodNames(map);
    for (const key of methodNames) {
      if (!(key in ref) && !skipMethods.has(key as any)) {
        if (validateMethods && typeof map[key] !== 'function') {
          const error = createMapRefError(
            'method_binding',
            `Property ${key} is not a function`,
            key
          );
          handleError(error);
        } else {
          try {
            (ref as any)[key] = (...args: unknown[]) => {
              try {
                return map[key](...args);
              } catch (error) {
                const mapError = createMapRefError(
                  'method_execution',
                  `Error executing ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  key,
                  args
                );
                handleError(mapError);
                return undefined;
              }
            };
          } catch (bindError) {
            const error = createMapRefError(
              'method_binding',
              `Error binding method ${key}: ${bindError instanceof Error ? bindError.message : 'Unknown error'}`,
              key
            );
            handleError(error);
          }
        }
      }
    }
  } catch (error) {
    const mapError = createMapRefError(
      'method_enumeration',
      `Error enumerating map methods: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    handleError(mapError);
  }

  return ref as MapRef;
}

function getMethodNames(obj: object): string[] {
  const result = new Set<string>();
  const excludedMethods = new Set(['fire', 'setEventedParent', 'constructor']);

  try {
    let proto = obj;
    let depth = 0;
    const maxDepth = 10; // Prevent infinite prototype chain traversal

    while (proto && depth < maxDepth) {
      try {
        const propertyNames = Object.getOwnPropertyNames(proto);
        for (const key of propertyNames) {
          if (
            key[0] !== '_' &&
            !excludedMethods.has(key) &&
            typeof obj[key] === 'function'
          ) {
            result.add(key);
          }
        }
      } catch (protoError) {
        // Skip this prototype level if we can't enumerate its properties
      }
      
      try {
        proto = Object.getPrototypeOf(proto);
        depth++;
      } catch (getProtoError) {
        // Can't get prototype, break the loop
        break;
      }
    }

    if (depth >= maxDepth) {
      // Maximum prototype depth reached, stopping enumeration
    }
  } catch (error) {
    // Unexpected error during method enumeration
  }

  return Array.from(result);
}
