import { calcTipRadii } from "../util/tipRadiusHelpers";
import { strainNameToIdx, calculateVisiblityAndBranchThickness } from "../util/treeVisibilityHelpers";
import * as types from "./types";
import { updateEntropyVisibility } from "./entropy";
import { updateFrequencyDataDebounced } from "./frequencies";
import { calendarToNumeric } from "../util/dateHelpers";
import { applyToChildren } from "../components/tree/phyloTree/helpers";
import { constructVisibleTipLookupBetweenTrees } from "../util/treeTangleHelpers";
import { createVisibleLegendValues } from "../util/colorScale";


export const applyInViewNodesToTree = (idx, tree) => {
  const validIdxRoot = idx !== undefined ? idx : tree.idxOfInViewRootNode;
  if (idx !== tree.idxOfInViewRootNode && tree.nodes[0].shell) {
    /* a bit hacky, should be somewhere else */
    tree.nodes.forEach((d) => {
      d.shell.inView = false;
      d.shell.update = true;
    });
    if (tree.nodes[validIdxRoot].shell.terminal) {
      applyToChildren(tree.nodes[validIdxRoot].shell.parent, (d) => {d.inView = true;});
    } else {
      applyToChildren(tree.nodes[validIdxRoot].shell, (d) => {d.inView = true;});
    }
  } else {
    tree.nodes.forEach((d) => {
      d.inView = false;
    });
    if (!tree.nodes[validIdxRoot].hasChildren) {
      applyToChildren(tree.nodes[validIdxRoot].parent, (d) => {d.inView = true;});
    } else {
      applyToChildren(tree.nodes[validIdxRoot], (d) => {d.inView = true;});
    }
  }

  return validIdxRoot;
};

/**
 * define the visible branches and their thicknesses. This could be a path to a single tip or a selected clade.
 * filtering etc will "turn off" branches, etc etc
 * this fn relies on the "inView" attr of nodes
 * note that this function checks to see if the tree has been defined (different to if it's ready / loaded!)
 * for arg destructuring see https://simonsmith.io/destructuring-objects-as-function-parameters-in-es6/
 * @param  {array|undefined} root Change the in-view part of the tree. [root idx tree1, root idx tree2].
 *                                [0, 0]: reset. [undefined, undefined]: do nothing
 * @param  {object | undefined} tipSelected
 * @param  {string | undefined} cladeSelected
 * @return {function} a function to be handled by redux (thunk)
 */
export const updateVisibleTipsAndBranchThicknesses = (
  {root = [undefined, undefined], cladeSelected = undefined} = {}
) => {
  return (dispatch, getState) => {
    const { tree, treeToo, controls, frequencies } = getState();
    if (root[0] === undefined && !cladeSelected && tree.selectedClade) {
      /* if not resetting tree to root, maintain previous selectedClade if one exists */
      cladeSelected = tree.selectedClade; // eslint-disable-line no-param-reassign
    }

    if (!tree.nodes) {return;}
    // console.log("ROOT SETTING TO", root)
    /* mark nodes as "in view" as applicable */
    const rootIdxTree1 = applyInViewNodesToTree(root[0], tree);

    const data = calculateVisiblityAndBranchThickness(
      tree,
      controls,
      {dateMinNumeric: controls.dateMinNumeric, dateMaxNumeric: controls.dateMaxNumeric}
    );
    const dispatchObj = {
      type: types.UPDATE_VISIBILITY_AND_BRANCH_THICKNESS,
      visibility: data.visibility,
      visibilityVersion: data.visibilityVersion,
      branchThickness: data.branchThickness,
      branchThicknessVersion: data.branchThicknessVersion,
      idxOfInViewRootNode: rootIdxTree1,
      idxOfFilteredRoot: data.idxOfFilteredRoot,
      cladeName: cladeSelected,
      selectedClade: cladeSelected,
      stateCountAttrs: Object.keys(controls.filters)
    };

    if (controls.showTreeToo) {
      const rootIdxTree2 = applyInViewNodesToTree(root[1], treeToo);
      const dataToo = calculateVisiblityAndBranchThickness(
        treeToo,
        controls,
        {dateMinNumeric: controls.dateMinNumeric, dateMaxNumeric: controls.dateMaxNumeric},
        // {tipSelectedIdx: tipIdx2}
      );
      dispatchObj.tangleTipLookup = constructVisibleTipLookupBetweenTrees(tree.nodes, treeToo.nodes, data.visibility, dataToo.visibility);
      dispatchObj.visibilityToo = dataToo.visibility;
      dispatchObj.visibilityVersionToo = dataToo.visibilityVersion;
      dispatchObj.branchThicknessToo = dataToo.branchThickness;
      dispatchObj.branchThicknessVersionToo = dataToo.branchThicknessVersion;
      dispatchObj.idxOfInViewRootNodeToo = rootIdxTree2;
      dispatchObj.idxOfFilteredRootToo = dataToo.idxOfFilteredRoot;
      /* tip selected is the same as the first tree - the reducer uses that */
    }

    /* Changes in visibility require a recomputation of which legend items we wish to display */
    dispatchObj.visibleLegendValues = createVisibleLegendValues({
      colorBy: controls.colorBy,
      genotype: controls.colorScale.genotype,
      scaleType: controls.colorScale.scaleType,
      legendValues: controls.colorScale.legendValues,
      treeNodes: tree.nodes,
      treeTooNodes: treeToo ? treeToo.nodes : undefined,
      visibility: dispatchObj.visibility,
      visibilityToo: dispatchObj.visibilityToo
    });

    /* We set a flag for the URL middleware here */
    if (root[0]!== undefined) {
      if (tree.idxOfFilteredRoot===root[0]) {
        dispatchObj.zoomToSelectedQuery = true;
      } else {
        dispatchObj.zoomToSelectedQuery = false;
      }
    }

    /* D I S P A T C H */
    dispatch(dispatchObj);
    updateEntropyVisibility(dispatch, getState);
    if (frequencies.loaded) {
      updateFrequencyDataDebounced(dispatch, getState);
    }
  };
};

