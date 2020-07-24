/* eslint-disable no-loop-func */
import _map from "lodash/map";
import _minBy from "lodash/minBy";
import { interpolateNumber } from "d3-interpolate";
import { getAverageColorFromNodes } from "../../util/colorHelpers";
import { bezier } from "./transmissionBezier";
import { NODE_NOT_VISIBLE } from "../../util/globals";
import { getTraitFromNode } from "../../util/treeMiscHelpers";
import { isColorByGenotype } from "../../util/getGenotype";
import { errorNotification } from "../../actions/notifications";

/* global L */
// L is global in scope and placed by leaflet()

// longs of original map are -180 to 180
// longs of fully triplicated map are -540 to 540
// restrict to longs between -360 to 360
const westBound = -360;
const eastBound = 360;

// interchange. this is a leaflet method that will tell d3 where to draw.
const leafletLatLongToLayerPoint = (lat, long, map) => {
  return map.latLngToLayerPoint(new L.LatLng(lat, long));
};

/* if transmission pair is legal, return a leaflet LatLng origin / dest pair
otherwise return null */
const maybeGetTransmissionPair = (latOrig, longOrig, latDest, longDest, map) => {

  // if either origin or destination are inside bounds, include
  // transmission must be less than 180 lat difference
  let pair = null;
  if (
    (longOrig > westBound || longDest > westBound) &&
    (longOrig < eastBound || longDest < eastBound) &&
    (Math.abs(longOrig - longDest) < 180)
  ) {
    pair = [
      leafletLatLongToLayerPoint(latOrig, longOrig, map),
      leafletLatLongToLayerPoint(latDest, longDest, map)
    ];
  }

  return pair;

};

/**
 * Traverses the tips of the tree to create a dict of
 * location(deme) -> list of visible tips at that location
 */
export const getVisibleNodesPerLocation = (nodes, visibility, geoResolution) => {
  const locationToVisibleNodes = {};
  const genotype = isColorByGenotype(geoResolution);
  nodes.forEach((n, i) => {
    if (n.children) return; /* only consider terminal nodes */
    const location = getTraitFromNode(n, geoResolution, {genotype});
    if (!location) return; /* ignore undefined locations */
    if (!locationToVisibleNodes[location]) locationToVisibleNodes[location]=[];
    if (visibility[i] !== NODE_NOT_VISIBLE) {
      locationToVisibleNodes[location].push(n);
    }
  });
  return locationToVisibleNodes;
};

/**
 * Either create arcs for the current `visibleNodes`, in the order of the legendValues, or update the arcs
 * (by updating we mean changing the arc start/end angles)
 * @param {array} visibleNodes visible nodes for this pie chart
 * @param {array} legendValues for this colorBy
 * @param {string} colorBy current color by
 * @param {array} nodeColors Array of colors for all nodes (not in correspondence with `visibleNodes`)
 * @param {array} currentArcs only used if updating. Array of current arcs.
 * @returns {array} arcs for display
 */
export const createOrUpdateArcs = (visibleNodes, legendValues, colorBy, nodeColors, currentArcs=undefined) => {
  const colorByIsGenotype = isColorByGenotype(colorBy);
  const legendValueToArcIdx = {};
  const undefinedArcIdx = legendValues.length; /* the arc which is grey to represent undefined values on tips */
  let arcs;
  if (currentArcs) {
    /* updating arcs -- reset `_count` */
    arcs = currentArcs;
    legendValues.forEach((v, i) => {
      legendValueToArcIdx[v] = i;
      arcs[i]._count = 0;
    });
    arcs[undefinedArcIdx]._count = 0;
  } else {
    /* creating arcs */
    arcs = legendValues.map((v, i) => {
      legendValueToArcIdx[v] = i;
      return {innerRadius: 0, _count: 0};
    });
    arcs.push({innerRadius: 0, _count: 0}); // for the undefined arc
  }
  /* traverse visible nodes (for this location) to get numbers for each arc (i.e. each slice in the pie) */
  visibleNodes.forEach((n) => {
    const colorByValue = colorByIsGenotype ? n.currentGt: getTraitFromNode(n, colorBy);
    let arcIdx = legendValueToArcIdx[colorByValue];
    if (arcIdx === undefined) arcIdx = undefinedArcIdx;
    arcs[arcIdx]._count++;
    if (!arcs[arcIdx].color) arcs[arcIdx].color=nodeColors[n.arrayIdx];
  });
  /* turn counts into arc angles (radians) */
  let startAngle = 0;
  arcs.forEach((a) => {
    a.startAngle = startAngle;
    startAngle += 2*Math.PI*a._count/visibleNodes.length;
    a.endAngle = startAngle;
    if (a.startAngle === a.endAngle) {
      // this prevents drawing a 'line' for 'empty' slices
      a.color = "";
    }
  });
  return arcs;
};


