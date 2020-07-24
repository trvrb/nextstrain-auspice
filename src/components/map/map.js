import React from "react";
import PropTypes from 'prop-types';
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import leaflet from "leaflet";
import { GestureHandling } from "leaflet-gesture-handling";
import "leaflet/dist/leaflet.css";
import "leaflet-gesture-handling/dist/leaflet-gesture-handling.css";
import _min from "lodash/min";
import _max from "lodash/max";
import domtoimage from "dom-to-image";
import { select } from "d3-selection";
import 'd3-transition';
import Card from "../framework/card";
import { drawDemesAndTransmissions, updateOnMoveEnd, updateVisibility } from "./mapHelpers";
import {
  createDemeAndTransmissionData,
  updateDemeAndTransmissionDataColAndVis,
  updateTransmissionDataLatLong,
  updateDemeDataLatLong
} from "./mapHelpersLatLong";
import { changeDateFilter } from "../../actions/tree";
import { MAP_ANIMATION_PLAY_PAUSE_BUTTON } from "../../actions/types";
// import { incommingMapPNG } from "../download/helperFunctions";
import { timerStart, timerEnd } from "../../util/perf";
import { tabSingle, darkGrey, lightGrey, goColor, pauseColor } from "../../globalStyles";
import ErrorBoundary from "../../util/errorBoundry";
import Legend from "../tree/legend/legend";
import "../../css/mapbox.css";

/* global L */
// L is global in scope and placed by leaflet()
@connect((state) => {
  return {
    // datasetGuid: state.tree.datasetGuid,
    branchLengthsToDisplay: state.controls.branchLengthsToDisplay,
    absoluteDateMin: state.controls.absoluteDateMin,
    absoluteDateMax: state.controls.absoluteDateMax,
    treeVersion: state.tree.version,
    treeLoaded: state.tree.loaded,
    nodes: state.tree.nodes,
    nodeColors: state.tree.nodeColors,
    visibility: state.tree.visibility,
    visibilityVersion: state.tree.visibilityVersion,
    metadata: state.metadata,
    colorScaleVersion: state.controls.colorScale.version,
    map: state.map,
    geoResolution: state.controls.geoResolution,
    animationPlayPauseButton: state.controls.animationPlayPauseButton,
    mapTriplicate: state.controls.mapTriplicate,
    dateMinNumeric: state.controls.dateMinNumeric,
    dateMaxNumeric: state.controls.dateMaxNumeric,
    panelLayout: state.controls.panelLayout,
    colorBy: state.controls.colorScale.colorBy,
    narrativeMode: state.narrative.display,
    pieChart: (
      !state.controls.colorScale.continuous &&                           // continuous color scale = no pie chart
      state.controls.geoResolution !== state.controls.colorScale.colorBy // geo circles match colorby == no pie chart
    ),
    legendValues: state.controls.colorScale.legendValues,
    showTransmissionLines: state.controls.showTransmissionLines
  };
})

class Map extends React.Component {
  static propTypes = {
    treeVersion: PropTypes.number.isRequired,
    treeLoaded: PropTypes.bool.isRequired,
    colorScaleVersion: PropTypes.number.isRequired
  }
  constructor(props) {
    super(props);
    this.state = {
      map: null,
      d3DOMNode: null,
      d3elems: null,
      responsive: null,
      demeData: null,
      transmissionData: null,
      demeIndices: null,
      transmissionIndices: null,
      userHasInteractedWithMap: false
    };
    // https://github.com/yannickcr/eslint-plugin-react/blob/master/docs/rules/jsx-no-bind.md#es6-classes
    this.playPauseButtonClicked = this.playPauseButtonClicked.bind(this);
    this.resetButtonClicked = this.resetButtonClicked.bind(this);
    this.fitMapBoundsToData = this.fitMapBoundsToData.bind(this);
  }

