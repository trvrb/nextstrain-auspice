import { freqScale, NODE_NOT_VISIBLE, NODE_VISIBLE_TO_MAP_ONLY, NODE_VISIBLE, genotypeSymbol } from "./globals";
import { calcTipCounts } from "./treeCountingHelpers";
import { getTraitFromNode } from "./treeMiscHelpers";
import { warningNotification } from "../actions/notifications";

export const getVisibleDateRange = (nodes, visibility) => nodes
  .filter((node, idx) => (visibility[idx] === NODE_VISIBLE && !node.hasChildren))
  .reduce((acc, node) => {
    const nodeDate = getTraitFromNode(node, "num_date");
    return nodeDate ? [Math.min(nodeDate, acc[0]), Math.max(nodeDate, acc[1])] : acc;
  }, [100000, -100000]);

export const strainNameToIdx = (nodes, name) => {
  let i;
  for (i = 0; i < nodes.length; i++) {
    if (nodes[i].name === name) {
      return i;
    }
  }
  console.error("strainNameToIdx couldn't find strain");
  return 0;
};

/**
 * Find the node with the given label name & value
 * NOTE: if there are multiple nodes with the same label then the first encountered is returned
 * @param {Array} nodes tree nodes (flat)
 * @param {string} labelName label name
 * @param {string} labelValue label value
 * @returns {int} the index of the matching node (0 if no match found)
 */
export const getIdxMatchingLabel = (nodes, labelName, labelValue, dispatch) => {
  let i;
  let found = 0;
  for (i = 0; i < nodes.length; i++) {
    if (
      nodes[i].branch_attrs &&
      nodes[i].branch_attrs.labels !== undefined &&
      nodes[i].branch_attrs.labels[labelName] === labelValue
    ) {
      if (found === 0) {
        found = i;
      } else {
        console.error(`getIdxMatchingLabel found multiple labels ${labelName}===${labelValue}`);
        dispatch(warningNotification({
          message: "Specified Zoom Label Found Multiple Times!",
          details: "Multiple nodes in the tree are labelled '"+labelName+" "+labelValue+"' - no zoom performed"
        }));
        return 0;
      }
    }
  }
  if (found === 0) {
    console.error(`getIdxMatchingLabel couldn't find label ${labelName}===${labelValue}`);
    dispatch(warningNotification({
      message: "Specified Zoom Label Value Not Found!",
      details: "The label '"+labelName+"' value '"+labelValue+"' was not found in the tree - no zoom performed"
    }));
  }
  return found;
};

/** calcBranchThickness **
* returns an array of node (branch) thicknesses based on the tipCount at each node
* If the node isn't visible, the thickness is 1.
* Relies on the `tipCount` property of the nodes having been updated.
* Pure.
* @param nodes - JSON nodes
* @param visibility - visibility array (1-1 with nodes)
* @returns array of thicknesses (numeric)
*/
const calcBranchThickness = (nodes, visibility) => {
  let maxTipCount = nodes[0].tipCount;
  /* edge case: no tips selected */
  if (!maxTipCount) {
    maxTipCount = 1;
  }
  return nodes.map((d, idx) => {
    if (visibility[idx] === NODE_VISIBLE) {
      return freqScale((d.tipCount + 5) / (maxTipCount + 5));
    }
    return 0.5;
  });
};

/* recursively mark the parents of a given node active
by setting the node idx to true in the param visArray */
const makeParentVisible = (visArray, node) => {
  if (node.arrayIdx === 0 || visArray[node.parent.arrayIdx]) {
    return; // this is the root of the tree or the parent was already visibile
  }
  visArray[node.parent.arrayIdx] = true;
  makeParentVisible(visArray, node.parent);
};

/* Recursively hide nodes that do not have more than one child node by updating
 * the boolean values in the param visArray.
 * Relies on visArray having been updated by `makeParentVisible`
 * Returns the index of the visible commonn ancestor. */
