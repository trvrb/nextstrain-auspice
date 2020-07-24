import React from "react";
import { infoPanelStyles } from "../../../globalStyles";
import { numericToCalendar } from "../../../util/dateHelpers";
import { isColorByGenotype, decodeColorByGenotype } from "../../../util/getGenotype";
import { getTraitFromNode, getDivFromNode, getVaccineFromNode, getFullAuthorInfoFromNode } from "../../../util/treeMiscHelpers";
import { isValueValid } from "../../../util/globals";
import { formatDivergence, getIdxOfInViewRootNode } from "../phyloTree/helpers";

const InfoLine = ({name, value, padBelow=false}) => {
  const renderValues = () => {
    if (!value) return null;
    if (Array.isArray(value)) {
      return value.map((v) => (
        <div key={v} style={{fontWeight: "300", marginLeft: "0em"}}>
          {v}
        </div>
      ));
    }
    return (<span style={{fontWeight: "300"}}>{value}</span>);
  };

  return (
    <div style={{paddingBottom: padBelow ? "15px" : "10px"}} key={name}>
      <span style={{fontWeight: "500"}}>
        {name + " "}
      </span>
      {renderValues()}
    </div>
  );
};

const StrainName = ({name}) => (
  <div style={infoPanelStyles.tooltipHeading}>
    {name}
  </div>
);

/**
 * A React component to display information about the branch's time & divergence (where applicable)
 * @param  {Object} props
 * @param  {Object} props.node branch node currently highlighted
 */
const BranchLength = ({node, t}) => {
  const elements = []; // elements to render
  const divergence = getDivFromNode(node);
  const numDate = getTraitFromNode(node, "num_date");

  if (divergence) {
    elements.push(<InfoLine name={t("Divergence")+":"} value={formatDivergence(divergence)} key="div"/>);
  }

  if (numDate !== undefined) {
    const date = numericToCalendar(numDate);
    const numDateConfidence = getTraitFromNode(node, "num_date", {confidence: true});
    if (numDateConfidence && numDateConfidence[0] !== numDateConfidence[1]) {
      elements.push(<InfoLine name={t("Inferred Date")+":"} value={date} key="inferredDate"/>);
      const dateRange = [numericToCalendar(numDateConfidence[0]), numericToCalendar(numDateConfidence[1])];
      if (dateRange[0] !== dateRange[1]) {
        elements.push(<InfoLine name={t("Date Confidence Interval")+":"} value={`(${dateRange[0]}, ${dateRange[1]})`} key="dateConf"/>);
      }
    } else {
      elements.push(<InfoLine name={t("Date")+":"} value={date} key="date"/>);
    }
  }

  return elements;
};

/**
 * A React component to display information about the colorBy for a tip/branch,
 * potentially including a table with confidences.
 * @param  {Object} props
 * @param  {Object} props.node              branch / tip node currently highlighted
 * @param  {string} props.colorBy
 * @param  {bool}   props.colorByConfidence should these (colorBy conf) be displayed, if applicable?
 * @param  {func}   props.colorScale
 * @param  {object} props.colorings
 */
const ColorBy = ({node, colorBy, colorByConfidence, colorScale, colorings}) => {
  if (colorBy === "num_date") {
    return null; /* date has already been displayed via <BranchLength> */
  }
  /* handle genotype as a special case */
  if (isColorByGenotype(colorBy)) {
    const genotype = decodeColorByGenotype(colorBy);
    const name = genotype.aa ?
      `Amino Acid at ${genotype.gene} site ${genotype.positions.join(", ")}:` :
      `Nucleotide at pos ${genotype.positions.join(", ")}:`;
    return <InfoLine name={name} value={getTraitFromNode(node, colorScale.colorBy, {genotype: true})}/>;
  }
  /* handle author as a special case */
  if (colorBy === "author") {
    const authorInfo = getFullAuthorInfoFromNode(node);
    if (!authorInfo) return null;
    // <InfoLine name="Author:" value={authorInfo.value}/> This is already displayed by AttributionInfo
    return (
      <>
        {authorInfo.title ? <InfoLine name="Title:" value={authorInfo.title}/> : null}
        {authorInfo.journal ? <InfoLine name="Journal:" value={authorInfo.journal}/> : null}
      </>
    );
  }
  /* general case */
  const name = (colorings && colorings[colorBy] && colorings[colorBy].title) ?
    colorings[colorBy].title :
    colorBy;

  /* helper function to avoid code duplication */
  const showCurrentColorByWithoutConfidence = () => {
    const value = getTraitFromNode(node, colorBy);
    return isValueValid(value) ?
      <InfoLine name={`${name}:`} value={value}/> :
      null;
  };

  /* handle trait confidences with lots of edge cases.
  This can be much improved upon resolution of https://github.com/nextstrain/augur/issues/386 */
  if (colorByConfidence === true) {
    const confidenceData = getTraitFromNode(node, colorBy, {confidence: true});
    if (!confidenceData) {
      console.error("couldn't find confidence vals for ", colorBy);
      return null;
    }
    /* if it's a tip with one confidence value > 0.99 then we interpret this as a known (i.e. not inferred) state */
    if (!node.hasChildren && Object.keys(confidenceData).length === 1 && Object.values(confidenceData)[0] > 0.99) {
      return showCurrentColorByWithoutConfidence();
    }
    const vals = Object.keys(confidenceData)
      .filter((v) => isValueValid(v))
      .sort((a, b) => confidenceData[a] > confidenceData[b] ? -1 : 1)
      .slice(0, 4)
      .map((v) => `${v} (${(100 * confidenceData[v]).toFixed(0)}%)`);
    if (!vals.length) return null; // can happen if values are invalid
    return <InfoLine name={`${name} (confidence):`} value={vals}/>;
  }
  return showCurrentColorByWithoutConfidence();
};

