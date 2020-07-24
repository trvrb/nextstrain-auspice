import queryString from "query-string";
import * as types from "../actions/types";
import { numericToCalendar } from "../util/dateHelpers";
import { shouldDisplayTemporalConfidence } from "../reducers/controls";

/**
 * This middleware acts to keep the app state and the URL query state in sync by
 * intercepting actions and updating the URL accordingly. Thus, in theory, this
 * middleware can be disabled and the app will still work as expected.
 *
 * The only modification of redux state by this app is (potentially) an action
 * of type types.UPDATE_PATHNAME which is used to "save" the current pathname
 * so we can diff against a new one.
 *
 * This is the way by which the URL updates (e.g. when the server auto-completes
 * a URL from /flu -> /flu/seasonal/h3n2/ha/3y, when you change the color-by,
 * or when you change dataset via the dropdowns)
 *
 * @param {store} store: a Redux store
 */
export const changeURLMiddleware = (store) => (next) => (action) => {
  const state = store.getState(); // this is "old" state, i.e. before the reducers have updated by this action
  const result = next(action); // send action to other middleware / reducers
  // if (action.dontModifyURL !== undefined) {
  //   console.log("changeURL middleware skipped")
  //   return result;
  // }

  /* starting URL values & flags */
  let query = queryString.parse(window.location.search);
  let pathname = window.location.pathname;

  /* first switch: query change */
  switch (action.type) {
    case types.CLEAN_START: // fallthrough
    case types.URL_QUERY_CHANGE_WITH_COMPUTED_STATE: // fallthrough
    case types.CHANGE_URL_QUERY_BUT_NOT_REDUX_STATE:
      query = action.query;
      if (query.n === 0) delete query.n;
      if (query.tt) delete query.tt;
      break;
    case types.CHANGE_BRANCH_LABEL:
      query.branchLabel = state.controls.defaults.selectedBranchLabel === action.value ?
        undefined :
        action.value;
      break;
    case types.CHANGE_ZOOM:
      /* entropy panel genome zoom coordinates */
      query.gmin = action.zoomc[0] === state.controls.absoluteZoomMin ? undefined : action.zoomc[0];
      query.gmax = action.zoomc[1] >= state.controls.absoluteZoomMax ? undefined : action.zoomc[1];
      break;
    case types.NEW_COLORS:
      query.c = action.colorBy === state.controls.defaults.colorBy ? undefined : action.colorBy;
      break;
    case types.TOGGLE_TEMPORAL_CONF:
      if ("ci" in query) {
        query.ci = undefined;
      } else {
        // We have to use null here to put "ci" in the query without an "=" after it and a value, i.e. to treat it as a boolean without having "=true"
        query.ci = null;
      }
      break;
    case types.APPLY_FILTER: {
      query[`f_${action.trait}`] = action.values.join(',');
      break;
    }
    case types.CHANGE_LAYOUT: {
      query.l = action.data === state.controls.defaults.layout ? undefined : action.data;
      if (!shouldDisplayTemporalConfidence(state.controls.temporalConfidence.exists, state.controls.distanceMeasure, query.l)) {
        query.ci = undefined;
      }
      break;
    }
    case types.CHANGE_GEO_RESOLUTION: {
      query.r = action.geoResolution === state.controls.defaults.geoResolution ? undefined : action.geoResolution;
    }
    // fall through -- we also want to manipulate the `showNetwork` query when we change resolutions
    case types.CHANGE_MAP_DISPLAY_TYPE: {
      if (action.mapDisplayTypesAvailable.length !== 1 && action.mapDisplayType === "network") {
        query.showNetwork = null; // `null` places it in the URL query without a value
      } else {
        query.showNetwork = undefined;
      }
      break;
    }
    case types.TOGGLE_TRANSMISSION_LINES: {
      if (action.data === state.controls.defaults.showTransmissionLines) query.transmissions = undefined;
      else query.transmissions = action.data ? 'show' : 'hide';
      break;
    }
    case types.CHANGE_LANGUAGE: {
      query.lang = action.data === state.general.defaults.language ? undefined : action.data;
      break;
    }
    case types.CHANGE_DISTANCE_MEASURE: {
      query.m = action.data === state.controls.defaults.distanceMeasure ? undefined : action.data;
      if (!shouldDisplayTemporalConfidence(state.controls.temporalConfidence.exists, query.m, state.controls.layout)) {
        query.ci = undefined;
      }
      break;
    }
    case types.CHANGE_PANEL_LAYOUT: {
      query.p = action.notInURLState === true ? undefined : action.data;
      break;
    }
    case types.TOGGLE_SIDEBAR: {
      // we never add this to the URL on purpose -- it should be manually set as it specifies a world
      // where resizes can not open / close the sidebar. The exception is if it's toggled, we
      // remove it from the URL query, as it's no longer valid to call it open if it's closed!
      if ("sidebar" in query) {
        query.sidebar = undefined;
      }
      break;
    }
    case types.TOGGLE_LEGEND: {
      // we treat this the same as sidebar above -- it can only be added to the URL manually
      if ("legend" in query) {
        query.legend = undefined;
      }
      break;
    }
    case types.TOGGLE_PANEL_DISPLAY: {
      /* check this against the defaults set by the dataset (and this default is all available panels if not specifically set) */
      if (
        state.controls.defaults.panels.length===action.panelsToDisplay.length &&
        state.controls.defaults.panels.filter((p) => !action.panelsToDisplay.includes(p)).length===0
      ) {
        query.d = undefined;
      } else {
        query.d = action.panelsToDisplay.join(",");
      }
      query.p = action.panelLayout;
      break;
    }
    case types.CHANGE_DATES_VISIBILITY_THICKNESS: {
      if (state.controls.animationPlayPauseButton === "Pause") { // animation in progress - no dates in URL
        query.dmin = undefined;
        query.dmax = undefined;
      } else {
        query.dmin = action.dateMin === state.controls.absoluteDateMin ? undefined : action.dateMin;
        query.dmax = action.dateMax === state.controls.absoluteDateMax ? undefined : action.dateMax;
      }
      break;
    }
    case types.UPDATE_VISIBILITY_AND_BRANCH_THICKNESS: {
      query.s = action.selectedStrain ? action.selectedStrain : undefined;
      query.label = action.cladeName ? action.cladeName : undefined;
      break;
    }
    case types.MAP_ANIMATION_PLAY_PAUSE_BUTTON:
      if (action.data === "Play") { // animation stopping - restore dates in URL
        query.animate = undefined;
        query.dmin = state.controls.dateMin === state.controls.absoluteDateMin ? undefined : state.controls.dateMin;
        query.dmax = state.controls.dateMax === state.controls.absoluteDateMax ? undefined : state.controls.dateMax;
      }
      break;
    case types.MIDDLEWARE_ONLY_ANIMATION_STARTED:
      /* animation started - format: start bound, end bound, loop 0|1, cumulative 0|1, speed in ms */
      const a = numericToCalendar(window.NEXTSTRAIN.animationStartPoint);
      const b = numericToCalendar(window.NEXTSTRAIN.animationEndPoint);
      const c = state.controls.mapAnimationShouldLoop ? "1" : "0";
      const d = state.controls.mapAnimationCumulative ? "1" : "0";
      const e = state.controls.mapAnimationDurationInMilliseconds;
      query.animate = `${a},${b},${c},${d},${e}`;
      break;
    case types.PAGE_CHANGE:
      if (action.query) {
        query = action.query;
      } else if (action.displayComponent !== state.general.displayComponent) {
        query = {};
      }
      break;
    case types.TOGGLE_NARRATIVE: {
      if (action.display === true) {
        query = {n: state.narrative.blockIdx};
      }
      break;
    }
    default:
      break;
  }

  /* second switch: path change */
  switch (action.type) {
    case types.CLEAN_START:
      if (action.pathnameShouldBe && !action.narrative) {
        pathname = action.pathnameShouldBe;
      }
      /* we also double check that if there are 2 trees both are represented
      in the URL */
      if (action.tree.name && action.treeToo && action.treeToo.name) {
        const treeUrlShouldBe = `${action.tree.name}:${action.treeToo.name}`;
        if (!window.location.pathname.includes(treeUrlShouldBe)) {
          pathname = treeUrlShouldBe;
        }
      }
      break;
    case types.CHANGE_URL_QUERY_BUT_NOT_REDUX_STATE: {
      if (action.pathname) pathname = action.pathname;
      break;
    }
    case types.TOGGLE_NARRATIVE: {
      if (action.display === true) {
        pathname = state.narrative.pathname;
      }
      break;
    }
    case types.PAGE_CHANGE:
      /* desired behaviour depends on the displayComponent selected... */
      if (action.displayComponent === "main" || action.displayComponent === "datasetLoader" || action.displayComponent === "splash") {
        pathname = action.path || pathname;
      } else if (pathname.startsWith(`/${action.displayComponent}`)) {
        // leave the pathname alone!
      } else {
        // fallthrough
        pathname = action.displayComponent;
      }
      break;
    case types.REMOVE_TREE_TOO: {
      pathname = pathname.split(":")[0];
      break;
    }
    case types.TREE_TOO_DATA: {
      const treeUrl = action.tree.name;
      const secondTreeUrl = action.treeToo.name;
      pathname = treeUrl.concat(":", secondTreeUrl);
      break;
    }
    default:
      break;
  }

  Object.keys(query).filter((q) => query[q] === "").forEach((k) => delete query[k]);
  let search = queryString.stringify(query).replace(/%2C/g, ',').replace(/%2F/g, '/').replace(/%3A/g, ':');
  if (search) {search = "?" + search;}
  if (!pathname.startsWith("/")) {pathname = "/" + pathname;}

  /* now that we have determined our desired pathname & query we modify the URL */
  if (pathname !== window.location.pathname || search !== window.location.search) {
    let newURLString = pathname;
    if (search) {newURLString += search;}
    if (action.pushState) {
      window.history.pushState({}, "", newURLString);
    } else {
      window.history.replaceState({}, "", newURLString);
    }
    next({type: types.UPDATE_PATHNAME, pathname: pathname});
  } else if (pathname !== state.general.pathname && action.type === types.PAGE_CHANGE) {
    next({type: types.UPDATE_PATHNAME, pathname: pathname});
  }

  return result;
};
