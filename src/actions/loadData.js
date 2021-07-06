import queryString from "query-string";
import * as types from "./types";
import { getServerAddress } from "../util/globals";
import { goTo404 } from "./navigation";
import { createStateFromQueryOrJSONs, createTreeTooState, getNarrativePageFromQuery } from "./recomputeReduxState";
import { loadFrequencies } from "./frequencies";
import { fetchJSON, fetchWithErrorHandling } from "../util/serverInteraction";
import { warningNotification, errorNotification } from "./notifications";
import { hasExtension, getExtension } from "../util/extensions";
import { parseMarkdownNarrativeFile } from "../util/parseNarrative";
import { NoContentError } from "../util/exceptions";
import { parseMarkdown } from "../util/parseMarkdown";
import { updateColorByWithRootSequenceData } from "../actions/colors";
import { exception } from "react-ga";

/**
 * Sends a GET request to the `/charon` web API endpoint requesting data.
 *
 * If the request is successful then the `Response` object is returned.
 * Note that a redirected response can still be successful.
 *
 * Unsuccessful responses result in an `Error` being thrown.
 * If the response is 204 then a `NoContentError` is thrown.
 *
 * @param {String} prefix: the main dataset information pertaining to the query,
 *  e.g. 'flu'
 * @param {Object} additionalQueries: additional information to be parsed as a
 *  query string such as `type` (`String`) or `narrative` (`Boolean`).
 */
const getDatasetFromCharon = async (prefix, {type, narrative=false}={}) => {
  let path = `${getServerAddress()}/${narrative?"getNarrative":"getDataset"}`;
  path += `?prefix=${prefix}`;
  if (type) path += `&type=${type}`;
  return await fetchWithErrorHandling(path);
};

/**
 * Requests data from a hardcoded web API endpoint.
 * Throws an `Error` if the response is not successful.
 *
 * Returns a `Promise` containing the `Response` object. JSON data must be
 * accessed from the `Response` object using the `.json()` method.
 *
 * Note: we currently expect a single dataset to be present in "hardcodedDataPaths".
 * This may be extended to multiple in the future...
 *
 * @param {String} prefix: the main dataset information pertaining to the query,
 *  e.g. 'flu'
 * @param {Object} additionalQueries: additional information to be parsed as a
 *  query string such as `type` (`String`) or `narrative` (`Boolean`).
 */
const getHardcodedData = async (prefix, {type="mainJSON"}={}) => {
  const datapaths = getExtension("hardcodedDataPaths");
  return await fetchWithErrorHandling(datapaths[type]);
};

const getDataset = hasExtension("hardcodedDataPaths") ? getHardcodedData : getDatasetFromCharon;

/**
 * given a url, which dataset fetches should be made?
 * If a second tree is defined - e.g.
 * `flu/seasonal/h3n2/ha/2y:flu/seasonal/h3n2/na/2y`.
 * then we want to make two fetches - one for
 * `flu/seasonal/h3n2/ha/2y` and one for `flu/seasonal/h3n2/na/2y`.
 *
 * @returns {Array} [0] {string} url, modified as needed to represent main dataset
 *                  [1] {string | undefined} secondTreeUrl, if applicable
 */
