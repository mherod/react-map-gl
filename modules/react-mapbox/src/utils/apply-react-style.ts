import * as React from 'react';

// Enhanced unitless properties based on React's CSSPropertyOperations
// and additional CSS properties that shouldn't have units
const UNITLESS_PROPERTIES = new Set([
  'animationIterationCount',
  'aspectRatio',
  'borderImageOutset',
  'borderImageSlice',
  'borderImageWidth',
  'boxFlex',
  'boxFlexGroup',
  'boxOrdinalGroup',
  'columnCount',
  'columns',
  'flex',
  'flexGrow',
  'flexPositive',
  'flexShrink',
  'flexNegative',
  'flexOrder',
  'gridArea',
  'gridRow',
  'gridRowEnd',
  'gridRowSpan',
  'gridRowStart',
  'gridColumn',
  'gridColumnEnd',
  'gridColumnSpan',
  'gridColumnStart',
  'fontWeight',
  'lineClamp',
  'lineHeight',
  'opacity',
  'order',
  'orphans',
  'tabSize',
  'widows',
  'zIndex',
  'zoom',
  'fillOpacity',
  'floodOpacity',
  'stopOpacity',
  'strokeDasharray',
  'strokeDashoffset',
  'strokeMiterlimit',
  'strokeOpacity',
  'strokeWidth'
]);

interface StyleApplicationError extends Error {
  property: string;
  value: unknown;
  element: HTMLElement;
}

function createStyleError(property: string, value: unknown, element: HTMLElement, message: string): StyleApplicationError {
  const error = new Error(message) as StyleApplicationError;
  error.property = property;
  error.value = value;
  error.element = element;
  error.name = 'StyleApplicationError';
  return error;
}

function isValidCSSValue(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

function shouldAddPixels(property: string, value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value !== 0 &&
    !UNITLESS_PROPERTIES.has(property)
  );
}

export function applyReactStyle(
  element: HTMLElement | null | undefined, 
  styles: React.CSSProperties | null | undefined,
  onError?: (error: StyleApplicationError) => void
): void {
  if (!element || !styles) {
    return;
  }

  if (!element.style) {
    const error = createStyleError('', styles, element, 'Element does not support styles');
    onError?.(error);
    return;
  }

  const elementStyle = element.style;

  for (const property in styles) {
    if (!styles.hasOwnProperty(property)) {
      // Skip inherited properties
    } else {
      const value = styles[property as keyof React.CSSProperties];

      // Skip undefined and null values
      if (value === null || value === undefined) {
        // Skip null/undefined values
      } else {
        try {
          if (!isValidCSSValue(value)) {
            const error = createStyleError(
              property, 
              value, 
              element, 
              `Invalid CSS value type: expected string or number, got ${typeof value}`
            );
            onError?.(error);
          } else {
            const cssValue = shouldAddPixels(property, value) ? `${value}px` : String(value);
            
            // Apply the style with error handling
            elementStyle.setProperty(property, cssValue);
          }
        } catch (error) {
          const styleError = createStyleError(
            property,
            value,
            element,
            `Failed to apply CSS property: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          onError?.(styleError);
        }
      }
    }
  }
}