const hideNodesAboveVisibleCommonAncestor = (visArray, node) => {
  if (!node.hasChildren) {
    return node.arrayIdx; // Terminal node without children
  }
  const visibleChildren = node.children.filter((child) => visArray[child.arrayIdx]);
  if (visibleChildren.length > 1) {
    return node.arrayIdx; // This is the common ancestor of visible children
  }
  visArray[node.arrayIdx] = false;
  for (let i = 0; i < visibleChildren.length; i++) {
    const commonAncestorIdx = hideNodesAboveVisibleCommonAncestor(visArray, visibleChildren[i]);
    if (commonAncestorIdx) return commonAncestorIdx;
  }
  // If there is no visible common ancestor, then return null
  return null;
};

/* Gets the inView attribute of phyloTree.nodes, accessed through
 * redux.tree.nodes[idx].shell.inView Bool. The inView attribute is set by
 * phyloTree and determines if the tip is within the view.
 * Returns the array of inView booleans. */
const getInView = (tree) => {
  if (!tree.nodes) {
    console.error("getInView() ran without tree.nodes");
    return null;
  }
  /* inView represents nodes that are within the current view window (i.e. not off the screen) */
  let inView;
  try {
    inView = tree.nodes.map((d) => d.shell.inView);
  } catch (e) {
    /* edge case: this fn may be called before the shell structure of the nodes
     * has been created (i.e. phyloTree's not run yet). In this case, it's
     * safe to assume that everything's in view */
    inView = tree.nodes.map((d) => d.inView !== undefined ? d.inView : true);
  }
  return inView;
};

/* Gets all active filters and checks if each tree.node matches the filters.
 * Returns an array of filtered booleans and the index of the least common
 * ancestor node of the filtered nodes.
 * FILTERS:
 * - controls.filters (redux) is a dict of trait name -> values
 * - filters (in this code) is a list of filters to apply
 *   e.g. [{trait: "country", values: [...]}, ...] */
export const getFilteredAndIdxOfFilteredRoot = (tree, controls, inView) => {
  if (!tree.nodes) {
    console.error("getFiltered() ran without tree.nodes");
    return null;
  }
  let filtered; // array of bools, same length as tree.nodes. true -> that node should be visible
  let idxOfFilteredRoot; // index of last common ancestor of filtered nodes.
  const filters = [];
  Reflect.ownKeys(controls.filters).forEach((filterName) => {
    if (filterName===genotypeSymbol) return; // see `performGenotypeFilterMatch` call below
    const items = controls.filters[filterName];
    const activeFilterItems = items.filter((item) => item.active).map((item) => item.value);
    if (activeFilterItems.length) {
      filters.push({trait: filterName, values: activeFilterItems});
    }
  });

  if (filters.length) {
    /* find the terminal nodes that were (a) already visibile and (b) match the filters */
    filtered = tree.nodes.map((d, idx) => (
      !d.hasChildren && inView[idx] && filters.every((f) => f.values.includes(getTraitFromNode(d, f.trait)))
    ));
    const idxsOfFilteredTips = filtered.reduce((a, e, i) => {
      if (e) {a.push(i);}
      return a;
    }, []);
    /* for each visibile tip, make the parent nodes visible (recursively) */
    for (let i = 0; i < idxsOfFilteredTips.length; i++) {
      makeParentVisible(filtered, tree.nodes[idxsOfFilteredTips[i]]);
    }
    /* Recursivley hide ancestor nodes that are not the last common
     * ancestor of selected nodes, starting from the root of the tree */
    idxOfFilteredRoot = hideNodesAboveVisibleCommonAncestor(filtered, tree.nodes[0]);
  }

  ([filtered, idxOfFilteredRoot] = performGenotypeFilterMatch(filtered, controls.filters, tree.nodes) || [filtered, idxOfFilteredRoot]);

  return {filtered, idxOfFilteredRoot};
};