  componentWillMount() {
    if (!window.L) {
      leaflet(); /* this sets up window.L */
    }
    if (!window.L.getMapSvg) {
      /* Get the map tiles */
      window.L.getMapSvg = (loadendCallback) => {
        const mapDimensions = this.state.map.getSize();
        const panOffsets = this.state.map._getMapPanePos();
        domtoimage.toSvg(this.state.map.getContainer(),
          {
            width: mapDimensions.x,
            height: mapDimensions.y,
            filter: (node) => {
              return node.className !== "leaflet-control-container";
            }
          })
          .then((image) => {
            loadendCallback({
              mapSvg: image.replace('data:image/svg+xml;charset=utf-8,', ''),
              mapDimensions: mapDimensions,
              panOffsets: panOffsets
            });
          });
      };
    }
  }
  componentDidMount() {
    this.maybeChangeSize(this.props);
    const removed = this.maybeRemoveAllDemesAndTransmissions(this.props); /* geographic resolution just changed (ie., country to division), remove everything. this change is upstream of maybeDraw */
    // TODO: if demes are color blended circles, updating rather than redrawing demes would do
    if (!removed) {
      this.maybeUpdateDemesAndTransmissions(this.props); /* every time we change something like colorBy */
    }
    this.maybeInvalidateMapSize(this.props);
  }
  componentWillReceiveProps(nextProps) {
    this.modulateInterfaceForNarrativeMode(nextProps);
    this.maybeChangeSize(nextProps);
    const removed = this.maybeRemoveAllDemesAndTransmissions(nextProps); /* geographic resolution just changed (ie., country to division), remove everything. this change is upstream of maybeDraw */
    // TODO: if demes are color blended circles, updating rather than redrawing demes would do
    if (!removed) {
      this.maybeUpdateDemesAndTransmissions(nextProps); /* every time we change something like colorBy */
    }
    this.maybeInvalidateMapSize(nextProps);
  }
  componentDidUpdate(prevProps) {
    if (this.props.nodes === null) { return; }
    this.maybeCreateLeafletMap(); /* puts leaflet in the DOM, only done once */
    this.maybeSetupD3DOMNode(); /* attaches the D3 SVG DOM node to the Leaflet DOM node, only done once */
    this.maybeDrawDemesAndTransmissionsAndMoveMap(prevProps); /* it's the first time, or they were just removed because we changed dataset or colorby or resolution */
  }
  maybeInvalidateMapSize(nextProps) {
    /* when we procedurally change the size of the card, for instance, when we swap from grid to full */
    if (this.state.map && (this.props.width !== nextProps.width || this.props.height !== nextProps.height)) {
      // first, clear any existing timeout
      if (this.map_timeout) {
        window.clearTimeout(this.map_timeout);
      }
      // delay to resize map (when complete, narrative will re-focus map on data)
      this.map_timeout = window.setTimeout(
        this.invalidateMapSize.bind(this),
        this.props.narrativeMode ? 100 : 750
      );
    }
  }
  invalidateMapSize() {
    this.state.map.invalidateSize();
  }
  maybeCreateLeafletMap() {
    /* first time map, this sets up leaflet */
    if (this.props.metadata.loaded && !this.state.map && document.getElementById("map")) {
      this.createMap();
    }
  }
  maybeChangeSize(nextProps) {
    if (this.props.width !== nextProps.width ||
      this.props.height !== nextProps.height ||
      !this.state.responsive ||
      this.props.treeVersion !== nextProps.treeVersion // treeVersion change implies tree is ready (modified by the same action)
    ) {
      /* This is stored in state because it's used by both the map and the d3 overlay */
      this.setState({responsive: {width: nextProps.width, height: nextProps.height}});
    }
  }
  maybeSetupD3DOMNode() {
    if (
      this.state.map &&
      this.state.responsive &&
      !this.state.d3DOMNode
    ) {
      const d3DOMNode = select("#map svg").attr("id", "d3DemesTransmissions");
      this.setState({d3DOMNode});
    }
  }
  modulateInterfaceForNarrativeMode(nextProps) {
    if (this.props.narrativeMode === nextProps.narrativeMode || !this.state.map) return;
    if (nextProps.narrativeMode) {
      L.zoomControlButtons.remove();
      this.state.map.dragging.disable();
      this.state.map.doubleClickZoom.disable();
    } else {
      L.zoomControlButtons = L.control.zoom({position: "bottomright"}).addTo(this.state.map);
      this.state.map.dragging.enable();
      this.state.map.doubleClickZoom.enable();
    }
  }

