(function() {
  const COLOR_MAP = {
    code: '#4A90D9',
    rodata: '#50B86C',
    rwdata: '#E8943A',
    zidata: '#E05252',
    pad: '#888888',
  };

  const data = window.__DATA__;
  let currentViewMode = 'region';
  let currentTree = data.regionTree;

  init();

  function init() {
    updateSummary(data.summary);
    renderTreemap(currentTree);

    document.getElementById('view-mode').addEventListener('change', function(e) {
      currentViewMode = e.target.value;
      currentTree = currentViewMode === 'module' ? data.moduleTree : data.regionTree;
      renderTreemap(currentTree);
    });

    document.getElementById('search').addEventListener('input', function(e) {
      searchHighlight(e.target.value);
    });

    window.addEventListener('resize', function() {
      renderTreemap(currentTree);
    });
  }

  function updateSummary(summary) {
    const romFill = document.getElementById('rom-fill');
    const romText = document.getElementById('rom-text');
    const ramFill = document.getElementById('ram-fill');
    const ramText = document.getElementById('ram-text');

    romFill.style.width = Math.min(summary.rom.percent, 100) + '%';
    romText.textContent = formatSize(summary.rom.used) + ' / ' + formatSize(summary.rom.total)
      + ' (' + summary.rom.percent.toFixed(1) + '%)';

    ramFill.style.width = Math.min(summary.ram.percent, 100) + '%';
    ramText.textContent = formatSize(summary.ram.used) + ' / ' + formatSize(summary.ram.total)
      + ' (' + summary.ram.percent.toFixed(1) + '%)';
  }

  function renderTreemap(treeData) {
    const container = document.getElementById('treemap-container');
    container.innerHTML = '';

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    const root = buildHierarchy(treeData);
    if (!root || root.value === 0) return;

    squarify(root, 0, 0, width, height, 0);
    renderNodes(container, root, width, height);
  }

  function buildHierarchy(node) {
    if (node.size != null && !node.children) {
      return { name: node.name, size: node.size, value: node.size, data: node };
    }
    if (!node.children || node.children.length === 0) return null;

    const children = [];
    let totalValue = 0;
    for (const child of node.children) {
      const built = buildHierarchy(child);
      if (built && built.value > 0) {
        children.push(built);
        totalValue += built.value;
      }
    }
    if (children.length === 0) return null;

    children.sort((a, b) => b.value - a.value);
    return { name: node.name, children, value: totalValue, data: node };
  }

  function squarify(node, x, y, w, h, depth) {
    node.x = x; node.y = y; node.w = w; node.h = h; node.depth = depth;

    if (!node.children || node.children.length === 0) return;

    const padding = depth === 0 ? 0 : (depth === 1 ? 20 : 2);
    const innerX = x + (depth > 0 ? 2 : 0);
    const innerY = y + padding;
    const innerW = w - (depth > 0 ? 4 : 0);
    const innerH = h - padding - (depth > 0 ? 2 : 0);

    if (innerW <= 0 || innerH <= 0) return;

    layoutRow(node.children, innerX, innerY, innerW, innerH, node.value, depth);
  }

  function layoutRow(children, x, y, w, h, totalValue, parentDepth) {
    if (totalValue === 0) return;

    let cx = x, cy = y, remainW = w, remainH = h;
    let remainValue = totalValue;

    const items = children.slice();
    while (items.length > 0) {
      const isWide = remainW >= remainH;
      const side = isWide ? remainH : remainW;
      if (side <= 0) break;

      const row = [];
      let rowValue = 0;
      let worst = Infinity;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const testValue = rowValue + item.value;
        const testWorst = worstRatio(row.concat(item), testValue, side);
        if (testWorst > worst && row.length > 0) break;
        row.push(item);
        rowValue = testValue;
        worst = testWorst;
      }

      items.splice(0, row.length);

      const rowFraction = rowValue / remainValue;
      const rowSize = isWide ? remainW * rowFraction : remainH * rowFraction;

      let offset = 0;
      for (const item of row) {
        const fraction = item.value / rowValue;
        const itemSize = (isWide ? remainH : remainW) * fraction;

        if (isWide) {
          squarify(item, cx, cy + offset, rowSize, itemSize, parentDepth + 1);
        } else {
          squarify(item, cx + offset, cy, itemSize, rowSize, parentDepth + 1);
        }
        offset += itemSize;
      }

      if (isWide) {
        cx += rowSize;
        remainW -= rowSize;
      } else {
        cy += rowSize;
        remainH -= rowSize;
      }
      remainValue -= rowValue;
    }
  }

  function worstRatio(row, totalValue, side) {
    if (row.length === 0 || totalValue === 0 || side === 0) return Infinity;
    const rowArea = side * (totalValue / totalValue) * side;
    let worst = 0;
    const areaPerUnit = (side * side) / totalValue;
    for (const item of row) {
      const area = item.value * areaPerUnit;
      const itemSide = area / side;
      const ratio = Math.max(side / itemSide, itemSide / side);
      if (ratio > worst) worst = ratio;
    }
    return worst;
  }

  function renderNodes(container, root, width, height) {
    const leaves = [];
    const groups = [];
    collectNodes(root, leaves, groups);

    // Render group labels (depth 1)
    for (const g of groups) {
      if (g.w < 40 || g.h < 20) continue;
      const label = document.createElement('div');
      label.className = 'treemap-group-label';
      label.style.left = g.x + 'px';
      label.style.top = g.y + 'px';
      label.style.maxWidth = g.w + 'px';
      label.textContent = g.name + ' (' + formatSize(g.value) + ')';
      container.appendChild(label);
    }

    // Render leaf nodes
    for (const leaf of leaves) {
      if (leaf.w < 2 || leaf.h < 2) continue;

      const el = document.createElement('div');
      el.className = 'treemap-node';
      el.style.left = leaf.x + 'px';
      el.style.top = leaf.y + 'px';
      el.style.width = leaf.w + 'px';
      el.style.height = leaf.h + 'px';
      el.style.backgroundColor = COLOR_MAP[leaf.data.category] || '#666';
      el.dataset.name = leaf.data.name || '';
      el.dataset.obj = leaf.data.objectFile || leaf.name || '';

      if (leaf.w > 35 && leaf.h > 14) {
        const lbl = document.createElement('div');
        lbl.className = 'node-label';
        lbl.textContent = leaf.data.name || leaf.name;
        el.appendChild(lbl);
      }
      if (leaf.w > 45 && leaf.h > 26) {
        const sz = document.createElement('div');
        sz.className = 'node-size';
        sz.textContent = formatSize(leaf.value);
        el.appendChild(sz);
      }

      el.addEventListener('mouseenter', function(e) { showTooltip(e, leaf); });
      el.addEventListener('mousemove', moveTooltip);
      el.addEventListener('mouseleave', hideTooltip);

      container.appendChild(el);
    }
  }

  function collectNodes(node, leaves, groups) {
    if (!node.children || node.children.length === 0) {
      leaves.push(node);
      return;
    }
    if (node.depth === 1) {
      groups.push(node);
    }
    for (const child of node.children) {
      collectNodes(child, leaves, groups);
    }
  }

  function showTooltip(event, node) {
    const tooltip = document.getElementById('tooltip');
    const d = node.data || {};
    let html = '<strong>' + (d.name || node.name) + '</strong><br>';
    if (d.objectFile) html += 'Object: ' + d.objectFile + '<br>';
    html += 'Size: ' + formatSize(node.value) + '<br>';
    if (d.category) html += 'Type: ' + d.category + '<br>';
    if (d.address != null) html += 'Address: 0x' + d.address.toString(16).padStart(8, '0');
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    moveTooltip(event);
  }

  function moveTooltip(event) {
    const tooltip = document.getElementById('tooltip');
    tooltip.style.left = (event.clientX + 12) + 'px';
    tooltip.style.top = (event.clientY - 12) + 'px';
  }

  function hideTooltip() {
    document.getElementById('tooltip').style.display = 'none';
  }

  function searchHighlight(keyword) {
    const nodes = document.querySelectorAll('.treemap-node');
    const kw = keyword.toLowerCase();
    nodes.forEach(function(el) {
      if (!kw) {
        el.style.opacity = '1';
        return;
      }
      const name = (el.dataset.name || '').toLowerCase();
      const obj = (el.dataset.obj || '').toLowerCase();
      const match = name.includes(kw) || obj.includes(kw);
      el.style.opacity = match ? '1' : '0.15';
    });
  }

  function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }
})();
