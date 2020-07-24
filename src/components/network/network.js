import React from "react";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import _max from "lodash/max";
import { select, event as d3event } from "d3-selection";
import { interpolateNumber } from "d3-interpolate";
import { forceSimulation, forceManyBody, forceCenter, forceLink, forceCollide, forceRadial } from "d3-force"; // eslint-disable-line
import { drag as d3drag } from "d3-drag";
import { arc } from "d3-shape";
import ErrorBoundary from "../../util/errorBoundry";
import Legend from "../tree/legend/legend";
import Card from "../framework/card";
import { createOrUpdateArcs } from "../map/mapHelpersLatLong";
import { pathStringGenerator, extractLineSegmentForAnimationEffect } from "../map/mapHelpers";
import { bezier } from "../map/transmissionBezier";
import { getAverageColorFromNodes } from "../../util/colorHelpers";
import { getTraitFromNode } from "../../util/treeMiscHelpers";
import { NODE_NOT_VISIBLE, demeCountMultiplier, demeCountMinimum } from "../../util/globals";
import { updateTipRadii } from "../../actions/tree"; // eslint-disable-line
import { isColorByGenotype } from "../../util/getGenotype";

/**  TODO LIST (before release)
 * test json with geo-res none of which have lat-longs, as well as jsons without any geo-res.
 * handle browser resizing
 * performance when there are large numbers of transitions is unacceptable
 */

/** TODO LIST (potentially post release)
 * - better setting of deme sizes (applies to the map as well)
 * - decide on JSON format (do we rename geo resolutions to spatial resolutions?)
 * - make line width (and "extend") a function of line count
 * - reinstate onhover behavior to highlight nodes in tree (this is a big performance slow-down)
 */

