import queryString from "query-string";
import { cloneDeep } from 'lodash';
import { numericToCalendar, calendarToNumeric } from "../util/dateHelpers";
import { reallySmallNumber, twoColumnBreakpoint, defaultColorBy, defaultGeoResolution, defaultDateRange, nucleotide_gene, strainSymbol, genotypeSymbol } from "../util/globals";
import { calcBrowserDimensionsInitialState } from "../reducers/browserDimensions";
import { getIdxMatchingLabel, calculateVisiblityAndBranchThickness } from "../util/treeVisibilityHelpers";
import { constructVisibleTipLookupBetweenTrees } from "../util/treeTangleHelpers";
import { getDefaultControlsState, shouldDisplayTemporalConfidence } from "../reducers/controls";
import { countTraitsAcrossTree, calcTotalTipsInTree } from "../util/treeCountingHelpers";
import { calcEntropyInView } from "../util/entropy";
import { treeJsonToState } from "../util/treeJsonProcessing";
import { entropyCreateState } from "../util/entropyCreateStateFromJsons";
import { determineColorByGenotypeMutType, calcNodeColor } from "../util/colorHelpers";
import { calcColorScale, createVisibleLegendValues } from "../util/colorScale";
import { computeMatrixFromRawData, checkIfNormalizableFromRawData } from "../util/processFrequencies";
import { applyInViewNodesToTree } from "../actions/tree";
import { validateScatterVariables } from "../util/scatterplotHelpers";
import { isColorByGenotype, decodeColorByGenotype, decodeGenotypeFilters, encodeGenotypeFilters } from "../util/getGenotype";
import { getTraitFromNode, getDivFromNode, collectGenotypeStates } from "../util/treeMiscHelpers";
import { collectAvailableTipLabelOptions } from "../components/controls/choose-tip-label";

export const doesColorByHaveConfidence = (controlsState, colorBy) =>
  controlsState.coloringsPresentOnTreeWithConfidence.has(colorBy);

export const getMinCalDateViaTree = (nodes, state) => {
  /* slider should be earlier than actual day */
  /* if no date, use some default dates - slider will not be visible */
  const minNumDate = getTraitFromNode(nodes[0], "num_date");
  return (minNumDate === undefined) ?
    numericToCalendar(state.dateMaxNumeric - defaultDateRange) :
    numericToCalendar(minNumDate - 0.01);
};

export const getMaxCalDateViaTree = (nodes) => {
  let maxNumDate = reallySmallNumber;
  nodes.forEach((node) => {
    const numDate = getTraitFromNode(node, "num_date");
    if (numDate !== undefined && numDate > maxNumDate) {
      maxNumDate = numDate;
    }
  });
  maxNumDate += 0.01; /* slider should be later than actual day */
  return numericToCalendar(maxNumDate);
};

/* need a (better) way to keep the queryParams all in "sync" */
const modifyStateViaURLQuery = (state, query) => {
  // console.log("modify state via URL query", query)
  if (query.l) {
    state["layout"] = query.l;
  }
  if (query.gmin) {
    state["zoomMin"] = parseInt(query.gmin, 10);
  }
  if (query.gmax) {
    state["zoomMax"] = parseInt(query.gmax, 10);
  }
  if (query.m && state.branchLengthsToDisplay === "divAndDate") {
    state["distanceMeasure"] = query.m;
  }
  if (query.z) {
    state["treeZoom"] = query.z;
  }
  if (query.c) {
    state["colorBy"] = query.c;
  }
  if (query.ci === undefined) {
    state["temporalConfidence"]["on"] = false;
  } else {
    state["temporalConfidence"]["on"] = true;
  }
  if (query.r) {
    state["geoResolution"] = query.r;
  }
  if (query.p && state.canTogglePanelLayout && (query.p === "full" || query.p === "grid")) {
    state["panelLayout"] = query.p;
  }
  if (query.tl) {
    state["tipLabelKey"] = query.tl;
  }
  if (query.d) {
    const proposed = query.d.split(",");
    state.panelsToDisplay = state.panelsAvailable.filter((n) => proposed.indexOf(n) !== -1);
    if (state.panelsToDisplay.indexOf("map") === -1 || state.panelsToDisplay.indexOf("tree") === -1) {
      state["panelLayout"] = "full";
    }
  }
  if (query.dmin) {
    state["dateMin"] = query.dmin;
    state["dateMinNumeric"] = calendarToNumeric(query.dmin);
  }
  if (query.dmax) {
    state["dateMax"] = query.dmax;
    state["dateMaxNumeric"] = calendarToNumeric(query.dmax);
  }
  for (const filterKey of Object.keys(query).filter((c) => c.startsWith('f_'))) {
    state.filters[filterKey.replace('f_', '')] = query[filterKey].split(',')
      .map((value) => ({value, active: true})); /* all filters in the URL are "active" */
  }
  if (query.s) {   // selected strains are a filter too
    state.filters[strainSymbol] = query.s.split(',').map((value) => ({value, active: true}));
  }
  if (query.gt) {
    state.filters[genotypeSymbol] = decodeGenotypeFilters(query.gt);
  }
  if (query.animate) {
    const params = query.animate.split(',');
    // console.log("start animation!", params);
    window.NEXTSTRAIN.animationStartPoint = calendarToNumeric(params[0]);
    window.NEXTSTRAIN.animationEndPoint = calendarToNumeric(params[1]);
    state.dateMin = params[0];
    state.dateMax = params[1];
    state.dateMinNumeric = calendarToNumeric(params[0]);
    state.dateMaxNumeric = calendarToNumeric(params[1]);
    state.mapAnimationShouldLoop = params[2] === "1";
    state.mapAnimationCumulative = params[3] === "1";
    state.mapAnimationDurationInMilliseconds = parseInt(params[4], 10);
    state.animationPlayPauseButton = "Pause";
  } else {
    state.animationPlayPauseButton = "Play";
  }
  if (query.branchLabel) {
    state.selectedBranchLabel = query.branchLabel;
    // do not modify the default (only the JSON can do this)
  }
  if (query.sidebar) {
    if (query.sidebar === "open") {
      state.defaults.sidebarOpen = true;
      state.sidebarOpen = true;
    } else if (query.sidebar === "closed") {
      state.defaults.sidebarOpen = false;
      state.sidebarOpen = false;
    }
  }
  if (query.legend) {
    if (query.legend === "open") {
      state.legendOpen = true;
    } else if (query.legend === "closed") {
      state.legendOpen = false;
    }
  }
  if ("onlyPanels" in query) {
    state.showOnlyPanels = true;
  }
  if (query.transmissions) {
    if (query.transmissions === "show") {
      state.showTransmissionLines = true;
    } else if (query.transmissions === "hide") {
      state.showTransmissionLines = false;
    }
  }
  /* parse queries which may modify scatterplot-like views. These will be validated before dispatch. */
  if (query.branches==="hide") state.scatterVariables.showBranches = false;
  if (query.regression==="show") state.scatterVariables.showRegression = true;
  if (query.regression==="hide") state.scatterVariables.showRegression = false;
  if (query.scatterX) state.scatterVariables.x = query.scatterX;
  if (query.scatterY) state.scatterVariables.y = query.scatterY;
  return state;
};

