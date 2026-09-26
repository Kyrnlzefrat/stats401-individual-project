const DATA_URL = "data/bulbul_china.csv";
const PROVINCE_GEOJSON_URL = "https://raw.githubusercontent.com/junwang23/geoCN/master/geojson/china_provinces.json";

const state = {
  records: [],
  features: [],
  selectedProvince: null,
  selectedYear: null,
  projection: null,
  path: null,
  mapSvg: null,
  trendSvg: null
};

const $ = (id) => document.getElementById(id);
const fmt = (n) => new Intl.NumberFormat("en-US").format(n);

function cleanName(value) {
  if (value == null) return "Unknown";
  const raw = String(value).trim();

  // Prefer the English province names used by cn-atlas whenever the
  // source data already provides an English name.
  const aliases = {
    "北京市": "Beijing", "北京": "Beijing",
    "天津市": "Tianjin", "天津": "Tianjin",
    "河北省": "Hebei", "河北": "Hebei",
    "山西省": "Shanxi", "山西": "Shanxi",
    "内蒙古自治区": "Inner Mongolia", "内蒙古": "Inner Mongolia",
    "辽宁省": "Liaoning", "辽宁": "Liaoning",
    "吉林省": "Jilin", "吉林": "Jilin",
    "黑龙江省": "Heilongjiang", "黑龙江": "Heilongjiang",
    "上海市": "Shanghai", "上海": "Shanghai",
    "江苏省": "Jiangsu", "江苏": "Jiangsu",
    "浙江省": "Zhejiang", "浙江": "Zhejiang",
    "安徽省": "Anhui", "安徽": "Anhui",
    "福建省": "Fujian", "福建": "Fujian",
    "江西省": "Jiangxi", "江西": "Jiangxi",
    "山东省": "Shandong", "山东": "Shandong",
    "河南省": "Henan", "河南": "Henan",
    "湖北省": "Hubei", "湖北": "Hubei",
    "湖南省": "Hunan", "湖南": "Hunan",
    "广东省": "Guangdong", "广东": "Guangdong",
    "广西壮族自治区": "Guangxi", "广西": "Guangxi",
    "海南省": "Hainan", "海南": "Hainan",
    "重庆市": "Chongqing", "重庆": "Chongqing",
    "四川省": "Sichuan", "四川": "Sichuan",
    "贵州省": "Guizhou", "贵州": "Guizhou",
    "云南省": "Yunnan", "云南": "Yunnan",
    "西藏自治区": "Tibet", "西藏": "Tibet",
    "陕西省": "Shaanxi", "陕西": "Shaanxi",
    "甘肃省": "Gansu", "甘肃": "Gansu",
    "青海省": "Qinghai", "青海": "Qinghai",
    "宁夏回族自治区": "Ningxia", "宁夏": "Ningxia",
    "新疆维吾尔自治区": "Xinjiang", "新疆": "Xinjiang",
    "台湾省": "Taiwan", "台湾": "Taiwan",
    "香港特别行政区": "Hong Kong", "香港": "Hong Kong",
    "澳门特别行政区": "Macau", "澳门": "Macau"
  };

  if (aliases[raw]) return aliases[raw];
  return raw;
}

function recordProvince(r) {
  return cleanName(r.province || r.stateProvince || r.state || r.region || "Unknown");
}

function recordYear(r) {
  const x = Number(r.year || (r.eventDate ? String(r.eventDate).slice(0, 4) : NaN));
  return Number.isFinite(x) ? x : null;
}

function recordLat(r) {
  return Number(r.decimalLatitude ?? r.latitude ?? r.lat);
}

function recordLon(r) {
  return Number(r.decimalLongitude ?? r.longitude ?? r.lon);
}

function normalizeRows(rows) {
  return rows
    .map((r, i) => ({
      id: r.gbifID || r.id || i,
      year: recordYear(r),
      lat: recordLat(r),
      lon: recordLon(r),
      province: recordProvince(r)
    }))
    .filter(r => Number.isFinite(r.year) && Number.isFinite(r.lat) && Number.isFinite(r.lon));
}