/* calcVisibility
USES:
- use dates NOT controls.dateMin & controls.dateMax
- uses inView array returned by getInView()
- uses filtered array returned by getFilteredAndIdxOfFilteredRoot()

RETURNS:
visibility: array of integers in {0, 1, 2}
 - 0: not displayed by map. Potentially displayed by tree as a thin branch.
 - 1: available for display by the map. Displayed by tree as a thin branch.
 - 2: Displayed by both the map and the tree.

ROUGH DESCRIPTION OF HOW FILTERING IS APPLIED:
 - inView filtering (reflects tree zooming): Nodes which are not inView always have visibility=0
 - time filtering is simple - all nodes (internal + terminal) not within (tmin, tmax) are excluded.
 - filters are a bit more tricky - the visibile tips are calculated, and the parent
    branches back to the MRCA are considered visibile. This is then intersected with
    the time & inView visibile stuff
*/
export const calcVisibility = (tree, controls, dates, inView, filtered) => {
  if (tree.nodes) {
    /* intersect the various arrays contributing to visibility */
    const visibility = tree.nodes.map((node, idx) => {
      if (inView[idx] && (filtered ? filtered[idx] : true)) {
        const nodeDate = getTraitFromNode(node, "num_date");
        const parentNodeDate = getTraitFromNode(node.parent, "num_date");
        if (!nodeDate || !parentNodeDate) {
          return NODE_VISIBLE;
        }
        /* if branchLengthsToDisplay is "divOnly", then ensure node displayed */
        if (controls.branchLengthsToDisplay === "divOnly") {
          return NODE_VISIBLE;
        }
        /* is the actual node date (the "end" of the branch) in the time slice? */
        if (nodeDate >= dates.dateMinNumeric && nodeDate <= dates.dateMaxNumeric) {
          return NODE_VISIBLE;
        }
        /* is any part of the (parent date -> node date) in the time slice? */
        if (!(nodeDate < dates.dateMinNumeric || parentNodeDate > dates.dateMaxNumeric)) {
          return NODE_VISIBLE_TO_MAP_ONLY;
        }
      }
      return NODE_NOT_VISIBLE;
    });
    return visibility;
  }
  console.error("calcVisibility ran without tree.nodes");
  return NODE_VISIBLE;
};

export const calculateVisiblityAndBranchThickness = (tree, controls, dates) => {
  const inView = getInView(tree);
  const {filtered, idxOfFilteredRoot} = getFilteredAndIdxOfFilteredRoot(tree, controls, inView) || {};
  const visibility = calcVisibility(tree, controls, dates, inView, filtered);
  /* recalculate tipCounts over the tree - modifies redux tree nodes in place (yeah, I know) */
  calcTipCounts(tree.nodes[0], visibility);
  /* re-calculate branchThickness (inline) */
  return {
    visibility: visibility,
    visibilityVersion: tree.visibilityVersion + 1,
    branchThickness: calcBranchThickness(tree.nodes, visibility),
    branchThicknessVersion: tree.branchThicknessVersion + 1,
    idxOfFilteredRoot: idxOfFilteredRoot
  };
};

/**
 * Compute whether each node is filtered (visibile) by any defined genotype filters.
 *
 * Idea behind how we check genotype filter matches:
 * A "constellation" is a set of mutations -- for instance, the filters define such a set (see `filterConstellationLong`)
 * We define `constellationMatchesPerNode` which, for each node, defines an array of values corresponding to that node's membership of the constellation.
 * We recursively traverse the tree and use mutations (defined per node) to modulate this data.
 * Note that we don't know the basal genotype for a given position until we have traversed the tree, thus we cannot test a nodes membership (of
 * a constellation) until after traversal.
 * Example:
 *   genotypeFilters[i]: S:484K
 *     the ith genotype filter specifies Spike residue 484 to be Lysine (K). Note that this may include E484K but also others.
 *   constellationMatchesPerNode[nodeIdx][i]: false|true|undefined.
 *     False means an observed mutation means this node has a residue that is _not_ K.
 *     true means that an observed mutation informs us that this node _is_ K.
 *     undefined means that no muts were observed during the traversal to this node, so we must rely on the basal state, which may not yet be known.
 *
 * Pseudo-typescript type declarations are added as comments, the intention of which is to help readability & understanding.
 * @param {Array<bool>} filtered length nodes.length & in 1-1 correspondence
 * @param {Object} filters
 * @param {Array<TreeNode>} nodes
 * @returns {Array<bool>}
 */