const restoreQueryableStateToDefaults = (state) => {
  for (const key of Object.keys(state.defaults)) {
    switch (typeof state.defaults[key]) {
      case "boolean": // fallthrough
      case "string": {
        state[key] = state.defaults[key];
        break;
      }
      case "object": { /* can't use Object.assign, must deep clone instead */
        state[key] = JSON.parse(JSON.stringify(state.defaults[key]));
        break;
      }
      default: {
        console.error("unknown typeof for default state of ", key, state.defaults[key]);
      }
    }
  }
  /* dateMin & dateMax get set to their bounds */
  state["dateMin"] = state["absoluteDateMin"];
  state["dateMax"] = state["absoluteDateMax"];
  state["dateMinNumeric"] = state["absoluteDateMinNumeric"];
  state["dateMaxNumeric"] = state["absoluteDateMaxNumeric"];
  state["zoomMax"] = undefined;
  state["zoomMin"] = undefined;

  state["panelLayout"] = calcBrowserDimensionsInitialState().width > twoColumnBreakpoint ? "grid" : "full";
  state.panelsToDisplay = state.panelsAvailable.slice();
  state.tipLabelKey = strainSymbol;
  state.scatterVariables = {};
  // console.log("state now", state);
  return state;
};

const modifyStateViaMetadata = (state, metadata) => {
  if (metadata.date_range) {
    /* this may be useful if, e.g., one were to want to display an outbreak
    from 2000-2005 (the default is the present day) */
    if (metadata.date_range.date_min) {
      state["dateMin"] = metadata.date_range.date_min;
      state["dateMinNumeric"] = calendarToNumeric(state["dateMin"]);
      state["absoluteDateMin"] = metadata.date_range.date_min;
      state["absoluteDateMinNumeric"] = calendarToNumeric(state["absoluteDateMin"]);
      state["mapAnimationStartDate"] = metadata.date_range.date_min;
    }
    if (metadata.date_range.date_max) {
      state["dateMax"] = metadata.date_range.date_max;
      state["dateMaxNumeric"] = calendarToNumeric(state["dateMax"]);
      state["absoluteDateMax"] = metadata.date_range.date_max;
      state["absoluteDateMaxNumeric"] = calendarToNumeric(state["absoluteDateMax"]);
    }
  }
  if (metadata.analysisSlider) {
    state["analysisSlider"] = {key: metadata.analysisSlider, valid: false};
  }
  if (metadata.filters) {
    /* the `meta -> filters` JSON spec should define which filters are displayed in the footer.
    Note that this UI may change, and if so then we can change this state name. */
    state.filtersInFooter = [...metadata.filters];
    /* TODO - these will be searchable => all available traits should be added and this block shifted up */
    metadata.filters.forEach((v) => {
      state.filters[v] = [];
    });
  } else {
    console.warn("JSON did not include any filters");
    state.filtersInFooter = [];
  }
  state.filters[strainSymbol] = [];
  state.filters[genotypeSymbol] = []; // this doesn't necessitate that mutations are defined
  if (metadata.displayDefaults) {
    const keysToCheckFor = ["geoResolution", "colorBy", "distanceMeasure", "layout", "mapTriplicate", "selectedBranchLabel", 'sidebar', "showTransmissionLines", "normalizeFrequencies"];
    const expectedTypes =  ["string",        "string",  "string",          "string", "boolean",       "string",              'string',  "boolean"              , "boolean"]; // eslint-disable-line

    for (let i = 0; i < keysToCheckFor.length; i += 1) {
      if (Object.hasOwnProperty.call(metadata.displayDefaults, keysToCheckFor[i])) {
        if (typeof metadata.displayDefaults[keysToCheckFor[i]] === expectedTypes[i]) { // eslint-disable-line valid-typeof
          if (keysToCheckFor[i] === "sidebar") {
            if (metadata.displayDefaults[keysToCheckFor[i]] === "open") {
              state.defaults.sidebarOpen = true;
              state.sidebarOpen = true;
            } else if (metadata.displayDefaults[keysToCheckFor[i]]=== "closed") {
              state.defaults.sidebarOpen = false;
              state.sidebarOpen = false;
            } else {
              console.error("Skipping 'display_default' for sidebar as it's not 'open' or 'closed'");
            }
          } else {
            /* most of the time if key=geoResoltion, set both state.geoResolution and state.defaults.geoResolution */
            state[keysToCheckFor[i]] = metadata.displayDefaults[keysToCheckFor[i]];
            state.defaults[keysToCheckFor[i]] = metadata.displayDefaults[keysToCheckFor[i]];
          }
        } else {
          console.error("Skipping 'display_default' for ", keysToCheckFor[i], "as it is not of type ", expectedTypes[i]);
        }
      }
    }
  } else {
    metadata.displayDefaults = {}; // allows code to rely on `displayDefaults` existing
  }

  if (metadata.panels) {
    state.panelsAvailable = metadata.panels.slice();
    state.panelsToDisplay = metadata.panels.slice();
  } else {
    /* while `metadata.panels` is required by the schema, every single dataset can display a tree, so this is a nice fallback */
    state.panelsAvailable = ["tree"];
    state.panelsToDisplay = ["tree"];
  }

  /* if we lack geoResolutions, remove map from panels to display */
  if (!metadata.geoResolutions || !metadata.geoResolutions.length) {
    state.panelsAvailable = state.panelsAvailable.filter((item) => item !== "map");
    state.panelsToDisplay = state.panelsToDisplay.filter((item) => item !== "map");
  }

  /* if we lack genome annotations, remove entropy from panels to display */
  if (!metadata.genomeAnnotations || !metadata.genomeAnnotations.nuc) {
    state.panelsAvailable = state.panelsAvailable.filter((item) => item !== "entropy");
    state.panelsToDisplay = state.panelsToDisplay.filter((item) => item !== "entropy");
  }

  /* After calculating the available panels, we check this against the display default (if that was set)
  in order to determine which panels to display. Note that URL queries are parsed after this. */
  if (metadata.displayDefaults && metadata.displayDefaults.panels && Array.isArray(metadata.displayDefaults.panels)) {
    /* remove any display defaults asked for which don't exist */
    metadata.displayDefaults.panels = metadata.displayDefaults.panels.filter((p) => state.panelsAvailable.includes(p));
    /* only show those set via display defaults */
    state.panelsToDisplay = state.panelsToDisplay.filter((p) => metadata.displayDefaults.panels.includes(p));
    /* store the display defaults for use by URL middleware */
    state.defaults.panels = metadata.displayDefaults.panels;
  } else {
    /* define "default" panels to show as all those available if not explicitly set */
    state.defaults.panels = state.panelsAvailable.slice();
  }

  /* if only map or only tree, then panelLayout must be full */
  /* note - this will be overwritten by the URL query */
  if (state.panelsAvailable.indexOf("map") === -1 || state.panelsAvailable.indexOf("tree") === -1) {
    state.panelLayout = "full";
    state.canTogglePanelLayout = false;
  }
  /* genome annotations in metadata */
  if (metadata.genomeAnnotations) {
    for (const gene of Object.keys(metadata.genomeAnnotations)) {
      state.geneLength[gene] = metadata.genomeAnnotations[gene].end - metadata.genomeAnnotations[gene].start;
      if (gene !== nucleotide_gene) {
        state.geneLength[gene] /= 3;
      }
    }
  } else {
    console.warn("JSONs did not include `genome_annotations`");
  }

  return state;
};