@connect((state) => {
  return {
    nodes: state.tree.nodes,
    nodeColors: state.tree.nodeColors,
    visibility: state.tree.visibility,
    geoResolution: state.controls.geoResolution,
    dateMinNumeric: state.controls.dateMinNumeric,
    dateMaxNumeric: state.controls.dateMaxNumeric,
    colorBy: state.controls.colorScale.colorBy,
    continuousColorScale: state.controls.colorScale.continuous,
    legendValues: state.controls.colorScale.legendValues,
    showTransmissionLines: state.controls.showTransmissionLines
  };
})
class States extends React.Component {
  constructor(props) {
    super(props);
    // we store data as properties of the object ("class") rather than in `this.state` because
    // we don't want react's lifecycle's to run when it's updated as we manage this ourselves
    this.svgDomRef = null;
    this.data = {};
    this.groups = {};
    this.selections = {};
    this.simulation = forceSimulation().stop();
    this.drag = setUpDragFunctions(this.simulation);
  }
  recomputeData(props, recompute={everything: true}) {
    /* We only want to recompute data as needed (it's expensive!) */
    this.data.demeMultiplier = computeDemeMultiplier(props.nodes);

    if (recompute.everything) {
      this.data.demes = computeDemeData(props, {demeMultiplier: this.data.demeMultiplier});
    } else if (recompute.colors) {
      this.data.demes = computeDemeData(props, {
        demeMultiplier: this.data.demeMultiplier,
        existingCoords: this.data.demes.map((d) => ({x: d.x, y: d.y}))
      });
    } else if (recompute.visibility) {
      updateArcData(this.data.demes, props, {demeMultiplier: this.data.demeMultiplier});
    }

    /* performance improvements are possible here (e.g. colors doesn't need to recreate the beziers!) */
    if (recompute.everything || recompute.colors || recompute.transmissionToggle) {
      this.data.transmissions = computeTransmissions(props, this.data);
    }

    this.simulation.nodes(this.data.demes);

  }
  renderData(props, recompute={everything: true}) {
    /* Labels only render when we update everything. Possible improvement: when demes are not visible
    (i.e. due to visibility) we may want to remove the label and perhaps update the coordinates.
    Note that we also re-render when we recompute the color as the data bind needs updating */
    if (recompute.everything || recompute.colors) {
      this.selections.labels = renderLabels({g: this.groups.labels, demes: this.data.demes, width: this.props.width});
    }
    /* We remove & rerender demes on ∆colorBy & ∆geoRes, otherwise we update their attrs */
    if (recompute.everything || recompute.colors) {
      this.selections.demes = renderDemes({g: this.groups.demes, demes: this.data.demes, geoResolution: props.geoResolution, dispatch: props.dispatch, demeMultiplier: this.demeMultiplier, drag: this.drag});
    } else if (recompute.visibility) {
      this.selections.demes = renderUpdatesToExistingDemes({selection: this.selections.demes});
    }
    /* we handle transmissions differently -- the visibility is computed here, not in the data construction.
    Note that it would be more performant to update existing DOM elements rather than destroying & recreating */
    if (recompute.everything || recompute.colors || recompute.visibility || recompute.transmissionToggle) {
      this.selections.transmissions = renderTransmissions({g: this.groups.transmissions, transmissions: this.data.transmissions, visibility: props.visibility, dateMinNumeric: props.dateMinNumeric, dateMaxNumeric: props.dateMaxNumeric});
    }
  }
  componentDidMount() {
    this.groups = setUpSvg(this.svgDomRef);
    this.recomputeData(this.props);
    this.renderData(this.props);
    this.setUpAndRunSimulation(); // must run after data is bound
  }
  componentWillReceiveProps(nextProps) {
    const recompute = compareProps(this.props, nextProps);
    this.recomputeData(nextProps, recompute);
    this.renderData(nextProps, recompute);
    if (recompute.everything) this.setUpAndRunSimulation();
  }
  setUpAndRunSimulation() {
    // Ideally we want to recompute forces whenever viz changes (as links will have changed). Due to potentical cost,
    // we currently only recompute & restart when the geo res changes
    // TODO: handle window size changes

    this.simulation
      .force("distribute", // distribute points over the SVG & don't let them live outside it.
        forceDistribute(this.props.width, this.props.height)
        .strength(0.2)
      )
      .force("collision", // don't let demes overlap
        forceCollide()
          .radius((n) => n.arcs.length ? n.arcs[0].outerRadius+this.props.width/50 : 0)
          .strength(0.2)
      )
      .force("center",
        forceCenter(this.props.width / 2, this.props.height / 2) // mean of all nodes is in center of SVG
      );
    if (this.data.transmissions && this.data.transmissions.length) {
      this.simulation.force("link",
        forceLink(this.data.transmissions)
          .id((d) => d.name)
          .strength(this.data.transmissions.length > 500 ? 0.005 : 0.1)
      );
    }
    this.simulation.alpha(1) // reheat if necessary
      .alphaDecay(0.05)
      .on("tick", this.onTick)
      .tick(100) // don't need to animate the burn in
      .restart();
  }
  onTick = () => {
    this.selections.demes
      .attr("transform", (d) => "translate(" + d.parent.x + "," + d.parent.y + ")");
    this.selections.labels
      .call((sel) => setLabelPosition(sel, this.props.width));
    updateTransmissionCoordinates(this.data.transmissions);
    this.selections.transmissions
      .attr("d", (d) => renderBezier(d, this.props.visibility, this.props.dateMinNumeric, this.props.dateMaxNumeric));
  }
  render() {
    const { t } = this.props;
    return (
      <Card center title={t("Node States")}>
        {this.props.legend && (
          <ErrorBoundary>
            <Legend right width={this.props.width} />
          </ErrorBoundary>
        )}
        <svg
          id="NodeStatesGraph"
          style={{pointerEvents: "auto", cursor: "default", userSelect: "none"}}
          width={this.props.width}
          height={this.props.height}
          ref={(c) => {this.svgDomRef = c;}}
        />
      </Card>
    );
  }

  componentWillUnmount() {
    this.simulation.stop();
    const svg = select(this.svgDomRef);
    svg.selectAll("*").remove();
  }
}

