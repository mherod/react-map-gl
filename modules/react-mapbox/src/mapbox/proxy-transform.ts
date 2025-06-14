import type {Transform} from '../types/internal';
import type {ViewState, LngLat} from '../types/common';
import {applyViewStateToTransform, isViewStateControlled} from '../utils/transform';

/**
 * Mapbox map is stateful.
 * During method calls/user interactions, map.transform is mutated and deviate from user-supplied props.
 * In order to control the map reactively, we trap the transform mutations with a proxy,
 * which reflects the view state resolved from both user-supplied props and the underlying state
 */
export type ProxyTransform = Transform & {
  $internalUpdate: boolean;
  $proposedTransform: Transform | null;
  $reactViewState: Partial<ViewState>;
};

interface ProxyTransformError extends Error {
  operation: string;
  property: string;
  value: unknown;
}

// These are Transform class methods that:
// + do not mutate any view state properties
// + populate private members derived from view state properties
// They should always reflect the state of their owning instance and NOT trigger any proxied getter/setter
const unproxiedMethods = new Set([
  '_calcMatrices',
  '_calcFogMatrices',
  '_updateCameraState',
  '_updateSeaLevelZoom'
]);

function createProxyError(operation: string, property: string, value: unknown, message: string): ProxyTransformError {
  const error = new Error(message) as ProxyTransformError;
  error.operation = operation;
  error.property = property;
  error.value = value;
  error.name = 'ProxyTransformError';
  return error;
}

function isValidTransformProperty(prop: string): boolean {
  // Define valid transform properties to prevent arbitrary property access
  const validProps = new Set([
    'center', '_center', 'zoom', '_zoom', '_seaLevelZoom', 'pitch', '_pitch',
    'bearing', 'rotation', 'angle', '_centerAltitude', '_setZoom', '_translateCameraConstrained',
    '$reactViewState', '$proposedTransform', '$internalUpdate'
  ]);
  
  return validProps.has(prop) || unproxiedMethods.has(prop) || typeof prop === 'string';
}