const modifyControlsStateViaTree = (state, tree, treeToo, colorings) => {
  state["dateMin"] = getMinCalDateViaTree(tree.nodes, state);
  state["dateMax"] = getMaxCalDateViaTree(tree.nodes);
  state.dateMinNumeric = calendarToNumeric(state.dateMin);
  state.dateMaxNumeric = calendarToNumeric(state.dateMax);

  if (treeToo) {
    const min = getMinCalDateViaTree(treeToo.nodes, state);
    const max = getMaxCalDateViaTree(treeToo.nodes);
    const minNumeric = calendarToNumeric(min);
    const maxNumeric = calendarToNumeric(max);
    if (minNumeric < state.dateMinNumeric) {
      state.dateMinNumeric = minNumeric;
      state.dateMin = min;
    }
    if (maxNumeric > state.dateMaxNumeric) {
      state.dateMaxNumeric = maxNumeric;
      state.dateMax = max;
    }
  }

  /* set absolutes */
  state["absoluteDateMin"] = state["dateMin"];
  state["absoluteDateMax"] = state["dateMax"];
  state.absoluteDateMinNumeric = calendarToNumeric(state.absoluteDateMin);
  state.absoluteDateMaxNumeric = calendarToNumeric(state.absoluteDateMax);

  /* For the colorings (defined in the JSON) we need to check whether they
  (a) actually exist on the tree and (b) have confidence values.
  TODO - this whole file should be reorganised to make things clearer.
  perhaps there's a better place to put this... */
  state.coloringsPresentOnTree = new Set();
  state.coloringsPresentOnTreeWithConfidence = new Set(); // subset of above

  let coloringsToCheck = [];
  if (colorings) {
    coloringsToCheck = Object.keys(colorings);
  }
  let [aaMuts, nucMuts] = [false, false];
  const examineNodes = function examineNodes(nodes) {
    nodes.forEach((node) => {
      /* check colorBys */
      coloringsToCheck.forEach((colorBy) => {
        if (!state.coloringsPresentOnTreeWithConfidence.has(colorBy)) {
          if (getTraitFromNode(node, colorBy, {confidence: true})) {
            state.coloringsPresentOnTreeWithConfidence.add(colorBy);
            state.coloringsPresentOnTree.add(colorBy);
          } else if (getTraitFromNode(node, colorBy)) {
            state.coloringsPresentOnTree.add(colorBy);
          }
        }
      });
      /* check mutations */
      if (node.branch_attrs && node.branch_attrs.mutations) {
        const keys = Object.keys(node.branch_attrs.mutations);
        if (keys.length > 1 || (keys.length === 1 && keys[0]!=="nuc")) aaMuts = true;
        if (keys.includes("nuc")) nucMuts = true;
      }
    });
  };
  examineNodes(tree.nodes);
  if (treeToo) examineNodes(treeToo.nodes);


  /* ensure specified mutType is indeed available */
  if (!aaMuts && !nucMuts) {
    state.mutType = null;
  } else if (state.mutType === "aa" && !aaMuts) {
    state.mutType = "nuc";
  } else if (state.mutType === "nuc" && !nucMuts) {
    state.mutType = "aa";
  }
  if (aaMuts || nucMuts) {
    state.coloringsPresentOnTree.add("gt");
  }

  /* does the tree have date information? if not, disable controls, modify view */
  const numDateAtRoot = getTraitFromNode(tree.nodes[0], "num_date") !== undefined;
  const divAtRoot = getDivFromNode(tree.nodes[0]) !== undefined;
  state.branchLengthsToDisplay = (numDateAtRoot && divAtRoot) ? "divAndDate" :
    numDateAtRoot ? "dateOnly" :
      "divOnly";

  /* if branchLengthsToDisplay is "divOnly", force to display by divergence
   * if branchLengthsToDisplay is "dateOnly", force to display by date
   */
  state.distanceMeasure = state.branchLengthsToDisplay === "divOnly" ? "div" :
    state.branchLengthsToDisplay === "dateOnly" ? "num_date" : state.distanceMeasure;

  /* if clade is available as a branch label, then set this as the "default". This
  is largely due to historical reasons. Note that it *can* and *will* be overridden
  by JSON display_defaults and URL query */
  if (tree.availableBranchLabels.indexOf("clade") !== -1) {
    state.defaults.selectedBranchLabel = "clade";
    state.selectedBranchLabel = "clade";
  }

  state.temporalConfidence = getTraitFromNode(tree.nodes[0], "num_date", {confidence: true}) ?
    {exists: true, display: true, on: false} :
    {exists: false, display: false, on: false};
  return state;
};