function featureName(f) {
  return cleanName(
    f?.properties?.name ||
    f?.properties?.NAME ||
    f?.properties?.NAME_1 ||
    f?.properties?.province ||
    f?.properties?.地名 ||
    f?.properties?.省 ||
    "Unknown"
  );
}

function provinceForPoint(record) {
  const point = [record.lon, record.lat];
  const hit = state.features.find(f => d3.geoContains(f, point));
  return hit ? featureName(hit) : record.province;
}

async function loadData() {
  const text = await d3.text(DATA_URL);
  if (!text) throw new Error(`Could not load ${DATA_URL}`);
  const rows = d3.csvParse(text);
  const records = normalizeRows(rows);
  if (!records.length) throw new Error("The CSV loaded, but no valid year/coordinate records were found.");
  return records;
}

async function loadProvinceGeoJSON() {
  const response = await fetch(PROVINCE_GEOJSON_URL);
  if (!response.ok) throw new Error(`Could not load province boundaries: ${response.status}`);
  const geo = await response.json();
  return geo.features || [];
}

function allYears() {
  return [...new Set(state.records.map(r => r.year))].sort(d3.ascending);
}

function provinceCounts(records) {
  return d3.rollup(records, v => v.length, r => r.province);
}

function assignSpatialProvinces() {
  state.records.forEach(r => {
    r.province = provinceForPoint(r);
  });
}

function currentMapRecords() {
  return state.records.filter(r => r.year === state.selectedYear);
}

function filteredRecords() {
  if (!state.selectedProvince) return state.records;
  return state.records.filter(r => r.province === state.selectedProvince);
}

function setStatus(text, error = false) {
  $("dataStatus").textContent = text;
  $("dataStatus").style.background = error ? "#f3ebe1" : "#dfeee7";
  $("dataStatus").style.color = error ? "#886646" : "#2f6f59";
}

function buildYearSelect() {
  const years = allYears();
  const select = $("yearSelect");
  const yearCounts = d3.rollup(state.records, v => v.length, r => r.year);
  select.innerHTML = "";

  years.forEach(y => {
    const option = document.createElement("option");
    option.value = y;
    option.textContent = `${y} (${fmt(yearCounts.get(y) || 0)})`;
    select.appendChild(option);
  });

  const informativeYears = years.filter(y => (yearCounts.get(y) || 0) > 0);
  state.selectedYear = informativeYears.at(-1) ?? years.at(-1) ?? null;
  if (state.selectedYear !== null) select.value = state.selectedYear;

  select.addEventListener("change", e => {
    state.selectedYear = Number(e.target.value);
    renderMap();
    updateHeadline();
    updateYearNote();
  });
}
function initializeProjection(features) {
  const wrap = $("mapWrap");
  const width = Math.max(420, wrap.clientWidth);
  const height = Math.max(420, wrap.clientHeight);

  state.mapSvg = d3.select("#map")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // geoCN is a standard lon/lat GeoJSON dataset that can be plotted
  // directly with d3.geoMercator. Use an explicit China-centered view
  // rather than fitting against disconnected island geometries.
  const projection = d3.geoMercator()
    .center([105, 38])
    .scale(Math.min(width * 1.10, height * 1.95))
    .translate([width / 2, height / 2 + 18]);

  state.projection = projection;
  state.path = d3.geoPath(projection);
  state.mapSvg.selectAll("*").remove();
}