function computeDemeMultiplier(nodes) {
  const visibleTips = nodes[0].tipCount;
  const demeMultiplier =
    demeCountMultiplier /
    Math.sqrt(_max([Math.sqrt(visibleTips * nodes.length), demeCountMinimum]));
  return demeMultiplier;
}

/**
 * Compute demes, including co-ordinates, for _all_ demes regardless of their visibility
 */
function computeDemeData(props, {demeMultiplier, existingCoords}) {
  const {locationToAllNodes, locationToVisibleNodes} = getNodesPerLocation(props.nodes, props.visibility, props.geoResolution);
  const nDemes = Object.keys(locationToAllNodes).length;
  const demes = new Array(nDemes); // similar to `demeData` in the <Map> component
  /* coordinates defined per-deme (i.e. per geo-resolution value) */
  let coords;
  if (existingCoords) {
    if (existingCoords.length !== nDemes) {
      console.warn("WARNING: provided coords length mismatch");
      coords = undefined;
    } else {
      coords = existingCoords;
    }
  }
  if (!coords) {
    coords = computeCoordinates(props.width, props.height, nDemes);
  }
  /* create data structure for each deme, each containing an array of arcs */
  Object.entries(locationToAllNodes).forEach(([location, visibleNodes], index) => {
    const deme = {
      name: location,
      count: locationToVisibleNodes[location].length,
      ...coords[index] // sets `x` & `y`
    };
    if (props.geoResolution===props.colorBy || props.continuousColorScale) {
      deme.arcs = [{innerRadius: 0, startAngle: 0, endAngle: 2*Math.PI, color: getAverageColorFromNodes(visibleNodes, props.nodeColors)}];
    } else {
      deme.arcs = createOrUpdateArcs(visibleNodes, props.legendValues, props.colorBy, props.nodeColors);
    }
    deme.arcs.forEach((a) => {
      a.outerRadius = Math.sqrt(deme.count)*demeMultiplier;
      a.parent = deme;
    });
    demes[index]=deme;
  });
  return demes;
}

/**
 * Given an array of demes ("node states"), update the constituent arcs. This is used when the
 * visibility of nodes on the tree has changed etc.
 * Side effect: Updates the `demes` data structure in place.
 */
function updateArcData(demes, props, {demeMultiplier}) {
  const {locationToAllNodes, locationToVisibleNodes} = getNodesPerLocation(props.nodes, props.visibility, props.geoResolution);
  const nDemes = Object.keys(locationToAllNodes).length;
  if (nDemes !== demes.length) {
    console.warn("Can't update arcs if length differs");
    return;
  }
  demes.forEach((deme) => {
    const visibleNodes = locationToVisibleNodes[deme.name];
    deme.count = visibleNodes.length;
    if (props.geoResolution===props.colorBy) {
      deme.arcs[0].color = visibleNodes.length ? props.nodeColors[visibleNodes[0].arrayIdx] : "";
    } else if (props.continuousColorScale) {
      deme.arcs[0].color = getAverageColorFromNodes(visibleNodes, props.nodeColors);
    } else {
      deme.arcs = createOrUpdateArcs(visibleNodes, props.legendValues, props.colorBy, props.nodeColors, deme.arcs);
    }
    deme.arcs.forEach((a) => {
      a.outerRadius = Math.sqrt(deme.count)*demeMultiplier;
      a.parent = deme;
    });
  });
}

/**
 * Traverses the tips of the tree to create a dict of
 * location (aka deme) -> list of tips at that location
 * This is similar to the `getVisibleNodesPerLocation` function used by the <Map>
 */
function getNodesPerLocation(nodes, visibility, geoResolution) {
  const locationToAllNodes = {};
  const locationToVisibleNodes = {};
  const genotype = isColorByGenotype(geoResolution);
  nodes.forEach((n, i) => {
    if (n.children) return; /* only consider terminal nodes */
    const location = getTraitFromNode(n, geoResolution, {genotype});
    if (!location) return; /* ignore undefined locations */
    if (!locationToAllNodes[location]) locationToAllNodes[location]=[];
    locationToAllNodes[location].push(n);
    if (!locationToVisibleNodes[location]) locationToVisibleNodes[location]=[];
    if (visibility[i] !== NODE_NOT_VISIBLE) {
      locationToVisibleNodes[location].push(n);
    }
  });
  return {locationToAllNodes, locationToVisibleNodes};
}