const checkAndCorrectErrorsInState = (state, metadata, query, tree, viewingNarrative) => {
  /* want to check that the (currently set) colorBy (state.colorBy) is valid,
   * and fall-back to an available colorBy if not
   */
  if (!metadata.colorings) {
    metadata.colorings = {};
  }
  const fallBackToDefaultColorBy = () => {
    const availableNonGenotypeColorBys = Object.keys(metadata.colorings)
      .filter((colorKey) => colorKey !== "gt");
    if (metadata.displayDefaults && metadata.displayDefaults.colorBy && availableNonGenotypeColorBys.indexOf(metadata.displayDefaults.colorBy) !== -1) {
      console.warn("colorBy falling back to", metadata.displayDefaults.colorBy);
      state.colorBy = metadata.displayDefaults.colorBy;
      state.defaults.colorBy = metadata.displayDefaults.colorBy;
    } else if (availableNonGenotypeColorBys.length) {
      if (availableNonGenotypeColorBys.indexOf(defaultColorBy) !== -1) {
        state.colorBy = defaultColorBy;
        state.defaults.colorBy = defaultColorBy;
      } else {
        console.error("Error detected trying to set colorBy to", state.colorBy, "falling back to", availableNonGenotypeColorBys[0]);
        state.colorBy = availableNonGenotypeColorBys[0];
        state.defaults.colorBy = availableNonGenotypeColorBys[0];
      }
    } else {
      console.error("Error detected trying to set colorBy to", state.colorBy, " as there are no color options defined in the JSONs!");
      state.colorBy = "none";
      state.defaults.colorBy = "none";
    }
    delete query.c;
  };
  if (isColorByGenotype(state.colorBy)) {
    /* Check that the genotype is valid with the current data */
    if (!decodeColorByGenotype(state.colorBy, state.geneLength)) {
      fallBackToDefaultColorBy();
    }
  } else if (Object.keys(metadata.colorings).indexOf(state.colorBy) === -1) {
    /* if it's a _non_ genotype colorBy AND it's not a valid option, fall back to the default */
    fallBackToDefaultColorBy();
  }

  /* zoom */
  if (state.zoomMax > state["absoluteZoomMax"]) { state.zoomMax = state["absoluteZoomMax"]; }
  if (state.zoomMin < state["absoluteZoomMin"]) { state.zoomMin = state["absoluteZoomMin"]; }
  if (state.zoomMin > state.zoomMax) {
    const tempMin = state.zoomMin;
    state.zoomMin = state.zoomMax;
    state.zoomMax = tempMin;
  }

  /* colorBy confidence */
  state["colorByConfidence"] = doesColorByHaveConfidence(state, state["colorBy"]);

  /* distanceMeasure */
  if (["div", "num_date"].indexOf(state["distanceMeasure"]) === -1) {
    state["distanceMeasure"] = "num_date";
    console.error("Error detected. Setting distanceMeasure to ", state["distanceMeasure"]);
  }

  /* geoResolutions */
  if (metadata.geoResolutions) {
    const availableGeoResultions = metadata.geoResolutions.map((i) => i.key);
    if (availableGeoResultions.indexOf(state["geoResolution"]) === -1) {
      /* fallbacks: JSON defined default, then hardocded default, then any available */
      if (metadata.displayDefaults && metadata.displayDefaults.geoResolution && availableGeoResultions.indexOf(metadata.displayDefaults.geoResolution) !== -1) {
        state.geoResolution = metadata.displayDefaults.geoResolution;
      } else if (availableGeoResultions.indexOf(defaultGeoResolution) !== -1) {
        state.geoResolution = defaultGeoResolution;
      } else {
        state.geoResolution = availableGeoResultions[0];
      }
      console.error("Error detected. Setting geoResolution to ", state.geoResolution);
      delete query.r; // no-op if query.r doesn't exist
    }
  } else {
    console.warn("JSONs did not include `geoResolutions`");
  }

  /* show label */
  if (state.selectedBranchLabel && !tree.availableBranchLabels.includes(state.selectedBranchLabel)) {
    console.error("Can't set selected branch label to ", state.selectedBranchLabel);
    state.selectedBranchLabel = "none";
    state.defaults.selectedBranchLabel = "none";
  }

  /* check tip label is valid. We use the function which generates the options for the dropdown here */
  if (!collectAvailableTipLabelOptions(metadata.colorings).map((o) => o.value).includes(state.tipLabelKey)) {
    console.error("Can't set selected tip label to ", state.tipLabelKey);
    state.tipLabelKey = strainSymbol;
  }

  /* temporalConfidence */
  if (shouldDisplayTemporalConfidence(state.temporalConfidence.exists, state.distanceMeasure, state.layout)) {
    state.temporalConfidence.display = true;
  } else {
    state.temporalConfidence.display = false;
    state.temporalConfidence.on = false;
    delete query.ci; // rm ci from the query if it doesn't apply
  }

  /* if colorBy is a genotype then we need to set mutType */
  if (state.colorBy) {
    const maybeMutType = determineColorByGenotypeMutType(state.colorBy);
    if (maybeMutType) {
      state.mutType = maybeMutType;
    }
  }

  /* ensure selected filters (via the URL query) are valid. If not, modify state + URL. */
  const filterNames = Object.keys(state.filters).filter((filterName) => state.filters[filterName].length);
  const stateCounts = countTraitsAcrossTree(tree.nodes, filterNames, false, true);
  filterNames.forEach((filterName) => {
    const validItems = state.filters[filterName]
      .filter((item) => stateCounts[filterName].has(item.value));
    state.filters[filterName] = validItems;
    if (!validItems.length) {
      delete query[`f_${filterName}`];
    } else {
      query[`f_${filterName}`] = validItems.map((x) => x.value).join(",");
    }
  });
  if (state.filters[strainSymbol]) {
    const validNames = tree.nodes.map((n) => n.name);
    state.filters[strainSymbol] = state.filters[strainSymbol]
      .filter((strainFilter) => validNames.includes(strainFilter.value));
    query.s = state.filters[strainSymbol].map((f) => f.value).join(",");
    if (!query.s) delete query.s;
  }
  if (state.filters[genotypeSymbol]) {
    const observedMutations = collectGenotypeStates(tree.nodes);
    state.filters[genotypeSymbol] = state.filters[genotypeSymbol]
      .filter((f) => observedMutations.has(f.value));
    query.gt = encodeGenotypeFilters(state.filters[genotypeSymbol]);
  }

  /* can we display branch length by div or num_date? */
  if (query.m && state.branchLengthsToDisplay !== "divAndDate") {
    delete query.m;
  }

  if (!(query.sidebar === "open" || query.sidebar === "closed")) {
    delete query.sidebar; // invalid value
  }
  if (viewingNarrative) {
    // We must prevent a narrative closing the sidebar, either via a JSON display_default
    // or a URL query anywhere within the narrative.
    if ("sidebarOpen" in state.defaults) delete state.defaults.sidebarOpen;
    state.sidebarOpen=true;
  }

  /* if we are starting in a scatterplot-like layout, we need to ensure we have `scatterVariables`
  If not, we deliberately don't instantiate them, so that they are instantiated when first
  triggering a scatterplot, thus defaulting to the colorby in use at that time */
  // todo: these should be JSON definable (via display_defaults)
  if (state.layout==="scatter" || state.layout==="clock") {
    state.scatterVariables = validateScatterVariables(
      state, metadata, tree, state.layout==="clock"
    );
    if (query.scatterX && query.scatterX!==state.scatterVariables.x) delete query.scatterX;
    if (query.scatterY && query.scatterY!==state.scatterVariables.y) delete query.scatterY;
    if (state.layout==="clock") {
      delete query.scatterX;
      delete query.scatterY;
    }
  } else {
    state.scatterVariables = {};
    delete query.scatterX;
    delete query.scatterY;
    delete query.regression;
    delete query.branches;
  }

  return state;
};