export function createProxyTransform(
  tr: Transform, 
  onError?: (error: ProxyTransformError) => void
): ProxyTransform {
  if (!tr || typeof tr !== 'object') {
    const error = createProxyError('initialization', 'transform', tr, 'Invalid transform object provided');
    if (onError) {
      onError(error);
    }
    throw error;
  }

  let internalUpdate = false;
  let reactViewState: Partial<ViewState> = {};
  /**
   * Reflects view state set by react props
   * This is the transform seen by painter, style etc.
   */
  const controlledTransform: Transform = tr;
  /** Populated during camera move (handler/easeTo) if there is a discrepency between react props and proposed view state
   * This is the transform seen by Mapbox's input handlers
   */
  let proposedTransform: Transform | null = null;

  const handlers: ProxyHandler<Transform> = {
    get(target: Transform, prop: string) {
      try {
        // Validate property access
        if (!isValidTransformProperty(prop)) {
          const error = createProxyError('get', prop, undefined, `Invalid property access: ${prop}`);
          onError?.(error);
          return undefined;
        }

        // Props added by us
        if (prop === '$reactViewState') {
          return reactViewState;
        }
        if (prop === '$proposedTransform') {
          return proposedTransform;
        }
        if (prop === '$internalUpdate') {
          return internalUpdate;
        }

        // Special method handling - _setZoom bypasses zoom setter
        if (prop === '_setZoom') {
          return (z: number) => {
            try {
              if (!Number.isFinite(z)) {
                const error = createProxyError('method', '_setZoom', z, 'Invalid zoom value: must be finite number');
                onError?.(error);
                return;
              }

              if (internalUpdate && proposedTransform) {
                proposedTransform[prop](z);
              }
              if (!Number.isFinite(reactViewState.zoom)) {
                controlledTransform[prop](z);
              }
            } catch (error) {
              const proxyError = createProxyError('method', '_setZoom', z, 
                `Error in _setZoom: ${error instanceof Error ? error.message : 'Unknown error'}`);
              onError?.(proxyError);
            }
          };
        }

        // Camera constraint handling
        if (
          internalUpdate &&
          prop === '_translateCameraConstrained' &&
          isViewStateControlled(reactViewState)
        ) {
          try {
            proposedTransform = proposedTransform || controlledTransform.clone();
          } catch (error) {
            const proxyError = createProxyError('clone', '_translateCameraConstrained', undefined,
              `Error cloning transform: ${error instanceof Error ? error.message : 'Unknown error'}`);
            onError?.(proxyError);
          }
        }

        // Unproxied methods that update both transforms
        if (unproxiedMethods.has(prop)) {
          return function (...params: unknown[]) {
            try {
              proposedTransform?.[prop](...params);
              controlledTransform[prop](...params);
            } catch (error) {
              const proxyError = createProxyError('method', prop, params,
                `Error in unproxied method: ${error instanceof Error ? error.message : 'Unknown error'}`);
              onError?.(proxyError);
            }
          };
        }

        // Expose the proposed transform to input handlers
        if (internalUpdate && proposedTransform) {
          return proposedTransform[prop];
        }

        // Expose the controlled transform to renderer, markers, and event listeners
        return controlledTransform[prop];
      } catch (error) {
        const proxyError = createProxyError('get', prop, undefined,
          `Unexpected error in proxy getter: ${error instanceof Error ? error.message : 'Unknown error'}`);
        onError?.(proxyError);
        return undefined;
      }
    },

    set(target: Transform, prop: string, value: unknown) {
      try {
        // Validate property access
        if (!isValidTransformProperty(prop)) {
          const error = createProxyError('set', prop, value, `Invalid property assignment: ${prop}`);
          onError?.(error);
          return false;
        }

        // Props added by us
        if (prop === '$reactViewState') {
          try {
            reactViewState = value as Partial<ViewState>;
            applyViewStateToTransform(controlledTransform, reactViewState);
            return true;
          } catch (error) {
            const proxyError = createProxyError('set', '$reactViewState', value,
              `Error applying view state: ${error instanceof Error ? error.message : 'Unknown error'}`);
            onError?.(proxyError);
            return false;
          }
        }
        if (prop === '$proposedTransform') {
          proposedTransform = value as Transform;
          return true;
        }
        if (prop === '$internalUpdate') {
          internalUpdate = value as boolean;
          return true;
        }

        // Handle controlled properties with validation
        let controlledValue = value;
        
        if (prop === 'center' || prop === '_center') {
          if (Number.isFinite(reactViewState.longitude) || Number.isFinite(reactViewState.latitude)) {
            try {
              const lngLatValue = value as LngLat;
              if (lngLatValue && typeof lngLatValue === 'object' && 'constructor' in lngLatValue) {
                // @ts-expect-error LngLat constructor is not typed
                controlledValue = new lngLatValue.constructor(
                  reactViewState.longitude ?? lngLatValue.lng,
                  reactViewState.latitude ?? lngLatValue.lat
                );
              }
            } catch (error) {
              const proxyError = createProxyError('set', prop, value,
                `Error creating controlled center value: ${error instanceof Error ? error.message : 'Unknown error'}`);
              onError?.(proxyError);
              controlledValue = value; // fallback to original value
            }
          }
        } else if (prop === 'zoom' || prop === '_zoom' || prop === '_seaLevelZoom') {
          if (Number.isFinite(reactViewState.zoom)) {
            controlledValue = controlledTransform[prop];
          }
        } else if (prop === '_centerAltitude') {
          if (Number.isFinite(reactViewState.elevation)) {
            controlledValue = controlledTransform[prop];
          }
        } else if (prop === 'pitch' || prop === '_pitch') {
          if (Number.isFinite(reactViewState.pitch)) {
            controlledValue = controlledTransform[prop];
          }
        } else if (prop === 'bearing' || prop === 'rotation' || prop === 'angle') {
          if (Number.isFinite(reactViewState.bearing)) {
            controlledValue = controlledTransform[prop];
          }
        }

        // During camera update, save overridden view states in proposedTransform
        if (internalUpdate && controlledValue !== value) {
          try {
            proposedTransform = proposedTransform || controlledTransform.clone();
          } catch (error) {
            const proxyError = createProxyError('set', prop, value,
              `Error cloning transform for proposed changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
            onError?.(proxyError);
          }
        }
        
        if (internalUpdate && proposedTransform) {
          try {
            proposedTransform[prop] = value;
          } catch (error) {
            const proxyError = createProxyError('set', prop, value,
              `Error setting proposed transform property: ${error instanceof Error ? error.message : 'Unknown error'}`);
            onError?.(proxyError);
          }
        }

        // Apply to controlled transform
        try {
          controlledTransform[prop] = controlledValue;
          return true;
        } catch (error) {
          const proxyError = createProxyError('set', prop, controlledValue,
            `Error setting controlled transform property: ${error instanceof Error ? error.message : 'Unknown error'}`);
          onError?.(proxyError);
          return false;
        }
      } catch (error) {
        const proxyError = createProxyError('set', prop, value,
          `Unexpected error in proxy setter: ${error instanceof Error ? error.message : 'Unknown error'}`);
        onError?.(proxyError);
        return false;
      }
    }
  };

  try {
    return new Proxy(tr, handlers) as ProxyTransform;
  } catch (error) {
    const proxyError = createProxyError('initialization', 'proxy', tr,
      `Error creating proxy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    onError?.(proxyError);
    throw proxyError;
  }
}