function renderMap() {
  const features = state.features;
  const records = currentMapRecords();
  const counts = provinceCounts(records);
  const values = features.map(f => counts.get(featureName(f)) || 0);
  const positiveValues = values.filter(v => v > 0);
  const maxCount = d3.max(positiveValues) || 1;

  // Keep zero-record provinces visible. This is important when a selected
  // year has sparse observations: geography should not disappear.
  const color = d3.scaleSequential()
    .domain([0, Math.max(1, maxCount)])
    .interpolator(t => d3.interpolateRgb("#eef4f0", "#2f6f59")(t));

  const svg = state.mapSvg;
  svg.selectAll("g.map-layer").remove();

  const mapLayer = svg.append("g").attr("class", "map-layer");

  // Soft background behind the geography.
  mapLayer.append("rect")
    .attr("class", "map-background")
    .attr("x", 0).attr("y", 0)
    .attr("width", +svg.attr("viewBox").split(" ")[2])
    .attr("height", +svg.attr("viewBox").split(" ")[3])
    .attr("fill", "#f4f7f5");

  const tooltip = $("mapTooltip");
  const wrap = $("mapWrap");

  mapLayer.selectAll("path.province")
    .data(features, featureName)
    .join("path")
    .attr("class", d => {
      const selected = featureName(d) === state.selectedProvince;
      const dimmed = state.selectedProvince && !selected;
      return `province${selected ? " selected" : ""}${dimmed ? " dimmed" : ""}`;
    })
    .attr("d", state.path)
    .attr("fill", d => color(counts.get(featureName(d)) || 0))
    .attr("stroke", "#9fb2a8")
    .attr("stroke-width", 0.8)
    .attr("vector-effect", "non-scaling-stroke")
    .on("mouseenter", function(event, feature) {
      const name = featureName(feature);
      const count = counts.get(name) || 0;
      tooltip.innerHTML = `<strong>${escapeHtml(name)}</strong><br>${fmt(count)} records in ${state.selectedYear}`;
      tooltip.style.display = "block";
      d3.select(this).raise().attr("stroke", "#203d31").attr("stroke-width", 1.7);
    })
    .on("mousemove", function(event) {
      const r = wrap.getBoundingClientRect();
      tooltip.style.left = `${Math.min(r.width - 200, event.offsetX + 12)}px`;
      tooltip.style.top = `${Math.max(10, event.offsetY - 15)}px`;
    })
    .on("mouseleave", function() {
      tooltip.style.display = "none";
      const selected = d3.select(this).classed("selected");
      d3.select(this)
        .attr("stroke", selected ? "#18382d" : "#9fb2a8")
        .attr("stroke-width", selected ? 1.8 : 0.8);
    })
    .on("click", function(event, feature) {
      state.selectedProvince = featureName(feature);
      renderMap();
      renderTrend();
      updateSelectionUI();
      updateHeadline();
    });

  // Keep the geography visible even in sparse/zero-record years.
  if (records.length === 0) {
    const [vw, vh] = svg.attr("viewBox").split(" ").slice(2).map(Number);
    mapLayer.append("text")
      .attr("class", "no-records-note")
      .attr("x", vw / 2)
      .attr("y", 42)
      .attr("text-anchor", "middle")
      .text(`No records in ${state.selectedYear}`);
  }

  // Labels are shown only where the polygon is large enough to avoid clutter.
  const labelPath = d3.geoPath(state.projection);
  mapLayer.selectAll("text.province-label")
    .data(features.filter(f => {
      const [[x0, y0], [x1, y1]] = labelPath.bounds(f);
      return (x1 - x0) * (y1 - y0) > 500;
    }), featureName)
    .join("text")
    .attr("class", "province-label")
    .attr("x", d => labelPath.centroid(d)[0])
    .attr("y", d => labelPath.centroid(d)[1] + 3)
    .attr("text-anchor", "middle")
    .attr("fill", "#557068")
    .attr("font-size", 9)
    .attr("font-weight", 600)
    .attr("pointer-events", "none")
    .text(d => featureName(d));
}
function annualCounts(records) {
  const counts = d3.rollup(records, v => v.length, r => r.year);
  return allYears().map(year => ({ year, count: counts.get(year) || 0 }));
}