const modifyTreeStateVisAndBranchThickness = (oldState, zoomSelected, controlsState, dispatch) => {
  /* calculate new branch thicknesses & visibility */
  let newIdxRoot = oldState.idxOfInViewRootNode;
  if (zoomSelected) {
    // Check and fix old format 'clade=B' - in this case selectionClade is just 'B'
    const [labelName, labelValue] = zoomSelected.split(":");
    const cladeSelectedIdx = getIdxMatchingLabel(oldState.nodes, labelName, labelValue, dispatch);
    oldState.selectedClade = zoomSelected;
    newIdxRoot = applyInViewNodesToTree(cladeSelectedIdx, oldState);
  } else {
    oldState.selectedClade = undefined;
    newIdxRoot = applyInViewNodesToTree(0, oldState);
  }
  const visAndThicknessData = calculateVisiblityAndBranchThickness(
    oldState,
    controlsState,
    {dateMinNumeric: controlsState.dateMinNumeric, dateMaxNumeric: controlsState.dateMaxNumeric}
  );

  const newState = Object.assign({}, oldState, visAndThicknessData);
  newState.stateCountAttrs = Object.keys(controlsState.filters);
  newState.idxOfInViewRootNode = newIdxRoot;
  newState.visibleStateCounts = countTraitsAcrossTree(newState.nodes, newState.stateCountAttrs, newState.visibility, true);
  newState.totalStateCounts   = countTraitsAcrossTree(newState.nodes, newState.stateCountAttrs, false,               true); // eslint-disable-line

  return newState;
};