function performGenotypeFilterMatch(filtered, filters, nodes) {
  // type genotypeFilters: Array<string> // active genotype filters. Examples: "nuc:123A", "S:484K" etc
  const genotypeFilters = Reflect.ownKeys(filters).includes(genotypeSymbol) ?
    filters[genotypeSymbol].filter((item) => item.active).map((item) => item.value) :
    false;
  if (!genotypeFilters || !genotypeFilters.length) {
    return undefined;
  }

  // todo: this has the potential to be rather slow. Timing / optimisation needed.
  // note: rather similar (in spirit) to how we calculate entropy - can we refactor / combine / speed up?
  // todo: the (new) "zoom to selected" isn't working with genotypes currently (as we're not calculating CA and storing as `idxOfFilteredRoot`)
  // todo: the entropy view is sometimes broken after filtering by genotype, but this shouldn't be the case (we can filter by other traits which are homoplasic and it works)

  if (!filtered) { // happens if there are no other filters in play
    filtered = Array.from({length: nodes.length}, () => true); // eslint-disable-line no-param-reassign
  }
  const filterConstellationLong = createFilterConstellation(genotypeFilters);
  const nGt = filterConstellationLong.length; // Note: may not be the same as genotypeFilters.length
  // type basalGt: Array<string> // entries at index `i` are the basal nt / aa at genotypeFilters[i]
  const basalGt = new Array(nGt); // stores the basal nt / aa of the position
  // type constellationEntry: undefined | false | true
  // type constellationMatch: Array<constellationEntry>
  // type constellationMatchesPerNode: Array<constellationMatch>
  const constellationMatchesPerNode = new Array(nodes.length);

  const recurse = (node, constellationMatch) => {
    if (node.branch_attrs && node.branch_attrs.mutations && Object.keys(node.branch_attrs.mutations).length) {
      const bmuts = node.branch_attrs.mutations;
      for (let i=0; i<nGt; i++) {
        // does this branch encode a mutation which means it matches the ith filter, or reverts away from it?
        if (bmuts[filterConstellationLong[i][0]]) {
          // todo -- move these array creations out of the constellation loop & pre-compute for unique set of {gene,position} within `genotypeFilters`
          const bposns = bmuts[filterConstellationLong[i][0]].map((m) => m.slice(1, -1));
          const bmutsto = bmuts[filterConstellationLong[i][0]].map((m) => m.slice(-1));
          const posIdx = bposns.indexOf(filterConstellationLong[i][1]);
          if (posIdx!==-1) {
            /* part I: does the mutation mean the node (at this idx) matches the ith entry in the constellation? */
            if (filterConstellationLong[i][2].has(bmutsto[posIdx])) { // branch mutation leading to the constellation mutation
              constellationMatch[i] = true;
            } else { // branch mutation meaning the inherited state does not match the constellation
              constellationMatch[i] = false;
            }
            /* part II: store the basal state of this position (if not already defined) */
            if (!basalGt[i]) {
              // console.log("Hey - get basal from", bmuts[filterConstellationLong[i][0]][posIdx]);
              basalGt[i] = bmuts[filterConstellationLong[i][0]][posIdx].slice(0, 1);
            }
          }
        }
      }
    }
    constellationMatchesPerNode[node.arrayIdx] = constellationMatch;
    // recurse to children & pass down (copy of) `constellationMatch` which can then be modified by descendants
    if (node.hasChildren) {
      node.children.forEach((c) => recurse(c, [...constellationMatch]));
    }
  };
  recurse(nodes[0], Array.from({length: nGt}, () => undefined));

  /* We can now compute whether the basal positions match the relevant filter */
  const basalConstellationMatch = basalGt.map((basalState, i) => filterConstellationLong[i][2].has(basalState));
  // filtered state is determined by checking if each node has the "correct" constellation of mutations
  const newFiltered = filtered.map((prevFilterValue, idx) => {
    if (!prevFilterValue) return false; // means that another filter (non-gt) excluded it
    return constellationMatchesPerNode[idx]
      .map((match, i) => match===undefined ? basalConstellationMatch[i] : match) // See docstring for defn of `undefined` here
      .every((el) => el);
  });
  /* Find the MRCA of the filtered nodes, which we use for `zoom to selected` */
  const newIdxOfFilteredRoot = findFilteredMRCA(nodes, newFiltered);
  return [newFiltered, newIdxOfFilteredRoot];
}


/**
 * Given genotype filters, such as `["HA1 186D", "HA1 186S", "nuc 100T"]`
 * Produce an array of arrays whereby genotypes at the same position are grouped
 * e.g. `[["HA1", "186", Set("D", "S")], ["nuc", "100", "T"]]`.
 * The returned array will be sorted to improve readability.
 * @param {Array<string>} filters genotype filters
 */
