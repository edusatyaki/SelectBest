// State keeping
let rawData = [];
let columnsData = {};
let chartInstances = {};

let builderState = {
    kpi: [],
    univariate: [],
    bivariate: [],
    multivariate: []
};

let kpiConfig = {}; 
let chartConfig = {}; 
let generatedDraggedCard = null;

// Common Chart Options for Light/Tableau Theme
const commonOptions = {
    chart: {
        background: '#ffffff',
        toolbar: { show: true, tools: { download: true, selection: true, zoom: true, pan: true } },
        animations: { enabled: true, easing: 'easeinout', speed: 800 }
    },
    theme: { mode: 'light' },
    colors: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1'],
    dataLabels: { enabled: false },
    grid: { borderColor: '#ececec', strokeDashArray: 0 },
    tooltip: { theme: 'light' }
};

document.getElementById('data-upload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
        header: true, dynamicTyping: true, skipEmptyLines: true,
        complete: function(results) {
            rawData = results.data;
            processData();
            document.getElementById('data-stats').style.display = 'block';
            document.getElementById('row-count').innerText = rawData.length.toLocaleString();
            document.getElementById('col-count').innerText = Object.keys(columnsData).length;
            initBuilder();
            checkGenerateButton();
        }
    });
});

document.getElementById('clear-dashboard').addEventListener('click', () => {
    initBuilder(); checkGenerateButton();
});

document.getElementById('column-search').addEventListener('input', e => renderSidebarColumns(e.target.value));

document.getElementById('generate-dashboard').addEventListener('click', () => {
    try {
        document.getElementById('builder-view').classList.remove('active');
        document.getElementById('generated-view').classList.add('active');
        renderGeneratedDashboard();
    } catch (err) {
        console.error("Dashboard Generation Error", err);
        alert("There was an error generating the dashboard.");
    }
});

document.getElementById('back-to-builder').addEventListener('click', () => {
    document.getElementById('generated-view').classList.remove('active');
    document.getElementById('builder-view').classList.add('active');
});

// PDF Export Logic (With Pagination Fix)
document.getElementById('download-pdf').addEventListener('click', () => {
    const element = document.getElementById('dashboard-content');
    const opt = {
      margin:       10,
      filename:     'AnalysisMaster_Dashboard.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak:    { mode: ['css', 'avoid-all'] }
    };
    html2pdf().set(opt).from(element).save();
});

function processData() {
    if (rawData.length === 0) return;
    const sample = rawData[0];
    const columns = Object.keys(sample);
    columnsData = {};
    columns.forEach(col => {
        let isNum = true; let checked = 0;
        for (let i = 0; i < rawData.length && checked < 20; i++) {
            if (rawData[i][col] !== null && rawData[i][col] !== undefined && rawData[i][col] !== '') {
                if (typeof rawData[i][col] !== 'number') isNum = false;
                checked++;
            }
        }
        if (isNum) {
            const uniqueVals = new Set();
            for (let i = 0; i < Math.min(100, rawData.length); i++) uniqueVals.add(rawData[i][col]);
            if (uniqueVals.size <= 5 && rawData.length > 50) isNum = false; 
        }
        columnsData[col] = { name: col, type: isNum ? 'num' : 'cat' };
    });
    document.getElementById('column-search').disabled = false;
    renderSidebarColumns();
}

function renderSidebarColumns(filter = '') {
    const dimList = document.getElementById('dimensions-list');
    const msrList = document.getElementById('measures-list');
    dimList.innerHTML = ''; msrList.innerHTML = '';
    
    const cols = Object.values(columnsData);
    if (cols.length === 0) return;
    
    cols.forEach(col => {
        if (filter && !col.name.toLowerCase().includes(filter.toLowerCase())) return;
        const chip = document.createElement('div');
        chip.className = `column-chip ${col.type === 'num' ? 'numeric' : 'category'}`;
        chip.draggable = true; chip.dataset.name = col.name; chip.dataset.type = col.type;
        chip.innerHTML = `<div class="chip-content"><span>${col.name}</span></div>`;
        chip.addEventListener('dragstart', handleDragStart);
        chip.addEventListener('dragend', handleDragEnd);
        if (col.type === 'num') msrList.appendChild(chip);
        else dimList.appendChild(chip);
    });
    if (dimList.children.length === 0) dimList.innerHTML = '<div class="empty-state">No dimensions</div>';
    if (msrList.children.length === 0) msrList.innerHTML = '<div class="empty-state">No measures</div>';
}

