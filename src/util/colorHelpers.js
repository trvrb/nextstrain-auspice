import { rgb, hsl } from "d3-color";
import { interpolateRgb } from "d3-interpolate";
import scalePow from "d3-scale/src/pow";
import { isColorByGenotype, decodeColorByGenotype } from "./getGenotype";
import { getTraitFromNode } from "./treeMiscHelpers";

/**
 * Average over the visible colours for a given location
 * @param {array} nodes list of nodes whose colours we want to average over
 * @param {array} nodeColours (redux state) -- list of node hexes. Not in 1-1 correspondence with `nodes`.
 * @returns {str} a color hex string representing the average of the array.
 */
export const getAverageColorFromNodes = (nodes, nodeColors) => {
  let r=0, g=0, b=0;
  nodes.forEach((n) => {
    const tmpRGB = rgb(nodeColors[n.arrayIdx]);
    r += tmpRGB.r;
    g += tmpRGB.g;
    b += tmpRGB.b;
  });
  const total = nodes.length;
  const avg = rgb(r/total, g/total, b/total);
  return avg.toString();
};

export const determineColorByGenotypeMutType = (colorBy) => {
  if (isColorByGenotype(colorBy)) {
    const genotype = decodeColorByGenotype(colorBy);
    return genotype.aa
      ? "aa"
      : "nuc";
  }
  return false;
};


/**
* what colorBy trait names are present in the tree but _not_ in the provided scale?
* @param {Array} nodes - list of nodes
* @param {Array|undefined} nodesToo - list of nodes for the second tree
* @param {string} colorBy -
* @param {Array} providedVals - list of provided trait values
* @return {list}
*/
export const getExtraVals = (nodes, nodesToo, colorBy, providedVals) => {
  let valsInTree = nodes.map((n) => getTraitFromNode(n, colorBy));
  if (nodesToo) {
    nodesToo.forEach((n) => valsInTree.push(getTraitFromNode(n, colorBy)));
  }
  valsInTree = [...new Set(valsInTree)];
  return valsInTree.filter((x) => providedVals.indexOf(x) === -1);
};

/* generates and returns an array of colours (HEXs) for the nodes under the given colorScale */
/* takes around 2ms on a 2000 tip tree */
export const calcNodeColor = (tree, colorScale) => {
  if (tree && tree.nodes && colorScale && colorScale.colorBy) {
    const genotype = isColorByGenotype(colorScale.colorBy);
    const nodeColorAttr = tree.nodes.map((n) => getTraitFromNode(n, colorScale.colorBy, {genotype}));
    return nodeColorAttr.map((n) => colorScale.scale(n));
  }
  return null;
};


// scale entropy such that higher entropy maps to a grayer less-certain branch
const branchInterpolateColour = "#BBB";
const branchOpacityConstant = 0.6;
export const branchOpacityFunction = scalePow()
  .exponent([0.6])
  .domain([0, 2.0])
  .range([0.4, 1])
  .clamp(true);


// entropy calculation precomputed in augur
// export const calcEntropyOfValues = (vals) =>
//   vals.map((v) => v * Math.log(v + 1E-10)).reduce((a, b) => a + b, 0) * -1 / Math.log(vals.length);

/**
 * calculate array of HEXs to actually be displayed.
 * (colorBy) confidences manifest as opacity ramps
 * @param {obj} tree phyloTree object
 * @param {bool} confidence enabled?
 * @return {array} array of hex's. 1-1 with nodes.
 */
export const calcBranchStrokeCols = (tree, confidence, colorBy) => {
  if (confidence === true) {
    return tree.nodeColors.map((col, idx) => {
      const entropy = getTraitFromNode(tree.nodes[idx], colorBy, {entropy: true});
      const opacity = entropy ? branchOpacityFunction(entropy) : branchOpacityConstant;
      return rgb(interpolateRgb(col, branchInterpolateColour)(opacity)).toString();
    });
  }
  return tree.nodeColors.map((col) => {
    return rgb(interpolateRgb(col, branchInterpolateColour)(branchOpacityConstant)).toString();
  });
};


/**
 * Return an emphasized color
 */
export const getEmphasizedColor = (color) => {
  const hslColor = hsl(color);
  hslColor.s *= 1.8; // more saturation
  hslColor.l /= 1.2; // less luminance
  return rgb(hslColor).toString();
};
