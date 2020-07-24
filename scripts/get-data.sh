#!/bin/bash
data_files=(
  "manifest_guest.json" \
  "dengue_all.json" "dengue_denv1.json" "dengue_denv2.json" "dengue_denv3.json" "dengue_denv4.json"\
  "ebola.json" \
  "ebola_2019-09-14-no-epi-id_meta.json" "ebola_2019-09-14-no-epi-id_tree.json" \
  "lassa_s_tree.json" "lassa_s_meta.json" \
  "lassa_l_tree.json" "lassa_l_meta.json" \
  "measles.json" \
  "mers_tree.json" "mers_meta.json" \
  "mumps_global.json" "mumps_na.json" \
  "WNV_NA_tree.json" "WNV_NA_meta.json" \
  "zika.json" \
  "flu_avian_h7n9_ha.json" \
  "flu_avian_h7n9_mp.json" \
  "flu_avian_h7n9_na.json" \
  "flu_avian_h7n9_np.json" \
  "flu_avian_h7n9_ns.json" \
  "flu_avian_h7n9_pa.json" \
  "flu_avian_h7n9_pb1.json" \
  "flu_avian_h7n9_pb2.json" \
  "flu_seasonal_h3n2_ha_2y.json" "flu_seasonal_h3n2_ha_2y_tip-frequencies.json" \
  "flu_seasonal_h3n2_ha_3y.json" "flu_seasonal_h3n2_ha_3y_tip-frequencies.json" \
  "flu_seasonal_h3n2_ha_6y.json" "flu_seasonal_h3n2_ha_6y_tip-frequencies.json" \
  "flu_seasonal_h3n2_ha_12y.json" "flu_seasonal_h3n2_ha_12y_tip-frequencies.json" \
  "flu_seasonal_h3n2_na_2y.json" "flu_seasonal_h3n2_na_2y_tip-frequencies.json" \
  "flu_seasonal_h3n2_na_3y.json" "flu_seasonal_h3n2_na_3y_tip-frequencies.json" \
  "flu_seasonal_h3n2_na_6y.json" "flu_seasonal_h3n2_na_6y_tip-frequencies.json" \
  "flu_seasonal_h3n2_na_12y.json" "flu_seasonal_h3n2_na_12y_tip-frequencies.json" \
  "flu_seasonal_h1n1pdm_ha_2y.json" "flu_seasonal_h1n1pdm_ha_2y_tip-frequencies.json" \
  "flu_seasonal_h1n1pdm_ha_3y.json" "flu_seasonal_h1n1pdm_ha_3y_tip-frequencies.json" \
  "flu_seasonal_h1n1pdm_ha_6y.json" "flu_seasonal_h1n1pdm_ha_6y_tip-frequencies.json" \
  "flu_seasonal_h1n1pdm_ha_12y.json" "flu_seasonal_h1n1pdm_ha_12y_tip-frequencies.json" \
  "flu_seasonal_h1n1pdm_ha_pandemic_meta.json" "flu_seasonal_h1n1pdm_ha_pandemic_tree.json" "flu_seasonal_h1n1pdm_ha_pandemic_tip-frequencies.json" \
  "flu_seasonal_h1n1pdm_na_2y.json" "flu_seasonal_h1n1pdm_na_2y_tip-frequencies.json" \
  "flu_seasonal_h1n1pdm_na_3y.json" "flu_seasonal_h1n1pdm_na_3y_tip-frequencies.json" \
  "flu_seasonal_h1n1pdm_na_6y.json" "flu_seasonal_h1n1pdm_na_6y_tip-frequencies.json" \
  "flu_seasonal_h1n1pdm_na_12y.json" "flu_seasonal_h1n1pdm_na_12y_tip-frequencies.json" \
  "flu_seasonal_h1n1pdm_na_pandemic_tree.json" "flu_seasonal_h1n1pdm_na_pandemic_meta.json" "flu_seasonal_h1n1pdm_na_pandemic_tip-frequencies.json" \
  "flu_seasonal_vic_ha_2y.json" "flu_seasonal_vic_ha_2y_tip-frequencies.json" \
  "flu_seasonal_vic_ha_3y.json" "flu_seasonal_vic_ha_3y_tip-frequencies.json" \
  "flu_seasonal_vic_ha_6y.json" "flu_seasonal_vic_ha_6y_tip-frequencies.json" \
  "flu_seasonal_vic_ha_12y.json" "flu_seasonal_vic_ha_12y_tip-frequencies.json" \
  "flu_seasonal_vic_na_2y.json" "flu_seasonal_vic_na_2y_tip-frequencies.json" \
  "flu_seasonal_vic_na_3y.json" "flu_seasonal_vic_na_3y_tip-frequencies.json" \
  "flu_seasonal_vic_na_6y.json" "flu_seasonal_vic_na_6y_tip-frequencies.json" \
  "flu_seasonal_vic_na_12y.json" "flu_seasonal_vic_na_12y_tip-frequencies.json" \
  "flu_seasonal_yam_ha_2y.json" "flu_seasonal_yam_ha_2y_tip-frequencies.json" \
  "flu_seasonal_yam_ha_3y.json" "flu_seasonal_yam_ha_3y_tip-frequencies.json" \
  "flu_seasonal_yam_ha_6y.json" "flu_seasonal_yam_ha_6y_tip-frequencies.json" \
  "flu_seasonal_yam_ha_12y.json" "flu_seasonal_yam_ha_12y_tip-frequencies.json" \
  "flu_seasonal_yam_na_2y.json" "flu_seasonal_yam_na_2y_tip-frequencies.json" \
  "flu_seasonal_yam_na_3y.json" "flu_seasonal_yam_na_3y_tip-frequencies.json" \
  "flu_seasonal_yam_na_6y.json" "flu_seasonal_yam_na_6y_tip-frequencies.json" \
  "flu_seasonal_yam_na_12y.json" "flu_seasonal_yam_na_12y_tip-frequencies.json" \
  "tb_global_meta.json" "tb_global_tree.json" \
  "enterovirus_d68_genome_meta.json" "enterovirus_d68_genome_tree.json" \
  "enterovirus_d68_vp1_meta.json" "enterovirus_d68_vp1_tree.json" \
  # The ncov datasets. It's not worth downloading them all, just grab the latest
  "ncov_global.json" "ncov_africa.json" "ncov_oceania.json" "ncov_asia.json" \
  "ncov_europe.json" "ncov_north-america.json" "ncov_south-america.json" \
  "ncov_non-subsampled.json" \
  # Adding the ncov datasets which are required by the narratives so they can be viewed locally
  # (Note that these all include the date of upload in the filename)
  "ncov_2020-01-23.json" "ncov_2020-01-25.json" "ncov_2020-01-26.json" "ncov_2020-01-30.json" \
  "ncov_2020-03-04.json" "ncov_2020-03-05.json" "ncov_2020-03-11.json" "ncov_2020-03-13.json" \
  "ncov_2020-03-20.json" "ncov_2020-03-27.json" "ncov_2020-04-03.json" \
  "ncov_global_2020-04-09.json" "ncov_north-america_2020-04-17.json" \
)

rm -rf data/
mkdir -p data/
for i in "${data_files[@]}"
do
  curl http://data.nextstrain.org/"${i}" --compressed -o data/"${i}"
done

staging_files=(
  "testing_states.json" \
)
for i in "${staging_files[@]}"
do
  curl http://staging.nextstrain.org/"${i}" --compressed -o data/"${i}"
done

echo "The local data directory ./data now contains up-to-date datasets from http://data.nextstrain.org"
