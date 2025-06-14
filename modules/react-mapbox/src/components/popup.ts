/* global document */
import * as React from 'react';
import {createPortal} from 'react-dom';
import {
  useImperativeHandle,
  useEffect,
  useMemo,
  useContext,
  forwardRef,
  memo,
  useCallback
} from 'react';
import {applyReactStyle} from '../utils/apply-react-style';

import type {PopupInstance, PopupOptions} from '../types/lib';
import type {PopupEvent} from '../types/events';

import {MapContext} from './map';

export type PopupProps = PopupOptions & {
  /** Longitude of the anchor location */
  longitude: number;
  /** Latitude of the anchor location */
  latitude: number;

  /** CSS style override, applied to the control's container */
  style?: React.CSSProperties;

  onOpen?: (e: PopupEvent) => void;
  onClose?: (e: PopupEvent) => void;
  onError?: (error: Error) => void;
  children?: React.ReactNode;
};

/* eslint-disable complexity,max-statements */
export const Popup = memo(
  forwardRef((props: PopupProps, ref: React.Ref<PopupInstance>) => {
    const {map, mapLib} = useContext(MapContext);

    const handleError = useCallback(
      (error: Error) => {
        // Handle popup error through onError callback
        props.onError?.(error);
      },
      [props.onError]
    );

    if (!map || !mapLib) {
      const error = new Error('Popup component must be used within a Map component');
      handleError(error);
      return null;
    }

    if (!Number.isFinite(props.longitude) || !Number.isFinite(props.latitude)) {
      const error = new Error(
        `Invalid coordinates: longitude=${props.longitude}, latitude=${props.latitude}`
      );
      handleError(error);
      return null;
    }

    const container = useMemo(() => {
      try {
        return document.createElement('div');
      } catch (error) {
        handleError(error as Error);
        return null;
      }
    }, [handleError]);

    if (!container) {
      return null;
    }

    const onOpenCallback = useCallback(
      (e: PopupEvent) => {
        try {
          props.onOpen?.(e);
        } catch (error) {
          handleError(error as Error);
        }
      },
      [props.onOpen, handleError]
    );

    const onCloseCallback = useCallback(
      (e: PopupEvent) => {
        try {
          props.onClose?.(e);
        } catch (error) {
          handleError(error as Error);
        }
      },
      [props.onClose, handleError]
    );

    const popup: PopupInstance = useMemo(() => {
      try {
        const options = {...props};
        delete options.longitude;
        delete options.latitude;
        delete options.onOpen;
        delete options.onClose;
        delete options.onError;
        delete options.children;
        delete options.style;

        if (
          props.maxWidth &&
          typeof props.maxWidth === 'number' &&
          (props.maxWidth < 0 || props.maxWidth > 2000)
        ) {
          // maxWidth value outside recommended range
        }

        const pp = new mapLib.Popup(options);
        pp.setLngLat([props.longitude, props.latitude]);
        pp.once('open', onOpenCallback);
        return pp;
      } catch (error) {
        handleError(error as Error);
        return null;
      }
    }, [
      mapLib,
      props.longitude,
      props.latitude,
      props.offset,
      props.anchor,
      props.maxWidth,
      props.className,
      onOpenCallback,
      handleError
    ]);

    if (!popup) {
      return null;
    }

    useEffect(() => {
      try {
        const onResize = () => {
          try {
            if (popup.isOpen()) {
              popup.setLngLat(popup.getLngLat());
            }
          } catch (error) {
            handleError(error as Error);
          }
        };

        popup.on('close', onCloseCallback);
        map.getMap().on('resize', onResize);
        popup.setDOMContent(container).addTo(map.getMap());

        return () => {
          try {
            popup.off('close', onCloseCallback);
            map.getMap().off('resize', onResize);
            if (popup.isOpen()) {
              popup.remove();
            }
          } catch (error) {
            handleError(error as Error);
          }
        };
      } catch (error) {
        handleError(error as Error);
        return undefined;
      }
    }, [popup, map, container, onCloseCallback, handleError]);

    useEffect(() => {
      try {
        applyReactStyle(popup.getElement(), props.style);
      } catch (error) {
        handleError(error as Error);
      }
    }, [popup, props.style, handleError]);

    useEffect(() => {
      try {
        const currentLngLat = popup.getLngLat();
        if (currentLngLat.lng !== props.longitude || currentLngLat.lat !== props.latitude) {
          popup.setLngLat([props.longitude, props.latitude]);
        }
      } catch (error) {
        handleError(error as Error);
      }
    }, [popup, props.longitude, props.latitude, handleError]);

    useEffect(() => {
      try {
        if (props.offset) {
          popup.setOffset(props.offset);
        }
      } catch (error) {
        handleError(error as Error);
      }
    }, [popup, props.offset, handleError]);

    useEffect(() => {
      try {
        if (props.anchor) {
          popup.options.anchor = props.anchor;
        }
      } catch (error) {
        handleError(error as Error);
      }
    }, [popup, props.anchor, handleError]);

    useEffect(() => {
      try {
        if (props.maxWidth) {
          popup.setMaxWidth(props.maxWidth);
        }
      } catch (error) {
        handleError(error as Error);
      }
    }, [popup, props.maxWidth, handleError]);

    useEffect(() => {
      try {
        if (props.className) {
          const element = popup.getElement();
          if (element) {
            element.className = props.className;
          }
        }
      } catch (error) {
        handleError(error as Error);
      }
    }, [popup, props.className, handleError]);

    useImperativeHandle(ref, () => popup, [popup]);

    try {
      return createPortal(props.children, container);
    } catch (error) {
      handleError(error as Error);
      return null;
    }
  })
);

Popup.displayName = 'Popup';
