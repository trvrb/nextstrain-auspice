import { numericToCalendar, calendarToNumeric, currentNumDate, currentCalDate } from "../util/dateHelpers";
import { defaultGeoResolution,
  defaultColorBy,
  defaultDateRange,
  defaultDistanceMeasure,
  defaultLayout,
  defaultTreeZoom,
  defaultMutType,
  controlsHiddenWidth,
  strainSymbol,
  twoColumnBreakpoint } from "../util/globals";
import * as types from "../actions/types";
import { calcBrowserDimensionsInitialState } from "./browserDimensions";
import { doesColorByHaveConfidence } from "../actions/recomputeReduxState";

/* defaultState is a fn so that we can re-create it
at any time, e.g. if we want to revert things (e.g. on dataset change)
*/
export const getDefaultControlsState = () => {
  const defaults = {
    distanceMeasure: defaultDistanceMeasure,
    layout: defaultLayout,
    treeZoom: defaultTreeZoom,
    geoResolution: defaultGeoResolution,
    filters: {},
    colorBy: defaultColorBy,
    selectedBranchLabel: "none",
    showTransmissionLines: true
  };
  // a default sidebarOpen status is only set via JSON, URL query
  // _or_ if certain URL keywords are triggered
  const initialSidebarState = getInitialSidebarState();
  if (initialSidebarState.setDefault) {
    defaults.sidebarOpen = initialSidebarState.sidebarOpen;
  }

  const dateMin = numericToCalendar(currentNumDate() - defaultDateRange);
  const dateMax = currentCalDate();
  const dateMinNumeric = calendarToNumeric(dateMin);
  const dateMaxNumeric = calendarToNumeric(dateMax);
  return {
    defaults,
    available: undefined,
    canTogglePanelLayout: true,
    selectedBranch: null,
    selectedNode: null,
    region: null,
    search: null,
    strain: null,
    geneLength: {},
    mutType: defaultMutType,
    temporalConfidence: { exists: false, display: false, on: false },
    layout: defaults.layout,
    scatterVariables: {},
    distanceMeasure: defaults.distanceMeasure,
    treeZoom: defaults.treeZoom,
    dateMin,
    dateMinNumeric,
    dateMax,
    dateMaxNumeric,
    absoluteDateMin: dateMin,
    absoluteDateMinNumeric: dateMinNumeric,
    absoluteDateMax: dateMax,
    absoluteDateMaxNumeric: dateMaxNumeric,
    colorBy: defaults.colorBy,
    colorByConfidence: { display: false, on: false },
    colorScale: undefined,
    selectedBranchLabel: "none",
    canRenderBranchLabels: true,
    analysisSlider: false,
    geoResolution: defaults.geoResolution,
    filters: {},
    showDownload: false,
    quickdraw: false, // if true, components may skip expensive computes.
    mapAnimationDurationInMilliseconds: 30000, // in milliseconds
    mapAnimationStartDate: null, // Null so it can pull the absoluteDateMin as the default
    mapAnimationCumulative: false,
    mapAnimationShouldLoop: false,
    animationPlayPauseButton: "Play",
    panelsAvailable: [],
    panelsToDisplay: [],
    panelLayout: calcBrowserDimensionsInitialState().width > twoColumnBreakpoint ? "grid" : "full",
    tipLabelKey: strainSymbol,
    showTreeToo: undefined,
    showTangle: false,
    zoomMin: undefined,
    zoomMax: undefined,
    branchLengthsToDisplay: "divAndDate",
    sidebarOpen: initialSidebarState.sidebarOpen,
    treeLegendOpen: undefined,
    mapLegendOpen: undefined,
    showOnlyPanels: false,
    showTransmissionLines: true,
    normalizeFrequencies: true
  };
};

/* while this may change, div currently doesn't have CIs, so they shouldn't be displayed. */
export const shouldDisplayTemporalConfidence = (exists, distMeasure, layout) => exists && distMeasure === "num_date" && layout === "rect";