const removePanelIfPossible = (panels, name) => {
  const idx = panels.indexOf(name);
  if (idx !== -1) {
    panels.splice(idx, 1);
  }
};

const modifyControlsViaTreeToo = (controls, name) => {
  controls.showTreeToo = name;
  controls.showTangle = true;
  controls.layout = "rect"; /* must be rectangular for two trees */
  controls.panelsToDisplay = controls.panelsToDisplay.slice();
  removePanelIfPossible(controls.panelsToDisplay, "map");
  removePanelIfPossible(controls.panelsToDisplay, "entropy");
  removePanelIfPossible(controls.panelsToDisplay, "frequencies");
  controls.canTogglePanelLayout = false;
  controls.panelLayout = "full";
  return controls;
};

/**
 * The v2 JSON spec defines colorings as a list, so that order is guaranteed.
 * Prior to this, we used a dict, where key insertion order is (guaranteed? essentially always?)
 * to be respected. By simply converting it back to a dict, all the auspice
 * code may continue to work. This should be attended to in the future.
 * @param {obj} coloringsList list of objects
 * @returns {obj} a dictionary representation, where the "key" property of each element
 * in the list has become a property of the object
 */
const convertColoringsListToDict = (coloringsList) => {
  const colorings = {};
  coloringsList.forEach((coloring) => {
    colorings[coloring.key] = { ...coloring };
    delete colorings[coloring.key].key;
  });
  return colorings;
};

/**
 *
 * A lot of this is simply changing augur's snake_case to auspice's camelCase
 */