  maybeDrawDemesAndTransmissionsAndMoveMap(prevProps) {
    const mapIsDrawn = !!this.state.map;
    const allDataPresent = !!(this.props.metadata.loaded && this.props.treeLoaded && this.state.responsive && this.state.d3DOMNode);
    const demesTransmissionsNotComputed = !this.state.demeData && !this.state.transmissionData;
    /* if at any point we change dataset and app doesn't remount, we'll need these again */
    // const newColorScale = this.props.colorScale.version !== prevProps.colorScale.version;
    // const newGeoResolution = this.props.geoResolution !== prevProps.geoResolution;
    // const initialVisibilityVersion = this.props.visibilityVersion === 1; /* see tree reducer, we set this to 1 after tree comes back */
    // const newVisibilityVersion = this.props.visibilityVersion !== prevProps.visibilityVersion;

    if (mapIsDrawn && allDataPresent && demesTransmissionsNotComputed) {
      timerStart("drawDemesAndTransmissions");
      /* data structures to feed to d3 latLongs = { tips: [{}, {}], transmissions: [{}, {}] } */

      const {demeData, transmissionData, demeIndices, transmissionIndices} = createDemeAndTransmissionData(
        this.props.nodes,
        this.props.visibility,
        this.props.geoResolution,
        this.props.nodeColors,
        this.props.mapTriplicate,
        this.props.metadata,
        this.state.map,
        this.props.pieChart,
        this.props.legendValues,
        this.props.colorBy,
        this.props.showTransmissionLines,
        this.props.dispatch
      );

      /* Now that the d3 data is created (not yet drawn) we can compute map bounds & move as appropriate */
      this.moveMapAccordingToData({
        geoResolutionChanged: prevProps.geoResolution !== this.props.geoResolution,
        visibilityChanged: prevProps.visibility !== this.props.visibility,
        demeData,
        demeIndices
      });

      // const latLongs = this.latLongs(demeData, transmissionData); /* no reference stored, we recompute this for now rather than updating in place */
      const d3elems = drawDemesAndTransmissions(
        demeData,
        transmissionData,
        this.state.d3DOMNode,
        this.state.map,
        this.props.nodes,
        this.props.dateMinNumeric,
        this.props.dateMaxNumeric,
        this.props.pieChart,
        this.props.geoResolution,
        this.props.dispatch,
        this.props.showTransmissionLines,
      );

      // don't redraw on every rerender - need to seperately handle virus change redraw
      this.setState({
        boundsSet: true,
        d3elems,
        demeData,
        transmissionData,
        demeIndices,
        transmissionIndices
      });
      timerEnd("drawDemesAndTransmissions");
    }
  }
  /**
   * removing demes & transmissions, both from the react state & from the DOM.
   * They will be created from scratch (& rendered) by `this.maybeDrawDemesAndTransmissionsAndMoveMap`
   * This is done when
   *    (a) the dataset has changed
   *    (b) the geo resolution has changed (new transmissions, new deme locations)
   *    (c) we change colorBy -- mainly as the `demeData` structure is different both
   *        pie charts vs circles, and also between different pie charts (different num of slices)
   *
   * Note: we do not modify `state.boundsSet` to stop the map resetting position
   */
  maybeRemoveAllDemesAndTransmissions(nextProps) {
    const mapIsDrawn = !!this.state.map;
    const geoResolutionChanged = this.props.geoResolution !== nextProps.geoResolution;
    const transmissionLinesToggleChanged = this.props.showTransmissionLines !== nextProps.showTransmissionLines;
    const dataChanged = (!nextProps.treeLoaded || this.props.treeVersion !== nextProps.treeVersion);
    const colorByChanged = (nextProps.colorScaleVersion !== this.props.colorScaleVersion);
    if (mapIsDrawn && (geoResolutionChanged || dataChanged || colorByChanged || transmissionLinesToggleChanged)) {
      this.state.d3DOMNode.selectAll("*").remove();
      this.setState({
        d3elems: null,
        demeData: null,
        transmissionData: null,
        demeIndices: null,
        transmissionIndices: null
      });
      return true;
    }
    return false;
  }
  respondToLeafletEvent(leafletEvent) {
    if (leafletEvent.type === "moveend") { /* zooming and panning */

      /* Movend: Fired when the center of the map stops changing (e.g. user stopped dragging the map). */
      /* Note - this method is triggered when the map sets up and is essential
      for moving the d3 elements to their correct positions. It is later
      triggered on pan / zoom (as you'd expect) */

      if (!this.state.demeData || !this.state.transmissionData) {
        /* this seems to happen when the data takes a particularly long time to create.
        and the map is ready before the data (??). It's imperitive that this method runs
        so if the data's not ready yet we try to rerun it after a short time.
        This could be improved */
        window.setTimeout(() => this.respondToLeafletEvent(leafletEvent), 50);
        return;
      }

      const newDemes = updateDemeDataLatLong(this.state.demeData, this.state.map);
      const newTransmissions = updateTransmissionDataLatLong(this.state.transmissionData, this.state.map);
      updateOnMoveEnd(
        newDemes,
        newTransmissions,
        this.state.d3elems,
        this.props.dateMinNumeric,
        this.props.dateMaxNumeric,
        this.props.pieChart
      );
      this.setState({demeData: newDemes, transmissionData: newTransmissions});
    }
  }
  getGeoRange(demeData, demeIndices) {
    const latitudes = [];
    const longitudes = [];

    /* Loop through the different demes and, if they are in view (i.e. their `count` > 0)
    then add their lat-longs to the the respective arrays */
    this.props.metadata.geoResolutions.forEach((geoData) => {
      if (geoData.key === this.props.geoResolution) {
        const demeToLatLongs = geoData.demes;
        Object.keys(demeToLatLongs).forEach((deme) => {
          if (!demeIndices || !demeData || !demeIndices[deme]) {
            /* include them all */
            latitudes.push(demeToLatLongs[deme].latitude);
            longitudes.push(demeToLatLongs[deme].longitude);
          } else {
            demeIndices[deme].forEach((demeIdx) => {
              if (demeData[demeIdx] && demeData[demeIdx].count > 0) {
                latitudes.push(demeToLatLongs[deme].latitude);
                longitudes.push(demeToLatLongs[deme].longitude);
              }
            });
          }
        });
      }
    });

    const maxLat = _max(latitudes);
    const minLat = _min(latitudes);
    const maxLng = _max(longitudes);
    const minLng = _min(longitudes);
    const lngRange = (maxLng - minLng) % 360;
    const latRange = (maxLat - minLat);
    const south = _max([-55, minLat - (0.1 * latRange)]);
    const north = _min([70, maxLat + (0.1 * latRange)]);
    const east = _max([-180, minLng - (0.1 * lngRange)]);
    const west = _min([180, maxLng + (0.1 * lngRange)]);

    return [L.latLng(south, west), L.latLng(north, east)];
  }
  /**
   * updates demes & transmissions when redux (tree) visibility or colorScale (i.e. colorBy) has changed
   * returns early if the map or tree isn't ready
   * uses deme & transmission indicies for smart (quick) updating
   */
  maybeUpdateDemesAndTransmissions(nextProps) {
    if (!this.state.map || !this.props.treeLoaded || !this.state.d3elems) { return; }

    const visibilityChange = nextProps.visibilityVersion !== this.props.visibilityVersion;
    const haveData = nextProps.nodes && nextProps.visibility && nextProps.geoResolution && nextProps.nodeColors;

    if (!(visibilityChange && haveData)) { return; }

    timerStart("updateDemesAndTransmissions");
    if (this.props.geoResolution !== nextProps.geoResolution) {
      /* This `if` statement added as part of https://github.com/nextstrain/auspice/issues/722
       * and should be a prime candidate for refactoring in https://github.com/nextstrain/auspice/issues/735
       */
      const {demeData, transmissionData, demeIndices, transmissionIndices} = createDemeAndTransmissionData(
        nextProps.nodes,
        nextProps.visibility,
        nextProps.geoResolution,
        nextProps.nodeColors,
        nextProps.mapTriplicate,
        nextProps.metadata,
        this.state.map,
        nextProps.pieChart,
        nextProps.legendValues,
        nextProps.colorBy,
        nextProps.showTransmissionLines,
        nextProps.dispatch
      );
      const d3elems = drawDemesAndTransmissions(
        demeData,
        transmissionData,
        this.state.d3DOMNode,
        this.state.map,
        nextProps.nodes,
        nextProps.dateMinNumeric,
        nextProps.dateMaxNumeric,
        nextProps.pieChart,
        nextProps.geoResolution,
        nextProps.dispatch
      );
      this.setState({
        d3elems,
        demeData,
        transmissionData,
        demeIndices,
        transmissionIndices
      });
    } else {
      const { newDemes, newTransmissions } = updateDemeAndTransmissionDataColAndVis(
        this.state.demeData,
        this.state.transmissionData,
        this.state.demeIndices,
        this.state.transmissionIndices,
        nextProps.nodes,
        nextProps.visibility,
        nextProps.geoResolution,
        nextProps.nodeColors,
        nextProps.pieChart,
        nextProps.colorBy,
        nextProps.legendValues
      );
      updateVisibility(
        /* updated in the function above */
        newDemes,
        newTransmissions,
        /* we already have all this */
        this.state.d3elems,
        this.state.map,
        nextProps.nodes,
        nextProps.dateMinNumeric,
        nextProps.dateMaxNumeric,
        nextProps.pieChart
      );

      this.moveMapAccordingToData({
        geoResolutionChanged: nextProps.geoResolution !== this.props.geoResolution,
        visibilityChanged: nextProps.visibility !== this.props.visibility,
        demeData: newDemes,
        demeIndices: this.state.demeIndices
      });

      this.setState({
        demeData: newDemes,
        transmissionData: newTransmissions
      });
    }
    timerEnd("updateDemesAndTransmissions");
  }