const Controls = (state = getDefaultControlsState(), action) => {
  switch (action.type) {
    case types.URL_QUERY_CHANGE_WITH_COMPUTED_STATE: /* fallthrough */
    case types.CLEAN_START:
      return action.controls;
    case types.SET_AVAILABLE:
      return Object.assign({}, state, { available: action.data });
    case types.BRANCH_MOUSEENTER:
      return Object.assign({}, state, {
        selectedBranch: action.data
      });
    case types.BRANCH_MOUSELEAVE:
      return Object.assign({}, state, {
        selectedBranch: null
      });
    case types.NODE_MOUSEENTER:
      return Object.assign({}, state, {
        selectedNode: action.data
      });
    case types.NODE_MOUSELEAVE:
      return Object.assign({}, state, {
        selectedNode: null
      });
    case types.CHANGE_BRANCH_LABEL:
      return Object.assign({}, state, { selectedBranchLabel: action.value });
    case types.CHANGE_LAYOUT:
      return Object.assign({}, state, {
        layout: action.layout,
        canRenderBranchLabels: action.canRenderBranchLabels,
        scatterVariables: action.scatterVariables,
        /* temporal confidence can only be displayed for rectangular trees */
        temporalConfidence: Object.assign({}, state.temporalConfidence, {
          display: shouldDisplayTemporalConfidence(
            state.temporalConfidence.exists,
            state.distanceMeasure,
            action.data
          ),
          on: false
        })
      });
    case types.CHANGE_DISTANCE_MEASURE:
      const updatesToState = {
        distanceMeasure: action.data,
        branchLengthsToDisplay: state.branchLengthsToDisplay
      };
      if (
        shouldDisplayTemporalConfidence(state.temporalConfidence.exists, action.data, state.layout)
      ) {
        updatesToState.temporalConfidence = Object.assign({}, state.temporalConfidence, {
          display: true
        });
      } else {
        updatesToState.temporalConfidence = Object.assign({}, state.temporalConfidence, {
          display: false,
          on: false
        });
      }
      return Object.assign({}, state, updatesToState);
    case types.CHANGE_TREE_ZOOM:
      return Object.assign({}, state, {
        treeZoom: action.data
      });
    case types.CHANGE_DATES_VISIBILITY_THICKNESS: {
      const newDates = { quickdraw: action.quickdraw };
      if (action.dateMin) {
        newDates.dateMin = action.dateMin;
        newDates.dateMinNumeric = action.dateMinNumeric;
      }
      if (action.dateMax) {
        newDates.dateMax = action.dateMax;
        newDates.dateMaxNumeric = action.dateMaxNumeric;
      }
      const colorScale = {...state.colorScale, visibleLegendValues: action.visibleLegendValues};
      return {...state, ...newDates, colorScale};
    }
    case types.CHANGE_ABSOLUTE_DATE_MIN:
      return Object.assign({}, state, {
        absoluteDateMin: action.data,
        absoluteDateMinNumeric: calendarToNumeric(action.data)
      });
    case types.CHANGE_ABSOLUTE_DATE_MAX:
      return Object.assign({}, state, {
        absoluteDateMax: action.data,
        absoluteDateMaxNumeric: calendarToNumeric(action.data)
      });
    case types.CHANGE_ANIMATION_TIME:
      return Object.assign({}, state, {
        mapAnimationDurationInMilliseconds: action.data
      });
    case types.CHANGE_ANIMATION_CUMULATIVE:
      return Object.assign({}, state, {
        mapAnimationCumulative: action.data
      });
    case types.CHANGE_ANIMATION_LOOP:
      return Object.assign({}, state, {
        mapAnimationShouldLoop: action.data
      });
    case types.MAP_ANIMATION_PLAY_PAUSE_BUTTON:
      return Object.assign({}, state, {
        quickdraw: action.data !== "Play",
        animationPlayPauseButton: action.data
      });
    case types.CHANGE_ANIMATION_START:
      return Object.assign({}, state, {
        mapAnimationStartDate: action.data
      });
    case types.CHANGE_PANEL_LAYOUT:
      return Object.assign({}, state, {
        panelLayout: action.data
      });
    case types.CHANGE_TIP_LABEL_KEY:
      return {...state, tipLabelKey: action.key};
    case types.TREE_TOO_DATA:
      return action.controls;
    case types.TOGGLE_PANEL_DISPLAY:
      return Object.assign({}, state, {
        panelsToDisplay: action.panelsToDisplay,
        panelLayout: action.panelLayout,
        canTogglePanelLayout:
          action.panelsToDisplay.indexOf("tree") !== -1 &&
          action.panelsToDisplay.indexOf("map") !== -1
      });
    case types.NEW_COLORS: {
      const newState = Object.assign({}, state, {
        colorBy: action.colorBy,
        colorScale: action.colorScale,
        colorByConfidence: doesColorByHaveConfidence(state, action.colorBy)
      });
      if (action.scatterVariables) {
        newState.scatterVariables = action.scatterVariables;
      }
      return newState;
    }
    case types.CHANGE_GEO_RESOLUTION:
      return Object.assign({}, state, {
        geoResolution: action.data
      });
    case types.APPLY_FILTER: {
      // values arrive as array
      const filters = Object.assign({}, state.filters, {});
      filters[action.trait] = action.values;
      return Object.assign({}, state, {
        filters
      });
    }
    case types.TOGGLE_MUT_TYPE:
      return Object.assign({}, state, {
        mutType: action.data
      });
    case types.TOGGLE_TEMPORAL_CONF:
      return Object.assign({}, state, {
        temporalConfidence: Object.assign({}, state.temporalConfidence, {
          on: !state.temporalConfidence.on
        })
      });
    case types.TRIGGER_DOWNLOAD_MODAL:
      return Object.assign({}, state, {
        showDownload: true
      });
    case types.DISMISS_DOWNLOAD_MODAL:
      return Object.assign({}, state, {
        showDownload: false
      });
    case types.REMOVE_TREE_TOO:
      return Object.assign({}, state, {
        showTreeToo: undefined,
        showTangle: false,
        canTogglePanelLayout: state.panelsAvailable.indexOf("map") !== -1,
        panelsToDisplay: state.panelsAvailable.slice()
      });
    case types.TOGGLE_TANGLE:
      if (state.showTreeToo) {
        return Object.assign({}, state, { showTangle: !state.showTangle });
      }
      return state;
    case types.TOGGLE_SIDEBAR:
      return Object.assign({}, state, { sidebarOpen: action.value });
    case types.TOGGLE_LEGEND:
      return Object.assign({}, state, { legendOpen: action.value });
    case types.ADD_EXTRA_METADATA:
      for (const colorBy of Object.keys(action.newColorings)) {
        state.filters[colorBy] = [];
        state.coloringsPresentOnTree.add(colorBy);
      }
      let newState = Object.assign({}, state, { coloringsPresentOnTree: state.coloringsPresentOnTree, filters: state.filters });
      if (action.newGeoResolution && !state.panelsAvailable.includes("map")) {
        newState = {
          ...newState,
          geoResolution: action.newGeoResolution.key,
          canTogglePanelLayout: true,
          panelsAvailable: [...state.panelsAvailable, "map"],
          panelsToDisplay: [...state.panelsToDisplay, "map"]
        };
      }
      return newState;
    case types.UPDATE_VISIBILITY_AND_BRANCH_THICKNESS:
      const colorScale = Object.assign({}, state.colorScale, { visibleLegendValues: action.visibleLegendValues });
      return Object.assign({}, state, { colorScale: colorScale });
    case types.TOGGLE_TRANSMISSION_LINES:
      return Object.assign({}, state, { showTransmissionLines: action.data });

    case types.LOAD_FREQUENCIES:
      return {...state, normalizeFrequencies: action.normalizeFrequencies};
    case types.FREQUENCY_MATRIX: {
      if (Object.hasOwnProperty.call(action, "normalizeFrequencies")) {
        return Object.assign({}, state, { normalizeFrequencies: action.normalizeFrequencies });
      }
      return state;
    }
    default:
      return state;
  }
};

export default Controls;

function getInitialSidebarState() {
  return {
    sidebarOpen: window.innerWidth > controlsHiddenWidth,
    setDefault: false
  };
}
