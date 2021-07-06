import { controlsWidth } from "./util/globals";

/* IF YOU CHANGE THINGS HERE CHANGE THEM IN static.css AS WELL! */
export const titleFont = "Lato, Helvetica Neue, Helvetica, sans-serif";
export const headerFont = "Lato, Helvetica Neue, Helvetica, sans-serif";
export const dataFont = "Lato, Helvetica Neue, Helvetica, sans-serif";
export const lighterGrey = "rgb(200, 200, 200)";
export const darkGrey = "#333";
export const medGrey = "#888";
export const lightGrey = "#BBB";
export const extraLightGrey = "#F1F1F1";
export const brandColor = "#5097BA"; // #5DA8A3 (green) or #5097BA (blue)
export const sidebarColor = "#F2F2F2"; // #F4F4F4
export const goColor = "#89B77F"; // green
export const pauseColor = "#E39B39"; // orange

// http://stackoverflow.com/questions/1895476/how-to-style-a-select-dropdown-with-css-only-without-javascript
export const sidebarField = {
  backgroundColor: "#FFF",
  fontFamily: dataFont,
  width: controlsWidth - 13,
  borderSpacing: 0,
  fontSize: 14,
  paddingLeft: "10px",
  border: "1px solid #ccc",
  height: 36,
  appearance: "none",
  borderRadius: "4px",
  color: darkGrey,
  fontWeight: 400,
  marginBottom: "3px"
};

export const materialButton = {
  border: "0px",
  backgroundColor: "inherit",
  marginLeft: 0,
  marginTop: 5,
  marginRight: 10,
  marginBottom: 5,
  borderRadius: 2,
  cursor: "pointer",
  padding: 2,
  fontFamily: dataFont,
  color: darkGrey,
  fontWeight: 400,
  textTransform: "uppercase",
  fontSize: 14,
  verticalAlign: "top",
  outline: 0
};

export const materialButtonSelected = {
  border: "0px",
  backgroundColor: "inherit",
  marginLeft: 0,
  marginTop: 5,
  marginRight: 10,
  marginBottom: 5,
  borderRadius: 2,
  cursor: "pointer",
  padding: 2,
  fontFamily: dataFont,
  color: brandColor,
  fontWeight: 400,
  textTransform: "uppercase",
  fontSize: 14,
  verticalAlign: "top",
  outline: 0
};

export const materialButtonOutline = {
  border: "1px solid #CCC",
  backgroundColor: "inherit",
  borderRadius: 3,
  cursor: "pointer",
  paddingTop: 5,
  paddingBottom: 5,
  paddingLeft: 10,
  paddingRight: 10,
  fontFamily: dataFont,
  color: medGrey,
  fontWeight: 400,
  textTransform: "uppercase",
  fontSize: 14,
  verticalAlign: "top"
};

export const tabSingle = {
  borderTop: "1px solid #BBB",
  borderLeft: "1px solid #CCC",
  borderRight: "1px solid #CCC",
  borderBottom: "1px solid #CCC",
  borderRadius: "0px 0px 3px 3px",
  paddingTop: 3,
  paddingBottom: 3,
  paddingLeft: 6,
  paddingRight: 6,
  backgroundColor: "#fff",
  fontWeight: 400,
  color: darkGrey,
  fontFamily: dataFont,
  fontSize: 12,
  textTransform: "uppercase"
};

export const tabGroup = {
  borderTop: "1px solid #BBB",
  borderLeft: "1px solid #CCC",
  borderRight: "1px solid #CCC",
  borderBottom: "1px solid #CCC",
  borderRadius: "0px 0px 3px 3px",
  paddingTop: 3,
  paddingBottom: 3,
  paddingLeft: 6,
  paddingRight: 6,
  backgroundColor: "#fff"
};

export const tabGroupMember = {
  border: "none",
  backgroundColor: "inherit",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  fontFamily: dataFont,
  color: darkGrey,
  fontWeight: 400,
  textTransform: "uppercase",
  fontSize: 12
};

export const tabGroupMemberSelected = {
  border: "none",
  backgroundColor: "inherit",
  padding: 0,
  margin: 0,
  cursor: "pointer",
  fontFamily: dataFont,
  color: brandColor,
  fontWeight: 400,
  textTransform: "uppercase",
  fontSize: 12
};


export const titleStyles = {
  big: {
    fontFamily: titleFont,
    fontSize: 76,
    lineHeight: "76px",
    letterSpacing: -1.8,
    marginTop: 20,
    marginBottom: 10,
    fontWeight: 300,
    color: "#fff"
  },
  small: {
    fontFamily: headerFont,
    fontSize: 16,
    lineHeight: "28px",
    marginTop: 15,
    marginBottom: 5,
    fontWeight: 500,
    color: "#000"
  }
};

export const infoPanelStyles = {
  branchInfoHeading: {
    fontSize: 15,
    fontWeight: 400,
    verticalAlign: "middle",
    padding: "5px"
  },
  buttonLink: {
    float: "right",
    fontFamily: dataFont,
    fontSize: 14,
    fontWeight: 400,
    textDecoration: "none",
    pointerEvents: "auto",
    background: "none",
    color: "white", // link color
    cursor: "pointer",
    textTransform: "uppercase",
    borderRadius: 2,
    border: "1px solid #CCC",
    verticalAlign: "middle"
  },
  tooltip: {
    position: "relative",
    padding: 5,
    color: "white",
    fontFamily: dataFont,
    fontSize: 14,
    lineHeight: 1,
    fontWeight: 300
  },
  modalContainer: {
    position: "absolute",
    width: "100%",
    height: "100%",
    pointerEvents: "all",
    top: 0,
    left: 0,
    zIndex: 2000,
    backgroundColor: "rgba(80, 80, 80, .20)",
    /* FLEXBOX */
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    wordWrap: "break-word",
    wordBreak: "break-word"
  },
  panel: {
    position: "relative",
    paddingLeft: 30,
    padding: "5% 5%",
    borderRadius: 5,
    backgroundColor: "rgba(55,55,55,0.9)",
    color: "white",
    fontFamily: dataFont,
    fontSize: 18,
    lineHeight: 1,
    fontWeight: 300,
    maxWidth: "80%",
    overflowY: "auto"
  },
  modalHeading: {
    fontSize: 24,
    fontWeight: 400
  },
  modalSubheading: {
    fontSize: 20,
    fontWeight: 400,
    marginTop: "20px",
    marginBottom: "20px"
  },
  tooltipHeading: {
    fontSize: 18,
    fontWeight: 400,
    marginBottom: "10px"
  },
  comment: {
    fontStyle: "italic",
    fontWeight: 200,
    fontSize: 14,
    marginTop: "10px"
  },
  topRightMessage: {
    fontStyle: "italic",
    fontWeight: 200,
    fontSize: 14,
    textAlign: "right",
    marginTop: "-20px"
  },
  list: {
    paddingLeft: 15,
    listStyleType: "disc"
  },
  item: {
    paddingTop: 4,
    paddingBottom: 4,
    minWidth: 130,
    verticalAlign: "top"
  },
  link: {
    color: "#5097BA",
    cursor: "pointer",
    fontWeight: 400
  },
  break: {
    marginBottom: "10px"
  }
};