let draggedItem = null;
function handleDragStart(e) {
    draggedItem = { name: this.dataset.name, type: this.dataset.type };
    this.classList.add('dragging'); e.dataTransfer.effectAllowed = 'copy';
}
function handleDragEnd(e) {
    this.classList.remove('dragging'); draggedItem = null;
    document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-over'));
}

// BUILDER LOGIC
function initBuilder() {
    builderState = { kpi: [], univariate: [], bivariate: [], multivariate: [] };
    kpiConfig = {}; chartConfig = {};
    addSlotGroup('kpi', 1); addSlotGroup('univariate', 1); addSlotGroup('bivariate', 2); addSlotGroup('multivariate', 3);
    document.getElementById('clear-dashboard').disabled = false;
}

document.querySelectorAll('.btn-add-slot').forEach(btn => {
    btn.addEventListener('click', function() {
        const sec = this.dataset.section;
        const size = parseInt(this.dataset.size || this.parentElement.dataset.size || 1);
        addSlotGroup(sec, size);
    });
});

function addSlotGroup(sectionId, size) {
    builderState[sectionId].push(new Array(size).fill(null));
    renderBuilderSection(sectionId); checkGenerateButton();
}
function removeSlotGroup(sectionId, groupIdx) {
    builderState[sectionId].splice(groupIdx, 1);
    if (sectionId === 'kpi') delete kpiConfig[groupIdx];
    renderBuilderSection(sectionId); checkGenerateButton();
}
function clearSlot(sectionId, groupIdx, slotIdx) {
    builderState[sectionId][groupIdx][slotIdx] = null;
    renderBuilderSection(sectionId); checkGenerateButton();
}
function handleDropOnSlot(sectionId, groupIdx, slotIdx, item) {
    builderState[sectionId][groupIdx][slotIdx] = item;
    renderBuilderSection(sectionId); checkGenerateButton();
}

function renderBuilderSection(sectionId) {
    const list = document.getElementById(`${sectionId}-slots`);
    list.innerHTML = '';
    builderState[sectionId].forEach((group, groupIdx) => {
        const isComplete = group.every(item => item !== null);
        const gDiv = document.createElement('div');
        gDiv.className = `slot-group ${isComplete ? 'complete' : ''}`;
        
        const rBtn = document.createElement('button');
        rBtn.className = 'btn-remove-group'; rBtn.innerHTML = 'X';
        rBtn.onclick = () => removeSlotGroup(sectionId, groupIdx);
        gDiv.appendChild(rBtn);
        
        group.forEach((item, slotIdx) => {
            const sDiv = document.createElement('div');
            sDiv.className = `drop-zone ${item ? 'filled '+ (item.type==='num'?'numeric':'category') : ''}`;
            
            if (item) {
                let extraUI = '';
                if (sectionId === 'kpi') {
                    if (!kpiConfig[groupIdx]) kpiConfig[groupIdx] = (item.type === 'num' ? 'sum' : 'count');
                    const currentFn = kpiConfig[groupIdx];
                    extraUI = `<select class="chart-type-selector" data-g="${groupIdx}" onclick="event.stopPropagation()" style="background:transparent; border:none; color:inherit; font-weight:600;">
                        ${item.type === 'num' ? `<option value="sum" ${currentFn==='sum'?'selected':''}>Sum</option><option value="avg" ${currentFn==='avg'?'selected':''}>Avg</option><option value="max" ${currentFn==='max'?'selected':''}>Max</option><option value="min" ${currentFn==='min'?'selected':''}>Min</option>` : ''}
                        <option value="count" ${currentFn==='count'?'selected':''}>Count</option></select>`;
                }
                sDiv.innerHTML = `<div style="display:flex; align-items:center; gap:8px; width:100%;"><span class="filled-name" style="flex:1;">${item.name}</span>${extraUI}<span class="btn-clear-slot">X</span></div>`;
                if (sectionId === 'kpi') { sDiv.querySelector('.chart-type-selector').addEventListener('change', e => kpiConfig[e.target.dataset.g] = e.target.value); }
                sDiv.querySelector('.btn-clear-slot').onclick = (e) => { e.stopPropagation(); clearSlot(sectionId, groupIdx, slotIdx); };
            } else {
                sDiv.innerHTML = `Drop variable here`;
            }
            sDiv.addEventListener('dragover', e => { e.preventDefault(); if (!item) sDiv.classList.add('drag-over'); });
            sDiv.addEventListener('dragleave', e => sDiv.classList.remove('drag-over') );
            sDiv.addEventListener('drop', e => {
                e.preventDefault(); sDiv.classList.remove('drag-over');
                if (draggedItem) handleDropOnSlot(sectionId, groupIdx, slotIdx, draggedItem);
            });
            gDiv.appendChild(sDiv);
        });
        list.appendChild(gDiv);
    });
}