const setupDemeData = (nodes, visibility, geoResolution, nodeColors, triplicate, metadata, map, pieChart, legendValues, colorBy) => {

  const demeData = []; /* deme array */
  const demeIndices = {}; /* map of name to indices in array */

  const locationToVisibleNodes = getVisibleNodesPerLocation(nodes, visibility, geoResolution);
  const offsets = triplicate ? [-360, 0, 360] : [0];
  const demeToLatLongs = metadata.geoResolutions.filter((x) => x.key === geoResolution)[0].demes;

  let index = 0;
  offsets.forEach((OFFSET) => {
    /* count DEMES */
    for (const [location, visibleNodes] of Object.entries(locationToVisibleNodes)) {
      let lat = 0;
      let long = 0;
      let goodDeme = true;

      if (demeToLatLongs[location]) {
        lat = demeToLatLongs[location].latitude;
        long = demeToLatLongs[location].longitude + OFFSET;
      } else {
        goodDeme = false;
        console.warn("Warning: Lat/long missing from metadata for", location);
      }

      /* get pixel coordinates. `coords`: <Point> with properties `x` & `y` */
      const coords = leafletLatLongToLayerPoint(lat, long, map);

      /* add entries to
       * (1) `demeIndicies` -- a dict of "deme value" to the indicies of `demeData` & `arcData` where they appear
       * (2) `demeData` -- an array of objects, each with {name, count etc.}
       *      if pie charts, then `demeData.arcs` exists, if colour-blended circles, `demeData.color` exists
       */
      if (long > westBound && long < eastBound && goodDeme === true) {

        /* base deme information used for pie charts & color-blended circles */
        const deme = {
          name: location,
          count: visibleNodes.length,
          latitude: lat, // raw latitude value
          longitude: long, // raw longitude value
          coords: coords // coords are x,y plotted via d3
        };

        if (pieChart) {
          /* create the arcs for the pie chart. NB `demeDataIdx` is the index of the deme in `demeData` where this will be inserted */
          deme.arcs = createOrUpdateArcs(visibleNodes, legendValues, colorBy, nodeColors);
          /* create back links between the arcs & which index of `demeData` they (will be) stored at */
          const demeDataIdx = demeData.length;
          deme.arcs.forEach((a) => {a.demeDataIdx = demeDataIdx;});
        } else {
          /* average out the constituent colours for a blended-colour circle */
          deme.color = getAverageColorFromNodes(visibleNodes, nodeColors);
        }

        demeData.push(deme);
        if (!demeIndices[location]) {
          demeIndices[location] = [index];
        } else {
          demeIndices[location].push(index);
        }
        index += 1;
      }

    }
  });

  return {
    demeData: demeData,
    demeIndices: demeIndices
  };
};

const constructBcurve = (
  originLatLongPair,
  destinationLatLongPair,
  extend
) => {
  return bezier(originLatLongPair, destinationLatLongPair, extend);
};