  getInitialBounds() {
    let southWest;
    let northEast;

    /* initial map bounds */
    if (this.props.mapTriplicate) {
      southWest = L.latLng(-70, -360);
      northEast = L.latLng(80, 360);
    } else {
      southWest = L.latLng(-70, -180);
      northEast = L.latLng(80, 180);
    }

    const bounds = L.latLngBounds(southWest, northEast);

    return bounds;
  }

  createMap() {

    const zoom = 2;
    const center = [0, 0];

    /* *****************************************
    GET LEAFLET IN THE DOM
    **************************************** */

    L.Map.addInitHook("addHandler", "gestureHandling", GestureHandling);

    const map = L.map('map', {
      center: center,
      zoom: zoom,
      gestureHandling: true,
      maxBounds: this.getInitialBounds(),
      minZoom: 1,
      maxZoom: 14,
      zoomSnap: 0.5,
      zoomControl: false,
      doubleClickZoom: !this.props.narrativeMode
    });

    map.getRenderer(map).options.padding = 2;

    L.tileLayer('https://api.mapbox.com/styles/v1/trvrb/ciu03v244002o2in5hlm3q6w2/tiles/256/{z}/{x}/{y}?access_token=pk.eyJ1IjoidHJ2cmIiLCJhIjoiY2l1MDRoMzg5MDEwbjJvcXBpNnUxMXdwbCJ9.PMqX7vgORuXLXxtI3wISjw', {
      attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> <a style="font-weight: 700" href="https://www.mapbox.com/map-feedback/" target="_blank">Improve this map</a>'
    }).addTo(map);

    if (!this.props.narrativeMode) {
      L.zoomControlButtons = L.control.zoom({position: "bottomright"}).addTo(map);
    }

    const Wordmark = L.Control.extend({
      onAdd: function onAdd() {
        const wordmark = L.DomUtil.create('a', 'mapbox-wordmark');
        wordmark.href = "http://mapbox.com/about/maps";
        wordmark.target = "_blank";
        return wordmark;
      }
    });
    (new Wordmark({position: 'bottomleft'})).addTo(map);


    /* Set up leaflet events */
    map.on("moveend", this.respondToLeafletEvent.bind(this));
    map.on("resize", () => {
      if (this.props.narrativeMode) {
        this.fitMapBoundsToData(this.state.demeData, this.state.demeIndices);
      }
    });

    this.setState({map});
  }