function checkGenerateButton() {
    let hasValidGroup = false;
    ['kpi', 'univariate', 'bivariate', 'multivariate'].forEach(sec => {
        builderState[sec].forEach(grp => { if (grp.length > 0 && grp.every(i => i !== null)) hasValidGroup = true; });
    });
    document.getElementById('generate-dashboard').disabled = !hasValidGroup;
}

// GENERATION LOGIC
function setupDashCardDraggable(card) {
    card.draggable = true;
    card.addEventListener('dragstart', function(e) {
        generatedDraggedCard = this; this.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'card');
    });
    card.addEventListener('dragend', function() {
        this.style.opacity = '1'; generatedDraggedCard = null;
        document.querySelectorAll('.chart-card, .kpi-card').forEach(c => c.classList.remove('card-drag-over'));
    });
    card.addEventListener('dragover', function(e) {
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
        if (generatedDraggedCard !== this && generatedDraggedCard.parentNode === this.parentNode) this.classList.add('card-drag-over');
    });
    card.addEventListener('dragleave', function() { this.classList.remove('card-drag-over'); });
    card.addEventListener('drop', function(e) {
        e.preventDefault(); this.classList.remove('card-drag-over');
        if (generatedDraggedCard && generatedDraggedCard !== this && generatedDraggedCard.parentNode === this.parentNode) {
            this.parentNode.insertBefore(generatedDraggedCard, this);
            window.dispatchEvent(new Event('resize'));
        }
    });
}

function renderGeneratedDashboard() {
    Object.values(chartInstances).forEach(c => c.destroy());
    chartInstances = {};
    const kpiRow = document.getElementById('generated-kpi');
    const chartsRow = document.getElementById('generated-charts');
    kpiRow.innerHTML = ''; chartsRow.innerHTML = '';
    let chartCounter = 0;

    builderState.kpi.forEach((group, idx) => {
        if (!group.every(i => i)) return;
        renderKPI(kpiRow, group[0], idx);
    });
    const buildCards = (section, prefix, func) => {
        builderState[section].forEach((group) => {
            if (!group.every(i => i)) return;
            chartCounter++; createChartCard(chartsRow, `chart_${chartCounter}`, prefix, func, group);
        });
    };
    buildCards('univariate', 'Univariate', renderUnivariate);
    buildCards('bivariate', 'Bivariate', renderBivariate);
    buildCards('multivariate', 'Multivariate', renderMultivariate);
}

function isGeoColumn(name) {
    return name.toLowerCase().match(/country|state|city|region|location|geo|province/i);
}

function determineValidTypes(items) {
    const num = items.filter(i => i.type === 'num').length;
    const cat = items.filter(i => i.type === 'cat').length;
    const hasGeo = items.some(i => i.type === 'cat' && isGeoColumn(i.name));
    
    if (num === 0 && cat === 1) return hasGeo ? ['geo', 'bar', 'pie', 'donut'] : ['bar', 'pie', 'donut'];
    if (num === 1 && cat === 0) return ['line', 'area', 'bar']; 
    if (num === 2 && cat === 0) return ['scatter'];
    if (num === 1 && cat === 1) return hasGeo ? ['geo', 'bar', 'line', 'area', 'radar', 'pie', 'donut'] : ['bar', 'line', 'area', 'radar', 'pie', 'donut'];
    if (num === 0 && cat === 2) return ['heatmap', 'stacked-bar']; 
    if (num >= 2) return ['bar', 'stacked-bar', 'line', 'area']; 
    if (num === 1 && cat >= 2) return ['stacked-bar', 'bar', 'area']; 
    return ['bar'];
}