const maybeConstructTransmissionEvent = (
  node,
  child,
  geoResolutions,
  geoResolution,
  nodeColors,
  visibility,
  map,
  offsetOrig,
  offsetDest,
  demesMissingLatLongs,
  extend
) => {
  let latOrig, longOrig, latDest, longDest;
  let transmission;
  /* checking metadata for lat longs name match - ie., does the metadata list a latlong for Thailand? */
  const nodeLocation = getTraitFromNode(node, geoResolution); //  we're looking this up in the metadata lookup table
  const childLocation = getTraitFromNode(child, geoResolution);
  const demeToLatLongs = geoResolutions.filter((x) => x.key === geoResolution)[0].demes;

  try {
    latOrig = demeToLatLongs[nodeLocation].latitude;
    longOrig = demeToLatLongs[nodeLocation].longitude;
  } catch (e) {
    demesMissingLatLongs.add(nodeLocation);
  }
  try {
    latDest = demeToLatLongs[childLocation].latitude;
    longDest = demeToLatLongs[childLocation].longitude;
  } catch (e) {
    demesMissingLatLongs.add(childLocation);
  }

  const validLatLongPair = maybeGetTransmissionPair(
    latOrig,
    longOrig + offsetOrig,
    latDest,
    longDest + offsetDest,
    map
  );

  if (validLatLongPair) {

    const Bcurve = constructBcurve(validLatLongPair[0], validLatLongPair[1], extend);

    /* set up interpolator with origin and destination numdates */
    const interpolator = interpolateNumber(getTraitFromNode(node, "num_date"), getTraitFromNode(child, "num_date"));

    /* make a Bdates array as long as Bcurve */
    const Bdates = [];
    Bcurve.forEach((d, i) => {
      /* fill it with interpolated dates */
      Bdates.push(
        interpolator(i / (Bcurve.length - 1)) /* ie., 5 / 15ths of the way through = 2016.3243 */
      );
    });

    /* build up transmissions object */
    transmission = {
      id: node.arrayIdx.toString() + "-" + child.arrayIdx.toString(),
      originNode: node,
      destinationNode: child,
      bezierCurve: Bcurve,
      bezierDates: Bdates,
      originName: getTraitFromNode(node, geoResolution),
      destinationName: getTraitFromNode(child, geoResolution),
      originCoords: validLatLongPair[0], // after interchange
      destinationCoords: validLatLongPair[1], // after interchange
      originLatitude: latOrig, // raw latitude value
      destinationLatitude: latDest, // raw latitude value
      originLongitude: longOrig + offsetOrig, // raw longitude value
      destinationLongitude: longDest + offsetDest, // raw longitude value
      originNumDate: getTraitFromNode(node, "num_date"),
      destinationNumDate: getTraitFromNode(child, "num_date"),
      color: nodeColors[node.arrayIdx],
      visible: visibility[child.arrayIdx] !== NODE_NOT_VISIBLE ? "visible" : "hidden", // transmission visible if child is visible
      extend: extend
    };
  }
  return transmission;
};

const maybeGetClosestTransmissionEvent = (
  node,
  child,
  metadataGeoLookupTable,
  geoResolution,
  nodeColors,
  visibility,
  map,
  offsetOrig,
  demesMissingLatLongs,
  extend
) => {
  const possibleEvents = [];
  // iterate over offsets applied to transmission destination
  // even if map is not tripled - ie., don't let a line go across the whole world
  [-360, 0, 360].forEach((offsetDest) => {
    const t = maybeConstructTransmissionEvent(
      node,
      child,
      metadataGeoLookupTable,
      geoResolution,
      nodeColors,
      visibility,
      map,
      offsetOrig,
      offsetDest,
      demesMissingLatLongs,
      extend
    );
    if (t) { possibleEvents.push(t); }
  });

  if (possibleEvents.length > 0) {

    const closestEvent = _minBy(possibleEvents, (event) => {
      return Math.abs(event.destinationCoords.x - event.originCoords.x);
    });
    return closestEvent;

  }

  return null;

};