/**
 * A React Component to Display AA / NT mutations, if present.
 * @param  {Object} props
 * @param  {Object} props.node     branch node which is currently highlighted
 */
const Mutations = ({node, t}) => {
  if (!node.branch_attrs || !node.branch_attrs.mutations) return null;
  const elements = []; // elements to render
  const mutations = node.branch_attrs.mutations;

  /* --------- NUCLEOTIDE MUTATIONS --------------- */
  /* Nt mutations are found at `mutations.nuc` -> Array of strings */
  if (mutations.nuc && mutations.nuc.length) {
    const nDisplay = 9; // max number of mutations to display

    const isMutGap = (mut) => mut.slice(-1) === "-" || mut.slice(0, 1) === "-";
    const isMutUnknown = (mut) => mut.slice(-1) === "N" || mut.slice(0, 1) === "N";

    // gather muts which aren't to/from a gap or a "N"
    const nucs = mutations.nuc.filter((mut) => (!isMutGap(mut) && !(isMutUnknown(mut))));
    const nucLen = nucs.length; // number of mutations that exist without N/-

    let m = nucs.slice(0, Math.min(nDisplay, nucLen)).join(", ");
    if (nucLen > nDisplay) {
      m += " + " + t("{{x}} more", {x: nucLen - nDisplay});
    }

    if (nucLen !== 0) {
      elements.push(<InfoLine name={t("Nucleotide mutations")+":"} value={m} key="nuc"/>);
    }

    const nGapMutations = mutations.nuc.filter((mut) => isMutGap(mut)).length;
    if (nGapMutations) {
      elements.push(<InfoLine name={`${t("Gaps")} ("-"):`} value={nGapMutations} key="gaps"/>);
    }

    const nUnknownMutations = mutations.nuc.filter((mut) => isMutUnknown(mut)).length;
    if (nUnknownMutations) {
      elements.push(<InfoLine name='Ns:' value={nUnknownMutations} key="Ns"/>);
    }
  } else {
    elements.push(<InfoLine name={t("No nucleotide mutations")} value="" key="nuc"/>);
  }

  /* --------- AMINO ACID MUTATIONS --------------- */
  /* AA mutations are found at `mutations[prot_name]` -> Array of strings */
  const prots = Object.keys(mutations).filter((v) => v !== "nuc");

  const mutationsToDisplay = {};
  let shouldDisplay = false;

  for (const prot of prots) {
    const muts = mutations[prot].filter((mut) => !mut.endsWith("X"));
    if (muts.length) {
      mutationsToDisplay[prot] = muts;
      shouldDisplay = true;
    }
  }
  if (shouldDisplay) {
    const nDisplay = 3; // number of mutations to display per protein
    const nProtsToDisplay = 7; // max number of proteins to display
    const mutationsToRender = [];
    Object.keys(mutationsToDisplay).forEach((prot, idx) => {
      if (idx < nProtsToDisplay) {
        let x = prot + ":\u00A0\u00A0" + mutationsToDisplay[prot].slice(0, Math.min(nDisplay, mutationsToDisplay[prot].length)).join(", ");
        if (mutationsToDisplay[prot].length > nDisplay) {
          x += " + " + t("{{x}} more", {x: mutationsToDisplay[prot].length - nDisplay});
        }
        mutationsToRender.push(x);
      } else if (idx === nProtsToDisplay) {
        mutationsToRender.push(`(${t("protein mutations truncated")})`);
      }
    });
    elements.push(<InfoLine name={t("AA mutations")+":"} value={mutationsToRender} key="aa"/>);
  } else if (mutations.nuc && mutations.nuc.length) {
    /* we only print "No amino acid mutations" if we didn't already print
    "No nucleotide mutations" above */
    elements.push(<InfoLine name={t("No amino acid mutations")} key="aa"/>);
  }

  return elements;
};

/**
 * A React component to render the descendent(s) of the current branch
 * @param  {Object} props
 * @param  {Object} props.node  branch node which is currently highlighted
 */
const BranchDescendents = ({node, t}) => {
  const [name, value] = node.fullTipCount === 1 ?
    [t("Branch leading to"), node.name] :
    [t("Number of descendants")+":", node.fullTipCount];
  return <InfoLine name={name} value={value} padBelow/>;
};