const createMetadataStateFromJSON = (json) => {
  const metadata = {};
  if (json.meta.colorings) {
    metadata.colorings = convertColoringsListToDict(json.meta.colorings);
  }
  metadata.title = json.meta.title;
  metadata.updated = json.meta.updated;
  if (json.meta.description) {
    metadata.description = json.meta.description;
  }
  if (json.version) {
    metadata.version = json.version;
  }
  if (json.meta.maintainers) {
    metadata.maintainers = json.meta.maintainers;
  }
  if (json.meta.build_url) {
    metadata.buildUrl = json.meta.build_url;
  }
  if (json.meta.genome_annotations) {
    metadata.genomeAnnotations = json.meta.genome_annotations;
  }
  if (json.meta.data_provenance) {
    metadata.dataProvenance = json.meta.data_provenance;
  }
  if (json.meta.filters) {
    metadata.filters = json.meta.filters;
  }
  if (json.meta.panels) {
    metadata.panels = json.meta.panels;
  }
  if (json.meta.display_defaults) {
    metadata.displayDefaults = {};
    const jsonKeyToAuspiceKey = {
      color_by: "colorBy",
      geo_resolution: "geoResolution",
      distance_measure: "distanceMeasure",
      branch_label: "selectedBranchLabel",
      map_triplicate: "mapTriplicate",
      layout: "layout",
      language: "language",
      sidebar: "sidebar",
      panels: "panels",
      transmission_lines: "showTransmissionLines"
    };
    for (const [jsonKey, auspiceKey] of Object.entries(jsonKeyToAuspiceKey)) {
      if (Object.prototype.hasOwnProperty.call(json.meta.display_defaults, jsonKey)) {
        metadata.displayDefaults[auspiceKey] = json.meta.display_defaults[jsonKey];
      }
    }
  }
  if (json.meta.geo_resolutions) {
    metadata.geoResolutions = json.meta.geo_resolutions;
  }


  if (Object.prototype.hasOwnProperty.call(metadata, "loaded")) {
    console.error("Metadata JSON must not contain the key \"loaded\". Ignoring.");
  }
  metadata.loaded = true;
  return metadata;
};

export const getNarrativePageFromQuery = (query, narrative) => {
  let n = parseInt(query.n, 10) || 0;
  /* If the query has defined a block which doesn't exist then default to n=0 */
  if (n >= narrative.length) {
    console.warn(`Attempted to go to narrative page ${n} which doesn't exist`);
    n=0;
  }
  return n;
};

export const createStateFromQueryOrJSONs = ({
  json = false, /* raw json data - completely nuke existing redux state */
  secondTreeDataset = false,
  oldState = false, /* existing redux state (instead of jsons) */
  narrativeBlocks = false, /* if in a narrative this argument is set */
  mainTreeName = false,
  secondTreeName = false,
  query,
  dispatch
}) => {
  let tree, treeToo, entropy, controls, metadata, narrative, frequencies;
  /* first task is to create metadata, entropy, controls & tree partial state */
  if (json) {
    /* create metadata state */
    metadata = createMetadataStateFromJSON(json);
    /* entropy state */
    entropy = entropyCreateState(metadata.genomeAnnotations);
    /* new tree state(s) */
    tree = treeJsonToState(json.tree);
    tree.debug = "LEFT";
    tree.name = mainTreeName;
    metadata.mainTreeNumTips = calcTotalTipsInTree(tree.nodes);
    if (secondTreeDataset) {
      treeToo = treeJsonToState(secondTreeDataset.tree);
      treeToo.debug = "RIGHT";
      treeToo.name = secondTreeName;
      /* TODO: calc & display num tips in 2nd tree */
      // metadata.secondTreeNumTips = calcTotalTipsInTree(treeToo.nodes);
    }

    /* new controls state - don't apply query yet (or error check!) */
    controls = getDefaultControlsState();
    controls = modifyControlsStateViaTree(controls, tree, treeToo, metadata.colorings);
    controls = modifyStateViaMetadata(controls, metadata);
    controls["absoluteZoomMin"] = 0;
    controls["absoluteZoomMax"] = entropy.lengthSequence;
  } else if (oldState) {
    /* creating deep copies avoids references to (nested) objects remaining the same which
    can affect props comparisons. Due to the size of some of the state, we only do this selectively */
    controls = cloneDeep(oldState.controls);
    entropy = {...oldState.entropy};
    tree = {...oldState.tree};
    treeToo = {...oldState.treeToo};
    metadata = {...oldState.metadata};
    frequencies = {...oldState.frequencies};
    controls = restoreQueryableStateToDefaults(controls);
  }

  /* For the creation of state, we want to parse out URL query parameters
  (e.g. ?c=country means we want to color-by country) and modify the state
  accordingly. For narratives, we _don't_ display these in the URL, instead
  only displaying the page number (e.g. ?n=3), but we can look up what (hidden)
  URL query this page defines via this information */
  let narrativeSlideIdx;
  if (narrativeBlocks) {
    narrative = narrativeBlocks;
    narrativeSlideIdx = getNarrativePageFromQuery(query, narrative);
    /* replace the query with the information which can guide the view */
    query = queryString.parse(narrative[narrativeSlideIdx].query); // eslint-disable-line no-param-reassign
  }

  controls = modifyStateViaURLQuery(controls, query);

  /* certain narrative slides prescribe the main panel to simply render narrative-provided markdown content */
  if (narrativeBlocks && narrative[narrativeSlideIdx].mainDisplayMarkdown) {
    controls.panelsToDisplay = ["MainDisplayMarkdown"];
  }

  const viewingNarrative = (narrativeBlocks || (oldState && oldState.narrative.display));
  controls = checkAndCorrectErrorsInState(controls, metadata, query, tree, viewingNarrative); /* must run last */


  /* calculate colours if loading from JSONs or if the query demands change */
  if (json || controls.colorBy !== oldState.controls.colorBy) {
    const colorScale = calcColorScale(controls.colorBy, controls, tree, treeToo, metadata);
    const nodeColors = calcNodeColor(tree, colorScale);
    controls.colorScale = colorScale;
    controls.colorByConfidence = doesColorByHaveConfidence(controls, controls.colorBy);
    tree.nodeColorsVersion = colorScale.version;
    tree.nodeColors = nodeColors;
  }

  /* parse the query.label / query.clade */
  if (query.clade) {
    if (!query.label && query.clade !== "root") {
      query.label = `clade:${query.clade}`;
    }
    delete query.clade;
  }
  if (query.label) {
    if (!query.label.includes(":")) {
      console.error("Defined a label without ':' separator.");
      delete query.label;
    }
    if (!tree.availableBranchLabels.includes(query.label.split(":")[0])) {
      console.error(`Label name ${query.label.split(":")[0]} doesn't exist`);
      delete query.label;
    }
  }

  /* if query.label is undefined then we intend to zoom to the root */
  tree = modifyTreeStateVisAndBranchThickness(tree, query.label, controls, dispatch);

  if (treeToo && treeToo.loaded) {
    treeToo.nodeColorsVersion = tree.nodeColorsVersion;
    treeToo.nodeColors = calcNodeColor(treeToo, controls.colorScale);
    treeToo = modifyTreeStateVisAndBranchThickness(treeToo, undefined, controls, dispatch);
    controls = modifyControlsViaTreeToo(controls, treeToo.name);
    treeToo.tangleTipLookup = constructVisibleTipLookupBetweenTrees(tree.nodes, treeToo.nodes, tree.visibility, treeToo.visibility);
  }

  /* we can only calculate which legend items we wish to display _after_ the visibility has been calculated */
  controls.colorScale.visibleLegendValues = createVisibleLegendValues({
    colorBy: controls.colorBy,
    scaleType: controls.colorScale.scaleType,
    genotype: controls.colorScale.genotype,
    legendValues: controls.colorScale.legendValues,
    treeNodes: tree.nodes,
    treeTooNodes: treeToo ? treeToo.nodes : undefined,
    visibility: tree.visibility,
    visibilityToo: treeToo ? treeToo.visibilityToo : undefined
  });

  /* calculate entropy in view */
  if (entropy.loaded) {
    const [entropyBars, entropyMaxYVal] = calcEntropyInView(tree.nodes, tree.visibility, controls.mutType, entropy.geneMap, entropy.showCounts);
    entropy.bars = entropyBars;
    entropy.maxYVal = entropyMaxYVal;
    entropy.zoomMax = controls["zoomMax"];
    entropy.zoomMin = controls["zoomMin"];
    entropy.zoomCoordinates = [controls["zoomMin"], controls["zoomMax"]];
  }

  /* update frequencies if they exist (not done for new JSONs) */
  if (frequencies && frequencies.loaded) {
    frequencies.version++;

    const allowNormalization = checkIfNormalizableFromRawData(
      frequencies.data,
      frequencies.pivots,
      tree.nodes,
      tree.visibility
    );

    if (!allowNormalization) {
      controls.normalizeFrequencies = false;
    }

    frequencies.matrix = computeMatrixFromRawData(
      frequencies.data,
      frequencies.pivots,
      tree.nodes,
      tree.visibility,
      controls.colorScale,
      controls.colorBy,
      controls.normalizeFrequencies
    );
  }

  /* if narratives then switch the query back to ?n=<SLIDE> for display */
  if (narrativeBlocks) query = {n: narrativeSlideIdx}; // eslint-disable-line no-param-reassign

  return {tree, treeToo, metadata, entropy, controls, narrative, frequencies, query};
};

