export type GlobalSettings = {
  /** The map's default API URL for requesting tiles, styles, sprites, and glyphs. */
  baseApiUrl?: string;
  /** The maximum number of images (raster tiles, sprites, icons) to load in parallel.
   * @default 16
   */
  maxParallelImageRequests?: number;
  /** The map's RTL text plugin. Necessary for supporting the Arabic and Hebrew languages, which are written right-to-left.  */
  RTLTextPlugin?: string | false;
  /** Provides an interface for external module bundlers such as Webpack or Rollup to package mapbox-gl's WebWorker into a separate class and integrate it with the library.
Takes precedence over `workerUrl`. */
  workerClass?: unknown;
  /** The number of web workers instantiated on a page with mapbox-gl maps.
   * @default 2
   */
  workerCount?: number;
  /** Provides an interface for loading mapbox-gl's WebWorker bundle from a self-hosted URL.
   * This is useful if your site needs to operate in a strict CSP (Content Security Policy) environment
   * wherein you are not allowed to load JavaScript code from a Blob URL, which is default behavior. */
  workerUrl?: string;
  /** Custom error handler for RTL plugin loading */
  onRTLPluginError?: (error: Error) => void;
  /** RTL plugin loading timeout in milliseconds */
  RTLPluginTimeout?: number;
};

interface MapLibWithGlobals {
  [key: string]: unknown;
  getRTLTextPluginStatus?: () => string;
  setRTLTextPlugin?: (url: string, callback: (error?: Error) => void, lazy?: boolean) => void;
}

interface GlobalSettingsError extends Error {
  setting: string;
  value: unknown;
}

const globalSettings = [
  'baseApiUrl',
  'maxParallelImageRequests',
  'workerClass',
  'workerCount',
  'workerUrl'
] as const;

const DEFAULT_RTL_PLUGIN_URL = 'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.2.3/mapbox-gl-rtl-text.js';
const DEFAULT_RTL_TIMEOUT = 10000; // 10 seconds

function createGlobalSettingsError(setting: string, value: unknown, message: string): GlobalSettingsError {
  const error = new Error(message) as GlobalSettingsError;
  error.setting = setting;
  error.value = value;
  error.name = 'GlobalSettingsError';
  return error;
}

function validateGlobalSetting(key: string, value: unknown): boolean {
  switch (key) {
    case 'maxParallelImageRequests':
    case 'workerCount':
      return typeof value === 'number' && value > 0 && Number.isInteger(value);
    case 'baseApiUrl':
    case 'workerUrl':
      return typeof value === 'string' && value.length > 0;
    case 'workerClass':
      return value !== null && value !== undefined;
    default:
      return true;
  }
}

export default function setGlobals(
  mapLib: MapLibWithGlobals, 
  props: GlobalSettings,
  onError?: (error: GlobalSettingsError) => void
): void {
  if (!mapLib || typeof mapLib !== 'object') {
    const error = createGlobalSettingsError('mapLib', mapLib, 'Invalid mapLib: expected object');
    onError?.(error);
    return;
  }

  // Apply global settings with validation
  for (const key of globalSettings) {
    if (key in props) {
      const value = props[key];
      
      try {
        if (!validateGlobalSetting(key, value)) {
          const error = createGlobalSettingsError(
            key, 
            value, 
            `Invalid value for ${key}: ${String(value)}`
          );
          onError?.(error);
        } else {
          mapLib[key] = value;
        }
      } catch (error) {
        const settingsError = createGlobalSettingsError(
          key,
          value,
          `Failed to set ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        onError?.(settingsError);
      }
    }
  }

  // Handle RTL plugin with enhanced error handling
  setRTLTextPlugin(mapLib, props, onError).catch(() => {
    // RTL plugin loading is optional, errors are handled within the function
  });
}

async function setRTLTextPlugin(
  mapLib: MapLibWithGlobals,
  props: GlobalSettings,
  onError?: (error: GlobalSettingsError) => void
): Promise<void> {
  const {
    RTLTextPlugin = DEFAULT_RTL_PLUGIN_URL,
    RTLPluginTimeout = DEFAULT_RTL_TIMEOUT,
    onRTLPluginError
  } = props;

  // Skip if RTL plugin is explicitly disabled
  if (RTLTextPlugin === false) {
    return;
  }

  // Validate RTL plugin requirements
  if (!mapLib.getRTLTextPluginStatus || !mapLib.setRTLTextPlugin) {
    const error = createGlobalSettingsError(
      'RTLTextPlugin',
      RTLTextPlugin,
      'RTL text plugin methods not available on mapLib'
    );
    onError?.(error);
    return;
  }

  try {
    const status = mapLib.getRTLTextPluginStatus();
    
    // Only load if plugin is unavailable
    if (status !== 'unavailable') {
      return;
    }

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`RTL plugin loading timeout after ${RTLPluginTimeout}ms`));
      }, RTLPluginTimeout);
    });

    // Create plugin loading promise
    const loadPromise = new Promise<void>((resolve, reject) => {
      mapLib.setRTLTextPlugin(
        RTLTextPlugin,
        (error?: Error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        },
        true // lazy loading
      );
    });

    // Race between loading and timeout
    await Promise.race([loadPromise, timeoutPromise]);

  } catch (error) {
    const rtlError = createGlobalSettingsError(
      'RTLTextPlugin',
      RTLTextPlugin,
      `Failed to load RTL text plugin: ${error instanceof Error ? error.message : 'Unknown error'}`
    );

    // Call custom error handler if provided
    if (onRTLPluginError) {
      try {
        onRTLPluginError(rtlError);
      } catch (handlerError) {
        // Custom error handler failed - fall back to global error handler
      }
    }

    // Call global error handler
    onError?.(rtlError);
  }
}