/**
 * A React component to show vaccine information, if present
 * @param  {Object} props
 * @param  {Object} props.node  branch node which is currently highlighted
 */
const VaccineInfo = ({node, t}) => {
  const vaccineInfo = getVaccineFromNode(node);
  if (!vaccineInfo) return null;
  const renderElements = [];
  if (vaccineInfo.selection_date) {
    renderElements.push(<InfoLine name={t("Vaccine selected")+":"} value={vaccineInfo.selection_date} key="seldate"/>);
  }
  if (vaccineInfo.start_date) {
    renderElements.push(<InfoLine name={t("Vaccine start date")+":"} value={vaccineInfo.start_date} key="startdate"/>);
  }
  if (vaccineInfo.end_date) {
    renderElements.push(<InfoLine name={t("Vaccine end date")+":"} value={vaccineInfo.end_date} key="enddate"/>);
  }
  if (vaccineInfo.serum) {
    renderElements.push(<InfoLine name={t("Serum strain")} key="serum"/>);
  }
  return renderElements;
};

/**
 * A React component to show attribution information, if present
 * @param  {Object} props
 * @param  {Object} props.node  branch node which is currently highlighted
 */
const AttributionInfo = ({node}) => {
  const renderElements = [];
  const authorInfo = getFullAuthorInfoFromNode(node);
  if (authorInfo) {
    renderElements.push(<InfoLine name="Author:" value={authorInfo.value} key="author"/>);
  }

  /* The `gisaid_epi_isl` is a special value attached to nodes introduced during the 2019 nCoV outbreak.
  If set, we display this extra piece of information on hover */
  const gisaid_epi_isl = getTraitFromNode(node, "gisaid_epi_isl");
  if (isValueValid(gisaid_epi_isl)) {
    const epi_isl = gisaid_epi_isl.split("_")[2];
    renderElements.push(<InfoLine name="GISAID EPI ISL:" value={epi_isl} key="gisaid_epi_isl"/>);
  }

  return renderElements;
};

const Container = ({node, panelDims, children}) => {
  const xOffset = 10;
  const yOffset = 10;
  const width = 200;

  /* this adjusts the x-axis for the right tree in dual tree view */
  const xPos = node.shell.that.params.orientation[0] === -1 ?
    panelDims.width / 2 + panelDims.spaceBetweenTrees + node.shell.xTip :
    node.shell.xTip;
  const yPos = node.shell.yTip;
  const styles = {
    container: {
      position: "absolute",
      width,
      padding: "10px",
      borderRadius: 10,
      zIndex: 1000,
      pointerEvents: "none",
      fontFamily: infoPanelStyles.panel.fontFamily,
      fontSize: 14,
      lineHeight: 1,
      fontWeight: infoPanelStyles.panel.fontWeight,
      color: infoPanelStyles.panel.color,
      backgroundColor: infoPanelStyles.panel.backgroundColor,
      wordWrap: "break-word",
      wordBreak: "break-word"
    }
  };
  if (xPos < panelDims.width * 0.6) {
    styles.container.left = xPos + xOffset;
  } else {
    styles.container.right = panelDims.width - xPos + xOffset;
  }
  if (yPos < panelDims.height * 0.55) {
    styles.container.top = yPos + 4 * yOffset;
  } else {
    styles.container.bottom = panelDims.height - yPos + yOffset;
  }


  return (
    <div style={styles.container}>
      <div className={"tooltip"} style={infoPanelStyles.tooltip}>
        {children}
      </div>
    </div>
  );
};

const Comment = ({children}) => (
  <div style={infoPanelStyles.comment}>
    {children}
  </div>
);

const HoverInfoPanel = ({
  hovered,
  colorBy,
  colorByConfidence,
  colorScale,
  panelDims,
  colorings,
  t
}) => {
  if (!hovered) return null;
  const node = hovered.d.n;
  const idxOfInViewRootNode = getIdxOfInViewRootNode(node);

  return (
    <Container node={node} panelDims={panelDims}>
      {hovered.type === ".tip" ? (
        <>
          <StrainName name={node.name}/>
          <VaccineInfo node={node} t={t}/>
          <Mutations node={node} t={t}/>
          <BranchLength node={node} t={t}/>
          <ColorBy node={node} colorBy={colorBy} colorByConfidence={colorByConfidence} colorScale={colorScale} colorings={colorings}/>
          <AttributionInfo node={node}/>
          <Comment>{t("Click on tip to display more info")}</Comment>
        </>
      ) : (
        <>
          <BranchDescendents node={node} t={t}/>
          <Mutations node={node} t={t}/>
          <BranchLength node={node} t={t}/>
          <ColorBy node={node} colorBy={colorBy} colorByConfidence={colorByConfidence} colorScale={colorScale} colorings={colorings}/>
          <Comment>
            {idxOfInViewRootNode === node.arrayIdx ? t('Click to zoom out to parent clade') : t('Click to zoom into clade')}
          </Comment>
        </>
      )}
    </Container>
  );
};

export default HoverInfoPanel;