export const createTreeTooState = ({
  treeTooJSON, /* raw json data */
  oldState,
  originalTreeUrl,
  secondTreeUrl, /* treeToo URL */
  dispatch
}) => {
  /* TODO: reconsile choices (filters, colorBys etc) with this new tree */
  /* TODO: reconcile query with visibility etc */
  let controls = oldState.controls;
  const tree = Object.assign({}, oldState.tree);
  tree.name = originalTreeUrl;
  let treeToo = treeJsonToState(treeTooJSON);
  treeToo.name = secondTreeUrl;
  treeToo.debug = "RIGHT";
  controls = modifyControlsStateViaTree(controls, tree, treeToo, oldState.metadata.colorings);
  controls = modifyControlsViaTreeToo(controls, secondTreeUrl);
  treeToo = modifyTreeStateVisAndBranchThickness(treeToo, undefined, controls, dispatch);

  /* calculate colours if loading from JSONs or if the query demands change */
  const colorScale = calcColorScale(controls.colorBy, controls, tree, treeToo, oldState.metadata);
  const nodeColors = calcNodeColor(treeToo, colorScale);
  tree.nodeColors = calcNodeColor(tree, colorScale); // also update main tree's colours
  tree.nodeColorsVersion++;

  controls.colorScale = colorScale;
  controls.colorByConfidence = doesColorByHaveConfidence(controls, controls.colorBy);
  treeToo.nodeColorsVersion = colorScale.version;
  treeToo.nodeColors = nodeColors;

  treeToo.tangleTipLookup = constructVisibleTipLookupBetweenTrees(
    tree.nodes, treeToo.nodes, tree.visibility, treeToo.visibility
  );

  return {tree, treeToo, controls};
};
