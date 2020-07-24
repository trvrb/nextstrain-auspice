import { tipRadius, tipRadiusOnLegendMatch } from "./globals";
import { getTraitFromNode } from "../util/treeMiscHelpers";
import { isColorByGenotype } from "../util/getGenotype";

/**
* equates a single tip and a legend element
* exact match is required for categorical qunantities such as genotypes, regions
* continuous variables need to fall into the interal (lower_bound[leg], leg]
* @param selectedLegendItem - value of the selected tip attribute (numeric or string)
* @param node - node (tip) in question
* @param legendBoundsMap - if falsey, then exact match required. Else contains bounds for match.
* @param colorScale - used to get the value of the attribute being used for colouring
* @returns bool
*/
const determineLegendMatch = (selectedLegendItem, node, colorScale) => {
  const nodeAttr = getTraitFromNode(node, colorScale.colorBy, {genotype: isColorByGenotype(colorScale.colorBy)});
  if (colorScale.continuous) {
    return (nodeAttr <= colorScale.legendBounds[selectedLegendItem][1]) &&
           (nodeAttr >= colorScale.legendBounds[selectedLegendItem][0]);
  }
  return nodeAttr === selectedLegendItem;
};

/**
 * Does the `node`s trait for the given `geoResolution` match the `geoValueToMatch`?
 * @param {object} node - node (tip) in question
 * @param {string} geoResolution - Geographic resolution (e.g. "division", "country", "region")
 * @param {string} geoValueToMatch - Value to match (e.g. "New Zealand", "New York")
 * @returns bool
 */
const determineLocationMatch = (node, geoResolution, geoValueToMatch) => {
  return geoValueToMatch === getTraitFromNode(node, geoResolution);
};

/**
* produces the array of tip radii - if nothing's selected this is the hardcoded tipRadius
* if there's a selectedLegendItem, then values will be small (like normal) or big (for those tips selected)
* @param selectedLegendItem - value of the selected tip attribute (numeric or string) OPTIONAL
* @param tipSelectedIdx - idx of a single tip to show with increased tipRadius OPTIONAL
* @param colorScale - node (tip) in question
* @param tree
* @returns null (if data not ready) or array of tip radii
*/
export const calcTipRadii = ({tipSelectedIdx = false, selectedLegendItem = false, geoFilter = [], searchNodes = false, colorScale, tree}) => {
  if (selectedLegendItem !== false && tree && tree.nodes) {
    return tree.nodes.map((d) => determineLegendMatch(selectedLegendItem, d, colorScale) ? tipRadiusOnLegendMatch : tipRadius);
  } else if (geoFilter.length===2 && tree && tree.nodes) {
    return tree.nodes.map((d) => determineLocationMatch(d, ...geoFilter) ? tipRadiusOnLegendMatch : tipRadius);
  } else if (searchNodes) {
    return tree.nodes.map((d) => d.name.toLowerCase().includes(searchNodes) ? tipRadiusOnLegendMatch : tipRadius);
  } else if (tipSelectedIdx) {
    const radii = tree.nodes.map(() => tipRadius);
    radii[tipSelectedIdx] = tipRadiusOnLegendMatch + 3;
    return radii;
  } else if (tree && tree.nodes) {
    return tree.nodes.map(() => tipRadius);
  }
  return null; // fallthrough
};
