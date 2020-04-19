import React from "react";
import PropTypes from 'prop-types';
import { connect } from "react-redux";
import Select from "react-select";
import { debounce } from "lodash";
import { sidebarField } from "../../globalStyles";
import { controlsWidth, nucleotide_gene } from "../../util/globals";
import { changeColorBy } from "../../actions/colors";
import { analyticsControlsEvent } from "../../util/googleAnalytics";
import { isColorByGenotype, decodeColorByGenotype, encodeColorByGenotype, decodePositions } from "../../util/getGenotype";

/* the reason why we have colorBy as state (here) and in redux
   is for the case where we select genotype, then wait for the
   base to be selected, so we modify state but not yet dispatch */

@connect((state) => {
  return {
    colorBy: state.controls.colorBy,
    geneLength: state.controls.geneLength,
    colorings: state.metadata.colorings,
    geneMap: state.entropy.geneMap
  };
})
class ColorBy extends React.Component {
  constructor(props) {
    super(props);

    this.BLANK_STATE = {
      // These are values for controlled form components, so cannot be null.
      colorBySelected: "",
      geneSelected: "",
      positionSelected: ""
    };

    this.state = this.newState({
      colorBySelected: props.colorBy
    });
  }
  static propTypes = {
    colorBy: PropTypes.string.isRequired,
    geneLength: PropTypes.object.isRequired,
    colorings: PropTypes.object.isRequired,
    dispatch: PropTypes.func.isRequired
  }

  // Applies the given state to the immutable blank state and replaces the
  // current state with the result.
  replaceState(state) {
    this.setState((oldState, props) => this.newState(state)); // eslint-disable-line no-unused-vars
  }

  newState(state) {
    return {
      ...this.BLANK_STATE,
      ...state
    };
  }

  // State from the outside world enters via props.
  componentWillReceiveProps(nextProps) {
    if (this.props.colorBy !== nextProps.colorBy) {
      if (isColorByGenotype(nextProps.colorBy)) {
        const genotype = decodeColorByGenotype(nextProps.colorBy);

        if (genotype) {
          this.replaceState({
            colorBySelected: "gt",
            geneSelected: genotype.gene,
            positionSelected: genotype.positions.join(",")
          });
        }
      } else {
        this.replaceState({
          colorBySelected: nextProps.colorBy
        });
      }
    }
  }

  // Our internal state is published back to the outside world when it changes.
  componentDidUpdate() {
    const colorBySelected = this.state.colorBySelected;

    if (colorBySelected === "gt") {
      const { geneSelected, positionSelected } = this.state;

      // Only dispatch a change to the app's colorBy if we have a
      // fully-specified genotype (gene and position).
      if (geneSelected && positionSelected) {
        const genotype = encodeColorByGenotype({
          gene: geneSelected,
          positions: decodePositions(positionSelected, this.props.geneLength[geneSelected])
        });

        if (genotype) {
          this.dispatchColorByGenotype(genotype);
        }
      }
    } else {
      this.dispatchColorBy(colorBySelected);
    }
  }

  dispatchColorBy(colorBy, name = colorBy) {
    analyticsControlsEvent(`color-by-${name}`);
    this.props.dispatch(changeColorBy(colorBy));
  }

  dispatchColorByGenotype = debounce((genotype) => {
    this.dispatchColorBy(genotype, "genotype");
  }, 400);

  getGtGeneOptions() {
    let options = [];
    if (this.props.geneMap) {
      options = Object.keys(this.props.geneMap).map((prot) => ({value: prot, label: prot}));
      options[options.length] = {value: nucleotide_gene, label: "nucleotide"};
    }
    return options;
  }

  gtGeneSelect() {
    const gtGeneOptions = this.getGtGeneOptions();
    return (
      <Select
        name="selectGenotype"
        id="selectGenotype"
        placeholder="gene…"
        value={this.state.geneSelected}
        options={gtGeneOptions}
        clearable={false}
        searchable
        multi={false}
        onChange={(opt) => {
          this.setState({ geneSelected: opt.value });
        }}
      />
    );
  }

  gtPositionInput() {
    const { geneSelected } = this.state;

    const geneLength = Math.floor(this.props.geneLength[geneSelected]);

    const placeholder = geneSelected
      ? `${geneSelected} position (1–${geneLength})…`
      : `position…`;

    return (
      <input
        type="text"
        style={sidebarField}
        placeholder={placeholder}
        value={this.state.positionSelected}
        onChange={(e) => {
          this.setState({ positionSelected: e.target.value });
        }}
      />
    );
  }

  isNormalInteger(str) {
    const n = Math.floor(Number(str));
    return String(n) === str && n >= 0;
  }

  getStyles() {
    return {
      base: {
        width: controlsWidth,
        marginBottom: 0,
        fontSize: 14
      }
    };
  }

  render() {
    const styles = this.getStyles();

    const colorOptions = Object.keys(this.props.colorings)
      .map((key) => ({value: key, label: this.props.colorings[key].title}));

    return (
      <div style={styles.base} id="selectColorBy">
        <Select
          name="selectColorBy"
          value={this.state.colorBySelected}
          options={colorOptions}
          clearable={false}
          searchable={false}
          multi={false}
          onChange={(opt) => {
            this.replaceState({ colorBySelected: opt.value });
          }}
        />
        {this.state.colorBySelected === "gt" ?
          <div>
            {this.gtGeneSelect()}
            {this.gtPositionInput()}
          </div>
          :
          null
        }
      </div>
    );
  }
}

export default ColorBy;
