import React from "react";
import { connect } from "react-redux";
import Select from "react-select";
import { withTranslation } from "react-i18next";
import i18n from "i18next";

import { controlsWidth } from "../../util/globals";
import { analyticsControlsEvent } from "../../util/googleAnalytics";
import { SidebarSubtitle } from "./styles";
import { CHANGE_LANGUAGE } from "../../actions/types";

@connect((state) => {
  return {
    metadata: state.metadata,
    language: state.general.language
  };
})
class Language extends React.Component {

  componentWillMount() {
    i18n.changeLanguage(this.props.language);
  }

  getlanguageOptions() {
    const languages = [
      {value: "de", label: "Deutsch"},
      {value: "en", label: "English"},
      {value: "es", label: "Español"},
      {value: "ru", label: "Русский"},
      {value: "lt", label: "Lietuvių"},
      {value: "pt", label: "Português"},
      {value: "fr", label: "Français"},
      {value: "tr", label: "Türkçe"},
      {value: "ja", label: "日本語"},
      {value: "zh", label: "中文"}
    ];
    return languages;
  }

  changeLanguage(language) {
    analyticsControlsEvent("change-language");
    i18n.changeLanguage(language);
    this.props.dispatch({ type: CHANGE_LANGUAGE, data: language });
  }

  render() {
    const { t } = this.props;
    return (
      <>
        <SidebarSubtitle spaceAbove>
          {t("sidebar:Language")}
        </SidebarSubtitle>
        <div style={{paddingBottom: 100, width: controlsWidth, fontSize: 14}}>
          <Select
            name="selectLanguage"
            id="selectLanguage"
            value={this.props.language}
            options={this.getlanguageOptions()}
            clearable={false}
            searchable={false}
            multi={false}
            onChange={(opt) => {this.changeLanguage(opt.value);}}
          />
        </div>
      </>
    );
  }
}
const WithTranslation = withTranslation()(Language);

export default WithTranslation;