const setupTransmissionData = (
  nodes,
  visibility,
  geoResolution,
  nodeColors,
  triplicate,
  metadata,
  map
) => {

  const offsets = triplicate ? [-360, 0, 360] : [0];
  const transmissionData = []; /* edges, animation paths */
  const transmissionIndices = {}; /* map of transmission id to array of indices */
  const demesMissingLatLongs = new Set();
  const demeToDemeCounts = {};
  nodes.forEach((n) => {
    const nodeDeme = getTraitFromNode(n, geoResolution);
    if (n.children) {
      n.children.forEach((child) => {
        const childDeme = getTraitFromNode(child, geoResolution);
        if (nodeDeme && childDeme && nodeDeme !== childDeme) {
          // record transmission event
          if ([nodeDeme, childDeme] in demeToDemeCounts) {
            demeToDemeCounts[[nodeDeme, childDeme]] += 1;
          } else {
            demeToDemeCounts[[nodeDeme, childDeme]] = 1;
          }
          const extend = demeToDemeCounts[[nodeDeme, childDeme]];
          // offset is applied to transmission origin
          offsets.forEach((offsetOrig) => {
            const t = maybeGetClosestTransmissionEvent(
              n,
              child,
              metadata.geoResolutions,
              geoResolution,
              nodeColors,
              visibility,
              map,
              offsetOrig,
              demesMissingLatLongs,
              extend
            );
            if (t) { transmissionData.push(t); }
          });
        }
      });
    }
  });

  transmissionData.forEach((transmission, index) => {
    if (!transmissionIndices[transmission.id]) {
      transmissionIndices[transmission.id] = [index];
    } else {
      transmissionIndices[transmission.id].push(index);
    }
  });
  return {
    transmissionData: transmissionData,
    transmissionIndices: transmissionIndices,
    demesMissingLatLongs
  };
};

export const createDemeAndTransmissionData = (
  nodes,
  visibility,
  geoResolution,
  nodeColors,
  triplicate,
  metadata,
  map,
  pieChart,
  legendValues,
  colorBy,
  showTransmissionLines,
  dispatch
) => {
  /*
    walk through nodes and collect all data
    for demeData we have:
      name, coords, count, color
    for transmissionData we have:
      originNode, destinationNode, originCoords, destinationCoords, originName, destinationName
      originNumDate, destinationNumDate, color, visible
  */
  const {
    demeData,
    demeIndices
  } = setupDemeData(nodes, visibility, geoResolution, nodeColors, triplicate, metadata, map, pieChart, legendValues, colorBy);

  let transmissionData = [];
  let transmissionIndices = {};
  let demesMissingLatLongs = new Set(); // TODO: this won't be filled in if we're not showing transmission lines...
  if (showTransmissionLines) {
    /* second time so that we can get Bezier */
    ({ transmissionData, transmissionIndices, demesMissingLatLongs } = setupTransmissionData(
      nodes,
      visibility,
      geoResolution,
      nodeColors,
      triplicate,
      metadata,
      map
    ));
  }

  const filteredDemesMissingLatLongs = [...demesMissingLatLongs].filter((value) => {
    return value.toLowerCase() !== "unknown";
  });

  if (filteredDemesMissingLatLongs.size) {
    dispatch(errorNotification({
      message: "The following demes are missing lat/long information",
      details: [...filteredDemesMissingLatLongs].join(", ")
    }));
  }

  return {
    demeData: demeData,
    transmissionData: transmissionData,
    demeIndices: demeIndices,
    transmissionIndices: transmissionIndices,
    demesMissingLatLongs
  };
};

/* ******************************
********************************
UPDATE DEMES & TRANSMISSIONS
********************************
******************************* */