export function createFilterConstellation(filters) {
  return filters
    .map((x) => {
      const [gene, state] = x.split(' ');
      return [gene, state.slice(0, -1), state.slice(-1)];  // e.g. ["HA1", "186", "D"]
    })
    .sort(sortConstellationLongFn)
    .map((e, i) => {
      if (i===0) return [[e[0], e[1], new Set(e[2])]]; // ideally could be part of the `reduce` call
      return e;
    })
    .reduce((constellation, entry) => {
      const lastEntry = constellation[constellation.length-1];
      if (entry[0]===lastEntry[0] && entry[1]===lastEntry[1]) {
        lastEntry[2].add(entry[2]);
      } else {
        constellation.push([entry[0], entry[1], new Set(entry[2])]);
      }
      return constellation;
    });
}

export function sortConstellationLongFn(a, b) {
  if (a[0]!==b[0]) {
    // alphabetically sort genes, nuc goes last.
    if (a[0]==="nuc") return 1;
    if (b[0]==="nuc") return -1;
    return a<b ? -1 : 1;
  }
  // sort according to codon / nt position
  const [posA, posB] = [parseInt(a[1], 10), parseInt(b[1], 10)];
  if (posA > posB) {
    return 1;
  } else if (posB > posA) {
    return -1;
  }
  // codon / nt position is the same => sort alphabetically by residue
  if (a[2] > b[2]) {
    return 1;
  }
  if (a[2] < b[2]) {
    return -1;
  }
  return 0;
}

export const getNumSelectedTips = (nodes, visibility) => {
  let count = 0;
  nodes.forEach((d, idx) => {
    // nodes which are not inView have a visibility of NODE_NOT_VISIBLE
    // so this check accounts for them as well
    if (!d.hasChildren && visibility[idx] === NODE_VISIBLE) count += 1;
  });
  return count;
};

/**
 * Given filtered: Array<bool> find the MRCA node of the filtered nodes
 * Note that this node not be part of the filtered selection.
 */
function findFilteredMRCA(nodes, filtered) {
  const basalIdxsOfFilteredClades = []; // the `arrayIdx`s of the first (preorder) visible nodes
  const rootPathToBasalFiltered = new Set(); // the `arrayIdx`s of paths from the root -> each of the nodes from `basalIdxsOfFilteredClades`
  let mrcaIdx = 0;
  findBasalFilteredNodes(nodes[0]);
  basalIdxsOfFilteredClades.forEach((idx) => constructPathToRoot(idx));
  findMrca(nodes[0]);

  /* step1 does a shortened preorder traversal to find the set of basal visible nodes */
  function findBasalFilteredNodes(n) {
    if (filtered[n.arrayIdx]) {
      basalIdxsOfFilteredClades.push(n.arrayIdx);
      return;
    }
    if (n.hasChildren) {
      for (let i = 0; i < n.children.length; i++) {
        findBasalFilteredNodes(n.children[i]);
      }
    }
  }
  /* step 2 recursively visit parents to store the node indexes of the path to the root in `rootPathToBasalFiltered` */
  function constructPathToRoot(nIdx) {
    rootPathToBasalFiltered.add(nIdx);
    const pIdx = nodes[nIdx].parent.arrayIdx;
    if (nIdx===0 || rootPathToBasalFiltered.has(pIdx)) {
      return; // this is the root of the tree or the parent was already in the path
    }
    constructPathToRoot(pIdx);
  }
  /* step 3 - preorder confined to nodes in `rootPathToBasalFiltered` to find first node with multiple children in the path */
  function findMrca(n) {
    const nIdx = n.arrayIdx;
    if (!rootPathToBasalFiltered.has(nIdx)) return;
    if (!n.hasChildren) { // occurs when {filtered nodes} is a single terminal node
      mrcaIdx = nIdx;
      return;
    }
    const childrenInPath = n.children.filter((c) => rootPathToBasalFiltered.has(c.arrayIdx));
    if (childrenInPath.length!==1) {
      mrcaIdx = nIdx;
      return;
    }
    findMrca(childrenInPath[0]);
  }
  return mrcaIdx;
}