/**
 * Compute `n` coordinates where demes will be located.
 * Each coordinate is an object with `x` and `y` properties.
 */
function computeCoordinates(width, height, n) {
  const x0 = width/2;
  const y0 = height/2;
  const t = 2*Math.PI/(n+1);
  const r = Math.min(width, height) * 0.4;
  return Array.from(Array(n).keys())
    .map((index) => ({
      x: x0 + r*Math.cos(t*index),
      y: y0 + r*Math.sin(t*index)
    }));
}

/**
 * Compute an array of transmissions (the data underlying the bezier curves)
 * Note: approach is similar to the <Map>'s `setupTransmissionData` &
 * `maybeConstructTransmissionEvent` functions.
 * Note that this computes all transmissions regardless of visibility. The rendering
 * code will handle the visibility.
 */
function computeTransmissions(props, data) {
  const transmissionData = [];
  const demeToDemeCounts = {}; /* Used to compute the "extend" so that curves don't sit on top of each other */
  const {showTransmissionLines, nodes, geoResolution, nodeColors} = props;
  if (!showTransmissionLines) return transmissionData;
  const genotype = isColorByGenotype(geoResolution);

  /* construct a (temporary) mapping of deme (state) name -> data structure */
  const getDemeFromName = {};
  data.demes.forEach((d) => {getDemeFromName[d.name] = d;});

  /* loop through (phylogeny) nodes and compare each with its own children to get A->B transmissions */
  nodes.forEach((n) => {
    const parentDemeValue = getTraitFromNode(n, geoResolution, {genotype});
    if (n.children) {
      n.children.forEach((child) => {
        const childDemeValue = getTraitFromNode(child, geoResolution, {genotype});
        if (parentDemeValue && childDemeValue && parentDemeValue !== childDemeValue) {

          // Keep track of how many we've seen from A->B in order to get a curve's "extend"
          if ([parentDemeValue, childDemeValue] in demeToDemeCounts) {
            demeToDemeCounts[[parentDemeValue, childDemeValue]] += 2;
          } else {
            demeToDemeCounts[[parentDemeValue, childDemeValue]] = 1;
          }
          const extend = demeToDemeCounts[[parentDemeValue, childDemeValue]];

          const parentDeme = getDemeFromName[parentDemeValue];
          const childDeme = getDemeFromName[childDemeValue];

          // compute a bezier curve
          const nodeCoords = {x: parentDeme.x, y: parentDeme.y};
          const childCoords = {x: childDeme.x, y: childDeme.y};
          const bezierCurve = bezier(nodeCoords, childCoords, extend);
          /* set up interpolator with origin and destination numdates */
          const nodeDate = getTraitFromNode(n, "num_date");
          const childDate = getTraitFromNode(child, "num_date");
          const interpolator = interpolateNumber(nodeDate, childDate);
          /* make a bezierDates array as long as bezierCurve */
          const bezierDates = bezierCurve.map((d, i) => {
            return interpolator(i / (bezierCurve.length - 1));
          });

          const transmission = {
            // originNode: n,
            destinationNode: child,
            bezierCurve,
            bezierDates,
            originDeme: parentDeme,
            destinationDeme: childDeme,
            originName: parentDemeValue,
            destinationName: childDemeValue,
            originNumDate: nodeDate,
            destinationNumDate: childDate,
            color: nodeColors[n.arrayIdx], // colour given by *origin* node
            extend: extend,
            source: parentDemeValue,
            target: childDemeValue
          };
          transmissionData.push(transmission);
        }
      });
    }
  });
  return transmissionData;
}

/**
 * update `transmissions` (array) in-place to reflext changes in corresponding deme coords
 */