export const collectDatasetFetchUrls = (url) => {
  let secondTreeUrl;
  if (url.includes(":")) {
    const parts = url.replace(/^\//, '')
      .replace(/\/$/, '')
      .split(":");
    url = parts[0]; // eslint-disable-line no-param-reassign
    secondTreeUrl = parts[1];
  }
  if (url.startsWith('/')) url = url.slice(1); // eslint-disable-line no-param-reassign
  if (secondTreeUrl && secondTreeUrl.startsWith('/')) {
    secondTreeUrl = secondTreeUrl.slice(1); // eslint-disable-line no-param-reassign
  }
  return [url, secondTreeUrl];
};

export const loadSecondTree = (secondTreeUrl, firstTreeUrl) => async (dispatch, getState) => {
  let secondJson;
  try {
    secondJson = await getDataset(secondTreeUrl)
      .then((res) => res.json());
  } catch (err) {
    console.error("Failed to fetch additional tree", err.message);
    dispatch(warningNotification({message: "Failed to fetch second tree"}));
    return;
  }
  const oldState = getState();
  const newState = createTreeTooState({treeTooJSON: secondJson.tree, oldState, originalTreeUrl: firstTreeUrl, secondTreeUrl: secondTreeUrl, dispatch});
  dispatch({type: types.TREE_TOO_DATA, ...newState});
};

export const loadJSONs = ({url = window.location.pathname, search = window.location.search} = {}) => {
  return (dispatch, getState) => {
    const { tree } = getState();
    if (tree.loaded) {
      dispatch({type: types.DATA_INVALID}); // "resets" state
    }
    const query = queryString.parse(search);

    if (url.indexOf("narratives") === -1) {
      loadDatasetVisualisation(dispatch, url, query);
    } else {
      loadNarrative(dispatch, url, query);
    }
  };
};


/* ------------------------------------------------------------------------------------ */


/**
 * Trigger one or more dispatches
 * intended to display a (non-narrative) visualisation.
 * The dispatches may be to a 404 / splash page if the
 * (main) dataset request fails.
 */
async function loadDatasetVisualisation(dispatch, url, query) {

  /* step 1: parse URL into api requests to make */
  warnDeprecatedQuerySyntax(dispatch, query);
  const [mainDatasetUrl, secondTreeUrl] = collectDatasetFetchUrls(url);
  const apiCalls = parseUrlIntoAPICalls(mainDatasetUrl);
  if (secondTreeUrl) {
    apiCalls.second = parseUrlIntoAPICalls(secondTreeUrl).main;
  }

  /* step 2: fetch main JSON (or mainJSONs if 2 trees) */
  let mainJson, secondJson, pathnameShouldBe, additionalRequests;
  try {
    ({mainJson, secondJson, pathnameShouldBe, additionalRequests} =
      await fetchDatasetPair(apiCalls.main, apiCalls.second));
  } catch (err) {
    handleFetchErrors(err, dispatch, `Couldn't load JSONs for ${url}`);
    return;
  }

  /* step 3: dispatch (viz should render) */
  dispatchCleanStart(dispatch, mainJson, secondJson, pathnameShouldBe, query);

  /* step 4: trigger promises to fetch sidecar files. These may resolve in dispatches to
  update the visualisation or to show a notification */
  if (additionalRequests.tipFrequencies) {
    fetchJSON(apiCalls.tipFrequencies)
      .then((data) => dispatch(loadFrequencies(data)))
      .catch((err) => {
        console.error("Failed to fetch frequencies", err.message);
        dispatch(warningNotification({message: "Failed to fetch frequencies"}));
      });
  }
  if (additionalRequests.rootSequence) {
    fetchJSON(apiCalls.rootSequence)
      .then((data) => dispatch({type: types.SET_ROOT_SEQUENCE, data}))
      .catch(() => {}); // it's not unexpected to be missing the root-sequence JSON
  }
  if (additionalRequests.available) {
    fetchJSON(`${getServerAddress()}/getAvailable?prefix=${window.location.pathname}`)
      .then((data) => dispatch({type: types.SET_AVAILABLE, data}))
      .catch((err) => {
        console.error("Failed to fetch available datasets", err.message);
        dispatch(warningNotification({message: "Failed to fetch available datasets"}));
      });
  }
};


function warnDeprecatedQuerySyntax(dispatch, query) {
  /* Once upon a time one could specify a second tree via a `?tt=tree_name`.
  This is no longer supported, however we still display an error message. */
  if (query.tt) {
    dispatch(errorNotification({
      message: `Specifing a second tree via '?tt=${query.tt}' is no longer supported.`,
      details: "The new syntax requires the complete name for both trees. " +
        "For example, instead of 'flu/seasonal/h3n2/ha/2y?tt=na' you must " +
        "specify 'flu/seasonal/h3n2/ha/2y:flu/seasonal/h3n2/na/2y' "
    }));
  }
}


function narrativeFetchingErrorNotification(err, failedTreeName, fallbackTreeName) {
  return errorNotification({
    message: `Error fetching one of the datasets.
      Using the YAML-defined dataset (${fallbackTreeName}) instead.`,
    details: `Could not fetch dataset "${failedTreeName}". Make sure this dataset exists
      and is spelled correctly.
      Error details:
        status: ${err.status};
        message: ${err.message}`
  });
};

/**
 * Produce API calls which should fetch the main dataset, as well as
 * calls to fetch the sidecar files (which may not exist) */
function parseUrlIntoAPICalls(url) {
  // todo - handle hardcoded server calls
  const main = `${getServerAddress()}/getDataset?prefix=${url}`;
  return {
    name: url,
    main,
    tipFrequencies: `${main}&type=tip-frequencies`,
    rootSequence: `${main}&type=root-sequence`
  };
}

/**
 * Given one or two datasets intended for display, fetch them and return
 * the data. This function should be `await`ed.
 * @param {String} main API call for main dataset
 * @param {String} second [optional] API call for second dataset
 * @returns {Object} Object including parsed JSON representation of dataset(s)
 */
async function fetchDatasetPair(main, second) {
  const mainDatasetResponse = await fetchWithErrorHandling(main);
  const pathnameShouldBe = queryString.parse(mainDatasetResponse.url.split("?")[1]).prefix;
  const mainJson = await mainDatasetResponse.json();
  let secondJson;
  try {
    secondJson = second ? await fetchJSON(second) : false;
  } catch (err) {
    console.error("Failed to fetch second tree via API call", second);
    second = false; // eslint-disable-line no-param-reassign
  }
  return {
    mainJson,
    secondJson,
    pathnameShouldBe,
    additionalRequests: {
      tipFrequencies: mainJson && mainJson.meta.panels && mainJson.meta.panels.includes("frequencies"),
      rootSequence: !!mainJson,
      available: !!mainJson
    }
  };
}


/**
 * Dispatch the action which will result in Auspice displaying the dataset(s).
 */
function dispatchCleanStart(dispatch, mainJson, secondJson, pathnameShouldBe, query, narrativeBlocks) {
  dispatch({
    type: types.CLEAN_START, // check this is the only CLEAN_START here
    pathnameShouldBe,
    ...createStateFromQueryOrJSONs({
      json: mainJson,
      secondTreeDataset: secondJson,
      query,
      narrativeBlocks,
      mainTreeName: secondJson ? pathnameShouldBe : null,
      secondTreeName: secondJson ? "TO DO!" : null, // todo
      dispatch
    })
  });
}

async function loadNarrative(dispatch, url, query) {
  const datasetCache = {};

  /* step 1: parse the narrative file itself */
  let blocks;
  try {
    blocks = await fetchAndParseNarrative(url);
  } catch (err) {
    console.error("Error obtaining narratives", err.message);
    return dispatch(goTo404(`Couldn't load narrative for ${url}`));
  }

  /* step 2: extract all API calls to fetch datasets defined in the narrative */
  const {datasetApiCalls, initialDatasetNames, frontmatterDatasetNames} =
    createApiCallsForDatasetsInNarratives(blocks, query);

  /* step 3: make blocking requests for our starting dataset(s) & dispatch */
  let mainJson, secondJson, pathnameShouldBe, additionalRequests, startingDatasetUrls;
  try {
    ({mainJson, secondJson, pathnameShouldBe, additionalRequests} =
      await fetchDatasetPair(...initialDatasetNames.map((x) => datasetApiCalls[x] ? datasetApiCalls[x].main : undefined)));
    startingDatasetUrls = initialDatasetNames;
  } catch (err) {
    // if the initial dataset call fails, we try the frontmatter one.
    try {
      throw new Error("TODO ERROR")
      // ({mainJson, secondJson, pathnameShouldBe, additionalRequests} =
      //   await fetchDatasetPair(...frontmatterDatasetUrls.map((x) => datasetApiCalls[x] ? datasetApiCalls[x].main : undefined)));
      // // dispatch(narrativeFetchingErrorNotification(err, treeName, treeNames[0]));
      // // todo - store in cache
      // dispatch(narrativeFetchingErrorNotification(err, "A", "B"));
    } catch (fatalError) {
      handleFetchErrors(fatalError, dispatch, `Couldn't load JSONs for this narrative`);
      return;
    }
  }

  dispatchCleanStart(dispatch, mainJson, secondJson, pathnameShouldBe, query, blocks);
  datasetCache[startingDatasetUrls[0]] = {main: mainJson};
  if (secondJson) datasetCache[startingDatasetUrls[1]] = {main: secondJson};

  /* step 4: make additional requests, and dispatch them */
  if (additionalRequests.tipFrequencies) {
    datasetCache[startingDatasetUrls[0]].tipFrequencies =
      fetchJSON(datasetApiCalls[startingDatasetUrls[0]].tipFrequencies)
        .then((data) => dispatch(loadFrequencies(data)))
        .catch((err) => {
          console.error("Failed to fetch frequencies", err.message);
          dispatch(warningNotification({message: "Failed to fetch frequencies"}));
        });
  }
  if (additionalRequests.rootSequence) {
    datasetCache[startingDatasetUrls[0]].rootSequence =
      fetchJSON(datasetApiCalls[startingDatasetUrls[0]].rootSequence)
        .then((data) => dispatch({type: types.SET_ROOT_SEQUENCE, data}))
        .catch(() => {}); // it's not unexpected to be missing the root-sequence JSON
  }
  // if (additionalRequests.available) {
  //   fetchJSON(`${getServerAddress()}/getAvailable?prefix=${window.location.pathname}`)
  //     .then((data) => dispatch({type: types.SET_AVAILABLE, data}))
  //     .catch((err) => {
  //       console.error("Failed to fetch available datasets", err.message);
  //       dispatch(warningNotification({message: "Failed to fetch available datasets"}));
  //     });
  // }

  /* step 5: fill in cache with pending promises */

  Object.entries(datasetApiCalls).forEach(([name, apis]) => {
    // todo - ensure we don't make duplicate requests...
    datasetCache[name] = {
      main: fetchJSON(apis.main).catch(() => {}),
      tipFrequencies: fetchJSON(apis.tipFrequencies).catch(() => {}),
      rootJson: fetchJSON(apis.rootJson).catch(() => {})
    };
  });

  console.log("datasetCache", datasetCache)

  dispatch({type: types.CACHE_JSONS, jsons: datasetCache});

}

function handleFetchErrors(err, dispatch, msg) {
  /* No Content (204) errors are special cases where there is no dataset, but the URL is valid */
  if (err instanceof NoContentError) {
    /* TODO: add more helper functions for moving between pages in auspice */
    dispatch({
      type: types.PAGE_CHANGE,
      displayComponent: "splash",
      pushState: true
    });
  } else {
    console.error(err, err.message);
    dispatch(goTo404(msg));
  }
}

/**
 * @returns {Promise}
 */
function fetchAndParseNarrative(url) {
  const apiCall = `${getServerAddress()}/getNarrative?prefix=${url}&type=md`;
  return fetchWithErrorHandling(apiCall)
    .then((res) => res.text())
    .then((res) => parseMarkdownNarrativeFile(res, parseMarkdown))
    .catch((err) => {
      /* Note that up until v2.16 the client expected the narrative to have been converted
      to JSON by the server. To facilitate backward compatibility (e.g. in the case where
      the client is >2.16, but the server is using an older version of the API)
      if the file doesn't look like markdown we will attempt to parse it as JSON.
      Errors from `parseMarkdownNarrativeFile` indicating that the file doesn't look
      like markdown will have the fileContents attached to them */
      if (!err.fileContents) throw err;
      console.error("Narrative file doesn't appear to be markdown! Attempting to parse as JSON.");
      return JSON.parse(err.fileContents);
    })
    .then((blocks) => {
      addEndOfNarrativeBlock(blocks);
      return blocks;
    });
}


function addEndOfNarrativeBlock(narrativeBlocks) {
  const lastContentSlide = narrativeBlocks[narrativeBlocks.length-1];
  const endOfNarrativeSlide = Object.assign({}, lastContentSlide, {
    __html: undefined,
    isEndOfNarrativeSlide: true
  });
  narrativeBlocks.push(endOfNarrativeSlide);
}

/**
 * A narrative (parsed into `blocks`) may define multiple datasets.
 * This function returns the API endpoints needed to request these
 * datasets (including sidecar files).
 * Note: "initial": starting page, potentially different to frontmatter
 */
function createApiCallsForDatasetsInNarratives(blocks, query) {
  let initialDatasetNames, frontmatterDatasetNames;
  const datasetApiCalls = {};
  const initialBlockIdx = getNarrativePageFromQuery(query, blocks);
  collectDatasetFetchUrls(blocks[initialBlockIdx].dataset);
  blocks.forEach((block, idx) => {
    const [main, second] = collectDatasetFetchUrls(block.dataset);
    if (!datasetApiCalls[main]) {
      datasetApiCalls[main] = parseUrlIntoAPICalls(main);
    }
    if (second && !datasetApiCalls[second]) {
      datasetApiCalls[second] = parseUrlIntoAPICalls(second);
    }
    if (idx===0) {frontmatterDatasetNames = [main, second];}
    if (idx===initialBlockIdx) {initialDatasetNames = [main, second];}
  });
  console.log("datasetApiCalls", datasetApiCalls);
  return {datasetApiCalls, initialDatasetNames, frontmatterDatasetNames};
}
