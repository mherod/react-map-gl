import * as React from 'react';
import {
  useState,
  useRef,
  useEffect,
  useContext,
  useMemo,
  useImperativeHandle,
  useCallback,
  Component,
  ErrorInfo
} from 'react';

import {MountedMapsContext} from './use-map';
import Mapbox, {MapboxProps} from '../mapbox/mapbox';
import createRef, {MapRef} from '../mapbox/create-ref';

import type {CSSProperties} from 'react';
import useIsomorphicLayoutEffect from '../utils/use-isomorphic-layout-effect';
import setGlobals, {GlobalSettings} from '../utils/set-globals';
import type {MapLib, MapOptions} from '../types/lib';

export type MapContextValue = {
  mapLib: MapLib;
  map: MapRef;
};

export const MapContext = React.createContext<MapContextValue>(null);

const CHILD_CONTAINER_STYLE: CSSProperties = {
  height: '100%'
};

interface MapErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface MapErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  static getDerivedStateFromError(error: Error): MapErrorBoundaryState {
    return {hasError: true, error};
  }

  constructor(props: MapErrorBoundaryProps) {
    super(props);
    this.state = {hasError: false};
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to error boundary handler

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            backgroundColor: '#f5f5f5',
            color: '#666',
            fontFamily: 'Arial, sans-serif',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }}
        >
          <div style={{textAlign: 'center'}}>
            <div style={{fontSize: '18px', marginBottom: '8px'}}>Map Component Error</div>
            <div style={{fontSize: '14px', marginBottom: '16px'}}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </div>
            <button
              onClick={() => this.setState({hasError: false, error: undefined})}
              style={{
                padding: '8px 16px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

type MapInitOptions = Omit<
  MapOptions,
  'style' | 'container' | 'bounds' | 'fitBoundsOptions' | 'center'
>;

export type MapProps = MapInitOptions &
  MapboxProps &
  GlobalSettings & {
    mapLib?: MapLib | Promise<MapLib>;
    reuseMaps?: boolean;
    /** Map container id */
    id?: string;
    /** Map container CSS style */
    style?: CSSProperties;
    children?: React.ReactNode;
    /** Loading state component */
    loading?: React.ReactNode;
    /** Error fallback component */
    fallback?: React.ReactNode;
    /** Error boundary fallback component */
    errorBoundaryFallback?: React.ReactNode;
    /** Error boundary error handler */
    onErrorBoundary?: (error: Error, errorInfo: ErrorInfo) => void;
  };

function _Map(props: MapProps, ref: React.Ref<MapRef>) {
  const mountedMapsContext = useContext(MountedMapsContext);
  const [mapInstance, setMapInstance] = useState<Mapbox>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {current: contextValue} = useRef<MapContextValue>({mapLib: null, map: null});

  const handleError = useCallback(
    (mapError: Error) => {
      // Handle map error through onError callback
      setError(mapError);
      setIsLoading(false);

      const {onError} = props;
      if (onError) {
        try {
          onError({
            type: 'error',
            target: null,
            error: mapError
          });
        } catch (callbackError) {
          // Error in onError callback
        }
      }
    },
    [props.onError]
  );

  const validateContainer = useCallback(() => {
    if (!containerRef.current) {
      throw new Error('Map container ref is not available');
    }
    return containerRef.current;
  }, []);

  useEffect(() => {
    if (error) {
      setError(null);
      setIsLoading(true);
    }
  }, [props.mapLib, props.reuseMaps, props.id, error]);

  useEffect(() => {
    const mapLib = props.mapLib;
    let isMounted = true;
    let mapbox: Mapbox;

    setIsLoading(true);
    setError(null);

    Promise.resolve(mapLib || import('mapbox-gl'))
      .then((module: MapLib | {default: MapLib}) => {
        if (!isMounted) {
          return;
        }

        try {
          validateContainer();

          if (!module) {
            throw new Error('Failed to load mapbox library: module is null or undefined');
          }

          const mapboxgl = 'Map' in module ? module : module.default;
          if (!mapboxgl?.Map) {
            throw new Error('Invalid mapLib: Map constructor not found');
          }

          setGlobals(mapboxgl as any, props);

          if (props.reuseMaps) {
            mapbox = Mapbox.reuse(props, containerRef.current);
          }

          if (!mapbox) {
            mapbox = new Mapbox(mapboxgl.Map, props, containerRef.current);
          }

          contextValue.map = createRef(mapbox);
          contextValue.mapLib = mapboxgl;

          setMapInstance(mapbox);
          setIsLoading(false);
          mountedMapsContext?.onMapMount(contextValue.map, props.id);
        } catch (initError) {
          if (isMounted) {
            handleError(initError as Error);
          }
        }
      })
      .catch(loadError => {
        if (isMounted) {
          handleError(loadError);
        }
      });

    return () => {
      isMounted = false;
      if (mapbox) {
        try {
          mountedMapsContext?.onMapUnmount(props.id);
          if (props.reuseMaps) {
            mapbox.recycle();
          } else {
            mapbox.destroy();
          }
        } catch (cleanupError) {
          // Error during cleanup
        }
      }
    };
  }, [props.mapLib, props.reuseMaps, props.id, handleError, validateContainer, mountedMapsContext]);

  useIsomorphicLayoutEffect(() => {
    if (mapInstance) {
      try {
        mapInstance.setProps(props);
      } catch (propsError) {
        handleError(propsError as Error);
      }
    }
  });

  useImperativeHandle(ref, () => contextValue.map, [mapInstance]);

  const style: CSSProperties = useMemo(
    () => ({
      position: 'relative',
      width: '100%',
      height: '100%',
      ...props.style
    }),
    [props.style]
  );

  if (error) {
    return (
      <div id={props.id} ref={containerRef} style={style}>
        {props.fallback || (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              backgroundColor: '#f5f5f5',
              color: '#666',
              fontFamily: 'Arial, sans-serif'
            }}
          >
            <div style={{textAlign: 'center'}}>
              <div style={{fontSize: '18px', marginBottom: '8px'}}>Map Error</div>
              <div style={{fontSize: '14px'}}>{error.message}</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div id={props.id} ref={containerRef} style={style}>
        {props.loading || (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              backgroundColor: '#f9f9f9',
              color: '#666',
              fontFamily: 'Arial, sans-serif'
            }}
          >
            Loading map...
          </div>
        )}
      </div>
    );
  }

  return (
    <div id={props.id} ref={containerRef} style={style}>
      {mapInstance && (
        <MapContext.Provider value={contextValue}>
          <div data-mapboxgl-children="" style={CHILD_CONTAINER_STYLE}>
            {props.children}
          </div>
        </MapContext.Provider>
      )}
    </div>
  );
}

const MemoizedMap = React.memo(React.forwardRef(_Map));

function MapWithErrorBoundary(props: MapProps, ref: React.Ref<MapRef>) {
  const {errorBoundaryFallback, onErrorBoundary, ...mapProps} = props;

  return (
    <MapErrorBoundary fallback={errorBoundaryFallback} onError={onErrorBoundary}>
      <MemoizedMap {...mapProps} ref={ref} />
    </MapErrorBoundary>
  );
}

export const Map = React.forwardRef(MapWithErrorBoundary);

Map.displayName = 'Map';