/**
 * date changes need to update tip visibility & branch thicknesses
 * this can be done in a single action
 * NB calling this without specifing newMin OR newMax is a no-op
 * @param  {string|false} newMin optional
 * @param  {string|false} newMax optional
 * @return {null} side-effects: a single action
 */
export const changeDateFilter = ({newMin = false, newMax = false, quickdraw = false}) => {
  return (dispatch, getState) => {
    const { tree, treeToo, controls, frequencies } = getState();
    if (!tree.nodes) {return;}
    const dates = {
      dateMinNumeric: newMin ? calendarToNumeric(newMin) : controls.dateMinNumeric,
      dateMaxNumeric: newMax ? calendarToNumeric(newMax) : controls.dateMaxNumeric
    };
    const data = calculateVisiblityAndBranchThickness(tree, controls, dates);
    const dispatchObj = {
      type: types.CHANGE_DATES_VISIBILITY_THICKNESS,
      quickdraw,
      dateMin: newMin ? newMin : controls.dateMin,
      dateMax: newMax ? newMax : controls.dateMax,
      dateMinNumeric: dates.dateMinNumeric,
      dateMaxNumeric: dates.dateMaxNumeric,
      visibility: data.visibility,
      visibilityVersion: data.visibilityVersion,
      branchThickness: data.branchThickness,
      branchThicknessVersion: data.branchThicknessVersion,
      idxOfInViewRootNode: tree.idxOfInViewRootNode,
      stateCountAttrs: Object.keys(controls.filters)
    };
    if (controls.showTreeToo) {
      const dataToo = calculateVisiblityAndBranchThickness(treeToo, controls, dates);
      dispatchObj.tangleTipLookup = constructVisibleTipLookupBetweenTrees(tree.nodes, treeToo.nodes, data.visibility, dataToo.visibility);
      dispatchObj.visibilityToo = dataToo.visibility;
      dispatchObj.visibilityVersionToo = dataToo.visibilityVersion;
      dispatchObj.branchThicknessToo = dataToo.branchThickness;
      dispatchObj.branchThicknessVersionToo = dataToo.branchThicknessVersion;
    }

    /* Changes in visibility require a recomputation of which legend items we wish to display */
    dispatchObj.visibleLegendValues = createVisibleLegendValues({
      colorBy: controls.colorBy,
      scaleType: controls.colorScale.scaleType,
      genotype: controls.colorScale.genotype,
      legendValues: controls.colorScale.legendValues,
      treeNodes: tree.nodes,
      treeTooNodes: treeToo ? treeToo.nodes : undefined,
      visibility: dispatchObj.visibility,
      visibilityToo: dispatchObj.visibilityToo
    });

    /* D I S P A T C H */
    dispatch(dispatchObj);
    updateEntropyVisibility(dispatch, getState);
    if (frequencies.loaded) {
      updateFrequencyDataDebounced(dispatch, getState);
    }
  };
};