const updateDemeDataColAndVis = (demeData, demeIndices, nodes, visibility, geoResolution, nodeColors, pieChart, colorBy, legendValues) => {
  const demeDataCopy = demeData.slice();

  const locationToVisibleNodes = getVisibleNodesPerLocation(nodes, visibility, geoResolution);

  // update demeData, for each deme, update all elements via demeIndices lookup
  for (const [location, visibleNodes] of Object.entries(locationToVisibleNodes)) {
    if (demeIndices[location]) {
      demeIndices[location].forEach((index) => {
        /* both pie charts & circles need new counts (which modify the radius) */
        demeDataCopy[index].count = visibleNodes.length;
        if (pieChart) {
          /* update the arcs */
          demeDataCopy[index].arcs = createOrUpdateArcs(visibleNodes, legendValues, colorBy, nodeColors, demeDataCopy[index].arcs);
        } else {
          /* circle demes just require a colour update */
          demeDataCopy[index].color = getAverageColorFromNodes(visibleNodes, nodeColors);
        }
      });
    }
  }

  return demeDataCopy;
};

const updateTransmissionDataColAndVis = (transmissionData, transmissionIndices, nodes, visibility, geoResolution, nodeColors) => {
  const transmissionDataCopy = transmissionData.slice(); /* basically, instead of _.map() since we're not mapping over the data we're mutating */
  nodes.forEach((node) => {
    if (!node.children) return;

    node.children.forEach((child) => {
      const nodeLocation = getTraitFromNode(node, geoResolution);
      const childLocation = getTraitFromNode(child, geoResolution);

      if (!(nodeLocation && childLocation && nodeLocation !== childLocation)) return;

      // this is a transmission event from n to child
      const id = node.arrayIdx.toString() + "-" + child.arrayIdx.toString();
      const col = nodeColors[node.arrayIdx];
      const vis = visibility[child.arrayIdx] !== NODE_NOT_VISIBLE ? "visible" : "hidden"; // transmission visible if child is visible
      // update transmissionData via index lookup
      try {
        transmissionIndices[id].forEach((index) => {
          transmissionDataCopy[index].color = col;
          transmissionDataCopy[index].visible = vis;
        });
      } catch (err) {
        console.warn(`Error trying to access ${id} in transmissionIndices. Map transmissions may be wrong.`);
      }
    });
  });
  return transmissionDataCopy;
};

/**
 * walk through nodes and update attributes that can mutate
 * for demeData we have: count, color
 * for transmissionData we have: color, visible
 */
export const updateDemeAndTransmissionDataColAndVis = (demeData, transmissionData, demeIndices, transmissionIndices, nodes, visibility, geoResolution, nodeColors, pieChart, colorBy, legendValues) => {
  const newDemes = demeData ?
    updateDemeDataColAndVis(demeData, demeIndices, nodes, visibility, geoResolution, nodeColors, pieChart, colorBy, legendValues) :
    demeData;
  const newTransmissions = (transmissionData && transmissionData.length) ?
    updateTransmissionDataColAndVis(transmissionData, transmissionIndices, nodes, visibility, geoResolution, nodeColors) :
    transmissionData;
  return {newDemes, newTransmissions};
};

/* ********************
**********************
ZOOM LEVEL CHANGE
**********************
********************* */

export const updateDemeDataLatLong = (demeData, map) => {

  // interchange for all demes
  return _map(demeData, (d) => {
    d.coords = leafletLatLongToLayerPoint(d.latitude, d.longitude, map);
    return d;
  });

};

export const updateTransmissionDataLatLong = (transmissionData, map) => {

  const transmissionDataCopy = transmissionData.slice(); /* basically, instead of _.map() since we're not mapping over the data we're mutating */

  // interchange for all transmissions
  transmissionDataCopy.forEach((transmission) => {
    transmission.originCoords = leafletLatLongToLayerPoint(transmission.originLatitude, transmission.originLongitude, map);
    transmission.destinationCoords = leafletLatLongToLayerPoint(transmission.destinationLatitude, transmission.destinationLongitude, map);
    transmission.bezierCurve = constructBcurve(
      transmission.originCoords,
      transmission.destinationCoords,
      transmission.extend
    );
  });

  return transmissionDataCopy;

};