function updateTransmissionCoordinates(transmissions) {
  transmissions.forEach((transmission) => {
    // recomputing the entire curve isn't the smartest way to do it, but it is the simplest
    transmission.bezierCurve = bezier(
      {x: transmission.originDeme.x, y: transmission.originDeme.y},
      {x: transmission.destinationDeme.x, y: transmission.destinationDeme.y},
      transmission.extend
    );
  });
}

/**
 * Create d3 selections representing groups in the SVG to hold demes, transmissions etc.
 * @param {} svgDomRef React reference to DOM.
 */
function setUpSvg(svgDomRef) {
  const svg = select(svgDomRef);
  return {
    svg,
    transmissions: svg.append("g").attr("class", "transmissions"),
    demes: svg.append("g").attr("class", "nodes"),
    labels: svg.append("g").attr("class", "labels")
  };
}

/**
 * Given a SVG group selection (`g`), render the demes (the "circles"). Each deme is always
 * made up of arcs (i.e. a deme is always a pie chart) to simplify the code.
 */
function renderDemes({g, demes, geoResolution, dispatch, drag}) { // eslint-disable-line
  g.selectAll("*").remove();
  const generateArc = arc();
  return g.selectAll("circle")
    .data(demes)
    .enter()
      .append("g")
      .attr("class", "pie")
      .selectAll("arc")
      .data((deme) => deme.arcs)
      .enter()
        .append("path")
        .attr("d", generateArc)
        .style("stroke", "none")
        .style("fill-opacity", 0.65)
        .style("fill", (d) => d.color)
        .style("pointer-events", "all")
        .attr("transform", (d) => `translate(${d.parent.x},${d.parent.y})`)
        // .on("mouseover", (d) => { dispatch(updateTipRadii({geoFilter: [geoResolution, d.parent.name]})); })
        // .on("mouseout", () => { dispatch(updateTipRadii()); })
        .call(d3drag()
          .on("start", drag.dragstarted)
          .on("drag", drag.dragged)
          .on("end", drag.dragended)
        );
}

/**
 * Given an existing d3 selection, whose bound data has been updated in-place,
 * update all of the attrs which may have changed. See `updateArcData`
 * for the properties of arcs which may have changed.
 */
function renderUpdatesToExistingDemes({selection}) {
  const generateArc = arc();
  return selection
    .attr("d", generateArc)
    .style("fill", (d) => d.color);
}

/**
 * Given a SVG group selection (`g`), render labels corresponding
 * to the `demes`. You could imagine a force to find the best
 * positioning taking into account surrounding demes & lines, but
 * for now it's overkill.
 */
function renderLabels({g, demes, width}) {
  g.selectAll("*").remove();
  return g.selectAll("text")
    .data(demes)
    .enter()
      .append("text")
      .call((sel) => setLabelPosition(sel, width))
      .style("pointer-events", "none")
      .text((d) => d.name)
      .attr("class", "tipLabel")
      .style("font-size", "12px");
}

/**
 * label positioning fn intended to be called by d3's `call` method
 */
function setLabelPosition(selection, svgWidth) {
  selection
    .attr("x", (d) => d.x*2<svgWidth ? d.x+10 : d.x-10)
    .attr("y", (d) => d.y)
    .attr("text-anchor", (d) => d.x*2<svgWidth ? "start" : "end");
}

/**
 * Given a SVG group selection (`g`), render the transmissions ("curved lines").
 * Note that it is during rendering that we decide if a line is visible, or what segements of
 * the line are visibility according to the current temporal slice.
 */
function renderTransmissions({g, transmissions, visibility, dateMinNumeric, dateMaxNumeric}) {
  g.selectAll("*").remove();
  return g.selectAll("transmissions")
    .data(transmissions)
    .enter()
      .append("path") /* instead of appending a geodesic path from the leaflet plugin data, we now draw a line directly between two points */
        .attr("d", (d) => renderBezier(d, visibility, dateMinNumeric, dateMaxNumeric))
        .attr("fill", "none")
        .attr("stroke-opacity", 0.6)
        .attr("stroke-linecap", "round")
        .attr("stroke", (d) => d.color)
        .attr("stroke-width", 2);
}