function createChartCard(parent, id, titlePrefix, renderFunc, items) {
    const validTypes = determineValidTypes(items);
    if (!chartConfig[id]) chartConfig[id] = validTypes[0];

    const card = document.createElement('div');
    card.className = 'chart-card';
    const titleText = items.map(i => i.name).join(' vs ');
    
    let selectHTML = '';
    if (validTypes.length > 1) {
        selectHTML = `<select class="chart-type-selector" data-id="${id}">${validTypes.map(t => `<option value="${t}" ${chartConfig[id]===t?'selected':''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}</select>`;
    }
    card.innerHTML = `<div class="chart-header"><div class="chart-title">${titleText} <span style="color:#888;font-weight:400;font-size:11px;">(${titlePrefix})</span></div>${selectHTML}</div><div class="chart-wrap" id="${id}"></div>`;
    parent.appendChild(card);
    setupDashCardDraggable(card);
    
    const container = document.getElementById(id);
    if (selectHTML) {
        card.querySelector('.chart-type-selector').addEventListener('change', function(e) {
            chartConfig[e.target.dataset.id] = e.target.value;
            container.innerHTML = '';
            if (chartInstances[id]) chartInstances[id].destroy();
            try { renderFunc(container, items, id); } catch (err) { console.error("Re-render error:", err); }
        });
    }
    
    try { renderFunc(container, items, id); } 
    catch (err) { container.innerHTML = `<div style="padding: 20px; color: red;">Failed to render combination.</div>`; }
}

function getSampledData(limit = 2000) { return rawData.length <= limit ? rawData : rawData.filter((_, i) => i % Math.max(1, Math.floor(rawData.length / limit)) === 0); }

function renderKPI(parent, item, groupId) {
    const calculateValue = (type) => {
        let val = 0; let count = 0;
        rawData.forEach(row => {
            if (row[item.name] !== null && row[item.name] !== undefined && row[item.name] !== '') {
                let numVal = Number(row[item.name]);
                if (!isNaN(numVal)) {
                    if (type === 'sum' || type === 'avg') val += numVal;
                    if (type === 'max') val = count === 0 ? numVal : Math.max(val, numVal);
                    if (type === 'min') val = count === 0 ? numVal : Math.min(val, numVal);
                }
                count++;
            }
        });
        if (type === 'count') return count;
        if (type === 'avg') return count > 0 ? val / count : 0;
        return val;
    };
    
    const card = document.createElement('div'); card.className = 'kpi-card'; card.id = `kpi_card_${groupId}`;
    const render = () => {
        let aggType = kpiConfig[groupId]; let displayVal = calculateValue(aggType);
        if (typeof displayVal === 'number' && !Number.isInteger(displayVal)) displayVal = displayVal.toFixed(2);
        card.innerHTML = `<div class="kpi-label">${item.name} <span style="font-weight:400;color:#999;font-size:10px;">(${aggType})</span></div><div class="kpi-value">${displayVal.toLocaleString()}</div><select class="chart-type-selector" data-g="${groupId}" style="margin-top:8px; width: fit-content;">${item.type === 'num' ? `<option value="sum" ${aggType==='sum'?'selected':''}>Sum</option><option value="avg" ${aggType==='avg'?'selected':''}>Average</option><option value="max" ${aggType==='max'?'selected':''}>Maximum</option><option value="min" ${aggType==='min'?'selected':''}>Minimum</option>` : ''}<option value="count" ${aggType==='count'?'selected':''}>Count</option></select>`;
        card.querySelector('.chart-type-selector').addEventListener('change', function(e) {
            kpiConfig[e.target.dataset.g] = e.target.value; render(); renderBuilderSection('kpi');
        });
    };
    render(); parent.appendChild(card); setupDashCardDraggable(card);
}

function renderUnivariate(container, items, id) {
    const item = items[0]; const type = chartConfig[id];
    let options = { ...commonOptions, series: [], xaxis: {}, yaxis: {} }; options.chart.type = type;
    
    if (item.type === 'cat') {
        const counts = {};
        rawData.forEach(row => { let val = row[item.name]; if (val) counts[val] = (counts[val] || 0) + 1; });
        const sortedKeys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
        
        if (type === 'geo') {
            const locations = []; const zValues = [];
            sortedKeys.forEach(k => { locations.push(String(k)); zValues.push(counts[k]); });
            const data = [{ type: 'choropleth', locationmode: 'country names', locations: locations, z: zValues, colorscale: 'Blues', colorbar: { title: 'Count' } }];
            const layout = { geo: { fitbounds: "locations", showframe: false, showcoastlines: true }, margin: { l: 0, r: 0, t: 0, b: 0 } };
            Plotly.newPlot(container, data, layout, {responsive: true, displayModeBar: true});
            chartInstances[id] = { destroy: () => { Plotly.purge(container); container.innerHTML = ''; } };
            return;
        }

        const limitedKeys = sortedKeys.slice(0, 15);
        if (['pie', 'donut'].includes(type)) {
            options.series = limitedKeys.map(k => counts[k]); options.labels = limitedKeys; delete options.xaxis; delete options.yaxis;
        } else { 
            options.series = [{ name: 'Count', data: limitedKeys.map(k => counts[k]) }]; 
            options.xaxis.categories = limitedKeys; 
            options.xaxis.title = { text: 'Count/Frequency', style: { color: '#666', fontWeight: 600 } };
            options.yaxis.title = { text: item.name, style: { color: '#666', fontWeight: 600 } };
            options.plotOptions = { bar: { borderRadius: 0, horizontal: true } }; 
        }
    } else {
        const vals = []; rawData.forEach(row => { let num = Number(row[item.name]); if (!isNaN(num) && row[item.name] !== null) vals.push(num); });
        if(vals.length > 0) {
            const min = Math.min(...vals); const max = Math.max(...vals); const bins = 15;
            let step = (max - min) / bins; if (step === 0) step = 1; 
            const hist = Array(bins).fill(0);
            vals.forEach(v => { let binKey = Math.max(0, Math.floor((v - min) / step)); if (binKey >= bins) binKey = bins - 1; hist[binKey]++; });
            options.series = [{ name: 'Frequency', data: hist }]; 
            options.xaxis.categories = hist.map((_, i) => `${(min + i * step).toFixed(1)} - ${(min + (i + 1) * step).toFixed(1)}`);
            options.xaxis.title = { text: `${item.name} (Binned)`, style: { color: '#666', fontWeight: 600 } };
            options.yaxis.title = { text: 'Frequency', style: { color: '#666', fontWeight: 600 } };

            if (type === 'bar') options.plotOptions = { bar: { borderRadius: 0 } };
            else if (type === 'area') { options.stroke = { curve: 'smooth' }; options.fill = { type: 'gradient' }; }
            else if (type === 'line') { options.stroke = { curve: 'straight', width: 2 }; }
        } else { container.innerHTML = `<div style="padding: 20px;">No valid data.</div>`; return; }
    }
    const chart = new ApexCharts(container, options); chart.render(); chartInstances[id] = chart;
}

function renderBivariate(container, items, id) {
    const type = chartConfig[id];
    let options = { ...commonOptions, series: [], xaxis: {}, yaxis: {} };
    if (type === 'stacked-bar') options.chart.type = 'bar'; else options.chart.type = type;
    const types = items.map(i => i.type); const names = items.map(i => i.name); const sample = getSampledData(1000);
    
    if (types[0] === 'num' && types[1] === 'num') {
        const seriesData = sample.map(row => { let x = Number(row[names[0]]), y = Number(row[names[1]]); return (!isNaN(x) && !isNaN(y)) ? [x, y] : null; }).filter(Boolean);
        options.series = [{ name: 'Values', data: seriesData }]; 
        options.xaxis.title = { text: names[0], style: { color: '#666', fontWeight: 600 } }; options.xaxis.tickAmount = 6; 
        options.yaxis.title = { text: names[1], style: { color: '#666', fontWeight: 600 } };
    } else if (types.includes('num') && types.includes('cat')) {
        const catName = items[types.indexOf('cat')].name; const numName = items[types.indexOf('num')].name;
        const sums = {}; const counts = {};
        rawData.forEach(row => { let cat = row[catName], num = Number(row[numName]); if (!cat || isNaN(num) || row[numName] === null) return; sums[cat] = (sums[cat] || 0) + num; counts[cat] = (counts[cat] || 0) + 1; });
        
        if (type === 'geo') {
            const locations = []; const zValues = [];
            Object.keys(sums).forEach(k => { locations.push(String(k)); zValues.push(Number((sums[k]/counts[k]).toFixed(2))); });
            const data = [{ type: 'choropleth', locationmode: 'country names', locations: locations, z: zValues, colorscale: 'Blues', colorbar: { title: `Avg ${numName}` }, marker: { line: { color: 'white', width: 0.5 } } }];
            const layout = { geo: { fitbounds: "locations", showframe: false, showcoastlines: true }, margin: { l: 0, r: 0, t: 0, b: 0 } };
            Plotly.newPlot(container, data, layout, {responsive: true, displayModeBar: true});
            chartInstances[id] = { destroy: () => { Plotly.purge(container); container.innerHTML = ''; } };
            return;
        }

        const keys = Object.keys(sums).sort((a,b) => (sums[b]/counts[b]) - (sums[a]/counts[a])).slice(0, 15); const vals = keys.map(k => Number((sums[k] / counts[k]).toFixed(2)));
        if (['pie', 'donut'].includes(type)) { options.series = vals; options.labels = keys; delete options.xaxis; delete options.yaxis; }
        else { 
            options.series = [{ name: `Avg ${numName}`, data: vals }]; 
            options.xaxis.categories = keys; 
            options.xaxis.title = { text: catName, style: { color: '#666', fontWeight: 600 } };
            options.yaxis.title = { text: `Average ${numName}`, style: { color: '#666', fontWeight: 600 } };
            
            if (type === 'bar') options.plotOptions = { bar: { borderRadius: 0, distributed: false, columnWidth: '60%' } }; 
            if (type === 'radar') { options.xaxis = { categories: keys }; delete options.yaxis.title; delete options.xaxis.title; } 
            if (type === 'area') options.stroke = { curve: 'smooth' }; 
        }
    } else if (types[0] === 'cat' && types[1] === 'cat') {
        const matrix = {}; const c1Set = new Set(); const c2Set = new Set();
        rawData.forEach(row => { let v1 = row[names[0]], v2 = row[names[1]]; if(v1 && v2) { c1Set.add(v1); c2Set.add(v2); } });
        const topCat1 = Array.from(c1Set).slice(0, 10); const topCat2 = Array.from(c2Set).slice(0, 10);
        topCat1.forEach(c1 => { matrix[c1] = {}; topCat2.forEach(c2 => matrix[c1][c2] = 0); });
        rawData.forEach(row => { let v1 = row[names[0]], v2 = row[names[1]]; if(matrix[v1] && matrix[v1][v2] !== undefined) matrix[v1][v2]++; });
        
        options.xaxis.title = { text: names[1], style: { color: '#666', fontWeight: 600 } };
        
        if (type === 'stacked-bar') { 
             options.chart.stacked = true; options.series = topCat1.map(c1 => ({ name: String(c1), data: topCat2.map(c2 => matrix[c1][c2]) })); options.xaxis.categories = topCat2; options.plotOptions = { bar: { borderRadius: 0 } }; 
             options.yaxis.title = { text: 'Count/Frequency', style: { color: '#666', fontWeight: 600 } };
        } else { 
             options.series = topCat1.map(c1 => ({ name: String(c1), data: topCat2.map(c2 => ({ x: String(c2), y: matrix[c1][c2] })) })); options.plotOptions = { heatmap: { enableShades: true, colorScale: { ranges: [{ from: 0, to: 100000, color: '#4e79a7' }] } } }; 
             options.yaxis.title = { text: names[0], style: { color: '#666', fontWeight: 600 } };
        }
    }
    const chart = new ApexCharts(container, options); chart.render(); chartInstances[id] = chart;
}

function renderMultivariate(container, items, id) {
    const type = chartConfig[id];
    let options = { ...commonOptions, series: [], xaxis: {}, yaxis: {} };
    if (type === 'stacked-bar') options.chart.type = 'bar'; else options.chart.type = type;
    
    const numItems = items.filter(i => i.type === 'num');
    const catItems = items.filter(i => i.type === 'cat');

    if (numItems.length >= 2) {
        let catName = catItems.length > 0 ? catItems[0].name : null;
        let categories = []; let seriesData = numItems.map(n => ({ name: n.name, data: [] }));
        if (catName) {
            const sums = {}; const counts = {};
            rawData.forEach(row => {
                let cat = row[catName]; if (!cat) return;
                if (!sums[cat]) { sums[cat] = {}; counts[cat] = 0; }
                counts[cat]++;
                numItems.forEach(n => { let val = Number(row[n.name]); if (!isNaN(val)) sums[cat][n.name] = (sums[cat][n.name] || 0) + val; });
            });
            const topCats = Object.keys(sums).slice(0, 15); categories = topCats;
            numItems.forEach((n, i) => { seriesData[i].data = topCats.map(c => Number((sums[c][n.name] / counts[c]).toFixed(2))); });
            options.xaxis.categories = categories;
            options.xaxis.title = { text: catName, style: { color: '#666', fontWeight: 600 } };
        } else {
            const sample = rawData.slice(0, 50);
            numItems.forEach((n, i) => { seriesData[i].data = sample.map(row => Number(row[n.name]) || 0); });
            options.xaxis.labels = { show: false };
            options.xaxis.title = { text: 'Data Points (Index)', style: { color: '#666', fontWeight: 600 } };
        }
        
        options.yaxis.title = { text: 'Aggregated Values', style: { color: '#666', fontWeight: 600 } };
        options.series = seriesData;
        if (type === 'stacked-bar') { options.chart.stacked = true; options.plotOptions = { bar: { borderRadius: 0 } }; }
        else if (type === 'bar') options.plotOptions = { bar: { borderRadius: 0 } };
        else if (type === 'area') options.stroke = { curve: 'smooth' };
    } 
    else if (numItems.length === 1 && catItems.length >= 2) {
        const c1 = catItems[0].name; const c2 = catItems[1].name; const numName = numItems[0].name;
        const sums = {};
        rawData.forEach(row => {
            let g1 = row[c1], g2 = row[c2], val = Number(row[numName]);
            if (!g1 || !g2 || isNaN(val)) return;
            if (!sums[g1]) sums[g1] = {};
            sums[g1][g2] = (sums[g1][g2] || 0) + val;
        });
        const topC1 = Object.keys(sums).slice(0, 8); let allC2Set = new Set();
        topC1.forEach(g1 => Object.keys(sums[g1]).forEach(g2 => allC2Set.add(g2)));
        const topC2 = Array.from(allC2Set).slice(0, 8);
        options.series = topC2.map(g2 => ({ name: String(g2), data: topC1.map(g1 => sums[g1][g2] || 0) }));
        options.xaxis.categories = topC1;
        
        options.xaxis.title = { text: c1, style: { color: '#666', fontWeight: 600 } };
        options.yaxis.title = { text: `Sum of ${numName}`, style: { color: '#666', fontWeight: 600 } };
        
        if (type === 'stacked-bar') { options.chart.stacked = true; options.plotOptions = { bar: { borderRadius: 0 } }; }
        else if (type === 'bar') options.plotOptions = { bar: { borderRadius: 0 } };
        else if (type === 'area') options.stroke = { curve: 'smooth' };
    } 
    else {
        container.innerHTML = `<div style="padding: 20px; color: #777; font-size: 12px; text-align:center;">Cannot comprehensively chart 3+ pure dimensions without measures.</div>`; return;
    }
    const chart = new ApexCharts(container, options); chart.render(); chartInstances[id] = chart;
}