  animationButtons() {
    if (this.props.narrativeMode) return null;
    const buttonBaseStyle = {
      color: "#FFFFFF",
      fontWeight: 400,
      fontSize: 12,
      borderRadius: 3,
      padding: 12,
      border: "none",
      zIndex: 900,
      position: "relative",
      textTransform: "uppercase"
    };
    if (this.props.branchLengthsToDisplay !== "divOnly") {
      return (
        <div style={{position: "absolute"}}>
          <button
            style={{...buttonBaseStyle, top: 20, left: 20, backgroundColor: this.props.animationPlayPauseButton === "Pause" ? pauseColor : goColor}}
            onClick={this.playPauseButtonClicked}
          >
            {this.props.t(this.props.animationPlayPauseButton)}
          </button>
          <button
            style={{...buttonBaseStyle, top: 20, left: 30, backgroundColor: lightGrey}}
            onClick={this.resetButtonClicked}
          >
            {this.props.t("Reset")}
          </button>
        </div>
      );
    }
    /* else - divOnly */
    return (<div/>);
  }

  maybeCreateMapDiv() {
    let container = null;
    if (this.state.responsive) {
      container = (
        <div style={{position: "relative"}}>
          {this.animationButtons()}
          <div
            onClick={() => {this.setState({userHasInteractedWithMap: true});}}
            id="map"
            style={{
              height: this.state.responsive.height,
              width: this.state.responsive.width
            }}
          />
        </div>
      );
    }
    return container;
  }
  playPauseButtonClicked() {
    if (this.props.animationPlayPauseButton === "Play") {
      this.props.dispatch({type: MAP_ANIMATION_PLAY_PAUSE_BUTTON, data: "Pause"});
    } else {
      this.props.dispatch({type: MAP_ANIMATION_PLAY_PAUSE_BUTTON, data: "Play"});
    }
  }
  resetButtonClicked() {
    this.props.dispatch({type: MAP_ANIMATION_PLAY_PAUSE_BUTTON, data: "Play"});
    this.props.dispatch(changeDateFilter({newMin: this.props.absoluteDateMin, newMax: this.props.absoluteDateMax, quickdraw: false}));
  }
  moveMapAccordingToData({geoResolutionChanged, visibilityChanged, demeData, demeIndices}) {
    /* Given d3 data (may not be drawn) we can compute map bounds & move as appropriate */
    if (!this.state.boundsSet) {
      /* we are doing the initial render -> set map to the range of the data in view */
      /* P.S. This is how upon initial loading the map zooms into the data */
      this.fitMapBoundsToData(demeData, demeIndices);
      return;
    }

    /* if we're animating, then we don't want to move the map all the time */
    if (this.props.animationPlayPauseButton === "Pause") {
      return;
    }

    if (geoResolutionChanged || visibilityChanged) {
      /* changed visiblity (e.g. filters applied) in narrative mode => reset view */
      if (this.props.narrativeMode) {
        this.state.map.fire("resize");
      } else if (!this.state.userHasInteractedWithMap) {
        this.fitMapBoundsToData(demeData, demeIndices);
      }
    }
  }
  getMaxZoomForFittingMapToData() {
    /* To avoid setting the bounds too small (e.g. if restricted to one country
      then we don't want to be at maximum zoom) we use hardcoded zoom levels which
      depend on the geo resolution. In the future these may be settable via the dataset
      JSON. Note that this does not change the max zoom level available when interacting
      with the map. See https://leafletjs.com/examples/zoom-levels/ for what a zoom
      level represents. */
    switch (this.props.geoResolution.toLowerCase()) {
      case "region":
        return 4;
      case "country":
        return 5; // works well for "big" countries like USA / China but less well for the 13-16 EBOV data
      case "state":
        return 7; // designed around US states
      case "city":
        return 12;
      case "block":
        return 14; // designed around the basel-flu data
      default:
        return 8;
    }
  }
  fitMapBoundsToData(demeData, demeIndices) {
    const SWNE = this.getGeoRange(demeData, demeIndices);
    // window.L available because leaflet() was called in componentWillMount
    this.state.currentBounds = window.L.latLngBounds(SWNE[0], SWNE[1]);
    const maxZoom = this.getMaxZoomForFittingMapToData();
    // first, clear any existing timeout
    if (this.bounds_timeout) {
      window.clearTimeout(this.bounds_timeout);
    }
    // delay to change map bounds
    this.bounds_timeout = window.setTimeout(
      (map) => {
        map.fitBounds(window.L.latLngBounds(SWNE[0], SWNE[1]), {maxZoom});
      },
      this.props.narrativeMode ? 100 : 750,
      this.state.map
    );
  }
  getStyles = () => {
    const activeResetZoomButton = true;
    return {
      resetZoomButton: {
        zIndex: 100,
        position: "absolute",
        right: 5,
        top: 0,
        cursor: activeResetZoomButton ? "pointer" : "auto",
        color: activeResetZoomButton ? darkGrey : lightGrey
      }
    };
  };
  render() {
    const { t } = this.props;
    const styles = this.getStyles();
    const transmissionsExist = this.state.transmissionData && this.state.transmissionData.length;
    // clear layers - store all markers in map state https://github.com/Leaflet/Leaflet/issues/3238#issuecomment-77061011
    return (
      <Card center title={transmissionsExist ? t("Transmissions") : t("Geography")}>
        {this.props.legend && <ErrorBoundary>
          <Legend right width={this.props.width} />
        </ErrorBoundary>}
        {this.maybeCreateMapDiv()}
        {this.props.narrativeMode ? null : (
          <button
            style={{...tabSingle, ...styles.resetZoomButton}}
            onClick={() => {
              this.fitMapBoundsToData(this.state.demeData, this.state.demeIndices);
              this.setState({userHasInteractedWithMap: false});
            }}
          >
            {t("reset zoom")}
          </button>
        )}
      </Card>
    );
  }
}

const WithTranslation = withTranslation()(Map);
export default WithTranslation;
