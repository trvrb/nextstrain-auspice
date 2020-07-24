import React from "react";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";

import Toggle from "./toggle";
import { controlsWidth } from "../../util/globals";
import { CHANGE_MAP_DISPLAY_TYPE } from "../../actions/types";

@connect((state) => {
  return {
    mapDisplayType: state.controls.mapDisplayType,
    mapDisplayTypesAvailable: state.controls.mapDisplayTypesAvailable
  };
})
class ToggleMapDisplayType extends React.Component {
  render() {
    const { t } = this.props;

    if (this.props.mapDisplayTypesAvailable.length !== 2) return null;
    return (
      <div style={{marginBottom: 10, width: controlsWidth, fontSize: 14}}>
        <Toggle
          display
          on={this.props.mapDisplayType === "network"}
          callback={() => {
            this.props.dispatch({
              type: CHANGE_MAP_DISPLAY_TYPE,
              mapDisplayTypesAvailable: this.props.mapDisplayTypesAvailable,
              mapDisplayType: this.props.mapDisplayType === "geo" ? "network" : "geo"
            });
          }}
          label={t("sidebar:Show network layout view")}
        />
      </div>
    );
  }
}

export default withTranslation()(ToggleMapDisplayType);