function renderTrend() {
  const wrap = $("trendWrap");
  const width = wrap.clientWidth;
  const height = wrap.clientHeight;
  state.trendSvg = d3.select("#trend").attr("viewBox", `0 0 ${width} ${height}`);
  state.trendSvg.selectAll("*").remove();

  const margin = { top: 26, right: 22, bottom: 40, left: 46 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const g = state.trendSvg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const selected = filteredRecords();
  const overall = annualCounts(state.records);
  const local = annualCounts(selected);
  const x = d3.scaleLinear().domain(d3.extent(overall, d => d.year)).range([0, innerW]);
  const y = d3.scaleLinear().domain([0, d3.max([...overall, ...local], d => d.count) || 1]).nice().range([innerH, 0]);

  g.append("g").attr("class", "trend-grid")
    .call(d3.axisLeft(y).ticks(5).tickSize(-innerW).tickFormat(""));
  g.append("g").attr("class", "axis")
    .attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(Math.min(6, overall.length)));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5));

  const line = d3.line().x(d => x(d.year)).y(d => y(d.count));
  g.append("path").datum(overall).attr("class", "trend-line overall").attr("d", line);
  if (state.selectedProvince) {
    g.append("path").datum(local).attr("class", "trend-line").attr("d", line);
  }

  const dotData = state.selectedProvince ? local : overall;
  const tooltip = $("trendTooltip");

  g.selectAll("circle.trend-dot")
    .data(dotData)
    .join("circle")
    .attr("class", `trend-dot${state.selectedProvince ? "" : " overall"}`)
    .attr("cx", d => x(d.year))
    .attr("cy", d => y(d.count))
    .attr("r", 3.8)
    .on("mouseenter", function(event, d) {
      tooltip.innerHTML = `<strong>${d.year}</strong><br>${fmt(d.count)} records`;
      tooltip.style.display = "block";
    })
    .on("mousemove", function(event) {
      const r = wrap.getBoundingClientRect();
      tooltip.style.left = `${Math.min(r.width - 140, event.offsetX + 10)}px`;
      tooltip.style.top = `${Math.max(10, event.offsetY - 12)}px`;
    })
    .on("mouseleave", () => { tooltip.style.display = "none"; });

  $("trendTotal").textContent = fmt(selected.length);
  $("trendLabel").textContent = state.selectedProvince ? `${state.selectedProvince} records across all years` : "records across all years";

  const peak = local.reduce((a,b) => b.count > a.count ? b : a, local[0] || {year:"—",count:0});
  $("detailTotal").textContent = fmt(selected.length);
  $("detailFirstYear").textContent = selected.length ? d3.min(selected, d => d.year) : "—";
  $("detailPeakYear").textContent = peak.year;
}

function updateSelectionUI() {
  const name = state.selectedProvince || "China overall";
  $("selectedProvince").textContent = name;
  $("detailTitle").textContent = name;
  $("detailText").textContent = state.selectedProvince
    ? "This province is highlighted on the map and isolated in the annual trend."
    : "Select a province on the map to focus the annual trend.";
}

function updateYearNote() {
  const count = currentMapRecords().length;
  const note = document.querySelector(".dashboard-status");
  if (note) note.textContent = `${fmt(count)} records in ${state.selectedYear}`;
}

function updateHeadline() {
  const count = currentMapRecords().filter(r => !state.selectedProvince || r.province === state.selectedProvince).length;
  $("currentCount").textContent = fmt(count);
}

function clearSelection() {
  state.selectedProvince = null;
  renderMap();
  renderTrend();
  updateSelectionUI();
  updateHeadline();
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function resize() {
  if (!state.features.length) return;
  initializeProjection(state.features);
  renderMap();
  renderTrend();
}

$("clearProvince").addEventListener("click", clearSelection);
window.addEventListener("resize", debounce(resize, 250));

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

(async function init() {
  try {
    setStatus("Loading local dataset…");
    const [records, features] = await Promise.all([loadData(), loadProvinceGeoJSON()]);
    state.records = records;
    state.features = features;
    state.selectedProvince = null;
    assignSpatialProvinces();
    buildYearSelect();
    initializeProjection(state.features);
    renderMap();
    renderTrend();
    updateSelectionUI();
    updateHeadline();
    updateYearNote();
    $("mapLoading").classList.add("hidden");
    const represented = new Set(state.records.map(r => r.province).filter(Boolean));
    setStatus(`Loaded ${fmt(state.records.length)} records · ${represented.size} regions`);
  } catch (err) {
    console.error(err);
    setStatus("Data loading error", true);
    $("mapLoading").innerHTML = `<div style="max-width:360px;text-align:center"><strong>Could not load the local dataset.</strong><br><span style="font-size:.72rem">Run the preprocessing script and make sure <code>data/bulbul_china.csv</code> exists, then open the site through a local HTTP server.</span></div>`;
  }
})();
