import {Map, Marker} from 'react-map-gl/mapbox-legacy';
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import test from 'tape-promise/tape';

import {sleep, waitForMapLoad} from '../utils/test-utils';

test('Marker', async t => {
  const rootContainer = document.createElement('div');
  const root = createRoot(rootContainer);
  const markerRef = {current: null};
  const mapRef = {current: null};

  root.render(
    <Map ref={mapRef} mapLib={import('mapbox-gl-v1')}>
      <Marker ref={markerRef} longitude={-122} latitude={38} />
    </Map>
  );

  await waitForMapLoad(mapRef);
  await sleep(1);

  t.ok(rootContainer.querySelector('.mapboxgl-marker'), 'Marker is attached to DOM');
  t.ok(markerRef.current, 'Marker is created');

  const marker = markerRef.current;
  const offset = marker.getOffset();
  const draggable = marker.isDraggable();
  const rotation = marker.getRotation();
  const pitchAlignment = marker.getPitchAlignment();
  const rotationAlignment = marker.getRotationAlignment();

  root.render(
    <Map ref={mapRef} mapLib={import('mapbox-gl-v1')}>
      <Marker ref={markerRef} longitude={-122} latitude={38} offset={[0, 0]} />
    </Map>
  );

  t.is(offset, marker.getOffset(), 'offset did not change deeply');

  let callbackType = '';
  root.render(
    <Map ref={mapRef} mapLib={import('mapbox-gl-v1')}>
      <Marker
        ref={markerRef}
        longitude={-122}
        latitude={38}
        offset={[0, 1]}
        rotation={30}
        draggable
        pitchAlignment="map"
        rotationAlignment="map"
        onDragStart={() => (callbackType = 'dragstart')}
        onDrag={() => (callbackType = 'drag')}
        onDragEnd={() => (callbackType = 'dragend')}
      />
    </Map>
  );
  await sleep(1);

  t.not(offset, marker.getOffset(), 'offset is updated');
  t.not(draggable, marker.isDraggable(), 'draggable is updated');
  t.not(rotation, marker.getRotation(), 'rotation is updated');
  t.not(pitchAlignment, marker.getPitchAlignment(), 'pitchAlignment is updated');
  t.not(rotationAlignment, marker.getRotationAlignment(), 'rotationAlignment is updated');

  marker.fire('dragstart');
  t.is(callbackType, 'dragstart', 'onDragStart called');
  marker.fire('drag');
  t.is(callbackType, 'drag', 'onDrag called');
  marker.fire('dragend');
  t.is(callbackType, 'dragend', 'onDragEnd called');

  root.render(<Map ref={mapRef} mapLib={import('mapbox-gl-v1')} />);
  await sleep(1);

  t.notOk(markerRef.current, 'marker is removed');

  root.render(
    <Map ref={mapRef} mapLib={import('mapbox-gl-v1')}>
      <Marker ref={markerRef} longitude={-100} latitude={40}>
        <div id="marker-content" />
      </Marker>
    </Map>
  );
  await sleep(1);

  t.ok(rootContainer.querySelector('#marker-content'), 'content is rendered');

  root.unmount();

  t.end();
});

test('Marker - element property behavior', async t => {
  const rootContainer = document.createElement('div');
  const root = createRoot(rootContainer);
  const markerRef = {current: null};
  const mapRef = {current: null};

  // Test 1: Marker without children should not create custom element
  root.render(
    <Map ref={mapRef} mapLib={import('mapbox-gl-v1')}>
      <Marker ref={markerRef} longitude={-122} latitude={38} />
    </Map>
  );

  await waitForMapLoad(mapRef);
  await sleep(1);

  const marker = markerRef.current;
  t.ok(marker, 'Marker is created');
  
  // The marker should use the default SVG element when no children are provided
  const element = marker.getElement();
  t.ok(element, 'Marker has an element');
  t.ok(element.querySelector('svg'), 'Default marker uses SVG element');
  t.notOk(element.querySelector('#custom-content'), 'No custom content present');

  // Test 2: Marker with children should create custom div element
  root.render(
    <Map ref={mapRef} mapLib={import('mapbox-gl-v1')}>
      <Marker ref={markerRef} longitude={-122} latitude={38}>
        <div id="custom-content">Custom Marker</div>
      </Marker>
    </Map>
  );
  await sleep(1);

  const elementWithChildren = marker.getElement();
  t.ok(elementWithChildren, 'Marker with children has an element');
  t.ok(rootContainer.querySelector('#custom-content'), 'Custom content is rendered');
  t.is(rootContainer.querySelector('#custom-content').textContent, 'Custom Marker', 'Custom content text is correct');
  
  // Test 3: Switching from children to no children
  root.render(
    <Map ref={mapRef} mapLib={import('mapbox-gl-v1')}>
      <Marker ref={markerRef} longitude={-122} latitude={38} />
    </Map>
  );
  await sleep(1);

  // Note: This creates a new marker instance, so we need to check the DOM
  t.notOk(rootContainer.querySelector('#custom-content'), 'Custom content is removed when children are removed');

  // Test 4: Switching from no children to children
  root.render(
    <Map ref={mapRef} mapLib={import('mapbox-gl-v1')}>
      <Marker ref={markerRef} longitude={-122} latitude={38}>
        <div id="new-custom-content">New Custom Marker</div>
      </Marker>
    </Map>
  );
  await sleep(1);

  t.ok(rootContainer.querySelector('#new-custom-content'), 'New custom content is rendered');
  t.is(rootContainer.querySelector('#new-custom-content').textContent, 'New Custom Marker', 'New custom content text is correct');

  root.unmount();
  t.end();
});