function setUpDragFunctions(simulation) {
  return {
    dragstarted: (d) => {
      if (!d3event.active) {
        simulation.alphaTarget(0.3).restart();
      }
      d.parent.fx = d.parent.x;
      d.parent.fy = d.parent.y;
    },
    dragged: (d) => {
      d.parent.fx = d3event.x;
      d.parent.fy = d3event.y;
    },
    dragended: (d) => {
      if (!d3event.active) {
        simulation.alphaTarget(0);
      }
      d.parent.fx = null;
      d.parent.fy = null;
    }
  };
}

/**
 * Produce a SVG path ("d" attr) from a datum given temporal & visibility constraints
 */
function renderBezier(d, visibility, numDateMin, numDateMax) {
  return pathStringGenerator(
    extractLineSegmentForAnimationEffect(
      numDateMin,
      numDateMax,
      {x: d.originDeme.x, y: d.originDeme.y},
      {x: d.destinationDeme.x, y: d.destinationDeme.y},
      d.originNumDate,
      d.destinationNumDate,
      visibility[d.destinationNode.arrayIdx] !== NODE_NOT_VISIBLE ? "visible" : "hidden",
      d.bezierCurve,
      d.bezierDates
    )
  );
}

/**
 * When props change, the data structures behind the data visualisation, and the d3-rendered
 * visualisation itself, must change. For performance and usability reasons, we don't want
 * to recompute & rerender everything on every prop change. This function identifies how we
 * should update the data structures & viz.
 */
function compareProps(oldProps, newProps) {
  const recompute = {
    everything: false,
    colors: false,
    visibility: false
  };
  if (oldProps.geoResolution !== newProps.geoResolution) {
    recompute.everything = true;
  } else if (oldProps.colorBy !== newProps.colorBy) {
    recompute.colors = true;
  } else {
    recompute.visibility = true;
  }
  recompute.transmissionToggle = oldProps.showTransmissionLines !== newProps.showTransmissionLines;
  return recompute;
}

/**
 * a d3-force to
 * (1) prevent demes from being positioned outside the SVG bounds (takes into account deme radius)
 * (2) scale demes to span `fracSvgToUse` of the horizontal & vertical space
 */
function forceDistribute(svgWidth, svgHeight, fracSvgToUse=0.95) {
  let nodes;
  let strength = 0.1;
  const availableWidth = fracSvgToUse*svgWidth;
  const availableHeight = fracSvgToUse*svgHeight;
  const padFrac = (1-fracSvgToUse)/2; // padding desired at each edge

  function force(alpha) {
    /* ensure not out-of-bounds (should also do this on mouse event btw) */
    let minX=svgWidth, maxX=0, minY=svgHeight, maxY=0;
    nodes.forEach((n) => {
      const r = n.arcs.length ? n.arcs[0].outerRadius + 10 : 10;
      n.x = Math.max(r, Math.min(svgWidth - r, n.x));
      n.y = Math.max(r, Math.min(svgHeight - r, n.y));
      if (n.x<minX) minX=n.x;
      if (n.x>maxX) maxX=n.x;
      if (n.y<minY) minY=n.y;
      if (n.y>maxY) maxY=n.y;
    });
    /* push them to be better distributed */
    const scaleX = availableWidth/(maxX-minX);
    const scaleY = availableHeight/(maxY-minY);
    const offsetX = padFrac*svgWidth - minX; // -ve values indicate a leftward shift is desired
    const offsetY = padFrac*svgHeight - minY;
    nodes.forEach((n) => {
      n.vx -= (n.x - (n.x+offsetX)*scaleX) * strength * alpha;
      n.vy -= (n.y - (n.y+offsetY)*scaleY) * strength * alpha;
    });
  }

  force.initialize = function _initialize(_) {
    nodes = _;
  };

  force.strength = function _strength(_) {
    strength = _;
    return force;
  };

  return force;
}


const WithTranslation = withTranslation()(States);
export default WithTranslation;