/**
 * NB all params are optional - supplying none resets the tip radii to defaults
 * @param  {string|number} selectedLegendItem value of the attr. if scale is continuous a bound will be used.
 * @param  {int} tipSelectedIdx the strain to highlight (always tree 1)
 * @param  {array} geoFilter a filter to apply to the strains. Empty array or array of len 2. [0]: geoResolution, [1]: value to filter to
 * @return {null} side-effects: a single action
 */
export const updateTipRadii = (
  {tipSelectedIdx = false, selectedLegendItem = false, geoFilter = [], searchNodes = false} = {}
) => {
  return (dispatch, getState) => {
    const { controls, tree, treeToo } = getState();
    const colorScale = controls.colorScale;
    const d = {
      type: types.UPDATE_TIP_RADII, version: tree.tipRadiiVersion + 1
    };
    const tt = controls.showTreeToo;
    if (tipSelectedIdx) {
      d.data = calcTipRadii({tipSelectedIdx, colorScale, tree});
      if (tt) {
        const idx = strainNameToIdx(treeToo.nodes, tree.nodes[tipSelectedIdx].name);
        d.dataToo = calcTipRadii({idx, colorScale, tree: treeToo});
      }
    } else {
      d.data = calcTipRadii({selectedLegendItem, geoFilter, searchNodes, colorScale, tree});
      if (tt) d.dataToo = calcTipRadii({selectedLegendItem, geoFilter, searchNodes, colorScale, tree: treeToo});
    }
    dispatch(d);
  };
};

/**
 * Apply a filter to the current selection (i.e. filtered / "on" values associated with this trait)
 * Explanation of the modes:
 *    "add" -> add the values to the current selection (if any exists).
 *    "inactivate" -> inactivate values (i.e. change active prop to false). To activate just use "add".
 *    "remove" -> remove the values from the current selection
 *    "set"  -> set the values of the filter to be those provided. All disabled filters will be removed. XXX TODO.
 * @param {string} mode allowed values: "set", "add", "remove"
 * @param {string} trait the trait name of the filter ("authors", "country" etcetera)
 * @param {Array of strings} values the values (see above)
 */
export const applyFilter = (mode, trait, values) => {
  return (dispatch, getState) => {
    const { controls } = getState();
    const currentlyFilteredTraits = Reflect.ownKeys(controls.filters);
    let newValues;
    switch (mode) {
      case "set":
        newValues = values.map((value) => ({value, active: true}));
        break;
      case "add":
        if (currentlyFilteredTraits.indexOf(trait) === -1) {
          newValues = values.map((value) => ({value, active: true}));
        } else {
          newValues = controls.filters[trait].slice();
          const currentItemNames = newValues.map((i) => i.value);
          values.forEach((valueToAdd) => {
            const idx = currentItemNames.indexOf(valueToAdd);
            if (idx === -1) {
              newValues.push({value: valueToAdd, active: true});
            } else {
              /* it's already there, ensure it's active */
              newValues[idx].active = true;
            }
          });
        }
        break;
      case "remove": // fallthrough
      case "inactivate":
        if (currentlyFilteredTraits.indexOf(trait) === -1) {
          console.error(`trying to ${mode} values from an un-initialised filter!`);
          return;
        }
        newValues = controls.filters[trait].slice();
        const currentItemNames = newValues.map((i) => i.value);
        for (const item of values) {
          const idx = currentItemNames.indexOf(item);
          if (idx !== -1) {
            if (mode==="remove") {
              newValues.splice(idx, 1);
            } else {
              newValues[idx].active = false;
            }
          } else {
            console.error(`trying to ${mode} filter value ${item} which was not part of the filter selection`);
          }
        }
        break;
      default:
        console.error(`applyFilter called with invalid mode: ${mode}`);
        return; // don't dispatch
    }
    dispatch({type: types.APPLY_FILTER, trait, values: newValues});
    dispatch(updateVisibleTipsAndBranchThicknesses());
  };
};

export const toggleTemporalConfidence = () => ({
  type: types.TOGGLE_TEMPORAL_CONF
});
